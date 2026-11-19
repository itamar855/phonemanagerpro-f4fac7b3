import { OS_STATUS_CONFIG as statusConfig } from "@/utils/osStatus";
import { checklistCount, checklistRows, formatDay, serviceBreakdown, type CheckMark, type OsPdfItem } from "./osPdfRules";
import { supabase } from "@/integrations/supabase/client";

export type { OsPdfItem } from "./osPdfRules";

/** Peças lançadas na OS com o valor cobrado do cliente (sem custo nem fornecedor). */
export const loadOsPdfItems = async (orderId: string): Promise<OsPdfItem[]> => {
  const { data, error } = await supabase
    .from("service_order_items")
    .select("quantity, unit_price, created_at, products (name, brand, model)")
    .eq("service_order_id", orderId)
    .order("created_at");
  if (error || !data) return [];
  return (data as any[]).map((i) => ({
    name: i.products?.name ?? "Peça",
    brand: i.products?.brand ?? null,
    model: i.products?.model ?? null,
    quantity: Number(i.quantity) || 1,
    unit_price: Number(i.unit_price) || 0,
  }));
};

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export const TERMS_TEXT = `1. O cliente declara que o aparelho foi entregue nas condições descritas nesta OS.
2. A loja não se responsabiliza por dados contidos no aparelho. Recomenda-se backup prévio.
3. Em caso de não retirada do aparelho após 90 dias da conclusão do serviço, a loja poderá dispor do mesmo para cobrir custos.
4. A garantia do serviço cobre apenas o defeito reparado e a peça substituída, pelo período de 90 dias.
5. O orçamento inicial pode sofrer alterações após análise técnica, mediante aprovação do cliente.
6. A loja não se responsabiliza por danos pré-existentes não descritos nesta OS.
7. Serviços de diagnóstico podem ter custo mesmo que o reparo não seja efetuado.`;

export const paymentLabels: Record<string, string> = {
  dinheiro: "Dinheiro",
  cartao_credito: "Cartão Crédito",
  cartao_debito: "Cartão Débito",
  pix: "PIX",
  outro: "Outro",
};

