import { createClient } from '@supabase/supabase-js';

const url = 'https://hzrqtolfbwnmmeliazmh.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6cnF0b2xmYndubW1lbGlhem1oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDIxMjUwMSwiZXhwIjoyMDg5Nzg4NTAxfQ.r2EtLy9dZeGYmRQaaqB_EJmmuRnIkErgSx2yrRG0oro';

const supabase = createClient(url, serviceKey);

async function run() {
  console.log('=== USERS ===');
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*');
  if (pErr) console.error('Profiles err:', pErr.message);
  else {
    for (const p of profiles) {
      const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', p.user_id).maybeSingle();
      console.log(`User ID: ${p.user_id} | Name: ${p.display_name} | Role: ${roleData?.role || 'none'}`);
    }
  }

  console.log('=== ALL SALES IN DATABASE ===');
  const { data: sales, error: sErr } = await supabase.from('sales').select('*');
  if (sErr) console.error('Sales err:', sErr.message);
  else {
    sales.forEach(s => {
      console.log(`Sale: ID=${s.id} | Product ID=${s.product_id} | Store ID=${s.store_id} | Created By=${s.created_by} | Seller ID=${s.seller_id} | Date=${s.created_at} | Price=${s.sale_price}`);
    });
  }
}

run().catch(console.error);
