export type AppRole = "admin" | "gerente" | "vendedor" | "tecnico" | "dono";

export const CANONICAL_ROLES: AppRole[] = ["admin", "gerente", "vendedor", "tecnico", "dono"];
export const MANAGEABLE_ROLES: AppRole[] = ["admin", "gerente", "vendedor", "tecnico"];

export const MODULE_KEYS = [
  "dashboard",
  "vendas",
  "leads",
  "estoque",
  "os",
  "clientes",
  "transacoes",
  "relatorios",
  "fiscal",
  "lojas",
  "equipe",
  "contas",
  "caixa",
  "gerenciar_financeiro",
  "auditoria",
  "configuracoes",
  "ia",
] as const;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Valida autoridade do chamador para gerenciar usuários na tela Equipe.
 * - admin: permitido
 * - gerente: permitido somente se tiver permissão `equipe === true`
 * - vendedor/tecnico/dono/outros: negado
 */
export function validateCallerAuthority(
  callerRole: string,
  callerPermissions?: Record<string, boolean> | null
): { allowed: boolean; reason?: string } {
  if (callerRole === "admin") {
    return { allowed: true };
  }
  if (callerRole === "gerente" && callerPermissions?.equipe === true) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: "Apenas administradores ou gerentes com permissão de equipe podem gerenciar usuários.",
  };
}

/**
 * Valida a criação de um novo usuário.
 * - dono nunca pode ser criado via equipe
 * - gerente só pode criar vendedor ou tecnico
 * - admin pode criar admin, gerente, vendedor, tecnico
 * - vendedor/tecnico não podem criar ninguém
 */
export function validateRoleCreation(
  callerRole: string,
  callerPermissions: Record<string, boolean> | null | undefined,
  requestedRole: string
): { allowed: boolean; reason?: string } {
  const auth = validateCallerAuthority(callerRole, callerPermissions);
  if (!auth.allowed) return auth;

  if (requestedRole === "dono") {
    return {
      allowed: false,
      reason: "O cargo 'dono' é reservado e não pode ser criado via fluxo de equipe.",
    };
  }

  if (!MANAGEABLE_ROLES.includes(requestedRole as AppRole)) {
    return {
      allowed: false,
      reason: `Cargo solicitado '${requestedRole}' é inválido. Cargos permitidos: ${MANAGEABLE_ROLES.join(", ")}.`,
    };
  }

  if (callerRole === "gerente") {
    if (requestedRole !== "vendedor" && requestedRole !== "tecnico") {
      return {
        allowed: false,
        reason: "Gerente possui autorização apenas para criar membros com cargo 'vendedor' ou 'tecnico'.",
      };
    }
  }

  return { allowed: true };
}

/**
 * Valida a alteração de cargo de um usuário existente.
 * - dono não pode ser rebaixado/alterado por ninguém via equipe
 * - ninguém pode ser promovido para dono via equipe
 * - gerente só pode alterar vendedor e tecnico para vendedor ou tecnico
 * - admin pode alterar admin, gerente, vendedor, tecnico
 */
export function validateRoleUpdate(
  callerRole: string,
  callerPermissions: Record<string, boolean> | null | undefined,
  currentTargetRole: string,
  newTargetRole: string
): { allowed: boolean; reason?: string } {
  const auth = validateCallerAuthority(callerRole, callerPermissions);
  if (!auth.allowed) return auth;

  if (currentTargetRole === "dono") {
    return {
      allowed: false,
      reason: "O cargo 'dono' é reservado e não pode ser alterado através do fluxo de equipe.",
    };
  }

  if (newTargetRole === "dono") {
    return {
      allowed: false,
      reason: "Não é permitido promover nenhum usuário para o cargo reservado 'dono'.",
    };
  }

  if (!MANAGEABLE_ROLES.includes(newTargetRole as AppRole)) {
    return {
      allowed: false,
      reason: `Cargo de destino '${newTargetRole}' é inválido.`,
    };
  }

  if (callerRole === "gerente") {
    if (currentTargetRole !== "vendedor" && currentTargetRole !== "tecnico") {
      return {
        allowed: false,
        reason: "Gerente não possui autorização para alterar usuários com cargo superior ou igual (admin/gerente).",
      };
    }
    if (newTargetRole !== "vendedor" && newTargetRole !== "tecnico") {
      return {
        allowed: false,
        reason: "Gerente não possui autorização para promover membros para 'admin' ou 'gerente'.",
      };
    }
  }

  return { allowed: true };
}

/**
 * Valida exclusão de um membro.
 * - Não pode excluir a própria conta
 * - Dono não pode ser excluído
 * - Gerente só pode excluir vendedor e tecnico
 * - Admin pode excluir admin, gerente, vendedor, tecnico
 */
export function validateUserDeletion(
  callerRole: string,
  callerPermissions: Record<string, boolean> | null | undefined,
  callerId: string,
  targetUserId: string,
  targetRole: string
): { allowed: boolean; reason?: string } {
  if (callerId === targetUserId) {
    return {
      allowed: false,
      reason: "Você não pode excluir sua própria conta.",
    };
  }

  const auth = validateCallerAuthority(callerRole, callerPermissions);
  if (!auth.allowed) return auth;

  if (targetRole === "dono") {
    return {
      allowed: false,
      reason: "O cargo 'dono' é reservado e não pode ser excluído pelo fluxo comum de equipe.",
    };
  }

  if (callerRole === "gerente") {
    if (targetRole !== "vendedor" && targetRole !== "tecnico") {
      return {
        allowed: false,
        reason: "Gerente possui autorização para excluir apenas membros com cargo 'vendedor' ou 'tecnico'.",
      };
    }
  }

  return { allowed: true };
}

