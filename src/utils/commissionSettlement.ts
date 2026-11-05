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
  status: "paid" | "cancelled";
  paid_at: string;
  receipt_url?: string | null;
  notes?: string | null;
  created_by: string;
  created_at: string;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
  cancelled_items_snapshot?: CommissionSettlementItem[] | null;
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
  order_number?: number | null;
  customer_name?: string | null;
  device_name?: string | null;
  service_name?: string | null;
  operation_date?: string | null;
  parts_summary?: string | null;
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

export interface CancelCommissionSettlementResponse {
  success: boolean;
  settlement_id: string;
  items_released: number;
  cash_reversal_mode: string;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const pdfSafe = (text?: string | null): string => {
  if (!text) return "";
  return String(text)
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "")
    .trim();
};

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
 * Anula atomicamente uma liquidação de comissão realizada por engano,
 * estornando lançamentos financeiros e devolvendo os itens para Pendente.
 */
export async function cancelCommissionSettlementRPC(
  settlementId: string,
  reason: string,
  refundToOpenRegister = false
): Promise<CancelCommissionSettlementResponse> {
  const { data, error } = await (supabase.rpc("cancel_commission_settlement" as any, {
    p_settlement_id: settlementId,
    p_reason: reason,
    p_refund_to_open_register: refundToOpenRegister,
  }) as any);

  if (error) {
    throw new Error(error.message || "Falha ao anular liquidação de comissão.");
  }

  return data as CancelCommissionSettlementResponse;
}

/**
 * Busca o histórico de liquidações para a loja ou colaborador.
 * Por padrão retorna apenas liquidações ativas ('paid') para proteger painéis de técnicos;
 * a gestão pode solicitar includeCancelled = true para auditoria completa.
 */
