import { jsPDF } from "jspdf";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const TERMOS = `1. Este documento é um comprovante interno de venda e não substitui a Nota Fiscal Eletrônica (NF-e).
2. Garantia de 90 dias para defeitos de fabricação do produto adquirido, a contar da data de emissão.
3. A garantia não cobre danos causados por mau uso, quedas, contato com líquidos, oxidação ou violação do produto.
4. Para acionar a garantia, apresente este comprovante juntamente com o produto em nossa loja.
5. Trocas e devoluções sujeitas à análise técnica em até 7 dias corridos após a compra.
6. Serviços de desbloqueio, limpeza e configuração não possuem garantia de resultado garantido.`;

export interface NotaFiscalData {
  numeroNota: string;
  dataVenda: string;
  lojaNome: string;
  lojaCnpj?: string;
  lojaEndereco?: string;
  lojaTelefone?: string;
  lojaWhatsapp?: string;
  lojaInstagram?: string;
  lojaLogoUrl?: string;
  clienteNome?: string;
  clienteCpf?: string;
  clienteTelefone?: string;
  clienteEmail?: string;
  clienteEndereco?: string;
  produtoNome: string;
  produtoMarca: string;
  produtoModelo?: string;
  produtoImei?: string;
  produtoCor?: string;
  valorVenda: number;
  subtotal?: number;
  desconto?: number;
  valorDinheiro?: number;
  valorCartao?: number;
  valorPix?: number;
  tradeIn?: boolean;
  tradeInValor?: number;
  tradeInNome?: string;
  observacoes?: string;
  garantiaDays?: number;
}

