import { useEffect, useState } from "react";
import { Loader2, Save, Shuffle, Workflow } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { saveAutomationSettings } from "../../api/tasks";
import { useCrmContext, useTeam } from "../../hooks/useInbox";
import { taskKeys, useAutomationSettings } from "../../hooks/useTasks";
import type { CrmAutomationSettings } from "../../lib/types";
import { EmptyState } from "../shared/EmptyState";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_IG_MESSAGE, fillTemplate } from "../../lib/igLead";

type Form = Omit<CrmAutomationSettings, "store_id">;
const DEFAULTS: Form = {
  round_robin: false, round_robin_members: [], unanswered_minutes: 30, stale_deals: true,
  os_ready: true, review_after_days: 3, warranty_alert_days: 7,
  ig_first_message: DEFAULT_IG_MESSAGE, ig_followup_hours: 2,
};
const MANAGER = new Set(["admin", "gerente", "dono"]);

/** Só os campos editáveis (a linha do banco tem também cursor e auditoria). */
function pick(d: CrmAutomationSettings | null | undefined): Form {
  if (!d) return DEFAULTS;
  return {
    round_robin: d.round_robin, round_robin_members: d.round_robin_members ?? [], unanswered_minutes: d.unanswered_minutes,
    stale_deals: d.stale_deals, os_ready: d.os_ready, review_after_days: d.review_after_days, warranty_alert_days: d.warranty_alert_days,
    ig_first_message: d.ig_first_message || DEFAULT_IG_MESSAGE, ig_followup_hours: d.ig_followup_hours ?? 2,
  };
}

function Row({ id, title, help, checked, onChange, disabled, children }: {
  id: string; title: string; help: string; checked: boolean; onChange: (v: boolean) => void; disabled: boolean; children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2 border-t border-border/50 py-3 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label htmlFor={id} className="font-medium">{title}</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
        </div>
        <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      </div>
      {checked && children}
    </div>
  );
}

