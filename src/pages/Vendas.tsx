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

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type Sale = {
  id: string; product_id: string; store_id: string; sale_price: number;
  has_trade_in: boolean; trade_in_device_name: string | null; trade_in_device_brand: string | null;
  trade_in_device_model: string | null; trade_in_device_imei: string | null;
  trade_in_value: number | null; payment_cash: number; payment_card: number;
  payment_pix: number; customer_name: string | null; customer_phone: string | null;
  customer_cpf: string | null; customer_address: string | null;
  customer_id: string | null;
  notes: string | null; created_by: string; created_at: string;
  commission_value: number | null; commission_percent: number | null;
  discount: number | null;
  warranty_days: number | null; installments: number | null; seller_id: string | null;
  trade_in_product_id: string | null;
};

type Customer = Tables<"customers">;
type Accessory = { id: string; store_id: string; name: string; category: string; brand: string | null; quantity: number; cost_price: number; sale_price: number | null };
type CartItem = { acc: Accessory; qty: number; price: number };

const createPendingCashEntry = async (storeId: string, userId: string, amount: number, description: string, paymentMethod: string, retroDate?: string) => {
  const { data: register } = await supabase.from("cash_registers" as any).select("id").eq("store_id", storeId).eq("status", "open").maybeSingle();
  const registerId = register ? (register as any).id : null;
  await supabase.from("cash_entries" as any).insert({
    cash_register_id: registerId, store_id: storeId,
    type: "entrada", amount, description,
    payment_method: paymentMethod, receipt_url: null, confirmed: false, created_by: userId,
    ...(retroDate ? { created_at: new Date(retroDate + "T12:00:00").toISOString() } : {}),
  });
};

const emptyCustomerForm = { name: "", phone: "", cpf: "", address: "", email: "", birth: "" };

