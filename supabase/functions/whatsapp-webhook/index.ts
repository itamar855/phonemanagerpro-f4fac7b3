/* eslint-disable @typescript-eslint/no-explicit-any -- payloads JSON externos (Evolution/Meta/PostgREST) sem tipos */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { adminClient, corsHeaders, json } from "../_shared/http.ts"
import { evolution, loadWhatsAppConfig, type EvolutionConfig } from "../_shared/evolution.ts"
import { refreshAvatars } from "../_shared/contact-avatar.ts"
import { runAgent } from "../_shared/ai-agent.ts"
import { base64ToBytes, transcribeAudio, transcribeMessage } from "../_shared/transcribe.ts"
import { findStaff, handleStaffMessage } from "../_shared/staff-assistant.ts"
import { checkWebhookAuth } from "./auth.ts"
import { extractAdAttribution, extractAdCode, extractTrackCode, hasAdData, mapAckStatus, mediaExt, mediaMime, parseMessageBody, resolveContactJid, resolveTimestamp } from "./parse.ts"

/** Config pela instância do evento; sem ela, o número ativo. */
async function resolveConfig(admin: SupabaseClient, instance: unknown): Promise<EvolutionConfig | null> {
  if (typeof instance === 'string' && instance) {
    const { data } = await admin.from('whatsapp_config').select('*').eq('instance_name', instance).limit(1).maybeSingle()
    if (data) return data as EvolutionConfig
  }
  return loadWhatsAppConfig(admin, null)
}