function NumberSelect({ label, value, options, unit, onChange, disabled }: {
  label: string; value: number | null; options: number[]; unit: (n: number) => string; onChange: (n: number) => void; disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Select value={String(value ?? options[0])} onValueChange={(v) => onChange(Number(v))} disabled={disabled}>
        <SelectTrigger className="h-9 w-36" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((n) => <SelectItem key={n} value={String(n)}>{unit(n)}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export function AutomationSettingsCard() {
  const { storeId, userId, userRole } = useCrmContext();
  const qc = useQueryClient();
  const { data, isLoading } = useAutomationSettings(storeId);
  const { data: team = [] } = useTeam(storeId);
  const [form, setForm] = useState<Form>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const canEdit = MANAGER.has(String(userRole ?? ""));

  useEffect(() => { setForm(pick(data)); }, [data]);

  if (!storeId) {
    return <EmptyState icon={Workflow} title="Escolha uma loja" description="As automações são configuradas por loja. Selecione a loja no topo da tela." />;
  }

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const saved = pick(data);
  const dirty = (Object.keys(DEFAULTS) as (keyof Form)[]).some((k) => JSON.stringify(form[k]) !== JSON.stringify(saved[k]));
  const sellers = team.filter((t) => t.role !== "tecnico");

  async function save() {
    if (!storeId || !userId) return;
    if (form.round_robin && form.round_robin_members.length === 0) { toast.error("Escolha quem entra no rodízio."); return; }
    setSaving(true);
    try {
      await saveAutomationSettings(storeId, userId, form);
      qc.invalidateQueries({ queryKey: taskKeys.automation(storeId) });
      toast.success("Automações salvas.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const off = !canEdit || isLoading;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Workflow className="h-4 w-4 text-primary" aria-hidden="true" /> Automações</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Elas só <strong>criam tarefas</strong> e distribuem conversas. Nenhuma mensagem é enviada ao cliente sem alguém da equipe revisar e enviar.
          Rodam a cada 5 minutos.
        </p>
        {!canEdit && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Só gerente ou dono altera estas opções.</p>}
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-4">
        <Row id="au-rr" title="Rodízio de atendimento" help="Cada conversa nova sem responsável vai para a próxima pessoa da fila."
          checked={form.round_robin} onChange={(v) => set({ round_robin: v })} disabled={off}>
          <fieldset className="grid gap-1 sm:grid-cols-2">
            <legend className="sr-only">Quem entra no rodízio</legend>
            {sellers.map((t) => {
              const on = form.round_robin_members.includes(t.user_id);
              return (
                <label key={t.user_id} className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-md border border-border/50 px-3 text-sm hover:bg-muted/40">
                  <Checkbox checked={on} disabled={off}
                    onCheckedChange={(v) => set({ round_robin_members: v ? [...form.round_robin_members, t.user_id] : form.round_robin_members.filter((x) => x !== t.user_id) })} />
                  <Shuffle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{t.display_name}{t.user_id === userId ? " (você)" : ""}</span>
                </label>
              );
            })}
          </fieldset>
        </Row>

        <Row id="au-reply" title="Conversa sem resposta" help="Cria a tarefa “Responder fulano” quando o cliente fica esperando. Fecha sozinha quando alguém responde."
          checked={form.unanswered_minutes !== null} onChange={(v) => set({ unanswered_minutes: v ? 30 : null })} disabled={off}>
          <NumberSelect label="Depois de" value={form.unanswered_minutes} options={[10, 15, 30, 60, 120]} disabled={off}
            unit={(n) => (n < 60 ? `${n} minutos` : `${n / 60} hora${n > 60 ? "s" : ""}`)} onChange={(n) => set({ unanswered_minutes: n })} />
        </Row>

        <Row id="au-stale" title="Negócio parado" help="Avisa o responsável quando um negócio passa do prazo da etapa (o mesmo que deixa o cartão vermelho no funil)."
          checked={form.stale_deals} onChange={(v) => set({ stale_deals: v })} disabled={off} />

        <Row id="au-ready" title="OS pronta" help="Quando a OS fica “Pronta p/ retirada”, sugere avisar o cliente com uma mensagem pronta."
          checked={form.os_ready} onChange={(v) => set({ os_ready: v })} disabled={off} />

        <Row id="au-review" title="Pedir avaliação" help="Alguns dias depois da entrega da OS ou da venda, sugere pedir uma avaliação."
          checked={form.review_after_days !== null} onChange={(v) => set({ review_after_days: v ? 3 : null })} disabled={off}>
          <NumberSelect label="Depois de" value={form.review_after_days} options={[1, 2, 3, 5, 7]} disabled={off}
            unit={(n) => `${n} dia${n > 1 ? "s" : ""}`} onChange={(n) => set({ review_after_days: n })} />
        </Row>

        <Row id="au-warranty" title="Garantia vencendo" help="Avisa quando a garantia de uma OS ou venda está para acabar (bom momento para oferecer película, capa ou revisão)."
          checked={form.warranty_alert_days !== null} onChange={(v) => set({ warranty_alert_days: v ? 7 : null })} disabled={off}>
          <NumberSelect label="Avisar" value={form.warranty_alert_days} options={[3, 7, 15, 30]} disabled={off}
            unit={(n) => `${n} dias antes`} onChange={(n) => set({ warranty_alert_days: n })} />
        </Row>
      </div>

      <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
        <div>
          <Label htmlFor="au-ig" className="font-medium">Lead do Instagram · primeira mensagem no WhatsApp</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Usada no botão “Lead do Instagram”. O vendedor revisa antes de enviar. Variáveis: {"{primeiro_nome}"}, {"{nome}"}, {"{loja}"}, {"{assunto}"} e {"{sobre}"} (vira “sobre o assunto” ou some).
          </p>
        </div>
        <Textarea id="au-ig" value={form.ig_first_message} onChange={(e) => set({ ig_first_message: e.target.value })} rows={3} maxLength={600}
          disabled={off} className="text-base md:text-sm" />
        <p className="rounded-md bg-muted/40 p-2 text-xs">
          <span className="text-muted-foreground">Exemplo: </span>
          {fillTemplate(form.ig_first_message || DEFAULT_IG_MESSAGE, { name: "Ana Souza", store: "sua loja", subject: "Troca de tela do A54" })}
        </p>
        <NumberSelect label="Lembrar de retomar se não responder em" value={form.ig_followup_hours} options={[1, 2, 4, 8, 24]} disabled={off}
          unit={(n) => (n === 1 ? "1 hora" : `${n} horas`)} onChange={(n) => set({ ig_followup_hours: n })} />
      </div>

      {canEdit && (
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Salvar automações
        </Button>
      )}
    </div>
  );
}