export const gerarNotaFiscalInterna = async (data: NotaFiscalData): Promise<any> => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 15; // Elegant wide margins
  const CW = W - M * 2;
  let y = M;

  // --- DESIGN SYSTEM ---
  const COLORS = {
    PRIMARY: [20, 40, 80] as [number, number, number], // Deep Premium Blue
    TEXT: [30, 30, 30] as [number, number, number],
    LIGHT_TEXT: [110, 110, 110] as [number, number, number],
    BG_SECTION: [248, 250, 252] as [number, number, number],
    BORDER: [226, 232, 240] as [number, number, number],
    WHITE: [255, 255, 255] as [number, number, number],
  };

  doc.setLineWidth(0.1);

  // --- HELPERS ---
  const drawSectionHeader = (title: string) => {
    doc.setFillColor(...COLORS.BG_SECTION);
    doc.rect(M, y, CW, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...COLORS.PRIMARY);
    doc.text(title.toUpperCase(), M + 4, y + 5.5);
    y += 8;
  };

  const drawField = (label: string, value: any, x: number, w: number, size = 9, bold = true) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...COLORS.LIGHT_TEXT);
    doc.text(label.toUpperCase(), x + 4, y + 5);
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...COLORS.TEXT);
    doc.text(String(value || "-"), x + 4, y + 10, { maxWidth: w - 8 });
  };

  // 1. PREMIUM HEADER
  if (data.lojaLogoUrl) {
    try { doc.addImage(data.lojaLogoUrl, "PNG", M, y, 22, 22); } catch (_) {}
  }
  
  const tx = data.lojaLogoUrl ? 26 : 0;
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...COLORS.PRIMARY);
  doc.text(data.lojaNome.toUpperCase(), M + tx, y + 6);
  
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...COLORS.TEXT);
  doc.text(data.lojaEndereco || "-", M + tx, y + 11, { maxWidth: 100 });
  doc.text(`WhatsApp/Fone: ${data.lojaWhatsapp || data.lojaTelefone || "-"}`, M + tx, y + 16);
  if (data.lojaCnpj) doc.text(`CNPJ: ${data.lojaCnpj}`, M + tx, y + 20);

  // Receipt Identifier
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...COLORS.PRIMARY);
  doc.text("COMPROVANTE DE VENDA", M + CW, y + 6, { align: "right" });
  doc.setFontSize(9); doc.setTextColor(...COLORS.TEXT);
  doc.text(`Nº ${data.numeroNota}`, M + CW, y + 12, { align: "right" });
  doc.text(data.dataVenda, M + CW, y + 17, { align: "right" });

  y += 28;

  // 2. WARRANTY BANNER (ULTRA HIGHLIGHT)
  doc.setFillColor(...COLORS.PRIMARY); doc.rect(M, y, CW, 14, "F");
  doc.setTextColor(...COLORS.WHITE); doc.setFont("helvetica", "bold"); doc.setFontSize(7);
  doc.text("PRAZO DE GARANTIA DO PRODUTO", M + 5, y + 5);
  doc.setFontSize(16);
  const diasG = data.garantiaDays || 90;
  doc.text(`${diasG} DIAS${diasG > 90 ? " (COBERTURA ESTENDIDA)" : ""}`, M + 5, y + 11);
  
  y += 18;

  // 3. CUSTOMER DATA
  drawSectionHeader("Informações do Cliente");
  doc.setDrawColor(...COLORS.BORDER); doc.rect(M, y, CW, 14);
  drawField("Nome do Cliente", data.clienteNome || "CONSUMIDOR FINAL", M, CW/2 + 20);
  doc.line(M + CW/2 + 20, y, M + CW/2 + 20, y + 14);
  drawField("CPF / CNPJ", data.clienteCpf, M + CW/2 + 20, CW/2 - 20);
  y += 14;
  doc.rect(M, y, CW, 14);
  drawField("Endereço Completo", data.clienteEndereco, M, CW - 60);
  doc.line(M + CW - 60, y, M + CW - 60, y + 14);
  drawField("Telefone / WhatsApp", data.clienteTelefone, M + CW - 60, 60);
  y += 18;

  // 4. DEVICE DETAILS (PREMIUM GRID)
  drawSectionHeader("Detalhes do Aparelho Adquirido");
  doc.rect(M, y, CW, 14);
  drawField("Produto / Modelo", `${data.produtoNome} ${data.produtoModelo || ""}`, M, CW/2);
  doc.line(M + CW/2, y, M + CW/2, y + 14);
  drawField("Marca", data.produtoMarca, M + CW/2, CW/4);
  doc.line(M + CW*0.75, y, M + CW*0.75, y + 14);
  drawField("Cor", data.produtoCor, M + CW*0.75, CW/4);
  y += 14;
  doc.rect(M, y, CW, 16);
  drawField("IMEI / Número de Série", data.produtoImei, M, CW - 60, 11);
  doc.line(M + CW - 60, y, M + CW - 60, y + 16);
  drawField("Valor Total", formatCurrency(data.valorVenda), M + CW - 60, 60, 14);
  y += 20;

  // 5. PAYMENT & NOTES
  drawSectionHeader("Pagamento e Observações");
  doc.setDrawColor(...COLORS.BORDER); doc.rect(M, y, CW, 20);
  const pays: string[] = [];
  if (data.subtotal && data.desconto && data.desconto > 0) {
    pays.push(`SUBTOTAL: ${formatCurrency(data.subtotal)}`);
    pays.push(`DESC: -${formatCurrency(data.desconto)}`);
  }
  if (data.valorDinheiro) pays.push(`DINHEIRO: ${formatCurrency(data.valorDinheiro)}`);
  if (data.valorPix) pays.push(`PIX: ${formatCurrency(data.valorPix)}`);
  if (data.valorCartao) pays.push(`CARTÃO: ${formatCurrency(data.valorCartao)}`);
  if (data.tradeInValor) pays.push(`TROCA: ${formatCurrency(data.tradeInValor)}`);
  
  doc.setFontSize(9); doc.setTextColor(...COLORS.TEXT);
  doc.text(pays.join("   |   ") || "PAGAMENTO À VISTA", M + 4, y + 6);
  
  if (data.observacoes) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...COLORS.LIGHT_TEXT);
    doc.text(`Obs: ${data.observacoes}`, M + 4, y + 12, { maxWidth: CW - 8 });
  }
  y += 25;

  // 6. LEGAL TERMS
  doc.setDrawColor(...COLORS.BORDER); doc.rect(M, y, CW, 45);
  doc.setFontSize(7); doc.setTextColor(...COLORS.LIGHT_TEXT);
  doc.text("TERMOS E CONDIÇÕES DE GARANTIA", M + 4, y + 5);
  
  const garantiaStr = data.garantiaDays ? `${data.garantiaDays} dias` : "90 dias";
  const finalTerms = TERMOS.replace("90 dias", garantiaStr);
  const termLines = doc.splitTextToSize(finalTerms, CW - 10);
  doc.text(termLines, M + 4, y + 10);

  // Signatures
  y += 55;
  doc.setDrawColor(...COLORS.TEXT); doc.setLineWidth(0.3);
  doc.line(M + 10, y, M + 80, y); doc.setFontSize(7); doc.text("ASSINATURA DA LOJA", M + 45, y + 4, { align: "center" });
  doc.line(M + CW - 80, y, M + CW - 10, y); doc.text("ASSINATURA DO CLIENTE", M + CW - 45, y + 4, { align: "center" });

  return doc;
};
