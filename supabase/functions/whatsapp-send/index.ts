/* eslint-disable @typescript-eslint/no-explicit-any -- payloads JSON externos (Evolution/Meta/PostgREST) sem tipos */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

function getServiceRoleKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const key = parsed?.["default"];
      if (typeof key === "string" && key.startsWith("sb_secret_")) {
        return key;
      }
    } catch { /* formato antigo da variável */ }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase privileged credential unavailable.");
}

function resolveTimestamp(raw: unknown): string {
  if (raw === null || raw === undefined) return new Date().toISOString()
  const n = typeof raw === 'object' && raw !== null && 'low' in (raw as any) ? Number((raw as any).low) : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString()
  return new Date(n < 100000000000 ? n * 1000 : n).toISOString()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    // 1. Quem está chamando (o userId do corpo é ignorado: vale o do token)
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!jwt) throw new HttpError(401, 'Não autenticado.')
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(jwt)
    const user = authData?.user
    if (authError || !user) throw new HttpError(401, 'Sessão inválida.')

    const body = await req.json()
    const { action, phone, content, messageType = 'text', mediaUrl, leadId } = body

    // 2. Loja alvo: a do lead (quando houver) ou a informada
    let lead: any = null
    if (leadId) {
      const { data } = await supabaseClient.from('leads').select('id, store_id, phone').eq('id', leadId).maybeSingle()
      if (!data) throw new HttpError(404, 'Lead não encontrado.')
      lead = data
    }
    const bodyStoreId: string | null = body.storeId && body.storeId !== 'all' ? body.storeId : null
    let targetStoreId: string | null = lead?.store_id || bodyStoreId
    if (!targetStoreId && action === 'configure-webhook') {
      // Visão "todas as lojas": usa a loja dona do número ativo
      const { data } = await supabaseClient.from('whatsapp_config').select('store_id')
        .eq('is_active', true).limit(1).maybeSingle()
      targetStoreId = data?.store_id ?? null
    }
    if (!targetStoreId) throw new HttpError(400, 'Loja não informada.')

    const { data: membership } = await supabaseClient
      .from('member_stores').select('id')
      .eq('user_id', user.id).eq('store_id', targetStoreId)
      .limit(1)
    if (!membership || membership.length === 0) throw new HttpError(403, 'Você não tem acesso a esta loja.')

    // 3. Configuração do WhatsApp: a da loja; senão o número ativo (comportamento atual, 1 número para as lojas)
    let config: any = null
    {
      const { data } = await supabaseClient.from('whatsapp_config').select('*')
        .eq('is_active', true).eq('store_id', targetStoreId).limit(1).maybeSingle()
      config = data
    }
    if (!config) {
      const { data } = await supabaseClient.from('whatsapp_config').select('*')
        .eq('is_active', true).limit(1).maybeSingle()
      config = data
    }
    if (!config) throw new HttpError(400, 'WhatsApp API não configurada ou inativa.')

    const apiUrl = String(config.api_url).replace(/\/+$/, '') + '/'
    const apiKey = config.api_key
    const instance = encodeURIComponent(config.instance_name)

    // --- ACTION: CONFIGURAR WEBHOOK (admin/gerente) ---
    // O segredo do webhook fica só no servidor; o navegador nunca o vê.
    if (action === 'configure-webhook') {
      const { data: roleRow } = await supabaseClient.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
      if (!roleRow || !['admin', 'gerente'].includes(String(roleRow.role))) {
        throw new HttpError(403, 'Apenas admin ou gerente pode configurar o webhook.')
      }
      const secret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET')
      if (!secret) throw new HttpError(500, 'EVOLUTION_WEBHOOK_SECRET não configurado no servidor.')

      const webhook = {
        enabled: true,
        url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-webhook`,
        byEvents: false,
        base64: true,
        headers: { 'x-evolution-webhook-secret': secret },
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
      }
      const endpoint = `${apiUrl}webhook/set/${instance}`
      const headers = { 'Content-Type': 'application/json', apikey: apiKey }
      let res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ webhook }) })
      if (!res.ok) {
        // Algumas versões da Evolution aceitam o formato plano
        res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(webhook) })
      }
      if (!res.ok) {
        const txt = await res.text()
        throw new HttpError(502, `Evolution retornou ${res.status}: ${txt.slice(0, 160)}`)
      }
      return json({ status: 'success', url: webhook.url })
    }

    const rawPhone: string = phone || lead?.phone || ''
    const number = rawPhone.includes('@') ? rawPhone : `${rawPhone.replace(/\D/g, '')}@s.whatsapp.net`
    if (!rawPhone) throw new HttpError(400, 'Telefone não informado.')

    // --- ACTION: SYNC HISTORY ---
    if (action === 'sync-history') {
      if (!lead) throw new HttpError(400, 'leadId é obrigatório para sincronizar.')
      let evolutionMsgs: any[] = []
      try {
        const findRes = await fetch(`${apiUrl}chat/findMessages/${instance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: apiKey },
          body: JSON.stringify({ where: { key: { remoteJid: number } }, limit: 50 }),
        })
        if (findRes.ok) {
          const d = await findRes.json()
          evolutionMsgs = Array.isArray(d) ? d : d?.messages?.records || d?.records || d?.messages || []
        } else {
          const altRes = await fetch(`${apiUrl}chat/findMessages/${instance}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: apiKey },
            body: JSON.stringify({ where: { remoteJid: number }, page: 1, offset: 50 }),
          })
          if (altRes.ok) {
            const d = await altRes.json()
            evolutionMsgs = Array.isArray(d) ? d : d?.messages?.records || d?.records || d?.messages || []
          }
        }
      } catch (err) {
        console.error('Error fetching messages from Evolution:', err)
      }

      let syncedCount = 0
      for (const m of evolutionMsgs) {
        try {
          const mKey = m.key || {}
          const isFromMe = Boolean(mKey.fromMe)
          const mBody = m.message || {}
          let mContent = ''
          let mType = 'text'
          let mMediaUrl: string | null = null

          if (mBody.conversation || mBody.extendedTextMessage?.text) {
            mContent = mBody.conversation || mBody.extendedTextMessage.text
          } else if (mBody.imageMessage) {
            mType = 'image'
            mContent = mBody.imageMessage.caption || '[Imagem]'
          } else if (mBody.audioMessage) {
            mType = 'audio'
            mContent = '[Áudio]'
          } else {
            continue
          }

          const tsIso = resolveTimestamp(m.messageTimestamp)

          if (mType === 'image') {
            let base64 = m.base64 || mBody.imageMessage?.base64
            if (!base64 && mKey.id) {
              try {
                const mediaResp = await fetch(`${apiUrl}chat/getBase64FromMediaMessage/${instance}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', apikey: apiKey },
                  body: JSON.stringify({ message: { key: { id: mKey.id } }, convertToMp4: false }),
                })
                if (mediaResp.ok) {
                  const mediaData = await mediaResp.json()
                  base64 = mediaData?.base64 || mediaData?.data
                }
              } catch (_) { /* mídia opcional: segue sem ela */ }
            }
            if (base64) {
              try {
                const mimeType = mBody.imageMessage?.mimetype || 'image/jpeg'
                const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
                const fileName = `whatsapp/${lead.id}/${Date.now()}_${mKey.id || crypto.randomUUID()}.${ext}`
                const cleanBase64 = base64.replace(/^data:.*?;base64,/, '')
                const binaryStr = atob(cleanBase64)
                const bytes = new Uint8Array(binaryStr.length)
                for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
                const { data: upData, error: upErr } = await supabaseClient.storage
                  .from('chat_media')
                  .upload(fileName, bytes, { contentType: mimeType, upsert: true })
                if (!upErr && upData?.path) {
                  mMediaUrl = supabaseClient.storage.from('chat_media').getPublicUrl(upData.path).data.publicUrl
                }
              } catch (_) { /* mídia opcional: segue sem ela */ }
            }
          }

          // Mesma mensagem = mesmo lead + mesmo horário + mesmo conteúdo
          const { data: existing } = await supabaseClient
            .from('lead_messages')
            .select('id, media_url')
            .eq('lead_id', lead.id)
            .eq('created_at', tsIso)
            .eq('content', mContent)
            .limit(1)
            .maybeSingle()

          if (!existing) {
            const { error: insErr } = await supabaseClient.from('lead_messages').insert({
              lead_id: lead.id,
              store_id: lead.store_id,
              content: mContent,
              sender: isFromMe ? 'vendedor' : 'lead',
              message_type: mType,
              media_url: mMediaUrl,
              created_at: tsIso,
            })
            if (insErr) { console.error('Error inserting synced message:', insErr.message); continue }
            syncedCount++
          } else if (mMediaUrl && !existing.media_url) {
            await supabaseClient.from('lead_messages').update({ media_url: mMediaUrl }).eq('id', existing.id)
            syncedCount++
          }
        } catch (itemErr) {
          console.error('Error syncing individual message:', itemErr)
        }
      }

      return json({ status: 'success', syncedCount })
    }

    // --- ENVIO ---
    if (!lead) throw new HttpError(400, 'leadId é obrigatório para enviar.')

    let response: Response
    if (messageType === 'text') {
      response = await fetch(`${apiUrl}message/sendText/${instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ number, text: content, delay: 1000 }),
      })
    } else {
      response = await fetch(`${apiUrl}message/sendMedia/${instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ number, mediatype: messageType, mediaType: messageType, media: mediaUrl, caption: content, delay: 1000 }),
      })
    }

    const apiResult = await response.json().catch(() => ({}))
    if (!response.ok) throw new HttpError(502, `Erro API: ${JSON.stringify(apiResult).slice(0, 300)}`)

    const nowIso = new Date().toISOString()
    const { error: msgInsertError } = await supabaseClient
      .from('lead_messages')
      .insert({
        lead_id: lead.id,
        store_id: lead.store_id,
        content,
        sender: 'vendedor',
        sender_user_id: user.id,
        message_type: messageType,
        media_url: mediaUrl ?? null,
        created_at: nowIso,
      })
    if (msgInsertError) console.error('Error saving sent message:', msgInsertError.message)

    await supabaseClient
      .from('leads')
      .update({ last_message_at: nowIso, has_unread: false, unread_count: 0 })
      .eq('id', lead.id)

    return json({ status: 'success', saved: !msgInsertError, apiResult })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    console.error('Send error:', error)
    return json({ error: (error as Error)?.message || 'Erro interno' }, status)
  }
})