/** Mídia recebida vai para o bucket privado crm_media (a tela abre por link assinado). */
async function uploadMedia(admin: SupabaseClient, storeId: string, messageId: string | undefined, base64: string, mimeType: string, kind: string) {
  const mime = mediaMime(mimeType, kind)
  const id = (messageId || crypto.randomUUID()).replace(/[^A-Za-z0-9_-]/g, '').slice(-60)
  const path = `${storeId}/whatsapp/${Date.now()}_${id}.${mediaExt(mime)}`
  const { error } = await admin.storage.from('crm_media').upload(path, base64ToBytes(base64), { contentType: mime, upsert: true })
  if (error) {
    console.error('[WhatsApp Webhook] Falha no upload da mídia:', error.message)
    return null
  }
  return { path, mime }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Autenticação obrigatória (fail-closed): sem EVOLUTION_WEBHOOK_SECRET nada é aceito.
  const auth = checkWebhookAuth(req.headers, Deno.env.get('EVOLUTION_WEBHOOK_SECRET'))
  if (!auth.ok) {
    if (auth.status === 500) console.error('[WhatsApp Webhook] EVOLUTION_WEBHOOK_SECRET não configurado — webhook recusando eventos.')
    return json({ error: auth.error }, auth.status)
  }

  try {
    const admin = adminClient()
    const payload = await req.json()
    const eventName = String(payload.event || '').toLowerCase().replace(/_/g, '.')

    if (eventName !== 'messages.upsert' && eventName !== 'messages.update') {
      return json({ status: 'ignored', event: payload.event })
    }

    const cfg = await resolveConfig(admin, payload.instance)
    if (!cfg) throw new Error('Nenhuma configuração de WhatsApp encontrada para associar a mensagem.')
    const storeId = cfg.store_id

    // ---- Status de entrega/leitura ----
    if (eventName === 'messages.update') {
      const items = Array.isArray(payload.data) ? payload.data : [payload.data]
      let updated = 0
      for (const it of items) {
        const externalId = it?.keyId ?? it?.key?.id ?? it?.id
        const status = mapAckStatus(it?.status ?? it?.update?.status)
        if (!externalId || !status) continue
        const { data, error } = await admin.rpc('crm_update_message_status', { p_store_id: storeId, p_external_id: externalId, p_status: status })
        if (error) console.error('[WhatsApp Webhook] status:', error.message)
        else updated += Number(data) || 0
      }
      return json({ status: 'success', updated })
    }

    // ---- Mensagem ----
    const message = payload.data
    const key = message?.key || {}
    const fromMe = Boolean(key.fromMe)

    const jid = resolveContactJid(key)
    if (!jid) return json({ status: 'ignored', reason: 'not_direct_chat' })

    const parsed = parseMessageBody(message, payload)
    if (!parsed) return json({ status: 'ignored', reason: 'unsupported_message' })

    const phone = jid.split('@')[0]
    const pushName = message.pushName || 'Lead WhatsApp'
    const at = resolveTimestamp(message?.messageTimestamp)
    const rt = (globalThis as any).EdgeRuntime
    const background = (p: Promise<unknown>) => (rt?.waitUntil ? rt.waitUntil(p) : p)

    // Equipe da loja escrevendo no privado → assistente interno (relatório / venda no PDV), fora do CRM
    if (!fromMe) {
      const staff = await findStaff(admin, phone, storeId)
      if (staff) {
        const work = (async () => {
          let text = ['text', 'image'].includes(parsed.kind) && parsed.content !== '[Imagem]' ? parsed.content : ''
          if (parsed.kind === 'audio') {
            let b64 = parsed.base64
            if (!b64 && key.id) b64 = await evolution(cfg).mediaBase64(key.id).catch(() => undefined)
            if (b64) text = (await transcribeAudio(base64ToBytes(b64), parsed.mimeType || 'audio/ogg').catch(() => ({ text: '' }))).text
          }
          const r = await handleStaffMessage(admin, cfg, staff, { text, messageId: key.id ?? null, jid, hasImage: parsed.kind === 'image' })
          console.log('[WhatsApp Webhook] equipe:', r)
        })().catch((e) => console.error('[WhatsApp Webhook] equipe:', (e as Error).message))
        if (rt?.waitUntil) background(work); else await work
        return json({ status: 'staff' })
      }
    }

    // Mídia (imagem/áudio)
    let media: { path: string; mime: string } | null = null
    let audioBase64: string | undefined
    if (parsed.kind === 'image' || parsed.kind === 'audio') {
      let base64 = parsed.base64
      if (!base64 && key.id) {
        try { base64 = await evolution(cfg).mediaBase64(key.id) } catch (e) { console.error('[WhatsApp Webhook] mídia:', (e as Error).message) }
      }
      if (parsed.kind === 'audio') audioBase64 = base64
      if (base64) {
        try {
          media = await uploadMedia(admin, storeId, key.id, base64, parsed.mimeType || '', parsed.kind)
        } catch (e) { console.error('[WhatsApp Webhook] upload:', e) }
      }
    }

    // 1. CRM novo: contato + conversa + mensagem numa transação (idempotente pelo id do WhatsApp)
    const { data: crm, error: crmError } = await admin.rpc('crm_ingest_message', {
      p_store_id: storeId,
      p_channel: 'whatsapp',
      p_direction: fromMe ? 'out' : 'in',
      p_sender_kind: fromMe ? 'user' : 'contact',
      p_kind: parsed.kind,
      p_body: parsed.content,
      p_phone: phone,
      p_name: fromMe ? null : pushName,
      p_external_thread_id: jid,
      p_media_path: media?.path ?? null,
      p_media_mime: media?.mime ?? parsed.mimeType ?? null,
      p_external_id: key.id ?? null,
      p_created_at: at,
    })
    if (crmError) console.error('[WhatsApp Webhook] CRM ingest:', crmError.message)

    // Segundo plano (sem atrasar a resposta à Evolution): transcrição do áudio, foto e agente de IA
    let transcription: Promise<unknown> = Promise.resolve()
    if (audioBase64 && crm?.message_id && !crm.duplicate && !crm.ignored) {
      transcription = transcribeMessage(admin, crm.message_id, base64ToBytes(audioBase64), parsed.mimeType || 'audio/ogg')
      background(transcription)
    }
    // Rastreamento: código do link / dados do anúncio → origem do contato; 1º contato → evento Lead para a Meta
    if (!fromMe && crm?.contact_id && !crm.ignored && !crm.duplicate) {
      // código do link de rastreio (cód. K7Q2M) ou do anúncio (#T21 / Ref. T21)
      const code = extractTrackCode(parsed.content) ?? extractAdCode(parsed.content)
      const native = extractAdAttribution(message)
      if (code || crm.contact_created || hasAdData(native)) {
        background((async () => {
          const { error: attErr } = await admin.rpc('crm_track_attach', {
            p_contact_id: crm.contact_id, p_code: code, p_native: native, p_is_new: Boolean(crm.contact_created),
          })
          if (attErr) console.error('[WhatsApp Webhook] origem:', attErr.message)
          if (crm.contact_created) {
            const { data: ev } = await admin.rpc('crm_meta_enqueue', { p_contact_id: crm.contact_id, p_deal_id: null, p_kind: 'lead' })
            const secret = Deno.env.get('CRM_CRON_SECRET')
            if (ev && secret) {
              await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/crm-meta`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'x-crm-internal': secret }, body: JSON.stringify({ action: 'flush' }),
              }).catch(() => { /* o cron envia no próximo minuto */ })
            }
          }
        })().catch((e) => console.error('[WhatsApp Webhook] rastreamento:', (e as Error).message)))
      }
    }

    if (!fromMe && crm?.contact_id && !crm.ignored && !crm.duplicate) {
      const photo = (async () => {
        const { data: c } = await admin.from('crm_contacts').select('id, phone, avatar_url, avatar_checked_at').eq('id', crm.contact_id).maybeSingle()
        if (c) await refreshAvatars(admin, cfg, [c])
      })().catch((e) => console.error('[WhatsApp Webhook] foto:', (e as Error).message))
      // espera a transcrição (a IA "ouve" o áudio pelo texto) e mais 8 s para juntar mensagens picadas
      const agent = transcription
        .then(() => runAgent(admin, { conversationId: crm.conversation_id, triggerMessageId: crm.message_id, debounceMs: 8000 }))
        .then((r) => { if (r.status !== 'skipped') console.log('[WhatsApp Webhook] IA:', r.status, r.status === 'done' ? r.decision.decision : '') })
      if (rt?.waitUntil) { background(photo); background(agent) } else await Promise.all([photo, agent, transcription])
    }

    if (crmError) return json({ error: crmError.message }, 500)
    // Mensagem que o próprio CRM enviou (crm-send já gravou)
    if (crm?.duplicate) return json({ status: 'duplicate' })
    return json({ status: 'success', crm })
  } catch (error) {
    console.error('[WhatsApp Webhook] Erro:', error)
    return json({ error: (error as Error)?.message || 'Erro interno' }, 500)
  }
})
