import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  FileText,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  Building2,
  Calendar,
  User,
  ExternalLink,
} from "lucide-react";
import {
  settleCommissionsRPC,
  generateSettlementReceiptPDF,
  fetchSettlementItems,
  toBrasiliaDateString,
  formatBrasiliaDate,
  type SettleCommissionsPayload,
} from "@/utils/commissionSettlement";
import { convertToWebP } from "@/utils/imageOptimizer";

interface PendingCommissionItem {
  id: string;
  type: "sale" | "service_order";
  date: string;
  label: string;
  grossAmount: number;
  costAmount: number | null;
  profitAmount: number | null;
  commissionPercent: number;
  commissionAmount: number;
  hasZeroOrNegativeProfit?: boolean;
}

interface CommissionPayoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  stores: any[];
  profiles: any[];
  collaborators: any[]; // Colaboradores com dados de ranking/comissões
  allSales: any[];
  allServiceOrders: any[];
  osItems: any[];
  userRolesMap: Map<string, any>;
  settledSaleIds: Set<string>;
  settledOsIds: Set<string>;
  currentUserName: string;
  initialUserId?: string;
  onSuccess: () => void;
}

export const CommissionPayoutModal: React.FC<CommissionPayoutModalProps> = ({
  open,
  onOpenChange,
  storeId,
  stores,
  profiles,
  collaborators,
  allSales,
  allServiceOrders,
  osItems,
  userRolesMap,
  settledSaleIds,
  settledOsIds,
  currentUserName,
  initialUserId,
  onSuccess,
}) => {
  const [selectedUserId, setSelectedUserId] = useState<string>(initialUserId || "");
  const [selectedStoreId, setSelectedStoreId] = useState<string>(storeId === "all" ? (stores[0]?.id ?? "") : storeId);
  const [paymentMethod, setPaymentMethod] = useState<"dinheiro" | "pix" | "transferencia">("pix");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [openRegisters, setOpenRegisters] = useState<any[]>([]);
  const [selectedCashRegisterId, setSelectedCashRegisterId] = useState<string>("");
  const [loadingOpenRegister, setLoadingOpenRegister] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [directOsParts, setDirectOsParts] = useState<any[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);
  const [failedOsInfo, setFailedOsInfo] = useState<{
    id: string;
    orderNumber?: number;
    label: string;
    title: string;
    description: string;
    badgeText: string;
    profitText?: string;
  } | null>(null);
  const [errorPopupData, setErrorPopupData] = useState<{
    osId: string;
    orderNumber?: number;
    osLabel: string;
    deviceModel?: string;
    requestedService?: string;
    title: string;
    description: string;
    badgeText: string;
  } | null>(null);

  const handleOpenOS = (osId: string) => {
    if (!osId) return;
    window.open(`/ordens-servico?openOs=${osId}`, "_blank");
  };

  // Limpa erro de OS ao trocar usuário, loja ou fechar modal
  useEffect(() => {
    setFailedOsInfo(null);
    setErrorPopupData(null);
  }, [selectedUserId, selectedStoreId, open]);

  // Sincroniza usuário inicial quando o modal abre
  useEffect(() => {
    if (open && initialUserId) {
      setSelectedUserId(initialUserId);
    }
  }, [open, initialUserId]);

  // Período de apuração customizável (defaults: início do mês até hoje no fuso canônico)
  const [startDate, setStartDate] = useState<string>(() => {
    const todayBrasilia = toBrasiliaDateString(new Date());
    return todayBrasilia.slice(0, 8) + "01";
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return toBrasiliaDateString(new Date());
  });

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p.display_name ?? p.user_id])), [profiles]);
  const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);

  // Se modal abrir ou storeId mudar, sincroniza loja
  useEffect(() => {
    if (storeId && storeId !== "all") {
      setSelectedStoreId(storeId);
    } else if (stores.length > 0 && !selectedStoreId) {
      setSelectedStoreId(stores[0].id);
    }
  }, [storeId, stores]);

  // Carrega contas bancárias da loja para pagamentos Pix/Transferência
  useEffect(() => {
    if (!selectedStoreId) return;
    supabase
      .from("store_bank_accounts" as any)
      .select("*")
      .eq("store_id", selectedStoreId)
      .then(({ data }) => {
        const list = (data as any[]) ?? [];
        setBankAccounts(list);
        if (list.length > 0 && !selectedAccountId) {
          setSelectedAccountId(list[0].id);
        }
      });
  }, [selectedStoreId]);

  // Verifica se há caixa aberto na loja selecionada para pagamento em dinheiro
  useEffect(() => {
    if (!selectedStoreId) return;
    setLoadingOpenRegister(true);
    supabase
      .from("cash_registers" as any)
      .select("*")
      .eq("store_id", selectedStoreId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data as any[]) ?? [];
        setOpenRegisters(list);
        if (list.length > 0) {
          setSelectedCashRegisterId(list[0].id);
        } else {
          setSelectedCashRegisterId("");
        }
        setLoadingOpenRegister(false);
      });
  }, [selectedStoreId]);

  // Busca em tempo real as peças das OSs entregues do técnico selecionado para precisão contábil
  useEffect(() => {
    if (!open || !selectedUserId || !selectedStoreId) {
      setDirectOsParts([]);
      return;
    }

    const targetOsIds = allServiceOrders
      .filter((o) => o.technician_id === selectedUserId && o.store_id === selectedStoreId && o.status === "delivered")
      .map((o) => o.id);

    if (targetOsIds.length === 0) {
      setDirectOsParts([]);
      return;
    }

    setLoadingParts(true);
    const chunkSize = 50;
    const chunks: string[][] = [];
    for (let i = 0; i < targetOsIds.length; i += chunkSize) {
      chunks.push(targetOsIds.slice(i, i + chunkSize));
    }

    Promise.all(
      chunks.map((chunk) =>
        supabase
          .from("service_order_items" as any)
          .select("service_order_id, unit_cost, quantity")
          .in("service_order_id", chunk)
      )
    )
      .then((results) => {
        const allParts: any[] = [];
        results.forEach((res) => {
          if (res.data) allParts.push(...res.data);
        });
        setDirectOsParts(allParts);
      })
      .catch((err) => {
        console.error("Erro ao sincronizar peças das OSs do técnico:", err);
      })
      .finally(() => {
        setLoadingParts(false);
      });
  }, [open, selectedUserId, selectedStoreId, allServiceOrders]);

  const effectiveOsItems = useMemo(() => {
    if (directOsParts.length > 0) {
      const directMap = new Set(directOsParts.map((p) => p.service_order_id));
      const fallbackRemaining = (osItems || []).filter((p) => !directMap.has(p.service_order_id));
      return [...directOsParts, ...fallbackRemaining];
    }
    return osItems || [];
  }, [directOsParts, osItems]);

  // Apura as comissões pendentes (NÃO liquidadas) do colaborador selecionado
  const pendingItems = useMemo<PendingCommissionItem[]>(() => {
    if (!selectedUserId || !selectedStoreId) return [];

    const items: PendingCommissionItem[] = [];

    // 1. Vendas pendentes (CANONICAL_SALES_COMMISSION_OWNER = created_by)
    allSales.forEach((s) => {
      if (s.created_by === selectedUserId && s.store_id === selectedStoreId) {
        if (!settledSaleIds.has(s.id)) {
          const commVal = Number(s.commission_value || 0);
          if (commVal > 0) {
            // Validação estrita de período de apuração no fuso canônico (America/Sao_Paulo)
            const saleDate = s.created_at ? toBrasiliaDateString(s.created_at) : "";
            if (startDate && saleDate < startDate) return;
            if (endDate && saleDate > endDate) return;

            const salePrice = Number(s.sale_price || 0);
            items.push({
              id: s.id,
              type: "sale",
              date: formatBrasiliaDate(s.created_at),
              label: `Venda: ${s.products?.name || "Aparelho"} (${s.customer_name || "Avulso"})`,
              grossAmount: salePrice,
              costAmount: null,
              profitAmount: null,
              commissionPercent: Number(s.commission_percent || 0),
              commissionAmount: commVal,
              hasZeroOrNegativeProfit: false,
            });
          }
        }
      }
    });

    // 2. Ordens de Serviço entregues pendentes
    allServiceOrders.forEach((o) => {
      if (o.technician_id === selectedUserId && o.store_id === selectedStoreId && o.status === "delivered") {
        if (!settledOsIds.has(o.id)) {
          const roleData = userRolesMap.get(selectedUserId);
          // Validação estrita da habilitação e percentual de comissão sobre serviços
          if (roleData?.commission_on_services !== true) return;
          const commPct = Number(roleData?.commission_services_percent || 0);
          if (commPct <= 0) return;

          // Validação estrita de período de apuração no fuso canônico (America/Sao_Paulo)
          const osDate = o.delivered_at ? toBrasiliaDateString(o.delivered_at) : "";
          if (!osDate) return;
          if (startDate && osDate < startDate) return;
          if (endDate && osDate > endDate) return;

          const gross = Number(o.final_price || o.estimated_price || 0);
          const partsForOs = effectiveOsItems.filter((i) => i.service_order_id === o.id);
          const partsCost = partsForOs.reduce(
            (sum, p) => sum + Number(p.unit_cost || 0) * Number(p.quantity || 1),
            0
          );
          const profit = gross - partsCost;
          const isZeroOrNegative = profit <= 0;
          const commAmount = isZeroOrNegative ? 0 : (profit * commPct) / 100;

          const sName = o.requested_service || "Serviço";
          const dName = [o.device_brand, o.device_model].filter(Boolean).join(" ");
          const labelPrefix = `OS #${o.order_number}`;
          const label = dName ? `${labelPrefix}: ${dName} - ${sName}` : `${labelPrefix}: ${sName}`;

          items.push({
            id: o.id,
            type: "service_order",
            date: formatBrasiliaDate(o.delivered_at),
            label,
            grossAmount: gross,
            costAmount: partsCost,
            profitAmount: profit,
            commissionPercent: commPct,
            commissionAmount: commAmount,
            hasZeroOrNegativeProfit: isZeroOrNegative,
          });
        }
      }
    });

    return items;
  }, [selectedUserId, selectedStoreId, allSales, allServiceOrders, effectiveOsItems, userRolesMap, settledSaleIds, settledOsIds, startDate, endDate]);

  const eligibleItems = useMemo(
    () => pendingItems.filter((i) => !i.hasZeroOrNegativeProfit && i.commissionAmount > 0),
    [pendingItems]
  );

  const ineligibleItems = useMemo(
    () => pendingItems.filter((i) => i.hasZeroOrNegativeProfit || i.commissionAmount <= 0),
    [pendingItems]
  );

  // Por padrão, seleciona apenas os itens ELEGÍVEIS (ignora OS com margem zero/negativa)
  useEffect(() => {
    if (eligibleItems.length > 0) {
      setSelectedItemIds(new Set(eligibleItems.map((i) => i.id)));
    } else {
      setSelectedItemIds(new Set());
    }
  }, [eligibleItems]);

  const toggleItem = (id: string) => {
    const item = pendingItems.find((i) => i.id === id);
    if (item?.hasZeroOrNegativeProfit) {
      toast.warning(
        `A ${item.label} possui margem zero ou prejuízo (${item.profitAmount !== null ? formatCurrency(item.profitAmount) : "R$ 0,00"}) após custo de peças e não gera comissão.`
      );
      return;
    }
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItemIds.size === eligibleItems.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(eligibleItems.map((i) => i.id)));
    }
  };

  // Cálculos consolidados da seleção
  const selectedItems = useMemo(
    () => pendingItems.filter((i) => selectedItemIds.has(i.id)),
    [pendingItems, selectedItemIds]
  );

  const totalToPayout = useMemo(
    () => selectedItems.reduce((acc, it) => acc + it.commissionAmount, 0),
    [selectedItems]
  );

  const selectedSalesIds = useMemo(
    () => selectedItems.filter((i) => i.type === "sale").map((i) => i.id),
    [selectedItems]
  );

  const selectedOsIds = useMemo(
    () => selectedItems.filter((i) => i.type === "service_order").map((i) => i.id),
    [selectedItems]
  );

  const isCashBlocked = paymentMethod === "dinheiro" && (!openRegisters.length || !selectedCashRegisterId);
  const canSubmit =
    Boolean(selectedUserId) &&
    Boolean(selectedStoreId) &&
    selectedItems.length > 0 &&
    totalToPayout > 0 &&
    !isCashBlocked &&
    (paymentMethod === "dinheiro" || Boolean(selectedAccountId)) &&
    !isSubmitting;

  const handleExecutePayout = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      // Salvaguarda prévia no frontend: nunca envia itens com margem zero ou prejuízo
      const invalidSelected = selectedItems.filter((it) => it.hasZeroOrNegativeProfit || it.commissionAmount <= 0);
      if (invalidSelected.length > 0) {
        toast.error(
          `A ${invalidSelected[0].label} possui margem zero ou negativa e não pode ser liquidada. Ela foi desmarcada automaticamente da seleção.`,
          { duration: 6000 }
        );
        setSelectedItemIds((prev) => {
          const next = new Set(prev);
          invalidSelected.forEach((inv) => next.delete(inv.id));
          return next;
        });
        setIsSubmitting(false);
        return;
      }

      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!selectedStoreId || !UUID_REGEX.test(selectedStoreId)) {
        toast.error("Loja da liquidação não identificada ou inválida. Não é possível prosseguir.");
        setIsSubmitting(false);
        return;
      }

      let uploadedReceiptUrl: string | null = null;
      if (receiptFile) {
        const optimized = await convertToWebP(receiptFile);
        const safeName = `liquidacao-${selectedUserId.slice(0, 8)}-${Date.now()}.webp`;
        const { data: upData, error: upError } = await supabase.storage
          .from("comprovantes")
          .upload(`${selectedStoreId}/comissoes/${safeName}`, optimized, { upsert: false });
        if (upError) {
          toast.error("Erro no upload do comprovante: " + upError.message);
          setIsSubmitting(false);
          return;
        }
        if (upData) {
          const { data: pubData } = supabase.storage.from("comprovantes").getPublicUrl(upData.path);
          uploadedReceiptUrl = pubData.publicUrl;
        }
      }

      const payload: SettleCommissionsPayload = {
        store_id: selectedStoreId,
        user_id: selectedUserId,
        period_start: startDate,
        period_end: endDate,
        payment_method: paymentMethod,
        source_type: paymentMethod === "dinheiro" ? "caixa" : "banco",
        cash_register_id: paymentMethod === "dinheiro" ? selectedCashRegisterId : null,
        source_account_id: paymentMethod === "dinheiro" ? null : selectedAccountId,
        notes: notes.trim() || null,
        receipt_url: uploadedReceiptUrl,
        sale_ids: selectedSalesIds,
        service_order_ids: selectedOsIds,
      };

      const result = await settleCommissionsRPC(payload);

      toast.success(
        `Liquidação concluída! ${new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(result.total_amount)} pagos para ${result.user_name}.`
      );

      // Busca os itens do settlement para gerar o PDF formal de quitação
      try {
        const items = await fetchSettlementItems(result.settlement_id);
        const targetStoreName = storeMap.get(selectedStoreId) || "Cell Pro 360";
        generateSettlementReceiptPDF({
          settlement: {
            id: result.settlement_id,
            paid_at: new Date().toISOString(),
            period_start: startDate,
            period_end: endDate,
            total_sales_commission: result.total_sales_commission,
            total_service_commission: result.total_service_commission,
            total_amount: result.total_amount,
            payment_method: paymentMethod,
            source_type: payload.source_type,
            notes,
          },
          items,
          storeName: targetStoreName,
          collaboratorName: result.user_name,
          managerName: currentUserName || "Gestão Financeira",
        });
        toast.info("Recibo de quitação em PDF gerado e baixado automaticamente!");
      } catch (pdfErr) {
        console.error("Erro ao gerar PDF do recibo:", pdfErr);
      }

      onSuccess();
      onOpenChange(false);
      // Reset form
      setSelectedUserId("");
      setSelectedItemIds(new Set());
      setNotes("");
      setReceiptFile(null);
    } catch (err: any) {
      console.error("Erro ao liquidar comissões:", err);
      const rawMsg = err?.message || String(err) || "Erro desconhecido";

      // Interceptação e tradução amigável de qualquer erro relacionado a OS/Venda na liquidação
      const uuidMatch = rawMsg.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      const failedId = uuidMatch ? uuidMatch[0] : "";
      const ordersList = Array.isArray(allServiceOrders) ? allServiceOrders : [];
      const targetOs = ordersList.find((o) => o.id === failedId);
      const pendingMatch = pendingItems.find((p) => p.id === failedId);

      const devModel = [targetOs?.device_brand, targetOs?.device_model].filter(Boolean).join(" ");
      const osLabel = targetOs
        ? `OS #${targetOs.order_number}${devModel ? ` (${devModel})` : ""}`
        : pendingMatch
        ? pendingMatch.label
        : failedId
        ? `OS (${failedId.slice(0, 8)})`
        : "Ordem de Serviço";

      const isZeroProfit = rawMsg.includes("SERVICE_ORDER_ZERO_PROFIT") || rawMsg.includes("margem/lucro zero") || rawMsg.includes("comissão nula");
      const isOwnerMismatch = rawMsg.includes("OWNER_MISMATCH");
      const isAlreadySettled = rawMsg.includes("ALREADY_SETTLED") || rawMsg.includes("já foi liquidada");
      const isStoreMismatch = rawMsg.includes("STORE_MISMATCH") || rawMsg.includes("outra loja");
      const isNotDelivered = rawMsg.includes("NOT_DELIVERED") || rawMsg.includes("delivered");

      const profitMatch = rawMsg.match(/R\$\s*(-?[\d\.,]+)/i);
      const profitText = profitMatch ? profitMatch[1] : "";

      let errorTitle = "Divergência na Ordem de Serviço";
      let errorBadge = "Atenção na OS";
      let errorDesc = `Houve uma inconsistência com a ${osLabel}: ${rawMsg}. Ela foi desmarcada automaticamente da seleção para que você possa concluir a baixa das demais.`;

      if (isZeroProfit) {
        errorTitle = "Ordem de Serviço com Margem Negativa";
        errorBadge = profitText ? `Prejuízo: R$ ${profitText}` : "Margem Zero";
        errorDesc = `O custo das peças lançadas nesta OS superou o valor cobrado do cliente, gerando prejuízo contábil${profitText ? ` (R$ ${profitText})` : ""} e impedindo o pagamento da comissão. Ela foi desmarcada automaticamente da lista para você prosseguir com a liquidação dos demais serviços.`;
      } else if (isOwnerMismatch) {
        errorTitle = "Técnico Não Atribuído a esta OS";
        errorBadge = "Técnico Divergente";
        errorDesc = `A ${osLabel} não está vinculada a este técnico no sistema (ou foi alterada recentemente). Ela foi desmarcada automaticamente da lista para que você possa prosseguir com a liquidação das demais comissões.`;
      } else if (isAlreadySettled) {
        errorTitle = "Ordem de Serviço Já Liquidada";
        errorBadge = "Já Liquidada";
        errorDesc = `A ${osLabel} já teve sua comissão quitada em outra liquidação formal. Ela foi desmarcada automaticamente da lista.`;
      } else if (isStoreMismatch) {
        errorTitle = "OS Pertencente a Outra Loja";
        errorBadge = "Loja Divergente";
        errorDesc = `A ${osLabel} pertence a outra filial cadastrada no sistema. Ela foi desmarcada automaticamente da lista.`;
      } else if (isNotDelivered) {
        errorTitle = "OS Não Entregue";
        errorBadge = "Status Inválido";
        errorDesc = `A ${osLabel} não consta com status Entregue (delivered). Apenas serviços finalizados e entregues geram direito a comissão. Ela foi desmarcada automaticamente.`;
      }

      const hasOsError = failedId || isZeroProfit || isOwnerMismatch || isAlreadySettled || isStoreMismatch || isNotDelivered;

      if (hasOsError) {
        if (failedId) {
          // Desmarca a OS do conjunto de selecionados para permitir a liquidação direta dos outros itens
          setSelectedItemIds((prev) => {
            const next = new Set(prev);
            next.delete(failedId);
            return next;
          });

          setFailedOsInfo({
            id: failedId,
            orderNumber: targetOs?.order_number,
            label: osLabel,
            title: errorTitle,
            description: errorDesc,
            badgeText: errorBadge,
            profitText,
          });
        }

        // Abre o POPUP dedicado na tela
        setErrorPopupData({
          osId: failedId,
          orderNumber: targetOs?.order_number,
          osLabel,
          deviceModel: devModel || targetOs?.device_model,
          requestedService: targetOs?.requested_service,
          title: errorTitle,
          description: errorDesc,
          badgeText: errorBadge,
        });

        toast.error(
          `${errorTitle}: ${osLabel}. Ela foi desmarcada automaticamente para você prosseguir com a liquidação.`,
          {
            duration: 12000,
            action: failedId
              ? {
                  label: `Abrir ${targetOs ? `OS #${targetOs.order_number}` : "OS"} ↗`,
                  onClick: () => handleOpenOS(failedId),
                }
              : undefined,
          }
        );
        return;
      }

      toast.error(`Falha na liquidação: ${rawMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-border/50 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="font-display text-lg font-bold">
                Liquidação de Comissões
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Baixa atômica de comissões com quitação formal e débito no financeiro
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 1. Seleção de Loja e Colaborador */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Loja de Origem</Label>
              <Select
                value={selectedStoreId}
                onValueChange={(v) => {
                  setSelectedStoreId(v);
                  setSelectedUserId("");
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione a loja..." />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Colaborador (Vendedor ou Técnico)</Label>
              <Select
                value={selectedUserId}
                onValueChange={(uid) => setSelectedUserId(uid)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione quem receberá..." />
                </SelectTrigger>
                <SelectContent>
                  {collaborators.map((c) => (
                    <SelectItem key={c.uid} value={c.uid} className="text-xs">
                      {c.nome} ({c.role === "tecnico" ? "Técnico" : "Vendedor"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 2. Filtro de Período de Apuração */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-muted/20 rounded-lg border border-border/40">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Data Inicial
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 text-xs bg-background"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Data Final
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 text-xs bg-background"
              />
            </div>
          </div>

          {/* 3. Lista de Vendas e OSs Pendentes */}
          {selectedUserId ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-foreground">
                    Operações Pendentes ({pendingItems.length})
                  </span>
                  {pendingItems.length > 0 && (
                    <Badge variant="outline" className="text-[10px] h-5">
                      {selectedItemIds.size} de {eligibleItems.length} selecionadas
                    </Badge>
                  )}
                  {ineligibleItems.length > 0 && (
                    <Badge variant="destructive" className="text-[10px] h-5 gap-1 font-semibold">
                      <AlertTriangle className="h-3 w-3" />
                      {ineligibleItems.length === 1
                        ? "1 com margem zero/negativa (desmarcada)"
                        : `${ineligibleItems.length} com margem zero/negativa (desmarcadas)`}
                    </Badge>
                  )}
                  {loadingParts && (
                    <span className="text-[10px] text-muted-foreground animate-pulse">
                      Sincronizando peças...
                    </span>
                  )}
                </div>
                {eligibleItems.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-primary"
                    onClick={toggleSelectAll}
                  >
                    {selectedItemIds.size === eligibleItems.length
                      ? "Desmarcar Todos"
                      : "Selecionar Elegíveis"}
                  </Button>
                )}
              </div>

              {/* Banner de Erro Crítico quando houver falha de liquidação reportada pelo banco */}
              {failedOsInfo && (
                <div className="p-3 rounded-lg bg-destructive/15 border-2 border-destructive/40 text-destructive text-xs space-y-2 animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
                      <div>
                        <span className="font-bold text-xs block text-destructive">
                          Atenção: {failedOsInfo.title} ({failedOsInfo.label})
                        </span>
                        <p className="text-[11px] text-destructive/90 mt-0.5 leading-snug">
                          {failedOsInfo.description}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs font-semibold gap-1.5 shrink-0 shadow-xs"
                      onClick={() => handleOpenOS(failedOsInfo.id)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir OS {failedOsInfo.orderNumber ? `#${failedOsInfo.orderNumber}` : ""}
                    </Button>
                  </div>
                </div>
              )}

              {/* Banner de Alerta Visual quando houver OS com margem zero ou prejuízo */}
              {ineligibleItems.length > 0 && !failedOsInfo && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                  <div className="space-y-0.5">
                    <span className="font-semibold block text-amber-700 dark:text-amber-300">
                      {ineligibleItems.length === 1
                        ? "Atenção: 1 Ordem de Serviço não elegível para comissão (Margem Zero ou Negativa)"
                        : `Atenção: ${ineligibleItems.length} Ordens de Serviço não elegíveis para comissão (Margem Zero ou Negativa)`}
                    </span>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      O custo das peças atingiu ou superou o valor cobrado do cliente. Pela regra de negócio, essas OSs não geram comissão e foram desmarcadas automaticamente para permitir a liquidação dos demais serviços sem erros.
                    </p>
                  </div>
                </div>
              )}

              {pendingItems.length === 0 ? (
                <div className="py-8 text-center bg-muted/10 rounded-lg border border-dashed border-border text-muted-foreground text-xs">
                  Nenhuma comissão pendente encontrada para este colaborador na loja selecionada.
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 border border-border/50 rounded-lg p-2 bg-background">
                  {pendingItems.map((item) => {
                    const isChecked = selectedItemIds.has(item.id);
                    const isFailed = failedOsInfo?.id === item.id;
                    const isNegative = Boolean(item.hasZeroOrNegativeProfit) || isFailed;

                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleItem(item.id)}
                        className={`flex items-center justify-between p-2 rounded-md border text-xs transition-colors ${
                          isFailed
                            ? "bg-destructive/10 border-destructive ring-1 ring-destructive/40"
                            : isNegative
                            ? "bg-destructive/5 border-destructive/30 opacity-80 cursor-not-allowed"
                            : isChecked
                            ? "bg-primary/5 border-primary/30 cursor-pointer"
                            : "bg-muted/10 border-border/40 hover:bg-muted/20 cursor-pointer"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Checkbox
                            checked={isChecked}
                            disabled={isNegative}
                            onCheckedChange={() => toggleItem(item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge
                                variant="outline"
                                className={`text-[9px] py-0 h-4 font-mono ${
                                  item.type === "sale"
                                    ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                    : "bg-purple-500/10 text-purple-500 border-purple-500/20"
                                }`}
                              >
                                {item.type === "sale" ? "VENDA" : "OS"}
                              </Badge>

                              {isFailed ? (
                                <Badge variant="destructive" className="text-[9px] py-0 h-4 gap-1 font-bold animate-pulse">
                                  <AlertTriangle className="h-2.5 w-2.5" /> Prejuízo no Reparo (Erro de Margem)
                                </Badge>
                              ) : isNegative ? (
                                <Badge variant="destructive" className="text-[9px] py-0 h-4 gap-1 font-semibold">
                                  <AlertTriangle className="h-2.5 w-2.5" /> Margem Negativa / Sem Lucro
                                </Badge>
                              ) : null}

                              <span className={`font-semibold truncate ${isNegative ? "text-muted-foreground" : "text-foreground"}`}>
                                {item.label}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {item.date} · Faturado: {formatCurrency(item.grossAmount)}
                              {item.costAmount !== null && item.costAmount > 0 && ` · Peças: ${formatCurrency(item.costAmount)}`}
                              {item.profitAmount !== null && (
                                <span className={item.profitAmount <= 0 ? " text-destructive font-semibold" : ""}>
                                  {` · Margem/Lucro: ${formatCurrency(item.profitAmount)}`}
                                </span>
                              )}
                              {!isNegative && ` (${item.commissionPercent}%)`}
                              {isFailed && (
                                <span className="text-destructive font-semibold ml-1">
                                  — {failedOsInfo?.title || "Divergência na OS"}{failedOsInfo?.profitText ? ` (R$ ${failedOsInfo.profitText})` : ""}. Clique em &quot;Abrir OS&quot; para conferir.
                                </span>
                              )}
                              {!isFailed && isNegative && (
                                <span className="text-destructive font-medium ml-1">
                                  — Custo de peças superou o faturamento
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 pl-2 flex flex-col items-end gap-1">
                          {isNegative ? (
                            <span className="text-[10px] font-semibold text-muted-foreground font-mono bg-muted/40 px-1.5 py-0.5 rounded">
                              R$ 0,00 (Nula)
                            </span>
                          ) : (
                            <span className="font-mono font-bold text-primary text-xs">
                              {formatCurrency(item.commissionAmount)}
                            </span>
                          )}

                          {item.type === "service_order" && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={`h-5 text-[10px] gap-1 px-1.5 font-medium ${
                                isFailed
                                  ? "bg-destructive/20 text-destructive hover:bg-destructive/30 border border-destructive/40"
                                  : "text-muted-foreground hover:text-primary"
                              }`}
                              title="Abrir Ordem de Serviço em nova aba"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenOS(item.id);
                              }}
                            >
                              <ExternalLink className="h-2.5 w-2.5" /> Abrir OS
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-xs bg-muted/10 rounded-lg border border-dashed">
              Selecione um colaborador acima para visualizar suas vendas e serviços pendentes.
            </div>
          )}

          {/* 4. Forma de Pagamento e Conta/Caixa */}
          <div className="p-3 bg-muted/20 rounded-lg border border-border/40 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Forma de Pagamento</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v: any) => setPaymentMethod(v)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix" className="text-xs">
                      📱 PIX (Conta Bancária)
                    </SelectItem>
                    <SelectItem value="transferencia" className="text-xs">
                      🏦 Transferência / TED
                    </SelectItem>
                    <SelectItem value="dinheiro" className="text-xs">
                      💵 Dinheiro (Saída da Gaveta do Caixa)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === "dinheiro" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Sessão do Caixa</Label>
                  {loadingOpenRegister ? (
                    <div className="h-9 px-3 rounded-md border text-xs flex items-center bg-background text-muted-foreground">
                      Verificando...
                    </div>
                  ) : openRegisters.length === 0 ? (
                    <div className="h-9 px-3 rounded-md border text-xs flex items-center justify-between bg-background text-destructive font-medium">
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> Sem caixa aberto
                      </span>
                    </div>
                  ) : openRegisters.length === 1 ? (
                    <div className="h-9 px-3 rounded-md border text-xs flex items-center justify-between bg-background text-primary font-medium">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Caixa Aberto
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        #{openRegisters[0].id.slice(0, 8)}
                      </span>
                    </div>
                  ) : (
                    <Select
                      value={selectedCashRegisterId}
                      onValueChange={(v) => setSelectedCashRegisterId(v)}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Selecione o caixa aberto..." />
                      </SelectTrigger>
                      <SelectContent>
                        {openRegisters.map((reg) => (
                          <SelectItem key={reg.id} value={reg.id} className="text-xs">
                            Caixa #{reg.id.slice(0, 8)} ({new Date(reg.opened_at || reg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Conta Bancária de Saída</Label>
                  <Select
                    value={selectedAccountId}
                    onValueChange={(v) => setSelectedAccountId(v)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Selecione a conta..." />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((b) => (
                        <SelectItem key={b.id} value={b.id} className="text-xs">
                          {b.bank_name} ({b.owner_type || "PJ"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Alerta de Caixa Fechado */}
            {isCashBlocked && (
              <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-md text-xs text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Atenção:</strong> É obrigatório ter uma sessão de caixa aberta nesta loja para efetuar liquidações em dinheiro físico.
                </span>
              </div>
            )}

            {/* Observações e Comprovante */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Observações (opcional)</Label>
                <Input
                  placeholder="Ex: Adiantamento quinzenal, acerto fechamento..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Comprovante de Transferência (opcional)</Label>
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                  className="h-8 text-xs bg-background file:text-xs file:py-0"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer com Totalizador e Ação */}
        <DialogFooter className="p-4 border-t border-border/50 bg-muted/20 flex sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                Total da Baixa ({selectedItems.length} itens)
              </p>
              <p className="font-mono text-xl font-bold text-primary">
                {formatCurrency(totalToPayout)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 text-xs gap-1.5 bg-primary text-primary-foreground font-semibold shadow-sm"
              onClick={handleExecutePayout}
              disabled={!canSubmit}
            >
              {isSubmitting ? (
                <>Processando Liquidação...</>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" /> Confirmar e Liquidar
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Popup Modal dedicado para exibição da OS com Margem Negativa e Ação Direta */}
    <Dialog open={Boolean(errorPopupData)} onOpenChange={(open) => !open && setErrorPopupData(null)}>
      <DialogContent className="max-w-md p-6 border-destructive/40 shadow-2xl z-[100]">
        <DialogHeader className="space-y-2">
          <div className="h-12 w-12 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive mx-auto">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center text-lg font-bold text-foreground">
            {errorPopupData?.title || "Divergência na Ordem de Serviço"}
          </DialogTitle>
        </DialogHeader>

        {errorPopupData && (
          <div className="space-y-4 pt-1">
            <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-lg space-y-2 text-xs">
              <div className="flex items-center justify-between font-semibold text-destructive">
                <span className="font-bold text-sm">{errorPopupData.osLabel}</span>
                <Badge variant="destructive" className="text-[10px] uppercase font-bold px-2 py-0.5">
                  {errorPopupData.badgeText}
                </Badge>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {errorPopupData.description}
              </p>
            </div>

            <div className="bg-muted/30 p-3.5 rounded-lg border border-border/50 text-xs space-y-2">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Número da OS:</span>
                <span className="font-bold text-foreground">
                  {errorPopupData.orderNumber ? `OS #${errorPopupData.orderNumber}` : errorPopupData.osId.slice(0, 8)}
                </span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Aparelho / Modelo:</span>
                <span className="font-semibold text-foreground">{errorPopupData.deviceModel || "Não especificado"}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Serviço Realizado:</span>
                <span className="font-semibold text-foreground">{errorPopupData.requestedService || "Serviço"}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                type="button"
                className="w-full h-10 gap-2 bg-primary text-primary-foreground font-semibold shadow-md text-xs hover:bg-primary/90"
                onClick={() => {
                  handleOpenOS(errorPopupData.osId);
                }}
              >
                <ExternalLink className="h-4 w-4" />
                Abrir Ordem de Serviço {errorPopupData.orderNumber ? `#${errorPopupData.orderNumber}` : ""} para Analisar
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full h-9 text-xs"
                onClick={() => {
                  setErrorPopupData(null);
                }}
              >
                Continuar Liquidação sem esta OS
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
};
