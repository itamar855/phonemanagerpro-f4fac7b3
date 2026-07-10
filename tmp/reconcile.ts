import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Fetching transactions...");
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .in('type', ['sale', 'income'])
    .order('created_at', { ascending: false });

  if (txError) {
    console.error("Tx error:", txError);
    return;
  }

  console.log("Fetching cash_entries...");
  const { data: cashEntries, error: ceError } = await supabase
    .from('cash_entries')
    .select('*')
    .in('type', ['entrada', 'misto'])
    .order('created_at', { ascending: false });

  if (ceError) {
    console.error("CE error:", ceError);
    return;
  }

  console.log(`Found ${transactions.length} transactions and ${cashEntries.length} cash entries.`);

  const missing = [];

  for (const tx of transactions) {
    if (tx.type !== 'sale' && tx.category !== 'acessorio') continue;

    const txDesc = tx.description || "";
    // Remove tags to match description
    const cleanDesc = txDesc.replace(/\[.*?\]/g, '').trim();

    const match = cashEntries.find(ce => {
      const ceDesc = ce.description || "";
      return ceDesc.includes(cleanDesc) && Math.abs(ce.amount - tx.amount) < 1;
    });

    if (!match) {
      missing.push(tx);
    }
  }

  console.log(`Found ${missing.length} missing cash entries.`);
  
  if (missing.length === 0) {
    console.log("No missing entries to reconcile.");
    return;
  }

  // Get registers
  const { data: registers } = await supabase.from('cash_registers').select('*').eq('status', 'open');

  let inserted = 0;
  for (const m of missing) {
    console.log(`Missing: ${m.description} - R$ ${m.amount} - ${m.created_at} - Store: ${m.store_id} - User: ${m.created_by}`);
    
    let register = registers.find(r => r.store_id === m.store_id && r.opened_by === m.created_by);
    if (!register) {
      register = registers.find(r => r.store_id === m.store_id);
    }

    if (register) {
      const payload = {
        cash_register_id: register.id,
        store_id: m.store_id,
        type: 'entrada',
        amount: m.amount,
        description: m.description,
        payment_method: 'dinheiro',
        confirmed: false,
        created_by: m.created_by,
        created_at: m.created_at
      };

      if (m.description.includes('[PIX]')) payload.payment_method = 'pix';
      else if (m.description.includes('[Cartão]')) payload.payment_method = 'cartao_credito';
      else if (m.description.includes('MISTO')) {
        payload.payment_method = 'misto';
        payload.type = 'misto';
      }

      console.log(`Inserting cash entry for transaction ${m.id}...`);
      const { error: insErr } = await supabase.from('cash_entries').insert(payload);
      if (insErr) {
        console.error(`Failed to insert for ${m.id}:`, insErr);
      } else {
        inserted++;
      }
    } else {
      console.warn(`No open register found for store ${m.store_id}`);
    }
  }

  console.log(`Successfully reconciled ${inserted} cash entries.`);
}

main();