const Vendas = () => {
  const { user, userRole, activeStoreId, setActiveStoreId } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Tables<"products">[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [pdvSales, setPdvSales] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pdvOpen, setPdvOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notaLoading, setNotaLoading] = useState<string | null>(null);
  const [accSearch, setAccSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);

  // Customer search state
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState(emptyCustomerForm);
  const [customerSalesHistory, setCustomerSalesHistory] = useState<Sale[]>([]);
  const [justification, setJustification] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
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
  const isPdvSubmitting = useRef(false);

  // Estado para edição de venda PDV (acessórios)
  const [editPdvSale, setEditPdvSale] = useState<any | null>(null);
  const [editPdvForm, setEditPdvForm] = useState({
    description: "", amount: "", payment_cash: "", payment_card: "", payment_pix: "", retro_date: "",
  });

  const [pdvPayment, setPdvPayment] = useState({ cash: "", card: "", pix: "", customer: "", cpfCnpj: "", store_id: "" });

  const [form, setForm] = useState({
    product_id: "", sale_price: "", has_trade_in: false,
    trade_in_device_name: "", trade_in_device_brand: "iPhone",
    trade_in_device_model: "", trade_in_device_imei: "",
    trade_in_value: "", payment_cash: "", payment_card: "",
    payment_pix: "", notes: "", commission_percent: "10",
    discount: "0", warranty_days: "90", installments: "1",
    destination_account_id: "",
    retro_date: "", // Campo para data retroativa
  });

  const fetchData = async () => {
    if (!activeStoreId) return;
    setLoading(true);

    let salesQuery = supabase.from("sales").select("*");
    let productsQuery = supabase.from("products").select("*");
    let accQuery = supabase.from("accessories" as any).select("*").gt("quantity", 0);
    let pdvQuery = supabase.from("transactions").select("*").eq("type", "income").eq("category", "acessorio");
    let accountsQuery = supabase.from("store_bank_accounts").select("*");

    if (activeStoreId !== "all") {
      salesQuery = salesQuery.eq("store_id", activeStoreId);
      productsQuery = productsQuery.eq("store_id", activeStoreId);
      accQuery = accQuery.eq("store_id", activeStoreId);
      pdvQuery = pdvQuery.eq("store_id", activeStoreId);
      accountsQuery = accountsQuery.eq("store_id", activeStoreId);
    }

    const [salesRes, productsRes, storesRes, accRes, pdvRes, profilesRes, customersRes, accountsRes, currentRoleRes] = await Promise.all([
      salesQuery.order("created_at", { ascending: false }),
      productsQuery,
      supabase.from("stores").select("*"),
      accQuery,
      pdvQuery.order("created_at", { ascending: false }),
      supabase.from("profiles").select("*"),
      supabase.from("customers").select("*").order("name"),
      accountsQuery,
      supabase.from("user_roles").select("commission_sales_percent, commission_on_sales").eq("user_id", user?.id).maybeSingle()
    ]);

    let userCommPercent = "10";
    if (currentRoleRes?.data) {
      const data = currentRoleRes.data as any;
      if (data.commission_on_sales === false) {
        userCommPercent = "0";
      } else {
        userCommPercent = String(data.commission_sales_percent ?? 10);
      }
    }

    setSales((salesRes.data as unknown as Sale[]) ?? []);
    setProducts(productsRes.data ?? []);
    setStores(storesRes.data ?? []);
    setAccessories((accRes.data as unknown as Accessory[]) ?? []);
    setPdvSales(pdvRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setCustomers(customersRes.data ?? []);
    setBankAccounts(accountsRes.data ?? []);
    
    // Atualizar valor inicial do form com a comissão do usuário logado
    setForm(prev => ({ ...prev, commission_percent: userCommPercent }));
    setCurrentUserCommissionPercent(userCommPercent);

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [activeStoreId]);

  // Customer search
  useEffect(() => {
    if (customerSearch.length < 2) { setCustomerResults([]); return; }
    const q = customerSearch.toLowerCase();
    setCustomerResults(
      customers.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(customerSearch)) ||
        (c.cpf && c.cpf.includes(customerSearch))
      ).slice(0, 5)
    );
  }, [customerSearch, customers]);

  const selectCustomer = async (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerSearch(c.name);
    setCustomerResults([]);
    setShowNewCustomerForm(false);
    // Busca histórico de compras (apenas na loja atual, com guard para null)
    const storeFilter = activeStoreId && activeStoreId !== "all" ? activeStoreId : null;
    let histQuery = supabase.from("sales").select("*")
      .or(`customer_id.eq.${c.id},customer_phone.eq.${c.phone ?? ""}`);
    if (storeFilter) histQuery = histQuery.eq("store_id", storeFilter);
    const { data } = await histQuery.order("created_at", { ascending: false }).limit(5);
    setCustomerSalesHistory((data as unknown as Sale[]) ?? []);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerSearch("");
    setCustomerResults([]);
    setCustomerSalesHistory([]);
    setShowCustomerHistory(false);
  };

  const handleCreateCustomer = async () => {
    if (!user || !newCustomerForm.name) return;
    setLoading(true);
    const { data, error } = await supabase.from("customers").insert({
      name: newCustomerForm.name, phone: newCustomerForm.phone || null,
      cpf: newCustomerForm.cpf || null, address: newCustomerForm.address || null,
      email: newCustomerForm.email || null, created_by: user.id,
    }).select().single();
    if (error) { toast.error(error.message); setLoading(false); return; }
    toast.success("Cliente cadastrado!");
    await fetchData();
    setSelectedCustomer(data as Customer);
    setCustomerSearch((data as Customer).name);
    setShowNewCustomerForm(false);
    setNewCustomerForm(emptyCustomerForm);
    setLoading(false);
  };

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
  const tradeInVal = parseFloat(form.trade_in_value) || 0;
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

  const addToCart = (acc: Accessory) => {
    setCart(prev => {
      const ex = prev.find(i => i.acc.id === acc.id);
      if (ex) return prev.map(i => i.acc.id === acc.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { acc, qty: 1, price: acc.sale_price ?? acc.cost_price }];
    });
  };
  const updateCartQty = (id: string, qty: number) => qty <= 0 ? setCart(p => p.filter(i => i.acc.id !== id)) : setCart(p => p.map(i => i.acc.id === id ? { ...i, qty } : i));
  const updateCartPrice = (id: string, price: number) => setCart(p => p.map(i => i.acc.id === id ? { ...i, price } : i));
  const filteredAcc = accessories.filter(a => a.name.toLowerCase().includes(accSearch.toLowerCase()) || (a.brand && a.brand.toLowerCase().includes(accSearch.toLowerCase())));

  // Guarda comissão carregada do usuário atual
  const [currentUserCommissionPercent, setCurrentUserCommissionPercent] = useState("10");

  const resetForm = () => {
    setForm({ product_id: "", sale_price: "", has_trade_in: false, trade_in_device_name: "", trade_in_device_brand: "iPhone", trade_in_device_model: "", trade_in_device_imei: "", trade_in_value: "", payment_cash: "", payment_card: "", payment_pix: "", notes: "", commission_percent: currentUserCommissionPercent, discount: "0", warranty_days: "90", installments: "1", destination_account_id: "", retro_date: "" });
    clearCustomer();
  };
  const resetPdv = () => { setCart([]); setPdvPayment({ cash: "", card: "", pix: "", customer: "", cpfCnpj: "", store_id: activeStoreId || "" }); setAccSearch(""); };

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
      if (form.has_trade_in && form.trade_in_device_name) {
        let existingTradeIn = null;

        if (form.trade_in_device_imei) {
          const { data: existingProduct } = await supabase
            .from("products")
            .select("*")
            .eq("imei", form.trade_in_device_imei)
            .maybeSingle();
          existingTradeIn = existingProduct;
        }

        if (existingTradeIn) {
          const { data: updatedTip, error: tiErr } = await supabase
            .from("products")
            .update({
              status: "in_stock",
              cost_price: tradeInVal,
              store_id: selectedProduct.store_id,
              sale_price: null
            })
            .eq("id", existingTradeIn.id)
            .select("id")
            .maybeSingle();

          if (tiErr) { toast.error(tiErr.message); return; }
          tradeInProductId = updatedTip?.id || existingTradeIn.id;
        } else {
          const { data: tip, error: tiErr } = await supabase.from("products").insert({
            name: form.trade_in_device_name, brand: form.trade_in_device_brand,
            model: form.trade_in_device_model || "N/A", imei: form.trade_in_device_imei || null,
            cost_price: tradeInVal, store_id: selectedProduct.store_id,
            created_by: user.id, status: "in_stock",
          }).select("id").single();
          if (tiErr) { toast.error(tiErr.message); return; }
          tradeInProductId = tip.id;
        }
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
        return;
      }

      const { data: saleData, error: saleError } = await supabase.from("sales").insert({
        product_id: form.product_id, store_id: selectedProduct.store_id,
        sale_price: salePriceAfterDiscount, has_trade_in: form.has_trade_in,
        trade_in_device_name: form.has_trade_in ? form.trade_in_device_name || null : null,
        trade_in_device_brand: form.has_trade_in ? form.trade_in_device_brand || null : null,
        trade_in_device_model: form.has_trade_in ? form.trade_in_device_model || null : null,
        trade_in_device_imei: form.has_trade_in ? form.trade_in_device_imei || null : null,
        trade_in_value: form.has_trade_in ? tradeInVal : 0, trade_in_product_id: tradeInProductId,
        payment_cash: cashVal, payment_card: cardVal, payment_pix: pixVal,
        customer_id: customerId,
        customer_name: (selectedCustomer?.name || customerSearch) || null,
        customer_phone: selectedCustomer?.phone ?? null,
        customer_cpf: selectedCustomer?.cpf ?? null,
        customer_address: selectedCustomer?.address ?? null,
        notes: form.notes || null, commission_percent: commissionPercent,
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
        await supabase.from("transactions").insert({
          type: "sale", amount: salePriceAfterDiscount, net_amount: netAmount,
          description: desc, store_id: selectedProduct.store_id, product_id: form.product_id,
          created_by: user.id, destination_account_id: form.destination_account_id || null,
          expected_settlement_date: expectedDate.toISOString(),
          ...(form.retro_date ? { created_at: new Date(form.retro_date + "T12:00:00").toISOString() } : {}),
        });
        await createPendingCashEntry(selectedProduct.store_id, user.id, salePriceAfterDiscount, desc, "dinheiro", form.retro_date);
      } else {
        if (cashVal > 0) {
          await supabase.from("transactions").insert({
            type: "sale", amount: cashVal, net_amount: cashVal,
            description: `${desc} [Dinheiro]`, store_id: selectedProduct.store_id, product_id: form.product_id,
            created_by: user.id, destination_account_id: form.destination_account_id || null,
            expected_settlement_date: expectedDate.toISOString(),
            ...(form.retro_date ? { created_at: new Date(form.retro_date + "T12:00:00").toISOString() } : {}),
          });
          await createPendingCashEntry(selectedProduct.store_id, user.id, cashVal, desc, "dinheiro", form.retro_date);
        }
        if (cardVal > 0) {
          const fee = (acc && Number(acc.credit_fee_percent)) || 0;
          const net = cardVal - (cardVal * (fee / 100));
          await supabase.from("transactions").insert({
            type: "sale", amount: cardVal, net_amount: net,
            description: `${desc} [Cartão]`, store_id: selectedProduct.store_id, product_id: form.product_id,
            created_by: user.id, destination_account_id: form.destination_account_id || null,
            expected_settlement_date: expectedDate.toISOString(),
            ...(form.retro_date ? { created_at: new Date(form.retro_date + "T12:00:00").toISOString() } : {}),
          });
          await createPendingCashEntry(selectedProduct.store_id, user.id, cardVal, desc, "cartao_credito", form.retro_date);
        }
        if (pixVal > 0) {
          const fee = (acc && Number(acc.pix_fee_percent)) || 0;
          const net = pixVal - (pixVal * (fee / 100));
          await supabase.from("transactions").insert({
            type: "sale", amount: pixVal, net_amount: net,
            description: `${desc} [PIX]`, store_id: selectedProduct.store_id, product_id: form.product_id,
            created_by: user.id, destination_account_id: form.destination_account_id || null,
            expected_settlement_date: expectedDate.toISOString(),
            ...(form.retro_date ? { created_at: new Date(form.retro_date + "T12:00:00").toISOString() } : {}),
          });
          await createPendingCashEntry(selectedProduct.store_id, user.id, pixVal, desc, "pix", form.retro_date);
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

  const handlePdvSubmit = async (gerarNotinha = false) => {
    if (!user || cart.length === 0 || !activeStoreId) return;
    if (loading || isPdvSubmitting.current) return;
    isPdvSubmitting.current = true;
    setLoading(true);
    try {
      // 1. Atualizar estoque de cada item
      for (const item of cart) {
        const { error: accError } = await supabase
          .from("accessories" as any)
          .update({ quantity: item.acc.quantity - item.qty })
          .eq("id", item.acc.id);
        
        if (accError) throw new Error(`Erro ao atualizar estoque de ${item.acc.name}: ${accError.message}`);
      }

      const desc = `PDV: ${cart.map(i => `${i.qty}x ${i.acc.name}`).join(", ")}${pdvPayment.customer ? ` → ${pdvPayment.customer}` : ""}`;
      let txIdForNote: string | undefined = undefined;

      if (pdvCash === 0 && pdvCard === 0 && pdvPix === 0) {
        const { data: tx, error: txError } = await supabase.from("transactions").insert({ type: "income", category: "acessorio", amount: cartTotal, description: desc, store_id: activeStoreId, created_by: user.id }).select().single();
        if (txError) throw txError;
        txIdForNote = tx?.id;
        await createPendingCashEntry(activeStoreId, user.id, cartTotal, desc, "dinheiro");
      } else {
        if (pdvCash > 0) {
          const cashAmount = pdvCash - pdvTroco;
          if (cashAmount > 0) {
            const { data: tx } = await supabase.from("transactions").insert({ type: "income", category: "acessorio", amount: cashAmount, description: `${desc} [Dinheiro]`, store_id: activeStoreId, created_by: user.id }).select().single();
            if (!txIdForNote && tx) txIdForNote = tx.id;
            await createPendingCashEntry(activeStoreId, user.id, cashAmount, desc, "dinheiro");
          }
        }
        if (pdvCard > 0) {
          const { data: tx } = await supabase.from("transactions").insert({ type: "income", category: "acessorio", amount: pdvCard, description: `${desc} [Cartão]`, store_id: activeStoreId, created_by: user.id }).select().single();
          if (!txIdForNote && tx) txIdForNote = tx.id;
          await createPendingCashEntry(activeStoreId, user.id, pdvCard, desc, "cartao_credito");
        }
        if (pdvPix > 0) {
          const { data: tx } = await supabase.from("transactions").insert({ type: "income", category: "acessorio", amount: pdvPix, description: `${desc} [PIX]`, store_id: activeStoreId, created_by: user.id }).select().single();
          if (!txIdForNote && tx) txIdForNote = tx.id;
          await createPendingCashEntry(activeStoreId, user.id, pdvPix, desc, "pix");
        }
      }

      if (gerarNotinha && txIdForNote) {
        try {
          const store = storeMap.get(activeStoreId) as any;
          const numeroNota = `PDV-${txIdForNote.slice(0, 8).toUpperCase()}`;
          const data: NotaFiscalData = {
            numeroNota,
            dataVenda: new Date().toLocaleString("pt-BR"),
            lojaNome: store?.name ?? "Loja",
            lojaCnpj: store?.cnpj,
            lojaEndereco: store?.address,
            lojaTelefone: store?.phone,
            lojaWhatsapp: store?.whatsapp,
            lojaInstagram: store?.instagram,
            lojaLogoUrl: store?.logo_url,
            clienteNome: pdvPayment.customer || undefined,
            clienteCpf: pdvPayment.cpfCnpj || undefined,
            produtoNome: "Venda Rápida (Acessórios)",
            produtoMarca: "",
            observacoes: cart.map(i => `${i.qty}x ${i.acc.name} (${formatCurrency(i.price)})`).join("\n"),
            valorVenda: cartTotal,
            valorDinheiro: pdvCash > 0 ? pdvCash : undefined,
            valorCartao: pdvCard > 0 ? pdvCard : undefined,
            valorPix: pdvPix > 0 ? pdvPix : undefined,
          };
          const doc = await gerarNotaFiscalInterna(data);
          doc.save(`notinha-${numeroNota}.pdf`);
          toast.success("Notinha gerada com sucesso!");
        } catch (e) {
          console.error(e);
          toast.error("Venda registrada, mas falha ao gerar notinha.");
        }
      }

      toast.success("Venda rápida registrada!"); setPdvOpen(false); resetPdv(); fetchData();
    } catch (err: any) { 
      toast.error(err.message || "Erro"); 
    } finally {
      isPdvSubmitting.current = false;
      setLoading(false);
    }
  };

  const handleDeleteSale = async (saleId: string, reason: string) => {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;
    
    setLoading(true);
    try {
      // 1. Restaurar o produto para 'in_stock'
      await supabase.from("products").update({ status: "in_stock", sale_price: null }).eq("id", sale.product_id);
      
      // 2. Se houver trade-in, apagar o produto que foi criado
      if (sale.trade_in_product_id) {
        await supabase.from("products").delete().eq("id", sale.trade_in_product_id);
      }
      
      // 3. Apagar as transações vinculadas
      await supabase.from("transactions").delete().eq("product_id", sale.product_id).eq("type", "sale");
      
      // 4. Apagar a venda
      const { error } = await supabase.from("sales").delete().eq("id", sale.id);
      
      if (error) throw error;
      
      logAction("DELETE_RECORD", "sales", sale.id, sale, { reason }, sale.store_id);
      toast.success("Venda removida e produto retornou ao estoque!");
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
            status: "in_stock",
          }).eq("id", editSale.trade_in_product_id);
        } else {
          // Create new trade-in product in stock
          const { data: tipData } = await supabase.from("products").insert({
            name: editForm.trade_in_device_name,
            brand: editForm.trade_in_device_brand || null,
            model: editForm.trade_in_device_model || "N/A",
            imei: editForm.trade_in_device_imei || null,
            cost_price: tradeInVal,
            store_id: editSale.store_id,
            created_by: user!.id,
            status: "in_stock",
          }).select("id").single();
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
        if (cash > 0) await createPendingCashEntry(editPdvSale.store_id, user.id, cash, newDesc, "dinheiro", editPdvForm.retro_date);
        if (card > 0) await createPendingCashEntry(editPdvSale.store_id, user.id, card, newDesc, "cartao_credito", editPdvForm.retro_date);
        if (pix > 0) await createPendingCashEntry(editPdvSale.store_id, user.id, pix, newDesc, "pix", editPdvForm.retro_date);
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

  // ── Customer search UI ────────────────────────────────────────────────────
  const CustomerSection = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <UserIcon className="h-3 w-3" /> Cliente
        </p>
        {currentProfile && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            Vendedor: <span className="font-semibold text-primary">{currentProfile.display_name ?? user?.email}</span>
          </span>
        )}
      </div>

      {selectedCustomer ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {selectedCustomer.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold">{selectedCustomer.name}</p>
                <div className="flex gap-2 flex-wrap">
                  {selectedCustomer.phone && <p className="text-[10px] text-muted-foreground">{selectedCustomer.phone}</p>}
                  {selectedCustomer.cpf && <p className="text-[10px] text-muted-foreground">CPF: {selectedCustomer.cpf}</p>}
                </div>
              </div>
            </div>
            <Button className="h-7 px-2 bg-transparent border border-border text-foreground hover:bg-muted text-[10px]" onClick={clearCustomer}>Trocar</Button>
          </div>
          {selectedCustomer.address && <p className="text-[10px] text-muted-foreground">📍 {selectedCustomer.address}</p>}

          {/* Histórico */}
          {customerSalesHistory.length > 0 && (
            <div>
              <button className="flex items-center gap-1 text-[10px] text-primary font-medium" onClick={() => setShowCustomerHistory(v => !v)}>
                <History className="h-3 w-3" /> {customerSalesHistory.length} compra(s) anterior(es)
                {showCustomerHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showCustomerHistory && (
                <div className="mt-2 space-y-1">
                  {customerSalesHistory.map(s => {
                    const p = productMap.get(s.product_id) as any;
                    return (
                      <div key={s.id} className="flex justify-between rounded bg-muted/50 px-2 py-1 text-[10px]">
                        <span className="truncate">{p?.name ?? "Produto"}</span>
                        <span className="text-primary font-semibold shrink-0 ml-2">{formatCurrency(Number(s.sale_price))}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2" ref={searchRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Buscar cliente por nome, telefone ou CPF..." className="pl-9 h-10" />
          </div>
          {customerResults.length > 0 && (
            <div className="rounded-lg border border-border bg-card shadow-lg overflow-hidden">
              {customerResults.map(c => (
                <button key={c.id} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border/50 last:border-0"
                  onClick={() => selectCustomer(c)}>
                  <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">{c.phone ?? ""}{c.cpf ? ` · ${c.cpf}` : ""}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <Button className="w-full gap-2 h-9 text-xs border border-dashed bg-transparent text-foreground hover:bg-muted"
            onClick={() => setShowNewCustomerForm(v => !v)}>
            <UserPlus className="h-3.5 w-3.5" /> Cadastrar novo cliente
          </Button>
          {showNewCustomerForm && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
              <p className="text-xs font-semibold text-primary">Novo Cliente</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Nome *</Label>
                <Input value={newCustomerForm.name} onChange={e => setNewCustomerForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome completo" className="h-9" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Telefone</Label>
                  <Input value={newCustomerForm.phone} onChange={e => setNewCustomerForm(f => ({ ...f, phone: e.target.value }))} placeholder="(87) 99999-9999" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CPF</Label>
                  <Input value={newCustomerForm.cpf} onChange={e => setNewCustomerForm(f => ({ ...f, cpf: e.target.value }))} placeholder="000.000.000-00" className="h-9" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Endereço</Label>
                <Input value={newCustomerForm.address} onChange={e => setNewCustomerForm(f => ({ ...f, address: e.target.value }))} placeholder="Rua, número, bairro..." className="h-9" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">E-mail</Label>
                  <Input type="email" value={newCustomerForm.email} onChange={e => setNewCustomerForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Data de Nascimento</Label>
                  <Input type="date" value={newCustomerForm.birth} onChange={e => setNewCustomerForm(f => ({ ...f, birth: e.target.value }))} className="h-9" />
                </div>
              </div>
              <Button className="w-full h-9" onClick={handleCreateCustomer} disabled={loading || !newCustomerForm.name}>
                {loading ? "Salvando..." : "Salvar e Selecionar"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );

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
          {/* PDV */}
          <Dialog open={pdvOpen} onOpenChange={o => { setPdvOpen(o); if (!o) resetPdv(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2 h-10 border bg-transparent text-foreground hover:bg-muted" disabled={activeStoreId === "all"}>
                <Zap className="h-4 w-4 text-yellow-500" /> PDV Rápido
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
              <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Zap className="h-4 w-4 text-yellow-500" /> PDV — Venda Rápida</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={accSearch} onChange={e => setAccSearch(e.target.value)} placeholder="Buscar acessório..." className="pl-9 h-10" />
                  </div>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {filteredAcc.length > 0 ? filteredAcc.map(a => (
                      <div key={a.id} className="flex items-center justify-between rounded-lg border border-border/50 p-3 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors" onClick={() => addToCart(a)}>
                        <div><p className="text-sm font-medium">{a.name}</p><p className="text-[10px] text-muted-foreground">{a.brand && `${a.brand} · `}Estoque: {a.quantity}</p></div>
                        <div className="text-right"><p className="text-sm font-bold text-primary">{formatCurrency(a.sale_price ?? a.cost_price)}</p><p className="text-[10px] text-muted-foreground">+ Adicionar</p></div>
                      </div>
                    )) : <p className="text-xs text-muted-foreground text-center py-8">Nenhum acessório disponível</p>}
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Carrinho</p>
                  {cart.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-xs border border-dashed border-border rounded-lg">Clique nos produtos para adicionar</div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {cart.map(item => (
                        <div key={item.acc.id} className="rounded-lg border border-border/50 p-2.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium truncate flex-1">{item.acc.name}</p>
                            <Button className="h-6 w-6 p-0 bg-transparent text-destructive hover:bg-destructive/10 border-0 shadow-none shrink-0" onClick={() => updateCartQty(item.acc.id, 0)}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <Button className="h-7 w-7 p-0 border bg-transparent text-foreground hover:bg-muted" onClick={() => updateCartQty(item.acc.id, item.qty - 1)}>-</Button>
                              <span className="text-sm font-bold w-6 text-center">{item.qty}</span>
                              <Button className="h-7 w-7 p-0 border bg-transparent text-foreground hover:bg-muted" onClick={() => updateCartQty(item.acc.id, item.qty + 1)}>+</Button>
                            </div>
                            <Input type="number" step="0.01" value={item.price} onChange={e => updateCartPrice(item.acc.id, parseFloat(e.target.value) || 0)} className="h-7 text-xs w-24" />
                            <span className="text-sm font-bold text-primary ml-auto">{formatCurrency(item.price * item.qty)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {cart.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-border">
                      <div className="flex justify-between items-center"><span className="font-semibold">Total</span><span className="font-display font-bold text-lg text-primary">{formatCurrency(cartTotal)}</span></div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Loja</Label>
                        <Select value={pdvPayment.store_id} onValueChange={v => setPdvPayment({ ...pdvPayment, store_id: v })}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Cliente / Empresa (Opcional)</Label>
                          <Input value={pdvPayment.customer} onChange={e => setPdvPayment({ ...pdvPayment, customer: e.target.value })} placeholder="Nome do cliente/empresa" className="h-9" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">CPF / CNPJ (Opcional)</Label>
                          <Input value={pdvPayment.cpfCnpj} onChange={e => setPdvPayment({ ...pdvPayment, cpfCnpj: e.target.value })} placeholder="000.000.000-00" className="h-9" />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[["cash","Dinheiro"], ["card","Cartão"], ["pix","PIX"]].map(([k, l]) => (
                          <div key={k} className="space-y-1">
                            <Label className="text-[10px]">{l}</Label>
                            <Input type="number" step="0.01" value={(pdvPayment as any)[k]} onChange={e => setPdvPayment({ ...pdvPayment, [k]: e.target.value })} placeholder="0.00" className="h-9 text-xs" />
                          </div>
                        ))}
                      </div>
                      <div className={`flex justify-between text-sm font-bold rounded-lg p-2 ${Math.abs(pdvRemaining) < 0.01 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                        <span>{pdvTroco > 0 ? "Troco" : "Restante"}</span>
                        <span>{formatCurrency(pdvTroco > 0 ? pdvTroco : pdvRemaining)}</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button className="w-full h-10 font-semibold" onClick={() => handlePdvSubmit(false)} disabled={loading || (Math.abs(pdvRemaining) > 0.01 && pdvTroco === 0) || !activeStoreId}>
                          {loading ? "Registrando..." : `Finalizar — ${formatCurrency(cartTotal)}`}
                        </Button>
                        <Button variant="outline" className="w-full h-10 font-semibold border-primary/50 text-primary hover:bg-primary/5" onClick={() => handlePdvSubmit(true)} disabled={loading || (Math.abs(pdvRemaining) > 0.01 && pdvTroco === 0) || !activeStoreId}>
                          <FileText className="h-4 w-4 mr-2" />
                          Finalizar e Gerar Notinha
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Nova Venda */}
          <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2 h-10" disabled={activeStoreId === "all"}>
                <Plus className="h-4 w-4" /> Nova Venda
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
              <DialogHeader><DialogTitle className="font-display">Registrar Venda</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* ── Cliente ── */}
                {CustomerSection()}

                {/* ── Produto ── */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Produto</Label>
                  <Select value={form.product_id} onValueChange={v => {
                    const prod = products.find(p => p.id === v);
                    setForm({ ...form, product_id: v, sale_price: prod?.sale_price ? String(prod.sale_price) : "" });
                  }}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Selecione o aparelho" /></SelectTrigger>
                    <SelectContent>
                      {availableProducts.map(p => {
                        const storeName = (storeMap.get(p.store_id) as any)?.name || "?";
                        return (
                          <SelectItem key={p.id} value={p.id} className="py-2.5 focus:bg-accent">
                            <div className="flex flex-col gap-1 w-full text-left">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-sm text-foreground">{p.name}</span>
                                {p.brand && (
                                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                    {p.brand}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                                {p.imei && (
                                  <span className="font-mono bg-muted/80 border border-border/80 px-1.5 py-0.2 rounded text-[11px] text-foreground/80">
                                    IMEI: {p.imei}
                                  </span>
                                )}
                                <span className="flex items-center gap-1 bg-secondary/80 px-1.5 py-0.2 rounded text-[10px] font-medium text-secondary-foreground">
                                  📍 {storeName}
                                </span>
                              </div>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {selectedProduct && (
                  <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                    {/* Header do card do produto */}
                    <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border-b border-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <Smartphone className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold text-sm text-foreground truncate">{selectedProduct.name}</span>
                      </div>
                      {selectedProduct.brand && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20 shrink-0 ml-2">
                          {selectedProduct.brand}
                        </span>
                      )}
                    </div>
                    {/* Detalhes */}
                    <div className="px-3 py-2.5 space-y-2">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        {selectedProduct.model && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Modelo</span>
                            <span className="font-medium">{selectedProduct.model}</span>
                          </div>
                        )}
                        {(selectedProduct as any).color && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Cor</span>
                            <span className="font-medium flex items-center gap-1">
                              <span className="inline-block h-2.5 w-2.5 rounded-full border border-border" style={{ background: (selectedProduct as any).color }} />
                              {(selectedProduct as any).color}
                            </span>
                          </div>
                        )}
                        {selectedProduct.capacity && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Capacidade</span>
                            <span className="font-medium">{selectedProduct.capacity}</span>
                          </div>
                        )}
                        {selectedProduct.battery_percentage !== null && selectedProduct.battery_percentage !== undefined && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Saúde da Bateria</span>
                            <span className="font-medium">{selectedProduct.battery_percentage}%</span>
                          </div>
                        )}
                        {selectedProduct.condition && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Condição</span>
                            <span className="font-medium capitalize">{selectedProduct.condition}</span>
                          </div>
                        )}
                        {selectedProduct.imei && (
                          <div className="flex flex-col gap-0.5 col-span-2">
                            <span className="text-muted-foreground text-[10px] uppercase tracking-wide">IMEI</span>
                            <span className="font-mono text-[11px] bg-muted/70 px-1.5 py-0.5 rounded border border-border/70">{selectedProduct.imei}</span>
                          </div>
                        )}
                        {selectedProduct.store_id && (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Loja</span>
                            <span className="font-medium flex items-center gap-1">
                              <Store className="h-3 w-3 text-muted-foreground" />
                              {(storeMap.get(selectedProduct.store_id) as any)?.name ?? "—"}
                            </span>
                          </div>
                        )}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Custo</span>
                          <span className="font-semibold text-foreground">{formatCurrency(Number(selectedProduct.cost_price))}</span>
                        </div>
                      </div>
                      {salePrice > 0 && (
                        <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold border ${
                          profit >= 0
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                            : "bg-destructive/10 border-destructive/20 text-destructive"
                        }`}>
                          <span>Lucro estimado</span>
                          <span className="text-sm">{formatCurrency(profit)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Valor de Venda (R$)</Label>
                    <Input type="number" step="0.01" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} placeholder="3500.00" required className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Tag className="h-3 w-3" /> Desconto (R$)</Label>
                    <Input type="number" step="0.01" min="0" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} placeholder="0.00" className="h-10" />
                  </div>
                </div>

                {discount > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs">
                    <span className="text-yellow-500">Valor com desconto</span>
                    <span className="font-bold text-yellow-500">{formatCurrency(salePriceAfterDiscount)}</span>
                  </div>
                )}

                {/* Trade-in */}
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <div><p className="text-sm font-medium">Aparelho na troca</p><p className="text-[11px] text-muted-foreground">Cliente entrega como parte do pagamento</p></div>
                  </div>
                  <Switch checked={form.has_trade_in} onCheckedChange={v => setForm({ ...form, has_trade_in: v })} />
                </div>

                {form.has_trade_in && (
                  <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-xs font-semibold text-primary">Dados do aparelho na troca</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><Label className="text-xs">Nome</Label><Input value={form.trade_in_device_name} onChange={e => setForm({ ...form, trade_in_device_name: e.target.value })} placeholder="iPhone 11 64GB" className="h-10" required={form.has_trade_in} /></div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Marca</Label>
                        <Select value={form.trade_in_device_brand} onValueChange={v => setForm({ ...form, trade_in_device_brand: v })}>
                          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                          <SelectContent>{["iPhone","Samsung","Xiaomi","Outro"].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><Label className="text-xs">Modelo</Label><Input value={form.trade_in_device_model} onChange={e => setForm({ ...form, trade_in_device_model: e.target.value })} placeholder="A2221" className="h-10" /></div>
                      <div className="space-y-1.5"><Label className="text-xs">IMEI</Label><Input value={form.trade_in_device_imei} onChange={e => setForm({ ...form, trade_in_device_imei: e.target.value })} placeholder="Opcional" className="h-10" /></div>
                    </div>
                    <div className="space-y-1.5"><Label className="text-xs">Valor da troca (R$)</Label><Input type="number" step="0.01" value={form.trade_in_value} onChange={e => setForm({ ...form, trade_in_value: e.target.value })} placeholder="1500.00" required={form.has_trade_in} className="h-10" /></div>
                  </div>
                )}

                {/* Pagamento */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Forma de Pagamento</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5"><Label className="text-xs flex items-center gap-1"><Banknote className="h-3 w-3" /> Dinheiro</Label><Input type="number" step="0.01" value={form.payment_cash} onChange={e => setForm({ ...form, payment_cash: e.target.value })} placeholder="0.00" className="h-10" /></div>
                    <div className="space-y-1.5"><Label className="text-xs flex items-center gap-1"><CreditCard className="h-3 w-3" /> Cartão</Label><Input type="number" step="0.01" value={form.payment_card} onChange={e => setForm({ ...form, payment_card: e.target.value })} placeholder="0.00" className="h-10" /></div>
                    <div className="space-y-1.5"><Label className="text-xs flex items-center gap-1"><QrCode className="h-3 w-3" /> PIX</Label><Input type="number" step="0.01" value={form.payment_pix} onChange={e => setForm({ ...form, payment_pix: e.target.value })} placeholder="0.00" className="h-10" /></div>
                  </div>

                  {cardVal > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1"><CreditCard className="h-3 w-3" /> Parcelas no Cartão</Label>
                      <Select value={form.installments} onValueChange={v => setForm({ ...form, installments: v })}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                            <SelectItem key={n} value={String(n)}>{n}x {n > 1 ? `de ${formatCurrency(cardVal / n)}` : "à vista"}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {(cardVal > 0 || pixVal > 0) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1"><Landmark className="h-3 w-3" /> Conta / Maquininha Destino</Label>
                      <Select value={form.destination_account_id} onValueChange={v => setForm({ ...form, destination_account_id: v })}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Selecione onde vai cair..." /></SelectTrigger>
                        <SelectContent>
                          {bankAccounts.filter(a => a.store_id === selectedProduct.store_id).map(acc => (
                            <SelectItem key={acc.id} value={acc.id}>{acc.bank_name} ({acc.account_type})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">As taxas configuradas serão aplicadas automaticamente e refletirão no saldo disponível.</p>
                    </div>
                  )}

                  <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Valor de venda</span><span className="font-semibold">{formatCurrency(salePrice)}</span></div>
                    {discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="font-semibold text-yellow-500">-{formatCurrency(discount)}</span></div>}
                    {form.has_trade_in && <div className="flex justify-between"><span className="text-muted-foreground">Aparelho na troca</span><span className="font-semibold text-primary">-{formatCurrency(tradeInVal)}</span></div>}
                    <div className="flex justify-between"><span className="text-muted-foreground">Dinheiro + Cartão + PIX</span><span className="font-semibold">{formatCurrency(cashVal + cardVal + pixVal)}</span></div>
                    <div className="border-t border-border pt-1 flex justify-between">
                      <span className="font-medium">Restante</span>
                      <span className={`font-bold ${Math.abs(remaining) < 0.01 ? "text-primary" : "text-destructive"}`}>{formatCurrency(remaining)}</span>
                    </div>
                  </div>
                </div>

                {/* Garantia + Comissão */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Shield className="h-3 w-3" /> Garantia (dias)</Label>
                    <Select value={form.warranty_days} onValueChange={v => setForm({ ...form, warranty_days: v })}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[7, 15, 30, 60, 90, 180, 365].map(d => <SelectItem key={d} value={String(d)}>{d} dias{d === 90 ? " (padrão)" : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      <Percent className="h-3 w-3" /> Comissão (%)
                      {userRole === "vendedor" && <span className="ml-1 text-[9px] text-muted-foreground font-normal">(somente admin)</span>}
                    </Label>
                    {userRole === "vendedor" ? (
                      <div className="h-10 rounded-md border border-border bg-muted/40 flex items-center px-3 text-sm text-muted-foreground gap-2 cursor-not-allowed">
                        <Shield className="h-3.5 w-3.5 shrink-0" />
                        <span>{form.commission_percent}% — definido pelo admin</span>
                      </div>
                    ) : (
                      <Input type="number" step="0.5" min="0" max="100" value={form.commission_percent} onChange={e => setForm({ ...form, commission_percent: e.target.value })} className="h-10" />
                    )}
                  </div>
                </div>

                {commissionValue > 0 && (
                  <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 flex justify-between text-xs">
                    <span className="text-muted-foreground">Comissão calculada</span>
                    <span className="font-bold text-primary">{formatCurrency(commissionValue)}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Observações</Label>
                  <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Observações da venda..." className="min-h-[60px]" />
                </div>

                {/* Data Retroativa */}
                <div className="border border-amber-500/30 rounded-xl p-3 bg-amber-500/5 space-y-1.5">
                  <Label className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Data da Venda (Retroativa)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">Opcional. Escolha a data se o aparelho foi vendido em uma data retroativa.</p>
                  <Input
                    type="date"
                    value={form.retro_date}
                    onChange={e => setForm({ ...form, retro_date: e.target.value })}
                    className="h-10 border-amber-500/30"
                  />
                </div>

                <Button type="submit" className="w-full h-11 font-semibold" disabled={loading || !form.product_id || Math.abs(remaining) > 0.01}>
                  {loading ? "Registrando..." : "Registrar Venda"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
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
        {pdvSales.map(tx => (
          <Card key={tx.id} className="border-border/50 shadow-lg shadow-black/10">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{tx.description}</p>
                    <Badge className="text-[10px] bg-yellow-500/15 text-yellow-500 border border-yellow-500/20 shrink-0">PDV</Badge>
                    {activeStoreId === "all" && (
                      <Badge variant="outline" className="text-[9px] bg-muted/50 border-primary/20 text-primary">
                        {(storeMap.get(tx.store_id) as any)?.name}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(tx.created_at).toLocaleDateString("pt-BR")}</p>
                  {(userRole === "admin" || userRole === "gerente") && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        className="h-7 px-2 text-[10px] gap-1 border border-yellow-500/40 bg-yellow-500/5 text-yellow-600 dark:text-yellow-500 hover:bg-yellow-500/10 shadow-none"
                        onClick={() => handleOpenPdvEdit(tx)}
                      >
                        <Pencil className="h-3 w-3" />Editar
                      </Button>
                    </div>
                  )}
                </div>
                <p className="font-display font-bold text-sm text-primary shrink-0">{formatCurrency(Number(tx.amount))}</p>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredSales.map(sale => {
          const product = productMap.get(sale.product_id) as any;
          const isLoading = notaLoading === sale.id;
          return (
            <Card
              key={sale.id}
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
                    <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
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
                          onClick={() => { setDeleteId(sale.id); setJustification(""); setDeleteDialogOpen(true); }} disabled={loading}>
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
      <Dialog open={!!selectedViewSale} onOpenChange={open => { if (!open) setSelectedViewSale(null); }}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          {selectedViewSale && (() => {
            const product = productMap.get(selectedViewSale.product_id) as any;
            const store = storeMap.get(selectedViewSale.store_id) as any;
            const sellerName = selectedViewSale.seller_id ? profileMap.get(selectedViewSale.seller_id) : null;
            const totalPaid = Number(selectedViewSale.payment_cash) + Number(selectedViewSale.payment_card) + Number(selectedViewSale.payment_pix) + (selectedViewSale.has_trade_in ? Number(selectedViewSale.trade_in_value) : 0);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    Detalhes da Venda
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-1">

                  {/* Produto */}
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> Aparelho</p>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-base">{product?.name || "—"}</p>
                        {product?.brand && <p className="text-xs text-muted-foreground">{product.brand}{product?.model ? ` · ${product.model}` : ""}</p>}
                        {product?.color && <p className="text-xs text-muted-foreground">Cor: {product.color}</p>}
                        {product?.storage && <p className="text-xs text-muted-foreground">Armazenamento: {product.storage}</p>}
                      </div>
                      {product?.imei && (
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">IMEI</p>
                          <p className="font-mono text-xs bg-muted px-2 py-0.5 rounded border border-border">{product.imei}</p>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Store className="h-3 w-3" /> {store?.name || "—"}
                    </p>
                  </div>

                  {/* Cliente */}
                  {(selectedViewSale.customer_name || selectedViewSale.customer_phone || selectedViewSale.customer_cpf) && (
                    <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><UserIcon className="h-3.5 w-3.5" /> Cliente</p>
                      {selectedViewSale.customer_name && <p className="font-semibold text-sm">{selectedViewSale.customer_name}</p>}
                      {selectedViewSale.customer_phone && <p className="text-xs text-muted-foreground">{selectedViewSale.customer_phone}</p>}
                      {selectedViewSale.customer_cpf && <p className="text-xs text-muted-foreground">CPF: {selectedViewSale.customer_cpf}</p>}
                      {selectedViewSale.customer_address && <p className="text-xs text-muted-foreground flex items-start gap-1"><MapPin className="h-3 w-3 mt-0.5 shrink-0" />{selectedViewSale.customer_address}</p>}
                    </div>
                  )}

                  {/* Valores */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Financeiro</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Valor de venda</span>
                        <span className="font-bold text-primary">{formatCurrency(Number(selectedViewSale.sale_price))}</span>
                      </div>
                      {Number(selectedViewSale.discount) > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Desconto</span>
                          <span className="text-yellow-500 font-semibold">-{formatCurrency(Number(selectedViewSale.discount))}</span>
                        </div>
                      )}
                      <div className="border-t border-border/50 pt-1.5 space-y-1">
                        {Number(selectedViewSale.payment_cash) > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="flex items-center gap-1 text-muted-foreground"><Banknote className="h-3 w-3" /> Dinheiro</span>
                            <span>{formatCurrency(Number(selectedViewSale.payment_cash))}</span>
                          </div>
                        )}
                        {Number(selectedViewSale.payment_card) > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="flex items-center gap-1 text-muted-foreground"><CreditCard className="h-3 w-3" /> Cartão{selectedViewSale.installments && selectedViewSale.installments > 1 ? ` (${selectedViewSale.installments}x)` : ""}</span>
                            <span>{formatCurrency(Number(selectedViewSale.payment_card))}</span>
                          </div>
                        )}
                        {Number(selectedViewSale.payment_pix) > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="flex items-center gap-1 text-muted-foreground"><QrCode className="h-3 w-3" /> PIX</span>
                            <span>{formatCurrency(Number(selectedViewSale.payment_pix))}</span>
                          </div>
                        )}
                        {selectedViewSale.has_trade_in && Number(selectedViewSale.trade_in_value) > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="flex items-center gap-1 text-muted-foreground"><ArrowLeftRight className="h-3 w-3" /> Troca</span>
                            <span>{formatCurrency(Number(selectedViewSale.trade_in_value))}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between text-xs pt-1 border-t border-border/50">
                        <span className="font-medium">Total pago</span>
                        <span className="font-bold">{formatCurrency(totalPaid)}</span>
                      </div>
                      {Number(selectedViewSale.commission_value) > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground"><Percent className="h-3 w-3" /> Comissão</span>
                          <span className="text-yellow-500">{formatCurrency(Number(selectedViewSale.commission_value))}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Trade-in */}
                  {selectedViewSale.has_trade_in && selectedViewSale.trade_in_device_name && (
                    <div className="rounded-xl border border-primary/20 bg-card p-4 space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5" /> Aparelho na Troca</p>
                      <p className="font-semibold text-sm">{selectedViewSale.trade_in_device_name}</p>
                      {selectedViewSale.trade_in_device_brand && <p className="text-xs text-muted-foreground">{selectedViewSale.trade_in_device_brand}{selectedViewSale.trade_in_device_model ? ` · ${selectedViewSale.trade_in_device_model}` : ""}</p>}
                      {selectedViewSale.trade_in_device_imei && <p className="font-mono text-xs bg-muted px-2 py-0.5 rounded border border-border w-fit">IMEI: {selectedViewSale.trade_in_device_imei}</p>}
                      <p className="text-xs font-semibold text-primary">Valor abatido: {formatCurrency(Number(selectedViewSale.trade_in_value))}</p>
                    </div>
                  )}

                  {/* Garantia + Info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border bg-card p-3 text-center">
                      <Shield className="h-4 w-4 text-blue-500 mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground">Garantia</p>
                      <p className="font-bold text-sm">{selectedViewSale.warranty_days || 90} dias</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3 text-center">
                      <CalendarDays className="h-4 w-4 text-primary mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground">Data da venda</p>
                      <p className="font-bold text-sm">{new Date(selectedViewSale.created_at).toLocaleDateString("pt-BR")}</p>
                    </div>
                  </div>

                  {sellerName && (
                    <p className="text-xs text-muted-foreground text-center">Vendedor: <span className="font-semibold text-foreground">{sellerName}</span></p>
                  )}

                  {/* Observações */}
                  {selectedViewSale.notes && (
                    <div className="rounded-xl border border-border bg-card p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-1.5"><StickyNote className="h-3.5 w-3.5" /> Observações</p>
                      <p className="text-sm text-muted-foreground">{selectedViewSale.notes}</p>
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      className="flex-1 h-9 text-xs gap-1.5 border border-border bg-transparent text-foreground hover:bg-muted"
                      onClick={() => handleGerarNota(selectedViewSale, false)}
                      disabled={notaLoading === selectedViewSale.id}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {notaLoading === selectedViewSale.id ? "Gerando..." : "Baixar Comprovante"}
                    </Button>
                    {selectedViewSale.customer_phone && (
                      <Button
                        className="flex-1 h-9 text-xs gap-1.5 text-green-500 border border-green-500/30 bg-transparent hover:bg-green-500/10"
                        onClick={() => handleGerarNota(selectedViewSale, true)}
                        disabled={notaLoading === selectedViewSale.id}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />WhatsApp
                      </Button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Confirmar Exclusão de Venda
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Esta ação é permanente. O produto voltará para o estoque e as transações vinculadas serão removidas.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Motivo da Exclusão</Label>
              <Input 
                value={justification} 
                onChange={(e) => setJustification(e.target.value)} 
                placeholder="Ex: Erro no lançamento, cancelamento pelo cliente..." 
                required 
                className="h-10"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
              <Button 
                variant="destructive" 
                className="flex-1" 
                disabled={!justification || loading}
                onClick={async () => {
                  if (deleteId) {
                    await handleDeleteSale(deleteId, justification);
                    setDeleteDialogOpen(false);
                  }
                }}
              >
                {loading ? "Excluindo..." : "Confirmar Exclusão"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Sale Dialog */}
      <Dialog open={!!editSale} onOpenChange={open => { if (!open) setEditSale(null); }}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 text-primary">
              <Pencil className="h-5 w-5" /> Editar Lançamento de Venda
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Cliente</Label>
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="h-auto p-0 text-xs text-primary hover:bg-transparent hover:underline"
                  onClick={() => setShowEditNewCustomerForm(v => !v)}
                >
                  <UserPlus className="h-3 w-3 mr-1" />
                  {showEditNewCustomerForm ? "Cancelar cadastro" : "Cadastrar novo cliente"}
                </Button>
              </div>

              {!showEditNewCustomerForm ? (
                <Select
                  value={editSaleCustomerId}
                  onValueChange={v => {
                    setEditSaleCustomerId(v);
                    if (v !== "manual") {
                      const c = customers.find(x => x.id === v);
                      if (c) setEditForm(prev => ({ ...prev, customer_name: c.name }));
                    }
                  }}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Selecione um cliente cadastrado..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">✍️ Digitar nome manualmente...</SelectItem>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  <p className="text-xs font-semibold text-primary">Novo Cliente (para esta venda)</p>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome *</Label>
                    <Input 
                      value={editNewCustomerForm.name} 
                      onChange={e => setEditNewCustomerForm(f => ({ ...f, name: e.target.value }))} 
                      placeholder="Nome completo" 
                      className="h-9" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Telefone</Label>
                      <Input 
                        value={editNewCustomerForm.phone} 
                        onChange={e => setEditNewCustomerForm(f => ({ ...f, phone: e.target.value }))} 
                        placeholder="(87) 99999-9999" 
                        className="h-9" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">CPF</Label>
                      <Input 
                        value={editNewCustomerForm.cpf} 
                        onChange={e => setEditNewCustomerForm(f => ({ ...f, cpf: e.target.value }))} 
                        placeholder="000.000.000-00" 
                        className="h-9" 
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Endereço</Label>
                    <Input 
                      value={editNewCustomerForm.address} 
                      onChange={e => setEditNewCustomerForm(f => ({ ...f, address: e.target.value }))} 
                      placeholder="Rua, número, bairro..." 
                      className="h-9" 
                    />
                  </div>
                  <Button 
                    type="button"
                    className="w-full h-9" 
                    onClick={handleCreateCustomerForEdit} 
                    disabled={loading || !editNewCustomerForm.name}
                  >
                    {loading ? "Salvando..." : "Salvar e Selecionar"}
                  </Button>
                </div>
              )}
            </div>

            {!showEditNewCustomerForm && editSaleCustomerId === "manual" && (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <Label className="text-xs font-semibold">Nome do Cliente (Manual/Novo)</Label>
                <Input
                  value={editForm.customer_name}
                  onChange={e => setEditForm({ ...editForm, customer_name: e.target.value })}
                  placeholder="Ex: Luana Yasmim"
                  className="h-10"
                />
              </div>
            )}

            {/* Dados do Aparelho Vendido (Editável pelo Admin ou Vendedor com registro de auditoria) */}
            <div className="border border-border/80 rounded-xl p-3 bg-muted/20 space-y-3">
              <span className="text-xs font-bold text-foreground uppercase tracking-wide">Dados do Aparelho Vendido</span>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Nome do Aparelho</Label>
                <Input
                  value={editForm.product_name}
                  onChange={e => setEditForm({ ...editForm, product_name: e.target.value })}
                  placeholder="Ex: iPhone 11 64GB"
                  className="h-10"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Custo do Aparelho (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.product_cost}
                    onChange={e => setEditForm({ ...editForm, product_cost: e.target.value })}
                    placeholder="0.00"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">IMEI do Aparelho</Label>
                  <Input
                    value={editForm.product_imei}
                    onChange={e => setEditForm({ ...editForm, product_imei: e.target.value })}
                    placeholder="Sem IMEI / Opcional"
                    className="h-10 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Valor Bruto da Venda (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.sale_price}
                  onChange={e => setEditForm({ ...editForm, sale_price: e.target.value })}
                  placeholder="0.00"
                  required
                  className="h-10 font-medium text-foreground"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Desconto (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.discount}
                  onChange={e => setEditForm({ ...editForm, discount: e.target.value })}
                  placeholder="0.00"
                  className="h-10 text-yellow-500 font-semibold"
                />
              </div>
            </div>

            <div className="border-t border-border/60 pt-3">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Formas de Pagamento</span>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><Banknote className="h-3 w-3" /> Dinheiro</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.payment_cash}
                    onChange={e => setEditForm({ ...editForm, payment_cash: e.target.value })}
                    placeholder="0.00"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" /> Cartão</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.payment_card}
                    onChange={e => setEditForm({ ...editForm, payment_card: e.target.value })}
                    placeholder="0.00"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><QrCode className="h-3 w-3" /> PIX</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.payment_pix}
                    onChange={e => setEditForm({ ...editForm, payment_pix: e.target.value })}
                    placeholder="0.00"
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {/* Resumo de pagamento em tempo real */}
            {(() => {
              const _net = Math.max(0, (parseFloat(editForm.sale_price) || 0) - (parseFloat(editForm.discount) || 0));
              const _cash = parseFloat(editForm.payment_cash) || 0;
              const _card = parseFloat(editForm.payment_card) || 0;
              const _pix = parseFloat(editForm.payment_pix) || 0;
              const _tradeIn = editForm.has_trade_in ? (parseFloat(editForm.trade_in_value) || 0) : 0;
              const _total = _cash + _card + _pix + _tradeIn;
              const _rem = _net - _total;
              return (
                <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Valor líquido</span><span className="font-semibold">{formatCurrency(_net)}</span></div>
                  {_tradeIn > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Trade-in</span><span className="font-semibold text-primary">-{formatCurrency(_tradeIn)}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">Total pago (dinheiro + cartão + PIX)</span><span className="font-semibold">{formatCurrency(_cash + _card + _pix)}</span></div>
                  <div className="border-t border-border pt-1 flex justify-between">
                    <span className="font-medium">Restante</span>
                    <span className={`font-bold ${Math.abs(_rem) < 0.01 ? "text-primary" : "text-destructive"}`}>{formatCurrency(_rem)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Trade-in */}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Aparelho na troca</p>
                  <p className="text-[11px] text-muted-foreground">Cliente entrega como parte do pagamento</p>
                </div>
              </div>
              <Switch
                checked={editForm.has_trade_in}
                onCheckedChange={v => setEditForm({ ...editForm, has_trade_in: v })}
              />
            </div>

            {editForm.has_trade_in && (
              <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-semibold text-primary">Dados do aparelho na troca</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome</Label>
                    <Input
                      value={editForm.trade_in_device_name}
                      onChange={e => setEditForm({ ...editForm, trade_in_device_name: e.target.value })}
                      placeholder="iPhone 11 64GB"
                      className="h-10"
                      required={editForm.has_trade_in}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Marca</Label>
                    <Select
                      value={editForm.trade_in_device_brand}
                      onValueChange={v => setEditForm({ ...editForm, trade_in_device_brand: v })}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["iPhone", "Samsung", "Xiaomi", "Outro"].map(b => (
                          <SelectItem key={b} value={b}>
                            {b}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Modelo</Label>
                    <Input
                      value={editForm.trade_in_device_model || ""}
                      onChange={e => setEditForm({ ...editForm, trade_in_device_model: e.target.value })}
                      placeholder="A2221"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">IMEI</Label>
                    <Input
                      value={editForm.trade_in_device_imei}
                      onChange={e => setEditForm({ ...editForm, trade_in_device_imei: e.target.value })}
                      placeholder="Opcional"
                      className="h-10"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor da troca (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.trade_in_value}
                    onChange={e => setEditForm({ ...editForm, trade_in_value: e.target.value })}
                    placeholder="1500.00"
                    required={editForm.has_trade_in}
                    className="h-10"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Parcelas no Cartão</Label>
                <Select value={editForm.installments} onValueChange={v => setEditForm({ ...editForm, installments: v })}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Selecione as parcelas" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                      <SelectItem key={n} value={n.toString()}>
                        {n}x {n === 1 ? "à vista" : "sem juros"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Garantia (dias)</Label>
                <Select value={editForm.warranty_days} onValueChange={v => setEditForm({ ...editForm, warranty_days: v })}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Selecione a garantia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sem garantia</SelectItem>
                    <SelectItem value="30">30 dias</SelectItem>
                    <SelectItem value="90">90 dias (padrão)</SelectItem>
                    <SelectItem value="180">180 dias</SelectItem>
                    <SelectItem value="365">1 ano</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1">
                Comissão do Vendedor (%)
                {userRole === "vendedor" && <span className="ml-1 text-[9px] text-muted-foreground font-normal">(somente admin)</span>}
              </Label>
              {userRole === "vendedor" ? (
                <div className="h-10 rounded-md border border-border bg-muted/40 flex items-center px-3 text-sm text-muted-foreground gap-2 cursor-not-allowed">
                  <Shield className="h-3.5 w-3.5 shrink-0" />
                  <span>{editForm.commission_percent}% — somente o admin pode alterar</span>
                </div>
              ) : (
                <Input
                  type="number"
                  step="0.1"
                  value={editForm.commission_percent}
                  onChange={e => setEditForm({ ...editForm, commission_percent: e.target.value })}
                  placeholder="0"
                  className="h-10"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Observações</Label>
              <Textarea
                value={editForm.notes}
                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Ex: Observações gerais da alteração de venda..."
                className="min-h-[80px]"
              />
            </div>

            {/* Data Retroativa */}
            <div className="border border-amber-500/30 rounded-xl p-3 bg-amber-500/5 space-y-1.5">
              <Label className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Data da Venda (Retroativa)
              </Label>
              <p className="text-[11px] text-muted-foreground">Altere a data caso a venda tenha ocorrido em data diferente do lançamento no sistema.</p>
              <Input
                type="date"
                value={editForm.retro_date}
                onChange={e => setEditForm({ ...editForm, retro_date: e.target.value })}
                className="h-10 border-amber-500/30"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditSale(null)}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90" disabled={loading}>
                {loading ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit PDV Sale Dialog */}
      <Dialog open={!!editPdvSale} onOpenChange={open => { if (!open) setEditPdvSale(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 text-yellow-500">
              <Zap className="h-4 w-4" /> Editar Venda PDV
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSavePdvEdit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Descrição</Label>
              <Input
                value={editPdvForm.description}
                onChange={e => setEditPdvForm({ ...editPdvForm, description: e.target.value })}
                placeholder="Ex: PDV: 2x Capinha..."
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Valor Total (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={editPdvForm.amount}
                onChange={e => setEditPdvForm({ ...editPdvForm, amount: e.target.value })}
                placeholder="0.00"
                required
                className="h-10 font-medium"
              />
            </div>
            
            <div className="border-t border-border/60 pt-3">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Formas de Pagamento</span>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><Banknote className="h-3 w-3" /> Dinheiro</Label>
                  <Input
                    type="number" step="0.01"
                    value={editPdvForm.payment_cash}
                    onChange={e => setEditPdvForm({ ...editPdvForm, payment_cash: e.target.value })}
                    placeholder="0.00" className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" /> Cartão</Label>
                  <Input
                    type="number" step="0.01"
                    value={editPdvForm.payment_card}
                    onChange={e => setEditPdvForm({ ...editPdvForm, payment_card: e.target.value })}
                    placeholder="0.00" className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground flex items-center gap-1"><QrCode className="h-3 w-3" /> PIX</Label>
                  <Input
                    type="number" step="0.01"
                    value={editPdvForm.payment_pix}
                    onChange={e => setEditPdvForm({ ...editPdvForm, payment_pix: e.target.value })}
                    placeholder="0.00" className="h-9"
                  />
                </div>
              </div>
            </div>

            {(() => {
              const _net = parseFloat(editPdvForm.amount) || 0;
              const _cash = parseFloat(editPdvForm.payment_cash) || 0;
              const _card = parseFloat(editPdvForm.payment_card) || 0;
              const _pix = parseFloat(editPdvForm.payment_pix) || 0;
              const _rem = _net - (_cash + _card + _pix);
              return (
                <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Valor Total</span><span className="font-semibold">{formatCurrency(_net)}</span></div>
                  <div className="border-t border-border pt-1 flex justify-between">
                    <span className="font-medium">Restante a informar</span>
                    <span className={`font-bold ${Math.abs(_rem) < 0.01 ? "text-primary" : "text-destructive"}`}>{formatCurrency(_rem)}</span>
                  </div>
                </div>
              );
            })()}

            <div className="border border-amber-500/30 rounded-xl p-3 bg-amber-500/5 space-y-1.5">
              <Label className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Data da Venda (Retroativa)
              </Label>
              <p className="text-[11px] text-muted-foreground">Altere a data caso o lançamento precise ser corrigido.</p>
              <Input
                type="date"
                value={editPdvForm.retro_date}
                onChange={e => setEditPdvForm({ ...editPdvForm, retro_date: e.target.value })}
                className="h-10 border-amber-500/30"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditPdvSale(null)}>Cancelar</Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Vendas;
