import type { Tables } from "@/integrations/supabase/types";

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
