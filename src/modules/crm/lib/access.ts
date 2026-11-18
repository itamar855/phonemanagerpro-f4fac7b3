// Quem pode abrir o CRM: admin sempre; os demais só com a permissão "leads"
// ligada em Equipe (rótulo "CRM"). A chave continua "leads" para não perder o que já foi salvo.
export const CRM_PERMISSION = "leads";

export type CrmAccess = "loading" | "allowed" | "denied";

export function crmAccess(role: string | null, permissions: Record<string, boolean> | null): CrmAccess {
  if (role === null) return "loading"; // perfil ainda carregando
  if (role === "admin") return "allowed";
  return permissions?.[CRM_PERMISSION] === true ? "allowed" : "denied";
}

/** Abas do CRM que só o admin vê (Relatórios e Configurações). */
export const CRM_ADMIN_ONLY_PATHS = ["/crm/relatorios", "/crm/config"] as const;

export function crmIsAdmin(role: string | null): boolean {
  return role === "admin";
}

/** A aba aparece para este papel? (enquanto o perfil carrega, esconde as do admin) */
export function crmTabVisible(path: string, role: string | null): boolean {
  return crmIsAdmin(role) || !(CRM_ADMIN_ONLY_PATHS as readonly string[]).includes(path);
}
