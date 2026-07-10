import fs from 'fs';
import path from 'path';

const envContent = fs.readFileSync(path.resolve('.env'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value.length > 0) {
    let val = value.join('=').trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    env[key.trim()] = val;
  }
});

async function testInsert() {
  const url = `${env.VITE_SUPABASE_URL}/rest/v1/cash_entries`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      cash_register_id: "00000000-0000-0000-0000-000000000000",
      store_id: "00000000-0000-0000-0000-000000000000",
      type: "entrada",
      amount: 100,
      description: "Test",
      payment_method: "dinheiro",
      confirmed: false,
      created_by: "00000000-0000-0000-0000-000000000000"
    })
  });
  const data = await res.json();
  console.log("Insert response:", data);
}

testInsert();
