import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, ShoppingBag, Smartphone, CreditCard, Banknote, QrCode,
  Zap, Trash2, Search, FileText, MessageCircle, User as UserIcon, UserPlus,
  ChevronDown, ChevronUp, History, Tag, Shield, Landmark, Store, AlertTriangle, Eye,
  MapPin, Percent, CalendarDays, StickyNote, ArrowLeftRight, Wallet, RefreshCcw, Pencil,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { gerarNotaFiscalInterna, type NotaFiscalData } from "@/utils/notaFiscalInterna";
import { triggerWebhook } from "@/utils/webhookSender";
import { logAction } from "@/utils/auditLogger";
import { useCustomerManager } from "@/hooks/features/vendas/useCustomerManager";
import { useCartManager } from "@/hooks/features/vendas/useCartManager";
import { useVendas } from "@/hooks/features/vendas/useVendas";
import { PdvFormModal } from "@/components/features/vendas/PdvFormModal";
import { DetalhesVendaModal } from "@/components/features/vendas/DetalhesVendaModal";
import { NovaVendaModal } from "@/components/features/vendas/NovaVendaModal";
import { EditarVendaModal } from "@/components/features/vendas/EditarVendaModal";
import { EditarPdvModal } from "@/components/features/vendas/EditarPdvModal";
import { DeleteSaleDialog } from "@/components/features/vendas/DeleteSaleDialog";
import {
  Sale,
  Customer,
  Accessory,
  CartItem,
  formatCurrency,
} from "@/components/features/vendas/types";

import { createPendingCashEntry, formatDescription } from "@/lib/services/salesService";
// Note: cash_register_id is now delegated to salesService.ts to keep this component clean.

const emptyCustomerForm = { name: "", phone: "", cpf: "", address: "", email: "", birth: "" };

