// Atalhos para as linhas das tabelas do Supabase (gerados de src/integrations/supabase/types.ts).
// Use estes tipos no lugar de `any` ao lidar com dados do banco.
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type { Tables, TablesInsert, TablesUpdate };

export type Store = Tables<"stores">;
export type Profile = Tables<"profiles">;
export type UserRole = Tables<"user_roles">;
export type MemberStore = Tables<"member_stores">;
export type Customer = Tables<"customers">;
export type Product = Tables<"products">;
export type ProductHistory = Tables<"product_history">;
export type ProductRepair = Tables<"product_repairs">;
export type ProductRepairItem = Tables<"product_repair_items">;
export type Accessory = Tables<"accessories">;
export type Supplier = Tables<"suppliers">;
export type Sale = Tables<"sales">;
export type Transaction = Tables<"transactions">;
export type FixedExpense = Tables<"fixed_expenses">;
export type CashRegister = Tables<"cash_registers">;
export type CashEntry = Tables<"cash_entries">;
export type CashClosure = Tables<"cash_closures">;
export type StoreBankAccount = Tables<"store_bank_accounts">;
export type ServiceOrder = Tables<"service_orders">;
export type ServiceOrderItem = Tables<"service_order_items">;
export type ServiceOrderHistory = Tables<"service_order_history">;
export type ServiceOrderPhoto = Tables<"service_order_photos">;
export type CommissionSettlementRow = Tables<"commission_settlements">;
export type CommissionSettlementItemRow = Tables<"commission_settlement_items">;
export type AuditLog = Tables<"audit_logs">;
export type Webhook = Tables<"webhooks">;
export type WhatsappConfig = Tables<"whatsapp_config">;

/** Venda buscada com `select("*, products!sales_product_id_fkey(*)")`. */
export type SaleWithProduct = Sale & { products?: Product | null };

/** Erro de qualquer formato vindo de um `catch` ou do Supabase: devolve uma mensagem legível. */
export function errorMessage(err: unknown, fallback = "Erro desconhecido"): string {
  if (err instanceof Error) return err.message || fallback;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message || fallback;
  }
  if (typeof err === "string") return err || fallback;
  return fallback;
}
