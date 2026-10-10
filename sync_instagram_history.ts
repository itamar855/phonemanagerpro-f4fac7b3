const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Erro: SUPABASE_URL e SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY) são obrigatórios.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function sync() {
  const { data: config } = await supabase
    .from('instagram_config')
    .select('page_access_token, instagram_business_account_id')
    .eq('is_active', true)
    .single();

  if (!config || !config.page_access_token) {
    console.error("Configuração do Instagram não encontrada ou inativa.");
    return;
  }

  const { data: leads } = await supabase
    .from('leads')
    .select('id, instagram_user_id, name')
    .eq('source', 'instagram')
    .not('instagram_user_id', 'is', null);

  if (!leads) return;

  console.log(`Sincronizando ${leads.length} leads...`);

  for (const lead of leads) {
    console.log(`Processando lead: ${lead.name} (${lead.instagram_user_id})`);
    
    // 1. Tentar pegar o nome real se for genérico
    if (lead.name.startsWith("IG User")) {
        try {
            const profileRes = await fetch(`https://graph.facebook.com/v19.0/${lead.instagram_user_id}?fields=name,username&access_token=${config.page_access_token}`);
            const profile = await profileRes.json();
            if (profile.name) {
                await supabase.from('leads').update({ 
                    name: profile.name,
                    instagram_username: profile.username 
                }).eq('id', lead.id);
                console.log(`Nome atualizado para: ${profile.name}`);
            }
        } catch (e) {
            console.error(`Erro ao buscar perfil ${lead.instagram_user_id}:`, e);
        }
    }

    // 2. Sincronizar histórico de mensagens
    try {
        const messagesRes = await fetch(`https://graph.facebook.com/v19.0/${config.instagram_business_account_id}/conversations?user_id=${lead.instagram_user_id}&fields=messages{message,from,created_time}&access_token=${config.page_access_token}`);
        const conversations = await messagesRes.json();
        
        if (conversations.data && conversations.data[0] && conversations.data[0].messages) {
            const messages = conversations.data[0].messages.data;
            console.log(`Encontradas ${messages.length} mensagens.`);
            
            for (const msg of messages) {
                const isEcho = msg.from.id === config.instagram_business_account_id;
                
                // Verificar se a mensagem já existe
                const { data: existing } = await supabase
                    .from('lead_messages')
                    .select('id')
                    .eq('lead_id', lead.id)
                    .eq('content', msg.message)
                    .eq('created_at', msg.created_time)
                    .maybeSingle();
                
                if (!existing) {
                    await supabase.from('lead_messages').insert({
                        lead_id: lead.id,
                        content: msg.message,
                        sender_type: isEcho ? 'vendedor' : 'cliente',
                        message_type: 'text',
                        channel: 'instagram',
                        created_at: msg.created_time
                    });
                }
            }
        }
    } catch (e) {
        console.error(`Erro ao sincronizar mensagens para ${lead.instagram_user_id}:`, e);
    }
  }
  console.log("Sincronização concluída.");
}

sync();