// ── Gera PDF via jsPDF (importado dinamicamente) ──────────────────────────
export const generateOSPdf = async (order: any, store: any, techName: string, publicUrl: string, items: OsPdfItem[] = []) => {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 12; // margins
  const CW = W - M * 2; // content width
  let y = 0;

  // ── REFINED PREMIUM PALETTE ─────────────────────────────────────────────
  const BLACK: [number, number, number] = [0, 0, 0];
  const DARK: [number, number, number] = [40, 40, 40];     // Principal values
  const MID: [number, number, number] = [80, 80, 80];      // Secondary info/Terms
  const SOFT: [number, number, number] = [110, 110, 110];  // Field Labels (Darkened for legibility)
  const LIGHT: [number, number, number] = [200, 200, 200]; // Borders
  const BG: [number, number, number] = [248, 248, 248];
  const WHITE: [number, number, number] = [255, 255, 255];

  const ensureSpace = (needed: number) => {
    if (y + needed > 278) { doc.addPage(); y = M; }
  };

  const storeName = store?.name || "Assistência Técnica";

  // ═════════════════════════════════════════════════════════════════════════
  //  HEADER
  // ═════════════════════════════════════════════════════════════════════════
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, W, 28, "F");

  let tx = M;
  if (store?.logo_url) {
    try {
      doc.setFillColor(...WHITE);
      doc.circle(M + 8, 14, 9, "F");
      doc.addImage(store.logo_url, "PNG", M + 1.5, 7.5, 13, 13);
      tx = M + 22;
    } catch (_) {}
  }

  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...WHITE);
  doc.text(storeName.toUpperCase(), tx, 13);

  const hParts: string[] = [];
  if (store?.cnpj) hParts.push(`CNPJ: ${store.cnpj}`);
  if (store?.phone) hParts.push(store.phone);
  if (store?.address) hParts.push(store.address);
  if (store?.instagram) hParts.push(store.instagram);
  if (hParts.length) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(220, 220, 220);
    doc.text(hParts.join("   |   "), tx, 19);
  }

  // OS Badge Box
  doc.setFillColor(...WHITE);
  doc.roundedRect(W - M - 40, 5, 40, 18, 2, 2, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...MID);
  doc.text("ORDEM DE SERVIÇO", W - M - 20, 12, { align: "center" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...BLACK);
  doc.text(`#${order.order_number}`, W - M - 20, 20, { align: "center" });

  y = 32;

  // ═════════════════════════════════════════════════════════════════════════
  //  STATUS ROW
  // ═════════════════════════════════════════════════════════════════════════
  const statusLabel = statusConfig[order.status]?.label ?? order.status;
  const fmtDT = (v: unknown) => {
    if (!v) return "";
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  doc.setFillColor(...BLACK);
  const statusW = doc.getStringUnitWidth(statusLabel.toUpperCase()) * 9 / doc.internal.scaleFactor + 12;
  doc.roundedRect(M, y + 1, Math.max(statusW, 42), 8, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...WHITE);
  doc.text(statusLabel.toUpperCase(), M + 5, y + 6.5);

  // Datas da OS à direita: entrada, previsão, conclusão e entrega
  const dates = ([
    ["ENTRADA", fmtDT(order.created_at)],
    ["PREVISÃO", order.delivered_at ? "" : fmtDT(order.estimated_completion)],
    ["CONCLUÍDA", order.delivered_at ? "" : fmtDT(order.completed_at)],
    ["ENTREGUE", fmtDT(order.delivered_at)],
  ] as [string, string][]).filter(([, v]) => v);
  let dx = W - M;
  [...dates].reverse().forEach(([label, value]) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...SOFT);
    doc.text(label, dx, y + 3, { align: "right" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...DARK);
    doc.text(value, dx, y + 7.5, { align: "right" });
    dx -= 34;
  });

  y += 13;

  // ═════════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═════════════════════════════════════════════════════════════════════════
  const sectionBox = (title: string, contentFn: () => void) => {
    ensureSpace(35);
    const startY = y;
    const startPage = (doc as any).internal.getNumberOfPages();
    doc.setFillColor(...BLACK);
    doc.rect(M, y, CW, 7, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...WHITE);
    doc.text(title.toUpperCase(), M + 4, y + 5);
    y += 10;
    contentFn();
    doc.setDrawColor(...LIGHT);
    doc.setLineWidth(0.35);
    if ((doc as any).internal.getNumberOfPages() === startPage) doc.rect(M, startY + 7, CW, y - startY - 7);
    else doc.line(M, y, W - M, y); // a seção virou a página: só fecha embaixo
    y += 4;
  };

  const printVal = (label: string, value: string, x: number, maxW: number) => {
    if (!value || value === "-") return 0;
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...SOFT);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...DARK);
    const lines = doc.splitTextToSize(String(value), maxW);
    doc.text(lines, x, y + 4.5);
    return 6.5 + (lines.length - 1) * 4;
  };

  const twoCol = (l1: string, v1: string, l2: string, v2: string) => {
    ensureSpace(16);
    const colW = (CW - 8) / 2;
    const yB = y;
    const h1 = printVal(l1, v1, M + 4, colW);
    y = yB;
    const h2 = printVal(l2, v2, M + 4 + colW + 4, colW);
    y = yB + Math.max(h1, h2) + 2;
  };

  const threeCol = (l1: string, v1: string, l2: string, v2: string, l3: string, v3: string) => {
    ensureSpace(16);
    const colW = (CW - 12) / 3;
    const yB = y;
    const h1 = printVal(l1, v1, M + 4, colW);
    y = yB;
    const h2 = printVal(l2, v2, M + 4 + colW + 4, colW);
    y = yB;
    const h3 = printVal(l3, v3, M + 4 + (colW + 4) * 2, colW);
    y = yB + Math.max(h1, h2, h3) + 2;
  };

  const fullField = (label: string, value: string) => {
    if (!value) return;
    ensureSpace(14);
    const h = printVal(label, value, M + 4, CW - 8);
    y += h + 1;
  };

  const divider = () => {
    doc.setDrawColor(...LIGHT); doc.setLineWidth(0.2);
    doc.line(M + 4, y, W - M - 4, y);
    y += 4;
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  CONTENT
  // ═════════════════════════════════════════════════════════════════════════
  sectionBox("DADOS DO CLIENTE", () => {
    threeCol("Nome Completo", order.customer_name || "", "Telefone", order.customer_phone || "", "CPF / Documento", order.customer_cpf || "");
  });

  sectionBox("APARELHO RECEBIDO", () => {
    twoCol("Marca", order.device_brand || "", "Modelo", order.device_model || "");
    if (order.device_color || order.device_imei || order.device_accessories) {
      divider();
      threeCol("Cor", order.device_color || "-", "IMEI", order.device_imei || "-", "Acessórios", order.device_accessories || "-");
    }
    if (order.device_password) {
      divider();
      doc.setFillColor(...BG); doc.rect(M + 3, y - 1, CW - 6, 12, "F");
      doc.setDrawColor(...BLACK); doc.setLineWidth(0.45); doc.rect(M + 3, y - 1, CW - 6, 12, "S");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...MID);
      doc.text("SENHA / PADRÃO DE DESBLOQUEIO", M + 7, y + 3);
      doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.setTextColor(...BLACK);
      doc.text(String(order.device_password), M + 7, y + 8.5);
      y += 15;
    }
    if (order.device_is_off) {
      divider();
      doc.setFillColor(254, 242, 242);
      doc.rect(M + 3, y - 1, CW - 6, 11, "F");
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.4);
      doc.rect(M + 3, y - 1, CW - 6, 11, "S");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(220, 38, 38);
      doc.text("ATENÇÃO: APARELHO DEU ENTRADA DESLIGADO", M + 7, y + 3);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(120, 50, 50);
      doc.text("Não temos como testar seus periféricos e afirmar que estão em perfeito funcionamento.", M + 7, y + 7.5);
      y += 14;
    }
    if (order.device_condition) { divider(); fullField("Observações de entrada / condição física", order.device_condition); }
  });

  sectionBox("SERVIÇO SOLICITADO", () => {
    threeCol("Defeito Relatado", order.reported_defect || "", "Serviço a Realizar", order.requested_service || "", "Técnico Responsável", techName || "");
  });

  // ── Checklist de testes: cada item com a situação na entrada e na saída ──
  const rows = checklistRows(order.entry_checklist, order.exit_checklist);
  if (rows.length) {
    const GREEN: [number, number, number] = [22, 128, 61];
    const RED: [number, number, number] = [200, 30, 30];
    const GRAY: [number, number, number] = [165, 165, 165];
    const stages = (["entry", "exit"] as const).filter((st) => rows.some((r) => r[st]));
    const half = Math.ceil(rows.length / 2);
    const rowH = 5.2;
    ensureSpace(42 + half * rowH);
    sectionBox("CHECKLIST DE TESTES DO APARELHO", () => {
      const drawMark = (m: CheckMark | null, cx: number, cy: number) => {
        if (!m) {
          doc.setDrawColor(...LIGHT); doc.setLineWidth(0.4); doc.line(cx - 1, cy, cx + 1, cy);
          return;
        }
        doc.setFillColor(...(m === "ok" ? GREEN : m === "defeito" ? RED : GRAY));
        doc.circle(cx, cy, 1.75, "F");
        doc.setDrawColor(...WHITE); doc.setLineWidth(0.45);
        if (m === "ok") { doc.line(cx - 0.85, cy + 0.05, cx - 0.25, cy + 0.7); doc.line(cx - 0.25, cy + 0.7, cx + 0.9, cy - 0.65); }
        else if (m === "defeito") { doc.line(cx - 0.7, cy - 0.7, cx + 0.7, cy + 0.7); doc.line(cx - 0.7, cy + 0.7, cx + 0.7, cy - 0.7); }
        else doc.line(cx - 0.8, cy, cx + 0.8, cy);
      };

      // Resumo de cada etapa
      const stageName = { entry: "Na entrada", exit: "Na entrega" } as const;
      stages.forEach((st) => {
        const c = checklistCount(rows, st);
        let x = M + 4;
        const part = (text: string, color: [number, number, number], bold = false) => {
          doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setTextColor(...color);
          doc.text(text, x, y);
          x += doc.getTextWidth(text);
        };
        doc.setFontSize(8.5);
        part(`${stageName[st]}:  `, DARK, true);
        if (c.ok === c.total) part(`${c.total} de ${c.total} itens funcionando`, GREEN, true);
        else {
          const bits: [string, [number, number, number]][] = [];
          if (c.ok) bits.push([`${c.ok} funcionando`, GREEN]);
          if (c.defects) bits.push([`${c.defects} com defeito`, RED]);
          if (c.untested) bits.push([`${c.untested} não testado${c.untested > 1 ? "s" : ""}`, MID]);
          bits.forEach(([t, col], i) => { if (i) part("  ·  ", SOFT); part(t, col, true); });
        }
        y += 4.5;
      });
      if (stages.includes("entry") && order.device_is_off) {
        doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...MID);
        doc.text("O aparelho deu entrada desligado: as funções que dependem dele ligado não puderam ser testadas na entrada.", M + 4, y);
        y += 4;
      }
      y += 1.5;

      // Tabela em duas colunas
      const gap = 6;
      const colW = (CW - 8 - gap) / 2;
      const markW = 15;
      const nameW = colW - markW * stages.length;
      const stageHead = { entry: "ENTRADA", exit: "SAÍDA" } as const;
      for (let c = 0; c < 2; c++) {
        if (c === 1 && rows.length <= half) break;
        const x0 = M + 4 + c * (colW + gap);
        doc.setFillColor(235, 235, 235); doc.rect(x0, y - 3.4, colW, 5, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...MID);
        doc.text("ITEM TESTADO", x0 + 2, y);
        stages.forEach((st, i) => doc.text(stageHead[st], x0 + nameW + markW * (i + 0.5), y, { align: "center" }));
      }
      y += 1.6;
      for (let r = 0; r < half; r++) {
        const top = y + r * rowH;
        for (let c = 0; c < 2; c++) {
          const row = rows[c * half + r];
          if (!row) continue;
          const x0 = M + 4 + c * (colW + gap);
          if (r % 2 === 1) { doc.setFillColor(...BG); doc.rect(x0, top, colW, rowH, "F"); }
          doc.setDrawColor(232, 232, 232); doc.setLineWidth(0.2); doc.line(x0, top + rowH, x0 + colW, top + rowH);
          const finalMark = row.exit ?? row.entry;
          doc.setFont("helvetica", finalMark === "defeito" ? "bold" : "normal"); doc.setFontSize(8);
          doc.setTextColor(...(finalMark === "defeito" ? RED : DARK));
          doc.text(doc.splitTextToSize(row.item, nameW - 3)[0], x0 + 2, top + rowH / 2 + 1.1);
          stages.forEach((st, i) => drawMark(row[st], x0 + nameW + markW * (i + 0.5), top + rowH / 2));
        }
      }
      y += half * rowH + 4;

      // Legenda
      let lx = M + 4;
      ([["ok", "Funcionando"], ["defeito", "Com defeito"], ["na", "Não testado"]] as [CheckMark, string][]).forEach(([m, label]) => {
        drawMark(m, lx + 1.75, y - 1);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...MID);
        doc.text(label, lx + 4.5, y);
        lx += 4.5 + doc.getTextWidth(label) + 7;
      });
      y += 2;
    });
  }

  const { lines: svcLines, total: svcTotal } = serviceBreakdown(order, items);
  if (svcLines.length) {
    sectionBox("SERVIÇO EXECUTADO", () => {
      const qX = W - M - 46, vX = W - M - 6;
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...SOFT);
      doc.text("SERVIÇOS E PEÇAS", M + 6, y);
      doc.text("QTD", qX, y, { align: "right" });
      doc.text("VALOR COBRADO", vX, y, { align: "right" });
      y += 5;
      svcLines.forEach((l) => {
        doc.setFont("helvetica", l.kind === "discount" ? "bold" : "normal"); doc.setFontSize(9.5);
        if (l.kind === "discount") doc.setTextColor(22, 120, 60); else doc.setTextColor(...DARK);
        const label = l.kind === "service" ? `- ${l.label}` : l.label;
        const name = doc.splitTextToSize(label, qX - M - 20);
        ensureSpace(name.length * 4.2 + 2);
        doc.text(name, M + 6, y);
        if (l.quantity !== null) doc.text(String(l.quantity), qX, y, { align: "right" });
        if (l.total !== null) doc.text(l.total < 0 ? `- ${formatCurrency(-l.total)}` : formatCurrency(l.total), vX, y, { align: "right" });
        y += name.length * 4.2 + 1.5;
      });
      doc.setDrawColor(...BLACK); doc.setLineWidth(0.6); doc.line(M + 4, y, W - M - 4, y);
      y += 5.5;
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...BLACK);
      doc.text("TOTAL DO SERVIÇO", M + 6, y);
      doc.text(formatCurrency(svcTotal), vX, y, { align: "right" });
      const estimated = Number(order.estimated_price) || 0;
      if (estimated > 0 && Math.abs(estimated - svcTotal) > 0.009) {
        y += 4.5;
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...SOFT);
        doc.text(`Orçamento inicial: ${formatCurrency(estimated)}`, vX, y, { align: "right" });
      }
      y += 5;
      if (order.warranty_end_date) {
        ensureSpace(16);
        divider();
        doc.setFillColor(240, 249, 243); doc.setDrawColor(22, 128, 61); doc.setLineWidth(0.35);
        doc.roundedRect(M + 4, y - 1, CW - 8, 9, 1.5, 1.5, "FD");
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(22, 110, 55);
        doc.text(`GARANTIA DO SERVIÇO ATÉ ${formatDay(order.warranty_end_date)}`, M + 8, y + 4.6);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MID);
        doc.text("Cobre o defeito reparado e as peças substituídas (ver termos).", W - M - 8, y + 4.6, { align: "right" });
        y += 11;
      }
    });
  } else {
    sectionBox("ORÇAMENTO / VALORES", () => {
      const halfW = (CW - 8) / 2;
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...SOFT);
      doc.text("VALOR ESTIMADO", M + 4, y);
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...DARK);
      doc.text(formatCurrency(Number(order.estimated_price || 0)), M + 4, y + 7);
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...SOFT);
      doc.text("VALOR FINAL", M + 4 + halfW + 4, y);
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...BLACK);
      doc.text(order.final_price ? formatCurrency(Number(order.final_price)) : "-", M + 4 + halfW + 4, y + 7);
      doc.setDrawColor(...MID); doc.setLineWidth(0.4); doc.line(M + halfW + 4, y - 2, M + halfW + 4, y + 10);
      y += 12;
    });
  }

  const hasPay = [order.payment_cash, order.payment_card, order.payment_pix, order.payment_other].some(v => Number(v) > 0);
  if (hasPay) {
    sectionBox("PAGAMENTO RECEBIDO", () => {
      const pays: [string, number][] = [];
      if (Number(order.payment_cash) > 0)  pays.push(["Dinheiro", Number(order.payment_cash)]);
      if (Number(order.payment_card) > 0)  pays.push(["Cartão",   Number(order.payment_card)]);
      if (Number(order.payment_pix)  > 0)  pays.push(["PIX",      Number(order.payment_pix)]);
      if (Number(order.payment_other) > 0) pays.push(["Outro",    Number(order.payment_other)]);
      const total = pays.reduce((s, [, v]) => s + v, 0);
      pays.forEach(([label, val]) => {
        doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...DARK);
        doc.text(label, M + 6, y);
        doc.text(formatCurrency(val), W - M - 6, y, { align: "right" });
        y += 5.5;
      });
      doc.setDrawColor(...BLACK); doc.setLineWidth(0.6); doc.line(M + 4, y, W - M - 4, y);
      y += 5.5;
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...BLACK);
      doc.text("TOTAL", M + 6, y);
      doc.text(formatCurrency(total), W - M - 6, y, { align: "right" });
      y += 5;
    });
  }

  sectionBox("TERMOS E CONDIÇÕES", () => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MID);
    const lines = doc.splitTextToSize(TERMS_TEXT, CW - 10);
    doc.text(lines, M + 5, y);
    y += lines.length * 3.2 + 2;
  });

  ensureSpace(42);
  if (order.signature_data) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...MID);
    doc.text("ASSINATURA DO CLIENTE:", M, y); y += 4;
    try { doc.addImage(order.signature_data, "PNG", M, y, 65, 24); y += 27; } catch (_) {}
    doc.setDrawColor(...BLACK); doc.setLineWidth(0.5); doc.line(M, y, M + 70, y);
    y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...MID);
    doc.text(order.customer_name || "Cliente", M, y);
    y += 6;
  } else {
    const sigW = (CW - 24) / 2;
    doc.setDrawColor(...BLACK); doc.setLineWidth(0.5);
    doc.line(M, y + 20, M + sigW, y + 20);
    doc.line(W - M - sigW, y + 20, W - M, y + 20);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MID);
    doc.text("Assinatura do Cliente", M, y + 25);
    doc.text("Assinatura / Carimbo da Loja", W - M - sigW, y + 25);
    y += 30;
  }

  ensureSpace(16);
  doc.setDrawColor(...BLACK); doc.setLineWidth(0.5); doc.roundedRect(M, y, CW, 12, 1.5, 1.5, "S");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...BLACK);
  doc.text("ACOMPANHE SUA OS ONLINE:", M + 5, y + 5.5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MID);
  doc.text(publicUrl, M + 5, y + 10);

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BLACK); doc.setLineWidth(0.3); doc.line(M, 286, W - M, 286);
    if (store?.pdf_footer) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(...MID);
      doc.text(store.pdf_footer, W / 2, 290, { align: "center", maxWidth: CW });
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...SOFT);
    doc.text(`${storeName}  |  ${new Date().toLocaleString("pt-BR")}  |  Cell Pro 360  |  Página ${i}/${pageCount}`, W / 2, 294, { align: "center" });
  }

  return doc;
};