const Vendas = () => {
  const { user, userRole, activeStoreId, setActiveStoreId } = useAuth();
  const {
    sales, setSales,
    products, setProducts,
    accessories, setAccessories,
    stores, profiles, customers, setCustomers, bankAccounts,
    pdvSales, setPdvSales,
    loading, setLoading,
    currentUserCommissionPercent,
    fetchData
  } = useVendas();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [notaLoading, setNotaLoading] = useState<string | null>(null);

  const {
    cart, setCart, accSearch, setAccSearch, pdvOpen, setPdvOpen, pdvPayment, setPdvPayment,
    filteredAcc, addToCart, updateCartQty, updateCartPrice, resetPdv, handlePdvSubmit
  } = useCartManager(accessories, activeStoreId, user, setLoading, fetchData, stores);

  const {
    customerSearch, setCustomerSearch,
    customerResults, setCustomerResults,
    selectedCustomer, setSelectedCustomer,
    showCustomerHistory, setShowCustomerHistory,
    showNewCustomerForm, setShowNewCustomerForm,
    newCustomerForm, setNewCustomerForm,
    customerSalesHistory, setCustomerSalesHistory,
    selectCustomer, clearCustomer, handleCreateCustomer
  } = useCustomerManager(customers, activeStoreId, user, setLoading, (c) => setCustomers(prev => [...prev, c]));
  const [justification, setJustification] = useState("");
  const [deleteItem, setDeleteItem] = useState<{ id: string, type: "sale" | "pdv" } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [salesSearch, setSalesSearch] = useState("");
  const [selectedViewSale, setSelectedViewSale] = useState<Sale | null>(null);
  const [editSale, setEditSale] = useState<Sale | null>(null);
  const [editForm, setEditForm] = useState({
    sale_price: "",
    discount: "",
    payment_cash: "",
    payment_card: "",
    payment_pix: "",
    installments: "1",
    warranty_days: "90",
    commission_percent: "0",
    notes: "",
    customer_name: "",
    product_name: "",
    product_cost: "",
    product_imei: "",
    retro_date: "",
    // Trade-in fields
    has_trade_in: false,
    trade_in_device_name: "",
    trade_in_device_brand: "iPhone",
    trade_in_device_model: "",
    trade_in_device_imei: "",
    trade_in_value: "",
  });
  const [editSaleCustomerId, setEditSaleCustomerId] = useState<string>("");
  const [showEditNewCustomerForm, setShowEditNewCustomerForm] = useState(false);
  const [editNewCustomerForm, setEditNewCustomerForm] = useState(emptyCustomerForm);
  const searchRef = useRef<HTMLDivElement>(null);
  const isSubmitting = useRef(false);

  // Estado para edição de venda PDV (acessórios)
  const [editPdvSale, setEditPdvSale] = useState<any | null>(null);
  const [editPdvForm, setEditPdvForm] = useState({
    description: "", amount: "", payment_cash: "", payment_card: "", payment_pix: "", retro_date: "",
  });

  const [form, setForm] = useState({
    product_id: "", sale_price: "", has_trade_in: false,
    trade_in_device_name: "", trade_in_device_brand: "iPhone",
    trade_in_device_model: "", trade_in_device_imei: "",
    trade_in_value: "", payment_cash: "", payment_card: "",
    payment_pix: "", notes: "", commission_percent: "10",
    discount: "0", warranty_days: "90", installments: "1",
    destination_account_id: "",
    retro_date: "",
    trade_in_devices: [] as any[],
  });

  useEffect(() => {
    if (currentUserCommissionPercent) {
      setForm(prev => ({ ...prev, commission_percent: currentUserCommissionPercent }));
    }
  }, [currentUserCommissionPercent]);

  const handleCreateCustomerForEdit = async () => {
    if (!user || !editNewCustomerForm.name) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from("customers").insert({
        name: editNewCustomerForm.name,
        phone: editNewCustomerForm.phone || null,
        cpf: editNewCustomerForm.cpf || null,
        address: editNewCustomerForm.address || null,
        email: editNewCustomerForm.email || null,
        created_by: user.id,
      }).select().single();
      
      if (error) {
        toast.error(error.message);
        return;
      }
      
      toast.success("Cliente cadastrado com sucesso!");
      await fetchData();
      setEditSaleCustomerId(data.id);
      setEditForm(prev => ({ ...prev, customer_name: data.name }));
      setShowEditNewCustomerForm(false);
      setEditNewCustomerForm(emptyCustomerForm);
    } catch (err: any) {
      toast.error("Erro ao cadastrar cliente: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const storeMap = new Map(stores.map(s => [s.id, s]));
  const productMap = new Map(products.map(p => [p.id, p]));
  const profileMap = new Map(profiles.map(p => [p.user_id, p.display_name ?? p.user_id]));
  const currentProfile = profiles.find(p => p.user_id === user?.id);

  const availableProducts = products.filter(p => p.status === "in_stock");
  const selectedProduct = products.find(p => p.id === form.product_id);

  // Estados para filtro por data
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Filtro da lista de vendas por cliente, modelo, IMEI ou data
  const filteredSales = sales.filter(sale => {
    // Filtro por data
    if (filterStartDate) {
      const start = new Date(filterStartDate + "T00:00:00");
      const saleDate = new Date(sale.created_at);
      if (saleDate < start) return false;
    }
    if (filterEndDate) {
      const end = new Date(filterEndDate + "T23:59:59");
      const saleDate = new Date(sale.created_at);
      if (saleDate > end) return false;
    }

    if (!salesSearch.trim()) return true;
    const q = salesSearch.toLowerCase().trim();
    const product = productMap.get(sale.product_id) as any;
    return (
      (sale.customer_name && sale.customer_name.toLowerCase().includes(q)) ||
      (product?.name && product.name.toLowerCase().includes(q)) ||
      (product?.model && product.model.toLowerCase().includes(q)) ||
      (product?.imei && product.imei.toLowerCase().includes(q)) ||
      (product?.brand && product.brand.toLowerCase().includes(q))
    );
  });

  const discount = parseFloat(form.discount) || 0;
  const tradeInVal = form.has_trade_in ? (form.trade_in_devices?.reduce((acc: number, d: any) => acc + (parseFloat(d.value) || 0), 0) || 0) : 0;
  const cashVal = parseFloat(form.payment_cash) || 0;
  const cardVal = parseFloat(form.payment_card) || 0;
  const pixVal = parseFloat(form.payment_pix) || 0;
  const salePrice = parseFloat(form.sale_price) || 0;
  const salePriceAfterDiscount = Math.max(0, salePrice - discount);
  const totalPayment = (form.has_trade_in ? tradeInVal : 0) + cashVal + cardVal + pixVal;
  const remaining = salePriceAfterDiscount - totalPayment;
  const profit = selectedProduct ? salePriceAfterDiscount - Number(selectedProduct.cost_price) : 0;
  const commissionPercent = parseFloat(form.commission_percent) || 0;
  const commissionValue = Math.max(0, (profit * commissionPercent) / 100);

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const pdvCash = parseFloat(pdvPayment.cash) || 0;
  const pdvCard = parseFloat(pdvPayment.card) || 0;
  const pdvPix = parseFloat(pdvPayment.pix) || 0;
  const pdvRemaining = cartTotal - pdvCash - pdvCard - pdvPix;
  const pdvTroco = pdvCash > cartTotal && pdvCard === 0 && pdvPix === 0 ? pdvCash - cartTotal : 0;

  // Note: currentUserCommissionPercent is managed by the useVendas hook

  const resetForm = () => {
    setForm({ product_id: "", sale_price: "", has_trade_in: false, trade_in_device_name: "", trade_in_device_brand: "iPhone", trade_in_device_model: "", trade_in_device_imei: "", trade_in_value: "", payment_cash: "", payment_card: "", payment_pix: "", notes: "", commission_percent: currentUserCommissionPercent, discount: "0", warranty_days: "90", installments: "1", destination_account_id: "", retro_date: "", trade_in_devices: [] });
    clearCustomer();
  };

  // ── Submit venda ──────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedProduct) return;
    if (loading || isSubmitting.current) return;
    if (salePriceAfterDiscount <= 0) {
      toast.error("O valor final da venda não pode ser R$ 0,00. Revise o desconto.");
      return;
    }
    if (Math.abs(remaining) > 0.01) { toast.error("A soma dos pagamentos deve ser igual ao valor de venda!"); return; }
    
    isSubmitting.current = true;
    setLoading(true);

    try {
      // Salva/atualiza cliente se informado
      let customerId = selectedCustomer?.id ?? null;
      if (!selectedCustomer && customerSearch.trim()) {
        const { data: existingCustomer } = await supabase.from("customers").select("*").ilike("name", customerSearch.trim()).maybeSingle();
        if (existingCustomer) { customerId = existingCustomer.id; }
      }

      let tradeInProductId: string | null = null;
      let tradeInDevicesList: any[] = [];
      if (form.has_trade_in) {
        if (form.trade_in_devices && form.trade_in_devices.length > 0) {
          tradeInDevicesList = form.trade_in_devices;
        } else if (form.trade_in_device_name) {
          tradeInDevicesList = [{
            name: form.trade_in_device_name,
            brand: form.trade_in_device_brand,
            model: form.trade_in_device_model,
            imei: form.trade_in_device_imei,
            value: form.trade_in_value
          }];
        }
      }

      const tradeInDetailsText: string[] = [];

      for (let i = 0; i < tradeInDevicesList.length; i++) {
        const device = tradeInDevicesList[i];
        if (!device.name) continue;

        let existingTradeIn = null;
        const deviceVal = parseFloat(device.value) || 0;

        if (device.imei) {
          const { data: existingProduct } = await supabase
            .from("products")
            .select("*")
            .eq("imei", device.imei)
            .maybeSingle();
          existingTradeIn = existingProduct;
        }

        let currentProductId = null;

        if (existingTradeIn) {
          const { data: updatedTip, error: tiErr } = await supabase
            .from("products")
            .update({
              status: "in_stock",
              cost_price: deviceVal,
              original_cost_price: deviceVal,
              store_id: selectedProduct.store_id,
              sale_price: null
            } as any)
            .eq("id", existingTradeIn.id)
            .select("id")
            .maybeSingle();

          if (tiErr) { toast.error(tiErr.message); isSubmitting.current = false; setLoading(false); return; }
          currentProductId = updatedTip?.id || existingTradeIn.id;
          
          await supabase.from("product_history" as any).insert({
            product_id: currentProductId,
            action: "Entrada por Trade-in",
            new_cost: deviceVal,
            notes: `Aparelho recebido como troca na venda do produto ${selectedProduct.name}`,
            created_by: user.id,
          });
        } else {
          const { data: tip, error: tiErr } = await supabase.from("products").insert({
            name: device.name, brand: device.brand || "Genérico",
            model: device.model || "N/A", imei: device.imei || null,
            cost_price: deviceVal,
            original_cost_price: deviceVal,
            store_id: selectedProduct.store_id,
            created_by: user.id, status: "in_stock",
            product_type: "celular",
            condition: "used"
          } as any).select("id").single();
          if (tiErr) { toast.error(tiErr.message); isSubmitting.current = false; setLoading(false); return; }
          currentProductId = tip.id;

          await supabase.from("product_history" as any).insert({
            product_id: currentProductId,
            action: "Entrada por Trade-in",
            new_cost: deviceVal,
            notes: `Aparelho recebido como troca na venda do produto ${selectedProduct.name}`,
            created_by: user.id,
          });
        }

        if (i === 0) {
          tradeInProductId = currentProductId;
        }

        tradeInDetailsText.push(`${device.name} (${device.brand} ${device.model || ""}) IMEI: ${device.imei || "N/A"} - Valor: R$ ${deviceVal.toFixed(2)}`);
      }

      let finalNotes = form.notes || "";
      if (tradeInDetailsText.length > 0) {
        const tradeInNotesStr = `[Aparelhos na Troca: ${tradeInDetailsText.join(" | ")}]`;
        finalNotes = finalNotes ? `${finalNotes} ${tradeInNotesStr}` : tradeInNotesStr;
      }

      // 1. Baixa do produto do estoque (UPDATE direto - RLS desabilitada na tabela products)
      const { data: updatedProduct, error: updateError } = await supabase
        .from("products")
        .update({ status: "sold", sale_price: salePriceAfterDiscount })
        .eq("id", form.product_id)
        .eq("status", "in_stock")
        .select()
        .maybeSingle();

      if (updateError || !updatedProduct) {
        const { data: checkProd } = await supabase
          .from("products")
          .select("status")
          .eq("id", form.product_id)
          .maybeSingle();

        if (checkProd?.status === "sold") {
          toast.error("Este aparelho acabou de ser vendido por outra pessoa. Tente outro aparelho.");
        } else {
          toast.error("Erro ao baixar produto do estoque: " + (updateError?.message || "Produto indisponível."));
        }
        isSubmitting.current = false;
        setLoading(false);
        return;
      }

      const firstDevice = tradeInDevicesList[0] || null;

      const { data: saleData, error: saleError } = await supabase.from("sales").insert({
        product_id: form.product_id, store_id: selectedProduct.store_id,
        sale_price: salePriceAfterDiscount, has_trade_in: form.has_trade_in,
        trade_in_device_name: form.has_trade_in && firstDevice ? firstDevice.name || null : null,
        trade_in_device_brand: form.has_trade_in && firstDevice ? firstDevice.brand || null : null,
        trade_in_device_model: form.has_trade_in && firstDevice ? firstDevice.model || null : null,
        trade_in_device_imei: form.has_trade_in && firstDevice ? firstDevice.imei || null : null,
        trade_in_value: form.has_trade_in ? tradeInVal : 0, trade_in_product_id: tradeInProductId,
        payment_cash: cashVal, payment_card: cardVal, payment_pix: pixVal,
        customer_id: customerId,
        customer_name: (selectedCustomer?.name || customerSearch) || null,
        customer_phone: selectedCustomer?.phone ?? null,
        customer_cpf: selectedCustomer?.cpf ?? null,
        customer_address: selectedCustomer?.address ?? null,
        notes: finalNotes || null, commission_percent: commissionPercent,
        commission_value: commissionValue, created_by: user.id,
        seller_id: user.id, discount: discount,
        warranty_days: parseInt(form.warranty_days) || 90,
        installments: parseInt(form.installments) || 1,
        ...(form.retro_date ? { created_at: new Date(form.retro_date + "T12:00:00").toISOString() } : {}),
      }).select().single();

      if (saleError) {
        // Rollback do status do produto se a venda falhar
        await supabase.from("products").update({ status: "in_stock", sale_price: null }).eq("id", form.product_id);
        toast.error(saleError.message); 
        return; 
      }

      triggerWebhook("sale_completed", selectedProduct.store_id, saleData);
      logAction("CREATE_SALE", "sales", (saleData as any).id, null, saleData, selectedProduct.store_id);

      const desc = `Venda: ${selectedProduct.name}${selectedCustomer?.name ? ` → ${selectedCustomer.name}` : ""}`;
      
      // Calcula taxas e liquidez se conta destino informada
      let netAmount = salePriceAfterDiscount;
      let expectedDate = new Date();
      const acc = form.destination_account_id ? bankAccounts.find(a => a.id === form.destination_account_id) : null;
      
      if (acc && (cardVal > 0 || pixVal > 0)) {
        if (cardVal > 0) {
            const fee = Number(acc.credit_fee_percent) || 0;
            const days = Number(acc.credit_settlement_days) || 30;
            netAmount -= (cardVal * (fee / 100));
            expectedDate = new Date();
            expectedDate.setDate(expectedDate.getDate() + days); // simples adicionamento de dias
          }
          if (pixVal > 0) {
            const fee = Number(acc.pix_fee_percent) || 0;
            const days = Number(acc.pix_settlement_days) || 0;
            netAmount -= (pixVal * (fee / 100));
            const pixDate = new Date();
            pixDate.setDate(pixDate.getDate() + days);
            if (pixDate > expectedDate) {
              expectedDate = pixDate;
            }
          }
        }

      // Registra transação principal se for apenas um método, ou se quiser agregar. 
      // Mas para aparecer no Financeiro, vamos inserir por método!
      
      if (cashVal === 0 && cardVal === 0 && pixVal === 0) {
        const { error: txError } = await supabase.from("transactions").insert({
          type: "sale", amount: salePriceAfterDiscount, net_amount: netAmount,
          description: desc, store_id: selectedProduct.store_id, product_id: form.product_id,
          sale_id: (saleData as any).id,
          created_by: user.id, destination_account_id: form.destination_account_id || null,
          expected_settlement_date: expectedDate.toISOString(),
          ...(form.retro_date ? { created_at: new Date(form.retro_date + "T12:00:00").toISOString() } : {}),
        });
        if (txError) throw txError;
        await createPendingCashEntry(selectedProduct.store_id, user.id, salePriceAfterDiscount, desc, "dinheiro", form.retro_date, (saleData as any).id);
      } else {
        const paymentsList = [
          { name: "dinheiro", val: cashVal },
          { name: "cartao_credito", val: cardVal },
          { name: "pix", val: pixVal }
        ].filter(p => p.val > 0);

        if (paymentsList.length > 1) {
          // Mixed payment consolidation
          const totalConsolidated = cashVal + cardVal + pixVal;
          const feeCard = (acc && Number(acc.credit_fee_percent)) || 0;
          const feePix = (acc && Number(acc.pix_fee_percent)) || 0;
          const netCard = cardVal - (cardVal * (feeCard / 100));
          const netPix = pixVal - (pixVal * (feePix / 100));
          const totalNet = cashVal + netCard + netPix;

          const descMisto = `${desc} [MISTO:{"dinheiro":${cashVal},"pix":${pixVal},"cartao_credito":${cardVal}}]`;

          const { error: txError } = await supabase.from("transactions").insert({
            type: "sale", amount: totalConsolidated, net_amount: totalNet,
            description: descMisto, store_id: selectedProduct.store_id, product_id: form.product_id,
            sale_id: (saleData as any).id,
            created_by: user.id, destination_account_id: form.destination_account_id || null,
            expected_settlement_date: expectedDate.toISOString(),
            ...(form.retro_date ? { created_at: new Date(form.retro_date + "T12:00:00").toISOString() } : {}),
          });
          if (txError) throw txError;
          if (cashVal > 0) await createPendingCashEntry(selectedProduct.store_id, user.id, cashVal, `${desc} (Parte em Dinheiro)`, "dinheiro", form.retro_date, (saleData as any).id);
          if (cardVal > 0) await createPendingCashEntry(selectedProduct.store_id, user.id, cardVal, `${desc} (Parte em Cartão)`, "cartao_credito", form.retro_date, (saleData as any).id);
          if (pixVal > 0) await createPendingCashEntry(selectedProduct.store_id, user.id, pixVal, `${desc} (Parte em PIX)`, "pix", form.retro_date, (saleData as any).id);
        } else {
          // Single payment type
          if (cashVal > 0) {
            const { error: txError1 } = await supabase.from("transactions").insert({
              type: "sale", amount: cashVal, net_amount: cashVal,
              description: `${desc} [Dinheiro]`, store_id: selectedProduct.store_id, product_id: form.product_id,
              sale_id: (saleData as any).id,
              created_by: user.id, destination_account_id: form.destination_account_id || null,
              expected_settlement_date: expectedDate.toISOString(),
              ...(form.retro_date ? { created_at: new Date(form.retro_date + "T12:00:00").toISOString() } : {}),
            });
            if (txError1) throw txError1;
            await createPendingCashEntry(selectedProduct.store_id, user.id, cashVal, desc, "dinheiro", form.retro_date, (saleData as any).id);
          }
          if (cardVal > 0) {
            const fee = (acc && Number(acc.credit_fee_percent)) || 0;
            const net = cardVal - (cardVal * (fee / 100));
            const { error: txError2 } = await supabase.from("transactions").insert({
              type: "sale", amount: cardVal, net_amount: net,
              description: `${desc} [Cartão]`, store_id: selectedProduct.store_id, product_id: form.product_id,
              sale_id: (saleData as any).id,
              created_by: user.id, destination_account_id: form.destination_account_id || null,
              expected_settlement_date: expectedDate.toISOString(),
              ...(form.retro_date ? { created_at: new Date(form.retro_date + "T12:00:00").toISOString() } : {}),
            });
            if (txError2) throw txError2;
            await createPendingCashEntry(selectedProduct.store_id, user.id, cardVal, desc, "cartao_credito", form.retro_date, (saleData as any).id);
          }
          if (pixVal > 0) {
            const fee = (acc && Number(acc.pix_fee_percent)) || 0;
            const net = pixVal - (pixVal * (fee / 100));
            const { error: txError3 } = await supabase.from("transactions").insert({
              type: "sale", amount: pixVal, net_amount: net,
              description: `${desc} [PIX]`, store_id: selectedProduct.store_id, product_id: form.product_id,
              sale_id: (saleData as any).id,
              created_by: user.id, destination_account_id: form.destination_account_id || null,
              expected_settlement_date: expectedDate.toISOString(),
              ...(form.retro_date ? { created_at: new Date(form.retro_date + "T12:00:00").toISOString() } : {}),
            });
            if (txError3) throw txError3;
            await createPendingCashEntry(selectedProduct.store_id, user.id, pixVal, desc, "pix", form.retro_date, (saleData as any).id);
          }
        }
      }
      


      toast.success("Venda registrada! Confirme o recebimento no caixa.");
      setDialogOpen(false); resetForm(); fetchData();
    } catch (err: any) {
      toast.error("Erro inesperado ao registrar venda: " + err.message);
    } finally {
      isSubmitting.current = false;
      setLoading(false);
    }
  };

  // handlePdvSubmit extraído para useCartManager

  const handleDeleteSale = async (item: { id: string, type: "sale" | "pdv" }, reason: string) => {
    setLoading(true);
    try {
      if (item.type === "pdv") {
        const pdvSale = pdvSales.find(s => s.id === item.id);
        if (!pdvSale) return;
        
        // Mapear comprovantes vinculados ao PDV
        const { data: entriesToDel } = await supabase.from("cash_entries").select("receipt_url").eq("reference_id", item.id).not("receipt_url", "is", null);
        const receiptPaths: string[] = [];
        if (entriesToDel && entriesToDel.length > 0) {
          for (const entry of entriesToDel) {
            if (entry.receipt_url) {
              const path = entry.receipt_url.split("/comprovantes/")[1];
              if (path) receiptPaths.push(path);
            }
          }
        }

        // Restaurar estoque dos acessórios via metadata
        const { data: pdvTx } = await supabase.from("transactions").select("metadata").eq("id", item.id).maybeSingle();
        const meta = pdvTx?.metadata as any;
        if (meta && meta.cart && Array.isArray(meta.cart)) {
          for (const cartItem of meta.cart) {
             const { data: acc } = await supabase.from("accessories").select("quantity").eq("id", cartItem.id).maybeSingle();
             if (acc) {
               await supabase.from("accessories").update({ quantity: Number(acc.quantity) + Number(cartItem.qty) }).eq("id", cartItem.id);
             }
          }
        }

        // Excluir de transactions
        const { error: txError } = await supabase.from("transactions").delete().eq("id", pdvSale.id);
        if (txError) throw txError;
        
        // Excluir cash_entries
        await supabase.from("cash_entries").delete().eq("reference_id", item.id);
        if (pdvSale.description) {
           await supabase.from("cash_entries").delete().eq("description", pdvSale.description);
        }

        // Limpar storage após sucesso das mutações no banco
        if (receiptPaths.length > 0) {
          try {
            await supabase.storage.from("comprovantes").remove(receiptPaths);
          } catch (storageErr) {
            console.warn("Falha não bloqueante ao remover comprovante do storage:", storageErr);
          }
        }
        
        logAction("DELETE_RECORD", "transactions", pdvSale.id, pdvSale, { reason }, pdvSale.store_id);
        toast.success("Venda PDV cancelada! Estoque, financeiro e arquivos revertidos.");
      } else {
        const sale = sales.find(s => s.id === item.id);
        if (!sale) return;

        // Mapear caminhos de comprovantes ANTES da exclusão, mas NÃO apagar do Storage ainda
        const { data: entriesToDel } = await supabase
          .from("cash_entries")
          .select("receipt_url")
          .eq("reference_id", item.id)
          .not("receipt_url", "is", null);

        const receiptPaths: string[] = [];
        if (entriesToDel && entriesToDel.length > 0) {
          for (const entry of entriesToDel) {
            if (entry.receipt_url) {
              const path = entry.receipt_url.split("/comprovantes/")[1];
              if (path) receiptPaths.push(path);
            }
          }
        }

        // 1. Executar cancelamento ATÔMICO no PostgreSQL via RPC
        const { error: cancelError } = await supabase.rpc("cancel_sale" as any, {
          p_sale_id: item.id,
          p_reason: reason,
        });

        if (cancelError) {
          if (cancelError.message?.includes("SALE_COMMISSION_ALREADY_SETTLED")) {
            toast.error("Esta venda já possui comissão liquidada (SALE_COMMISSION_ALREADY_SETTLED) e não pode ser cancelada.");
          } else {
            toast.error("Erro ao cancelar venda: " + cancelError.message);
          }
          return; // Zero arquivos de storage apagados; zero mutações parciais no banco
        }

        // 2. RPC cancelou com sucesso: SOMENTE AGORA remover comprovantes do Storage
        if (receiptPaths.length > 0) {
          try {
            await supabase.storage.from("comprovantes").remove(receiptPaths);
          } catch (storageErr) {
            console.warn("Aviso: falha não bloqueante ao limpar arquivos do storage após cancelamento:", storageErr);
          }
        }

        logAction("DELETE_RECORD", "sales", sale.id, sale, { reason }, sale.store_id);
        toast.success("Venda cancelada! Aparelho devolvido ao estoque, financeiro e arquivos revertidos.");
      }
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao remover venda: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (sale: Sale) => {
    setEditSale(sale);
    setEditSaleCustomerId(sale.customer_id || "manual");
    const product = products.find(p => p.id === sale.product_id);
    const cost = product ? Number(product.cost_price) : 0;
    const salePriceAfterDiscount = Number(sale.sale_price) - (Number(sale.discount) || 0);
    const profit = salePriceAfterDiscount - cost;
    
    let commPercent = "0";
    if (profit > 0 && sale.commission_value) {
      commPercent = ((Number(sale.commission_value) * 100) / profit).toFixed(1);
    }

    setEditForm({
      sale_price: sale.sale_price.toString(),
      discount: (sale.discount || 0).toString(),
      payment_cash: (sale.payment_cash || 0).toString(),
      payment_card: (sale.payment_card || 0).toString(),
      payment_pix: (sale.payment_pix || 0).toString(),
      installments: (sale.installments || 1).toString(),
      warranty_days: (sale.warranty_days || 90).toString(),
      commission_percent: commPercent,
      notes: sale.notes || "",
      customer_name: sale.customer_name || "",
      product_name: product?.name || "",
      product_cost: product?.cost_price ? product.cost_price.toString() : "",
      product_imei: product?.imei || "",
      retro_date: new Date(sale.created_at).toISOString().split('T')[0],
      // Trade-in existente
      has_trade_in: sale.has_trade_in || false,
      trade_in_device_name: sale.trade_in_device_name || "",
      trade_in_device_brand: sale.trade_in_device_brand || "iPhone",
      trade_in_device_model: sale.trade_in_device_model || "",
      trade_in_device_imei: sale.trade_in_device_imei || "",
      trade_in_value: sale.trade_in_value ? sale.trade_in_value.toString() : "",
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSale) return;
    setLoading(true);

    try {
      const salePrice = parseFloat(editForm.sale_price) || 0;
      const discount = parseFloat(editForm.discount) || 0;
      const salePriceAfterDiscount = Math.max(0, salePrice - discount);

      const cashVal = parseFloat(editForm.payment_cash) || 0;
      const cardVal = parseFloat(editForm.payment_card) || 0;
      const pixVal = parseFloat(editForm.payment_pix) || 0;
      const tradeInVal = editForm.has_trade_in ? (parseFloat(editForm.trade_in_value) || 0) : 0;
      const totalPayment = cashVal + cardVal + pixVal + tradeInVal;

      if (Math.abs(salePriceAfterDiscount - totalPayment) > 0.01) {
        toast.error("A soma dos pagamentos (+ valor do trade-in) deve ser igual ao valor líquido!");
        setLoading(false);
        return;
      }

      const product = products.find(p => p.id === editSale.product_id);
      const cost = product ? Number(product.cost_price) : 0;
      const profit = salePriceAfterDiscount - cost;
      const commPercent = parseFloat(editForm.commission_percent) || 0;
      const commissionValue = Math.max(0, (profit * commPercent) / 100);

      const selectedCust = editSaleCustomerId === "manual" ? null : customers.find(c => c.id === editSaleCustomerId);

      // 1. Update the sale record
      const retroIso = editForm.retro_date
        ? new Date(editForm.retro_date + "T12:00:00").toISOString()
        : undefined;

      const { error: saleError } = await supabase
        .from("sales")
        .update({
          sale_price: salePrice,
          discount: discount,
          payment_cash: cashVal,
          payment_card: cardVal,
          payment_pix: pixVal,
          installments: parseInt(editForm.installments) || 1,
          warranty_days: parseInt(editForm.warranty_days) || 90,
          commission_percent: commPercent,
          commission_value: commissionValue,
          notes: editForm.notes || null,
          customer_name: selectedCust ? selectedCust.name : (editForm.customer_name || null),
          customer_id: selectedCust ? selectedCust.id : null,
          customer_phone: selectedCust ? selectedCust.phone : (editSaleCustomerId === "manual" ? null : editSale.customer_phone),
          customer_cpf: selectedCust ? selectedCust.cpf : (editSaleCustomerId === "manual" ? null : editSale.customer_cpf),
          customer_address: selectedCust ? selectedCust.address : (editSaleCustomerId === "manual" ? null : editSale.customer_address),
          has_trade_in: editForm.has_trade_in,
          trade_in_device_name: editForm.has_trade_in ? (editForm.trade_in_device_name || null) : null,
          trade_in_device_brand: editForm.has_trade_in ? (editForm.trade_in_device_brand || null) : null,
          trade_in_device_model: editForm.has_trade_in ? (editForm.trade_in_device_model || null) : null,
          trade_in_device_imei: editForm.has_trade_in ? (editForm.trade_in_device_imei || null) : null,
          trade_in_value: editForm.has_trade_in ? tradeInVal : null,
          ...(retroIso ? { created_at: retroIso } : {}),
        })
        .eq("id", editSale.id);

      if (saleError) throw saleError;

      // 1b. If trade-in device was added/updated, register it in products (estoque)
      if (editForm.has_trade_in && editForm.trade_in_device_name && tradeInVal > 0) {
        // Check if there's already a trade-in product linked to this sale
        if (editSale.trade_in_product_id) {
          // Update existing trade-in product
          await supabase.from("products").update({
            name: editForm.trade_in_device_name,
            brand: editForm.trade_in_device_brand || null,
            model: editForm.trade_in_device_model || "N/A",
            imei: editForm.trade_in_device_imei || null,
            cost_price: tradeInVal,
            original_cost_price: tradeInVal,
            status: "in_stock",
          } as any).eq("id", editSale.trade_in_product_id);
        } else {
          // Create new trade-in product in stock
          const { data: tipData } = await supabase.from("products").insert({
            name: editForm.trade_in_device_name,
            brand: editForm.trade_in_device_brand || null,
            model: editForm.trade_in_device_model || "N/A",
            imei: editForm.trade_in_device_imei || null,
            cost_price: tradeInVal,
            original_cost_price: tradeInVal,
            store_id: editSale.store_id,
            created_by: user!.id,
            status: "in_stock",
          } as any).select("id").single();
          // Link the new trade-in product to the sale
          if (tipData) {
            await supabase.from("sales").update({ trade_in_product_id: tipData.id }).eq("id", editSale.id);
          }
        }
      }

      // 2. Update product details (sale_price, name, cost_price, imei) in database
      const productCostVal = parseFloat(editForm.product_cost) || 0;
      await supabase
         .from("products")
         .update({ 
           sale_price: salePriceAfterDiscount,
           name: editForm.product_name || product?.name,
           cost_price: productCostVal || product?.cost_price,
           imei: editForm.product_imei || product?.imei
         })
         .eq("id", editSale.product_id);

      // 3. Update associated transactions
      const desc = `Venda: ${(editForm.product_name || product?.name) ?? "Aparelho"}${editForm.customer_name ? ` → ${editForm.customer_name}` : ""}`;
      await supabase
        .from("transactions")
        .update({
          amount: salePriceAfterDiscount,
          net_amount: salePriceAfterDiscount,
          description: desc,
          ...(retroIso ? { created_at: retroIso } : {}),
        })
        .eq("product_id", editSale.product_id)
        .eq("type", "sale");

      // Log action with changes details for the Audit Trail
      const oldVal = {
        sale: editSale,
        product: {
          name: product?.name,
          cost_price: product?.cost_price,
          imei: product?.imei
        }
      };
      const newVal = {
        sale: editForm,
        product: {
          name: editForm.product_name,
          cost_price: productCostVal,
          imei: editForm.product_imei
        }
      };

      logAction("UPDATE_RECORD", "sales", editSale.id, oldVal, newVal, editSale.store_id);
      toast.success("Venda e dados do aparelho atualizados com sucesso!");
      setEditSale(null);
      fetchData();
    } catch (err: any) {
      toast.error("Erro ao atualizar venda: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Editar venda PDV (acessório) ──────────────────────────────────────────
  const handleOpenPdvEdit = async (tx: any) => {
    setLoading(true);
    let cash = 0, card = 0, pix = 0;
    try {
      const { data: entries } = await supabase
        .from("cash_entries")
        .select("amount, payment_method")
        .eq("description", tx.description);
      
      if (entries) {
        entries.forEach(e => {
          if (e.payment_method === "dinheiro") cash += Number(e.amount);
          if (e.payment_method === "cartao_credito") card += Number(e.amount);
          if (e.payment_method === "pix") pix += Number(e.amount);
        });
      }
    } catch (e) {
      console.error(e);
    }
    
    setEditPdvSale(tx);
    setEditPdvForm({
      description: tx.description || "",
      amount: String(tx.amount || ""),
      payment_cash: cash > 0 ? String(cash) : "",
      payment_card: card > 0 ? String(card) : "",
      payment_pix: pix > 0 ? String(pix) : "",
      retro_date: new Date(tx.created_at).toISOString().split("T")[0],
    });
    setLoading(false);
  };

  const handleSavePdvEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPdvSale || !user) return;
    
    const amount = parseFloat(editPdvForm.amount) || 0;
    const cash = parseFloat(editPdvForm.payment_cash) || 0;
    const card = parseFloat(editPdvForm.payment_card) || 0;
    const pix = parseFloat(editPdvForm.payment_pix) || 0;
    const totalPayments = cash + card + pix;

    if (amount <= 0) { toast.error("O valor deve ser maior que zero."); return; }
    if (Math.abs(amount - totalPayments) > 0.01) { toast.error("A soma dos pagamentos deve ser igual ao valor total!"); return; }

    setLoading(true);
    try {
      const retroIso = editPdvForm.retro_date
        ? new Date(editPdvForm.retro_date + "T12:00:00").toISOString()
        : undefined;
      const newDesc = editPdvForm.description || editPdvSale.description;

      const { error } = await supabase
        .from("transactions")
        .update({
          amount,
          description: newDesc,
          ...(retroIso ? { created_at: retroIso } : {}),
        })
        .eq("id", editPdvSale.id);
      if (error) throw error;

      // Conciliação de caixa (deleta os lançamentos baseados na descrição antiga e recria)
      await supabase.from("cash_entries").delete().eq("description", editPdvSale.description);
      
      if (cash === 0 && card === 0 && pix === 0) {
        await createPendingCashEntry(editPdvSale.store_id, user.id, amount, newDesc, "dinheiro", editPdvForm.retro_date);
      } else {
        const editPaymentsCount = [cash > 0, card > 0, pix > 0].filter(Boolean).length;
        if (editPaymentsCount > 1) {
          if (cash > 0) await createPendingCashEntry(editPdvSale.store_id, user.id, cash, `${newDesc} (Parte em Dinheiro)`, "dinheiro", editPdvForm.retro_date);
          if (card > 0) await createPendingCashEntry(editPdvSale.store_id, user.id, card, `${newDesc} (Parte em Cartão)`, "cartao_credito", editPdvForm.retro_date);
          if (pix > 0) await createPendingCashEntry(editPdvSale.store_id, user.id, pix, `${newDesc} (Parte em PIX)`, "pix", editPdvForm.retro_date);
        } else {
          if (cash > 0) await createPendingCashEntry(editPdvSale.store_id, user.id, cash, newDesc, "dinheiro", editPdvForm.retro_date);
          if (card > 0) await createPendingCashEntry(editPdvSale.store_id, user.id, card, newDesc, "cartao_credito", editPdvForm.retro_date);
          if (pix > 0) await createPendingCashEntry(editPdvSale.store_id, user.id, pix, newDesc, "pix", editPdvForm.retro_date);
        }
      }

      logAction("UPDATE_RECORD", "transactions", editPdvSale.id, editPdvSale, editPdvForm, editPdvSale.store_id);
      toast.success("Venda de acessório e caixa atualizados!");
      setEditPdvSale(null);
      fetchData();
    } catch (err: any) {
      toast.error("Erro ao atualizar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Gerar nota ────────────────────────────────────────────────────────────
  const handleGerarNota = async (sale: Sale, whatsapp = false) => {
    setNotaLoading(sale.id);
    try {
      const product = productMap.get(sale.product_id) as any;
      const store = storeMap.get(sale.store_id) as any;
      const customerMap = new Map(customers.map(c => [c.id, c]));
      const customer = sale.customer_id ? customerMap.get(sale.customer_id) : null;
      const numeroNota = `VND-${sale.id.slice(0, 8).toUpperCase()}`;
      const data: NotaFiscalData = {
        numeroNota, dataVenda: new Date(sale.created_at).toLocaleString("pt-BR"),
        lojaNome: store?.name ?? "Loja", lojaCnpj: store?.cnpj, lojaEndereco: store?.address,
        lojaTelefone: store?.phone, lojaWhatsapp: store?.whatsapp, lojaInstagram: store?.instagram, lojaLogoUrl: store?.logo_url,
        clienteNome: sale.customer_name || customer?.name || undefined,
        clienteCpf: sale.customer_cpf || customer?.cpf || undefined,
        clienteTelefone: sale.customer_phone || customer?.phone || undefined,
        clienteEndereco: sale.customer_address || customer?.address || undefined,
        produtoNome: product?.name ?? "Produto", produtoMarca: product?.brand ?? "",
        produtoModelo: product?.model, produtoImei: product?.imei ?? undefined, produtoCor: product?.color ?? undefined,
        valorVenda: Number(sale.sale_price), valorDinheiro: Number(sale.payment_cash) || undefined,
        valorCartao: Number(sale.payment_card) || undefined, valorPix: Number(sale.payment_pix) || undefined,
        tradeIn: sale.has_trade_in, tradeInValor: sale.trade_in_value ? Number(sale.trade_in_value) : undefined,
        tradeInNome: sale.trade_in_device_name ?? undefined, observacoes: sale.notes ?? undefined,
        garantiaDays: sale.warranty_days ?? undefined,
      };
      const doc = await gerarNotaFiscalInterna(data);
      if (whatsapp) {
        if (!sale.customer_phone) { toast.error("Cliente sem telefone!"); setNotaLoading(null); return; }
        const blob = doc.output("blob");
        const { data: up, error } = await supabase.storage.from("comprovantes").upload(`notas/${numeroNota}-${Date.now()}.pdf`, blob, { upsert: true, contentType: "application/pdf" });
        if (error) { toast.error("Erro no upload"); setNotaLoading(null); return; }
        const { data: u } = supabase.storage.from("comprovantes").getPublicUrl(up.path);
        const phone = sale.customer_phone.replace(/\D/g, "");
        window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(`Olá ${sale.customer_name || ""}! 👋\n\nSegue seu comprovante de compra:\n${u.publicUrl}\n\nObrigado pela preferência! 🙏`)}`, "_blank");
        toast.success("WhatsApp aberto!");
      } else {
        doc.save(`nota-${numeroNota}.pdf`); toast.success("Nota gerada!");
      }
    } catch { toast.error("Erro ao gerar nota. Instale: npm install jspdf"); }
    setNotaLoading(null);
  };

  // CustomerSection foi modularizado dentro de NovaVendaModal

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight">Vendas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {sales.length + pdvSales.length} transações registradas
            {activeStoreId === "all" && " (Global)"}
          </p>
        </div>
        {userRole === "admin" && (
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
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 text-xs border-border text-muted-foreground hover:text-foreground"
          onClick={() => {
            if ('caches' in window) {
              caches.keys().then(names => names.forEach(name => caches.delete(name)));
            }
            toast.success("Cache limpo! Recarregando...");
            setTimeout(() => window.location.reload(), 800);
          }}
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Limpar Cache
        </Button>
      </div>
      <div className="flex justify-end gap-2">
          <PdvFormModal
            pdvOpen={pdvOpen}
            setPdvOpen={setPdvOpen}
            resetPdv={resetPdv}
            activeStoreId={activeStoreId}
            accSearch={accSearch}
            setAccSearch={setAccSearch}
            filteredAcc={filteredAcc}
            addToCart={addToCart}
            cart={cart}
            updateCartQty={updateCartQty}
            updateCartPrice={updateCartPrice}
            pdvPayment={pdvPayment}
            setPdvPayment={setPdvPayment}
            stores={stores}
            handlePdvSubmit={handlePdvSubmit}
            loading={loading}
          />

          {/* Nova Venda */}
          <NovaVendaModal
            dialogOpen={dialogOpen}
            setDialogOpen={setDialogOpen}
            resetForm={resetForm}
            handleSubmit={handleSubmit}
            form={form}
            setForm={setForm}
            products={products}
            availableProducts={availableProducts}
            selectedProduct={selectedProduct}
            storeMap={storeMap}
            bankAccounts={bankAccounts}
            salePrice={salePrice}
            discount={discount}
            salePriceAfterDiscount={salePriceAfterDiscount}
            profit={profit}
            tradeInVal={tradeInVal}
            cashVal={cashVal}
            cardVal={cardVal}
            pixVal={pixVal}
            remaining={remaining}
            commissionValue={commissionValue}
            userRole={userRole}
            activeStoreId={activeStoreId}
            loading={loading}
            formatCurrency={formatCurrency}
            currentProfile={currentProfile}
            user={user}
            selectedCustomer={selectedCustomer}
            clearCustomer={clearCustomer}
            customerSalesHistory={customerSalesHistory}
            showCustomerHistory={showCustomerHistory}
            setShowCustomerHistory={setShowCustomerHistory}
            productMap={productMap}
            customerSearch={customerSearch}
            setCustomerSearch={setCustomerSearch}
            customerResults={customerResults}
            selectCustomer={selectCustomer}
            showNewCustomerForm={showNewCustomerForm}
            setShowNewCustomerForm={setShowNewCustomerForm}
            newCustomerForm={newCustomerForm}
            setNewCustomerForm={setNewCustomerForm}
            handleCreateCustomer={handleCreateCustomer}
          />
        </div>

      {/* Busca de vendas */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={salesSearch}
            onChange={e => setSalesSearch(e.target.value)}
            placeholder="Buscar por cliente, modelo, IMEI ou marca..."
            className="pl-9 h-10"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold shrink-0">De</Label>
            <Input
              type="date"
              value={filterStartDate}
              onChange={e => setFilterStartDate(e.target.value)}
              className="h-10 text-xs w-[130px]"
            />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold shrink-0">Até</Label>
            <Input
              type="date"
              value={filterEndDate}
              onChange={e => setFilterEndDate(e.target.value)}
              className="h-10 text-xs w-[130px]"
            />
          </div>
          {(filterStartDate || filterEndDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFilterStartDate(""); setFilterEndDate(""); }}
              className="h-10 text-xs text-destructive hover:bg-destructive/10"
            >
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Lista de vendas */}
      <div className="space-y-2">
        {[
          ...pdvSales.map(tx => ({ type: "pdv" as const, data: tx, date: new Date(tx.created_at).getTime() })),
          ...filteredSales.map(sale => ({ type: "sale" as const, data: sale, date: new Date(sale.created_at).getTime() }))
        ].sort((a, b) => b.date - a.date).map(item => {
          if (item.type === "pdv") {
            const tx = item.data;
            return (
              <Card key={`pdv-${tx.id}`} className="border-border/50 shadow-lg shadow-black/10">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{formatDescription(tx.description)}</p>
                        <Badge className="text-[10px] bg-yellow-500/15 text-yellow-500 border border-yellow-500/20 shrink-0">PDV</Badge>
                        {Number(tx.metadata?.discount) > 0 && (
                          <Badge className="text-[10px] text-yellow-500 border border-yellow-500/30 bg-transparent shrink-0">
                            🏷️ -{formatCurrency(Number(tx.metadata.discount))}
                          </Badge>
                        )}
                        {activeStoreId === "all" && (
                          <Badge variant="outline" className="text-[9px] bg-muted/50 border-primary/20 text-primary">
                            {(storeMap.get(tx.store_id) as any)?.name}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(tx.created_at).toLocaleDateString("pt-BR")}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(userRole === "admin" || userRole === "gerente") && (
                          <Button
                            className="h-7 px-2 text-[10px] gap-1 border border-yellow-500/40 bg-yellow-500/5 text-yellow-600 dark:text-yellow-500 hover:bg-yellow-500/10 shadow-none"
                            onClick={() => handleOpenPdvEdit(tx)}
                          >
                            <Pencil className="h-3 w-3" />Editar
                          </Button>
                        )}
                        {userRole === "admin" && (
                          <Button className="h-7 px-2 text-[10px] gap-1 text-destructive border border-destructive/30 bg-transparent hover:bg-destructive/10 shadow-none"
                            onClick={() => { setDeleteItem({ id: tx.id, type: "pdv" }); setJustification(""); setDeleteDialogOpen(true); }} disabled={loading}>
                            <Trash2 className="h-3.5 w-3.5" />Excluir
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-display font-bold text-sm text-primary">{formatCurrency(Number(tx.amount))}</p>
                      {Number(tx.metadata?.discount) > 0 && (
                        <p className="text-[10px] text-yellow-500">-{formatCurrency(Number(tx.metadata.discount))}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          } else {
            const sale = item.data;
            const product = productMap.get(sale.product_id) as any;
            const isLoading = notaLoading === sale.id;
            return (
              <Card
                key={`sale-${sale.id}`}
                className="border-border/50 shadow-lg shadow-black/10 cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => setSelectedViewSale(sale)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{product?.name || "Aparelho"}</p>
                        {product?.imei && (
                          <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/60 hidden sm:inline">
                            {product.imei}
                          </span>
                        )}
                        {activeStoreId === "all" && (
                          <Badge variant="outline" className="text-[9px] bg-muted/50 border-primary/20 text-primary">
                            {(storeMap.get(sale.store_id) as any)?.name}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {sale.has_trade_in && <Badge className="text-[10px] bg-primary/15 text-primary border border-primary/20">Troca: {sale.trade_in_device_name}</Badge>}
                        {Number(sale.payment_cash) > 0 && <Badge className="text-[10px] border border-border bg-transparent text-foreground">💵 {formatCurrency(Number(sale.payment_cash))}</Badge>}
                        {Number(sale.payment_card) > 0 && <Badge className="text-[10px] border border-border bg-transparent text-foreground">💳 {formatCurrency(Number(sale.payment_card))}{sale.installments && sale.installments > 1 ? ` (${sale.installments}x)` : ""}</Badge>}
                        {Number(sale.payment_pix) > 0 && <Badge className="text-[10px] border border-border bg-transparent text-foreground">📱 {formatCurrency(Number(sale.payment_pix))}</Badge>}
                        {Number(sale.discount) > 0 && <Badge className="text-[10px] text-yellow-500 border border-yellow-500/30 bg-transparent">🏷️ -{formatCurrency(Number(sale.discount))}</Badge>}
                        {sale.warranty_days && <Badge className="text-[10px] text-blue-500 border border-blue-500/30 bg-transparent">🛡️ {sale.warranty_days}d</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {sale.customer_name ? `Cliente: ${sale.customer_name}` : "Venda avulsa"}{sale.seller_id && profileMap.get(sale.seller_id) ? ` · Vendedor: ${profileMap.get(sale.seller_id)}` : ""} · {new Date(sale.created_at).toLocaleDateString("pt-BR")}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2" onClick={e => e.stopPropagation()}>
                        <Button className="h-7 px-2 text-[10px] gap-1 border border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 shadow-none"
                          onClick={() => setSelectedViewSale(sale)}>
                          <Eye className="h-3 w-3" />Ver detalhes
                        </Button>
                        {/* Admin, gerente e vendedor têm acesso à edição da venda (com auditoria detalhada) */}
                        {(userRole === "admin" || userRole === "gerente" || userRole === "vendedor") && (
                          <Button className="h-7 px-2 text-[10px] gap-1 border border-yellow-500/40 bg-yellow-500/5 text-yellow-600 dark:text-yellow-500 hover:bg-yellow-500/10 shadow-none"
                            onClick={() => handleOpenEdit(sale)}>
                            <Pencil className="h-3 w-3" />Editar
                          </Button>
                        )}
                        <Button className="h-7 px-2 text-[10px] gap-1 border border-border bg-transparent text-foreground hover:bg-muted shadow-none"
                          onClick={() => handleGerarNota(sale, false)} disabled={isLoading}>
                          <FileText className="h-3 w-3" />{isLoading ? "Gerando..." : "Comprovante"}
                        </Button>
                        {sale.customer_phone && (
                          <Button className="h-7 px-2 text-[10px] gap-1 text-green-500 border border-green-500/30 bg-transparent hover:bg-green-500/10 shadow-none"
                            onClick={() => handleGerarNota(sale, true)} disabled={isLoading}>
                            <MessageCircle className="h-3 w-3" />WhatsApp
                          </Button>
                        )}
                        {userRole !== "vendedor" && (
                          <Button className="h-7 px-2 text-[10px] gap-1 text-destructive border border-destructive/30 bg-transparent hover:bg-destructive/10 shadow-none"
                            onClick={() => { setDeleteItem({ id: sale.id, type: "sale" }); setJustification(""); setDeleteDialogOpen(true); }} disabled={loading}>
                            <Trash2 className="h-3.5 w-3.5" />Excluir
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-display font-bold text-sm text-primary">{formatCurrency(Number(sale.sale_price))}</p>
                      {Number(sale.discount) > 0 && <p className="text-[10px] text-yellow-500">-{formatCurrency(Number(sale.discount))}</p>}
                      {sale.has_trade_in && sale.trade_in_value && <p className="text-[10px] text-muted-foreground">Troca: {formatCurrency(Number(sale.trade_in_value))}</p>}
                      {Number(sale.commission_value) > 0 && <p className="text-[10px] text-yellow-500">Comissão: {formatCurrency(Number(sale.commission_value))}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }
        })}

        {filteredSales.length === 0 && pdvSales.length === 0 && (
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ShoppingBag className="h-10 w-10 mb-3 opacity-30" />
              <p className="font-medium text-sm">Nenhuma venda registrada</p>
            </CardContent>
          </Card>
        )}
      </div>
      {/* Sale Detail View Dialog */}
      <DetalhesVendaModal
        selectedViewSale={selectedViewSale}
        setSelectedViewSale={setSelectedViewSale}
        productMap={productMap}
        storeMap={storeMap}
        profileMap={profileMap}
        handleGerarNota={handleGerarNota}
        notaLoading={notaLoading}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteSaleDialog
        deleteDialogOpen={deleteDialogOpen}
        setDeleteDialogOpen={setDeleteDialogOpen}
        deleteItem={deleteItem}
        justification={justification}
        setJustification={setJustification}
        handleDeleteSale={handleDeleteSale}
        loading={loading}
      />

      {/* Edit Sale Dialog */}
      <EditarVendaModal
        editSale={editSale}
        setEditSale={setEditSale}
        handleSaveEdit={handleSaveEdit}
        editForm={editForm}
        setEditForm={setEditForm}
        editSaleCustomerId={editSaleCustomerId}
        setEditSaleCustomerId={setEditSaleCustomerId}
        showEditNewCustomerForm={showEditNewCustomerForm}
        setShowEditNewCustomerForm={setShowEditNewCustomerForm}
        editNewCustomerForm={editNewCustomerForm}
        setEditNewCustomerForm={setEditNewCustomerForm}
        handleCreateCustomerForEdit={handleCreateCustomerForEdit}
        customers={customers}
        userRole={userRole}
        loading={loading}
        formatCurrency={formatCurrency}
      />

      {/* Edit PDV Sale Dialog */}
      <EditarPdvModal
        editPdvSale={editPdvSale}
        setEditPdvSale={setEditPdvSale}
        handleSavePdvEdit={handleSavePdvEdit}
        editPdvForm={editPdvForm}
        setEditPdvForm={setEditPdvForm}
        loading={loading}
        formatCurrency={formatCurrency}
      />
    </div>
  );
};

export default Vendas;
