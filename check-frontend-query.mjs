import { createClient } from '@supabase/supabase-js';

const url = 'https://hzrqtolfbwnmmeliazmh.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6cnF0b2xmYndubW1lbGlhem1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMTI1MDEsImV4cCI6MjA4OTc4ODUwMX0.wQyORyhVI5FaUapc3uwsOV48VUQgvdj2_y0FXjYchAo';

const supabase = createClient(url, anonKey);

async function run() {
  console.log('--- PRODUCTS ACCESSIBLE VIA ANON KEY ---');
  const { data: products, error: pErr } = await supabase.from('products').select('*');
  if (pErr) {
    console.error('Error fetching products:', pErr.message);
  } else {
    console.log(`Found ${products.length} products total.`);
    const sold = products.filter(p => p.status === 'sold');
    console.log(`Sold products found: ${sold.length}`);
    sold.forEach(p => console.log(`  - ${p.name} (id=${p.id})`));
  }

  console.log('--- SALES ACCESSIBLE VIA ANON KEY ---');
  const { data: sales, error: sErr } = await supabase.from('sales').select('*');
  if (sErr) {
    console.error('Error fetching sales:', sErr.message);
  } else {
    console.log(`Found ${sales.length} sales total.`);
  }
}

run().catch(console.error);
