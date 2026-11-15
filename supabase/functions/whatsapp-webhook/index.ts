/* eslint-disable @typescript-eslint/no-explicit-any -- payloads JSON externos (Evolution/Meta/PostgREST) sem tipos */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { adminClient, corsHeaders, json } from "../_shared/http.ts"
import { evolution, loadWhatsAppConfig, type EvolutionConfig } from "../_shared/evolution.ts"
import { refreshAvatars } from "../_shared/contact-avatar.ts"
import { runAgent } from "../_shared/ai-agent.ts"
import { base64ToBytes, transcribeMessage } from "../_shared/transcribe.ts"
import { checkWebhookAuth } from "./auth.ts"
import { extractAdAttribution, extractTrackCode, hasAdData, mapAckStatus, parseMessageBody, resolveContactJid, resolveTimestamp } from "./parse.ts"

/** Config pela instância do evento; sem ela, o número ativo. */
async function resolveConfig(admin: SupabaseClient, instance: unknown): Promise<EvolutionConfig | null> {
  if (typeof instance === 'string' && instance) {
    const { data } = await admin.from('whatsapp_config').select('*').eq('instance_name', instance).limit(1).maybeSingle()
    if (data) return data as EvolutionConfig
  }
  return loadWhatsAppConfig(admin, null)
}

// ---------------------------------------------------------------------------
// Tabelas antigas (leads/lead_messages): mantidas até a Fase 2 substituir a tela /leads.
// ---------------------------------------------------------------------------
async function writeLegacy(admin: SupabaseClient, args: {
  storeId: string; phone: string; pushName: string; fromMe: boolean; at: string;
  content: string; kind: string; mediaUrl: string | null;
}): Promise<{ leadId: string | null; storeId: string }> {
  const { storeId, phone, fromMe, at } = args
  let lead: any = null
  {
    const { data } = await admin.from('leads').select('*').eq('phone', phone).eq('store_id', storeId)
      .order('created_at', { ascending: true }).limit(1)
    lead = data?.[0] ?? null
  }
  if (!lead) {
    const { data } = await admin.from('leads').select('*').eq('phone', phone)
      .order('created_at', { ascending: true }).limit(1)
    lead = data?.[0] ?? null
  }
  if (!lead) {
    if (fromMe) return { leadId: null, storeId }
    const { data, error } = await admin.from('leads').insert({
      name: args.pushName, phone, source: 'whatsapp', status: 'novo', store_id: storeId,
      has_unread: true, last_message_at: at,
    }).select().single()
    if (error) throw error
    lead = data
  }

  const { data: dup } = await admin.from('lead_messages').select('id')
    .eq('lead_id', lead.id).eq('created_at', at).eq('content', args.content).limit(1)
  if (dup && dup.length > 0) return { leadId: lead.id, storeId: lead.store_id || storeId }

  // Eco do que a tela antiga enviou (whatsapp-send já gravou em lead_messages)
  if (fromMe) {
    const since = new Date(new Date(at).getTime() - 3 * 60 * 1000).toISOString()
    const { data: echo } = await admin.from('lead_messages').select('id')
      .eq('lead_id', lead.id).eq('sender', 'vendedor').eq('content', args.content).gte('created_at', since).limit(1)
    if (echo && echo.length > 0) return { leadId: lead.id, storeId: lead.store_id || storeId }
  }

  const { error: msgErr } = await admin.from('lead_messages').insert({
    lead_id: lead.id, store_id: lead.store_id || storeId, content: args.content,
    sender: fromMe ? 'vendedor' : 'lead', sender_user_id: null,
    message_type: args.kind === 'image' || args.kind === 'audio' ? args.kind : 'text',
    media_url: args.mediaUrl, created_at: at,
  })
  if (msgErr) throw msgErr

  await admin.from('leads').update(fromMe
    ? { last_message_at: at, has_unread: false, unread_count: 0 }
    : { last_message_at: at, has_unread: true, unread_count: (Number(lead.unread_count) || 0) + 1 }
  ).eq('id', lead.id)
  return { leadId: lead.id, storeId: lead.store_id || storeId }
}

async function uploadMedia(admin: SupabaseClient, folder: string, messageId: string | undefined, base64: string, mimeType: string, kind: string) {
  const ext = kind === 'audio' ? 'ogg' : mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
  const fileName = `whatsapp/${folder}/${Date.now()}_${messageId || crypto.randomUUID()}.${ext}`
  const clean = base64.replace(/^data:.*?;base64,/, '')
  const bin = atob(clean)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const { data, error } = await admin.storage.from('chat_media').upload(fileName, bytes, { contentType: mimeType, upsert: true })
  if (error || !data?.path) {
    console.error('[WhatsApp Webhook] Falha no upload da mídia:', error?.message)
    return null
  }
  return admin.storage.from('chat_media').getPublicUrl(data.path).data.publicUrl
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

    // Mídia (imagem/áudio)
    let mediaUrl: string | null = null
    let audioBase64: string | undefined
    if (parsed.kind === 'image' || parsed.kind === 'audio') {
      let base64 = parsed.base64
      if (!base64 && key.id) {
        try { base64 = await evolution(cfg).mediaBase64(key.id) } catch (e) { console.error('[WhatsApp Webhook] mídia:', (e as Error).message) }
      }
      if (parsed.kind === 'audio') audioBase64 = base64
      if (base64) {
        try {
          mediaUrl = await uploadMedia(admin, phone, key.id, base64, parsed.mimeType || (parsed.kind === 'image' ? 'image/jpeg' : 'audio/ogg'), parsed.kind)
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
      p_media_url: mediaUrl,
      p_media_mime: parsed.mimeType ?? null,
      p_external_id: key.id ?? null,
      p_created_at: at,
    })
    if (crmError) console.error('[WhatsApp Webhook] CRM ingest:', crmError.message)

    // Segundo plano (sem atrasar a resposta à Evolution): transcrição do áudio, foto e agente de IA
    const rt = (globalThis as any).EdgeRuntime
    const background = (p: Promise<unknown>) => (rt?.waitUntil ? rt.waitUntil(p) : p)
    let transcription: Promise<unknown> = Promise.resolve()
    if (audioBase64 && crm?.message_id && !crm.duplicate && !crm.ignored) {
      transcription = transcribeMessage(admin, crm.message_id, base64ToBytes(audioBase64), parsed.mimeType || 'audio/ogg')
      background(transcription)
    }
    // Rastreamento: código do link / dados do anúncio → origem do contato; 1º contato → evento Lead para a Meta
    if (!fromMe && crm?.contact_id && !crm.ignored && !crm.duplicate) {
      const code = extractTrackCode(parsed.content)
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

    // Mensagem que o próprio CRM enviou (crm-send já gravou): não repete nas tabelas antigas
    if (crm?.duplicate) return json({ status: 'duplicate' })

    // 2. Tabelas antigas (tela /leads atual)
    try {
      await writeLegacy(admin, { storeId, phone, pushName, fromMe, at, content: parsed.content, kind: parsed.kind, mediaUrl })
    } catch (legacyErr) {
      console.error('[WhatsApp Webhook] legado:', (legacyErr as Error)?.message)
      if (crmError) throw legacyErr // nada foi salvo em lugar nenhum
    }

    if (crmError) return json({ status: 'partial', error: crmError.message }, 500)
    return json({ status: 'success', crm })
  } catch (error) {
    console.error('[WhatsApp Webhook] Erro:', error)
    return json({ error: (error as Error)?.message || 'Erro interno' }, 500)
  }
})
