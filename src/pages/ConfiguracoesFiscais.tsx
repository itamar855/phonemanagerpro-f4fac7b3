import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FileText, Search, Building2, MapPin, KeyRound, QrCode, ShieldCheck,
  CheckCircle2, AlertTriangle, ArrowRight, Save, Loader2, Sparkles, Store
} from "lucide-react";
import {
  fetchCnpjData, formatCnpj, sanitizeCnpj, isValidCnpj
} from "@/lib/services/cnpjService";
import {
  getFiscalSettings, saveFiscalSettings, FiscalSettings, getDefaultFiscalSettings,
  FiscalEnvironment, RegimeTributario
} from "@/lib/services/fiscalService";

export default function ConfiguracoesFiscais() {
  const { user, userRole, activeStoreId, setActiveStoreId } = useAuth();
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchingCnpj, setSearchingCnpj] = useState(false);
  const [cnpjSuccess, setCnpjSuccess] = useState(false);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [settings, setSettings] = useState<FiscalSettings>(getDefaultFiscalSettings(activeStoreId || ""));

  // Carrega lojas disponíveis
  useEffect(() => {
    supabase.from("stores").select("id, name").then(({ data }) => {
      if (data) setStores(data);
    });
  }, []);

  // Carrega configurações fiscais da loja ativa
  useEffect(() => {
    if (!activeStoreId || activeStoreId === "all") return;
    setLoading(true);
    getFiscalSettings(activeStoreId)
      .then((data) => {
        setSettings(data);
        setCnpjSuccess(Boolean(data.cnpj && data.razao_social));
      })
      .finally(() => setLoading(false));
  }, [activeStoreId]);

  // Handler de busca automática ou manual por CNPJ
  const handleSearchCnpj = async (cnpjToSearch?: string) => {
    const targetCnpj = cnpjToSearch || settings.cnpj;
    const clean = sanitizeCnpj(targetCnpj);

    if (clean.length !== 14) {
      toast.error("Informe os 14 dígitos do CNPJ para buscar.");
      return;
    }

    if (!isValidCnpj(clean)) {
      toast.error("CNPJ inválido. Verifique os dígitos informados.");
      return;
    }

    setSearchingCnpj(true);
    setCnpjSuccess(false);

    try {
      toast.loading("Consultando Receita Federal...", { id: "cnpj-search" });
      const data = await fetchCnpjData(clean);

      setSettings((prev) => ({
        ...prev,
        cnpj: data.cnpj,
        razao_social: data.razao_social,
        nome_fantasia: data.nome_fantasia || data.razao_social,
        cnae: data.cnae_fiscal,
        regime_tributario: data.opcao_pelo_simples ? "simples_nacional" : "lucro_presumido",
        logradouro: data.logradouro,
        numero: data.numero,
        complemento: data.complemento,
        bairro: data.bairro,
        cep: data.cep,
        municipio: data.municipio,
        uf: data.uf,
        ibge_code: data.codigo_ibge_municipio,
      }));

      setCnpjSuccess(true);
      toast.success("Dados da empresa carregados diretamente da Receita Federal!", { id: "cnpj-search" });
    } catch (err: any) {
      toast.error(err.message || "Erro ao consultar CNPJ.", { id: "cnpj-search" });
    } finally {
      setSearchingCnpj(false);
    }
  };

  // Salvar configurações fiscais
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStoreId || activeStoreId === "all") {
      toast.error("Selecione uma loja específica para salvar as configurações fiscais.");
      return;
    }

    if (!settings.cnpj || !settings.razao_social) {
      toast.error("Preencha o CNPJ e a Razão Social da loja.");
      return;
    }

    if (!settings.ie) {
      toast.error("Informe a Inscrição Estadual (IE) ou digite 'ISENTO'.");
      return;
    }

    setLoading(true);
    try {
      let certName = settings.certificate_filename;
      let certExp = settings.certificate_expiration;

      if (certificateFile) {
        certName = certificateFile.name;
        // Validade simulada de 1 ano para certificado A1 recém-anexado
        const expDate = new Date();
        expDate.setFullYear(expDate.getFullYear() + 1);
        certExp = expDate.toLocaleDateString("pt-BR");
      }

      await saveFiscalSettings({
        ...settings,
        certificate_filename: certName,
        certificate_expiration: certExp,
        store_id: activeStoreId,
      });

      toast.success("Configurações fiscais salvas com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao salvar configurações fiscais: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!activeStoreId || activeStoreId === "all") {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[50vh]">
        <Building2 className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
        <h2 className="text-xl font-bold font-display">Selecione uma Loja</h2>
        <p className="text-muted-foreground text-sm max-w-md mt-1 mb-4">
          As configurações fiscais (CNPJ, Certificado A1, Inscrição Estadual) são personalizadas para cada filial ou loja.
        </p>
        <Select value={activeStoreId || ""} onValueChange={(v) => setActiveStoreId(v)}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Escolha a Loja" />
          </SelectTrigger>
          <SelectContent>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">
              Configurações Fiscais
            </h1>
            <Badge variant="outline" className={settings.environment === "producao" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"}>
              {settings.environment === "producao" ? "Ambiente: Produção (Oficial)" : "Ambiente: Homologação (Testes)"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs md:text-sm mt-0.5">
            Configure emissão de NF-e, NFC-e e NFS-e para a loja: <span className="font-semibold text-foreground">{stores.find(s => s.id === activeStoreId)?.name}</span>
          </p>
        </div>

        {userRole === "admin" && stores.length > 1 && (
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-muted-foreground" />
            <Select value={activeStoreId} onValueChange={setActiveStoreId}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Bloco 1: Busca e Auto-Preenchimento por CNPJ */}
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-background shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base md:text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Auto-Preenchimento Inteligente por CNPJ
            </CardTitle>
            <CardDescription className="text-xs">
              Digite o CNPJ da sua empresa para preencher automaticamente Razão Social, Nome Fantasia, Endereço, Código IBGE e Regime Tributário.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={settings.cnpj}
                  onChange={(e) => {
                    const formatted = formatCnpj(e.target.value);
                    setSettings({ ...settings, cnpj: formatted });
                    if (sanitizeCnpj(formatted).length === 14) {
                      handleSearchCnpj(formatted);
                    }
                  }}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  className="pl-9 h-11 text-sm font-medium tracking-wide"
                />
              </div>
              <Button
                type="button"
                onClick={() => handleSearchCnpj()}
                disabled={searchingCnpj || sanitizeCnpj(settings.cnpj).length !== 14}
                className="h-11 px-5 gap-2"
              >
                {searchingCnpj ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {searchingCnpj ? "Consultando..." : "Buscar na Receita"}
              </Button>
            </div>

            {cnpjSuccess && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs animate-in fade-in-50">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Dados cadastrais sincronizados com a Receita Federal e Código IBGE preenchido!</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bloco 2: Dados da Empresa e Inscrições */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> 1. Dados da Empresa e Inscrições
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Razão Social *</Label>
              <Input
                value={settings.razao_social}
                onChange={(e) => setSettings({ ...settings, razao_social: e.target.value })}
                required
                className="h-10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Nome Fantasia</Label>
              <Input
                value={settings.nome_fantasia}
                onChange={(e) => setSettings({ ...settings, nome_fantasia: e.target.value })}
                className="h-10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Inscrição Estadual (IE) *</Label>
              <Input
                value={settings.ie}
                onChange={(e) => setSettings({ ...settings, ie: e.target.value })}
                placeholder="Ex: 123.456.789.111 ou ISENTO"
                required
                className="h-10 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Obrigatório para emissão de NF-e e NFC-e na SEFAZ</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Inscrição Municipal (IM)</Label>
              <Input
                value={settings.im || ""}
                onChange={(e) => setSettings({ ...settings, im: e.target.value })}
                placeholder="Ex: 987654 (Prefeitura)"
                className="h-10 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Necessário para emitir NFS-e de serviços de conserto/OS</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">CNAE Principal</Label>
              <Input
                value={settings.cnae || ""}
                onChange={(e) => setSettings({ ...settings, cnae: e.target.value })}
                placeholder="Ex: 9512-6/00"
                className="h-10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Regime Tributário *</Label>
              <Select
                value={settings.regime_tributario}
                onValueChange={(v: RegimeTributario) => setSettings({ ...settings, regime_tributario: v })}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simples_nacional">1 - Simples Nacional (Padrão para ME/EPP)</SelectItem>
                  <SelectItem value="simples_excesso">2 - Simples Nacional - Excesso de Sublimite</SelectItem>
                  <SelectItem value="lucro_presumido">3 - Regime Normal (Lucro Presumido)</SelectItem>
                  <SelectItem value="lucro_real">3 - Regime Normal (Lucro Real)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Bloco 3: Endereço Fiscal e IBGE */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> 2. Endereço Fiscal da Loja
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-1 space-y-1.5">
              <Label className="text-xs">CEP</Label>
              <Input
                value={settings.cep}
                onChange={(e) => setSettings({ ...settings, cep: e.target.value })}
                className="h-10 text-xs"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-xs">Logradouro / Rua</Label>
              <Input
                value={settings.logradouro}
                onChange={(e) => setSettings({ ...settings, logradouro: e.target.value })}
                className="h-10 text-xs"
              />
            </div>

            <div className="md:col-span-1 space-y-1.5">
              <Label className="text-xs">Número</Label>
              <Input
                value={settings.numero}
                onChange={(e) => setSettings({ ...settings, numero: e.target.value })}
                className="h-10 text-xs"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-xs">Bairro</Label>
              <Input
                value={settings.bairro}
                onChange={(e) => setSettings({ ...settings, bairro: e.target.value })}
                className="h-10 text-xs"
              />
            </div>

            <div className="md:col-span-1 space-y-1.5">
              <Label className="text-xs">Município</Label>
              <Input
                value={settings.municipio}
                onChange={(e) => setSettings({ ...settings, municipio: e.target.value })}
                className="h-10 text-xs"
              />
            </div>

            <div className="md:col-span-1 space-y-1.5">
              <Label className="text-xs">UF</Label>
              <Input
                value={settings.uf}
                onChange={(e) => setSettings({ ...settings, uf: e.target.value.toUpperCase() })}
                maxLength={2}
                className="h-10 text-xs uppercase"
              />
            </div>

            <div className="md:col-span-4 space-y-1.5 border-t border-border/40 pt-2">
              <Label className="text-xs font-semibold text-primary">Código IBGE do Município (Obrigatório SEFAZ)</Label>
              <Input
                value={settings.ibge_code}
                onChange={(e) => setSettings({ ...settings, ibge_code: e.target.value })}
                placeholder="Ex: 3550308 (São Paulo)"
                className="h-10 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">Preenchido automaticamente pela consulta de CNPJ.</p>
            </div>
          </CardContent>
        </Card>

        {/* Bloco 4: Certificado Digital A1 e NFC-e */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm md:text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" /> 3. Certificado Digital A1 (.pfx)
              </CardTitle>
              <CardDescription className="text-xs">
                Utilizado para assinar digitalmente os XMLs enviados para a SEFAZ
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Arquivo do Certificado (.pfx ou .p12)</Label>
                <Input
                  type="file"
                  accept=".pfx,.p12"
                  onChange={(e) => setCertificateFile(e.target.files?.[0] || null)}
                  className="h-10 text-xs"
                />
                {settings.certificate_filename && (
                  <p className="text-[11px] text-emerald-500 font-medium">
                    ✓ Arquivo atual: {settings.certificate_filename} {settings.certificate_expiration && `(Validade: ${settings.certificate_expiration})`}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Senha do Certificado Digital</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={certPassword}
                    onChange={(e) => setCertPassword(e.target.value)}
                    placeholder="Digite a senha do certificado A1"
                    className="h-10 text-xs pr-16"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground hover:text-foreground font-medium"
                  >
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm md:text-base flex items-center gap-2">
                <QrCode className="h-4 w-4 text-primary" /> 4. Parâmetros de NFC-e (Cupom de Balcão)
              </CardTitle>
              <CardDescription className="text-xs">
                Necessário para o QR-Code impresso na notinha de acessórios/PDV
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Token CSC (Código de Segurança)</Label>
                <Input
                  value={settings.csc_token || ""}
                  onChange={(e) => setSettings({ ...settings, csc_token: e.target.value })}
                  placeholder="Ex: 0123456789ABCDEF"
                  className="h-10 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">ID do Token CSC</Label>
                <Input
                  value={settings.csc_token_id || ""}
                  onChange={(e) => setSettings({ ...settings, csc_token_id: e.target.value })}
                  placeholder="Ex: 000001"
                  className="h-10 text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">Obtido no portal da SEFAZ estadual da sua loja.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bloco 5: Regras Tributárias e Numeração */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> 5. Parâmetros Tributários e Numeração
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">NCM Padrão (Celulares)</Label>
              <Input
                value={settings.default_ncm_celular}
                onChange={(e) => setSettings({ ...settings, default_ncm_celular: e.target.value })}
                className="h-10 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">NCM Padrão (Acessórios)</Label>
              <Input
                value={settings.default_ncm_acessorio}
                onChange={(e) => setSettings({ ...settings, default_ncm_acessorio: e.target.value })}
                className="h-10 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">CFOP Padrão (Venda)</Label>
              <Input
                value={settings.default_cfop_venda}
                onChange={(e) => setSettings({ ...settings, default_cfop_venda: e.target.value })}
                className="h-10 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">CFOP Padrão (Trade-in)</Label>
              <Input
                value={settings.default_cfop_entrada}
                onChange={(e) => setSettings({ ...settings, default_cfop_entrada: e.target.value })}
                className="h-10 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Série NF-e</Label>
              <Input
                type="number"
                value={settings.nfe_series}
                onChange={(e) => setSettings({ ...settings, nfe_series: parseInt(e.target.value) || 1 })}
                className="h-10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Próximo Nº NF-e</Label>
              <Input
                type="number"
                value={settings.nfe_next_number}
                onChange={(e) => setSettings({ ...settings, nfe_next_number: parseInt(e.target.value) || 1 })}
                className="h-10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Série NFC-e</Label>
              <Input
                type="number"
                value={settings.nfce_series}
                onChange={(e) => setSettings({ ...settings, nfce_series: parseInt(e.target.value) || 1 })}
                className="h-10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Próximo Nº NFC-e</Label>
              <Input
                type="number"
                value={settings.nfce_next_number}
                onChange={(e) => setSettings({ ...settings, nfce_next_number: parseInt(e.target.value) || 1 })}
                className="h-10 text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Bloco 6: Ambiente SEFAZ */}
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <Label className="text-xs md:text-sm font-bold text-foreground">Ambiente de Emissão SEFAZ</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Escolha Homologação para testes sem valor fiscal, ou Produção para notas oficiais.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={settings.environment === "homologacao" ? "default" : "outline"}
                onClick={() => setSettings({ ...settings, environment: "homologacao" })}
                className="h-9 text-xs"
              >
                Homologação (Testes)
              </Button>
              <Button
                type="button"
                variant={settings.environment === "producao" ? "destructive" : "outline"}
                onClick={() => setSettings({ ...settings, environment: "producao" })}
                className="h-9 text-xs"
              >
                Produção (Oficial)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Botão Salvar */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" disabled={loading} className="gap-2 h-11 px-8 font-semibold text-sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Configurações Fiscais
          </Button>
        </div>
      </form>
    </div>
  );
}
