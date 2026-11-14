
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { checkWebhookAuth } from "./auth.ts"
import { isDirectChat, parseMessageBody, resolveTimestamp } from "./parse.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-evolution-webhook-secret',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

function getServiceRoleKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const key = parsed?.["default"];
      if (typeof key === "string" && key.startsWith("sb_secret_")) {
        return key;
      }
    } catch {}
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase privileged credential unavailable.");
}

async function fetchMediaBase64(cfg: any, messageId: string | undefined): Promise<string | undefined> {
  if (!cfg?.api_url || !cfg?.api_key || !cfg?.instance_name || !messageId) return undefined
  try {
    const resp = await fetch(
      `${String(cfg.api_url).replace(/\/+$/, '')}/chat/getBase64FromMediaMessage/${encodeURIComponent(cfg.instance_name)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.api_key },
        body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
      }
    )
    if (!resp.ok) return undefined
    const data = await resp.json()
    return data?.base64 || data?.data || undefined
  } catch (err) {
    console.error('[WhatsApp Webhook] Erro ao buscar mídia na Evolution:', err)
    return undefined
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Autenticação obrigatória (fail-closed): sem EVOLUTION_WEBHOOK_SECRET nada é aceito.
  const auth = checkWebhookAuth(req.headers, Deno.env.get("EVOLUTION_WEBHOOK_SECRET"))
  if (!auth.ok) {
    if (auth.status === 500) console.error('[WhatsApp Webhook] EVOLUTION_WEBHOOK_SECRET não configurado — webhook recusando eventos.')
    return json({ error: auth.error }, auth.status)
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    const payload = await req.json()

    // 1. Só eventos de mensagem
    const eventName = String(payload.event || '').toLowerCase().replace(/_/g, '.')
    if (eventName !== 'messages.upsert') {
      return json({ status: 'ignored', event: payload.event })
    }

    const message = payload.data
    const key = message?.key || {}
    const fromMe = Boolean(key.fromMe)
    const remoteJid: string = key.remoteJid || ''

    // 2. Só conversas privadas (sem grupos, transmissões, canais, status)
    if (!isDirectChat(key)) {
      return json({ status: 'ignored', reason: 'not_direct_chat' })
    }

    // 3. Conteúdo: eventos sem conteúdo de conversa (reação, protocolo...) não criam lead
    const parsed = parseMessageBody(message, payload)
    if (!parsed) {
      return json({ status: 'ignored', reason: 'unsupported_message' })
    }

    const phone = remoteJid.split('@')[0]
    const pushName = message.pushName || 'Lead WhatsApp'
    const messageCreatedAt = resolveTimestamp(message?.messageTimestamp)

    // 4. Loja e configuração pela instância
    let storeId: string | null = null
    let activeConfig: any = null
    if (payload.instance) {
      const { data: cfg } = await supabaseClient
        .from('whatsapp_config')
        .select('*')
        .eq('instance_name', payload.instance)
        .limit(1)
        .maybeSingle()
      if (cfg) { storeId = cfg.store_id; activeConfig = cfg }
    }
    if (!storeId) {
      const { data: cfg } = await supabaseClient
        .from('whatsapp_config')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      if (cfg) { storeId = cfg.store_id; activeConfig = cfg }
    }
    if (!storeId) throw new Error('Nenhuma configuração de WhatsApp encontrada para associar a mensagem.')

    // 5. Lead: prefere o da mesma loja; nunca usa maybeSingle sobre telefone duplicado
    //    (com duplicatas ele retornava erro e o código criava mais um lead).
    let lead: any = null
    {
      const { data } = await supabaseClient
        .from('leads').select('*')
        .eq('phone', phone).eq('store_id', storeId)
        .order('created_at', { ascending: true }).limit(1)
      lead = data?.[0] ?? null
    }
    if (!lead) {
      const { data } = await supabaseClient
        .from('leads').select('*')
        .eq('phone', phone)
        .order('created_at', { ascending: true }).limit(1)
      lead = data?.[0] ?? null
    }

    if (!lead) {
      // Mensagem enviada pelo celular da loja para alguém que não é lead: não cria lead.
      if (fromMe) return json({ status: 'ignored', reason: 'outgoing_to_unknown_contact' })

      const { data: newLead, error: createError } = await supabaseClient
        .from('leads')
        .insert({
          name: pushName,
          phone,
          source: 'whatsapp',
          status: 'novo',
          store_id: storeId,
          has_unread: true,
          last_message_at: messageCreatedAt,
        })
        .select()
        .single()
      if (createError) throw createError
      lead = newLead
    }

    const finalStoreId = lead.store_id || storeId

    // 6. Idempotência: a Evolution pode reenviar o mesmo evento
    {
      const { data: dup } = await supabaseClient
        .from('lead_messages').select('id')
        .eq('lead_id', lead.id)
        .eq('created_at', messageCreatedAt)
        .eq('content', parsed.content)
        .limit(1)
      if (dup && dup.length > 0) return json({ status: 'duplicate' })
    }

    // 6b. Eco de envio: o que o CRM manda (whatsapp-send já gravou) volta aqui como fromMe.
    if (fromMe) {
      const windowStart = new Date(new Date(messageCreatedAt).getTime() - 3 * 60 * 1000).toISOString()
      const { data: echo } = await supabaseClient
        .from('lead_messages').select('id')
        .eq('lead_id', lead.id)
        .eq('sender', 'vendedor')
        .eq('content', parsed.content)
        .gte('created_at', windowStart)
        .limit(1)
      if (echo && echo.length > 0) return json({ status: 'echo_ignored' })
    }

    // 7. Mídia (imagem/áudio) → storage
    let mediaUrl: string | null = null
    if (parsed.kind === 'image' || parsed.kind === 'audio') {
      const base64 = parsed.base64 || await fetchMediaBase64(activeConfig, key.id)
      if (base64) {
        try {
          const mimeType = parsed.mimeType || (parsed.kind === 'image' ? 'image/jpeg' : 'audio/ogg')
          const ext = parsed.kind === 'audio'
            ? 'ogg'
            : mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
          const fileName = `whatsapp/${lead.id}/${Date.now()}_${key.id || crypto.randomUUID()}.${ext}`
          const cleanBase64 = base64.replace(/^data:.*?;base64,/, '')
          const binaryStr = atob(cleanBase64)
          const bytes = new Uint8Array(binaryStr.length)
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

          const { data: uploadData, error: uploadErr } = await supabaseClient.storage
            .from('chat_media')
            .upload(fileName, bytes, { contentType: mimeType, upsert: true })
          if (!uploadErr && uploadData?.path) {
            mediaUrl = supabaseClient.storage.from('chat_media').getPublicUrl(uploadData.path).data.publicUrl
          } else if (uploadErr) {
            console.error('[WhatsApp Webhook] Falha no upload da mídia:', uploadErr.message)
          }
        } catch (mediaErr) {
          console.error('[WhatsApp Webhook] Erro ao salvar mídia:', mediaErr)
        }
      }
    }

    // 8. Grava a mensagem (somente colunas que existem em lead_messages)
    const { error: msgInsertError } = await supabaseClient
      .from('lead_messages')
      .insert({
        lead_id: lead.id,
        store_id: finalStoreId,
        content: parsed.content,
        sender: fromMe ? 'vendedor' : 'lead',
        sender_user_id: null,
        message_type: parsed.kind === 'image' || parsed.kind === 'audio' ? parsed.kind : 'text',
        media_url: mediaUrl,
        created_at: messageCreatedAt,
      })
    if (msgInsertError) throw msgInsertError

    // 9. Atualiza o lead só depois de a mensagem estar salva
    const leadUpdate: Record<string, unknown> = { last_message_at: messageCreatedAt }
    if (fromMe) {
      leadUpdate.has_unread = false
      leadUpdate.unread_count = 0
    } else {
      leadUpdate.has_unread = true
      leadUpdate.unread_count = (Number(lead.unread_count) || 0) + 1
    }
    const { error: leadUpdateError } = await supabaseClient.from('leads').update(leadUpdate).eq('id', lead.id)
    if (leadUpdateError) console.error('[WhatsApp Webhook] Falha ao atualizar lead:', leadUpdateError.message)

    return json({ status: 'success' })
  } catch (error) {
    console.error('[WhatsApp Webhook] Erro:', error)
    return json({ error: (error as Error)?.message || 'Erro interno' }, 500)
  }
})
