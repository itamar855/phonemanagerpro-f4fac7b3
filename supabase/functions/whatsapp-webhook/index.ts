
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

  // Provider Authentication Check (x-evolution-webhook-secret)
  const expectedWebhookSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  if (!expectedWebhookSecret) {
    console.error("EVOLUTION_WEBHOOK_SECRET não configurado");
    return new Response(
      JSON.stringify({ error: "Webhook indisponível" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

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

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    const payload = await req.json()
    console.log('Webhook payload received:', JSON.stringify(payload, null, 2))

    // 1. Validate if it's a message event
    if (payload.event !== 'messages.upsert') {
      return new Response(JSON.stringify({ status: 'ignored', event: payload.event }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const message = payload.data
    const key = message.key
    const fromMe = key.fromMe
    const remoteJid = key.remoteJid // e.g. "558799999999@s.whatsapp.net"
    const phone = remoteJid.split('@')[0]
    const pushName = message.pushName || 'Lead WhatsApp'

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
          last_message_at: new Date().toISOString()
        })
        .select()
        .single()
      
      if (createError) throw createError
      lead = newLead
    }

    if (lead) {
      // Update last message timestamp
      await supabaseClient
        .from('leads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', lead.id)
    }

    // 3. Handle Message Content (Text or Media)
    let content = ''
    let messageType = 'text'
    let mediaUrl = null

    const msgBody = message.message
    if (!msgBody) return new Response('No msg body', { status: 200 })

    if (msgBody.conversation || msgBody.extendedTextMessage?.text) {
      content = msgBody.conversation || msgBody.extendedTextMessage.text
      messageType = 'text'
    } else if (msgBody.imageMessage) {
      messageType = 'image'
      content = msgBody.imageMessage.caption || '[Imagem]'
      // Evolution API logic: if syncing media, we might need to fetch it
    } else if (msgBody.audioMessage) {
      messageType = 'audio'
      content = '[Áudio]'
    }

    // 4. Save to lead_messages
    const { error: msgInsertError } = await supabaseClient
      .from('lead_messages')
      .insert({
        lead_id: lead?.id,
        content: content,
        sender: fromMe ? 'vendedor' : 'lead',
        sender_user_id: fromMe ? null : null, // We'll link this in the send function or via some logic
        message_type: messageType,
        media_url: mediaUrl,
        created_at: new Date().toISOString()
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
