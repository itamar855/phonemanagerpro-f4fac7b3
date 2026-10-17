import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { logAction } from "@/utils/auditLogger";
import { getStatusLabel } from "@/utils/osStatus";

export const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
export const formatPct = (v: number) => `${v.toFixed(1)}%`;

export const MONTHS = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
export const COLORS = ["hsl(152,60%,45%)","hsl(38,92%,50%)","hsl(210,80%,55%)","hsl(280,60%,55%)","hsl(0,62%,50%)"];

export const PDF_PRIMARY: [number, number, number] = [17, 24, 39];
export const PDF_ACCENT: [number, number, number] = [16, 185, 129];
export const PDF_TEXT: [number, number, number] = [30, 30, 30];
export const PDF_LIGHT: [number, number, number] = [107, 114, 128];
export const PDF_BG: [number, number, number] = [249, 250, 251];
export const PDF_BORDER: [number, number, number] = [229, 231, 235];
export const PDF_WHITE: [number, number, number] = [255, 255, 255];
export const PDF_RED: [number, number, number] = [239, 68, 68];
export const PDF_GREEN: [number, number, number] = [16, 185, 129];

export function pdfHeader(doc: jsPDF, titulo: string, subtitulo: string, periodo: string): number {
  const W = 210;
  const M = 12;
  doc.setFillColor(...PDF_PRIMARY);
  doc.rect(0, 0, W, 32, "F");
  doc.setFillColor(...PDF_ACCENT);
  doc.rect(0, 32, W, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...PDF_WHITE);
  doc.text("CELL PRO 360", M, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Sistema de Gestao Comercial", M, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PDF_ACCENT);
  doc.text(titulo.toUpperCase(), W - M, 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_WHITE);
  doc.text(subtitulo, W - M, 19, { align: "right" });
  doc.text("Periodo: " + periodo, W - M, 26, { align: "right" });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.text("Gerado em: " + new Date().toLocaleString("pt-BR"), M, 28);
  return 42;
}

export function pdfFooter(doc: jsPDF, pg: number) {
  const y = 290;
  doc.setDrawColor(...PDF_BORDER);
  doc.setLineWidth(0.2);
  doc.line(12, y - 4, 198, y - 4);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_LIGHT);
  doc.text("Cell Pro 360 - Relatorio gerado automaticamente - Uso interno", 12, y);
  doc.text("Pagina " + pg, 198, y, { align: "right" });
}

export function pdfKpiRow(doc: jsPDF, y: number, kpis: { label: string; value: string; color?: [number, number, number] }[]): number {
  const M = 12;
  const CW = 186;
  const bw = CW / kpis.length;
  kpis.forEach((k, i) => {
    const x = M + i * bw;
    doc.setFillColor(...PDF_BG);
    doc.rect(x, y, bw - 2, 18, "F");
    doc.setDrawColor(...PDF_BORDER);
    doc.rect(x, y, bw - 2, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...PDF_LIGHT);
    doc.text(k.label.toUpperCase(), x + 4, y + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...(k.color ?? PDF_TEXT));
    doc.text(k.value, x + 4, y + 14);
  });
  return y + 22;
}

export function pdfTableHead(doc: jsPDF, y: number, cols: { label: string; w: number }[]): number {
  const M = 12;
  const H = 8;
  doc.setFillColor(...PDF_PRIMARY);
  let x = M;
  cols.forEach(c => {
    doc.rect(x, y, c.w, H, "F");
    x += c.w;
  });
  x = M;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_WHITE);
  cols.forEach(c => {
    doc.text(c.label, x + 2, y + 5.5);
    x += c.w;
  });
  return y + H;
}

