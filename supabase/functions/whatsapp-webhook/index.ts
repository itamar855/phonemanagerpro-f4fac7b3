
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    } catch {}
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase privileged credential unavailable.");
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Provider Authentication Check (x-evolution-webhook-secret ou token opcional)
  const expectedWebhookSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  if (expectedWebhookSecret) {
    const receivedWebhookSecret = req.headers.get("x-evolution-webhook-secret");
    if (
      !receivedWebhookSecret ||
      receivedWebhookSecret !== expectedWebhookSecret
    ) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    const payload = await req.json()
    console.log('Webhook payload received:', JSON.stringify(payload, null, 2))

    // 1. Validate if it's a message event
    const eventName = (payload.event || '').toLowerCase()
    if (eventName !== 'messages.upsert') {
      return new Response(JSON.stringify({ status: 'ignored', event: payload.event }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const message = payload.data
    const key = message?.key || {}
    const fromMe = key.fromMe
    const remoteJid = key.remoteJid || '' // e.g. "558799999999@s.whatsapp.net"

    // 2. FILTRAR GRUPOS, TRANSMISSÕES E CANAIS (Aceitar exclusivamente mensagens privadas de pessoas)
    const isGroup = remoteJid.endsWith('@g.us') || Boolean(key.participant)
    const isBroadcast = remoteJid.includes('@broadcast') || remoteJid.includes('@newsletter')
    const isDirectPerson = remoteJid.endsWith('@s.whatsapp.net')

    if (isGroup || isBroadcast || !isDirectPerson) {
      console.log(`[WhatsApp Webhook] Mensagem ignorada (Grupo/Canal/Status): ${remoteJid}`)
      return new Response(
        JSON.stringify({
          status: 'ignored',
          reason: 'group_or_broadcast_filtered',
          remoteJid
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    const phone = remoteJid.split('@')[0]
    const pushName = message.pushName || 'Lead WhatsApp'

    // Resolve store_id and config for multi-tenant isolation and media download
    const instance = payload.instance
    let storeId: string | null = null
    let activeConfig: any = null

    if (instance) {
      const { data: cfg } = await supabaseClient
        .from('whatsapp_config')
        .select('*')
        .eq('instance_name', instance)
        .maybeSingle()
      if (cfg) {
        storeId = cfg.store_id
        activeConfig = cfg
      }
    }
    if (!storeId) {
      const { data: activeCfg } = await supabaseClient
        .from('whatsapp_config')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      if (activeCfg) {
        storeId = activeCfg.store_id
        activeConfig = activeCfg
      }
    }
    if (!storeId) {
      const { data: firstStore } = await supabaseClient
        .from('stores')
        .select('id')
        .limit(1)
        .maybeSingle()
      if (firstStore?.id) storeId = firstStore.id
    }

    if (!storeId) {
      throw new Error('Nenhuma loja encontrada para associar ao lead.')
    }

    // 2. Identify the lead
    let { data: lead, error: leadError } = await supabaseClient
      .from('leads')
      .select('*')
      .eq('phone', phone)
      .maybeSingle()

    if (!lead && !fromMe) {
      // Create new lead if it doesn't exist
      const { data: newLead, error: createError } = await supabaseClient
        .from('leads')
        .insert({
          name: pushName,
          phone: phone,
          source: 'whatsapp',
          status: 'novo',
          store_id: storeId,
          has_unread: true,
          last_message_at: new Date().toISOString()
        })
        .select()
        .single()
      
      if (createError) throw createError
      lead = newLead
    }

    // Resolve precise message timestamp from Evolution API (seconds Unix timestamp)
    let messageCreatedAt = new Date().toISOString()
    const rawTs = message?.messageTimestamp
    if (rawTs) {
      const tsNum = typeof rawTs === 'object' && rawTs?.low ? Number(rawTs.low) : Number(rawTs)
      if (!isNaN(tsNum) && tsNum > 0) {
        const ms = tsNum < 100000000000 ? tsNum * 1000 : tsNum
        messageCreatedAt = new Date(ms).toISOString()
      }
    }

    if (lead) {
      // Update last message timestamp
      await supabaseClient
        .from('leads')
        .update({
          last_message_at: messageCreatedAt,
          has_unread: fromMe ? false : true
        })
        .eq('id', lead.id)
    }

    // 3. Handle Message Content (Text or Media)
    let content = ''
    let messageType = 'text'
    let mediaUrl: string | null = null

    const msgBody = message.message
    if (!msgBody) return new Response('No msg body', { status: 200 })

    if (msgBody.conversation || msgBody.extendedTextMessage?.text) {
      content = msgBody.conversation || msgBody.extendedTextMessage.text
      messageType = 'text'
    } else if (msgBody.imageMessage) {
      messageType = 'image'
      content = msgBody.imageMessage.caption || '[Imagem]'

      let base64 = message.base64 || msgBody.imageMessage.base64 || payload.base64
      if (!base64 && activeConfig?.api_url && activeConfig?.api_key && activeConfig?.instance_name && key?.id) {
        try {
          const mediaResp = await fetch(
            `${activeConfig.api_url.replace(/\/+$/, '')}/chat/getBase64FromMediaMessage/${activeConfig.instance_name}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: activeConfig.api_key },
              body: JSON.stringify({
                message: { key: { id: key.id } },
                convertToMp4: false,
              }),
            }
          )
          if (mediaResp.ok) {
            const mediaData = await mediaResp.json()
            base64 = mediaData?.base64 || mediaData?.data
          }
        } catch (fetchErr) {
          console.error('[WhatsApp Webhook] Erro ao buscar base64 da imagem:', fetchErr)
        }
      }

      if (base64) {
        try {
          const mimeType = msgBody.imageMessage.mimetype || 'image/jpeg'
          const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
          const fileName = `whatsapp/${lead?.id || 'incoming'}/${Date.now()}_${key.id || Math.random().toString(36).slice(2)}.${ext}`
          const cleanBase64 = base64.replace(/^data:.*?;base64,/, '')
          const binaryStr = atob(cleanBase64)
          const bytes = new Uint8Array(binaryStr.length)
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

          const { data: uploadData, error: uploadErr } = await supabaseClient.storage
            .from('chat_media')
            .upload(fileName, bytes, { contentType: mimeType, upsert: true })

          if (!uploadErr && uploadData?.path) {
            const { data: publicUrlData } = supabaseClient.storage.from('chat_media').getPublicUrl(uploadData.path)
            mediaUrl = publicUrlData.publicUrl
          } else {
            mediaUrl = `data:${mimeType};base64,${cleanBase64}`
          }
        } catch (mediaErr) {
          console.error('[WhatsApp Webhook] Erro ao salvar imagem no storage:', mediaErr)
        }
      }
    } else if (msgBody.audioMessage) {
      messageType = 'audio'
      content = '[Áudio]'

      let base64 = message.base64 || msgBody.audioMessage.base64 || payload.base64
      if (!base64 && activeConfig?.api_url && activeConfig?.api_key && activeConfig?.instance_name && key?.id) {
        try {
          const mediaResp = await fetch(
            `${activeConfig.api_url.replace(/\/+$/, '')}/chat/getBase64FromMediaMessage/${activeConfig.instance_name}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: activeConfig.api_key },
              body: JSON.stringify({
                message: { key: { id: key.id } },
                convertToMp4: false,
              }),
            }
          )
          if (mediaResp.ok) {
            const mediaData = await mediaResp.json()
            base64 = mediaData?.base64 || mediaData?.data
          }
        } catch (fetchErr) {
          console.error('[WhatsApp Webhook] Erro ao buscar base64 do áudio:', fetchErr)
        }
      }

      if (base64) {
        try {
          const mimeType = msgBody.audioMessage.mimetype || 'audio/ogg'
          const fileName = `whatsapp/${lead?.id || 'incoming'}/${Date.now()}_${key.id || Math.random().toString(36).slice(2)}.ogg`
          const cleanBase64 = base64.replace(/^data:.*?;base64,/, '')
          const binaryStr = atob(cleanBase64)
          const bytes = new Uint8Array(binaryStr.length)
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

          const { data: uploadData, error: uploadErr } = await supabaseClient.storage
            .from('chat_media')
            .upload(fileName, bytes, { contentType: mimeType, upsert: true })

          if (!uploadErr && uploadData?.path) {
            const { data: publicUrlData } = supabaseClient.storage.from('chat_media').getPublicUrl(uploadData.path)
            mediaUrl = publicUrlData.publicUrl
          }
        } catch (mediaErr) {
          console.error('[WhatsApp Webhook] Erro ao salvar áudio no storage:', mediaErr)
        }
      }
    }

    // 4. Save to lead_messages
    const finalStoreId = lead?.store_id || storeId
    const { error: msgInsertError } = await supabaseClient
      .from('lead_messages')
      .insert({
        lead_id: lead?.id,
        store_id: finalStoreId,
        content: content,
        sender: fromMe ? 'vendedor' : 'lead',
        sender_type: fromMe ? 'vendedor' : 'lead',
        sender_user_id: fromMe ? null : null,
        message_type: messageType,
        media_url: mediaUrl,
        created_at: messageCreatedAt
      })

    if (msgInsertError) throw msgInsertError

    return new Response(JSON.stringify({ status: 'success' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
