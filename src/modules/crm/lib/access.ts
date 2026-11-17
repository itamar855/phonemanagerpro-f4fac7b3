// Quem pode abrir o CRM: admin sempre; os demais só com a permissão "leads"
// ligada em Equipe (rótulo "CRM"). A chave continua "leads" para não perder o que já foi salvo.
export const CRM_PERMISSION = "leads";

export type CrmAccess = "loading" | "allowed" | "denied";

export function crmAccess(role: string | null, permissions: Record<string, boolean> | null): CrmAccess {
  if (role === null) return "loading"; // perfil ainda carregando
  if (role === "admin") return "allowed";
  return permissions?.[CRM_PERMISSION] === true ? "allowed" : "denied";
}
