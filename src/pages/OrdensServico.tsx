import React, { useEffect, useState, useRef } from "react";
import SignatureCanvas from "@/components/SignatureCanvas";
import { AndroidPatternLock } from "@/components/AndroidPatternLock";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Wrench, Search, Clock, CheckCircle2, AlertCircle, Package,
  Phone, User, FileText, MessageCircle, Banknote, CreditCard, QrCode, DollarSign,
  Printer, ChevronRight, ChevronLeft, Camera, Upload, Receipt, Shield, Trash2, Store
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { KanbanBoard } from "@/components/KanbanBoard";
import { OsChecklist, ChecklistData, CHECKLIST_ITEMS, VISUAL_CHECKLIST_ITEMS } from "@/components/OsChecklist";
import { Checkbox } from "@/components/ui/checkbox";
import { OsPhotoGallery } from "@/components/OsPhotoGallery";
import { OsParts } from "@/components/OsParts";
import { triggerWebhook } from "@/utils/webhookSender";
import { logAction } from "@/utils/auditLogger";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const TERMS_TEXT = `1. O cliente declara que o aparelho foi entregue nas condições descritas nesta OS.
2. A loja não se responsabiliza por dados contidos no aparelho. Recomenda-se backup prévio.
3. Em caso de não retirada do aparelho após 90 dias da conclusão do serviço, a loja poderá dispor do mesmo para cobrir custos.
4. A garantia do serviço cobre apenas o defeito reparado e a peça substituída, pelo período de 90 dias.
5. O orçamento inicial pode sofrer alterações após análise técnica, mediante aprovação do cliente.
6. A loja não se responsabiliza por danos pré-existentes não descritos nesta OS.
7. Serviços de diagnóstico podem ter custo mesmo que o reparo não seja efetuado.`;

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  open:             { label: "Aberta",               color: "bg-blue-500/15 text-blue-400 border-blue-500/20",         icon: Clock       },
  analyzing:        { label: "Em Análise",           color: "bg-accent/15 text-accent border-accent/20",               icon: AlertCircle },
  waiting_part:     { label: "Aguardando Peça",      color: "bg-orange-500/15 text-orange-400 border-orange-500/20",   icon: Package     },
  repairing:        { label: "Em Reparo",            color: "bg-purple-500/15 text-purple-400 border-purple-500/20",   icon: Wrench      },
  waiting_approval: { label: "Aguardando Aprovação", color: "bg-accent/15 text-accent border-accent/20",               icon: AlertCircle },
  ready:            { label: "Pronta p/ Retirada",   color: "bg-primary/15 text-primary border-primary/20",            icon: CheckCircle2 },
  delivered:        { label: "Entregue",             color: "bg-muted text-muted-foreground border-border",            icon: CheckCircle2 },
  cancelled:        { label: "Cancelada",            color: "bg-destructive/15 text-destructive border-destructive/20", icon: AlertCircle },
};

const allStatuses = Object.keys(statusConfig);

const paymentLabels: Record<string, string> = {
  dinheiro: "Dinheiro", cartao_credito: "Cartão Crédito",
  cartao_debito: "Cartão Débito", pix: "PIX", outro: "Outro",
};

const createPendingCashEntry = async (
  storeId: string, userId: string, amount: number, description: string, paymentMethod = "dinheiro",
) => {
  if (!storeId || amount <= 0) return;
  const { data: register } = await supabase
    .from("cash_registers" as any).select("id")
    .eq("store_id", storeId).eq("status", "open").maybeSingle();
  
  const registerId = register ? (register as any).id : null;
  await supabase.from("cash_entries" as any).insert({
    cash_register_id: registerId, store_id: storeId,
    type: "entrada", amount, description,
    payment_method: paymentMethod, receipt_url: null,
    confirmed: false,
    created_by: userId,
  } as any);
};

