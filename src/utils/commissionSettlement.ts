import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";

export interface CommissionSettlement {
  id: string;
  store_id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  total_sales_commission: number;
  total_service_commission: number;
  total_amount: number;
  payment_method: "dinheiro" | "pix" | "transferencia";
  source_type: "caixa" | "banco";
  cash_register_id?: string | null;
  transaction_id?: string | null;
  cash_entry_id?: string | null;
  source_account_id?: string | null;
  status: "paid";
  paid_at: string;
  receipt_url?: string | null;
  notes?: string | null;
  created_by: string;
  created_at: string;
  items_count?: number;
  user_name?: string;
  manager_name?: string;
  store_name?: string;
}

export interface CommissionSettlementItem {
  id: string;
  settlement_id: string;
  item_type: "sale" | "service_order";
  sale_id?: string | null;
  service_order_id?: string | null;
  gross_amount: number;
  cost_amount: number | null;
  profit_amount: number | null;
  commission_percent: number;
  commission_amount: number;
  created_at: string;
  description?: string;
}

/**
 * Converte data ISO ou objeto Date para YYYY-MM-DD no fuso canônico America/Sao_Paulo (Brasília).
 * Garante que eventos entre 21:00 e 23:59:59 não mudem indevidamente para o dia seguinte do UTC.
 */
