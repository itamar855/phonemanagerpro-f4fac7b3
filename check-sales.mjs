import { createClient } from '@supabase/supabase-js';

const url = 'https://hzrqtolfbwnmmeliazmh.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6cnF0b2xmYndubW1lbGlhem1oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDIxMjUwMSwiZXhwIjoyMDg5Nzg4NTAxfQ.r2EtLy9dZeGYmRQaaqB_EJmmuRnIkErgSx2yrRG0oro';

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
