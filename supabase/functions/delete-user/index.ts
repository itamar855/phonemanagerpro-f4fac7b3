import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is admin or authorized gerente
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Não autorizado");

    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (!caller) throw new Error("Não autorizado");

    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role, permissions")
      .eq("user_id", caller.id)
      .maybeSingle();

    const isAuthorized = callerRole?.role === "admin" || (callerRole?.role === "gerente" && (callerRole?.permissions as any)?.equipe);
    if (!isAuthorized) throw new Error("Apenas administradores podem excluir membros");

    const { user_id, reason } = await req.json();

    if (!user_id) throw new Error("ID do usuário é obrigatório");
    if (user_id === caller.id) throw new Error("Você não pode excluir sua própria conta de administrador");

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
