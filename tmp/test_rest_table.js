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

async function testColumn(table) {
  const url = `${env.VITE_SUPABASE_URL}/rest/v1/${table}?limit=1`;
  const res = await fetch(url, {
    headers: {
      'apikey': env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${env.VITE_SUPABASE_PUBLISHABLE_KEY}`
    }
  });
  const data = await res.json();
  console.log(`Table ${table}:`, data);
}

async function test() {
  await testColumn('transactions');
}

test();
