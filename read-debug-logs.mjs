import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || 'https://hzrqtolfbwnmmeliazmh.supabase.co';
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error("ERRO: SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function run() {
  console.log('=== READING RECENT DEBUG LOGS ===');
  const { data, error } = await supabase
    .from('debug_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching logs:', error.message);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

run().catch(console.error);
