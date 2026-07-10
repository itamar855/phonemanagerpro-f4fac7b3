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

async function testColumn(col) {
  const url = `${env.VITE_SUPABASE_URL}/rest/v1/cash_entries?select=${col}&limit=1`;
  const res = await fetch(url, {
    headers: {
      'apikey': env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${env.VITE_SUPABASE_PUBLISHABLE_KEY}`
    }
  });
  const data = await res.json();
  console.log(`Column ${col}:`, data);
}

async function test() {
  await testColumn('store_id');
}

test();
