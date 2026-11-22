/* eslint-disable @typescript-eslint/no-explicit-any -- payloads JSON externos (Evolution/Meta/PostgREST) sem tipos */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { adminClient, corsHeaders, json } from "../_shared/http.ts"
import { evolution, loadWhatsAppConfig, type EvolutionConfig } from "../_shared/evolution.ts"
import { refreshAvatars } from "../_shared/contact-avatar.ts"
import { runAgent } from "../_shared/ai-agent.ts"
import { tagConversation } from "../_shared/ai-tagger.ts"
import { notifyInbound } from "../_shared/push.ts"
import { base64ToBytes, transcribeAudio, transcribeMessage } from "../_shared/transcribe.ts"
import { findStaff, handleStaffMessage } from "../_shared/staff-assistant.ts"
import { checkReplay, checkWebhookAuth } from "./auth.ts"
import {
  contactLid, extractAdAttribution, extractAdCode, extractTrackCode, hasAdData, isUsableName, mapAckStatus, matchContactByName, mediaExt, mediaMime,
  namesFromEvolutionContacts, parseMessageBody, phoneFromEvolutionContacts, phoneJidFrom, resolveContactJid, resolveTimestamp, stripBase64, withResolvedPhone,
} from "./parse.ts"

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

type Result = { body: Record<string, unknown>; status?: number }

const rt = (globalThis as any).EdgeRuntime
const background = (p: Promise<unknown>) => (rt?.waitUntil ? rt.waitUntil(p) : p)

// ------------------------------------------------------------------ contatos ocultos (@lid)

/** Guarda o par lid → número; se havia mensagens esperando por ele, reprocessa em segundo plano. */
async function rememberLid(admin: SupabaseClient, cfg: EvolutionConfig, lid: string, phoneJid: string, source: 'message' | 'evolution' | 'name') {
  const { data: pending, error } = await admin.rpc('crm_lid_remember', {
    p_store_id: cfg.store_id, p_lid: lid, p_phone: phoneJid.split('@')[0], p_source: source,
  })
  if (error) { console.error('[WhatsApp Webhook] lid:', error.message); return }
  if (Number(pending) > 0) {
    const work = replayPending(admin, cfg, lid, phoneJid).catch((e) => console.error('[WhatsApp Webhook] fila lid:', (e as Error).message))
    if (rt?.waitUntil) background(work); else await work
  }
}

/** Número de um contato @lid sem remoteJidAlt: par salvo → Evolution → nome igual no CRM (um só). */
async function lookupLid(admin: SupabaseClient, cfg: EvolutionConfig, lid: string, pushName: unknown): Promise<string | null> {
  const { data: known } = await admin.from('crm_lid_map').select('phone').eq('store_id', cfg.store_id).eq('lid', lid).maybeSingle()
  const saved = phoneJidFrom(known?.phone)
  if (saved) return saved

  const names: string[] = []
  const own = typeof pushName === 'string' ? pushName.trim() : ''
  if (isUsableName(own)) names.push(own)
  try {
    const records = await evolution(cfg).findContacts({ remoteJid: lid })
    const fromEvolution = phoneFromEvolutionContacts(records, lid)
    if (fromEvolution) {
      await rememberLid(admin, cfg, lid, fromEvolution, 'evolution')
      return fromEvolution
    }
    // Nome do contato na Evolution: vale também para conversa que a loja começou e para a
    // mensagem que chega com o próprio lid no lugar do nome.
    for (const n of namesFromEvolutionContacts(records, lid)) if (!names.includes(n)) names.push(n)
  } catch (e) { console.error('[WhatsApp Webhook] findContacts:', (e as Error).message) }

  for (const name of names) {
    const pattern = name.replace(/[\\%_]/g, (c) => `\\${c}`)
    const { data: contacts } = await admin.from('crm_contacts')
      .select('name, phone').eq('store_id', cfg.store_id).not('phone', 'is', null).ilike('name', pattern).limit(5)
    const byName = matchContactByName(contacts ?? [], name)
    if (byName) {
      await rememberLid(admin, cfg, lid, byName, 'name')
      return byName
    }
  }
  return null
}

/** Mensagem sem número fica na fila de espera (sem o base64 e sem a chave que a Evolution manda no evento). */
async function holdPending(admin: SupabaseClient, cfg: EvolutionConfig, lid: string, payload: any) {
  const message = payload?.data
  const { error } = await admin.from('crm_lid_pending').insert({
    store_id: cfg.store_id,
    lid,
    external_id: message?.key?.id ?? null,
    from_me: Boolean(message?.key?.fromMe),
    push_name: message?.pushName ?? null,
    payload: stripBase64({ event: payload?.event, instance: payload?.instance, data: message }),
  })
  if (error && error.code !== '23505') throw new Error(`fila lid: ${error.message}`)
}

/** Reprocessa, na ordem em que chegaram, as mensagens desse lid que esperavam o número. */
async function replayPending(admin: SupabaseClient, cfg: EvolutionConfig, lid: string, phoneJid: string) {
  const { data: rows, error } = await admin.from('crm_lid_pending')
    .update({ resolved_at: new Date().toISOString(), resolved_phone: phoneJid.split('@')[0] })
    .eq('store_id', cfg.store_id).eq('lid', lid).is('resolved_at', null)
    .select('id, payload, attempts, received_at')
  if (error) throw new Error(error.message)
  const list = [...(rows ?? [])].sort((a: any, b: any) => String(a.received_at).localeCompare(String(b.received_at)))
  let ok = 0
  for (const row of list as any[]) {
    let failure: string | null = null
    try {
      const r = await handleUpsert(admin, cfg, withResolvedPhone(row.payload, phoneJid), { replay: true, fromQueue: true })
      if ((r.status ?? 200) >= 400) failure = String(r.body?.error ?? r.status)
    } catch (e) { failure = (e as Error).message }
    if (failure) {
      await admin.from('crm_lid_pending')
        .update({ resolved_at: null, resolved_phone: null, attempts: (row.attempts ?? 0) + 1, last_error: failure.slice(0, 300) })
        .eq('id', row.id)
    } else ok++
  }
  console.log(`[WhatsApp Webhook] fila lid: ${ok}/${list.length} mensagens recuperadas`)
}

