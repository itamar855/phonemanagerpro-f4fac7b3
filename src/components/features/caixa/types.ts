export interface CashEntry {
  id: string;
  type: "entrada" | "saida" | "sangria" | "abertura";
  amount: number;
  description: string;
  payment_method: string;
  confirmed: boolean;
  receipt_url: string | null;
  supplier_order_receipt_url?: string | null;
  created_at: string;
}

export interface CashRegister {
  id: string;
  store_id: string;
  opened_by: string;
  opened_at: string;
  closed_at: string | null;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  difference_reason?: string | null;
  closing_note?: string | null;
  opening_receipt_url?: string | null;
  closing_receipt_url?: string | null;
  status: "open" | "closed";
  profiles?: { display_name: string };
  stores?: { name: string };
}

export interface Supplier {
  id: string;
  store_id: string | null;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  notes: string | null;
  credit_balance: number;
  created_at: string;
}

export const paymentLabels: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Crédito",
  cartao_debito: "Débito",
  transferencia: "Transferência",
  misto: "Misto"
};

export const statusConfig: Record<string, { label: string; color: string }> = {
  open:             { label: "Aberta",               color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  analyzing:        { label: "Em Análise",           color: "bg-amber-500/15 text-amber-500 border-amber-500/20" },
  waiting_part:     { label: "Aguardando Peça",      color: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
  repairing:        { label: "Em Reparo",            color: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
  waiting_approval: { label: "Aguardando Aprovação", color: "bg-amber-500/15 text-amber-500 border-amber-500/20" },
  ready:            { label: "Pronta p/ Retirada",   color: "bg-primary/15 text-primary border-primary/20" },
  delivered:        { label: "Entregue",             color: "bg-muted text-muted-foreground border-border" },
  cancelled:        { label: "Cancelada",            color: "bg-destructive/15 text-destructive border-destructive/20" },
};

export const formatCurrency = (val: number | null | undefined): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);

export const getMistoValues = (description: string | null): Record<string, number> => {
  if (!description) return {};
  const match = description.match(/\[MISTO:(\{.*?\})\]/);
  if (match && match[1]) {
    try { return JSON.parse(match[1]); } catch { return {}; }
  }
  return {};
};

export const getMistoLabel = (description: string | null): string => {
  const vals = getMistoValues(description);
  const parts: string[] = [];
  if (vals.dinheiro > 0) parts.push(`Dinheiro: ${formatCurrency(vals.dinheiro)}`);
  if (vals.pix > 0) parts.push(`PIX: ${formatCurrency(vals.pix)}`);
  if (vals.cartao_credito > 0) parts.push(`Cartão: ${formatCurrency(vals.cartao_credito)}`);
  return parts.length > 0 ? `Misto (${parts.join(" | ")})` : "Misto";
};
