import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getServiceRoleKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const key = parsed?.["default"];
      if (typeof key === "string" && key.startsWith("sb_secret_")) {
        return key;
      }
    } catch {}
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase privileged credential unavailable.");
}

Deno.serve(async (req) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] EXTREME_DEBUG: Função iniciada. Método: ${req.method}`);

  if (req.method === "OPTIONS") {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = getServiceRoleKey();
    
    console.log(`[${requestId}] DEBUG: SUPABASE_URL existe? ${!!url}`);
    console.log(`[${requestId}] DEBUG: SERVICE_KEY obtida? ${!!key}`);

    if (!url) {
        throw new Error("Variáveis de ambiente do Supabase não configuradas no servidor.");
    }

    const supabaseAdmin = createClient(url, key, { 
        auth: { autoRefreshToken: false, persistSession: false } 
    });

    // 1. Auth check
    const authHeader = req.headers.get("authorization");
    console.log(`[${requestId}] DEBUG: Auth Header presente? ${!!authHeader}`);

    if (!authHeader) throw new Error("Cabeçalho Authorization ausente.");

    const token = authHeader.replace("Bearer ", "");
    console.log(`[${requestId}] DEBUG: Verificando token JWT...`);
    
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError) {
        console.error(`[${requestId}] ERROR: Auth failed:`, authError);
        return new Response(`ERRO_AUTENTICACAO: ${authError.message}`, { status: 401, headers: corsHeaders });
    }

    if (!user) {
        console.error(`[${requestId}] ERROR: No user found for token.`);
        return new Response("ERRO_AUTENTICACAO: Usuário não encontrado no token.", { status: 401, headers: corsHeaders });
    }

    console.log(`[${requestId}] DEBUG: Usuário validado: ${user.email}`);

    // 2. Admin Check
    console.log(`[${requestId}] DEBUG: Verificando role de admin...`);
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleError) {
        console.error(`[${requestId}] ERROR: Role query failed:`, roleError);
        return new Response(`ERRO_PERMISSAO: Falha ao consultar banco: ${roleError.message}`, { status: 500, headers: corsHeaders });
    }

    if (roleData?.role !== "admin") {
        console.warn(`[${requestId}] WARN: Tentativa de acesso não-admin por ${user.email}`);
        return new Response("ERRO_PERMISSAO: Apenas administradores podem exportar.", { status: 403, headers: corsHeaders });
    }

    console.log(`[${requestId}] DEBUG: Admin confirmado. Iniciando exportação SQL...`);

    // 3. SQL generation
    let sql = `-- Backup Deep Debug [${requestId}]\n-- Exportado por: ${user.email}\n-- Data: ${new Date().toISOString()}\n\n`;
    sql += "BEGIN;\n";

    const TABLES = ["profiles", "user_roles", "stores", "products", "customers", "sales", "service_orders"];
    
    for (const table of TABLES) {
        console.log(`[${requestId}] DEBUG: Extraindo tabela ${table}...`);
        const { data: rows, error: dErr } = await supabaseAdmin.from(table).select("*").limit(100);
        
        if (dErr) {
            console.error(`[${requestId}] ERROR: Falha na tabela ${table}:`, dErr);
            sql += `-- Erro na tabela ${table}: ${dErr.message}\n`;
            continue;
        }

        if (rows && rows.length > 0) {
            const cols = Object.keys(rows[0]);
            sql += `INSERT INTO public.${table} (${cols.join(", ")}) VALUES\n`;
            const rowStrings = rows.map(r => {
                const vals = cols.map(c => {
                    const v = r[c];
                    if (v === null) return "NULL";
                    if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
                    return `'${String(v).replace(/'/g, "''")}'`;
                });
                return `(${vals.join(", ")})`;
            });
            sql += rowStrings.join(",\n") + ";\n\n";
        } else {
            sql += `-- Tabela ${table} está vazia.\n\n`;
        }
    }

    sql += "COMMIT;\n";
    console.log(`[${requestId}] SUCCESS: Backup gerado com sucesso.`);

    return new Response(sql, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/sql",
        "Content-Disposition": `attachment; filename="debug_backup_${requestId}.sql"`,
      },
    });

  } catch (err: any) {
    console.error(`[${requestId}] CRITICAL:`, err);
    return new Response(`ERRO_CRITICO: ${err.message || String(err)}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
