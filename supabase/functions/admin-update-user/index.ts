import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  validateCallerAuthority,
  validateRoleUpdate,
  validateStoreScope,
  validateCommissions,
  validatePermissions,
  corsHeaders,
  AppRole,
} from "../_shared/auth-rules.ts";

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

  let supabaseAdmin: any = null;

  try {
    supabaseAdmin = createClient(
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

    // 2. Consultar role, permissions e stores do chamador no banco (server-side)
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

    // 3. Validação de autoridade do chamador
    const authCheck = validateCallerAuthority(callerRole, callerPermissions);
    if (!authCheck.allowed) {
      return new Response(JSON.stringify({ error: authCheck.reason }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      target_user_id,
      role: newRole,
      permissions: newPermissions,
      store_ids: newStoreIds,
      phone,
      display_name,
      commission_sales_percent,
      commission_services_percent,
      commission_on_sales,
      commission_on_services,
      justification,
    } = body;

    if (!target_user_id) {
      return new Response(JSON.stringify({ error: "ID do usuário-alvo é obrigatório." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Carregar estado ATUAL do usuário-alvo no banco
    const [targetRoleRes, targetProfileRes, targetStoresRes] = await Promise.all([
      supabaseAdmin
        .from("user_roles")
        .select("*")
        .eq("user_id", target_user_id)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("user_id", target_user_id)
        .maybeSingle(),
      supabaseAdmin
        .from("member_stores")
        .select("store_id")
        .eq("user_id", target_user_id),
    ]);

    const targetCurrentRole = targetRoleRes.data?.role || "vendedor";
    const targetCurrentStoreIds: string[] = (targetStoresRes.data || []).map((s: any) => s.store_id);

    // 5. Validação de alteração de cargo (se informada)
    if (newRole) {
      const roleUpdateCheck = validateRoleUpdate(
        callerRole,
        callerPermissions,
        targetCurrentRole,
        newRole
      );
      if (!roleUpdateCheck.allowed) {
        return new Response(JSON.stringify({ error: roleUpdateCheck.reason }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 6. Validação de escopo de loja (Item 1 e Item 3)
    const storeScopeCheck = validateStoreScope(
      callerStoreIds,
      targetCurrentStoreIds,
      newStoreIds
    );
    if (!storeScopeCheck.allowed) {
      return new Response(JSON.stringify({ error: storeScopeCheck.reason }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Validação de dados financeiros e permissões (Item 6)
    const commCheck = validateCommissions(
      commission_sales_percent,
      commission_services_percent,
      commission_on_sales,
      commission_on_services
    );
    if (!commCheck.allowed) {
      return new Response(JSON.stringify({ error: commCheck.reason }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const permCheck = validatePermissions(newPermissions);
    if (!permCheck.allowed) {
      return new Response(JSON.stringify({ error: permCheck.reason }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Snapshot para Rollback Compensatório (Item 4)
    const snapshotBefore = {
      roleData: targetRoleRes.data ? { ...targetRoleRes.data } : null,
      profileData: targetProfileRes.data ? { ...targetProfileRes.data } : null,
      storeIds: [...targetCurrentStoreIds],
    };

    let stepCompleted = 0;
    let roleTouched = false;
    let storesTouched = false;
    let profileTouched = false;

    try {
      // Passo 1: Atualizar / Inserir user_roles
      const finalRole = newRole || targetCurrentRole;
      const rolePayload: any = {
        user_id: target_user_id,
        role: finalRole as AppRole,
      };

      if (newPermissions !== undefined) rolePayload.permissions = newPermissions;
      if (commission_sales_percent !== undefined) rolePayload.commission_sales_percent = commission_sales_percent;
      if (commission_services_percent !== undefined) rolePayload.commission_services_percent = commission_services_percent;
      if (commission_on_sales !== undefined) rolePayload.commission_on_sales = commission_on_sales;
      if (commission_on_services !== undefined) rolePayload.commission_on_services = commission_on_services;

      if (targetRoleRes.data) {
        const { error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .update(rolePayload)
          .eq("user_id", target_user_id);
        if (roleErr) throw new Error(`Falha ao atualizar cargo/permissões: ${roleErr.message}`);
      } else {
        const { error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .insert(rolePayload);
        if (roleErr) throw new Error(`Falha ao atribuir cargo/permissões: ${roleErr.message}`);
      }
      roleTouched = true;
      stepCompleted = 1;

      // Passo 2: Sincronizar member_stores (se lista de lojas foi informada)
      // Executado ANTES do profile para que a membership de destino já exista quando o trigger validar
      if (Array.isArray(newStoreIds)) {
        const { error: delStoreErr } = await supabaseAdmin
          .from("member_stores")
          .delete()
          .eq("user_id", target_user_id);
        if (delStoreErr) throw new Error(`Falha ao limpar vínculos anteriores de lojas: ${delStoreErr.message}`);

        // Flag de mutação ativado imediatamente após o DELETE das memberships anteriores
        storesTouched = true;

        if (newStoreIds.length > 0) {
          const insertData = newStoreIds.map((sid: string) => ({
            user_id: target_user_id,
            store_id: sid,
          }));
          const { error: insStoreErr } = await supabaseAdmin
            .from("member_stores")
            .insert(insertData);
          if (insStoreErr) throw new Error(`Falha ao inserir novas lojas: ${insStoreErr.message}`);
        }
      }
      stepCompleted = 2;

      // Passo 3: Atualizar profiles (membership já garantida no Passo 2)
      const profileUpdates: any = {
        updated_at: new Date().toISOString(),
      };
      if (phone !== undefined) profileUpdates.phone = phone || null;
      if (display_name !== undefined) profileUpdates.display_name = display_name;
      if (Array.isArray(newStoreIds)) {
        profileUpdates.store_id = newStoreIds.length > 0 ? newStoreIds[0] : null;
      }

      const { error: profErr } = await supabaseAdmin
        .from("profiles")
        .update(profileUpdates)
        .eq("user_id", target_user_id);
      if (profErr) throw new Error(`Falha ao atualizar perfil: ${profErr.message}`);
      profileTouched = true;
      stepCompleted = 3;

      // Passo 4: Registro de auditoria server-side (sem registrar senhas ou dados sensíveis - Item 8)
      try {
        await supabaseAdmin.from("audit_logs").insert({
          user_id: caller.id,
          store_id: callerStoreIds[0] || null,
          action: "UPDATE_RECORD",
          entity_type: "user_roles",
          entity_id: target_user_id,
          before_state: {
            role: snapshotBefore.roleData?.role,
            storeIds: snapshotBefore.storeIds,
          },
          after_state: {
            role: finalRole,
            storeIds: newStoreIds || snapshotBefore.storeIds,
            justification: justification || "Edição de membro de equipe",
          },
        });
      } catch (auditErr: any) {
        console.warn("Aviso: Falha ao registrar log de auditoria:", auditErr.message);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Membro atualizado com sucesso." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (stepError: any) {
      // Rollback Compensatório (Item 4)
      const rollbackErrors: string[] = [];
      console.error(`Erro na etapa ${stepCompleted + 1} de admin-update-user. Executando rollback compensatório.`);

      // Rollback Compensatório com Ordem Segura de Integridade (Item 4)
      if (storesTouched || profileTouched) {
        try {
          // 1. Garantir/reinserir as memberships antigas necessárias sem apagar primeiro as memberships atuais
          if (snapshotBefore.storeIds.length > 0) {
            const { data: currentStores, error: getCurStoreErr } = await supabaseAdmin
              .from("member_stores")
              .select("store_id")
              .eq("user_id", target_user_id);

            if (getCurStoreErr) {
              rollbackErrors.push(`Falha ao consultar member_stores no rollback: ${getCurStoreErr.message}`);
              console.error("Falha ao consultar member_stores no rollback:", getCurStoreErr.message);
            }

            const currentStoreSet = new Set((currentStores || []).map((s: any) => s.store_id));
            const missingStoreIds = snapshotBefore.storeIds.filter((sid) => !currentStoreSet.has(sid));

            if (missingStoreIds.length > 0) {
              const { error: rbInsStoreErr } = await supabaseAdmin
                .from("member_stores")
                .insert(missingStoreIds.map((sid) => ({ user_id: target_user_id, store_id: sid })));
              if (rbInsStoreErr) {
                rollbackErrors.push(`Falha ao reinserir memberships anteriores no rollback: ${rbInsStoreErr.message}`);
                console.error("Falha ao reinserir memberships anteriores no rollback:", rbInsStoreErr.message);
              }
            }
          }

          // 2. Restaurar profiles, incluindo phone, display_name e store_id original
          // (Para snapshot com zero memberships, restaura store_id = NULL antes de remover os vínculos)
          let profileRestoreSucceeded = !snapshotBefore.profileData;
          if (snapshotBefore.profileData) {
            const { error: rbProfErr } = await supabaseAdmin
              .from("profiles")
              .update({
                phone: snapshotBefore.profileData.phone ?? null,
                display_name: snapshotBefore.profileData.display_name,
                store_id: snapshotBefore.profileData.store_id ?? null,
              })
              .eq("user_id", target_user_id);

            if (rbProfErr) {
              rollbackErrors.push(`Falha ao reverter profiles no rollback: ${rbProfErr.message}`);
              console.error("Falha ao reverter profiles no rollback:", rbProfErr.message);
            } else {
              profileRestoreSucceeded = true;
            }
          }

          // 3. Somente depois remover memberships que não pertenciam ao snapshot anterior
          // A limpeza das memberships excedentes ocorre SOMENTE se a restauração do profile teve sucesso
          if (profileRestoreSucceeded) {
            if (snapshotBefore.storeIds.length > 0) {
              const { data: storesAfterProf, error: getAfterProfErr } = await supabaseAdmin
                .from("member_stores")
                .select("store_id")
                .eq("user_id", target_user_id);

              if (getAfterProfErr) {
                rollbackErrors.push(`Falha ao consultar member_stores para limpeza no rollback: ${getAfterProfErr.message}`);
                console.error("Falha ao consultar member_stores para limpeza no rollback:", getAfterProfErr.message);
              }

              const extraStores = (storesAfterProf || [])
                .map((s: any) => s.store_id)
                .filter((sid: string) => !snapshotBefore.storeIds.includes(sid));

              if (extraStores.length > 0) {
                const { error: delExtraErr } = await supabaseAdmin
                  .from("member_stores")
                  .delete()
                  .eq("user_id", target_user_id)
                  .in("store_id", extraStores);

                if (delExtraErr) {
                  rollbackErrors.push(`Falha ao remover memberships excedentes no rollback: ${delExtraErr.message}`);
                  console.error("Falha ao remover memberships excedentes no rollback:", delExtraErr.message);
                }
              }
            } else {
              // Snapshot com zero memberships: remove todos os vínculos apenas após confirmar que profile.store_id já é NULL
              const { error: delAllStoreErr } = await supabaseAdmin
                .from("member_stores")
                .delete()
                .eq("user_id", target_user_id);

              if (delAllStoreErr) {
                rollbackErrors.push(`Falha ao remover todos os vínculos de member_stores no rollback: ${delAllStoreErr.message}`);
                console.error("Falha ao remover todos os vínculos de member_stores no rollback:", delAllStoreErr.message);
              }
            }
          } else {
            console.warn(
              `[ROLLBACK_GUARD] Limpeza de member_stores abortada porque a restauração de profiles falhou. Preservando memberships atuais para evitar órfão.`
            );
          }
        } catch (rbStoreProfErr: any) {
          rollbackErrors.push(`Exceção ao reverter member_stores e profiles no rollback compensatório: ${rbStoreProfErr.message}`);
          console.error("Exceção ao reverter member_stores e profiles no rollback compensatório:", rbStoreProfErr.message);
        }
      }

      // 4. Reverter user_roles se roleTouched estiver ativo
      if (roleTouched) {
        try {
          if (snapshotBefore.roleData) {
            const { error: rbRoleErr } = await supabaseAdmin
              .from("user_roles")
              .update(snapshotBefore.roleData)
              .eq("user_id", target_user_id);
            if (rbRoleErr) {
              rollbackErrors.push(`Falha ao restaurar user_roles no rollback: ${rbRoleErr.message}`);
              console.error("Falha ao restaurar user_roles no rollback:", rbRoleErr.message);
            }
          } else {
            const { error: rbRoleDelErr } = await supabaseAdmin
              .from("user_roles")
              .delete()
              .eq("user_id", target_user_id);
            if (rbRoleDelErr) {
              rollbackErrors.push(`Falha ao deletar user_roles no rollback: ${rbRoleDelErr.message}`);
              console.error("Falha ao deletar user_roles no rollback:", rbRoleDelErr.message);
            }
          }
        } catch (rbRoleErr: any) {
          rollbackErrors.push(`Exceção ao reverter user_roles no rollback compensatório: ${rbRoleErr.message}`);
          console.error("Exceção ao reverter user_roles no rollback compensatório:", rbRoleErr.message);
        }
      }

      if (rollbackErrors.length > 0) {
        console.error(`[CRITICAL_ROLLBACK_FAILURE] Falhas no rollback compensatório de admin-update-user (${rollbackErrors.length}):`, rollbackErrors);
        return new Response(
          JSON.stringify({
            error: stepError.message || "Falha na atualização do usuário.",
            critical_rollback_failure: true,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      throw stepError;
    }
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Erro desconhecido ao atualizar usuário." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