export function toBrasiliaDateString(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/**
 * Converte data ISO ou objeto Date para DD/MM/YYYY no fuso canônico America/Sao_Paulo (Brasília).
 */
export function formatBrasiliaDate(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export interface SettleCommissionsPayload {
  store_id: string;
  user_id: string;
  period_start: string; // YYYY-MM-DD
  period_end: string;   // YYYY-MM-DD
  payment_method: "dinheiro" | "pix" | "transferencia";
  source_type: "caixa" | "banco";
  cash_register_id?: string | null;
  source_account_id?: string | null;
  notes?: string | null;
  receipt_url?: string | null;
  sale_ids: string[];
  service_order_ids: string[];
}

export interface SettleCommissionsResponse {
  success: boolean;
  settlement_id: string;
  user_name: string;
  total_amount: number;
  total_sales_commission: number;
  total_service_commission: number;
  items_count: number;
  cash_entry_id?: string | null;
  transaction_id?: string | null;
  payment_method: string;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/**
 * Busca todos os IDs de vendas e OSs já liquidadas para garantir
 * que a interface não exiba itens já quitados como pendentes.
 */
export async function fetchSettledItemIds(): Promise<{
  settledSaleIds: Set<string>;
  settledOsIds: Set<string>;
}> {
  const { data, error } = await (supabase
    .from("commission_settlement_items" as any)
    .select("sale_id, service_order_id") as any);

  const settledSaleIds = new Set<string>();
  const settledOsIds = new Set<string>();

  if (!error && data) {
    data.forEach((item: any) => {
      if (item.sale_id) settledSaleIds.add(item.sale_id);
      if (item.service_order_id) settledOsIds.add(item.service_order_id);
    });
  }

  return { settledSaleIds, settledOsIds };
}

/**
 * Executa a liquidação atômica de comissões via RPC PostgreSQL
 */
export async function settleCommissionsRPC(
  payload: SettleCommissionsPayload
): Promise<SettleCommissionsResponse> {
  const { data, error } = await (supabase.rpc("settle_commissions" as any, {
    p_payload: payload,
  }) as any);

  if (error) {
    throw new Error(error.message || "Falha ao liquidar comissões.");
  }

  return data as SettleCommissionsResponse;
}

/**
 * Busca o histórico de liquidações para a loja ou colaborador
 */
export async function fetchSettlementsHistory(
  storeId?: string,
  userId?: string
): Promise<CommissionSettlement[]> {
  let query = supabase
    .from("commission_settlements" as any)
    .select("*")
    .order("paid_at", { ascending: false });

  if (storeId && storeId !== "all") {
    query = query.eq("store_id", storeId);
  }

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await (query as any);
  if (error) {
    console.error("Erro ao carregar histórico de liquidações:", error);
    return [];
  }

  return (data as CommissionSettlement[]) || [];
}

/**
 * Busca os itens de uma liquidação específica para geração de 2ª via ou detalhes
 */
export async function fetchSettlementItems(
  settlementId: string
): Promise<CommissionSettlementItem[]> {
  const { data, error } = await (supabase
    .from("commission_settlement_items" as any)
    .select("*")
    .eq("settlement_id", settlementId)
    .order("created_at", { ascending: true }) as any);

  if (error) {
    console.error("Erro ao carregar itens da liquidação:", error);
    return [];
  }

  return (data as CommissionSettlementItem[]) || [];
}

/**
 * Gera recibo formal de quitação de comissões em PDF após o sucesso da liquidação
 */
export function generateSettlementReceiptPDF(data: {
  settlement: {
    id: string;
    paid_at: string;
    period_start: string;
    period_end: string;
    total_sales_commission: number;
    total_service_commission: number;
    total_amount: number;
    payment_method: string;
    source_type: string;
    notes?: string | null;
  };
  items: CommissionSettlementItem[];
  storeName: string;
  collaboratorName: string;
  managerName: string;
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 12;
  const W = 210;
  const CW = W - M * 2;

  // Header Dark Elegante
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, W, 32, "F");
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 32, W, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("CELL PRO 360", M, 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Comprovante de Liquidação de Comissões", M, 20);
  doc.text(`Loja: ${data.storeName}`, M, 26);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(16, 185, 129);
  doc.text("RECIBO DE QUITAÇÃO", W - M, 13, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`Protocolo: ${data.settlement.id.slice(0, 8).toUpperCase()}`, W - M, 20, { align: "right" });
  doc.text(`Data: ${new Date(data.settlement.paid_at).toLocaleString("pt-BR")}`, W - M, 26, { align: "right" });

  let y = 42;

  // Bloco de Identificação
  doc.setFillColor(249, 250, 251);
  doc.rect(M, y, CW, 24, "F");
  doc.setDrawColor(229, 231, 235);
  doc.rect(M, y, CW, 24);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text("BENEFICIÁRIO / COLABORADOR", M + 4, y + 6);
  doc.text("PERÍODO DE APURAÇÃO", M + 90, y + 6);
  doc.text("FORMA DE PAGAMENTO", M + 140, y + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(17, 24, 39);
  doc.text(data.collaboratorName, M + 4, y + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `${new Date(data.settlement.period_start + "T12:00:00").toLocaleDateString("pt-BR")} a ${new Date(
      data.settlement.period_end + "T12:00:00"
    ).toLocaleDateString("pt-BR")}`,
    M + 90,
    y + 14
  );

  const metodoLabel =
    data.settlement.payment_method === "dinheiro"
      ? "Dinheiro (Caixa)"
      : data.settlement.payment_method.toUpperCase();
  doc.text(metodoLabel, M + 140, y + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text(`Autorizado por: ${data.managerName}`, M + 4, y + 20);

  y += 30;

  // Tabela de Itens Liquidados
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(17, 24, 39);
  doc.text(`Demonstrativo das Operações Liquidadas (${data.items.length} itens)`, M, y);
  y += 4;

  const cols = [
    { label: "TIPO", w: 20 },
    { label: "REFERÊNCIA", w: 50 },
    { label: "FATURADO", w: 30 },
    { label: "CUSTO / PEÇAS", w: 28 },
    { label: "LUCRO BRUTO", w: 28 },
    { label: "% COM.", w: 14 },
    { label: "COMISSÃO", w: 16 },
  ];

  doc.setFillColor(17, 24, 39);
  let x = M;
  cols.forEach((c) => {
    doc.rect(x, y, c.w, 7, "F");
    x += c.w;
  });

  x = M;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  cols.forEach((c) => {
    doc.text(c.label, x + 2, y + 4.8);
    x += c.w;
  });

  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(30, 30, 30);

  data.items.forEach((it, idx) => {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    if (idx % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(M, y, CW, 6.5, "F");
    }

    const tipoLabel = it.item_type === "sale" ? "Venda" : "OS";
    const refLabel = it.sale_id
      ? `Venda #${it.sale_id.slice(0, 8)}`
      : `OS #${it.service_order_id?.slice(0, 8)}`;

    const vals = [
      tipoLabel,
      refLabel,
      formatCurrency(it.gross_amount),
      it.cost_amount !== null ? formatCurrency(it.cost_amount) : "—",
      it.profit_amount !== null ? formatCurrency(it.profit_amount) : "—",
      `${it.commission_percent}%`,
      formatCurrency(it.commission_amount),
    ];

    let cx = M;
    vals.forEach((v, i) => {
      doc.text(v, cx + 2, y + 4.5);
      cx += cols[i].w;
    });

    y += 6.5;
  });

  y += 4;

  // Box de Totais
  doc.setFillColor(243, 244, 246);
  doc.rect(M + 90, y, CW - 90, 24, "F");
  doc.setDrawColor(209, 213, 219);
  doc.rect(M + 90, y, CW - 90, 24);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text("Comissão de Vendas:", M + 94, y + 6);
  doc.text("Comissão de Serviços (OS):", M + 94, y + 12);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL LIQUIDADO:", M + 94, y + 19);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.text(formatCurrency(data.settlement.total_sales_commission), W - M - 4, y + 6, { align: "right" });
  doc.text(formatCurrency(data.settlement.total_service_commission), W - M - 4, y + 12, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(16, 185, 129);
  doc.text(formatCurrency(data.settlement.total_amount), W - M - 4, y + 20, { align: "right" });

  y += 36;

  // Termo de Quitação e Assinatura
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  const termo = `Declaro para os devidos fins que recebi integralmente o valor de ${formatCurrency(
    data.settlement.total_amount
  )} referente à liquidação das comissões detalhadas acima, dando plena e irrevogável quitação.`;
  doc.text(doc.splitTextToSize(termo, CW), M, y);

  y += 18;

  // Linhas de Assinatura
  const sigW = 75;
  doc.setDrawColor(156, 163, 175);
  doc.line(M, y, M + sigW, y);
  doc.line(W - M - sigW, y, W - M, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(75, 85, 99);
  doc.text(data.collaboratorName, M + sigW / 2, y + 4, { align: "center" });
  doc.text("Assinatura do Colaborador", M + sigW / 2, y + 8, { align: "center" });

  doc.text(data.managerName, W - M - sigW / 2, y + 4, { align: "center" });
  doc.text("Responsável Financeiro", W - M - sigW / 2, y + 8, { align: "center" });

  // Salvar PDF
  const filename = `Recibo-Comissao-${data.collaboratorName.replace(/\s+/g, "_")}-${data.settlement.id.slice(0, 8)}.pdf`;
  doc.save(filename);
}
