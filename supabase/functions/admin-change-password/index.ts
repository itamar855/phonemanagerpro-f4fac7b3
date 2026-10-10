import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  validateCallerAuthority,
  validatePasswordReset,
  validateStoreScope,
  corsHeaders,
} from "../_shared/auth-rules.ts";

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getServiceRoleKey(),
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Autenticar chamador via token Bearer (server-side)
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Cabeçalho de autorização ausente." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user: caller }, error: callerAuthError } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (callerAuthError || !caller) {
      return new Response(JSON.stringify({ error: "Sessão inválida ou expirada." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Consultar role, permissions e stores do chamador (server-side)
    const [callerRoleRes, callerStoresRes] = await Promise.all([
      supabaseAdmin
        .from("user_roles")
        .select("role, permissions")
        .eq("user_id", caller.id)
        .maybeSingle(),
      supabaseAdmin
        .from("member_stores")
        .select("store_id")
        .eq("user_id", caller.id),
    ]);

    const callerRole = callerRoleRes.data?.role || "";
    const callerPermissions = callerRoleRes.data?.permissions || {};
    const callerStoreIds: string[] = (callerStoresRes.data || []).map((s: any) => s.store_id);

    const authCheck = validateCallerAuthority(callerRole, callerPermissions);
    if (!authCheck.allowed) {
      return new Response(JSON.stringify({ error: authCheck.reason }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, new_password } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "ID do usuário é obrigatório." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!new_password || typeof new_password !== "string" || new_password.trim().length < 6) {
      return new Response(JSON.stringify({ error: "A nova senha deve ter no mínimo 6 caracteres." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Consultar cargo e lojas do usuário-alvo
    const [targetRoleRes, targetStoresRes] = await Promise.all([
      supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user_id)
        .maybeSingle(),
      supabaseAdmin
        .from("member_stores")
        .select("store_id")
        .eq("user_id", user_id),
    ]);

    const targetRole = targetRoleRes.data?.role || "vendedor";
    const targetCurrentStoreIds: string[] = (targetStoresRes.data || []).map((s: any) => s.store_id);

    // 4. Validação de hierarquia (impede resetar senha de dono e restringe gerente a vendedor/tecnico)
    const resetCheck = validatePasswordReset(callerRole, callerPermissions, caller.id, user_id, targetRole);
    if (!resetCheck.allowed) {
      return new Response(JSON.stringify({ error: resetCheck.reason }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Validação de escopo de loja (alvo não pode possuir lojas fora do alcance do chamador)
    const storeScopeCheck = validateStoreScope(callerStoreIds, targetCurrentStoreIds);
    if (!storeScopeCheck.allowed) {
      return new Response(JSON.stringify({ error: storeScopeCheck.reason }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: new_password.trim(),
    });

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Senha atualizada com sucesso pelo administrador." 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Erro desconhecido ao alterar senha." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
