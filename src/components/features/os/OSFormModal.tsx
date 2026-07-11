import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, User, Phone, Wrench } from "lucide-react";
import SignatureCanvas from "@/components/SignatureCanvas";
import { AndroidPatternLock } from "@/components/AndroidPatternLock";
import { OsChecklist } from "@/components/OsChecklist";

const TERMS_TEXT = `1. O cliente declara que o aparelho foi entregue nas condições descritas nesta OS.
2. A loja não se responsabiliza por dados contidos no aparelho. Recomenda-se backup prévio.
3. Em caso de não retirada do aparelho após 90 dias da conclusão do serviço, a loja poderá dispor do mesmo para cobrir custos.
4. A garantia do serviço cobre apenas o defeito reparado e a peça substituída, pelo período de 90 dias.
5. O orçamento inicial pode sofrer alterações após análise técnica, mediante aprovação do cliente.
6. A loja não se responsabiliza por danos pré-existentes não descritos nesta OS.
7. Serviços de diagnóstico podem ter custo mesmo que o reparo não seja efetuado.`;

interface OSFormModalProps {
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  resetForm: () => void;
  handleSubmit: (e: React.FormEvent) => void;
  form: any;
  setForm: any;
  passwordType: "text" | "pattern";
  setPasswordType: (type: "text" | "pattern") => void;
  setPatternImageData: (data: string) => void;
  handleDeviceOffChange: (checked: boolean) => void;
  activeStoreId: string | null;
  stores: any[];
  profiles: any[];
  signatureData: string;
  setSignatureData: (data: string) => void;
  deviceOffAgreed: boolean;
  setDeviceOffAgreed: (agreed: boolean) => void;
  loading: boolean;
  isSubmitting: boolean;
}

export const OSFormModal: React.FC<OSFormModalProps> = ({
  dialogOpen,
  setDialogOpen,
  resetForm,
  handleSubmit,
  form,
  setForm,
  passwordType,
  setPasswordType,
  setPatternImageData,
  handleDeviceOffChange,
  activeStoreId,
  stores,
  profiles,
  signatureData,
  setSignatureData,
  deviceOffAgreed,
  setDeviceOffAgreed,
  loading,
  isSubmitting
}) => {
  return (
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
                <Input value={form.customer_name} onChange={(e) => setForm((prev: any) => ({ ...prev, customer_name: e.target.value }))} placeholder="Nome completo" required className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Telefone</Label>
                <Input value={form.customer_phone} onChange={(e) => setForm((prev: any) => ({ ...prev, customer_phone: e.target.value }))} placeholder="(11) 99999-9999" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CPF</Label>
                <Input value={form.customer_cpf} onChange={(e) => setForm((prev: any) => ({ ...prev, customer_cpf: e.target.value }))} placeholder="000.000.000-00" className="h-10" />
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
                <Input value={form.device_model} onChange={(e) => setForm((prev: any) => ({ ...prev, device_model: e.target.value }))} placeholder="iPhone 13 Pro" required className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">IMEI</Label>
                <Input value={form.device_imei} onChange={(e) => setForm((prev: any) => ({ ...prev, device_imei: e.target.value }))} placeholder="352000000000000" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Cor</Label>
                <Input value={form.device_color} onChange={(e) => setForm((prev: any) => ({ ...prev, device_color: e.target.value }))} placeholder="Preto" className="h-10" />
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
                  <Input value={form.device_password} onChange={(e) => setForm((prev: any) => ({ ...prev, device_password: e.target.value }))} placeholder="****" className="h-10" />
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
                <Input value={form.device_accessories} onChange={(e) => setForm((prev: any) => ({ ...prev, device_accessories: e.target.value }))} placeholder="Carregador, capa" className="h-10" />
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
              <Textarea value={form.device_condition} onChange={(e) => setForm((prev: any) => ({ ...prev, device_condition: e.target.value }))} placeholder="Descreva avarias existentes" className="min-h-[60px]" />
            </div>
          </div>

          {/* Serviço */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Wrench className="h-3 w-3" /> Serviço
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Defeito Relatado *</Label>
              <Textarea value={form.reported_defect} onChange={(e) => setForm((prev: any) => ({ ...prev, reported_defect: e.target.value }))} placeholder="Descreva o problema relatado pelo cliente" required className="min-h-[60px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Loja da OS</Label>
                <Select 
                  value={form.store_id || (activeStoreId === "all" ? "" : activeStoreId)} 
                  onValueChange={(v) => setForm((prev: any) => ({ ...prev, store_id: v }))}
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
                <Input type="datetime-local" value={form.estimated_completion} onChange={(e) => setForm((prev: any) => ({ ...prev, estimated_completion: e.target.value }))} className="h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Serviço Solicitado *</Label>
              <Select value={form.requested_service} onValueChange={(v) => setForm((prev: any) => ({ ...prev, requested_service: v }))}>
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
                <Input type="number" step="0.01" value={form.estimated_price} onChange={(e) => setForm((prev: any) => ({ ...prev, estimated_price: e.target.value }))} placeholder="150.00" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Técnico Responsável</Label>
                <Select value={form.technician_id} onValueChange={(v) => setForm((prev: any) => ({ ...prev, technician_id: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name ?? p.user_id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Checklist de Entrada */}
          <OsChecklist
            title="Checklist de Entrada"
            data={form.entry_checklist}
            onChange={(d) => setForm((prev: any) => ({ ...prev, entry_checklist: d }))}
            deviceIsOff={form.device_is_off}
          />

          {/* Termos */}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Termos e Condições</p>
            <div className="rounded bg-muted/50 p-3 max-h-32 overflow-y-auto">
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{TERMS_TEXT}</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.terms_accepted} onCheckedChange={(v) => setForm((prev: any) => ({ ...prev, terms_accepted: v }))} />
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
            <Textarea value={form.internal_notes} onChange={(e) => setForm((prev: any) => ({ ...prev, internal_notes: e.target.value }))} placeholder="Notas internas (não aparecem para o cliente)..." className="min-h-[50px]" />
          </div>

          <Button type="submit" className="w-full h-11 font-semibold" disabled={loading || isSubmitting || !form.requested_service}>
            {loading || isSubmitting ? "Criando OS... aguarde" : "Abrir Ordem de Serviço"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
