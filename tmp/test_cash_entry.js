import { createClient } from '@supabase/supabase-js';
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

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function test() {
  const { data, error } = await supabase
    .from('cash_entries')
    .select('*')
    .limit(1);
    
  console.log("SELECT error:", error);
  if (data && data.length > 0) {
    console.log("Columns:", Object.keys(data[0]));
  }
}

test();
