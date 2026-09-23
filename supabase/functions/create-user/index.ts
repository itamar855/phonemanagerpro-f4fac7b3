import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODULES = [
  "dashboard", "vendas", "leads", "estoque", "os", "clientes",
  "transacoes", "relatorios", "lojas", "equipe", "contas",
  "caixa", "gerenciar_financeiro", "auditoria", "configuracoes", "ia"
];

const defaultPermissions = (role: string) => {
  if (role === "admin") {
    return Object.fromEntries(MODULES.map((m) => [m, true]));
  }
  return Object.fromEntries(MODULES.map((m) => [m, ["vendas", "os", "clientes", "caixa"].includes(m)]));
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

    // Verify the caller is admin or gerente with equipe permission
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
    if (!isAuthorized) throw new Error("Apenas administradores podem criar usuários");

    const { email, password, display_name, phone, role, store_id } = await req.json();

    if (!email || !password) {
      throw new Error("E-mail e senha são obrigatórios");
    }

    // Check if user already exists in auth.users
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existing = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.trim().toLowerCase()
    );

    let userId: string;

    if (existing) {
      // User already exists in auth: update password, unban if needed, and confirm email
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: { display_name: display_name || existing.user_metadata?.display_name || email },
        ban_duration: "none",
      });
      if (updateError) throw updateError;
      userId = existing.id;
    } else {
      // Create brand new user in auth
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: { display_name: display_name || email },
      });
      if (createError) throw createError;
      userId = newUser.user.id;
    }

    // Ensure profiles row exists and is up to date (upsert on user_id)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        user_id: userId,
        display_name: display_name || email,
        phone: phone || null,
        store_id: store_id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (profileError) {
      console.error("Error upserting profile:", profileError);
    }

    // Assign role and default permissions: clean previous roles and insert
    const selectedRole = role || "vendedor";
    const userPermissions = defaultPermissions(selectedRole);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userId,
        role: selectedRole,
        permissions: userPermissions,
      });

    if (roleError) {
      console.error("Error inserting user_roles:", roleError);
    }

    // Assign store in member_stores if provided
    if (store_id) {
      const { data: existingStore } = await supabaseAdmin
        .from("member_stores")
        .select("id")
        .eq("user_id", userId)
        .eq("store_id", store_id)
        .maybeSingle();

      if (!existingStore) {
        await supabaseAdmin
          .from("member_stores")
          .insert({ user_id: userId, store_id });
      }
    }

    return new Response(JSON.stringify({ success: true, userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Erro desconhecido ao criar usuário" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
