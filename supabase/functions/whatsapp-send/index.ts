
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

    const { phone, content, messageType, mediaUrl, leadId, userId } = await req.json()

    // 1. Get API Configuration
    const { data: config, error: configError } = await supabaseClient
      .from('whatsapp_config')
      .select('*')
      .eq('is_active', true)
      .single()

    if (configError || !config) throw new Error('WhatsApp API não configurada ou inativa.')

    const apiUrl = config.api_url.endsWith('/') ? config.api_url : `${config.api_url}/`
    const apiKey = config.api_key
    const instance = config.instance_name

    let response
    const number = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`

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
        content: content,
        sender: 'vendedor',
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
