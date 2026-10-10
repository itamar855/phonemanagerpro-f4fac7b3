import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://hzrqtolfbwnmmeliazmh.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error("ERRO: SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente.");
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Wait, let's find the service role key from the supabase directory if possible.
