// Quem abre o simulador: admin/gerente/dono e quem tem a permissão "Vendas" (o vendedor do balcão).
// Quem mexe na tabela de preços e nos descontos: admin, gerente e dono (o banco confere de novo na RLS).
export type TrocaAccess = "loading" | "allowed" | "denied";

const MANAGERS = ["admin", "gerente", "dono"];

export function trocaIsManager(role: string | null): boolean {
  return role !== null && MANAGERS.includes(role);
}

export function trocaAccess(role: string | null, permissions: Record<string, boolean> | null): TrocaAccess {
  if (role === null) return "loading";
  if (trocaIsManager(role)) return "allowed";
  return permissions?.vendas === true ? "allowed" : "denied";
}
