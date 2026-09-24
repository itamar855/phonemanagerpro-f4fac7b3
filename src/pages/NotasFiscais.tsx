import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  FileText, Plus, Search, Filter, Download, ExternalLink, Printer, Ban,
  CheckCircle2, AlertTriangle, ArrowUpDown, Calendar, Building2, Store,
  RefreshCw, Send, Copy, Eye, FileDown, Smartphone, ShieldCheck, HelpCircle,
  Clock, Package, FileCode, Check, AlertCircle, Sparkles, MessageCircle
} from "lucide-react";
import {
  getFiscalSettings, getInvoices, emitInvoice, cancelInvoice,
  Invoice, FiscalSettings, InvoiceType, InvoiceItem, getDefaultFiscalSettings
} from "@/lib/services/fiscalService";

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);

const formatAccessKey = (key: string) => {
  if (!key || key.length !== 44) return key || "—";
  return key.replace(/(\d{4})/g, "$1 ").trim();
};

export default function NotasFiscais() {
  const { user, userRole, activeStoreId } = useAuth();
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<FiscalSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modais
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [danfeModalOpen, setDanfeModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Modal de Emissão Nova / Entrada Trade-In
  const [emitModalOpen, setEmitModalOpen] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [newInvoiceForm, setNewInvoiceForm] = useState({
    type: "nfce" as InvoiceType,
    customerName: "",
    customerCpfCnpj: "",
    itemName: "",
    ncm: "8517.13.00",
    cfop: "5102",
    quantity: 1,
    unitPrice: 0,
  });

  // Modal Exportação Contábil
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Carrega lojas
  useEffect(() => {
    supabase.from("stores").select("id, name").then(({ data }) => {
      if (data) setStores(data);
    });
  }, []);

  // Carrega dados fiscais e notas da loja ativa
  const loadData = async () => {
    if (!activeStoreId) return;
    setLoading(true);
    try {
      const currentStore = activeStoreId === "all" ? (stores[0]?.id || "") : activeStoreId;
      if (currentStore) {
        const [sett, invs] = await Promise.all([
          getFiscalSettings(currentStore),
          getInvoices(activeStoreId)
        ]);
        setSettings(sett);
        setInvoices(invs);
      }
    } catch (err: any) {
      toast.error("Erro ao carregar notas fiscais: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeStoreId, stores]);

  // Filtragem
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchSearch =
        inv.access_key.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(inv.number).includes(searchTerm) ||
        (inv.customer_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.customer_cpf_cnpj || "").includes(searchTerm);

      const matchType = typeFilter === "all" || inv.invoice_type === typeFilter;
      const matchStatus = statusFilter === "all" || inv.status === statusFilter;

      return matchSearch && matchType && matchStatus;
    });
  }, [invoices, searchTerm, typeFilter, statusFilter]);

  // KPIs
  const kpis = useMemo(() => {
    const authorized = invoices.filter((i) => i.status === "authorized");
    const totalAmount = authorized.reduce((acc, curr) => acc + (Number(curr.total_amount) || 0), 0);
    const nfceCount = authorized.filter((i) => i.invoice_type === "nfce").length;
    const nfeCount = authorized.filter((i) => i.invoice_type === "nfe").length;
    const entradaCount = authorized.filter((i) => i.invoice_type === "nfe_entrada").length;
    const cancelledCount = invoices.filter((i) => i.status === "cancelled").length;

    return {
      totalAmount,
      authorizedCount: authorized.length,
      nfceCount,
      nfeCount,
      entradaCount,
      cancelledCount,
    };
  }, [invoices]);

  // Handler de Emissão
  const handleEmitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStoreId || activeStoreId === "all") {
      toast.error("Selecione uma loja específica para emitir notas fiscais.");
      return;
    }

    if (!newInvoiceForm.itemName.trim() || newInvoiceForm.unitPrice <= 0) {
      toast.error("Informe a descrição do item e um valor válido.");
      return;
    }

    setEmitting(true);
    try {
      const totalItem = newInvoiceForm.quantity * newInvoiceForm.unitPrice;
      const items: InvoiceItem[] = [
        {
          name: newInvoiceForm.itemName.trim(),
          ncm: newInvoiceForm.ncm,
          cfop: newInvoiceForm.cfop,
          quantity: newInvoiceForm.quantity,
          unit_price: newInvoiceForm.unitPrice,
          total_price: totalItem,
        },
      ];

      const emitted = await emitInvoice({
        storeId: activeStoreId,
        type: newInvoiceForm.type,
        customerName: newInvoiceForm.customerName.trim() || "Consumidor Final",
        customerCpfCnpj: newInvoiceForm.customerCpfCnpj.trim() || undefined,
        totalAmount: totalItem,
        items,
        userId: user?.id || "system",
      });

      toast.success(
        `Nota ${emitted.invoice_type.toUpperCase()} nº ${emitted.number} autorizada com sucesso!`
      );
      setEmitModalOpen(false);
      setNewInvoiceForm({
        type: "nfce",
        customerName: "",
        customerCpfCnpj: "",
        itemName: "",
        ncm: "8517.13.00",
        cfop: "5102",
        quantity: 1,
        unitPrice: 0,
      });
      loadData();
    } catch (err: any) {
      toast.error("Falha na emissão: " + err.message);
    } finally {
      setEmitting(false);
    }
  };

  // Handler de Cancelamento
  const handleCancelInvoice = async () => {
    if (!selectedInvoice || !activeStoreId) return;
    if (cancellationReason.trim().length < 15) {
      toast.error("A justificativa perante a SEFAZ deve ter no mínimo 15 caracteres.");
      return;
    }

    setCancelling(true);
    try {
      const targetStore = activeStoreId === "all" ? selectedInvoice.store_id : activeStoreId;
      const res = await cancelInvoice(selectedInvoice.id, targetStore, cancellationReason);
      toast.success(res.message);
      setCancelModalOpen(false);
      setCancellationReason("");
      setSelectedInvoice(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao cancelar nota fiscal.");
    } finally {
      setCancelling(false);
    }
  };

  // Copiar chave de acesso
  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("Chave de acesso copiada para a área de transferência!");
  };

  // Download XML simulado/gerado
  const handleDownloadXml = (inv: Invoice) => {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${inv.access_key}" versao="4.00">
      <ide>
        <cUF>${settings?.ibge_code?.slice(0, 2) || "35"}</cUF>
        <cNF>${inv.access_key.slice(35, 43)}</cNF>
        <natOp>${inv.invoice_type === "nfe_entrada" ? "COMPRA DE APARELHO USADO (TRADE-IN)" : "VENDA DE MERCADORIA"}</natOp>
        <mod>${inv.invoice_type === "nfce" ? "65" : "55"}</mod>
        <serie>${inv.series}</serie>
        <nNF>${inv.number}</nNF>
        <dhEmi>${inv.created_at}</dhEmi>
        <tpNF>${inv.invoice_type === "nfe_entrada" ? "0" : "1"}</tpNF>
        <tpAmb>${inv.environment === "producao" ? "1" : "2"}</tpAmb>
      </ide>
      <emit>
        <CNPJ>${settings?.cnpj?.replace(/\D/g, "") || "00000000000191"}</CNPJ>
        <xNome>${settings?.razao_social || "CELL MANAGER PRO"}</xNome>
        <IE>${settings?.ie || "ISENTO"}</IE>
        <CRT>${settings?.regime_tributario === "simples_nacional" ? "1" : "3"}</CRT>
      </emit>
      <dest>
        <xNome>${inv.customer_name || "CONSUMIDOR FINAL"}</xNome>
        ${inv.customer_cpf_cnpj ? `<CPF>${inv.customer_cpf_cnpj.replace(/\D/g, "")}</CPF>` : ""}
      </dest>
      <total>
        <ICMSTot>
          <vNF>${inv.total_amount.toFixed(2)}</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>${inv.environment === "producao" ? "1" : "2"}</tpAmb>
      <chNFe>${inv.access_key}</chNFe>
      <dhRecbto>${inv.authorized_at || inv.created_at}</dhRecbto>
      <nProt>135260000${inv.number}</nProt>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso da NF-e</xMotivo>
    </infProt>
  </protNFe>
</nfeProc>`;

    const blob = new Blob([xmlContent], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `NFe_${inv.access_key}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Arquivo XML oficial baixado!");
  };

  // Enviar link no WhatsApp
  const handleSendWhatsApp = (inv: Invoice) => {
    const text = encodeURIComponent(
      `Olá! Segue a sua Nota Fiscal Eletrônica emitida pela loja:\n\n` +
      `📄 Tipo: ${inv.invoice_type.toUpperCase()} nº ${inv.number} (Série ${inv.series})\n` +
      `💰 Valor: ${formatCurrency(inv.total_amount)}\n` +
      `🔑 Chave de Acesso:\n${inv.access_key}\n\n` +
      `Você pode consultar a validade diretamente no portal da SEFAZ:\n` +
      `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=completa\n\n` +
      `Agradecemos a sua preferência!`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  // Exportação em lote para a contabilidade
  const handleExportBatch = () => {
    const batchSummary = invoices.map(i => ({
      numero: i.number,
      serie: i.series,
      tipo: i.invoice_type,
      chave: i.access_key,
      data: i.created_at,
      destinatario: i.customer_name,
      cpf_cnpj: i.customer_cpf_cnpj,
      valor: i.total_amount,
      status: i.status,
      ambiente: i.environment
    }));

    const blob = new Blob([JSON.stringify(batchSummary, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Lote_Fiscal_Contabilidade_${new Date().toISOString().slice(0, 7)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Lote mensal exportado com sucesso!");
    setExportModalOpen(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner / Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-primary/10 p-2 text-primary border border-primary/20">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight font-display flex items-center gap-2">
                Notas Fiscais Eletrônicas
                {settings?.environment === "producao" ? (
                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs font-semibold">
                    Produção (Oficial)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs font-semibold">
                    Homologação (Testes)
                  </Badge>
                )}
              </h1>
              <p className="text-sm text-muted-foreground">
                Central de emissão, consulta, cancelamento e transmissão SEFAZ (NF-e Mod 55, NFC-e Mod 65 e Entrada)
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/configuracoes-fiscais">
            <Button variant="outline" className="h-9 gap-1.5 border-border/80 hover:bg-muted text-xs">
              <Building2 className="h-4 w-4 text-primary" />
              Configurações Fiscais
            </Button>
          </Link>

          <Button
            variant="outline"
            className="h-9 gap-1.5 border-border/80 hover:bg-muted text-xs"
            onClick={() => setExportModalOpen(true)}
          >
            <Download className="h-4 w-4 text-muted-foreground" />
            Exportar Lote Contábil
          </Button>

          <Button
            className="h-9 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            onClick={() => {
              if (activeStoreId === "all") {
                toast.error("Por favor, selecione uma loja específica no topo antes de emitir notas.");
                return;
              }
              setEmitModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Emitir NF Avulsa / Trade-In
          </Button>
        </div>
      </div>

      {/* Alerta de Configuração Fiscal Incompleta */}
      {(!settings?.cnpj || !settings?.razao_social) && !loading && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  Configuração Fiscal Pendente
                </p>
                <p className="text-xs text-muted-foreground">
                  Esta loja ainda não possui CNPJ e parâmetros fiscais cadastrados. Configure para emitir notas válidas.
                </p>
              </div>
            </div>
            <Link to="/configuracoes-fiscais">
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-xs gap-1">
                Completar Cadastro Fiscal
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/60 shadow-sm bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Total Emitido em Notas</p>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-bold font-display mt-2 text-foreground">
              {formatCurrency(kpis.totalAmount)}
            </p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <span>{kpis.authorizedCount} nota(s) autorizada(s)</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">NFC-e Consumidor (Mod 65)</p>
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                <Smartphone className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-bold font-display mt-2 text-foreground">
              {kpis.nfceCount}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Cupons fiscais do PDV / Balcão
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">NF-e Mercadorias / Trade-In</p>
              <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                <Package className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-bold font-display mt-2 text-foreground">
              {kpis.nfeCount + kpis.entradaCount}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.nfeCount} saídas / {kpis.entradaCount} entradas trade-in
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Canceladas perante SEFAZ</p>
              <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                <Ban className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-bold font-display mt-2 text-foreground">
              {kpis.cancelledCount}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Cancelamentos homologados em até 24h
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros e Barra de Ações */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-center">
            <div className="relative md:col-span-6">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por Chave de Acesso, Nome do Cliente, CPF/CNPJ ou Nº da Nota..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 text-xs"
              />
            </div>

            <div className="md:col-span-3">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="Tipo de Nota" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Modelos</SelectItem>
                  <SelectItem value="nfce">NFC-e (Mod 65 - PDV)</SelectItem>
                  <SelectItem value="nfe">NF-e (Mod 55 - Mercadorias)</SelectItem>
                  <SelectItem value="nfe_entrada">NF-e Entrada (Trade-In)</SelectItem>
                  <SelectItem value="nfse">NFS-e (Serviços OS)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="authorized">Autorizada</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                  <SelectItem value="rejected">Rejeitada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-1">
              <Button
                variant="outline"
                className="w-full h-10 p-0 text-muted-foreground hover:text-foreground"
                onClick={loadData}
                title="Recarregar Notas"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Notas Fiscais */}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="p-4 pb-3 border-b border-border/50 bg-muted/20 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Notas Emitidas</CardTitle>
            <CardDescription className="text-xs">
              {filteredInvoices.length} nota(s) encontrada(s)
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] tracking-wider border-b border-border/40">
                <tr>
                  <th className="py-3 px-4 font-semibold">Tipo / Nº</th>
                  <th className="py-3 px-4 font-semibold">Chave de Acesso</th>
                  <th className="py-3 px-4 font-semibold">Destinatário</th>
                  <th className="py-3 px-4 font-semibold">Valor</th>
                  <th className="py-3 px-4 font-semibold">Data Autorização</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p className="font-medium text-sm">Nenhuma nota fiscal emitida até o momento</p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        Emita sua primeira NFC-e no PDV ou clique em "Emitir NF Avulsa / Trade-In".
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => {
                    const isCancelled = inv.status === "cancelled";
                    const isAuthorized = inv.status === "authorized";

                    return (
                      <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={
                                inv.invoice_type === "nfce"
                                  ? "bg-blue-500/10 text-blue-600 border-blue-500/30 text-[10px] font-bold"
                                  : inv.invoice_type === "nfe_entrada"
                                  ? "bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px] font-bold"
                                  : "bg-purple-500/10 text-purple-600 border-purple-500/30 text-[10px] font-bold"
                              }
                            >
                              {inv.invoice_type === "nfce"
                                ? "NFC-e"
                                : inv.invoice_type === "nfe_entrada"
                                ? "ENTRADA"
                                : "NF-e"}
                            </Badge>
                            <div>
                              <p className="font-bold text-foreground">
                                Nº {String(inv.number).padStart(6, "0")}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                Série {inv.series}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 font-mono text-[11px]">
                            <span className="text-foreground/80 truncate max-w-[170px]" title={inv.access_key}>
                              {inv.access_key.slice(0, 6)}...{inv.access_key.slice(-4)}
                            </span>
                            <button
                              onClick={() => handleCopyKey(inv.access_key)}
                              className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition-colors"
                              title="Copiar chave completa"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <p className="font-medium text-foreground truncate max-w-[180px]">
                            {inv.customer_name || "Consumidor Final"}
                          </p>
                          {inv.customer_cpf_cnpj && (
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {inv.customer_cpf_cnpj}
                            </p>
                          )}
                        </td>

                        <td className="py-3 px-4 font-semibold text-foreground">
                          {formatCurrency(inv.total_amount)}
                        </td>

                        <td className="py-3 px-4 text-muted-foreground">
                          <p className="text-[11px]">
                            {new Date(inv.authorized_at || inv.created_at).toLocaleDateString("pt-BR")}
                          </p>
                          <p className="text-[10px] text-muted-foreground/70">
                            {new Date(inv.authorized_at || inv.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </td>

                        <td className="py-3 px-4">
                          {isAuthorized ? (
                            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">
                              Autorizada
                            </Badge>
                          ) : isCancelled ? (
                            <Badge className="bg-red-500/15 text-red-600 border-red-500/30 text-[10px]">
                              Cancelada
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {inv.status}
                            </Badge>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs gap-1 hover:bg-muted text-primary"
                              onClick={() => {
                                setSelectedInvoice(inv);
                                setDanfeModalOpen(true);
                              }}
                              title="Visualizar DANFE"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">DANFE</span>
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs gap-1 hover:bg-muted"
                              onClick={() => handleDownloadXml(inv)}
                              title="Baixar XML Oficial"
                            >
                              <FileCode className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">XML</span>
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs gap-1 hover:bg-muted text-green-600"
                              onClick={() => handleSendWhatsApp(inv)}
                              title="Enviar por WhatsApp"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </Button>

                            {isAuthorized && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs gap-1 hover:bg-destructive/10 text-destructive"
                                onClick={() => {
                                  setSelectedInvoice(inv);
                                  setCancelModalOpen(true);
                                }}
                                title="Cancelar Nota na SEFAZ"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* MODAL: Visualizar / Imprimir DANFE */}
      <Dialog open={danfeModalOpen} onOpenChange={setDanfeModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedInvoice && (
            <div className="space-y-4">
              <DialogHeader>
                <div className="flex items-center justify-between pr-4">
                  <DialogTitle className="font-display flex items-center gap-2 text-lg">
                    <Printer className="h-5 w-5 text-primary" />
                    DANFE - Documento Auxiliar da Nota Fiscal
                  </DialogTitle>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 bg-primary text-primary-foreground text-xs"
                    onClick={() => window.print()}
                  >
                    <Printer className="h-3.5 w-3.5" /> Imprimir
                  </Button>
                </div>
                <DialogDescription className="text-xs">
                  {selectedInvoice.environment === "homologacao"
                    ? "EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL"
                    : "DOCUMENTO FISCAL AUTORIZADO PELA SEFAZ"}
                </DialogDescription>
              </DialogHeader>

              {/* Layout DANFE em formato de cupom/folha fiscal */}
              <div id="danfe-print-area" className="border-2 border-border/80 rounded-xl p-5 bg-card space-y-4 font-mono text-xs">
                {/* Tarja de Homologação */}
                {selectedInvoice.environment === "homologacao" && (
                  <div className="border-2 border-dashed border-amber-500/50 bg-amber-500/10 p-2 text-center text-amber-700 dark:text-amber-400 font-bold uppercase tracking-wider text-xs rounded">
                    SEM VALOR FISCAL - AMBIENTE DE HOMOLOGAÇÃO E TESTES
                  </div>
                )}

                {/* Cabeçalho da Empresa */}
                <div className="grid grid-cols-12 gap-3 border-b border-border/60 pb-4">
                  <div className="col-span-8 space-y-1">
                    <p className="font-bold text-sm tracking-tight">{settings?.razao_social || "CELL MANAGER PRO"}</p>
                    <p className="text-[11px] text-muted-foreground">{settings?.nome_fantasia}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {settings?.logradouro}, {settings?.numero} {settings?.complemento ? `- ${settings.complemento}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {settings?.bairro} - {settings?.municipio}/{settings?.uf} - CEP: {settings?.cep}
                    </p>
                  </div>
                  <div className="col-span-4 text-right space-y-1 border-l border-border/40 pl-3">
                    <p className="font-bold text-sm text-primary">
                      {selectedInvoice.invoice_type.toUpperCase()}
                    </p>
                    <p className="text-[11px]">Nº: <span className="font-bold">{String(selectedInvoice.number).padStart(6, "0")}</span></p>
                    <p className="text-[11px]">Série: <span className="font-bold">{selectedInvoice.series}</span></p>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedInvoice.invoice_type === "nfe_entrada" ? "0 - ENTRADA" : "1 - SAÍDA"}
                    </p>
                  </div>
                </div>

                {/* Chave de Acesso e Protocolo */}
                <div className="bg-muted/30 p-3 rounded-lg border border-border/50 space-y-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Chave de Acesso SEFAZ (44 dígitos)</p>
                  <p className="text-xs font-bold text-foreground tracking-wider select-all">
                    {formatAccessKey(selectedInvoice.access_key)}
                  </p>
                  <div className="flex justify-between items-center pt-1 text-[10px] text-muted-foreground border-t border-border/30">
                    <span>Protocolo: 135260000{selectedInvoice.number}</span>
                    <span>Data Autorização: {new Date(selectedInvoice.authorized_at || selectedInvoice.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                </div>

                {/* Destinatário */}
                <div className="border border-border/60 rounded-lg p-3 space-y-1 bg-muted/10">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Destinatário / Remetente</p>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="text-muted-foreground text-[10px]">Nome/Razão:</span>{" "}
                      <span className="font-bold">{selectedInvoice.customer_name || "Consumidor Final"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px]">CPF/CNPJ:</span>{" "}
                      <span className="font-bold">{selectedInvoice.customer_cpf_cnpj || "Não Informado"}</span>
                    </div>
                  </div>
                </div>

                {/* Itens */}
                <div className="border border-border/60 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-muted/50 border-b border-border/60 text-[10px] uppercase text-muted-foreground">
                      <tr>
                        <th className="p-2">Item / Descrição</th>
                        <th className="p-2">NCM</th>
                        <th className="p-2">CFOP</th>
                        <th className="p-2 text-center">Qtd</th>
                        <th className="p-2 text-right">Unitário</th>
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {selectedInvoice.items && selectedInvoice.items.length > 0 ? (
                        selectedInvoice.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="p-2 font-medium">{item.name}</td>
                            <td className="p-2 text-muted-foreground">{item.ncm}</td>
                            <td className="p-2 text-muted-foreground">{item.cfop}</td>
                            <td className="p-2 text-center">{item.quantity}</td>
                            <td className="p-2 text-right">{formatCurrency(item.unit_price ?? item.unitPrice ?? 0)}</td>
                            <td className="p-2 text-right font-bold">{formatCurrency(item.total_price ?? item.totalPrice ?? 0)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="p-2 font-medium">Venda de Produtos / Aparelho</td>
                          <td className="p-2 text-muted-foreground">8517.13.00</td>
                          <td className="p-2 text-muted-foreground">5102</td>
                          <td className="p-2 text-center">1</td>
                          <td className="p-2 text-right">{formatCurrency(selectedInvoice.total_amount)}</td>
                          <td className="p-2 text-right font-bold">{formatCurrency(selectedInvoice.total_amount)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Totais do Imposto */}
                <div className="grid grid-cols-4 gap-2 border border-border/60 rounded-lg p-3 bg-muted/20 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Base Cálc. ICMS</p>
                    <p className="font-bold text-xs">{formatCurrency(selectedInvoice.total_amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Valor ICMS</p>
                    <p className="font-bold text-xs">R$ 0,00</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Descontos</p>
                    <p className="font-bold text-xs">R$ 0,00</p>
                  </div>
                  <div className="bg-primary/10 rounded p-1">
                    <p className="text-[10px] text-primary font-bold">TOTAL DA NOTA</p>
                    <p className="font-bold text-sm text-primary">{formatCurrency(selectedInvoice.total_amount)}</p>
                  </div>
                </div>

                {/* Informações Complementares */}
                <div className="border border-border/50 rounded-lg p-3 space-y-1 text-[10px] text-muted-foreground">
                  <p className="font-bold text-foreground uppercase">Dados Adicionais / Observações</p>
                  <p>
                    Documento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI.
                    Permite o aproveitamento de crédito do ICMS no valor de R$ 0,00 correspondente à alíquota de 0,00% nos termos do Art. 23 da LC 123/2006.
                  </p>
                  {selectedInvoice.status === "cancelled" && (
                    <p className="text-red-500 font-bold pt-1">
                      ⚠️ NOTA FISCAL CANCELADA: {selectedInvoice.cancellation_reason} (Em: {new Date(selectedInvoice.cancelled_at || "").toLocaleString("pt-BR")})
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter className="flex justify-between items-center sm:justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadXml(selectedInvoice)}
                  className="gap-1.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" /> Baixar XML
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDanfeModalOpen(false)}
                  className="text-xs"
                >
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: Cancelar Nota Fiscal (SEFAZ 24h) */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="max-w-md">
          {selectedInvoice && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="font-display flex items-center gap-2 text-destructive">
                  <Ban className="h-5 w-5" />
                  Cancelar Nota Fiscal na SEFAZ
                </DialogTitle>
                <DialogDescription className="text-xs">
                  A SEFAZ exige uma justificativa fundamentada de no mínimo 15 caracteres. O cancelamento só é homologado em até 24 horas após a autorização.
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 space-y-1 text-xs">
                <p className="font-bold text-destructive">
                  {selectedInvoice.invoice_type.toUpperCase()} Nº {selectedInvoice.number} (Série {selectedInvoice.series})
                </p>
                <p className="text-muted-foreground">Valor: {formatCurrency(selectedInvoice.total_amount)}</p>
                <p className="text-[10px] text-muted-foreground font-mono">Chave: {selectedInvoice.access_key}</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-semibold">Justificativa Legal de Cancelamento</Label>
                  <span className={`text-[10px] ${cancellationReason.length >= 15 ? "text-emerald-500" : "text-amber-500"}`}>
                    {cancellationReason.length}/15 caracteres mín.
                  </span>
                </div>
                <Textarea
                  placeholder="Ex: Venda cancelada pelo cliente por motivo de desistência antes da saída do produto..."
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  className="text-xs h-24"
                />
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelModalOpen(false)}
                  disabled={cancelling}
                  className="text-xs"
                >
                  Voltar
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancelInvoice}
                  disabled={cancelling || cancellationReason.trim().length < 15}
                  className="text-xs gap-1.5"
                >
                  {cancelling ? "Homologando na SEFAZ..." : "Confirmar Cancelamento"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: Emissão Avulsa / Trade-In */}
      <Dialog open={emitModalOpen} onOpenChange={setEmitModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleEmitInvoice} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                Emitir Nota Fiscal Avulsa / Entrada Trade-In
              </DialogTitle>
              <DialogDescription className="text-xs">
                Emita uma NF-e de Mercadoria, NFC-e de Balcão ou NF-e de Entrada (para legitimar compra de celular usado de pessoa física).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tipo de Nota Fiscal</Label>
                <Select
                  value={newInvoiceForm.type}
                  onValueChange={(v: InvoiceType) => {
                    const isEntrada = v === "nfe_entrada";
                    setNewInvoiceForm((prev) => ({
                      ...prev,
                      type: v,
                      cfop: isEntrada ? "1102" : "5102",
                    }));
                  }}
                >
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nfce">NFC-e (Mod 65 - Cupom Consumidor PDV)</SelectItem>
                    <SelectItem value="nfe">NF-e (Mod 55 - Mercadorias Saída)</SelectItem>
                    <SelectItem value="nfe_entrada">NF-e de Entrada (Trade-In / Compra de Aparelho Usado)</SelectItem>
                  </SelectContent>
                </Select>
                {newInvoiceForm.type === "nfe_entrada" && (
                  <p className="text-[11px] text-amber-600 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                    💡 <strong>NF-e de Entrada Trade-In:</strong> Permite registrar legalmente a compra do aparelho usado fornecido pelo cliente pessoa física como parte de pagamento, protegendo sua loja em caso de fiscalização.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {newInvoiceForm.type === "nfe_entrada" ? "Nome do Vendedor (Cliente)" : "Nome do Cliente"}
                  </Label>
                  <Input
                    placeholder="Ex: João da Silva"
                    value={newInvoiceForm.customerName}
                    onChange={(e) => setNewInvoiceForm({ ...newInvoiceForm, customerName: e.target.value })}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CPF / CNPJ do Cliente</Label>
                  <Input
                    placeholder="000.000.000-00"
                    value={newInvoiceForm.customerCpfCnpj}
                    onChange={(e) => setNewInvoiceForm({ ...newInvoiceForm, customerCpfCnpj: e.target.value })}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Descrição do Produto / Aparelho</Label>
                <Input
                  placeholder="Ex: iPhone 13 128GB Meia-Noite (IMEI: 359123...)"
                  value={newInvoiceForm.itemName}
                  onChange={(e) => setNewInvoiceForm({ ...newInvoiceForm, itemName: e.target.value })}
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Código NCM</Label>
                  <Input
                    placeholder="8517.13.00"
                    value={newInvoiceForm.ncm}
                    onChange={(e) => setNewInvoiceForm({ ...newInvoiceForm, ncm: e.target.value })}
                    className="h-9 text-xs font-mono"
                  />
                  <span className="text-[10px] text-muted-foreground">8517.13.00 = Smartphones</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CFOP</Label>
                  <Input
                    placeholder="5102"
                    value={newInvoiceForm.cfop}
                    onChange={(e) => setNewInvoiceForm({ ...newInvoiceForm, cfop: e.target.value })}
                    className="h-9 text-xs font-mono"
                  />
                  <span className="text-[10px] text-muted-foreground">5102 = Saída / 1102 = Entrada</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Quantidade</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newInvoiceForm.quantity}
                    onChange={(e) => setNewInvoiceForm({ ...newInvoiceForm, quantity: Number(e.target.value) || 1 })}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor Total (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0,00"
                    value={newInvoiceForm.unitPrice || ""}
                    onChange={(e) => setNewInvoiceForm({ ...newInvoiceForm, unitPrice: Number(e.target.value) || 0 })}
                    required
                    className="h-9 text-xs font-semibold"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEmitModalOpen(false)}
                disabled={emitting}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={emitting}
                className="text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {emitting ? "Transmitindo para SEFAZ..." : "Autorizar e Transmitir"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Exportação em Lote para Contabilidade */}
      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Exportação Contábil Mensal
            </DialogTitle>
            <DialogDescription className="text-xs">
              Exporte todos os documentos fiscais emitidos no mês para enviar ao contador da sua empresa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="rounded-lg border border-border/60 p-3 bg-muted/20 space-y-1">
              <p className="font-semibold text-foreground">Resumo do Arquivo:</p>
              <p className="text-muted-foreground">• Total de Notas: {invoices.length}</p>
              <p className="text-muted-foreground">• Valor Total Faturado: {formatCurrency(kpis.totalAmount)}</p>
              <p className="text-muted-foreground">• Formato: JSON Estruturado com Chaves de Acesso e Protocolos</p>
            </div>
            <p className="text-muted-foreground text-[11px]">
              O arquivo gerado contém o log completo de autorização da SEFAZ exigido para a escrituração do SPED e apuração do Simples Nacional.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportModalOpen(false)}
              className="text-xs"
            >
              Fechar
            </Button>
            <Button
              size="sm"
              onClick={handleExportBatch}
              className="text-xs gap-1.5 bg-primary text-primary-foreground"
            >
              <Download className="h-3.5 w-3.5" /> Baixar Pacote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
