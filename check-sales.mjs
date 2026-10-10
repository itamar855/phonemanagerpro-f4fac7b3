import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || 'https://hzrqtolfbwnmmeliazmh.supabase.co';
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error("ERRO: SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function run() {
  console.log('--- SALES AND THEIR PRODUCTS ---');
  const { data: sales, error: sErr } = await supabase.from('sales').select('*');
  if (sErr) {
    console.error('Error fetching sales:', sErr.message);
    return;
  }
  
  console.log(`Found ${sales.length} sales.`);
  for (const s of sales) {
    const { data: p, error: pErr } = await supabase.from('products').select('*').eq('id', s.product_id).maybeSingle();
    console.log(`Sale ID: ${s.id} | Product ID: ${s.product_id} | Product Found: ${p ? 'YES (' + p.name + ', status=' + p.status + ', store=' + p.store_id + ')' : 'NO'} | Sale Store: ${s.store_id}`);
  }
}

run().catch(console.error);
