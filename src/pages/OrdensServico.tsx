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
  Printer, ChevronRight, ChevronLeft, Camera, Upload, Receipt, Shield, Trash2, Store, Copy
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { convertToWebP } from "@/utils/imageOptimizer";
import { openComprovante, getSignedComprovanteUrl } from "@/lib/storageHelper";
import { KanbanBoard } from "@/components/KanbanBoard";
import { OsChecklist, ChecklistData, CHECKLIST_ITEMS, VISUAL_CHECKLIST_ITEMS } from "@/components/OsChecklist";
import { Checkbox } from "@/components/ui/checkbox";
import { triggerWebhook } from "@/utils/webhookSender";
import { logAction } from "@/utils/auditLogger";
import { OSCard } from "@/components/features/os/OSCard";
import { OSFormModal } from "@/components/features/os/OSFormModal";
import { OSDetailModal } from "@/components/features/os/OSDetailModal";
import { OSJustificationDialog } from "@/components/features/os/OSJustificationDialog";
import { OSFinancialConfirmDialog } from "@/components/features/os/OSFinancialConfirmDialog";
import {
  formatCurrency,
  TERMS_TEXT,
  paymentLabels,
  generateOSPdf,
  generateThermalPdf,
} from "@/components/features/os/osPdf";
// Mapeamento de caixa da OS: utiliza a coluna oficial "cash_register_id" via helper modularizado
import { createPendingCashEntry } from "@/components/features/os/osCashHelper";
import { OS_STATUS_CONFIG as statusConfig, ALL_OS_STATUSES as allStatuses } from "@/utils/osStatus";
import { resolveTechnicianIdOnUpdate, resolveTechnicianIdOnCreate } from "@/utils/osCalculations";

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
  const [filterTechnicianId, setFilterTechnicianId] = useState<string>("all");
  const [onlyMyOrders, setOnlyMyOrders] = useState<boolean>(() => userRole === "tecnico");
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

  const [pendingFinancialOSIds, setPendingFinancialOSIds] = useState<Set<string>>(new Set());
  const [pendingFinancialOSNumbers, setPendingFinancialOSNumbers] = useState<Set<number>>(new Set());

  const fetchData = async () => {
    if (!activeStoreId) return;
    
    let query = supabase.from("service_orders").select("*");
    if (activeStoreId !== "all") {
      query = query.eq("store_id", activeStoreId);
    }
    
    let cashQuery = supabase
      .from("cash_entries" as any)
      .select("reference_id, description, confirmed")
      .eq("confirmed", false);

    if (activeStoreId !== "all") {
      cashQuery = cashQuery.or(`store_id.eq.${activeStoreId},store_id.is.null`);
    }

    const [ordersRes, storesRes, profilesRes, cashRes] = await Promise.all([
      query.order("created_at", { ascending: false }),
      supabase.from("stores").select("*"),
      supabase.from("profiles").select("*"),
      cashQuery,
    ]);

    setOrders((ordersRes.data as any[]) ?? []);
    setStores(storesRes.data ?? []);
    setProfiles(profilesRes.data ?? []);

    const idSet = new Set<string>();
    const numSet = new Set<number>();
    if (cashRes.data) {
      cashRes.data.forEach((entry: any) => {
        if (entry.reference_id) {
          idSet.add(entry.reference_id);
        }
        if (entry.description) {
          const match = entry.description.match(/OS\s*#?\s*(\d+)/i);
          if (match && match[1]) {
            numSet.add(parseInt(match[1], 10));
          }
        }
      });
    }
    setPendingFinancialOSIds(idSet);
    setPendingFinancialOSNumbers(numSet);
  };

  const isFinancialPending = (order: any) => {
    if (!order || order.status !== "delivered") return false;
    return (
      pendingFinancialOSIds.has(order.id) ||
      pendingFinancialOSNumbers.has(Number(order.order_number))
    );
  };

  const [financialConfirmOpen, setFinancialConfirmOpen] = useState(false);
  const [financialConfirmOrder, setFinancialConfirmOrder] = useState<any | null>(null);
  const [financialMissingItems, setFinancialMissingItems] = useState<string[]>([]);
  const [financialConfirmLoading, setFinancialConfirmLoading] = useState(false);

  const executeFinancialConfirmation = async (order: any, isBypass = false) => {
    if (!user || !order) return;
    setFinancialConfirmLoading(true);
    try {
      const { error: cashErr } = await supabase
        .from("cash_entries" as any)
        .update({ confirmed: true, receipt_url: order.receipt_url || null })
        .or(`reference_id.eq.${order.id},description.like.OS #${order.order_number} —%`);

      if (cashErr) throw cashErr;

      await supabase
        .from("transactions")
        .update({ reconciled: true })
        .like("description", `OS #${order.order_number} —%`);

      setPendingFinancialOSIds(prev => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
      setPendingFinancialOSNumbers(prev => {
        const next = new Set(prev);
        next.delete(Number(order.order_number));
        return next;
      });

      if (isBypass) {
        logAction("UPDATE_RECORD", "service_orders", order.id, null, {
          action: "ADMIN_BYPASS_FINANCIAL_CONFIRMATION",
          order_number: order.order_number,
          missing_items: financialMissingItems,
          authorized_by: user.id,
        }, order.store_id);
        toast.success(`OS #${order.order_number} confirmada no Caixa sob autorização de Administrador.`);
      } else {
        toast.success(`Transações da OS #${order.order_number} confirmadas no Caixa!`);
      }

      setFinancialConfirmOpen(false);
      setFinancialConfirmOrder(null);
      fetchData();
    } catch (err: any) {
      toast.error("Erro ao confirmar no financeiro: " + err.message);
    } finally {
      setFinancialConfirmLoading(false);
    }
  };

  const checkMissingReceipts = async (orderId: string, fallbackOrder?: any) => {
    const { data: freshOrder } = await supabase
      .from("service_orders")
      .select("id, order_number, receipt_url, store_id")
      .eq("id", orderId)
      .maybeSingle();

    const targetOrder = freshOrder || fallbackOrder || orders.find(o => o.id === orderId);

    const missing: string[] = [];
    if (!targetOrder?.receipt_url) {
      missing.push("Comprovante de pagamento do serviço");
    }

    const { data: parts } = await supabase
      .from("service_order_items" as any)
      .select("id, unit_cost, receipt_url, supplier_name, products(name, brand, model, parts_payment_voucher)")
      .eq("service_order_id", orderId);

    if (parts && parts.length > 0) {
      parts.forEach((p: any) => {
        const hasPartReceipt = p.receipt_url || p.products?.parts_payment_voucher;
        if (!hasPartReceipt) {
          const partName = p.products?.name || "Peça";
          const supplier = p.supplier_name ? ` (Fornecedor: ${p.supplier_name})` : "";
          missing.push(`Comprovante de pagamento da peça: ${partName}${supplier}`);
        }
      });
    }

    return { targetOrder, missing };
  };

  const handleConfirmFinancial = async (order: any) => {
    if (!user || !order) return;
    try {
      const { targetOrder, missing } = await checkMissingReceipts(order.id, order);

      if (missing.length === 0) {
        // Todos os comprovantes necessários estão presentes: qualquer usuário confirma diretamente!
        await executeFinancialConfirmation(targetOrder, false);
      } else {
        // Faltam comprovantes:
        // - Se for admin: abre diálogo para autorizar por exceção administrativa
        // - Se for técnico/vendedor/gerente: abre diálogo bloqueando e orientando a anexar
        setFinancialConfirmOrder(targetOrder);
        setFinancialMissingItems(missing);
        setFinancialConfirmOpen(true);
      }
    } catch (err: any) {
      toast.error("Erro ao verificar comprovantes: " + err.message);
    }
  };

  useEffect(() => { fetchData(); }, [activeStoreId]);

  const uploadReceipt = async (file: File): Promise<string | null> => {
    const optimizedFile = await convertToWebP(file);
    const fileName = `${detailOrder?.order_number}-${Date.now()}-${optimizedFile.name}`;
    const storePrefix = detailOrder?.store_id || activeStoreId || "geral";
    const { data, error } = await supabase.storage.from("comprovantes").upload(`${storePrefix}/os-pagamentos/${fileName}`, optimizedFile, { upsert: true });
    if (error) { toast.error("Erro no upload: " + error.message); return null; }
    const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  useEffect(() => {
    const channel = supabase.channel("service_orders_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_entries" }, () => fetchData())
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
        technician_id: resolveTechnicianIdOnCreate(form.technician_id),
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

    if (newStatus === "delivered") {
      const { targetOrder, missing } = await checkMissingReceipts(orderId);
      if (missing.length > 0 && !isAdmin) {
        // Bloqueio rigoroso: técnico/vendedor/gerente não pode entregar OS sem comprovantes
        setFinancialConfirmOrder(targetOrder);
        setFinancialMissingItems(missing);
        setFinancialConfirmOpen(true);
        isSubmitting.current = false;
        return;
      }
    }

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

    if (newStatus === "cancelled") {
      // Reverter peças vinculadas de volta para in_stock
      const { data: items } = await supabase
        .from("service_order_items" as any)
        .select("product_id")
        .eq("service_order_id", orderId);
      if (items && items.length > 0) {
        const prodIds = items.map((i: any) => i.product_id).filter(Boolean);
        if (prodIds.length > 0) {
          await supabase
            .from("products")
            .update({ status: "in_stock" })
            .in("id", prodIds)
            .eq("status", "sold");
        }
      }
    }

    if (newStatus === "delivered") {
      // Busca dados mais recentes diretamente do banco e avalia comprovantes
      const { targetOrder: freshTarget, missing: deliveryMissing } = await checkMissingReceipts(orderId);
      const order = freshTarget || orders.find(o => o.id === orderId);
      if (order && (order as any).store_id) {
        const o = order as any;
        const desc = `OS #${o.order_number} — ${o.requested_service} (${o.customer_name})`;

        // Pode auto-confirmar se não houver nenhuma pendência de comprovante
        const canAutoConfirm = deliveryMissing.length === 0;

        // Idempotência: verificar se já existem transações para esta OS para não duplicar receita
        const { data: existingTx } = await supabase
          .from("transactions")
          .select("id")
          .eq("store_id", o.store_id)
          .like("description", `OS #${o.order_number} —%`)
          .limit(1);

        if (!existingTx || existingTx.length === 0) {
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
              const defaultMethod = o.payment_method || "dinheiro";
              await createPendingCashEntry(o.store_id, user.id, amount, desc, defaultMethod, o.receipt_url || null, o.id, canAutoConfirm);
              await supabase.from("transactions").insert({
                type: "income",
                category: "Manutenção",
                amount,
                net_amount: amount,
                description: `${desc} [${defaultMethod.toUpperCase()}]`,
                store_id: o.store_id,
                created_by: user.id,
                expected_settlement_date: new Date().toISOString(),
                reconciled: canAutoConfirm,
              });
            }
          } else {
            if (cash > 0) {
              await createPendingCashEntry(o.store_id, user.id, cash, desc, "dinheiro", o.receipt_url || null, o.id, canAutoConfirm);
              await supabase.from("transactions").insert({
                type: "income",
                category: "Manutenção",
                amount: cash,
                net_amount: cash,
                description: `${desc} [Dinheiro]`,
                store_id: o.store_id,
                created_by: user.id,
                expected_settlement_date: new Date().toISOString(),
                reconciled: canAutoConfirm,
              });
            }
            if (card > 0) {
              await createPendingCashEntry(o.store_id, user.id, card, desc, "cartao_credito", o.receipt_url || null, o.id, canAutoConfirm);
              const fee = Number(account?.credit_fee_percent) || 0;
              const days = Number(account?.credit_settlement_days) || 30;
              const expectedDate = new Date();
              expectedDate.setDate(expectedDate.getDate() + days);
              await supabase.from("transactions").insert({
                type: "income",
                category: "Manutenção",
                amount: card,
                net_amount: card - (card * (fee / 100)),
                description: `${desc} [Cartão]`,
                store_id: o.store_id,
                created_by: user.id,
                destination_account_id: defaultAccountId,
                expected_settlement_date: expectedDate.toISOString(),
                reconciled: canAutoConfirm,
              });
            }
            if (pix > 0) {
              await createPendingCashEntry(o.store_id, user.id, pix, desc, "pix", o.receipt_url || null, o.id, canAutoConfirm);
              const fee = Number(account?.pix_fee_percent) || 0;
              const days = Number(account?.pix_settlement_days) || 0;
              const expectedDate = new Date();
              expectedDate.setDate(expectedDate.getDate() + days);
              await supabase.from("transactions").insert({
                type: "income",
                category: "Manutenção",
                amount: pix,
                net_amount: pix - (pix * (fee / 100)),
                description: `${desc} [PIX]`,
                store_id: o.store_id,
                created_by: user.id,
                destination_account_id: defaultAccountId,
                expected_settlement_date: expectedDate.toISOString(),
                reconciled: canAutoConfirm,
              });
            }
            if (other > 0) {
              await createPendingCashEntry(o.store_id, user.id, other, desc, "outro", o.receipt_url || null, o.id, canAutoConfirm);
              await supabase.from("transactions").insert({
                type: "income",
                category: "Manutenção",
                amount: other,
                net_amount: other,
                description: `${desc} [Outro]`,
                store_id: o.store_id,
                created_by: user.id,
                destination_account_id: defaultAccountId,
                expected_settlement_date: new Date().toISOString(),
                reconciled: canAutoConfirm,
              });
            }
          }
        }

        if (canAutoConfirm) {
          toast.success("OS entregue e confirmada no financeiro com comprovantes anexados!");
        } else {
          toast.error("⚠️ OS Finalizada! Falta confirmar no financeiro (Caixa) as Transações referentes a esse serviço.");
          setPendingFinancialOSIds(prev => new Set(prev).add(orderId));
          setPendingFinancialOSNumbers(prev => new Set(prev).add(Number(o.order_number)));
        }
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
    const techResolution = resolveTechnicianIdOnUpdate(updateForm.technician_id, detailOrder.technician_id);
    if (techResolution.shouldUpdate) {
      updates.technician_id = techResolution.value;
    }
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
      if (updates.receipt_url) {
        await supabase
          .from("cash_entries" as any)
          .update({ receipt_url: updates.receipt_url })
          .or(`reference_id.eq.${detailOrder.id},description.like.OS #${detailOrder.order_number} —%`);

        if (detailOrder.status === "delivered") {
          const { data: parts } = await supabase
            .from("service_order_items" as any)
            .select("id, receipt_url")
            .eq("service_order_id", detailOrder.id);
          const partsList = (parts as any[]) || [];
          const missingParts = partsList.some((p: any) => !p.receipt_url);
          if (!missingParts) {
            await supabase
              .from("cash_entries" as any)
              .update({ confirmed: true })
              .or(`reference_id.eq.${detailOrder.id},description.like.OS #${detailOrder.order_number} —%`);
            await supabase
              .from("transactions")
              .update({ reconciled: true })
              .like("description", `OS #${detailOrder.order_number} —%`);
            toast.success("Comprovantes completos! Confirmado no Caixa e Financeiro.");
          }
        }
      }
      const updated = { ...detailOrder, ...updates };
      setDetailOrder(updated);
      fetchData();
      logAction("UPDATE_RECORD", "service_orders", detailOrder.id, null, { ...updates, justification: updateForm.justification }, detailOrder.store_id);
    }
    setLoading(false);
  };

  const handleDeleteOS = async (id: string, reason: string) => {
    setLoading(true);
    try {
      const receiptUrl = detailOrder?.receipt_url;

      // 1. Invocar RPC atômica cancel_service_order
      const { error } = await supabase.rpc("cancel_service_order" as any, {
        p_service_order_id: id,
        p_reason: reason,
      });

      if (error) {
        if (error.message?.includes("OS_COMMISSION_ALREADY_SETTLED")) {
          toast.error("Esta OS possui comissão liquidada (OS_COMMISSION_ALREADY_SETTLED) e não pode ser cancelada/excluída.");
        } else {
          toast.error("Erro ao excluir: " + error.message);
        }
        return;
      }

      // 2. Limpeza de storage de comprovante SOMENTE APÓS sucesso da RPC
      if (receiptUrl) {
        try {
          const path = receiptUrl.split("/comprovantes/")[1];
          if (path) await supabase.storage.from("comprovantes").remove([path]);
        } catch (storageErr) {
          console.warn("Aviso: falha não bloqueante ao remover comprovante do storage:", storageErr);
        }
      }

      toast.success("Ordem de Serviço removida!");
      setDetailOrder(null);
      fetchData();
      logAction("DELETE_RECORD", "service_orders", id, null, { reason }, activeStoreId);
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    } finally {
      setLoading(false);
    }
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
      const storePrefix = order.store_id || activeStoreId || "geral";
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("comprovantes").upload(`${storePrefix}/os-pdfs/${fileName}`, pdfBlob, { upsert: true, contentType: "application/pdf" });

      let shareUrl = publicUrl;
      if (!uploadError && uploadData) {
        shareUrl = await getSignedComprovanteUrl(uploadData.path, 60 * 60 * 24 * 7); // 7 dias
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

  const handleDuplicateOS = (order: any) => {
    if (!order) return;

    const isPattern = typeof order.device_password === "string" && order.device_password.startsWith("Padrão: ");
    if (isPattern) {
      setPasswordType("pattern");
    } else {
      setPasswordType("text");
    }

    const priceToUse = order.final_price 
      ? String(order.final_price) 
      : order.estimated_price 
        ? String(order.estimated_price) 
        : "";

    setForm({
      customer_name: order.customer_name || "",
      customer_phone: order.customer_phone || "",
      customer_cpf: order.customer_cpf || "",
      device_brand: order.device_brand || "iPhone",
      device_model: order.device_model || "",
      device_imei: order.device_imei || "",
      device_color: order.device_color || "",
      device_condition: order.device_condition || "",
      device_password: order.device_password || "",
      device_accessories: order.device_accessories || "",
      reported_defect: order.reported_defect || "",
      requested_service: order.requested_service || "",
      store_id: order.store_id || (activeStoreId !== "all" ? activeStoreId : ""),
      estimated_price: priceToUse,
      estimated_completion: "",
      technician_id: order.technician_id || "",
      terms_accepted: order.terms_accepted || false,
      internal_notes: order.internal_notes 
        ? `[Duplicada da OS #${order.order_number}] ${order.internal_notes}` 
        : `[Duplicada da OS #${order.order_number}]`,
      entry_checklist: order.entry_checklist || ({} as ChecklistData),
      device_is_off: !!order.device_is_off,
    });

    if (order.device_is_off) {
      setDeviceOffAgreed(true);
    } else {
      setDeviceOffAgreed(false);
    }

    setDetailOrder(null);
    setDialogOpen(true);
    toast.info(`Dados da OS #${order.order_number} duplicados no formulário. Revise os campos e confirme para gerar a nova OS/Orçamento.`);
  };

  const filtered = orders.filter((o: any) => {
    // Filtro por Técnico / Minhas OS
    if (onlyMyOrders && user?.id) {
      if (o.technician_id !== user.id) return false;
    } else if (filterTechnicianId !== "all") {
      if (filterTechnicianId === "unassigned") {
        if (o.technician_id) return false;
      } else if (o.technician_id !== filterTechnicianId) {
        return false;
      }
    }

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
    const match = (o.customer_name?.toLowerCase() || "").includes(q) ||
      (o.device_imei && o.device_imei.includes(search)) ||
      (o.device_model && o.device_model.toLowerCase().includes(q)) ||
      String(o.order_number).includes(search);
    
    return match && (filterStatus === "all" || o.status === filterStatus);
  });

  const statusCounts = orders.reduce((acc: any, o: any) => {
    acc[o.status] = (acc[o.status] || 0) + 1; return acc;
  }, {} as Record<string, number>);

  // Preenche updateForm quando abre o detail
  const openDetail = (order: any) => {
    setDetailOrder(order);
    setUpdateForm({
      final_price: order.final_price ? String(order.final_price) : "",
      technician_id: order.technician_id ?? "none",
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
        <OSFormModal
          dialogOpen={dialogOpen}
          setDialogOpen={setDialogOpen}
          resetForm={resetForm}
          handleSubmit={handleSubmit}
          form={form}
          setForm={setForm}
          passwordType={passwordType}
          setPasswordType={setPasswordType}
          setPatternImageData={setPatternImageData}
          handleDeviceOffChange={handleDeviceOffChange}
          activeStoreId={activeStoreId}
          stores={stores}
          profiles={profiles}
          signatureData={signatureData}
          setSignatureData={setSignatureData}
          deviceOffAgreed={deviceOffAgreed}
          setDeviceOffAgreed={setDeviceOffAgreed}
          loading={loading}
          isSubmitting={isSubmitting.current}
        />
      </div>

      {/* Filtro Técnico / Minhas OS */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center rounded-lg border border-border/70 p-0.5 bg-muted/30">
          <Button 
            type="button"
            variant={onlyMyOrders ? "default" : "ghost"}
            size="sm"
            className={`h-7 px-3 text-xs rounded-md ${onlyMyOrders ? "font-semibold shadow-xs" : "text-muted-foreground"}`}
            onClick={() => {
              setOnlyMyOrders(true);
              setFilterTechnicianId("all");
            }}
          >
            Minhas OS ({orders.filter(o => o.technician_id === user?.id).length})
          </Button>
          <Button 
            type="button"
            variant={!onlyMyOrders && filterTechnicianId === "all" ? "default" : "ghost"}
            size="sm"
            className={`h-7 px-3 text-xs rounded-md ${!onlyMyOrders && filterTechnicianId === "all" ? "font-semibold shadow-xs" : "text-muted-foreground"}`}
            onClick={() => {
              setOnlyMyOrders(false);
              setFilterTechnicianId("all");
            }}
          >
            Todas as OS ({orders.length})
          </Button>
        </div>

        {(isAdmin || userRole === "gerente" || !onlyMyOrders) && (
          <div className="w-[180px]">
            <Select 
              value={filterTechnicianId} 
              onValueChange={(v) => {
                setFilterTechnicianId(v);
                setOnlyMyOrders(false);
              }}
            >
              <SelectTrigger className="h-8 text-xs bg-card border-border/70">
                <SelectValue placeholder="Filtrar por técnico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os técnicos</SelectItem>
                <SelectItem value="unassigned">Sem técnico atribuído</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.display_name || "Técnico"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Status chips com rolagem suave e pílulas táteis */}
      <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1.5 scrollbar-none touch-pan-x scroll-smooth">
        <Button 
          variant={filterStatus === "all" ? "default" : "outline"}
          className={`h-8 px-3.5 text-xs shrink-0 rounded-full active:scale-95 transition-all ${filterStatus === "all" ? "font-semibold shadow-sm" : "border-border/70 hover:bg-muted text-muted-foreground"}`} 
          onClick={() => setFilterStatus("all")}
        >
          Todas <span className="ml-1.5 text-[10px] opacity-80 font-mono">({orders.length})</span>
        </Button>
        {allStatuses.filter((s) => statusCounts[s]).map((s) => (
          <Button 
            key={s} 
            variant={filterStatus === s ? "default" : "outline"}
            className={`h-8 px-3.5 text-xs shrink-0 rounded-full active:scale-95 transition-all ${filterStatus === s ? "font-semibold shadow-sm" : "border-border/70 hover:bg-muted text-muted-foreground"}`} 
            onClick={() => setFilterStatus(s)}
          >
            {statusConfig[s].label} <span className="ml-1.5 text-[10px] opacity-80 font-mono">({statusCounts[s]})</span>
          </Button>
        ))}
      </div>

      {/* Search + Date Filter */}
      <div className="flex gap-2 w-full flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, IMEI, modelo ou nº da OS..." className="pl-9 h-10" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Input
            type="date"
            value={filterStartDate}
            onChange={e => setFilterStartDate(e.target.value)}
            className="h-10 w-[135px] text-xs"
            title="Data inicial"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            value={filterEndDate}
            onChange={e => setFilterEndDate(e.target.value)}
            className="h-10 w-[135px] text-xs"
            title="Data final"
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
        <Button className={`px-4 h-10 border text-xs gap-2 shrink-0 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-transparent text-foreground hover:bg-muted"}`} onClick={() => setViewMode(v => v === "list" ? "kanban" : "list")}>
          {viewMode === "list" ? "Ver Kanban" : "Ver Lista"}
        </Button>
      </div>

      {/* List or Kanban */}
      {viewMode === "list" ? (
      <div className="space-y-2.5">
        {filtered.length > 0 ? filtered.map((order: any) => (
          <OSCard
            key={order.id}
            order={order}
            statusConfig={statusConfig}
            storeMap={storeMap}
            profileMap={profileMap}
            formatCurrency={formatCurrency}
            totalPaid={totalPaid}
            isFinancialPending={isFinancialPending(order)}
            onClick={() => openDetail(order)}
            onWhatsApp={handleSendWhatsApp}
          />
        )) : (
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
          isFinancialPending={isFinancialPending}
          onOrderClick={openDetail} 
          onStatusChange={updateStatus} 
        />
      )}

      {/* Detail Dialog */}
      <OSDetailModal
        detailOrder={detailOrder}
        onClose={() => setDetailOrder(null)}
        stores={stores}
        profileMap={profileMap}
        profiles={profiles}
        isAdmin={isAdmin}
        updateForm={updateForm}
        setUpdateForm={setUpdateForm}
        receiptFile={receiptFile}
        setReceiptFile={setReceiptFile}
        existingReceiptUrl={existingReceiptUrl}
        setExistingReceiptUrl={setExistingReceiptUrl}
        cameraInputRef={cameraInputRef}
        fileInputRef={fileInputRef}
        loading={loading}
        pdfLoading={pdfLoading}
        justification={justification}
        setJustification={setJustification}
        handleDuplicateOS={handleDuplicateOS}
        handleExportPdf={handleExportPdf}
        handleExportThermal={handleExportThermal}
        handleSendWhatsApp={handleSendWhatsApp}
        handleUpdateService={handleUpdateService}
        handleMoveStore={handleMoveStore}
        onRequestDelete={() => {
          setActionType("delete");
          setJustification("");
          setJustDialogOpened(true);
        }}
        updateStatus={updateStatus}
        getPublicUrl={getPublicUrl}
        totalPaid={totalPaid}
        isFinancialPending={detailOrder ? isFinancialPending(detailOrder) : false}
        onConfirmFinancial={() => detailOrder && handleConfirmFinancial(detailOrder)}
      />

      {/* OS Action Justification Dialog (Status / Delete) */}
      <OSJustificationDialog
        open={justDialogOpened}
        onOpenChange={setJustDialogOpened}
        actionType={actionType}
        justification={justification}
        setJustification={setJustification}
        loading={loading}
        onConfirm={async () => {
          if (actionType === "delete" && detailOrder) {
            await handleDeleteOS(detailOrder.id, justification);
            setJustDialogOpened(false);
          } else if (actionType === "status" && pendingUpdate) {
            await updateStatus(pendingUpdate.orderId, pendingUpdate.newStatus, pendingUpdate.oldStatus, justification);
            setJustDialogOpened(false);
            setPendingUpdate(null);
          }
        }}
      />

      {/* Diálogo de Confirmação Financeira com Trava de Comprovantes / Permissão Admin */}
      <OSFinancialConfirmDialog
        open={financialConfirmOpen}
        onOpenChange={setFinancialConfirmOpen}
        isAdmin={isAdmin}
        orderNumber={financialConfirmOrder?.order_number || 0}
        missingItems={financialMissingItems}
        onConfirmAdminBypass={() => financialConfirmOrder && executeFinancialConfirmation(financialConfirmOrder, true)}
        loading={financialConfirmLoading}
      />
    </div>
  );
};

export default OrdensServico;