export function pdfTableRow(doc: jsPDF, y: number, cols: { w: number }[], vals: string[], even: boolean): number {
  const M = 12;
  const RH = 7;
  if (even) {
    doc.setFillColor(...PDF_BG);
    let x2 = M;
    cols.forEach(c => {
      doc.rect(x2, y, c.w, RH, "F");
      x2 += c.w;
    });
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_TEXT);
  let x = M;
  cols.forEach((c, i) => {
    const lines = doc.splitTextToSize(vals[i] ?? "", c.w - 4);
    doc.text(lines[0] ?? "", x + 2, y + 4.5);
    x += c.w;
  });
  return y + RH;
}

export function pdfCheckPage(doc: jsPDF, y: number, pg: { n: number }): number {
  if (y > 272) {
    pdfFooter(doc, pg.n);
    doc.addPage();
    pg.n++;
    return 18;
  }
  return y;
}

export function exportDREPDF(dreLines: any[], dre: any, periodo: string, loja: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 12;
  const W = 210;
  const CW = W - M * 2;
  const pg = { n: 1 };
  let y = pdfHeader(doc, "DRE - Demonstrativo de Resultado", loja, periodo);
  y = pdfKpiRow(doc, y, [
    { label: "Receita Total", value: formatCurrency(dre.totalReceita ?? 0), color: PDF_GREEN },
    { label: "Lucro Bruto", value: formatCurrency(dre.lucroBruto ?? 0), color: PDF_GREEN },
    { label: "Lucro Liquido", value: formatCurrency(dre.lucroLiquido ?? 0), color: (dre.lucroLiquido ?? 0) >= 0 ? PDF_GREEN : PDF_RED },
    { label: "Margem Liquida", value: (dre.totalReceita ?? 0) > 0 ? formatPct(((dre.lucroLiquido ?? 0) / dre.totalReceita) * 100) : "0%" },
  ]);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_PRIMARY);
  doc.text("DEMONSTRATIVO DE RESULTADO DO EXERCICIO", M, y + 5);
  y += 10;
  dreLines.forEach((line, i) => {
    y = pdfCheckPage(doc, y, pg);
    const isResult = line.type === "result";
    const isTotal = line.bold && !isResult;
    const rh = isResult ? 10 : 8;
    if (isResult) {
      doc.setFillColor(...PDF_ACCENT);
      doc.rect(M, y, CW, rh, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...PDF_WHITE);
    } else if (isTotal) {
      doc.setFillColor(...PDF_BG);
      doc.rect(M, y, CW, rh, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...PDF_PRIMARY);
    } else {
      if (i % 2 === 0) {
        doc.setFillColor(252, 252, 252);
        doc.rect(M, y, CW, rh, "F");
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...PDF_TEXT);
    }
    doc.text(line.label, M + 4, y + (isResult ? 6.5 : 5.5));
    const vs = line.type === "expense" ? "- " + formatCurrency(Math.abs(line.value)) : formatCurrency(Math.abs(line.value));
    if (!isResult && line.type === "expense") doc.setTextColor(...PDF_RED);
    doc.text(vs, W - M - 4, y + (isResult ? 6.5 : 5.5), { align: "right" });
    y += rh;
  });
  pdfFooter(doc, pg.n);
  doc.save("DRE-" + periodo.replace(/\//g, "-") + ".pdf");
  toast.success("PDF do DRE gerado!");
}

export function exportVendasPDF(rows: any[], periodo: string, loja: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pg = { n: 1 };
  let y = pdfHeader(doc, "Relatorio de Vendas", loja, periodo);
  const total = rows.reduce((s: number, r: any) => s + r.valor, 0);
  const lucro = rows.reduce((s: number, r: any) => s + r.lucro, 0);
  y = pdfKpiRow(doc, y, [
    { label: "Total Vendido", value: formatCurrency(total), color: PDF_GREEN },
    { label: "Lucro Total", value: formatCurrency(lucro), color: lucro >= 0 ? PDF_GREEN : PDF_RED },
    { label: "Qtd. Vendas", value: String(rows.length) },
    { label: "Ticket Medio", value: rows.length > 0 ? formatCurrency(total / rows.length) : formatCurrency(0) },
    { label: "Margem Media", value: total > 0 ? formatPct((lucro / total) * 100) : "0%" },
  ]);
  y += 4;
  const cols = [
    { label: "DATA", w: 22 },
    { label: "PRODUTO / MARCA", w: 54 },
    { label: "CLIENTE", w: 38 },
    { label: "LOJA", w: 30 },
    { label: "DINHEIRO", w: 26 },
    { label: "CARTAO", w: 26 },
    { label: "PIX", w: 22 },
    { label: "VALOR", w: 28 },
    { label: "LUCRO", w: 25 },
    { label: "MARGEM", w: 22 },
  ];
  y = pdfTableHead(doc, y, cols);
  rows.forEach((r: any, i: number) => {
    y = pdfCheckPage(doc, y, pg);
    y = pdfTableRow(doc, y, cols, [
      r.data,
      r.produto + " / " + r.marca,
      r.cliente,
      r.loja,
      r.dinheiro > 0 ? formatCurrency(r.dinheiro) : "-",
      r.cartao > 0 ? formatCurrency(r.cartao) : "-",
      r.pix > 0 ? formatCurrency(r.pix) : "-",
      formatCurrency(r.valor),
      formatCurrency(r.lucro),
      formatPct(r.margem),
    ], i % 2 === 0);
  });
  pdfFooter(doc, pg.n);
  doc.save("Vendas-" + periodo.replace(/\//g, "-") + ".pdf");
  toast.success("PDF de Vendas gerado!");
}

export function exportOSPDF(osData: any[], osStats: any, profileMap: Map<string, string>, periodo: string, loja: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pg = { n: 1 };
  let y = pdfHeader(doc, "Relatorio de OS - Servicos", loja, periodo);
  y = pdfKpiRow(doc, y, [
    { label: "Receita OS", value: formatCurrency(osStats.totalReceita ?? 0), color: PDF_GREEN },
    { label: "Custo Peças", value: formatCurrency(osStats.custoPecas ?? 0), color: PDF_RED },
    { label: "Margem da OS", value: formatCurrency(osStats.lucroBruto ?? 0), color: PDF_GREEN },
    { label: "Entregues", value: String(osStats.delivered ?? 0), color: PDF_GREEN },
    { label: "Recebidas", value: String(osStats.recebidas ?? 0) },
    { label: "Ticket Medio", value: formatCurrency(osStats.ticketMedio ?? 0) },
  ]);
  y += 4;
  const cols = [
    { label: "Nr OS", w: 20 },
    { label: "CLIENTE", w: 38 },
    { label: "APARELHO", w: 38 },
    { label: "SERVICO", w: 42 },
    { label: "TECNICO", w: 32 },
    { label: "STATUS", w: 26 },
    { label: "ENTRADA", w: 22 },
    { label: "ENTREGA", w: 22 },
    { label: "VALOR FINAL", w: 26 },
  ];
  y = pdfTableHead(doc, y, cols);
  osData.forEach((o: any, i: number) => {
    y = pdfCheckPage(doc, y, pg);
    y = pdfTableRow(doc, y, cols, [
      String(o.order_number ?? "-"),
      o.customer_name ?? "-",
      ((o.device_brand ?? "") + " " + (o.device_model ?? "")).trim() || "-",
      o.requested_service ?? "-",
      profileMap.get(o.technician_id) ?? "Sem técnico",
      getStatusLabel(o.status),
      new Date(o.created_at).toLocaleDateString("pt-BR"),
      o.delivered_at ? new Date(o.delivered_at).toLocaleDateString("pt-BR") : "—",
      formatCurrency(Number(o.final_price || o.estimated_price || 0)),
    ], i % 2 === 0);
  });
  pdfFooter(doc, pg.n);
  doc.save("OS-" + periodo.replace(/\//g, "-") + ".pdf");
  toast.success("PDF de OS gerado!");
}

export function exportCaixaPDF(caixaData: any[], caixaStats: any, periodo: string, loja: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pg = { n: 1 };
  let y = pdfHeader(doc, "Relatorio de Caixa", loja, periodo);
  y = pdfKpiRow(doc, y, [
    { label: "Total Caixas", value: String(caixaStats.total ?? 0) },
    { label: "Fechados", value: String(caixaStats.fechados ?? 0), color: PDF_GREEN },
    { label: "Abertos", value: String(caixaStats.abertos ?? 0) },
    { label: "Total Diferenca", value: formatCurrency(Math.abs(caixaStats.totalDiferenca ?? 0)), color: (caixaStats.totalDiferenca ?? 0) === 0 ? PDF_GREEN : PDF_RED },
  ]);
  y += 4;
  const cols = [
    { label: "DATA", w: 28 },
    { label: "LOJA", w: 42 },
    { label: "STATUS", w: 24 },
    { label: "ABERTURA", w: 30 },
    { label: "FECHAMENTO", w: 30 },
    { label: "ESPERADO", w: 30 },
    { label: "DIFERENCA", w: 28 },
  ];
  y = pdfTableHead(doc, y, cols);
  caixaData.forEach((r: any, i: number) => {
    y = pdfCheckPage(doc, y, pg);
    y = pdfTableRow(doc, y, cols, [
      r.data,
      r.loja,
      r.status,
      formatCurrency(r.abertura),
      r.status === "Fechado" ? formatCurrency(r.fechamento) : "-",
      r.status === "Fechado" ? formatCurrency(r.esperado) : "-",
      r.status === "Fechado" ? formatCurrency(r.diferenca) : "-",
    ], i % 2 === 0);
  });
  pdfFooter(doc, pg.n);
  doc.save("Caixa-" + periodo.replace(/\//g, "-") + ".pdf");
  toast.success("PDF de Caixa gerado!");
}

export function exportRankingPDF(ranking: any[], periodo: string, loja: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pg = { n: 1 };
  let y = pdfHeader(doc, "Ranking de Vendedores", loja, periodo);
  y = pdfKpiRow(doc, y, [
    { label: "Vendedores", value: String(ranking.length) },
    { label: "Total Vendido", value: formatCurrency(ranking.reduce((s, v) => s + v.totalVendas, 0)), color: PDF_GREEN },
    { label: "Total Comissoes", value: formatCurrency(ranking.reduce((s, v) => s + v.comissoes, 0)) },
    { label: "OS Entregues", value: String(ranking.reduce((s, v) => s + v.osEntregues, 0)) },
  ]);
  y += 4;
  const cols = [
    { label: "POS.", w: 14 },
    { label: "VENDEDOR", w: 52 },
    { label: "QTD. VENDAS", w: 30 },
    { label: "TOTAL VENDIDO", w: 38 },
    { label: "LUCRO GERADO", w: 36 },
    { label: "COMISSAO", w: 30 },
    { label: "OS ENTREGUES", w: 28 },
  ];
  y = pdfTableHead(doc, y, cols);
  ranking.forEach((v: any, i: number) => {
    y = pdfCheckPage(doc, y, pg);
    y = pdfTableRow(doc, y, cols, [
      (i + 1) + "o",
      v.nome,
      String(v.qtdVendas),
      formatCurrency(v.totalVendas),
      formatCurrency(v.lucro),
      v.comissoes > 0 ? formatCurrency(v.comissoes) : "-",
      String(v.osEntregues),
    ], i % 2 === 0);
  });
  pdfFooter(doc, pg.n);
  doc.save("Ranking-" + periodo.replace(/\//g, "-") + ".pdf");
  toast.success("PDF de Ranking gerado!");
}

export function exportComissoesPDF(comissoes: any[], periodo: string, loja: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pg = { n: 1 };
  let y = pdfHeader(doc, "Relatorio de Comissoes", loja, periodo);
  const tot = comissoes.reduce((s, c) => s + c.comissoes, 0);
  y = pdfKpiRow(doc, y, [
    { label: "Total a Pagar", value: formatCurrency(tot), color: PDF_RED },
    { label: "Colaboradores", value: String(comissoes.length) },
    { label: "Total Faturado", value: formatCurrency(comissoes.reduce((s, c) => s + c.totalVendas, 0)), color: PDF_GREEN },
    { label: "Margem / Lucro", value: formatCurrency(comissoes.reduce((s, c) => s + c.lucro, 0)), color: PDF_GREEN },
  ]);
  y += 4;
  const cols = [
    { label: "POS.", w: 12 },
    { label: "COLABORADOR", w: 45 },
    { label: "CARGO", w: 22 },
    { label: "QTD.", w: 25 },
    { label: "FATURADO", w: 30 },
    { label: "COM. VENDAS", w: 28 },
    { label: "COM. OS", w: 28 },
    { label: "TOTAL COM.", w: 28 },
  ];
  y = pdfTableHead(doc, y, cols);
  comissoes.forEach((v: any, i: number) => {
    y = pdfCheckPage(doc, y, pg);
    const cargo = v.role === "tecnico" ? "Técnico" : "Vendedor";
    const qtdStr = `${v.qtdVendas}v / ${v.osEntregues} OS`;
    y = pdfTableRow(doc, y, cols, [
      (i + 1) + "o",
      v.nome,
      cargo,
      qtdStr,
      formatCurrency(v.totalVendas),
      v.comissoesVendas > 0 ? formatCurrency(v.comissoesVendas) : "-",
      v.comissoesOS > 0 ? formatCurrency(v.comissoesOS) : "-",
      formatCurrency(v.comissoes),
    ], i % 2 === 0);
  });
  pdfFooter(doc, pg.n);
  doc.save("Comissoes-" + periodo.replace(/\//g, "-") + ".pdf");
  toast.success("PDF de Comissoes gerado!");
}

export function exportFinanceiroPDF(rows: any[], stats: any, period: string, loja: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pg = { n: 1 };
  let y = pdfHeader(doc, "Relatorio Financeiro Detalhado", loja, period);
  
  y = pdfKpiRow(doc, y, [
    { label: "Total Entradas", value: formatCurrency(stats.totalEntradas), color: PDF_GREEN },
    { label: "Total Saidas", value: formatCurrency(stats.totalSaidas), color: PDF_RED },
    { label: "Saldo Liquido", value: formatCurrency(stats.saldoLiquido), color: stats.saldoLiquido >= 0 ? PDF_GREEN : PDF_RED },
    { label: "Movimentacoes", value: String(rows.length) },
  ]);
  
  y += 4;
  
  const cols = [
    { label: "DATA", w: 25 },
    { label: "DESCRICAO", w: 85 },
    { label: "CATEGORIA", w: 45 },
    { label: "CONTA", w: 55 },
    { label: "TIPO", w: 25 },
    { label: "VALOR", w: 35 },
  ];
  
  y = pdfTableHead(doc, y, cols);
  
  rows.forEach((r: any, i: number) => {
    y = pdfCheckPage(doc, y, pg);
    y = pdfTableRow(doc, y, cols, [
      r.data,
      String(r.descricao || "").replace(/→/g, "-").replace(/—/g, "-"),
      r.categoria,
      r.conta,
      r.tipo,
      formatCurrency(r.valor),
    ], i % 2 === 0);
  });
  
  pdfFooter(doc, pg.n);
  doc.save("Financeiro-Detalhado-" + period.replace(/\//g, "-") + ".pdf");
  toast.success("PDF Financeiro gerado!");
}

export function exportCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) {
    toast.error("Sem dados para exportar");
    return;
  }
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(";"), ...rows.map(r => keys.map(k => String(r[k] ?? "").replace(/;/g, ",")).join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("CSV exportado!");
  logAction("DOWNLOAD_REPORT" as any, "reports", filename);
}