export async function fetchSettlementsHistory(
  storeId?: string,
  userId?: string,
  includeCancelled = false
): Promise<CommissionSettlement[]> {
  let query = supabase
    .from("commission_settlements" as any)
    .select("*")
    .order("paid_at", { ascending: false });

  if (!includeCancelled) {
    query = query.eq("status", "paid");
  }

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
 * Busca os itens de uma liquidação específica enriquecidos com dados completos
 * das Ordens de Serviço (número real, cliente, aparelho, serviço, peças e data) e Vendas.
 * Caso a liquidação tenha sido anulada, recupera o snapshot preservado para auditoria.
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

  const rawItems = (data as CommissionSettlementItem[]) || [];

  if (rawItems.length === 0) {
    const { data: settlementRow } = await (supabase
      .from("commission_settlements" as any)
      .select("cancelled_items_snapshot")
      .eq("id", settlementId)
      .maybeSingle() as any);

    if (Array.isArray(settlementRow?.cancelled_items_snapshot)) {
      return settlementRow.cancelled_items_snapshot as CommissionSettlementItem[];
    }
    return [];
  }

  const osIds = Array.from(
    new Set(rawItems.map((i) => i.service_order_id).filter((id): id is string => Boolean(id)))
  );
  const saleIds = Array.from(
    new Set(rawItems.map((i) => i.sale_id).filter((id): id is string => Boolean(id)))
  );

  const [osRes, osPartsRes, salesRes] = await Promise.all([
    osIds.length > 0
      ? supabase
          .from("service_orders")
          .select("id, order_number, customer_name, device_brand, device_model, requested_service, delivered_at, created_at")
          .in("id", osIds)
      : Promise.resolve({ data: [] as any[] }),
    osIds.length > 0
      ? (supabase
          .from("service_order_items" as any)
          .select("service_order_id, quantity, unit_cost, products(name)")
          .in("service_order_id", osIds) as any)
      : Promise.resolve({ data: [] as any[] }),
    saleIds.length > 0
      ? supabase
          .from("sales")
          .select("id, customer_name, created_at, products(name, brand, model)")
          .in("id", saleIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const osMap = new Map<string, any>((osRes.data || []).map((o: any) => [o.id, o]));
  const saleMap = new Map<string, any>((salesRes.data || []).map((s: any) => [s.id, s]));

  const partsListMap = new Map<string, string[]>();
  (osPartsRes.data || []).forEach((pt: any) => {
    if (!pt.service_order_id) return;
    const pName = pt.products?.name || "Peça";
    const qty = Number(pt.quantity || 1);
    const label = qty > 1 ? `${pName} (${qty}x)` : pName;
    const arr = partsListMap.get(pt.service_order_id) || [];
    arr.push(label);
    partsListMap.set(pt.service_order_id, arr);
  });

  return rawItems.map((item) => {
    if (item.item_type === "service_order" && item.service_order_id) {
      const os = osMap.get(item.service_order_id);
      const deviceName = [os?.device_brand, os?.device_model].filter(Boolean).join(" ").trim() || null;
      const partsArr = partsListMap.get(item.service_order_id);
      return {
        ...item,
        order_number: os?.order_number ?? item.order_number ?? null,
        customer_name: os?.customer_name ?? item.customer_name ?? null,
        device_name: deviceName ?? item.device_name ?? null,
        service_name: os?.requested_service ?? item.service_name ?? null,
        operation_date: os?.delivered_at || os?.created_at || item.operation_date || item.created_at,
        parts_summary: partsArr && partsArr.length > 0 ? partsArr.join(", ") : item.parts_summary ?? null,
      };
    }

    if (item.item_type === "sale" && item.sale_id) {
      const sale = saleMap.get(item.sale_id);
      const prod = sale?.products;
      const prodName =
        prod?.name || [prod?.brand, prod?.model].filter(Boolean).join(" ").trim() || item.device_name || "Produto";
      return {
        ...item,
        order_number: null,
        customer_name: sale?.customer_name ?? item.customer_name ?? null,
        device_name: prodName,
        service_name: item.service_name || "Venda PDV",
        operation_date: sale?.created_at || item.operation_date || item.created_at,
        parts_summary: null,
      };
    }

    return item;
  });
}

/**
 * Gera recibo formal de quitação de comissões em PDF com detalhamento completo de cada OS/Venda
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
  const CW = W - M * 2; // 186mm

  const safeStoreName = pdfSafe(data.storeName) || "Cell Pro 360";
  const safeCollabName = pdfSafe(data.collaboratorName) || "Colaborador";
  const safeManagerName = pdfSafe(data.managerName) || "Gestão Financeira";

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
  doc.text(`Loja: ${safeStoreName}`, M, 26);

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
  doc.text(safeCollabName, M + 4, y + 14);

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
      : pdfSafe(data.settlement.payment_method).toUpperCase();
  doc.text(metodoLabel, M + 140, y + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text(`Autorizado por: ${safeManagerName}`, M + 4, y + 20);

  y += 30;

  // Tabela de Itens Liquidados (Largura exata: 26 + 68 + 22 + 21 + 21 + 10 + 18 = 186mm)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(17, 24, 39);
  doc.text(`Demonstrativo das Operações Liquidadas (${data.items.length} itens)`, M, y);
  y += 4;

  const cols: Array<{ label: string; w: number; align: "left" | "right" }> = [
    { label: "OS / DATA", w: 26, align: "left" },
    { label: "DETALHES DO SERVIÇO / VENDA", w: 68, align: "left" },
    { label: "FATURADO", w: 22, align: "right" },
    { label: "CUSTO PEÇAS", w: 21, align: "right" },
    { label: "LUCRO BRUTO", w: 21, align: "right" },
    { label: "% COM.", w: 10, align: "right" },
    { label: "COMISSÃO", w: 18, align: "right" },
  ];

  const drawTableHeader = () => {
    doc.setFillColor(17, 24, 39);
    doc.rect(M, y, CW, 7, "F");

    let hx = M;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.3);
    doc.setTextColor(255, 255, 255);
    cols.forEach((c) => {
      if (c.align === "right") {
        doc.text(c.label, hx + c.w - 2, y + 4.8, { align: "right" });
      } else {
        doc.text(c.label, hx + 2, y + 4.8);
      }
      hx += c.w;
    });
    y += 7;
  };

  drawTableHeader();

  data.items.forEach((it, idx) => {
    const isSale = it.item_type === "sale";
    const refPrimary = isSale
      ? "Venda PDV"
      : it.order_number != null
      ? `OS #${it.order_number}`
      : `OS #${(it.service_order_id || "").slice(0, 8)}`;

    const opDateStr =
      it.operation_date || it.created_at
        ? formatBrasiliaDate(it.operation_date || it.created_at)
        : "";

    // Monta linhas ricas da coluna de detalhes com quebra automática em 64mm
    const detailSublines: Array<{ text: string; bold: boolean; muted: boolean }> = [];
    const maxDetailWidth = cols[1].w - 4;

    if (isSale) {
      const mainTitle = pdfSafe(it.device_name) || `Venda #${(it.sale_id || "").slice(0, 8)}`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      (doc.splitTextToSize(mainTitle, maxDetailWidth) as string[]).forEach((ln) => {
        detailSublines.push({ text: ln, bold: true, muted: false });
      });

      if (it.customer_name) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        (doc.splitTextToSize(`Cliente: ${pdfSafe(it.customer_name)}`, maxDetailWidth) as string[]).forEach((ln) => {
          detailSublines.push({ text: ln, bold: false, muted: true });
        });
      }
    } else {
      const mainParts = [pdfSafe(it.device_name), pdfSafe(it.service_name)].filter(Boolean);
      const mainTitle = mainParts.length > 0 ? mainParts.join(" - ") : "Ordem de Serviço";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      (doc.splitTextToSize(mainTitle, maxDetailWidth) as string[]).forEach((ln) => {
        detailSublines.push({ text: ln, bold: true, muted: false });
      });

      const custText = `Cliente: ${pdfSafe(it.customer_name) || "Não informado"}`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      (doc.splitTextToSize(custText, maxDetailWidth) as string[]).forEach((ln) => {
        detailSublines.push({ text: ln, bold: false, muted: true });
      });

      if (it.parts_summary) {
        const partsText = `Peças: ${pdfSafe(it.parts_summary)}`;
        (doc.splitTextToSize(partsText, maxDetailWidth) as string[]).forEach((ln) => {
          detailSublines.push({ text: ln, bold: false, muted: true });
        });
      }
    }

    const lineSpacing = 3.4;
    const rowH = Math.max(9.5, detailSublines.length * lineSpacing + 2.8);

    if (y + rowH > 268) {
      doc.addPage();
      y = 18;
      drawTableHeader();
    }

    if (idx % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(M, y, CW, rowH, "F");
    }

    doc.setDrawColor(235, 238, 242);
    doc.line(M, y + rowH, W - M, y + rowH);

    // Col 0: OS / Data
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(17, 24, 39);
    doc.text(refPrimary, M + 2, y + 4.2);

    if (opDateStr) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.3);
      doc.setTextColor(107, 114, 128);
      doc.text(opDateStr, M + 2, y + 7.6);
    }

    // Col 1: Detalhes multi-linha
    const detailX = M + cols[0].w + 2;
    detailSublines.forEach((dl, lIdx) => {
      doc.setFont("helvetica", dl.bold ? "bold" : "normal");
      doc.setFontSize(dl.bold ? 7 : 6.4);
      if (dl.muted) {
        doc.setTextColor(90, 98, 112);
      } else {
        doc.setTextColor(24, 32, 48);
      }
      doc.text(dl.text, detailX, y + 4.1 + lIdx * lineSpacing);
    });

    // Cols 2..6: Valores financeiros alinhados à direita
    const numericVals = [
      formatCurrency(Number(it.gross_amount)),
      it.cost_amount !== null ? formatCurrency(Number(it.cost_amount)) : "-",
      it.profit_amount !== null ? formatCurrency(Number(it.profit_amount)) : "-",
      `${it.commission_percent}%`,
      formatCurrency(Number(it.commission_amount)),
    ];

    let cx = M + cols[0].w + cols[1].w;
    numericVals.forEach((val, nIdx) => {
      const colCfg = cols[nIdx + 2];
      const isCommCol = nIdx === 4;
      doc.setFont("helvetica", isCommCol ? "bold" : "normal");
      doc.setFontSize(7);
      if (isCommCol) {
        doc.setTextColor(16, 145, 100);
      } else {
        doc.setTextColor(30, 30, 30);
      }
      doc.text(pdfSafe(val), cx + colCfg.w - 2, y + 4.6, { align: "right" });
      cx += colCfg.w;
    });

    y += rowH;
  });

  y += 5;

  // Paginação segura antes do Bloco de Totais + Termo + Assinaturas
  if (y + 62 > 282) {
    doc.addPage();
    y = 20;
  }

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
  doc.text(pdfSafe(formatCurrency(data.settlement.total_sales_commission)), W - M - 4, y + 6, { align: "right" });
  doc.text(pdfSafe(formatCurrency(data.settlement.total_service_commission)), W - M - 4, y + 12, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(16, 185, 129);
  doc.text(pdfSafe(formatCurrency(data.settlement.total_amount)), W - M - 4, y + 20, { align: "right" });

  y += 32;

  if (data.settlement.notes) {
    const obsLines = doc.splitTextToSize(`Observações: ${pdfSafe(data.settlement.notes)}`, CW) as string[];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(75, 85, 99);
    doc.text(obsLines, M, y);
    y += obsLines.length * 3.5 + 4;
  }

  // Termo de Quitação e Assinatura
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  const termo = pdfSafe(
    `Declaro para os devidos fins que recebi integralmente o valor de ${formatCurrency(
      data.settlement.total_amount
    )} referente à liquidação das comissões detalhadas acima, dando plena e irrevogável quitação.`
  );
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
  doc.text(safeCollabName, M + sigW / 2, y + 4, { align: "center" });
  doc.text("Assinatura do Colaborador", M + sigW / 2, y + 8, { align: "center" });

  doc.text(safeManagerName, W - M - sigW / 2, y + 4, { align: "center" });
  doc.text("Responsável Financeiro", W - M - sigW / 2, y + 8, { align: "center" });

  // Salvar PDF
  const filename = `Recibo-Comissao-${safeCollabName.replace(/\s+/g, "_")}-${data.settlement.id.slice(0, 8)}.pdf`;
  doc.save(filename);
}
