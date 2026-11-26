// Formatos usados pela tela de Estoque e seus componentes.
import type { Accessory, Product, ProductHistory, Supplier } from "@/types/db";

export type { Accessory, Product };

/** Histórico do aparelho com o nome de quem fez a alteração (join em profiles). */
export type ProductHistoryEntry = ProductHistory & { created_by_profile?: { display_name: string | null } | null };

/** Fornecedor como a tela busca (só id, nome e crédito). */
export type SupplierOption = Pick<Supplier, "id" | "name" | "credit_balance">;

/** Formulário de cadastro de aparelho. */
export type ProductForm = {
  name: string;
  brand: string;
  model: string;
  imei: string;
  serial_number: string;
  cost_price: string;
  sale_price: string;
  store_id: string;
  product_type: string;
  condition: string;
  color: string;
  capacity: string;
  battery_percentage: string;
  needsRepair: boolean;
  selectedRepairs: string[];
  notes: string;
};

/** Formulário de edição de aparelho. */
export type EditProductForm = {
  name: string;
  brand: string;
  model: string;
  imei: string;
  serial_number: string;
  cost_price: string;
  sale_price: string;
  store_id: string;
  condition: string;
  color: string;
  capacity: string;
  battery_percentage: string;
  justification: string;
  status: string;
};

/** Formulário de acessório. */
export type AccessoryForm = {
  name: string;
  category: string;
  brand: string;
  quantity: string;
  min_quantity: string;
  cost_price: string;
  sale_price: string;
  store_id: string;
  description: string;
  justification: string;
};

/** Formulário de peça avulsa. */
export type PartForm = {
  name: string;
  brand: string;
  model: string;
  cost_price: string;
  sale_price: string;
  supplier_id: string;
  launch_cash_out: boolean;
  payment_method: string;
  use_credit: boolean;
};
