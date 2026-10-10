import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  validateCallerAuthority,
  validateUserDeletion,
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

    const { user_id, reason } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "ID do usuário é obrigatório." }), {
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

    // 4. Validação de hierarquia e autoproteção (impede excluir dono e impede autoexclusão)
    const deletionCheck = validateUserDeletion(callerRole, callerPermissions, caller.id, user_id, targetRole);
    if (!deletionCheck.allowed) {
      return new Response(JSON.stringify({ error: deletionCheck.reason }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Validação de escopo de loja (Item 1 e 3: alvo não pode ter lojas fora do chamador)
    const storeScopeCheck = validateStoreScope(callerStoreIds, targetCurrentStoreIds);
    if (!storeScopeCheck.allowed) {
      return new Response(JSON.stringify({ error: storeScopeCheck.reason }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Remove user roles and store assignments
    await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
    await supabaseAdmin.from("member_stores").delete().eq("user_id", user_id);

    // 2. Check if user has dependent historical records (sales, service orders, transactions, cash registers)
    const [salesCreatedRes, salesSellerRes, osCreatedRes, osTechRes, txRes, cashOpenedRes, cashClosedRes] = await Promise.all([
      supabaseAdmin.from("sales").select("id", { count: "exact", head: true }).eq("created_by", user_id),
      supabaseAdmin.from("sales").select("id", { count: "exact", head: true }).eq("seller_id", user_id),
      supabaseAdmin.from("service_orders").select("id", { count: "exact", head: true }).eq("created_by", user_id),
      supabaseAdmin.from("service_orders").select("id", { count: "exact", head: true }).eq("technician_id", user_id),
      supabaseAdmin.from("transactions").select("id", { count: "exact", head: true }).eq("created_by", user_id),
      supabaseAdmin.from("cash_registers").select("id", { count: "exact", head: true }).eq("opened_by", user_id),
      supabaseAdmin.from("cash_registers").select("id", { count: "exact", head: true }).eq("closed_by", user_id),
    ]);

    const totalHistoricalRecords = 
      (salesCreatedRes.count || 0) + 
      (salesSellerRes.count || 0) + 
      (osCreatedRes.count || 0) + 
      (osTechRes.count || 0) + 
      (txRes.count || 0) + 
      (cashOpenedRes.count || 0) + 
      (cashClosedRes.count || 0);

    if (totalHistoricalRecords > 0) {
      // User has historical sales/OS records:
      // Ban/deactivate user in Auth so they can never log in again
      await supabaseAdmin.auth.admin.updateUserById(user_id, {
        ban_duration: "876000h", // ~100 years
      });

      // Try deleting from profiles to clean up the active team view
      const { error: profileDeleteErr } = await supabaseAdmin.from("profiles").delete().eq("user_id", user_id);
      if (profileDeleteErr) {
        // If foreign key restricts deleting profiles, clear store_id and phone
        await supabaseAdmin.from("profiles").update({
          store_id: null,
          phone: null,
        }).eq("user_id", user_id);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Membro desvinculado e desativado com sucesso (histórico de vendas e OS preservado)." 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // User has no historical records: Completely remove from profiles and auth.users
      await supabaseAdmin.from("profiles").delete().eq("user_id", user_id);
      const { error: authDeleteErr } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (authDeleteErr) {
        console.error("Auth delete error:", authDeleteErr);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Membro excluído com sucesso do sistema." 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Erro desconhecido ao excluir usuário" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
