import { createClient } from '@supabase/supabase-js';

// Using privileged secret key via environment variable
const url = process.env.SUPABASE_URL || 'https://hzrqtolfbwnmmeliazmh.supabase.co';
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error("ERRO: SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function run() {
  console.log('=== SUPABASE FULL DATABASE DIAGNOSTIC (service_role) ===');
  console.log('Project: hzrqtolfbwnmmeliazmh\n');

  // 1. Row counts
  const tables = ['products', 'stores', 'sales', 'transactions', 'user_roles', 'member_stores', 'profiles', 'customers', 'accessories'];
  console.log('=== TABLE ROW COUNTS ===');
  for (const table of tables) {
    try {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) console.log(`  ${table}: ERROR - ${error.message}`);
      else console.log(`  ${table}: ${count} rows`);
    } catch (e) {
      console.log(`  ${table}: EXCEPTION - ${e.message}`);
    }
  }

  // 2. Stores
  console.log('\n=== STORES ===');
  const { data: storesData, error: stErr } = await supabase.from('stores').select('*');
  if (stErr) console.log('Error:', stErr.message);
  else {
    console.log(`Total: ${storesData.length}`);
    storesData.forEach(s => console.log(`  "${s.name}" id=${s.id} owner=${s.owner_id}`));
  }

  // 3. User Roles
  console.log('\n=== USER ROLES ===');
  const { data: roles, error: rErr } = await supabase.from('user_roles').select('*');
  if (rErr) console.log('Error:', rErr.message);
  else {
    console.log(`Total: ${roles.length}`);
    roles.forEach(r => console.log(`  user=${r.user_id} role=${r.role}`));
  }

  // 4. Member Stores
  console.log('\n=== MEMBER STORES ===');
  const { data: ms, error: msErr } = await supabase.from('member_stores').select('*');
  if (msErr) console.log('Error:', msErr.message);
  else {
    console.log(`Total: ${ms.length}`);
    ms.forEach(m => console.log(`  user=${m.user_id} store=${m.store_id}`));
  }

  // 5. Profiles
  console.log('\n=== PROFILES ===');
  const { data: profs, error: profErr } = await supabase.from('profiles').select('*');
  if (profErr) console.log('Error:', profErr.message);
  else {
    console.log(`Total: ${profs.length}`);
    profs.forEach(p => console.log(`  ${p.full_name || 'no name'} (${p.id}) email=${p.email || 'n/a'}`));
  }

  // 6. Products
  console.log('\n=== PRODUCTS ===');
  const { data: products, error: pErr } = await supabase.from('products').select('*').order('created_at', { ascending: false });
  if (pErr) console.log('Error:', pErr.message);
  else {
    console.log(`Total: ${products.length}`);
    const byStatus = {};
    products.forEach(p => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; });
    console.log('By status:', JSON.stringify(byStatus));
    const byStore = {};
    products.forEach(p => { byStore[p.store_id] = (byStore[p.store_id] || 0) + 1; });
    console.log('By store:', JSON.stringify(byStore));
    console.log('\nAll products:');
    products.forEach(p => {
      console.log(`  [${p.status}] ${p.brand} ${p.model} - ${p.name} | cost=${p.cost_price} sale=${p.sale_price} | store=${p.store_id?.substring(0,8)}... | created=${p.created_at}`);
    });
  }

  // 7. Sales
  console.log('\n=== SALES ===');
  const { data: sales, error: sErr } = await supabase.from('sales').select('*').order('created_at', { ascending: false });
  if (sErr) console.log('Error:', sErr.message);
  else {
    console.log(`Total: ${sales.length}`);
    sales.forEach(s => {
      console.log(`  Price=${s.sale_price} | Cash=${s.payment_cash} Card=${s.payment_card} Pix=${s.payment_pix} | Customer=${s.customer_name || 'n/a'} | Store=${s.store_id?.substring(0,8)}... | Date=${s.created_at}`);
    });
  }

  // 8. Transactions
  console.log('\n=== TRANSACTIONS ===');
  const { data: txns, error: txErr } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(20);
  if (txErr) console.log('Error:', txErr.message);
  else {
    console.log(`Total (showing max 20): ${txns.length}`);
    txns.forEach(t => {
      console.log(`  ${t.type} | ${t.category} | Amount=${t.amount} | ${t.description || 'no desc'} | Date=${t.created_at}`);
    });
  }

  // 9. Customers
  console.log('\n=== CUSTOMERS ===');
  const { data: custs, error: custErr } = await supabase.from('customers').select('*');
  if (custErr) console.log('Error:', custErr.message);
  else {
    console.log(`Total: ${custs.length}`);
    custs.forEach(c => console.log(`  ${c.name} | phone=${c.phone || 'n/a'} | cpf=${c.cpf || 'n/a'}`));
  }

  // 10. Accessories
  console.log('\n=== ACCESSORIES ===');
  const { data: accs, error: accErr } = await supabase.from('accessories').select('*');
  if (accErr) console.log('Error:', accErr.message);
  else {
    console.log(`Total: ${accs.length}`);
    accs.forEach(a => console.log(`  ${a.name} | qty=${a.quantity} | cost=${a.cost_price} sale=${a.sale_price} | store=${a.store_id?.substring(0,8)}...`));
  }

  console.log('\n=== DONE ===');
}

run().catch(console.error);