// ------------------------------------------------------------------ mensagem

/**
 * Trata um messages.upsert. replay = mensagem antiga (fila do @lid ou sincronização):
 * não aciona o assistente da equipe nem o agente de IA. fromQueue = veio da própria fila do @lid.
 */
async function handleUpsert(admin: SupabaseClient, cfg: EvolutionConfig, payload: any, opts: { replay?: boolean; fromQueue?: boolean } = {}): Promise<Result> {
  const storeId = cfg.store_id
  const message = payload.data
  const key = message?.key || {}
  const fromMe = Boolean(key.fromMe)

  let jid = resolveContactJid(key)
  const lid = contactLid(key)
  // Guarda o par lid → número também na sincronização (replay): é dela que vêm os números das
  // conversas que a loja começou. Só a própria fila não regrava (o número veio do par salvo).
  if (lid && jid && !opts.fromQueue) {
    await rememberLid(admin, cfg, lid, jid, 'message')
  } else if (lid && !jid) {
    jid = await lookupLid(admin, cfg, lid, fromMe ? null : message?.pushName)
    if (!jid) {
      await holdPending(admin, cfg, lid, payload)
      console.warn('[WhatsApp Webhook] contato oculto sem número — mensagem guardada na fila de espera')
      return { body: { status: 'pending', reason: 'lid_unresolved' } }
    }
  }
  if (!jid) return { body: { status: 'ignored', reason: 'not_direct_chat' } }

  const parsed = parseMessageBody(message, payload)
  if (!parsed) return { body: { status: 'ignored', reason: 'unsupported_message' } }

  const phone = jid.split('@')[0]
  const pushName = message.pushName || 'Lead WhatsApp'
  const at = resolveTimestamp(message?.messageTimestamp)

  // Equipe da loja escrevendo no privado → assistente interno (relatório / venda no PDV), fora do CRM
  if (!fromMe) {
    const staff = await findStaff(admin, phone, storeId)
    if (staff && opts.replay) return { body: { status: 'staff', replay: true } }
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
      return { body: { status: 'staff' } }
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
        const { data: att, error: attErr } = await admin.rpc('crm_track_attach', {
          p_contact_id: crm.contact_id, p_code: code, p_native: native, p_is_new: Boolean(crm.contact_created),
        })
        if (attErr) console.error('[WhatsApp Webhook] origem:', attErr.message)
        // contato novo → Lead; quem já era contato e veio de um anúncio de novo → outro Lead, ligado a esse clique
        const adAgain = !crm.contact_created && att?.attached && att.kind === 'ctwa' ? att.attribution_id : null
        if (crm.contact_created || adAgain) {
          const { data: ev } = await admin.rpc('crm_meta_enqueue', {
            p_contact_id: crm.contact_id, p_deal_id: null, p_kind: 'lead', ...(adAgain ? { p_attribution_id: adAgain } : {}),
          })
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
    // espera a transcrição (a IA "ouve" o áudio pelo texto) e mais 8 s para juntar mensagens picadas.
    // Mensagem antiga da fila do @lid não aciona a IA (a resposta seria fora de hora).
    const agent = opts.replay ? transcription : transcription
      .then(() => runAgent(admin, { conversationId: crm.conversation_id, triggerMessageId: crm.message_id, debounceMs: 8000 }))
      .then((r) => { if (r.status !== 'skipped') console.log('[WhatsApp Webhook] IA:', r.status, r.status === 'done' ? r.decision.decision : '') })
    // IA que etiqueta o lead (tipo + etiquetas prontas): roda mesmo com o atendimento por IA desligado
    const tagging = opts.replay ? Promise.resolve() : transcription
      .then(() => tagConversation(admin, { conversationId: crm.conversation_id, triggerMessageId: crm.message_id, debounceMs: 8000 }))
      .then((r) => { if (r.status === 'error') console.error('[WhatsApp Webhook] etiquetas:', r.error) })
    // aviso no celular de quem atende (mensagem antiga da fila do @lid não avisa)
    const push = opts.replay ? Promise.resolve() : notifyInbound(admin, crm.conversation_id)
    if (rt?.waitUntil) { background(photo); background(agent); background(tagging); background(push) } else await Promise.all([photo, agent, transcription, tagging, push])
  }

  if (crmError) return { body: { error: crmError.message }, status: 500 }
  // Mensagem que o próprio CRM enviou (crm-send já gravou)
  if (crm?.duplicate) return { body: { status: 'duplicate' } }
  return { body: { status: 'success', crm } }
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
    // reenvio interno (sincronizar mensagens que não chegaram): só com o segredo do cron
    const replay = checkReplay(req.headers, payload, Deno.env.get('CRM_CRON_SECRET'))
    if (!replay.ok) return json({ error: replay.error }, replay.status)

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
    const r = await handleUpsert(admin, cfg, payload, { replay: replay.replay })
    return json(r.body, r.status ?? 200)
  } catch (error) {
    console.error('[WhatsApp Webhook] Erro:', error)
    return json({ error: (error as Error)?.message || 'Erro interno' }, 500)
  }
})
