import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://hzrqtolfbwnmmeliazmh.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseServiceKey) {
  console.error("Missing service role key!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspect() {
  const { data: accounts } = await supabase.from("store_bank_accounts").select("*");
  console.log("=== BANK ACCOUNTS ===");
  console.log(JSON.stringify(accounts, null, 2));

  const { data: txs } = await supabase
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false });
  console.log("=== TRANSACTIONS ===");
  console.log(JSON.stringify(txs, null, 2));
}

inspect();
