import type { Tables } from "@/integrations/supabase/types";
import type { Product, Profile, Store, StoreBankAccount, Transaction } from "@/types/db";

export type { Product, Profile, Store, StoreBankAccount, Transaction };

export type Sale = {
  id: string;
  product_id: string;
  store_id: string;
  sale_price: number;
  has_trade_in: boolean;
  trade_in_device_name: string | null;
  trade_in_device_brand: string | null;
  trade_in_device_model: string | null;
  trade_in_device_imei: string | null;
  trade_in_value: number | null;
  payment_cash: number;
  payment_card: number;
  payment_pix: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_cpf: string | null;
  customer_address: string | null;
  customer_id: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  commission_value: number | null;
  commission_percent: number | null;
  discount: number | null;
  warranty_days: number | null;
  installments: number | null;
  seller_id: string | null;
  trade_in_product_id: string | null;
};

export type Customer = Tables<"customers">;
export type Accessory = {
  id: string;
  store_id: string;
  name: string;
  category: string;
  brand: string | null;
  quantity: number;
  cost_price: number;
  sale_price: number | null;
};
export type CartItem = { acc: Accessory; qty: number; price: number };

export const formatCurrency = (v: number | null | undefined): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

/** Um aparelho dado na troca, como digitado no formulário. */
export type TradeInDeviceForm = { name: string; brand: string; model: string; imei: string; value: string; evaluation_id?: string }

/** Formulário de nova venda de aparelho (tudo texto até salvar). */
export type SaleForm = {
  product_id: string;
  sale_price: string;
  has_trade_in: boolean;
  trade_in_device_name: string;
  trade_in_device_brand: string;
  trade_in_device_model: string;
  trade_in_device_imei: string;
  trade_in_value: string;
  payment_cash: string;
  payment_card: string;
  payment_pix: string;
  notes: string;
  commission_percent: string;
  discount: string;
  warranty_days: string;
  installments: string;
  destination_account_id: string;
  retro_date: string;
  trade_in_devices: TradeInDeviceForm[];
}

/** Formulário de edição de uma venda já feita. */
export type EditSaleForm = {
  sale_price: string;
  discount: string;
  payment_cash: string;
  payment_card: string;
  payment_pix: string;
  installments: string;
  warranty_days: string;
  commission_percent: string;
  notes: string;
  customer_name: string;
  product_name: string;
  product_cost: string;
  product_imei: string;
  retro_date: string;
  has_trade_in: boolean;
  trade_in_device_name: string;
  trade_in_device_brand: string;
  trade_in_device_model: string;
  trade_in_device_imei: string;
  trade_in_value: string;
}

export type CustomerForm = { name: string; phone: string; cpf: string; address: string; email: string; birth: string }

/** Pagamento do PDV de acessórios. */
export type PdvPaymentForm = { cash: string; card: string; pix: string; customer: string; cpfCnpj: string; store_id: string }

/** O que o PDV grava em transactions.metadata. */
export type PdvMetadata = { discount?: number | string; seller_id?: string; cart?: { id: string; qty: number }[] } | null;
