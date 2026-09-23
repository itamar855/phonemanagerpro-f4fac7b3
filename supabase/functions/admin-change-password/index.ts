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

    // Verify caller is admin
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
    if (!isAuthorized) throw new Error("Apenas administradores podem redefinir a senha de outros membros");

    const { user_id, new_password } = await req.json();

    if (!user_id) throw new Error("ID do usuário é obrigatório");
    if (!new_password || typeof new_password !== "string" || new_password.trim().length < 6) {
      throw new Error("A nova senha deve ter no mínimo 6 caracteres");
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
    return new Response(JSON.stringify({ error: error.message || "Erro desconhecido ao alterar senha" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