/**
 * Valida redefinição de senha de um membro.
 * - Dono não pode ter senha redefinida pelo fluxo comum
 * - Gerente só pode redefinir de vendedor e tecnico
 * - Admin pode redefinir de qualquer cargo gerenciável
 */
export function validatePasswordReset(
  callerRole: string,
  callerPermissions: Record<string, boolean> | null | undefined,
  callerId: string,
  targetUserId: string,
  targetRole: string
): { allowed: boolean; reason?: string } {
  const auth = validateCallerAuthority(callerRole, callerPermissions);
  if (!auth.allowed) return auth;

  if (targetRole === "dono") {
    return {
      allowed: false,
      reason: "A senha do cargo 'dono' não pode ser redefinida pelo fluxo comum de equipe.",
    };
  }

  if (callerRole === "gerente") {
    if (targetRole !== "vendedor" && targetRole !== "tecnico") {
      return {
        allowed: false,
        reason: "Gerente possui autorização para redefinir a senha apenas de vendedores e técnicos.",
      };
    }
  }

  return { allowed: true };
}

/**
 * Validação de Escopo de Lojas (Multi-loja estrito):
 * 1. Nenhuma role 'admin' possui acesso global implícito por enquanto (Item 1).
 * 2. callerStoreIds não pode ser vazio (o chamador deve estar vinculado a pelo menos uma loja).
 * 3. Todas as lojas ATUAIS do alvo devem estar contidas nas lojas do chamador (Item 3).
 * 4. Todas as lojas SOLICITADAS para atribuição devem estar contidas nas lojas do chamador (Item 1 e 3).
 */
export function validateStoreScope(
  callerStoreIds: string[],
  targetCurrentStoreIds: string[],
  requestedStoreIds?: string[]
): { allowed: boolean; reason?: string } {
  if (!callerStoreIds || callerStoreIds.length === 0) {
    return {
      allowed: false,
      reason: "Não autorizado: o usuário solicitante não possui nenhuma loja vinculada ao seu perfil.",
    };
  }

  const callerSet = new Set(callerStoreIds);

  // 1. Verificar se o alvo possui alguma loja atual que o chamador não tem acesso
  if (targetCurrentStoreIds && targetCurrentStoreIds.length > 0) {
    const foreignCurrentStore = targetCurrentStoreIds.find((id) => !callerSet.has(id));
    if (foreignCurrentStore) {
      return {
        allowed: false,
        reason: "Não autorizado: o usuário-alvo possui acesso a lojas fora do escopo permitido ao solicitante.",
      };
    }
  }

  // 2. Verificar se o chamador está tentando atribuir alguma loja que ele não acessa
  if (requestedStoreIds && requestedStoreIds.length > 0) {
    const foreignRequestedStore = requestedStoreIds.find((id) => !callerSet.has(id));
    if (foreignRequestedStore) {
      return {
        allowed: false,
        reason: "Não autorizado: você não pode atribuir lojas às quais não possui acesso.",
      };
    }
  }

  return { allowed: true };
}

/**
 * Validação de parâmetros financeiros de comissão (Item 6).
 */
export function validateCommissions(
  salesPercent?: number,
  servicesPercent?: number,
  onSales?: boolean,
  onServices?: boolean
): { allowed: boolean; reason?: string } {
  if (salesPercent !== undefined) {
    if (typeof salesPercent !== "number" || isNaN(salesPercent) || salesPercent < 0 || salesPercent > 100) {
      return {
        allowed: false,
        reason: "Percentual de comissão de vendas deve ser um número entre 0 e 100.",
      };
    }
  }

  if (servicesPercent !== undefined) {
    if (typeof servicesPercent !== "number" || isNaN(servicesPercent) || servicesPercent < 0 || servicesPercent > 100) {
      return {
        allowed: false,
        reason: "Percentual de comissão de serviços deve ser um número entre 0 e 100.",
      };
    }
  }

  if (onSales !== undefined && typeof onSales !== "boolean") {
    return { allowed: false, reason: "Parâmetro 'commission_on_sales' deve ser booleano." };
  }

  if (onServices !== undefined && typeof onServices !== "boolean") {
    return { allowed: false, reason: "Parâmetro 'commission_on_services' deve ser booleano." };
  }

  return { allowed: true };
}

/**
 * Validação de formato do mapa de permissões (Item 6).
 */
export function validatePermissions(
  permissions: unknown
): { allowed: boolean; reason?: string } {
  if (permissions === undefined || permissions === null) {
    return { allowed: true };
  }

  if (typeof permissions !== "object" || Array.isArray(permissions)) {
    return { allowed: false, reason: "Estrutura de permissões inválida: deve ser um objeto chave-valor." };
  }

  for (const [key, value] of Object.entries(permissions as Record<string, unknown>)) {
    if (typeof value !== "boolean") {
      return {
        allowed: false,
        reason: `Permissão para módulo '${key}' inválida: valor deve ser booleano.`,
      };
    }
  }

  return { allowed: true };
}
