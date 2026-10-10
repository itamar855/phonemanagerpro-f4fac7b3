import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  validateCallerAuthority,
  validateRoleCreation,
  validateStoreScope,
  corsHeaders,
} from "../_shared/auth-rules.ts";

const MODULES = [
  "dashboard", "vendas", "leads", "estoque", "os", "clientes",
  "transacoes", "relatorios", "lojas", "equipe", "contas",
  "caixa", "gerenciar_financeiro", "auditoria", "configuracoes", "ia"
];

const defaultPermissions = (role: string) => {
  if (role === "admin") {
    return Object.fromEntries(MODULES.map((m) => [m, true]));
  }
  if (role === "tecnico") {
    return Object.fromEntries(MODULES.map((m) => [m, ["os", "clientes", "dashboard"].includes(m)]));
  }
  return Object.fromEntries(MODULES.map((m) => [m, ["vendas", "os", "clientes", "caixa"].includes(m)]));
};

function getServiceRoleKey(): string {
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysRaw) {
    try {
      const parsed = JSON.parse(secretKeysRaw);
      const defaultKey = parsed?.["default"];
      if (typeof defaultKey === "string" && defaultKey.startsWith("sb_secret_")) {
        return defaultKey;
      }
    } catch {
      // Ignora falha de parse e tenta fallback legacy
    }
  }

  // Fallback transitório para chave legacy (ativo somente enquanto a legacy ainda estiver ativa)
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) {
    return legacyKey;
  }

  throw new Error("Credencial service_role não encontrada em SUPABASE_SECRET_KEYS['default'] nem SUPABASE_SERVICE_ROLE_KEY.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let createdNewAuthUserId: string | null = null;
  let supabaseAdmin: any = null;
  let userId: string | null = null;

  let existingSnapshot: {
    roleData: any;
    profileData: any;
  } | null = null;

  let createdStoreMembership = false;
  let roleTouched = false;
  let modifiedProfile = false;

  let rollbackStoreId: string | null = null;

  try {
    supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getServiceRoleKey(),
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Autenticar o chamador via token Bearer (server-side)
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

    // 2. Consultar role, permissions e stores do chamador no banco (server-side exclusivo)
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

    // 3. Validação de autoridade geral
    const authCheck = validateCallerAuthority(callerRole, callerPermissions);
    if (!authCheck.allowed) {
      return new Response(JSON.stringify({ error: authCheck.reason }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, display_name, phone, role, store_id } = await req.json();
    rollbackStoreId = store_id ?? null;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "E-mail e senha são obrigatórios." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof password !== "string" || password.length < 6) {
      return new Response(JSON.stringify({ error: "A senha deve ter no mínimo 6 caracteres." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const selectedRole = role || "vendedor";

    // 4. Validação de criação do cargo (impede dono e restringe gerente a vendedor/tecnico)
    const roleCheck = validateRoleCreation(callerRole, callerPermissions, selectedRole);
    if (!roleCheck.allowed) {
      return new Response(JSON.stringify({ error: roleCheck.reason }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Validação de escopo de loja (chamador deve ter acesso à loja solicitada)
    const requestedStores = store_id ? [store_id] : [];
    const storeCheck = validateStoreScope(callerStoreIds, [], requestedStores);
    if (!storeCheck.allowed) {
      return new Response(JSON.stringify({ error: storeCheck.reason }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Verificar se usuário já existe em auth.users
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existing = existingUsers?.users?.find(
      (u: any) => u.email?.toLowerCase() === email.trim().toLowerCase()
    );

    if (existing) {
      // Usuário existente: capturar snapshot prévio para rollback se passos posteriores falharem
      const [roleSnap, profSnap] = await Promise.all([
        supabaseAdmin.from("user_roles").select("*").eq("user_id", existing.id).maybeSingle(),
        supabaseAdmin.from("profiles").select("*").eq("user_id", existing.id).maybeSingle(),
      ]);

      if (roleSnap.error) {
        throw new Error(`Falha ao capturar snapshot de cargo de usuário existente: ${roleSnap.error.message}`);
      }
      if (profSnap.error) {
        throw new Error(`Falha ao capturar snapshot de perfil de usuário existente: ${profSnap.error.message}`);
      }

      existingSnapshot = {
        roleData: roleSnap.data || null,
        profileData: profSnap.data || null,
      };

      userId = existing.id;
    } else {
      // Criação de novo usuário no Auth
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: { display_name: display_name || email },
      });
      if (createError) throw createError;
      userId = newUser.user.id;
      createdNewAuthUserId = userId; // Registrado para cleanup compensatório se passos posteriores falharem
    }

    // 7. Sincronizar member_stores se loja for informada
    // Executado ANTES de salvar profiles.store_id para satisfazer o trigger de invariante da Fase 0B
    if (store_id) {
      const { data: existingStore, error: storeCheckError } = await supabaseAdmin
        .from("member_stores")
        .select("id")
        .eq("user_id", userId)
        .eq("store_id", store_id)
        .maybeSingle();

      if (storeCheckError) {
        throw new Error(`Falha ao verificar vínculo de loja do usuário: ${storeCheckError.message}`);
      }

      if (!existingStore) {
        const { error: storeInsertError } = await supabaseAdmin
          .from("member_stores")
          .insert({ user_id: userId, store_id });
        if (storeInsertError) {
          throw new Error(`Falha ao vincular usuário à loja: ${storeInsertError.message}`);
        }
        createdStoreMembership = true;
      }
    }

    // 8. Atribuir cargo e permissões padrão
    const userPermissions = defaultPermissions(selectedRole);

    const { error: deleteRoleError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);

    if (deleteRoleError) {
      throw new Error(`Falha ao limpar cargo anterior do usuário: ${deleteRoleError.message}`);
    }
    roleTouched = true;

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userId,
        role: selectedRole,
        permissions: userPermissions,
      });

    if (roleError) {
      throw new Error(`Falha ao atribuir cargo do usuário: ${roleError.message}`);
    }

    // 9. Upsert em profiles (com membership em member_stores já garantida no Passo 7)
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
      throw new Error(`Falha ao salvar perfil do usuário: ${profileError.message}`);
    }
    modifiedProfile = true;

    // 10. Atualização de senha e credenciais no Auth para usuário existente
    // Executado SOMENTE após todas as mutações reversíveis do banco concluírem com êxito
    if (existing) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: { display_name: display_name || existing.user_metadata?.display_name || email },
        ban_duration: "none",
      });
      if (updateError) {
        throw new Error(`Falha ao atualizar credenciais do usuário no Auth: ${updateError.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    const rollbackErrors: string[] = [];

    // Cleanup compensatório:
    if (createdNewAuthUserId && supabaseAdmin) {
      // Cenário A: Novo usuário Auth criado -> exclusão do usuário Auth cascateia para todas as tabelas
      try {
        console.warn(`Executando cleanup compensatório para auth user recém-criado ${createdNewAuthUserId}`);
        const { error: deleteUserErr } = await supabaseAdmin.auth.admin.deleteUser(createdNewAuthUserId);
        if (deleteUserErr) {
          rollbackErrors.push(`Falha ao deletar auth user recém-criado: ${deleteUserErr.message}`);
          console.error("Falha no cleanup compensatório de create-user (novo usuário):", deleteUserErr.message);
        }
      } catch (cleanupErr: any) {
        rollbackErrors.push(`Exceção ao deletar auth user recém-criado: ${cleanupErr.message}`);
        console.error("Falha no cleanup compensatório de create-user (novo usuário):", cleanupErr.message);
      }
    } else if (existingSnapshot && supabaseAdmin && userId) {
      // Cenário B: Usuário pré-existente -> reverter cirurgicamente apenas as mutações feitas nesta requisição
      console.warn(`Executando rollback compensatório para usuário pré-existente ${userId}`);

      let profileRollbackSafeForMembershipCleanup = !modifiedProfile;

      // 1. Reverter profiles se foi alterado (PRIMEIRO: para restaurar store_id anterior antes de remover qualquer loja)
      if (modifiedProfile && userId) {
        try {
          if (existingSnapshot.profileData) {
            const { error: upsertProfErr } = await supabaseAdmin
              .from("profiles")
              .upsert(existingSnapshot.profileData, { onConflict: "user_id" });
            if (upsertProfErr) {
              rollbackErrors.push(`Falha ao restaurar profile no rollback: ${upsertProfErr.message}`);
              console.error("Falha ao restaurar profile no rollback:", upsertProfErr.message);
            } else {
              profileRollbackSafeForMembershipCleanup = true;
            }
          } else {
            const { error: delProfErr } = await supabaseAdmin
              .from("profiles")
              .delete()
              .eq("user_id", userId);
            if (delProfErr) {
              rollbackErrors.push(`Falha ao deletar profile no rollback: ${delProfErr.message}`);
              console.error("Falha ao deletar profile no rollback:", delProfErr.message);
            } else {
              profileRollbackSafeForMembershipCleanup = true;
            }
          }
        } catch (e: any) {
          rollbackErrors.push(`Exceção ao reverter profile no rollback: ${e.message}`);
          console.error("Exceção ao reverter profile no rollback:", e.message);
        }
      }

      // 2. Reverter user_roles se foi alterado/tocado
      if (roleTouched && userId) {
        try {
          const { error: delRoleErr } = await supabaseAdmin
            .from("user_roles")
            .delete()
            .eq("user_id", userId);
          if (delRoleErr) {
            rollbackErrors.push(`Falha ao limpar user_roles no rollback: ${delRoleErr.message}`);
            console.error("Falha ao limpar user_roles no rollback:", delRoleErr.message);
          }
          if (existingSnapshot.roleData) {
            const { error: insRoleErr } = await supabaseAdmin
              .from("user_roles")
              .insert(existingSnapshot.roleData);
            if (insRoleErr) {
              rollbackErrors.push(`Falha ao restaurar user_roles no rollback: ${insRoleErr.message}`);
              console.error("Falha ao restaurar user_roles no rollback:", insRoleErr.message);
            }
          }
        } catch (e: any) {
          rollbackErrors.push(`Exceção ao reverter user_roles no rollback: ${e.message}`);
          console.error("Exceção ao reverter user_roles no rollback:", e.message);
        }
      }

      // 3. Remover vínculo de member_stores se foi criado nesta execução (POR ÚLTIMO)
      // Executado SOMENTE se profileRollbackSafeForMembershipCleanup for verdadeiro
      if (createdStoreMembership && userId && rollbackStoreId && profileRollbackSafeForMembershipCleanup) {
        try {
          const { error: delStoreErr } = await supabaseAdmin
            .from("member_stores")
            .delete()
            .eq("user_id", userId)
            .eq("store_id", rollbackStoreId);
          if (delStoreErr) {
            rollbackErrors.push(`Falha ao remover member_stores no rollback: ${delStoreErr.message}`);
            console.error("Falha ao remover vínculo de member_stores no rollback:", delStoreErr.message);
          }
        } catch (e: any) {
          rollbackErrors.push(`Exceção ao remover vínculo de member_stores: ${e.message}`);
          console.error("Exceção ao remover vínculo de member_stores no rollback:", e.message);
        }
      } else if (createdStoreMembership && !profileRollbackSafeForMembershipCleanup) {
        console.warn(
          `[ROLLBACK_GUARD] Membership criada ${rollbackStoreId} preservada para evitar órfão em profiles.store_id pois o rollback de profile falhou.`
        );
      }
    }

    if (rollbackErrors.length > 0) {
      console.error(`[CRITICAL_ROLLBACK_FAILURE] Falhas no rollback compensatório de create-user (${rollbackErrors.length}):`, rollbackErrors);
      return new Response(
        JSON.stringify({
          error: error.message || "Erro desconhecido ao criar usuário.",
          critical_rollback_failure: true,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ error: error.message || "Erro desconhecido ao criar usuário." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
