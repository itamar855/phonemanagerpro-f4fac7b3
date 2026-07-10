const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
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
    // A descrição do caixa é igual a da transação ou muito parecida
    const cleanDesc = txDesc.replace(/\[.*?\]/g, '').trim();

    const match = cashEntries.find(ce => {
      const ceDesc = ce.description || "";
      return ceDesc.includes(cleanDesc) && Math.abs(ce.amount - tx.amount) < 1;
    });

    if (!match) {
      missing.push(tx);
    }
  }

  console.log(`Found ${missing.length} missing cash entries. Attempting to reconcile...`);

  if (missing.length === 0) return;

  const { data: registers } = await supabase.from('cash_registers').select('*').eq('status', 'open');
  if (!registers || registers.length === 0) {
    console.warn("No open cash registers found! Cannot reconcile without an open register.");
    return;
  }

  let inserted = 0;

  for (const m of missing) {
    let register = registers.find(r => r.store_id === m.store_id && r.opened_by === m.created_by);
    if (!register) register = registers.find(r => r.store_id === m.store_id);

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

      if (m.description.includes('MISTO')) {
        const match = m.description.match(/\[MISTO:(\{.*\})\]/);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            const cleanDesc = m.description.replace(/\[MISTO:.*\]/, '').trim();
            
            if (parsed.dinheiro > 0) {
              await supabase.from('cash_entries').insert({ ...payload, payment_method: 'dinheiro', amount: parsed.dinheiro, description: cleanDesc });
              inserted++;
            }
            if (parsed.pix > 0) {
              await supabase.from('cash_entries').insert({ ...payload, payment_method: 'pix', amount: parsed.pix, description: cleanDesc });
              inserted++;
            }
            if (parsed.cartao_credito > 0) {
              await supabase.from('cash_entries').insert({ ...payload, payment_method: 'cartao_credito', amount: parsed.cartao_credito, description: cleanDesc });
              inserted++;
            }
            continue;
          } catch (e) {
            console.error("Erro no parse do misto", e);
          }
        }
      } else if (m.description.includes('[PIX]')) {
        payload.payment_method = 'pix';
      } else if (m.description.includes('[Cartão]')) {
        payload.payment_method = 'cartao_credito';
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