// ── Gera PDF via jsPDF (importado dinamicamente) ──────────────────────────
const generateOSPdf = async (order: any, store: any, techName: string, publicUrl: string) => {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 12; // margins
  const CW = W - M * 2; // content width
  let y = 0;

  // ── REFINED PREMIUM PALETTE ──────────────────────────────────
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

  const storeName = store?.name || "Assistencia Tecnica";

  // ══════════════════════════════════════════════════════════════════════════
  //  HEADER
  // ══════════════════════════════════════════════════════════════════════════
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
  doc.text("ORDEM DE SERVICO", W - M - 20, 12, { align: "center" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...BLACK);
  doc.text(`#${order.order_number}`, W - M - 20, 20, { align: "center" });

  y = 32;

  // ══════════════════════════════════════════════════════════════════════════
  //  STATUS ROW
  // ══════════════════════════════════════════════════════════════════════════
  const statusLabel = statusConfig[order.status]?.label ?? order.status;
  const dateStr = new Date(order.created_at).toLocaleString("pt-BR");

  doc.setFillColor(...BLACK);
  const statusW = doc.getStringUnitWidth(statusLabel.toUpperCase()) * 9 / doc.internal.scaleFactor + 12;
  doc.roundedRect(M, y, Math.max(statusW, 42), 8, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...WHITE);
  doc.text(statusLabel.toUpperCase(), M + 5, y + 5.5);

  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MID);
  doc.text(`Emitida em ${dateStr}`, W - M, y + 5.5, { align: "right" });

  y += 13;

  // ══════════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════════════════════════════════════
  const sectionBox = (title: string, contentFn: () => void) => {
    ensureSpace(35);
    const startY = y;
    doc.setFillColor(...BLACK);
    doc.rect(M, y, CW, 7, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...WHITE);
    doc.text(title.toUpperCase(), M + 4, y + 5);
    y += 10;
    contentFn();
    const boxH = y - startY - 7;
    doc.setDrawColor(...LIGHT);
    doc.setLineWidth(0.35);
    doc.rect(M, startY + 7, CW, boxH);
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

  // ══════════════════════════════════════════════════════════════════════════
  //  CONTENT
  // ══════════════════════════════════════════════════════════════════════════
  sectionBox("DADOS DO CLIENTE", () => {
    twoCol("Nome Completo", order.customer_name || "", "Telefone", order.customer_phone || "");
    if (order.customer_cpf) { divider(); fullField("CPF / Documento", order.customer_cpf); }
  });

  sectionBox("APARELHO RECEBIDO", () => {
    twoCol("Marca", order.device_brand || "", "Modelo", order.device_model || "");
    divider();
    threeCol("Cor", order.device_color || "-", "IMEI", order.device_imei || "-", "Acessorios", order.device_accessories || "-");
    if (order.device_password) {
      divider();
      doc.setFillColor(...BG); doc.rect(M + 3, y - 1, CW - 6, 12, "F");
      doc.setDrawColor(...BLACK); doc.setLineWidth(0.45); doc.rect(M + 3, y - 1, CW - 6, 12, "S");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...MID);
      doc.text("SENHA / PADRAO DE DESBLOQUEIO", M + 7, y + 3);
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
      doc.text("ATENCAO: APARELHO DEU ENTRADA DESLIGADO", M + 7, y + 3);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(120, 50, 50);
      doc.text("Nao temos como testar seus perifericos e afirmar que estao em perfeito funcionamento.", M + 7, y + 7.5);
      y += 14;
    }
    if (order.device_condition) { divider(); fullField("Condicao Fisica", order.device_condition); }
  });

  sectionBox("SERVICO SOLICITADO", () => {
    fullField("Defeito Relatado", order.reported_defect || "");
    divider();
    fullField("Servico a Realizar", order.requested_service || "");
    if (techName) { divider(); fullField("Tecnico Responsavel", techName); }
  });

  sectionBox("ORCAMENTO / VALORES", () => {
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
    if (order.estimated_completion) { divider(); fullField("Previsao de Entrega", new Date(order.estimated_completion).toLocaleString("pt-BR")); }
  });

  const hasPay = [order.payment_cash, order.payment_card, order.payment_pix, order.payment_other].some(v => Number(v) > 0);
  if (hasPay) {
    sectionBox("PAGAMENTO RECEBIDO", () => {
      const pays: [string, number][] = [];
      if (Number(order.payment_cash) > 0)  pays.push(["Dinheiro", Number(order.payment_cash)]);
      if (Number(order.payment_card) > 0)  pays.push(["Cartao",   Number(order.payment_card)]);
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

  sectionBox("TERMOS E CONDICOES", () => {
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

// ── Gera Cupom 80mm ──────────────────────────
const generateThermalPdf = async (order: any, store: any, techName: string, publicUrl: string) => {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: [80, 200] }); // Formato contínuo 80mm
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
    doc.setFont("helvetica", "normal");
    const arr = doc.splitTextToSize(v, W - 10 - doc.getTextWidth(l + ": "));
    doc.text(arr, 5 + doc.getTextWidth(l + ": "), y);
    y += arr.length * 3 + 3;
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
    textC("Nao testamos perifericos.", 7);
  }
  textL("Defeito", order.reported_defect);
  textL("Serviço", order.requested_service);
  if (order.final_price) textL("Valor", formatCurrency(Number(order.final_price)));
  else textL("Orçamento", formatCurrency(Number(order.estimated_price || 0)));
  line();
  textC("Acompanhe online:", 8);
  textC(publicUrl, 7);
  y += 10;
  textC("-----------------------------", 8);
  textC("Assinatura do Cliente", 8);
  return doc;
};

const OrdensServico = () => {
  const { user, userRole, activeStoreId, setActiveStoreId } = useAuth();
  const isAdmin = userRole === "admin";
  const [orders, setOrders] = useState<Tables<"service_orders">[]>([]);
  const [stores, setStores] = useState<Tables<"stores">[]>([]);
  const [profiles, setProfiles] = useState<Tables<"profiles">[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterStoreId, setFilterStoreId] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [signatureData, setSignatureData] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "kanban">("kanban");
  const [justification, setJustification] = useState("");
  const [actionType, setActionType] = useState<"delete" | "status" | "transfer" | "update" | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<any>(null);
  const [justDialogOpened, setJustDialogOpened] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const isSubmitting = useRef(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [existingReceiptUrl, setExistingReceiptUrl] = useState<string | null>(null);

  // Update service form (shown in detail dialog)
  const [updateForm, setUpdateForm] = useState({
    final_price: "", technician_id: "",
    payment_cash: "", payment_card: "", payment_pix: "", payment_other: "", payment_notes: "",
    exit_checklist: {} as ChecklistData,
    warranty_end_date: "",
    justification: "",
  });

  const [passwordType, setPasswordType] = useState<"text" | "pattern">("text");
  const [patternImageData, setPatternImageData] = useState<string>("");
  const [deviceOffAgreed, setDeviceOffAgreed] = useState(false);

  const [form, setForm] = useState({
    customer_name: "", customer_phone: "", customer_cpf: "",
    device_brand: "iPhone", device_model: "", device_imei: "", device_color: "",
    device_condition: "", device_password: "", device_accessories: "",
    reported_defect: "", requested_service: "",
    store_id: "", estimated_price: "", estimated_completion: "",
    technician_id: "", terms_accepted: false, internal_notes: "",
    entry_checklist: {} as ChecklistData,
    device_is_off: false,
  });

  const fetchData = async () => {
    if (!activeStoreId) return;
    
    let query = supabase.from("service_orders").select("*");
    if (activeStoreId !== "all") {
      query = query.eq("store_id", activeStoreId);
    }
    
    const [ordersRes, storesRes, profilesRes] = await Promise.all([
      query.order("created_at", { ascending: false }),
      supabase.from("stores").select("*"),
      supabase.from("profiles").select("*"),
    ]);

    setOrders((ordersRes.data as any[]) ?? []);
    setStores(storesRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
  };

  useEffect(() => { fetchData(); }, [activeStoreId]);

  const uploadReceipt = async (file: File): Promise<string | null> => {
    const fileName = `${detailOrder?.order_number}-${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage.from("comprovantes").upload(`os-pagamentos/${fileName}`, file, { upsert: true });
    if (error) { toast.error("Erro no upload: " + error.message); return null; }
    const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  useEffect(() => {
    const channel = supabase.channel("service_orders_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const storeMap = new Map<string, string>(stores.map((s) => [s.id, s.name]));
  const profileMap = new Map<string, string>(profiles.map((p) => [p.user_id, p.display_name ?? ""]));

  const getPublicUrl = (orderId: string) => `${window.location.origin}/os/${orderId}`;

  const handleDeviceOffChange = (checked: boolean) => {
    setForm(prev => {
      const updatedChecklist = { ...prev.entry_checklist };
      
      CHECKLIST_ITEMS.forEach(item => {
        const isVisual = VISUAL_CHECKLIST_ITEMS.includes(item);
        if (!isVisual) {
          updatedChecklist[item] = checked ? "na" : "nao_testado";
        }
      });

      return {
        ...prev,
        device_is_off: checked,
        entry_checklist: updatedChecklist
      };
    });

    if (!checked) {
      setDeviceOffAgreed(false);
    }
  };

  const resetForm = () => {
    setForm({
      customer_name: "", customer_phone: "", customer_cpf: "",
      device_brand: "iPhone", device_model: "", device_imei: "", device_color: "",
      device_condition: "", device_password: "", device_accessories: "",
      reported_defect: "", requested_service: "",
      store_id: "", estimated_price: "", estimated_completion: "",
      technician_id: "", terms_accepted: false, internal_notes: "",
      entry_checklist: {} as ChecklistData,
      device_is_off: false,
    });
    setSignatureData("");
    setDeviceOffAgreed(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (loading || isSubmitting.current) return;

    if (form.device_is_off && !deviceOffAgreed) {
      toast.error("O cliente deve concordar com o termo de entrada de aparelho desligado!");
      return;
    }

    isSubmitting.current = true;
    setLoading(true);

    try {
      const storeIdToUse = activeStoreId === "all" ? form.store_id || stores[0]?.id : activeStoreId;

      // Duplication check — 60 second window for same user + customer + device
      const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();
      const { data: recentOS } = await supabase
        .from("service_orders")
        .select("id")
        .eq("created_by", user.id)
        .eq("customer_name", form.customer_name)
        .eq("device_brand", form.device_brand)
        .eq("device_model", form.device_model)
        .gt("created_at", sixtySecondsAgo)
        .limit(1);

      if (recentOS && recentOS.length > 0) {
        toast.error("OS duplicada bloqueada! Uma OS idêntica foi criada há menos de 60 segundos.");
        isSubmitting.current = false;
        setLoading(false);
        return;
      }

      if (form.customer_name) {
        let query = supabase.from("customers" as any).select("id").eq("name", form.customer_name);
        if (form.customer_phone) query = query.eq("phone", form.customer_phone);
        if (form.customer_cpf) query = query.eq("cpf", form.customer_cpf);
        
        const { data: extCust } = await query.limit(1).maybeSingle();
        
        if (!extCust) {
          await supabase.from("customers" as any).insert({
            name: form.customer_name,
            phone: form.customer_phone || null,
            cpf: form.customer_cpf || null,
            created_by: user.id,
            store_id: storeIdToUse,
          });
        }
      }

      const { error, data } = await supabase.from("service_orders").insert({
        customer_name: form.customer_name,
        customer_phone: form.customer_phone || null,
        customer_cpf: form.customer_cpf || null,
        device_brand: form.device_brand,
        device_model: form.device_model,
        device_imei: form.device_imei || null,
        device_color: form.device_color || null,
        device_condition: form.device_condition || null,
        device_password: form.device_password || null,
        device_accessories: form.device_accessories || null,
        reported_defect: form.reported_defect,
        requested_service: form.requested_service,
        store_id: storeIdToUse,
        technician_id: form.technician_id || null,
        estimated_price: form.estimated_price ? parseFloat(form.estimated_price) : 0,
        estimated_completion: form.estimated_completion || null,
        device_is_off: form.device_is_off,
        entry_checklist: form.entry_checklist,
        terms_accepted: form.terms_accepted,
        terms_text: TERMS_TEXT,
        signature_data: signatureData || null,
        internal_notes: form.internal_notes || null,
        created_by: user.id,
        status: "open",
      } as any).select().single();

      if (error) { 
        toast.error("Erro ao criar OS: " + error.message); 
      } else { 
        toast.success("Ordem de Serviço criada!"); 
        setDialogOpen(false); 
        resetForm(); 
        fetchData(); 
        logAction("CREATE_RECORD", "service_orders" as any, (data as any)?.id, null, form, storeIdToUse);
      }
    } catch (err: any) {
      toast.error("Erro inesperado: " + err.message);
    } finally {
      isSubmitting.current = false;
      setLoading(false);
    }
  };

  const updateStatus = async (orderId: string, newStatus: string, oldStatus: string, reason?: string) => {
    if (!user) return;
    if (isSubmitting.current) return;

    if ((newStatus === "delivered" || newStatus === "cancelled") && !reason) {
      setPendingUpdate({ orderId, newStatus, oldStatus });
      setActionType("status");
      setJustification("");
      setJustDialogOpened(true);
      return;
    }
    
    isSubmitting.current = true;
    const updates: any = { status: newStatus };
    if (newStatus === "delivered") updates.delivered_at = new Date().toISOString();
    if (newStatus === "ready") updates.completed_at = new Date().toISOString();

    const { error } = await supabase.from("service_orders").update(updates).eq("id", orderId);
    if (error) { 
      toast.error("Erro ao atualizar status"); 
      isSubmitting.current = false;
      return; 
    }

    const order = orders.find(o => o.id === orderId);
    if (order && (order as any).store_id) {
      triggerWebhook("os_status_changed", (order as any).store_id, {
        order_id: orderId,
        order_number: (order as any).order_number,
        customer: (order as any).customer_name,
        device: `${(order as any).device_brand} ${(order as any).device_model}`,
        old_status: oldStatus,
        new_status: newStatus,
      });
      logAction("UPDATE_OS_STATUS", "service_orders", orderId, { status: oldStatus }, { status: newStatus, reason }, (order as any).store_id);
    }

    await supabase.from("service_order_history").insert({
      service_order_id: orderId, old_status: oldStatus,
      new_status: newStatus, created_by: user.id, notes: reason || null,
    } as any);

    if (newStatus === "delivered") {
      const order = orders.find(o => o.id === orderId);
      if (order && (order as any).store_id) {
        const o = order as any;
        const desc = `OS #${o.order_number} — ${o.requested_service} (${o.customer_name})`;
        
        const cash = Number(o.payment_cash || 0);
        const card = Number(o.payment_card || 0);
        const pix = Number(o.payment_pix || 0);
        const other = Number(o.payment_other || 0);

        // Busca a primeira conta cadastrada para a loja
        const { data: accounts } = await supabase
          .from("store_bank_accounts")
          .select("*")
          .eq("store_id", o.store_id);
        
        const account = accounts && accounts.length > 0 ? accounts[0] : null;
        const defaultAccountId = account?.id || null;
        
        if (cash === 0 && card === 0 && pix === 0 && other === 0) {
          const amount = Number(o.final_price || o.estimated_price || 0);
          if (amount > 0) {
            await createPendingCashEntry(o.store_id, user.id, amount, desc, "dinheiro");
            await supabase.from("transactions").insert({
              type: "income",
              category: "Manutenção",
              amount,
              net_amount: amount,
              description: desc,
              store_id: o.store_id,
              created_by: user.id,
              expected_settlement_date: new Date().toISOString(),
              reconciled: false,
            });
          }
        } else {
          if (cash > 0) {
            await createPendingCashEntry(o.store_id, user.id, cash, desc, "dinheiro");
            await supabase.from("transactions").insert({
              type: "income",
              category: "Manutenção",
              amount: cash,
              net_amount: cash,
              description: desc,
              store_id: o.store_id,
              created_by: user.id,
              expected_settlement_date: new Date().toISOString(),
              reconciled: false,
            });
          }
          if (card > 0) {
            await createPendingCashEntry(o.store_id, user.id, card, desc, "cartao_credito");
            const fee = Number(account?.credit_fee_percent) || 0;
            const days = Number(account?.credit_settlement_days) || 30;
            const expectedDate = new Date();
            expectedDate.setDate(expectedDate.getDate() + days);
            await supabase.from("transactions").insert({
              type: "income",
              category: "Manutenção",
              amount: card,
              net_amount: card - (card * (fee / 100)),
              description: desc,
              store_id: o.store_id,
              created_by: user.id,
              destination_account_id: defaultAccountId,
              expected_settlement_date: expectedDate.toISOString(),
              reconciled: false,
            });
          }
          if (pix > 0) {
            await createPendingCashEntry(o.store_id, user.id, pix, desc, "pix");
            const fee = Number(account?.pix_fee_percent) || 0;
            const days = Number(account?.pix_settlement_days) || 0;
            const expectedDate = new Date();
            expectedDate.setDate(expectedDate.getDate() + days);
            await supabase.from("transactions").insert({
              type: "income",
              category: "Manutenção",
              amount: pix,
              net_amount: pix - (pix * (fee / 100)),
              description: desc,
              store_id: o.store_id,
              created_by: user.id,
              destination_account_id: defaultAccountId,
              expected_settlement_date: expectedDate.toISOString(),
              reconciled: false,
            });
          }
          if (other > 0) {
            await createPendingCashEntry(o.store_id, user.id, other, desc, "outro");
            await supabase.from("transactions").insert({
              type: "income",
              category: "Manutenção",
              amount: other,
              net_amount: other,
              description: desc,
              store_id: o.store_id,
              created_by: user.id,
              destination_account_id: defaultAccountId,
              expected_settlement_date: new Date().toISOString(),
              reconciled: false,
            });
          }
        }
        toast.info("Lançamentos financeiros registrados.");
      }
    }

    toast.success(`Status: ${statusConfig[newStatus]?.label}`);
    fetchData();
    if (detailOrder?.id === orderId) setDetailOrder({ ...detailOrder, status: newStatus });
    
    // Pequeno atraso para liberar o botão, evitando multi-clicks
    setTimeout(() => {
      isSubmitting.current = false;
    }, 1000);
  };

  const handleUpdateService = async () => {
    if (!user || !detailOrder) return;
    if (!updateForm.justification) { toast.error("Informe o motivo da alteração!"); return; }
    setLoading(true);

    const updates: any = {};
    if (updateForm.final_price) updates.final_price = parseFloat(updateForm.final_price);
    if (updateForm.technician_id) updates.technician_id = updateForm.technician_id;
    if (updateForm.payment_cash !== "") updates.payment_cash = parseFloat(updateForm.payment_cash) || 0;
    if (updateForm.payment_card !== "") updates.payment_card = parseFloat(updateForm.payment_card) || 0;
    if (updateForm.payment_pix !== "") updates.payment_pix = parseFloat(updateForm.payment_pix) || 0;
    if (updateForm.payment_other !== "") updates.payment_other = parseFloat(updateForm.payment_other) || 0;
    if (updateForm.payment_notes) updates.payment_notes = updateForm.payment_notes;
    updates.exit_checklist = updateForm.exit_checklist;
    if (updateForm.warranty_end_date) updates.warranty_end_date = new Date(updateForm.warranty_end_date).toISOString();
    
    updates.receipt_url = existingReceiptUrl;

    if (receiptFile) {
      const url = await uploadReceipt(receiptFile);
      if (url) updates.receipt_url = url;
    }

    const { error } = await supabase.from("service_orders").update(updates).eq("id", detailOrder.id);
    if (error) { toast.error(error.message); }
    else {
      toast.success("Serviço atualizado!");
      const updated = { ...detailOrder, ...updates };
      setDetailOrder(updated);
      fetchData();
      logAction("UPDATE_RECORD", "service_orders", detailOrder.id, null, { ...updates, justification: updateForm.justification }, detailOrder.store_id);
    }
    setLoading(false);
  };

  const handleDeleteOS = async (id: string, reason: string) => {
    
    setLoading(true);
    const { error } = await supabase.from("service_orders").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
    } else {
      toast.success("Ordem de Serviço removida!");
      setDetailOrder(null);
      fetchData();
      logAction("DELETE_RECORD", "service_orders", id, null, { reason }, activeStoreId);
    }
    setLoading(false);
  };

  const handleMoveStore = async (newStoreId: string, reason: string) => {
    if (!detailOrder) return;
    setLoading(true);
    const { error } = await supabase.from("service_orders").update({ store_id: newStoreId } as any).eq("id", detailOrder.id);
    if (error) {
      toast.error("Erro ao mover OS: " + error.message);
    } else {
      toast.success("OS movida para a nova unidade!");
      setDetailOrder({ ...detailOrder, store_id: newStoreId });
      fetchData();
      logAction("TRANSFER_STOCK" as any, "service_orders", detailOrder.id, { from: detailOrder.store_id }, { to: newStoreId, reason }, activeStoreId);
    }
    setLoading(false);
  };

  const handleExportPdf = async (order: any) => {
    setPdfLoading(true);
    try {
      const storeObj = stores.find(s => s.id === order.store_id) ?? { name: "Assistência Técnica" };
      const techName = profileMap.get(order.technician_id) ?? "";
      const publicUrl = getPublicUrl(order.id);
      const doc = await generateOSPdf(order, storeObj, techName, publicUrl);
      doc.save(`OS-${order.order_number}.pdf`);
      toast.success("PDF gerado!");
    } catch (err) {
      toast.error("Erro ao gerar PDF. Instale: npm install jspdf");
    }
    setPdfLoading(false);
  };

  const handleExportThermal = async (order: any) => {
    setPdfLoading(true);
    try {
      const storeObj = stores.find(s => s.id === order.store_id) ?? { name: "Assistência Técnica" };
      const techName = profileMap.get(order.technician_id) ?? "";
      const publicUrl = getPublicUrl(order.id);
      const doc = await generateThermalPdf(order, storeObj, techName, publicUrl);
      doc.save(`OS-Cupom-${order.order_number}.pdf`);
      toast.success("Cupom gerado (80mm)!");
    } catch (err) { toast.error("Erro ao gerar cupom termal."); }
    setPdfLoading(false);
  };

  const handleSendWhatsApp = async (order: any) => {
    if (!order.customer_phone) { toast.error("Cliente sem telefone cadastrado!"); return; }
    setPdfLoading(true);
    try {
      const storeObj = stores.find(s => s.id === order.store_id) ?? { name: "Assistência Técnica" };
      const techName = profileMap.get(order.technician_id) ?? "";
      const publicUrl = getPublicUrl(order.id);
      const doc = await generateOSPdf(order, storeObj, techName, publicUrl);

      // Faz upload do PDF para o Supabase Storage e compartilha o link
      const pdfBlob = doc.output("blob");
      const fileName = `os-${order.order_number}-${Date.now()}.pdf`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("comprovantes").upload(`os-pdfs/${fileName}`, pdfBlob, { upsert: true, contentType: "application/pdf" });

      let shareUrl = publicUrl;
      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(uploadData.path);
        shareUrl = urlData.publicUrl;
      }

      const phone = order.customer_phone.replace(/\D/g, "");
      const msg = encodeURIComponent(
        `Olá ${order.customer_name}! 👋\n\nSua Ordem de Serviço #${order.order_number} está com status: *${statusConfig[order.status]?.label}*.\n\n📄 Acesse sua OS completa:\n${shareUrl}\n\n_${storeObj.name}_`
      );
      window.open(`https://wa.me/55${phone}?text=${msg}`, "_blank");
      toast.success("WhatsApp aberto!");
    } catch (err) {
      toast.error("Erro ao preparar envio");
    }
    setPdfLoading(false);
  };

  const filtered = orders.filter((o: any) => {
    // Filtro por data
    if (filterStartDate) {
      const start = new Date(filterStartDate + "T00:00:00");
      const orderDate = new Date(o.created_at);
      if (orderDate < start) return false;
    }
    if (filterEndDate) {
      const end = new Date(filterEndDate + "T23:59:59");
      const orderDate = new Date(o.created_at);
      if (orderDate > end) return false;
    }

    const q = search.toLowerCase();
    const match = o.customer_name.toLowerCase().includes(q) ||
      (o.device_imei && o.device_imei.includes(search)) ||
      (o.device_model && o.device_model.toLowerCase().includes(q)) ||
      String(o.order_number).includes(search);
    
    const storeMatch = filterStoreId === "all" || o.store_id === filterStoreId;
    return match && (filterStatus === "all" || o.status === filterStatus) && storeMatch;
  });

  const statusCounts = orders.reduce((acc: any, o: any) => {
    acc[o.status] = (acc[o.status] || 0) + 1; return acc;
  }, {} as Record<string, number>);

  // Preenche updateForm quando abre o detail
  const openDetail = (order: any) => {
    setDetailOrder(order);
    setUpdateForm({
      final_price: order.final_price ? String(order.final_price) : "",
      technician_id: order.technician_id ?? "",
      payment_cash: order.payment_cash ? String(order.payment_cash) : "",
      payment_card: order.payment_card ? String(order.payment_card) : "",
      payment_pix: order.payment_pix ? String(order.payment_pix) : "",
      payment_other: order.payment_other ? String(order.payment_other) : "",
      payment_notes: order.payment_notes ?? "",
      exit_checklist: (order.exit_checklist as ChecklistData) || {},
      warranty_end_date: order.warranty_end_date ? new Date(order.warranty_end_date).toISOString().split('T')[0] : "",
      justification: "",
    });
  };

  const totalPaid = (o: any) =>
    (Number(o?.payment_cash) || 0) + (Number(o?.payment_card) || 0) +
    (Number(o?.payment_pix) || 0) + (Number(o?.payment_other) || 0);

  return (
    <div className="space-y-4">
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={e => { if (e.target.files?.[0]) setReceiptFile(e.target.files[0]); e.target.value = ""; }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { if (e.target.files?.[0]) setReceiptFile(e.target.files[0]); e.target.value = ""; }} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight">Ordens de Serviço</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{orders.length} ordens registradas</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-muted-foreground" />
            <Select value={activeStoreId} onValueChange={(v) => {
              setActiveStoreId(v);
              const s = stores.find(s => s.id === v);
              window.dispatchEvent(new CustomEvent("store-changed", { detail: { id: v, name: s?.name || "Todas as lojas" } }));
            }}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Selecionar Loja" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Lojas</SelectItem>
                {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2 h-10"><Plus className="h-4 w-4" /> Nova OS</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Abrir Ordem de Serviço</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Cliente */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <User className="h-3 w-3" /> Dados do Cliente
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome *</Label>
                    <Input value={form.customer_name} onChange={(e) => setForm(prev => ({ ...prev, customer_name: e.target.value }))} placeholder="Nome completo" required className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Telefone</Label>
                    <Input value={form.customer_phone} onChange={(e) => setForm(prev => ({ ...prev, customer_phone: e.target.value }))} placeholder="(11) 99999-9999" className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">CPF</Label>
                    <Input value={form.customer_cpf} onChange={(e) => setForm(prev => ({ ...prev, customer_cpf: e.target.value }))} placeholder="000.000.000-00" className="h-10" />
                  </div>
                </div>
              </div>

              {/* Aparelho */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> Dados do Aparelho
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Marca *</Label>
                    <Select value={form.device_brand} onValueChange={(v) => setForm({ ...form, device_brand: v })}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["iPhone","Samsung","Xiaomi","Motorola","Huawei","Outro"].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Modelo *</Label>
                    <Input value={form.device_model} onChange={(e) => setForm(prev => ({ ...prev, device_model: e.target.value }))} placeholder="iPhone 13 Pro" required className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">IMEI</Label>
                    <Input value={form.device_imei} onChange={(e) => setForm(prev => ({ ...prev, device_imei: e.target.value }))} placeholder="352000000000000" className="h-10" />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cor</Label>
                    <Input value={form.device_color} onChange={(e) => setForm(prev => ({ ...prev, device_color: e.target.value }))} placeholder="Preto" className="h-10" />
                  </div>
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <Label className="text-xs">Senha / Padrão</Label>
                    <div className="flex gap-1 mb-2">
                      <button
                        type="button"
                        onClick={() => setPasswordType("text")}
                        className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${passwordType === "text" ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                      >
                        Senha
                      </button>
                      <button
                        type="button"
                        onClick={() => setPasswordType("pattern")}
                        className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${passwordType === "pattern" ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                      >
                        Padrão Android
                      </button>
                    </div>
                    {passwordType === "text" ? (
                      <Input value={form.device_password} onChange={(e) => setForm(prev => ({ ...prev, device_password: e.target.value }))} placeholder="****" className="h-10" />
                    ) : (
                      <AndroidPatternLock
                        size={210}
                        onPattern={(pattern, imgData) => {
                          setForm({ ...form, device_password: pattern ? `Padrão: ${pattern}` : "" });
                          setPatternImageData(imgData);
                        }}
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Acessórios</Label>
                    <Input value={form.device_accessories} onChange={(e) => setForm(prev => ({ ...prev, device_accessories: e.target.value }))} placeholder="Carregador, capa" className="h-10" />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 p-3 my-2">
                  <div className="space-y-0.5 max-w-[85%]">
                    <Label className="text-xs text-red-500 font-bold block cursor-pointer" htmlFor="device-is-off-switch">
                      Aparelho está dando entrada Desligado
                    </Label>
                    <span className="text-[10px] text-muted-foreground block">
                      Não temos como testar seus periféricos e afirmar que estão em perfeito funcionamento.
                    </span>
                  </div>
                  <Switch 
                    id="device-is-off-switch"
                    checked={form.device_is_off}
                    onCheckedChange={(checked) => handleDeviceOffChange(checked)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Condição Física</Label>
                  <Textarea value={form.device_condition} onChange={(e) => setForm(prev => ({ ...prev, device_condition: e.target.value }))} placeholder="Descreva avarias existentes" className="min-h-[60px]" />
                </div>
              </div>

              {/* Serviço */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Wrench className="h-3 w-3" /> Serviço
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Defeito Relatado *</Label>
                  <Textarea value={form.reported_defect} onChange={(e) => setForm(prev => ({ ...prev, reported_defect: e.target.value }))} placeholder="Descreva o problema relatado pelo cliente" required className="min-h-[60px]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Loja da OS</Label>
                    <Select 
                      value={form.store_id || (activeStoreId === "all" ? "" : activeStoreId)} 
                      onValueChange={(v) => setForm(prev => ({ ...prev, store_id: v }))}
                      disabled={activeStoreId !== "all"}
                    >
                      <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Previsão de Entrega</Label>
                    <Input type="datetime-local" value={form.estimated_completion} onChange={(e) => setForm(prev => ({ ...prev, estimated_completion: e.target.value }))} className="h-10" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Serviço Solicitado *</Label>
                  <Select value={form.requested_service} onValueChange={(v) => setForm(prev => ({ ...prev, requested_service: v }))}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Selecione o serviço" /></SelectTrigger>
                    <SelectContent>
                      {["Troca de Tela","Troca de Bateria","Reparo de Placa","Troca de Conector","Troca de Câmera","Desbloqueio","Formatação","Diagnóstico","Outro"].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Valor Estimado (R$)</Label>
                    <Input type="number" step="0.01" value={form.estimated_price} onChange={(e) => setForm(prev => ({ ...prev, estimated_price: e.target.value }))} placeholder="150.00" className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Técnico Responsável</Label>
                    <Select value={form.technician_id} onValueChange={(v) => setForm(prev => ({ ...prev, technician_id: v }))}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name ?? p.user_id}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Loja</Label>
                    <Select value={form.store_id} onValueChange={(v) => setForm(prev => ({ ...prev, store_id: v }))}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                      <SelectContent>{stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Checklist de Entrada */}
              <OsChecklist
                title="Checklist de Entrada"
                data={form.entry_checklist}
                onChange={(d) => setForm(prev => ({ ...prev, entry_checklist: d }))}
                deviceIsOff={form.device_is_off}
              />

              {/* Termos */}
              <div className="space-y-3 rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Termos e Condições</p>
                <div className="rounded bg-muted/50 p-3 max-h-32 overflow-y-auto">
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{TERMS_TEXT}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.terms_accepted} onCheckedChange={(v) => setForm(prev => ({ ...prev, terms_accepted: v }))} />
                  <Label className="text-xs">Cliente aceita os termos acima</Label>
                </div>
              </div>

              {form.device_is_off && (
                <div className="flex items-start gap-2.5 rounded-lg border border-red-500/25 bg-red-500/5 p-3.5 my-2">
                  <Checkbox 
                    id="device-off-agreement"
                    checked={deviceOffAgreed} 
                    onCheckedChange={(v) => setDeviceOffAgreed(!!v)} 
                    className="mt-0.5 border-red-500/50 data-[state=checked]:bg-red-500 data-[state=checked]:text-white"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="device-off-agreement" className="text-xs leading-normal font-semibold text-red-500 cursor-pointer block">
                      Declaração de Aparelho Desligado *
                    </Label>
                    <span className="text-[10.5px] text-muted-foreground block leading-relaxed">
                      Concordo e declaro estar ciente de que o <strong>Aparelho está dando entrada Desligado (Não temos como testar seus periféricos e afirmar que estão em perfeito funcionamento)</strong>.
                    </span>
                  </div>
                </div>
              )}

              <SignatureCanvas onSave={setSignatureData} initialData={signatureData} />

              <div className="space-y-1.5">
                <Label className="text-xs">Observações Internas</Label>
                <Textarea value={form.internal_notes} onChange={(e) => setForm(prev => ({ ...prev, internal_notes: e.target.value }))} placeholder="Notas internas (não aparecem para o cliente)..." className="min-h-[50px]" />
              </div>

              <Button type="submit" className="w-full h-11 font-semibold" disabled={loading || isSubmitting.current || !form.requested_service}>
                {loading || isSubmitting.current ? "Criando OS... aguarde" : "Abrir Ordem de Serviço"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        <Button className={`h-7 px-3 text-xs shrink-0 ${filterStatus === "all" ? "bg-primary text-primary-foreground" : "bg-transparent border border-border text-foreground hover:bg-muted"}`} onClick={() => setFilterStatus("all")}>
          Todas ({orders.length})
        </Button>
        {allStatuses.filter((s) => statusCounts[s]).map((s) => (
          <Button key={s} className={`h-7 px-3 text-xs shrink-0 ${filterStatus === s ? "bg-primary text-primary-foreground" : "bg-transparent border border-border text-foreground hover:bg-muted"}`} onClick={() => setFilterStatus(s)}>
            {statusConfig[s].label} ({statusCounts[s]})
          </Button>
        ))}
      </div>

      {/* Search + Date Filter */}
      <div className="flex gap-2 w-full flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, IMEI, modelo ou nº da OS..." className="pl-9 h-10" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-xs text-muted-foreground shrink-0">De</Label>
          <Input
            type="date"
            value={filterStartDate}
            onChange={e => setFilterStartDate(e.target.value)}
            className="h-10 w-[145px]"
          />
          <Label className="text-xs text-muted-foreground shrink-0">Até</Label>
          <Input
            type="date"
            value={filterEndDate}
            onChange={e => setFilterEndDate(e.target.value)}
            className="h-10 w-[145px]"
          />
          {(filterStartDate || filterEndDate) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-10 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setFilterStartDate(""); setFilterEndDate(""); }}
            >
              Limpar
            </Button>
          )}
        </div>
        <Button className={`px-4 h-10 border text-xs gap-2 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-transparent text-foreground hover:bg-muted"}`} onClick={() => setViewMode(v => v === "list" ? "kanban" : "list")}>
          {viewMode === "list" ? "Ver Kanban" : "Ver Lista"}
        </Button>
      </div>

      {/* List or Kanban */}
      {viewMode === "list" ? (
      <div className="space-y-2">
        {filtered.length > 0 ? filtered.map((order: any) => {
          const sc = statusConfig[order.status] || statusConfig.open;
          return (
            <Card key={order.id} className="border-border/50 shadow-lg shadow-black/10 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => openDetail(order)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground font-mono">#{order.order_number}</span>
                      <p className="font-medium text-sm truncate">{order.customer_name}</p>
                      <Badge className={`text-[10px] border ${sc.color}`}>{sc.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {order.device_brand} {order.device_model}{order.device_imei && ` · ${order.device_imei}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.requested_service} · {storeMap.get(order.store_id || "") || "—"}
                      {order.technician_id && ` · ${profileMap.get(order.technician_id) ?? ""}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display font-bold text-sm">{formatCurrency(Number(order.final_price || order.estimated_price || 0))}</p>
                    {totalPaid(order) > 0 && <p className="text-[10px] text-primary">Pago: {formatCurrency(totalPaid(order))}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(order.created_at).toLocaleDateString("pt-BR")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        }) : (
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Wrench className="h-10 w-10 mb-3 opacity-30" />
              <p className="font-medium text-sm">Nenhuma OS encontrada</p>
            </CardContent>
          </Card>
        )}
      </div>
      ) : (
        <KanbanBoard 
          orders={filtered} 
          statusConfig={statusConfig as any} 
          allStatuses={allStatuses} 
          storeMap={storeMap} 
          profileMap={profileMap} 
          formatCurrency={formatCurrency} 
          onOrderClick={openDetail} 
          onStatusChange={updateStatus} 
        />
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailOrder} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          {detailOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display flex items-center gap-2">
                  <span className="text-muted-foreground font-mono text-sm">#{detailOrder.order_number}</span>
                  OS — {detailOrder.customer_name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">

                {/* Status + ações */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-[10px] border ${statusConfig[detailOrder.status]?.color}`}>
                      {statusConfig[detailOrder.status]?.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{new Date(detailOrder.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                    <Button className="h-8 px-3 text-[10px] gap-1 border bg-transparent text-foreground hover:bg-muted"
                      onClick={() => handleExportPdf(detailOrder)} disabled={pdfLoading}>
                      <FileText className="h-3 w-3" /> PDF A4
                    </Button>
                    <Button className="h-8 px-3 text-[10px] gap-1 border bg-transparent text-foreground hover:bg-muted"
                      onClick={() => handleExportThermal(detailOrder)} disabled={pdfLoading}>
                      <Printer className="h-3 w-3" /> Cupom 80mm
                    </Button>
                    <Button className="h-8 px-3 text-[10px] gap-1 border bg-transparent text-green-500 border-green-500/30 hover:bg-green-500/10"
                      onClick={() => handleSendWhatsApp(detailOrder)} disabled={pdfLoading}>
                      <MessageCircle className="h-3 w-3" /> WhatsApp
                    </Button>
                  </div>
                </div>

                {/* Link público */}
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <span className="text-[10px] text-muted-foreground flex-1 truncate">{getPublicUrl(detailOrder.id)}</span>
                  <Button className="h-6 text-[10px] bg-transparent hover:bg-muted"
                    onClick={() => { navigator.clipboard.writeText(getPublicUrl(detailOrder.id)); toast.success("Link copiado!"); }}>
                    Copiar
                  </Button>
                </div>

                {/* Cliente */}
                <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
                  <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">Cliente</p>
                  <p className="font-medium">{detailOrder.customer_name}</p>
                  {detailOrder.customer_phone && <p>📞 {detailOrder.customer_phone}</p>}
                  {detailOrder.customer_cpf && <p>CPF: {detailOrder.customer_cpf}</p>}
                </div>

                {/* Aparelho */}
                <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
                  <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">Aparelho</p>
                  <p className="font-medium">{detailOrder.device_brand} {detailOrder.device_model}</p>
                  {detailOrder.device_imei && <p>IMEI: {detailOrder.device_imei}</p>}
                  {detailOrder.device_color && <p>Cor: {detailOrder.device_color}</p>}
                  {detailOrder.device_condition && <p>Condição: {detailOrder.device_condition}</p>}
                  {detailOrder.device_accessories && <p>Acessórios: {detailOrder.device_accessories}</p>}
                  {detailOrder.device_is_off && (
                    <div className="mt-2 p-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg text-[10px] font-bold leading-normal">
                      ⚠️ APARELHO DEU ENTRADA DESLIGADO
                      <span className="block font-medium text-muted-foreground mt-0.5">
                        Não foi possível testar os periféricos e afirmar que estão em perfeito funcionamento.
                      </span>
                    </div>
                  )}
                </div>

                {/* Serviço */}
                <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
                  <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">Serviço</p>
                  <p><span className="text-muted-foreground">Defeito:</span> {detailOrder.reported_defect}</p>
                  <p><span className="text-muted-foreground">Serviço:</span> {detailOrder.requested_service}</p>
                  {detailOrder.technician_id && <p><span className="text-muted-foreground">Técnico:</span> {profileMap.get(detailOrder.technician_id) ?? "—"}</p>}
                  <p><span className="text-muted-foreground">Estimado:</span> {formatCurrency(Number(detailOrder.estimated_price || 0))}</p>
                  {detailOrder.final_price && <p><span className="text-muted-foreground">Final:</span> <span className="font-bold text-primary">{formatCurrency(Number(detailOrder.final_price))}</span></p>}
                  {detailOrder.estimated_completion && <p><span className="text-muted-foreground">Previsão:</span> {new Date(detailOrder.estimated_completion).toLocaleString("pt-BR")}</p>}
                  {detailOrder.warranty_end_date && <p><span className="text-muted-foreground">Garantia até:</span> <span className="font-bold text-green-500">{new Date(detailOrder.warranty_end_date).toLocaleDateString("pt-BR")}</span></p>}
                </div>

                {/* Entry Checklist Viewer */}
                {detailOrder.entry_checklist && Object.keys(detailOrder.entry_checklist).length > 0 && (
                  <OsChecklist
                    title="Checklist de Entrada (Registrado na abertura)"
                    data={detailOrder.entry_checklist as ChecklistData}
                    onChange={() => {}}
                    readonly={true}
                  />
                )}

                {/* Galeria de Fotos */}
                <OsPhotoGallery orderId={detailOrder.id} />

                {/* Peças da OS */}
                <OsParts orderId={detailOrder.id} storeId={detailOrder.store_id} />

                {/* Pagamento atual */}
                {totalPaid(detailOrder) > 0 && (
                  <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
                    <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">Pagamento Recebido</p>
                    {Number(detailOrder.payment_cash) > 0 && <p><span className="text-muted-foreground">Dinheiro:</span> {formatCurrency(Number(detailOrder.payment_cash))}</p>}
                    {Number(detailOrder.payment_card) > 0 && <p><span className="text-muted-foreground">Cartão:</span> {formatCurrency(Number(detailOrder.payment_card))}</p>}
                    {Number(detailOrder.payment_pix) > 0 && <p><span className="text-muted-foreground">PIX:</span> {formatCurrency(Number(detailOrder.payment_pix))}</p>}
                    {Number(detailOrder.payment_other) > 0 && <p><span className="text-muted-foreground">Outro:</span> {formatCurrency(Number(detailOrder.payment_other))}</p>}
                    <p className="font-bold text-primary">Total: {formatCurrency(totalPaid(detailOrder))}</p>
                    {detailOrder.payment_notes && <p className="text-muted-foreground">{detailOrder.payment_notes}</p>}
                    
                    {detailOrder.receipt_url && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <a href={detailOrder.receipt_url} target="_blank" rel="noreferrer"
                           className="text-[10px] text-primary underline flex items-center gap-1 font-semibold">
                          <Receipt className="h-3 w-3" /> Ver Comprovante de Pagamento
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Assinatura */}
                {detailOrder.signature_data && (
                  <div className="rounded-lg bg-muted/50 p-3 text-xs">
                    <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide mb-2">Assinatura do Cliente</p>
                    <img src={detailOrder.signature_data} alt="Assinatura" className="max-h-20 rounded border border-border" />
                  </div>
                )}

                {/* Termos */}
                <div className="rounded-lg border border-border p-3 text-xs">
                  <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide mb-2">Termos e Condições</p>
                  <div className="max-h-28 overflow-y-auto">
                    <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{TERMS_TEXT}</p>
                  </div>
                  {detailOrder.terms_accepted && (
                    <div className="flex items-center gap-1 mt-2 text-primary font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[10px]">Cliente aceitou os termos de serviço</span>
                    </div>
                  )}
                  {detailOrder.device_is_off && (
                    <div className="flex items-center gap-1 mt-1 text-red-500 font-bold">
                      <CheckCircle2 className="h-3.5 w-3.5 text-red-500" />
                      <span className="text-[10px]">Cliente ciente: Aparelho entrou Desligado (sem teste de periféricos)</span>
                    </div>
                  )}
                </div>

                {/* Atualizar serviço */}
                {detailOrder.status !== "cancelled" && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
                    <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5" /> Atualizar Serviço
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Valor Final (R$)</Label>
                        <Input type="number" step="0.01" value={updateForm.final_price}
                          onChange={e => setUpdateForm(f => ({ ...f, final_price: e.target.value }))}
                          placeholder="0.00" className="h-9" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Fim da Garantia (Opcional)</Label>
                        <Input type="date" value={updateForm.warranty_end_date} 
                               onChange={e => setUpdateForm(f => ({ ...f, warranty_end_date: e.target.value }))} className="h-9 text-xs" />
                      </div>
                      <div className="space-y-1.5 col-span-2">
                        <Label className="text-xs">Técnico Responsável</Label>
                        <Select value={updateForm.technician_id} onValueChange={v => setUpdateForm(f => ({ ...f, technician_id: v }))}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name ?? p.user_id}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="pt-2">
                       <OsChecklist
                         title="Checklist de Saída (Testes Pós-Reparo)"
                         data={updateForm.exit_checklist}
                         onChange={(d) => setUpdateForm({ ...updateForm, exit_checklist: d })}
                       />
                    </div>

                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Formas de Pagamento Recebidas</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] flex items-center gap-1"><Banknote className="h-3 w-3" /> Dinheiro</Label>
                        <Input type="number" step="0.01" value={updateForm.payment_cash} onChange={e => setUpdateForm(f => ({ ...f, payment_cash: e.target.value }))} placeholder="0.00" className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] flex items-center gap-1"><CreditCard className="h-3 w-3" /> Cartão</Label>
                        <Input type="number" step="0.01" value={updateForm.payment_card} onChange={e => setUpdateForm(f => ({ ...f, payment_card: e.target.value }))} placeholder="0.00" className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] flex items-center gap-1"><QrCode className="h-3 w-3" /> PIX</Label>
                        <Input type="number" step="0.01" value={updateForm.payment_pix} onChange={e => setUpdateForm(f => ({ ...f, payment_pix: e.target.value }))} placeholder="0.00" className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] flex items-center gap-1"><DollarSign className="h-3 w-3" /> Outro</Label>
                        <Input type="number" step="0.01" value={updateForm.payment_other} onChange={e => setUpdateForm(f => ({ ...f, payment_other: e.target.value }))} placeholder="0.00" className="h-8 text-xs" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Obs. de Pagamento</Label>
                      <Input value={updateForm.payment_notes} onChange={e => setUpdateForm(f => ({ ...f, payment_notes: e.target.value }))} placeholder="Ex: Parte em dinheiro, parte no cartão" className="h-9" />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold flex items-center gap-1">
                        <Receipt className="h-3 w-3" /> Anexar Comprovante
                      </Label>
                      {receiptFile ? (
                        <div className="flex items-center gap-2 rounded bg-primary/10 p-2 text-[10px] text-primary border border-primary/20 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate flex-1">{receiptFile.name}</span>
                          <button onClick={() => setReceiptFile(null)} className="hover:underline">Remover</button>
                        </div>
                      ) : existingReceiptUrl ? (
                        <div className="flex items-center gap-2 rounded bg-green-500/10 p-2 text-[10px] text-green-600 border border-green-500/20 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate flex-1">Comprovante já enviado</span>
                          <button onClick={() => setExistingReceiptUrl(null)} className="text-destructive hover:underline">Trocar</button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <Button type="button" variant="outline" className="h-8 text-[10px] gap-1.5" onClick={() => cameraInputRef.current?.click()}>
                            <Camera className="h-3 w-3" /> Tirar Foto
                          </Button>
                          <Button type="button" variant="outline" className="h-8 text-[10px] gap-1.5" onClick={() => fileInputRef.current?.click()}>
                            <Upload className="h-3 w-3" /> Galeria
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Total pago preview */}
                    {(parseFloat(updateForm.payment_cash) || 0) + (parseFloat(updateForm.payment_card) || 0) + (parseFloat(updateForm.payment_pix) || 0) + (parseFloat(updateForm.payment_other) || 0) > 0 && (
                      <div className="flex justify-between text-xs font-bold rounded-lg bg-primary/10 text-primary px-3 py-2">
                        <span>Total Recebido</span>
                        <span>{formatCurrency(
                          (parseFloat(updateForm.payment_cash) || 0) +
                          (parseFloat(updateForm.payment_card) || 0) +
                          (parseFloat(updateForm.payment_pix) || 0) +
                          (parseFloat(updateForm.payment_other) || 0)
                        )}</span>
                      </div>
                    )}

                    <div className="space-y-1.5 pt-2">
                      <Label className="text-xs font-semibold text-primary">Campo Obrigatório: Motivo da Alteração</Label>
                      <Input 
                        value={updateForm.justification} 
                        onChange={e => setUpdateForm(f => ({ ...f, justification: e.target.value }))} 
                        placeholder="Ex: Atualização de preço, peça adicionada, técnico alterado..." 
                        required 
                        className="h-10 border-primary/40 shadow-sm"
                      />
                    </div>

                    <Button className="w-full h-10 font-bold" onClick={handleUpdateService} disabled={loading || !updateForm.justification}>
                      {loading ? "Salvando..." : "Salvar Alterações e Justificar"}
                    </Button>
                  </div>
                )}

                {/* Atualizar status */}
                {detailOrder.status !== "delivered" && detailOrder.status !== "cancelled" && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Atualizar Status</p>
                    <div className="flex flex-wrap gap-2">
                      {allStatuses.filter((s) => s !== detailOrder.status).map((s) => (
                        <Button key={s} className="text-xs h-8 bg-transparent border border-border text-foreground hover:bg-muted"
                          onClick={() => updateStatus(detailOrder.id, s, detailOrder.status)}>
                          {statusConfig[s].label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {detailOrder.internal_notes && (
                  <div className="rounded-lg bg-muted/50 p-3 text-xs border-l-2 border-yellow-500">
                    <p className="font-semibold text-yellow-500 text-[10px] uppercase tracking-wide mb-1">Notas Internas</p>
                    <p>{detailOrder.internal_notes}</p>
                  </div>
                )}

                {/* Área Administrativa */}
                {isAdmin && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-4">
                    <p className="text-xs font-bold text-destructive uppercase tracking-wider flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5" /> Controle Administrativo
                    </p>
                    
                    <div className="space-y-2">
                      <Label className="text-[10px] text-muted-foreground uppercase">Mover para outra unidade</Label>
                      <div className="space-y-2">
                        <Input 
                          value={justification} 
                          onChange={(e) => setJustification(e.target.value)} 
                          placeholder="Motivo da transferência..." 
                          className="h-8 text-xs border-destructive/20" 
                        />
                        <Select 
                          value={detailOrder.store_id} 
                          onValueChange={(v) => {
                            if (!justification) { toast.error("Por favor, informe o motivo antes de transferir."); return; }
                            handleMoveStore(v, justification);
                          }}
                        >
                          <SelectTrigger className="h-9 text-xs flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {stores.filter(s => s.id !== detailOrder.store_id).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-destructive/20">
                      <Button 
                        variant="destructive" 
                        className="w-full h-9 text-xs gap-2"
                        onClick={() => {
                          setActionType("delete");
                          setJustification("");
                          setJustDialogOpened(true);
                        }}
                        disabled={loading}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir Ordem de Serviço
                      </Button>
                      <p className="text-[10px] text-center text-destructive/60 mt-2 italic">
                        Esta ação é irreversível e removerá todos os registros vinculados.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* OS Action Justification Dialog (Status / Delete) */}
      <Dialog open={justDialogOpened} onOpenChange={setJustDialogOpened}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <AlertCircle className="h-5 w-5" /> Confirmar Ação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {actionType === "delete" ? "Esta ação excluirá a OS permanentemente." : "Você está alterando o status para uma fase crítica."}
              <br />Por favor, informe uma justificativa:
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-primary">Justificativa / Motivo</Label>
              <Input 
                value={justification} 
                onChange={(e) => setJustification(e.target.value)} 
                placeholder="Descreva o motivo..." 
                required 
                className="h-10"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setJustDialogOpened(false)}>Cancelar</Button>
              <Button 
                variant={actionType === "delete" ? "destructive" : "default"}
                className="flex-1" 
                disabled={!justification || loading}
                onClick={async () => {
                  if (actionType === "delete" && detailOrder) {
                    await handleDeleteOS(detailOrder.id, justification);
                    setJustDialogOpened(false);
                  } else if (actionType === "status" && pendingUpdate) {
                    await updateStatus(pendingUpdate.orderId, pendingUpdate.newStatus, pendingUpdate.oldStatus, justification);
                    setJustDialogOpened(false);
                    setPendingUpdate(null);
                  }
                }}
              >
                {loading ? "Processando..." : "Confirmar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdensServico;