// ── Gera Cupom 80mm ───────────────────────────────────────────────────────
export const generateThermalPdf = async (order: any, store: any, techName: string, publicUrl: string, items: OsPdfItem[] = []) => {
  const { default: jsPDF } = await import("jspdf");
  // Papel contínuo 80mm: desenha uma vez para medir e de novo no tamanho exato do conteúdo
  const render = (doc: any) => {
    let y = 10;
    const W = 80;
  
    const textC = (t: string, size=10, bold=false) => {
      doc.setFontSize(size); doc.setFont("helvetica", bold ? "bold" : "normal");
      const arr = doc.splitTextToSize(t, W - 10);
      doc.text(arr, W / 2, y, { align: "center" });
      y += arr.length * (size/2.5) + 3;
    };
  
    const textL = (l: string, v: string) => {
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.text(l + ":", 5, y);
      const lw = doc.getTextWidth(l + ": "); // medido em negrito, como o rótulo
      doc.setFont("helvetica", "normal");
      const arr = doc.splitTextToSize(v || "-", W - 10 - lw);
      doc.text(arr, 5 + lw, y);
      y += arr.length * 3 + 3;
    };

    // Peça/serviço à esquerda, valor à direita
    const priceLine = (l: string, v: string, bold = false) => {
      doc.setFontSize(8); doc.setFont("helvetica", bold ? "bold" : "normal");
      const vw = doc.getTextWidth(v) + 3;
      const arr = doc.splitTextToSize(l, W - 10 - vw);
      doc.text(arr, 5, y);
      doc.text(v, W - 5, y, { align: "right" });
      y += arr.length * 3 + 2;
    };
  
    const line = () => { doc.line(5, y, W-5, y); y += 4; };

    textC(store?.name || "Assistência Técnica", 12, true);
    if (store?.cnpj) textC(`CNPJ: ${store.cnpj}`, 8);
    if (store?.phone) textC(`Tel: ${store.phone}`, 8);
    line();
    textC(`ORDEM DE SERVIÇO #${order.order_number}`, 10, true);
    textC(new Date(order.created_at).toLocaleString("pt-BR"), 8);
    line();
    textL("Cliente", order.customer_name);
    if (order.customer_phone) textL("Tel", order.customer_phone);
    line();
    textL("Aparelho", `${order.device_brand} ${order.device_model}`);
    if (order.device_is_off) {
      textC("ALERTA: APARELHO RECEBIDO DESLIGADO", 7, true);
      textC("Não testamos periféricos.", 7);
    }
    textL("Defeito", order.reported_defect);
    textL("Serviço", order.requested_service);
    const { lines: svc, total } = serviceBreakdown(order, items);
    if (svc.length) {
      y += 1;
      svc.forEach((l) => priceLine(
        (l.quantity ?? 1) > 1 ? `${l.quantity}x ${l.label}` : l.kind === "service" ? `- ${l.label}` : l.label,
        l.total === null ? "" : l.total < 0 ? `- ${formatCurrency(-l.total)}` : formatCurrency(l.total),
      ));
      priceLine("TOTAL", formatCurrency(total), true);
      y += 1;
    }
    else textL("Orçamento", formatCurrency(Number(order.estimated_price || 0)));
    if (order.warranty_end_date) textL("Garantia até", formatDay(order.warranty_end_date));
    const checks = checklistRows(order.entry_checklist, order.exit_checklist);
    const stage = checks.some((r) => r.exit) ? "exit" : checks.some((r) => r.entry) ? "entry" : null;
    if (stage) {
      line();
      const c = checklistCount(checks, stage);
      textL(stage === "exit" ? "Testes na entrega" : "Testes na entrada", `${c.ok} de ${c.total} itens funcionando`);
      const names = (m: CheckMark) => checks.filter((r) => r[stage] === m).map((r) => r.item).join(", ");
      if (c.ok) textL("OK", names("ok"));
      if (c.defects) textL("Com defeito", names("defeito"));
      if (c.untested) textL("Não testado", names("na"));
    }
    line();
    textC("Acompanhe online:", 8);
    textC(publicUrl, 7);
    y += 10;
    textC("-----------------------------", 8);
    textC("Assinatura do Cliente", 8);
    return y;
  };
  const height = render(new jsPDF({ unit: "mm", format: [80, 2000] }));
  const doc = new jsPDF({ unit: "mm", format: [80, Math.max(120, Math.ceil(height) + 6)] });
  render(doc);
  return doc;
};

/**
 * Salva e opcionalmente visualiza o PDF em nova aba.
 * Resolve a incompatibilidade do Chrome/Chromium onde doc.save() sem anexar ao DOM
 * faz o download com nome de UUID sem extensão .pdf, gerando erro ao abrir no Windows.
 */
export const saveAndOpenPdf = (doc: any, filename: string, openInNewTab = true) => {
  const safeName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  const blobOutput = doc.output("blob");
  const pdfBlob = new Blob([blobOutput], { type: "application/pdf" });
  const blobUrl = URL.createObjectURL(pdfBlob);

  if (openInNewTab) {
    try {
      window.open(blobUrl, "_blank");
    } catch (_) {}
  }

  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = safeName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    try {
      document.body.removeChild(link);
    } catch (_) {}
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 120000);
  }, 1000);
};

