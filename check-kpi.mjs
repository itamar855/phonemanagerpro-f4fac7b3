import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=["']?([^"'\r\n]+)/);
const keyMatch = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY=["']?([^"'\r\n]+)/);

if (!urlMatch || !keyMatch) {
  console.error('Failed to parse .env file');
  process.exit(1);
}

const supabaseUrl = urlMatch[1];
const supabaseKey = keyMatch[1];

async function check() {
  const url = `${supabaseUrl}/rest/v1/service_order_items?select=id,service_order_id,unit_cost,quantity,created_at`;
  const response = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });

  if (!response.ok) {
    console.error('Error response:', await response.text());
    return;
  }

  const items = await response.json();
  console.log(`Found ${items.length} items in service_order_items:`);
  console.log(items.slice(0, 10));

  const totalCost = items.reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Number(item.quantity || 1)), 0);
  console.log('Total cost of all parts:', totalCost);
}

check();
