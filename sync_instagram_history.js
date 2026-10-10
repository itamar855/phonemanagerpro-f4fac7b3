import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Erro: SUPABASE_URL e SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY) são obrigatórios.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function sync() {
  // 1. Pegar logs de eco (mensagens enviadas pelo vendedor)
  const { data: logs } = await supabase
    .from('instagram_webhooks_logs')
    .select('id, payload')
    .order('created_at', { ascending: true });

  if (!logs) return;

  console.log(`Analisando ${logs.length} logs para identificar mensagens enviadas...`);

  for (const log of logs) {
    const entry = log.payload?.entry?.[0];
    const messaging = entry?.messaging?.[0];
    if (!messaging) continue;

    const isEcho = messaging.message?.is_echo === true;
    if (!isEcho) continue;

    const recipientId = messaging.recipient?.id;
    const senderId = messaging.sender?.id; // Este é o ID da loja no caso de echo
    const text = messaging.message?.text;
    const timestamp = messaging.timestamp;
    const createdAt = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

    if (!recipientId || !text) continue;

    // Buscar o lead pelo ID do destinatário
    const { data: lead } = await supabase
        .from('leads')
        .select('id, name')
        .eq('instagram_user_id', recipientId)
        .maybeSingle();

    if (lead) {
        // Verificar se a mensagem já existe
        const { data: existing } = await supabase
            .from('lead_messages')
            .select('id')
            .eq('lead_id', lead.id)
            .eq('content', text)
            .eq('sender_type', 'vendedor')
            .maybeSingle();

        if (!existing) {
            const { error: insError } = await supabase.from('lead_messages').insert({
                lead_id: lead.id,
                content: text,
                sender_type: 'vendedor',
                message_type: 'text',
                channel: 'instagram',
                created_at: createdAt
            });
            if (insError) console.error(`Erro ao inserir eco para ${lead.name}:`, insError.message);
            else console.log(`[ECO] Inserida msg para ${lead.name}: ${text.substring(0, 20)}...`);
        }
    }
  }

  // 2. Atualizar Nomes dos Leads se possível via Logs (tentar encontrar nomes nos payloads se houver)
  // Como os logs do Instagram Webhook geralmente não trazem o nome no payload da mensagem, 
  // e o script anterior falhou com o token, vamos focar em garantir que as mensagens apareçam.

  console.log("Sincronização de histórico enviada completa!");
}

sync();
