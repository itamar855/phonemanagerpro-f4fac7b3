
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

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    const body = await req.json()
    const { action, phone, content, messageType, mediaUrl, leadId, userId, storeId } = body

    // 1. Get API Configuration
    let query = supabaseClient
      .from('whatsapp_config')
      .select('*')
      .eq('is_active', true)

    if (storeId) {
      query = query.eq('store_id', storeId)
    }

    const { data: config, error: configError } = await query.maybeSingle()
    if (configError || !config) throw new Error('WhatsApp API não configurada ou inativa.')

    const apiUrl = config.api_url.endsWith('/') ? config.api_url : `${config.api_url}/`
    const apiKey = config.api_key
    const instance = config.instance_name
    const number = phone?.includes('@') ? phone : `${phone?.replace(/\D/g, '')}@s.whatsapp.net`

    // --- ACTION: SYNC HISTORY ---
    if (action === 'sync-history') {
      let evolutionMsgs: any[] = []
      try {
        const findRes = await fetch(`${apiUrl}chat/findMessages/${instance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: apiKey },
          body: JSON.stringify({
            where: {
              key: { remoteJid: number }
            },
            limit: 50
          })
        })

        if (findRes.ok) {
          const findData = await findRes.json()
          evolutionMsgs = Array.isArray(findData) ? findData : findData?.messages?.records || findData?.records || findData?.messages || []
        } else {
          // Alternative Evolution endpoint format
          const altRes = await fetch(`${apiUrl}chat/findMessages/${instance}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: apiKey },
            body: JSON.stringify({
              where: { remoteJid: number },
              page: 1,
              offset: 50
            })
          })
          if (altRes.ok) {
            const altData = await altRes.json()
            evolutionMsgs = Array.isArray(altData) ? altData : altData?.messages?.records || altData?.records || altData?.messages || []
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
          let mMediaUrl = null

          if (mBody.conversation || mBody.extendedTextMessage?.text) {
            mContent = mBody.conversation || mBody.extendedTextMessage.text
            mType = 'text'
          } else if (mBody.imageMessage) {
            mType = 'image'
            mContent = mBody.imageMessage.caption || '[Imagem]'
          } else if (mBody.audioMessage) {
            mType = 'audio'
            mContent = '[Áudio]'
          } else {
            continue
          }

          // Timestamp
          let tsIso = new Date().toISOString()
          const rawTs = m.messageTimestamp
          if (rawTs) {
            const tsNum = typeof rawTs === 'object' && rawTs?.low ? Number(rawTs.low) : Number(rawTs)
            if (!isNaN(tsNum) && tsNum > 0) {
              const ms = tsNum < 100000000000 ? tsNum * 1000 : tsNum
              tsIso = new Date(ms).toISOString()
            }
          }

          // If image and no mediaUrl, try to fetch base64
          if (mType === 'image') {
            let base64 = m.base64 || mBody.imageMessage?.base64
            if (!base64 && mKey.id) {
              try {
                const mediaResp = await fetch(`${apiUrl}chat/getBase64FromMediaMessage/${instance}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', apikey: apiKey },
                  body: JSON.stringify({ message: { key: { id: mKey.id } }, convertToMp4: false })
                })
                if (mediaResp.ok) {
                  const mediaData = await mediaResp.json()
                  base64 = mediaData?.base64 || mediaData?.data
                }
              } catch (_) {}
            }

            if (base64) {
              try {
                const mimeType = mBody.imageMessage?.mimetype || 'image/jpeg'
                const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
                const fileName = `whatsapp/${leadId || 'history'}/${Date.now()}_${mKey.id || Math.random().toString(36).slice(2)}.${ext}`
                const cleanBase64 = base64.replace(/^data:.*?;base64,/, '')
                const binaryStr = atob(cleanBase64)
                const bytes = new Uint8Array(binaryStr.length)
                for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

                const { data: upData, error: upErr } = await supabaseClient.storage
                  .from('chat_media')
                  .upload(fileName, bytes, { contentType: mimeType, upsert: true })

                if (!upErr && upData?.path) {
                  mMediaUrl = supabaseClient.storage.from('chat_media').getPublicUrl(upData.path).data.publicUrl
                } else {
                  mMediaUrl = `data:${mimeType};base64,${cleanBase64}`
                }
              } catch (_) {}
            }
          }

          // Check if message exists by lead_id & content
          const { data: existing } = await supabaseClient
            .from('lead_messages')
            .select('id, media_url')
            .eq('lead_id', leadId)
            .eq('content', mContent)
            .limit(1)
            .maybeSingle()

          if (!existing) {
            await supabaseClient.from('lead_messages').insert({
              lead_id: leadId,
              store_id: config.store_id,
              content: mContent,
              sender: isFromMe ? 'vendedor' : 'lead',
              sender_type: isFromMe ? 'vendedor' : 'lead',
              message_type: mType,
              media_url: mMediaUrl,
              created_at: tsIso
            })
            syncedCount++
          } else if (mMediaUrl && !existing.media_url) {
            await supabaseClient.from('lead_messages').update({
              media_url: mMediaUrl
            }).eq('id', existing.id)
            syncedCount++
          }
        } catch (itemErr) {
          console.error('Error syncing individual message:', itemErr)
        }
      }

      return new Response(JSON.stringify({ status: 'success', syncedCount }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    let response

    // 2. Send Message via Evolution API
    if (messageType === 'text') {
      response = await fetch(`${apiUrl}message/sendText/${instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
        body: JSON.stringify({ number, text: content, delay: 1000 })
      })
    } else {
      // For media (image, audio, document)
      response = await fetch(`${apiUrl}message/sendMedia/${instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
        body: JSON.stringify({
          number,
          mediaType: messageType,
          media: mediaUrl, // Can be a URL or base64
          caption: content,
          delay: 1000
        })
      })
    }

    const apiResult = await response.json()
    if (!response.ok) throw new Error(`Erro API: ${JSON.stringify(apiResult)}`)

    // 3. Save to lead_messages
    const { error: msgInsertError } = await supabaseClient
      .from('lead_messages')
      .insert({
        lead_id: leadId,
        store_id: config.store_id,
        content: content,
        sender: 'vendedor',
        sender_type: 'vendedor',
        sender_user_id: userId,
        message_type: messageType,
        media_url: mediaUrl,
        created_at: new Date().toISOString()
      })

    if (msgInsertError) console.error('Error saving sent message:', msgInsertError)

    // 4. Update Lead last_message_at
    await supabaseClient
      .from('leads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', leadId)

    return new Response(JSON.stringify({ status: 'success', apiResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Send error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
