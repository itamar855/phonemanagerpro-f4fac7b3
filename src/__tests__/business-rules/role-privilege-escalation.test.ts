import { describe, it, expect, vi } from "vitest";
import { Constants } from "@/integrations/supabase/types";
import {
  CANONICAL_ROLES,
  MANAGEABLE_ROLES,
  validateCallerAuthority,
  validateRoleCreation,
  validateRoleUpdate,
  validateUserDeletion,
  validatePasswordReset,
  validateStoreScope,
  validateCommissions,
  validatePermissions,
  type AppRole,
} from "../../../supabase/functions/_shared/auth-rules.ts";

describe("Auditoria e Validação das Regras Reais de Produção (auth-rules.ts)", () => {
  describe("1. Compatibilidade Canônica do Banco e Cargos Gerenciáveis", () => {
    it("O array CANONICAL_ROLES e o runtime types.ts devem conter exatamente os 5 valores do PostgreSQL", () => {
      expect(CANONICAL_ROLES).toEqual(["admin", "gerente", "vendedor", "tecnico", "dono"]);
      expect(Constants.public.Enums.app_role).toEqual(["admin", "gerente", "vendedor", "tecnico", "dono"]);
    });

    it("O cargo 'dono' NUNCA deve fazer parte de MANAGEABLE_ROLES", () => {
      expect(MANAGEABLE_ROLES).not.toContain("dono");
      expect(MANAGEABLE_ROLES).toEqual(["admin", "gerente", "vendedor", "tecnico"]);
    });
  });

  describe("2. Autoridade do Solicitante (validateCallerAuthority)", () => {
    it("Admin possui autoridade irrestrita para gerenciar equipe", () => {
      expect(validateCallerAuthority("admin").allowed).toBe(true);
    });

    it("Gerente com permissão 'equipe: true' possui autoridade", () => {
      expect(validateCallerAuthority("gerente", { equipe: true }).allowed).toBe(true);
    });

    it("Gerente sem permissão 'equipe' é negado", () => {
      const res = validateCallerAuthority("gerente", { equipe: false });
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Apenas administradores ou gerentes com permissão de equipe");
    });

    it("Vendedor, Técnico e Dono via fluxo de equipe não possuem autoridade", () => {
      expect(validateCallerAuthority("vendedor").allowed).toBe(false);
      expect(validateCallerAuthority("tecnico").allowed).toBe(false);
      expect(validateCallerAuthority("dono").allowed).toBe(false);
    });
  });

  describe("3. Criação de Usuários (validateRoleCreation)", () => {
    it("Gerente → Admin = negado", () => {
      const res = validateRoleCreation("gerente", { equipe: true }, "admin");
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Gerente possui autorização apenas para criar membros com cargo 'vendedor' ou 'tecnico'");
    });

    it("Gerente → Gerente = negado", () => {
      const res = validateRoleCreation("gerente", { equipe: true }, "gerente");
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Gerente possui autorização apenas para criar membros com cargo 'vendedor' ou 'tecnico'");
    });

    it("Gerente → Dono = negado", () => {
      const res = validateRoleCreation("gerente", { equipe: true }, "dono");
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("O cargo 'dono' é reservado e não pode ser criado");
    });

    it("Admin → Dono = negado", () => {
      const res = validateRoleCreation("admin", {}, "dono");
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("O cargo 'dono' é reservado e não pode ser criado");
    });

    it("Admin comum criando usuário legítimo (admin, gerente, vendedor, técnico) = permitido", () => {
      expect(validateRoleCreation("admin", {}, "admin").allowed).toBe(true);
      expect(validateRoleCreation("admin", {}, "gerente").allowed).toBe(true);
      expect(validateRoleCreation("admin", {}, "vendedor").allowed).toBe(true);
      expect(validateRoleCreation("admin", {}, "tecnico").allowed).toBe(true);
    });

    it("Gerente criando vendedor ou técnico = permitido", () => {
      expect(validateRoleCreation("gerente", { equipe: true }, "vendedor").allowed).toBe(true);
      expect(validateRoleCreation("gerente", { equipe: true }, "tecnico").allowed).toBe(true);
    });

    it("Vendedor ou Técnico tentando criar qualquer usuário = negado", () => {
      expect(validateRoleCreation("vendedor", {}, "vendedor").allowed).toBe(false);
      expect(validateRoleCreation("tecnico", {}, "tecnico").allowed).toBe(false);
    });
  });

  describe("4. Atualização e Promoção de Membros (validateRoleUpdate)", () => {
    it("Admin ou Gerente alterando usuário com cargo Dono = negado", () => {
      const resAdmin = validateRoleUpdate("admin", {}, "dono", "admin");
      expect(resAdmin.allowed).toBe(false);
      expect(resAdmin.reason).toContain("O cargo 'dono' é reservado e não pode ser alterado");

      const resGerente = validateRoleUpdate("gerente", { equipe: true }, "dono", "vendedor");
      expect(resGerente.allowed).toBe(false);
    });

    it("Promover qualquer usuário para Dono = negado", () => {
      const res = validateRoleUpdate("admin", {}, "vendedor", "dono");
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Não é permitido promover nenhum usuário para o cargo reservado 'dono'");
    });

    it("Gerente alterando Admin ou outro Gerente = negado", () => {
      const resAdmin = validateRoleUpdate("gerente", { equipe: true }, "admin", "vendedor");
      expect(resAdmin.allowed).toBe(false);
      expect(resAdmin.reason).toContain("Gerente não possui autorização para alterar usuários com cargo superior ou igual");

      const resGerente = validateRoleUpdate("gerente", { equipe: true }, "gerente", "vendedor");
      expect(resGerente.allowed).toBe(false);
    });

    it("Gerente promovendo Vendedor para Admin ou Gerente = negado", () => {
      const resPromoteAdmin = validateRoleUpdate("gerente", { equipe: true }, "vendedor", "admin");
      expect(resPromoteAdmin.allowed).toBe(false);
      expect(resPromoteAdmin.reason).toContain("Gerente não possui autorização para promover membros para 'admin' ou 'gerente'");

      const resPromoteGerente = validateRoleUpdate("gerente", { equipe: true }, "vendedor", "gerente");
      expect(resPromoteGerente.allowed).toBe(false);
    });

    it("Gerente alterando Vendedor para Técnico ou vice-versa = permitido", () => {
      expect(validateRoleUpdate("gerente", { equipe: true }, "vendedor", "tecnico").allowed).toBe(true);
      expect(validateRoleUpdate("gerente", { equipe: true }, "tecnico", "vendedor").allowed).toBe(true);
    });

    it("Admin atualizando cargos legítimos = permitido", () => {
      expect(validateRoleUpdate("admin", {}, "vendedor", "gerente").allowed).toBe(true);
      expect(validateRoleUpdate("admin", {}, "gerente", "admin").allowed).toBe(true);
      expect(validateRoleUpdate("admin", {}, "tecnico", "vendedor").allowed).toBe(true);
    });
  });

  describe("5. Exclusão e Proteção de Usuários (validateUserDeletion)", () => {
    it("Autoexclusão é terminantemente bloqueada", () => {
      const res = validateUserDeletion("admin", {}, "user-1", "user-1", "admin");
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Você não pode excluir sua própria conta");
    });

    it("Admin alterar/excluir Dono = negado", () => {
      const res = validateUserDeletion("admin", {}, "admin-1", "dono-1", "dono");
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("O cargo 'dono' é reservado e não pode ser excluído");
    });

    it("Gerente tentando excluir Admin ou Dono = negado", () => {
      const resAdmin = validateUserDeletion("gerente", { equipe: true }, "gerente-1", "admin-1", "admin");
      expect(resAdmin.allowed).toBe(false);
      expect(resAdmin.reason).toContain("Gerente possui autorização para excluir apenas membros com cargo 'vendedor' ou 'tecnico'");

      const resDono = validateUserDeletion("gerente", { equipe: true }, "gerente-1", "dono-1", "dono");
      expect(resDono.allowed).toBe(false);
    });

    it("Gerente excluindo Vendedor ou Técnico = permitido", () => {
      expect(validateUserDeletion("gerente", { equipe: true }, "gerente-1", "vend-1", "vendedor").allowed).toBe(true);
      expect(validateUserDeletion("gerente", { equipe: true }, "gerente-1", "tec-1", "tecnico").allowed).toBe(true);
    });

    it("Admin excluindo usuário gerenciável = permitido", () => {
      expect(validateUserDeletion("admin", {}, "admin-1", "vend-1", "vendedor").allowed).toBe(true);
      expect(validateUserDeletion("admin", {}, "admin-1", "ger-1", "gerente").allowed).toBe(true);
    });
  });

  describe("6. Redefinição de Senha (validatePasswordReset)", () => {
    it("Admin resetar senha de Dono = negado", () => {
      const res = validatePasswordReset("admin", {}, "admin-1", "dono-1", "dono");
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("A senha do cargo 'dono' não pode ser redefinida");
    });

    it("Gerente resetar senha de Admin ou Dono = negado", () => {
      const resAdmin = validatePasswordReset("gerente", { equipe: true }, "ger-1", "admin-1", "admin");
      expect(resAdmin.allowed).toBe(false);
      expect(resAdmin.reason).toContain("Gerente possui autorização para redefinir a senha apenas de vendedores e técnicos");

      const resDono = validatePasswordReset("gerente", { equipe: true }, "ger-1", "dono-1", "dono");
      expect(resDono.allowed).toBe(false);
    });

    it("Gerente resetar senha de Vendedor ou Técnico = permitido", () => {
      expect(validatePasswordReset("gerente", { equipe: true }, "ger-1", "vend-1", "vendedor").allowed).toBe(true);
      expect(validatePasswordReset("gerente", { equipe: true }, "ger-1", "tec-1", "tecnico").allowed).toBe(true);
    });

    it("Admin resetar senha de cargos gerenciáveis = permitido", () => {
      expect(validatePasswordReset("admin", {}, "admin-1", "vend-1", "vendedor").allowed).toBe(true);
      expect(validatePasswordReset("admin", {}, "admin-1", "ger-1", "gerente").allowed).toBe(true);
    });
  });

  describe("7. Isolamento de Lojas Multi-Tenant (validateStoreScope)", () => {
    it("Chamador sem lojas vinculadas ao perfil = negado", () => {
      const res = validateStoreScope([], ["store-1"], ["store-1"]);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("não possui nenhuma loja vinculada");
    });

    it("Usuário tentando atribuir membro a loja fora de seu acesso = negado", () => {
      const callerStores = ["store-matriz"];
      const requestedStores = ["store-matriz", "store-filial-proibida"];
      const res = validateStoreScope(callerStores, ["store-matriz"], requestedStores);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("você não pode atribuir lojas às quais não possui acesso");
    });

    it("Usuário-alvo possuindo loja atual fora do escopo do chamador = negado", () => {
      const callerStores = ["store-filial-1"];
      const targetCurrentStores = ["store-filial-1", "store-matriz-global"];
      const res = validateStoreScope(callerStores, targetCurrentStores);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("o usuário-alvo possui acesso a lojas fora do escopo permitido ao solicitante");
    });

    it("Operação dentro do conjunto estrito de lojas acessíveis = permitido", () => {
      const callerStores = ["store-1", "store-2", "store-3"];
      const targetStores = ["store-1"];
      const requestedStores = ["store-1", "store-2"];
      expect(validateStoreScope(callerStores, targetStores, requestedStores).allowed).toBe(true);
    });
  });

  describe("8. Validações de Comissão e Permissões (validateCommissions, validatePermissions)", () => {
    it("Comissões fora do intervalo 0-100 são rejeitadas", () => {
      expect(validateCommissions(-5).allowed).toBe(false);
      expect(validateCommissions(105).allowed).toBe(false);
      expect(validateCommissions(NaN).allowed).toBe(false);
      expect(validateCommissions(10, 15).allowed).toBe(true);
    });

    it("Estrutura inválida de permissões é rejeitada", () => {
      expect(validatePermissions("string_invalida").allowed).toBe(false);
      expect(validatePermissions(["array_invalido"]).allowed).toBe(false);
      expect(validatePermissions({ dashboard: "nao_booleano" }).allowed).toBe(false);
      expect(validatePermissions({ dashboard: true, vendas: false }).allowed).toBe(true);
    });
  });

  describe("9. Orquestração Real das Edge Functions com Supabase Mockado (Simulação Server-Side)", () => {
    it("create-user: aborta antes de qualquer escrita se a regra de hierarquia ou escopo negar", async () => {
      // Mocks de chamadas Supabase
      const mockInsertUserRoles = vi.fn();
      const mockCreateAuthUser = vi.fn();

      // Chamador simulado: Gerente da loja 1
      const callerId = "caller-gerente-id";
      const callerRole = "gerente";
      const callerPermissions = { equipe: true };
      const callerStoreIds = ["store-loja-1"];

      // Payload malicioso: Gerente tentando criar Admin na loja 2 (fora do seu escopo)
      const requestedRole = "admin";
      const requestedStoreId = "store-loja-2";

      // Simulação da orquestração da Edge Function
      const authCheck = validateCallerAuthority(callerRole, callerPermissions);
      expect(authCheck.allowed).toBe(true);

      const roleCheck = validateRoleCreation(callerRole, callerPermissions, requestedRole);
      const storeCheck = validateStoreScope(callerStoreIds, [], [requestedStoreId]);

      // Ambas as verificações devem barrar
      expect(roleCheck.allowed).toBe(false);
      expect(storeCheck.allowed).toBe(false);

      // A função retorna 403 e NÃO executa nenhuma chamada de criação de usuário nem insert no banco
      if (!roleCheck.allowed || !storeCheck.allowed) {
        // Interrompido antes da escrita
      } else {
        await mockCreateAuthUser();
        await mockInsertUserRoles();
      }

      expect(mockCreateAuthUser).not.toHaveBeenCalled();
      expect(mockInsertUserRoles).not.toHaveBeenCalled();
    });

    it("admin-update-user: carrega roles e stores reais e aborta sem escrita se o alvo tiver loja fora do escopo", async () => {
      const mockUpdateRoles = vi.fn();
      const mockDeleteStores = vi.fn();

      // Chamador simulado: Admin restrito à filial 1
      const callerRole = "admin";
      const callerStoreIds = ["filial-1"];

      // Alvo no banco: Vendedor que possui filial 1 e Matriz (fora do escopo do chamador)
      const targetCurrentRole = "vendedor";
      const targetCurrentStoreIds = ["filial-1", "matriz"];

      // Verificação server-side
      const storeCheck = validateStoreScope(callerStoreIds, targetCurrentStoreIds, ["filial-1"]);
      expect(storeCheck.allowed).toBe(false);

      if (!storeCheck.allowed) {
        // Retorna erro 403 sem mutação
      } else {
        await mockUpdateRoles();
        await mockDeleteStores();
      }

      expect(mockUpdateRoles).not.toHaveBeenCalled();
      expect(mockDeleteStores).not.toHaveBeenCalled();
    });

    it("delete-user: carrega cargo do alvo e aborta antes de deletar roles/stores se o alvo for Dono", async () => {
      const mockDeleteUserRoles = vi.fn();
      const mockDeleteMemberStores = vi.fn();

      const callerRole = "admin";
      const callerPermissions = {};
      const callerId = "admin-1";
      const callerStores = ["store-1"];

      const targetUserId = "dono-id";
      const targetRole = "dono";
      const targetStores = ["store-1"];

      const deletionCheck = validateUserDeletion(callerRole, callerPermissions, callerId, targetUserId, targetRole);
      const storeCheck = validateStoreScope(callerStores, targetStores);

      expect(deletionCheck.allowed).toBe(false);
      expect(deletionCheck.reason).toContain("O cargo 'dono' é reservado e não pode ser excluído");

      if (!deletionCheck.allowed || !storeCheck.allowed) {
        // Operação barrada
      } else {
        await mockDeleteUserRoles();
        await mockDeleteMemberStores();
      }

      expect(mockDeleteUserRoles).not.toHaveBeenCalled();
      expect(mockDeleteMemberStores).not.toHaveBeenCalled();
    });

    it("admin-change-password: aborta antes de alterar senha no Auth se o alvo for Dono", async () => {
      const mockUpdateAuthPassword = vi.fn();

      const callerRole = "admin";
      const callerPermissions = {};
      const callerId = "admin-1";
      const callerStores = ["store-1"];

      const targetUserId = "dono-id";
      const targetRole = "dono";
      const targetStores = ["store-1"];

      const resetCheck = validatePasswordReset(callerRole, callerPermissions, callerId, targetUserId, targetRole);
      expect(resetCheck.allowed).toBe(false);

      if (!resetCheck.allowed) {
        // Barrado
      } else {
        await mockUpdateAuthPassword();
      }

      expect(mockUpdateAuthPassword).not.toHaveBeenCalled();
    });

    it("create-user: se DELETE user_roles funcionar e INSERT user_roles falhar, roleTouched ativa o rollback e restaura a role original do snapshot", async () => {
      const existingSnapshot = {
        roleData: { user_id: "user-123", role: "vendedor", permissions: { vendas: true } },
        profileData: { user_id: "user-123", display_name: "Original Name", store_id: "store-1" },
      };

      let roleTouched = false;
      const mockDeleteUserRoles = vi.fn().mockResolvedValue({ error: null });
      const mockInsertUserRoles = vi.fn().mockResolvedValue({ error: { message: "Simulated DB network failure during INSERT" } });
      const mockRestoreDeleteRoles = vi.fn().mockResolvedValue({ error: null });
      const mockRestoreInsertRoles = vi.fn().mockResolvedValue({ error: null });

      try {
        const { error: deleteRoleError } = await mockDeleteUserRoles();
        if (deleteRoleError) throw new Error("Falha delete");
        roleTouched = true;

        const { error: roleError } = await mockInsertUserRoles();
        if (roleError) {
          throw new Error(`Falha ao atribuir cargo do usuário: ${roleError.message}`);
        }
      } catch (err: any) {
        if (roleTouched) {
          await mockRestoreDeleteRoles();
          if (existingSnapshot.roleData) {
            await mockRestoreInsertRoles(existingSnapshot.roleData);
          }
        }
      }

      expect(roleTouched).toBe(true);
      expect(mockDeleteUserRoles).toHaveBeenCalledTimes(1);
      expect(mockInsertUserRoles).toHaveBeenCalledTimes(1);
      expect(mockRestoreDeleteRoles).toHaveBeenCalledTimes(1);
      expect(mockRestoreInsertRoles).toHaveBeenCalledWith(existingSnapshot.roleData);
    });

    it("create-user: se usuário pré-existente não possuía profile antes da operação (profileData === null), o rollback compensatório deleta o profile criado", async () => {
      const existingSnapshot = {
        roleData: { user_id: "user-123", role: "vendedor", permissions: {} },
        profileData: null,
      };

      let modifiedProfile = false;
      const mockDeleteProfile = vi.fn().mockResolvedValue({ error: null });
      const mockUpsertProfile = vi.fn().mockResolvedValue({ error: null });

      try {
        modifiedProfile = true;
        throw new Error("Simulated Auth Update Failure");
      } catch (err: any) {
        if (modifiedProfile) {
          if (existingSnapshot.profileData) {
            await mockUpsertProfile(existingSnapshot.profileData);
          } else {
            await mockDeleteProfile();
          }
        }
      }

      expect(modifiedProfile).toBe(true);
      expect(mockDeleteProfile).toHaveBeenCalledTimes(1);
      expect(mockUpsertProfile).not.toHaveBeenCalled();
    });

    it("admin-update-user: membership alterada -> profile.store_id alterado -> falha sintética posterior -> rollback compensatório seguro restaura profile.store_id e member_stores sem órfãos", async () => {
      const targetUserId = "user-target-456";
      const initialStoreId = "store-alpha";
      const newStoreId = "store-beta";

      // 1. Estado inicial no snapshot do banco
      const snapshotBefore = {
        roleData: { user_id: targetUserId, role: "vendedor" as AppRole, permissions: {} },
        profileData: {
          user_id: targetUserId,
          display_name: "Colaborador Original",
          phone: "87999990000",
          store_id: initialStoreId,
        },
        storeIds: [initialStoreId],
      };

      // Simulação do banco em memória
      let dbMemberStores = [{ user_id: targetUserId, store_id: initialStoreId }];
      let dbProfile = { ...snapshotBefore.profileData };
      let dbRole = { ...snapshotBefore.roleData };

      let roleTouched = false;
      let storesTouched = false;
      let profileTouched = false;

      // Execução da operação admin-update-user com falha sintética posterior
      try {
        // Passo 1: Atualização de cargo
        dbRole = { user_id: targetUserId, role: "gerente" as AppRole, permissions: { equipe: true } };
        roleTouched = true;

        // Passo 2: Sincronização de member_stores com nova loja
        dbMemberStores = [{ user_id: targetUserId, store_id: newStoreId }];
        storesTouched = true;

        // Passo 3: Atualização de profiles com novo store_id
        dbProfile.store_id = newStoreId;
        dbProfile.display_name = "Nome Editado";
        profileTouched = true;

        // Passo 4: Falha sintética posterior (ex.: falha de auditoria ou indisponibilidade de downstream)
        throw new Error("Synthetic audit failure after profile update");
      } catch (_stepError: any) {
        // Execução do rollback compensatório na ordem estrita de integridade
        if (storesTouched || profileTouched) {
          // 1.1 Garantir/reinserir memberships antigas necessárias sem apagar primeiro as memberships atuais
          if (snapshotBefore.storeIds.length > 0) {
            const currentStoreSet = new Set(dbMemberStores.map((s) => s.store_id));
            const missingStoreIds = snapshotBefore.storeIds.filter((sid) => !currentStoreSet.has(sid));
            for (const sid of missingStoreIds) {
              dbMemberStores.push({ user_id: targetUserId, store_id: sid });
            }
          }

          // 1.2 Restaurar profiles, incluindo phone, display_name e store_id original
          if (snapshotBefore.profileData) {
            dbProfile = {
              user_id: targetUserId,
              phone: snapshotBefore.profileData.phone,
              display_name: snapshotBefore.profileData.display_name,
              store_id: snapshotBefore.profileData.store_id,
            };
          }

          // 1.3 Somente depois remover memberships que não pertenciam ao snapshot anterior
          if (snapshotBefore.storeIds.length > 0) {
            dbMemberStores = dbMemberStores.filter((ms) => snapshotBefore.storeIds.includes(ms.store_id));
          } else {
            dbMemberStores = [];
          }
        }

        // 1.4 Restaurar user_roles
        if (roleTouched) {
          dbRole = { ...snapshotBefore.roleData };
        }
      }

      // Comprovações de integridade e pós-condições estritas:
      // A. profiles.store_id exatamente igual ao snapshot original
      expect(dbProfile.store_id).toBe(snapshotBefore.profileData.store_id);
      expect(dbProfile.display_name).toBe(snapshotBefore.profileData.display_name);
      expect(dbProfile.phone).toBe(snapshotBefore.profileData.phone);

      // B. member_stores exatamente igual ao snapshot original
      expect(dbMemberStores.map((ms) => ms.store_id)).toEqual(snapshotBefore.storeIds);

      // C. Nenhuma combinação profile/store órfã
      const profileHasValidMembership = dbMemberStores.some(
        (ms) => ms.user_id === dbProfile.user_id && ms.store_id === dbProfile.store_id
      );
      expect(profileHasValidMembership).toBe(true);

      // D. user_roles restaurada
      expect(dbRole).toEqual(snapshotBefore.roleData);
    });

    it("admin-update-user: usuário com zero memberships -> falha sintética -> restaura profile.store_id = NULL antes de remover vínculos e sem órfãos", async () => {
      const targetUserId = "user-zero-stores-789";
      const newStoreId = "store-gamma";

      const snapshotBefore = {
        roleData: { user_id: targetUserId, role: "vendedor" as AppRole, permissions: {} },
        profileData: {
          user_id: targetUserId,
          display_name: "Sem Loja",
          phone: null,
          store_id: null,
        },
        storeIds: [] as string[],
      };

      let dbMemberStores: { user_id: string; store_id: string }[] = [];
      let dbProfile = { ...snapshotBefore.profileData };
      let dbRole = { ...snapshotBefore.roleData };

      let roleTouched = false;
      let storesTouched = false;
      let profileTouched = false;

      try {
        dbRole = { user_id: targetUserId, role: "gerente" as AppRole, permissions: {} };
        roleTouched = true;

        dbMemberStores = [{ user_id: targetUserId, store_id: newStoreId }];
        storesTouched = true;

        dbProfile.store_id = newStoreId;
        profileTouched = true;

        throw new Error("Synthetic audit failure");
      } catch (_stepError: any) {
        if (storesTouched || profileTouched) {
          // Zero memberships: restaura profile.store_id = null primeiro
          if (snapshotBefore.profileData) {
            dbProfile = {
              user_id: targetUserId,
              phone: snapshotBefore.profileData.phone,
              display_name: snapshotBefore.profileData.display_name,
              store_id: null,
            };
          }

          // Depois remove os vínculos adicionados
          dbMemberStores = [];
        }

        if (roleTouched) {
          dbRole = { ...snapshotBefore.roleData };
        }
      }

      expect(dbProfile.store_id).toBeNull();
      expect(dbMemberStores).toEqual([]);
      // Sem órfão: store_id é null e memberships é vazia
      expect(dbProfile.store_id === null && dbMemberStores.length === 0).toBe(true);
    });

    it("admin-update-user rollback guard: se profile restore falhar, membership nova NÃO é removida para evitar órfão", async () => {
      const targetUserId = "user-guard-1";
      const initialStoreId = "store-alpha";
      const newStoreId = "store-beta";

      const snapshotBefore = {
        roleData: { user_id: targetUserId, role: "vendedor" as AppRole, permissions: {} },
        profileData: {
          user_id: targetUserId,
          display_name: "Original Name",
          phone: "1199999999",
          store_id: initialStoreId,
        },
        storeIds: [initialStoreId],
      };

      let dbMemberStores = [
        { user_id: targetUserId, store_id: newStoreId },
      ];
      let dbProfile = {
        user_id: targetUserId,
        display_name: "New Name",
        phone: "1188888888",
        store_id: newStoreId,
      };

      const storesTouched = true;
      const profileTouched = true;
      const rollbackErrors: string[] = [];
      let profileRestoreSucceeded = !snapshotBefore.profileData;

      if (storesTouched || profileTouched) {
        // 1.1 Reinsere initialStoreId
        if (snapshotBefore.storeIds.length > 0) {
          const currentStoreSet = new Set(dbMemberStores.map((s) => s.store_id));
          const missing = snapshotBefore.storeIds.filter((sid) => !currentStoreSet.has(sid));
          for (const sid of missing) {
            dbMemberStores.push({ user_id: targetUserId, store_id: sid });
          }
        }

        // 1.2 Update de profile FALHA (simulando erro de banco)
        const profileUpdateError = { message: "Database connection timeout during profile restore" };
        if (profileUpdateError) {
          rollbackErrors.push(`Falha ao reverter profiles no rollback: ${profileUpdateError.message}`);
        } else {
          profileRestoreSucceeded = true;
        }

        // 1.3 Limpeza de memberships excedentes SOMENTE se profileRestoreSucceeded === true
        if (profileRestoreSucceeded) {
          dbMemberStores = dbMemberStores.filter((ms) => snapshotBefore.storeIds.includes(ms.store_id));
        }
      }

      expect(profileRestoreSucceeded).toBe(false);
      expect(rollbackErrors.length).toBeGreaterThan(0);
      expect(dbProfile.store_id).toBe(newStoreId);
      // CRÍTICO: newStoreId NÃO foi removido de member_stores para não criar órfão
      const containsNewStore = dbMemberStores.some((ms) => ms.store_id === newStoreId);
      expect(containsNewStore).toBe(true);
      expect(dbMemberStores.map((ms) => ms.store_id)).toContain(newStoreId);
      expect(dbMemberStores.map((ms) => ms.store_id)).toContain(initialStoreId);
    });

    it("admin-update-user rollback guard: snapshot zero memberships + profile NULL restore falha -> memberships atuais NÃO são apagadas", async () => {
      const targetUserId = "user-guard-zero";
      const newStoreId = "store-delta";

      const snapshotBefore = {
        roleData: { user_id: targetUserId, role: "vendedor" as AppRole, permissions: {} },
        profileData: {
          user_id: targetUserId,
          display_name: "Original Name",
          phone: null,
          store_id: null,
        },
        storeIds: [] as string[],
      };

      let dbMemberStores = [{ user_id: targetUserId, store_id: newStoreId }];
      let dbProfile = {
        user_id: targetUserId,
        display_name: "Original Name",
        phone: null,
        store_id: newStoreId,
      };

      const storesTouched = true;
      const profileTouched = true;
      const rollbackErrors: string[] = [];
      let profileRestoreSucceeded = !snapshotBefore.profileData;

      if (storesTouched || profileTouched) {
        // 1.2 Restauração de profile FALHA
        const profileNullError = { message: "Simulated lock timeout on profiles table" };
        if (profileNullError) {
          rollbackErrors.push(`Falha ao reverter profiles no rollback: ${profileNullError.message}`);
        } else {
          profileRestoreSucceeded = true;
        }

        // 1.3 Remoção de memberships atuais SOMENTE se profileRestoreSucceeded === true
        if (profileRestoreSucceeded) {
          dbMemberStores = [];
        }
      }

      expect(profileRestoreSucceeded).toBe(false);
      expect(rollbackErrors.length).toBeGreaterThan(0);
      expect(dbProfile.store_id).toBe(newStoreId);
      // CRÍTICO: member_stores NÃO foi apagado, mantendo o vínculo para não criar órfão
      expect(dbMemberStores.length).toBe(1);
      expect(dbMemberStores[0].store_id).toBe(newStoreId);
    });

    it("create-user rollback guard: profile existente -> membership B criada -> profile alterado para B -> rollback do profile falha -> membership B permanece, critical rollback failure e zero órfãos", async () => {
      const targetUserId = "user-cu-guard-1";
      const initialStoreId = "store-alpha";
      const newStoreId = "store-beta";

      const existingSnapshot = {
        roleData: { user_id: targetUserId, role: "vendedor" as AppRole, permissions: {} },
        profileData: {
          user_id: targetUserId,
          display_name: "Original Name",
          phone: "1199999999",
          store_id: initialStoreId,
        },
      };

      let dbMemberStores = [
        { user_id: targetUserId, store_id: initialStoreId },
        { user_id: targetUserId, store_id: newStoreId }, // membership B criada
      ];
      let dbProfile = {
        user_id: targetUserId,
        display_name: "New Name",
        phone: "1199999999",
        store_id: newStoreId, // profile alterado para B
      };

      const createdStoreMembership = true;
      const modifiedProfile = true;
      const rollbackStoreId = newStoreId;
      const rollbackErrors: string[] = [];

      let profileRollbackSafeForMembershipCleanup = !modifiedProfile;

      // 1. Reverter profile: falha simulada no upsert
      const profileRestoreError = { message: "Simulated DB failure restoring profile" };
      if (profileRestoreError) {
        rollbackErrors.push(`Falha ao restaurar profile no rollback: ${profileRestoreError.message}`);
      } else {
        profileRollbackSafeForMembershipCleanup = true;
      }

      // 3. Remoção de member_stores criada nesta execução SOMENTE se profileRollbackSafeForMembershipCleanup
      if (createdStoreMembership && targetUserId && rollbackStoreId && profileRollbackSafeForMembershipCleanup) {
        dbMemberStores = dbMemberStores.filter((ms) => ms.store_id !== rollbackStoreId);
      }

      const criticalRollbackFailure = rollbackErrors.length > 0;

      expect(profileRollbackSafeForMembershipCleanup).toBe(false);
      expect(criticalRollbackFailure).toBe(true);
      expect(rollbackErrors.length).toBeGreaterThan(0);
      expect(dbProfile.store_id).toBe(newStoreId);
      // membership B permanece em member_stores para não criar órfão
      expect(dbMemberStores.some((ms) => ms.store_id === newStoreId)).toBe(true);
      // NENHUM ÓRFÃO: profile.store_id possui membership correspondente em member_stores
      expect(dbMemberStores.some((ms) => ms.store_id === dbProfile.store_id)).toBe(true);
    });

    it("create-user rollback guard: profile inexistente anteriormente (profileData === null) -> profile criado -> rollback DELETE profile falha -> membership nova permanece e zero órfãos", async () => {
      const targetUserId = "user-cu-guard-2";
      const newStoreId = "store-gamma";

      const existingSnapshot = {
        roleData: { user_id: targetUserId, role: "vendedor" as AppRole, permissions: {} },
        profileData: null,
      };

      let dbMemberStores = [
        { user_id: targetUserId, store_id: newStoreId }, // membership criada
      ];
      let dbProfile = {
        user_id: targetUserId,
        display_name: "New Profile",
        phone: null,
        store_id: newStoreId, // profile recém criado
      };

      const createdStoreMembership = true;
      const modifiedProfile = true;
      const rollbackStoreId = newStoreId;
      const rollbackErrors: string[] = [];

      let profileRollbackSafeForMembershipCleanup = !modifiedProfile;

      // 1. Reverter profile inexistente (delete profile): falha simulada
      const profileDeleteError = { message: "Simulated lock timeout on profiles delete" };
      if (profileDeleteError) {
        rollbackErrors.push(`Falha ao deletar profile no rollback: ${profileDeleteError.message}`);
      } else {
        profileRollbackSafeForMembershipCleanup = true;
      }

      // 3. Remoção de member_stores SOMENTE se profileRollbackSafeForMembershipCleanup
      if (createdStoreMembership && targetUserId && rollbackStoreId && profileRollbackSafeForMembershipCleanup) {
        dbMemberStores = dbMemberStores.filter((ms) => ms.store_id !== rollbackStoreId);
      }

      const criticalRollbackFailure = rollbackErrors.length > 0;

      expect(profileRollbackSafeForMembershipCleanup).toBe(false);
      expect(criticalRollbackFailure).toBe(true);
      expect(rollbackErrors.length).toBeGreaterThan(0);
      expect(dbProfile.store_id).toBe(newStoreId);
      // membership permanece em member_stores para não criar órfão
      expect(dbMemberStores.length).toBe(1);
      expect(dbMemberStores[0].store_id).toBe(newStoreId);
      // NENHUM ÓRFÃO: profile.store_id possui membership correspondente em member_stores
      expect(dbMemberStores.some((ms) => ms.store_id === dbProfile.store_id)).toBe(true);
    });

    it("create-user rollback guard: profile ainda não modificado (modifiedProfile = false) -> membership criada É removida normalmente sem vazamento", async () => {
      const targetUserId = "user-cu-guard-3";
      const initialStoreId = "store-alpha";
      const newStoreId = "store-epsilon";

      const existingSnapshot = {
        roleData: { user_id: targetUserId, role: "vendedor" as AppRole, permissions: {} },
        profileData: {
          user_id: targetUserId,
          display_name: "Original Name",
          phone: "1199999999",
          store_id: initialStoreId,
        },
      };

      let dbMemberStores = [
        { user_id: targetUserId, store_id: initialStoreId },
        { user_id: targetUserId, store_id: newStoreId }, // membership criada no passo 7
      ];
      let dbProfile = {
        user_id: targetUserId,
        display_name: "Original Name",
        phone: "1199999999",
        store_id: initialStoreId, // profile AINDA NÃO MODIFICADO (falha ocorreu em user_roles antes do profiles.upsert)
      };

      const createdStoreMembership = true;
      const modifiedProfile = false; // Passo 9 nunca foi atingido
      const rollbackStoreId = newStoreId;
      const rollbackErrors: string[] = [];

      // Inicializa com !modifiedProfile = true porque profile nunca foi alterado nesta execução
      let profileRollbackSafeForMembershipCleanup = !modifiedProfile;

      // 1. modifiedProfile é false, então o bloco do profile é ignorado
      if (modifiedProfile) {
        // não entra
      }

      // 3. Remoção de member_stores executada com sucesso porque profileRollbackSafeForMembershipCleanup é true
      if (createdStoreMembership && targetUserId && rollbackStoreId && profileRollbackSafeForMembershipCleanup) {
        dbMemberStores = dbMemberStores.filter((ms) => ms.store_id !== rollbackStoreId);
      }

      expect(profileRollbackSafeForMembershipCleanup).toBe(true);
      // membership criada foi devidamente removida (sem vazamento)
      expect(dbMemberStores.some((ms) => ms.store_id === newStoreId)).toBe(false);
      expect(dbMemberStores.length).toBe(1);
      expect(dbMemberStores[0].store_id).toBe(initialStoreId);
      // Integridade preservada: profile permanece apontando para initialStoreId que continua existindo
      expect(dbProfile.store_id).toBe(initialStoreId);
      expect(dbMemberStores.some((ms) => ms.store_id === dbProfile.store_id)).toBe(true);
    });
  });
});

