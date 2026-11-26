import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Users, Phone, Mail, MapPin, ShoppingBag, Wrench, Plus, Pencil, Trash2, History } from "lucide-react";
import CustomerForm from "@/components/CustomerForm";
import type { Tables } from "@/integrations/supabase/types";
import type { Product, Sale, ServiceOrder, TablesInsert } from "@/types/db";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const emptyForm = { name: "", phone: "", email: "", cpf: "", address: "", notes: "", birth_date: "" };

const Clientes = () => {
  const { user, activeStoreId } = useAuth();
  const [customers, setCustomers] = useState<Tables<"customers">[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [products, setProducts] = useState<Pick<Product, "id" | "name">[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Tables<"customers"> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Tables<"customers"> | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedOS, setSelectedOS] = useState<ServiceOrder | null>(null);

  const fetchData = async () => {
    if (!activeStoreId) return;
    
    // Filtro de loja para clientes (se a coluna existir)
    let customersQuery = supabase.from("customers").select("*").order("created_at", { ascending: false });
    let salesQuery = supabase.from("sales").select("*");
    let ordersQuery = supabase.from("service_orders").select("*");
    let productsQuery = supabase.from("products").select("id, name");
    
    if (activeStoreId !== "all") {
      salesQuery = salesQuery.eq("store_id", activeStoreId);
      ordersQuery = ordersQuery.eq("store_id", activeStoreId);
      productsQuery = productsQuery.eq("store_id", activeStoreId);
    }

    const [custRes, salesRes, ordersRes, prodsRes] = await Promise.all([
      customersQuery,
      salesQuery,
      ordersQuery,
      productsQuery,
    ]);
    setCustomers(custRes.data ?? []);
    setSales(salesRes.data ?? []);
    setOrders(ordersRes.data ?? []);
    setProducts(prodsRes.data ?? []);
  };

  useEffect(() => { fetchData(); }, [activeStoreId]);

  const productMap = new Map(products.map((p) => [p.id, p.name]));

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(search)) ||
      (c.cpf && c.cpf.includes(search)) ||
      (c.email && c.email.toLowerCase().includes(q));
  });

  const getCustomerSales = (customer: Tables<"customers">) =>
    sales.filter((s) =>
      (s.customer_name && s.customer_name.toLowerCase() === customer.name.toLowerCase()) ||
      (s.customer_phone && customer.phone && s.customer_phone === customer.phone)
    );

  const getCustomerOrders = (customer: Tables<"customers">) =>
    orders.filter((o) =>
      o.customer_id === customer.id ||
      (o.customer_name && o.customer_name.toLowerCase() === customer.name.toLowerCase()) ||
      (o.customer_phone && customer.phone && o.customer_phone === customer.phone)
    );

  const openCreate = () => {
    setEditCustomer(null);
    setDialogOpen(true);
  };

  const openEdit = (customer: Tables<"customers">) => {
    setEditCustomer(customer);
    setSelected(null);
    setDialogOpen(true);
  };

  const submitCustomer = async (formData: typeof emptyForm) => {
    if (!user) return;
    setLoading(true);

    const payload: TablesInsert<"customers"> = {
      name: formData.name,
      phone: formData.phone || null,
      email: formData.email || null,
      cpf: formData.cpf || null, 
      address: formData.address || null, 
      notes: formData.notes || null, 
      birth_date: formData.birth_date || null,
      created_by: user.id,
      store_id: activeStoreId !== "all" ? activeStoreId : null,
    };

    let error;
    if (editCustomer) {
      ({ error } = await supabase.from("customers").update(payload).eq("id", editCustomer.id));
    } else {
      ({ error } = await supabase.from("customers").insert(payload));
    }

    if (error) toast.error(error.message);
    else {
      toast.success(editCustomer ? "Cliente atualizado!" : "Cliente cadastrado!");
      setDialogOpen(false);
      fetchData();
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Cliente removido!"); setSelected(null); fetchData(); }
  };

  const handleSyncCustomers = async () => {
    setLoading(true);
    const toastId = toast.loading("Sincronizando todos os clientes...");
    
    try {
      // 1. Buscar todos os clientes atuais para conferência real
      const { data: currentCusts } = await supabase.from("customers").select("name");
      const existingNames = new Set(currentCusts?.map(c => c.name.toLowerCase().trim()) || []);

      // 2. Buscar nomes de OS e Vendas (com limite maior)
      const [osRes, salesRes] = await Promise.all([
        supabase.from("service_orders").select("customer_name, customer_phone, customer_cpf, store_id, created_by").limit(5000),
        supabase.from("sales").select("customer_name, customer_phone, customer_cpf, store_id, created_by").limit(5000)
      ]);
      
      const allLegacy = [...(osRes.data || []), ...(salesRes.data || [])];
      
      // 3. Filtrar apenas quem não existe e remover duplicatas do próprio lote
      const toAdd = new Map();
      allLegacy.forEach(legacy => {
        if (!legacy.customer_name) return;
        const cleanName = legacy.customer_name.trim();
        const lowerName = cleanName.toLowerCase();
        
        if (!existingNames.has(lowerName) && !toAdd.has(lowerName)) {
          toAdd.set(lowerName, {
            name: cleanName,
            phone: legacy.customer_phone || null,
            cpf: legacy.customer_cpf || null,
            store_id: legacy.store_id || (activeStoreId !== "all" ? activeStoreId : null),
            created_by: legacy.created_by || user?.id,
          });
        }
      });

      if (toAdd.size === 0) {
        toast.dismiss(toastId);
        toast.info("Todos os clientes já estão sincronizados!");
        return;
      }

      // 4. Inserir em lotes (para ser mais rápido e seguro)
      const entries = Array.from(toAdd.values());
      const { error } = await supabase.from("customers").insert(entries);

      if (error) {
        // Se der erro de cache (coluna store_id não encontrada), tenta de novo sem a coluna
        if (error.message.includes("schema cache") || error.message.includes("store_id")) {
          const fallbackEntries = entries.map(({ store_id, ...rest }) => rest);
          const { error: fallbackError } = await supabase.from("customers").insert(fallbackEntries);
          
          if (fallbackError) throw fallbackError;
          
          toast.dismiss(toastId);
          toast.success(`${entries.length} novos clientes sincronizados (Modo de Segurança)!`);
          fetchData();
          return;
        }
        throw error;
      }

      toast.dismiss(toastId);
      toast.success(`${entries.length} novos clientes sincronizados!`);
      fetchData();
    } catch (err) {
      toast.dismiss(toastId);
      toast.error("Erro na sincronização: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{customers.length} clientes cadastrados</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 h-10 border-primary/30 text-primary hover:bg-primary/10" onClick={handleSyncCustomers} disabled={loading}>
            <History className="h-4 w-4" /> Sincronizar
          </Button>
          <Button className="gap-2 h-10" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo Cliente
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone, CPF ou e-mail..." className="pl-9 h-10" />
      </div>

      <div className="space-y-2">
        {filtered.length > 0 ? (
          filtered.map((customer) => {
            const custSales = getCustomerSales(customer);
            const custOrders = getCustomerOrders(customer);
            return (
              <Card key={customer.id} className="border-border/50 shadow-lg shadow-black/10 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setSelected(customer)}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{customer.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {customer.phone && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" /> {customer.phone}</span>}
                        {customer.cpf && <span className="text-[10px] text-muted-foreground">{customer.cpf}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {custSales.length > 0 && <Badge variant="outline" className="text-[10px] bg-primary/15 text-primary border-primary/20">{custSales.length} venda{custSales.length > 1 ? "s" : ""}</Badge>}
                    {custOrders.length > 0 && <Badge variant="outline" className="text-[10px] bg-accent/15 text-accent border-accent/20">{custOrders.length} OS</Badge>}
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="h-10 w-10 mb-3 opacity-30" />
              <p className="font-medium text-sm">Nenhum cliente encontrado</p>
              <p className="text-xs mt-1">Cadastre seu primeiro cliente</p>
            </CardContent>
          </Card>
        )}
      </div>

          {/* Dialog cadastro/edição */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">{editCustomer ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
              </DialogHeader>
              <CustomerForm
                initialData={editCustomer ? {
                  name: editCustomer.name,
                  phone: editCustomer.phone || "",
                  email: editCustomer.email || "",
                  cpf: editCustomer.cpf || "",
                  address: editCustomer.address || "",
                  notes: editCustomer.notes || "",
                  birth_date: editCustomer.birth_date || "",
                } : emptyForm}
                onSubmit={submitCustomer}
                loading={loading}
                close={() => setDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>

      {/* Dialog detalhe */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          {selected && (() => {
            const custSales = getCustomerSales(selected);
            const custOrders = getCustomerOrders(selected);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display">{selected.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEdit(selected)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleDelete(selected.id)}>
                      <Trash2 className="h-3.5 w-3.5" /> Remover
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    {selected.phone && <p className="text-sm flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /> {selected.phone}</p>}
                    {selected.email && <p className="text-sm flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> {selected.email}</p>}
                    {selected.address && <p className="text-sm flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /> {selected.address}</p>}
                    {selected.cpf && <p className="text-sm text-muted-foreground">CPF: {selected.cpf}</p>}
                    {selected.birth_date && (
                      <p className="text-sm text-muted-foreground">
                        Nascimento: {new Date(selected.birth_date + "T00:00:00").toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <ShoppingBag className="h-3 w-3" /> Histórico de Compras ({custSales.length})
                    </p>
                    {custSales.length > 0 ? custSales.map((sale) => (
                      <div 
                        key={sale.id} 
                        className="rounded-lg bg-muted/50 p-2.5 text-xs cursor-pointer hover:bg-muted transition-colors border border-transparent hover:border-primary/20"
                        onClick={() => setSelectedSale(sale)}
                      >
                        <div className="flex justify-between">
                          <span className="font-medium">{productMap.get(sale.product_id) || "Produto"}</span>
                          <span className="font-bold text-primary">{formatCurrency(Number(sale.sale_price))}</span>
                        </div>
                        <p className="text-muted-foreground mt-0.5">{new Date(sale.created_at).toLocaleDateString("pt-BR")}</p>
                      </div>
                    )) : <p className="text-xs text-muted-foreground">Nenhuma compra registrada</p>}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Wrench className="h-3 w-3" /> Ordens de Serviço ({custOrders.length})
                    </p>
                    {custOrders.length > 0 ? custOrders.map((order) => (
                      <div 
                        key={order.id} 
                        className="rounded-lg bg-muted/50 p-2.5 text-xs cursor-pointer hover:bg-muted transition-colors border border-transparent hover:border-accent/20"
                        onClick={() => setSelectedOS(order)}
                      >
                        <div className="flex justify-between">
                          <span className="font-medium">OS #{order.order_number} - {order.device_brand} {order.device_model}</span>
                          <Badge variant="outline" className="text-[10px]">{order.status}</Badge>
                        </div>
                        <p className="text-muted-foreground mt-0.5">{order.requested_service} · {new Date(order.created_at).toLocaleDateString("pt-BR")}</p>
                      </div>
                    )) : <p className="text-xs text-muted-foreground">Nenhuma OS registrada</p>}
                  </div>

                  {selected.notes && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Observações</p>
                      <p className="text-sm mt-1">{selected.notes}</p>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialog Detalhe Venda */}
      <Dialog open={!!selectedSale} onOpenChange={(open) => !open && setSelectedSale(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Detalhes da Venda</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="rounded-lg bg-primary/10 p-4 border border-primary/20">
                <p className="text-xs text-primary font-semibold uppercase tracking-wider">Produto</p>
                <p className="text-lg font-bold">{productMap.get(selectedSale.product_id) || "Aparelho"}</p>
                <p className="text-2xl font-black mt-2 text-primary">{formatCurrency(Number(selectedSale.sale_price))}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase">Data da Venda</p>
                  <p className="font-medium">{new Date(selectedSale.created_at).toLocaleString("pt-BR")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase">Loja</p>
                  <p className="font-medium">Santa Luzia</p>
                </div>
              </div>

              {selectedSale.notes && (
                <div>
                  <p className="text-muted-foreground text-xs uppercase">Observações</p>
                  <p className="text-sm italic">"{selectedSale.notes}"</p>
                </div>
              )}
              
              <div className="pt-2">
                <Button className="w-full gap-2" variant="outline" onClick={() => window.location.href = '/vendas'}>
                  Ir para página de Vendas
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Detalhe OS */}
      <Dialog open={!!selectedOS} onOpenChange={(open) => !open && setSelectedOS(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Ordem de Serviço #{selectedOS?.order_number}</DialogTitle>
          </DialogHeader>
          {selectedOS && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Badge className="text-xs px-3 py-1 uppercase">{selectedOS.status}</Badge>
                <p className="text-sm text-muted-foreground">{new Date(selectedOS.created_at).toLocaleDateString("pt-BR")}</p>
              </div>

              <div className="rounded-lg bg-accent/10 p-4 border border-accent/20">
                <p className="text-xs text-accent font-semibold uppercase tracking-wider">Aparelho</p>
                <p className="text-lg font-bold">{selectedOS.device_brand} {selectedOS.device_model}</p>
                <p className="text-sm text-muted-foreground mt-1">IMEI: {selectedOS.device_imei || "Não informado"}</p>
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-muted-foreground text-xs uppercase">Serviço Realizado</p>
                  <p className="text-sm font-medium">{selectedOS.requested_service}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase">Valor do Serviço</p>
                  <p className="text-xl font-bold text-accent">{formatCurrency(Number(selectedOS.final_price || selectedOS.estimated_price || 0))}</p>
                </div>
              </div>

              <div className="pt-2">
                <Button className="w-full gap-2" variant="outline" onClick={() => window.location.href = '/ordens-servico'}>
                  Ir para Ordens de Serviço
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Clientes;
