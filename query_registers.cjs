const fs = require('fs');
const https = require('https');

const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.*)/);

if (!urlMatch || !keyMatch) {
  console.log("Missing env variables");
  process.exit(1);
}

const url = urlMatch[1].replace(/[\"']/g, '').trim() + '/rest/v1/sales?select=id,store_id,created_at,notes&order=created_at.desc&limit=5';
const key = keyMatch[1].replace(/[\"']/g, '').trim();

const options = {
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(JSON.parse(data)));
}).on('error', err => console.log(err.message));
