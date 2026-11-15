import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, RotateCcw, Save, Send, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { saveAiSettings, simulateAi, type SimMessage } from "../../api/ai";
import { useCrmContext } from "../../hooks/useInbox";
import { aiKeys, useAiRuns, useAiSettings } from "../../hooks/useAi";
import { INTEREST_LABEL } from "../../lib/constants";
import { relative } from "../../lib/format";
import type { CrmAiDecision, CrmAiSettings, CrmBusinessHours } from "../../lib/types";
import { EmptyState } from "../shared/EmptyState";
import { AiLearning } from "./AiLearning";

type Form = Omit<CrmAiSettings, "store_id" | "enabled_channels">;
const DEFAULTS: Form = {
  mode: "off", knowledge: "", persona: "", model: "", handoff_message: "",
  business_hours: { enabled: true, start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5, 6] },
  max_replies_per_day: 30, max_turns: 8,
};
const MANAGER = new Set(["admin", "gerente", "dono"]);
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const KNOWLEDGE_TEMPLATE = `Endereço:
Horário: segunda a sábado, 8h às 18h
Formas de pagamento: Pix, dinheiro, cartão (até 12x)
Serviços: troca de tela, bateria, conector de carga, desbloqueio...
Garantia: 90 dias nos consertos
Entrega/retirada:
Preços fixos que a IA pode informar (opcional): película 3D R$ ...
Observações: `;

function pick(s: CrmAiSettings | null | undefined): Form {
  if (!s) return DEFAULTS;
  return {
    mode: s.mode, knowledge: s.knowledge ?? "", persona: s.persona ?? "", model: s.model ?? "", handoff_message: s.handoff_message ?? "",
    business_hours: { ...DEFAULTS.business_hours, ...(s.business_hours ?? {}) }, max_replies_per_day: s.max_replies_per_day, max_turns: s.max_turns,
  };
}

const MODES: { v: Form["mode"]; title: string; help: string }[] = [
  { v: "off", title: "Desligado", help: "A IA não atende. Ainda dá para pedir sugestão manualmente em cada conversa." },
  { v: "draft", title: "Rascunho (recomendado)", help: "A IA escreve a resposta e alguém da equipe revisa e envia com um toque." },
  { v: "autopilot", title: "Piloto automático", help: "A IA responde sozinha e passa para o atendente quando o cliente estiver qualificado." },
];

const DECISION_LABEL: Record<string, string> = { reply: "Respondeu", handoff: "Passou para atendente", ignore: "Não é cliente", error: "Erro" };

export function AiAgentSettings() {
  const { storeId, userId, userRole } = useCrmContext();
  const qc = useQueryClient();
  const canEdit = MANAGER.has(String(userRole ?? ""));
  const { data, isLoading } = useAiSettings(storeId);
  const [form, setForm] = useState<Form>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(pick(data)); }, [data]);

  if (!storeId) return <EmptyState icon={Bot} title="Escolha uma loja" description="O agente de IA é configurado por loja. Selecione a loja no topo da tela." />;

  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const hours = form.business_hours ?? {};
  const setHours = (p: Partial<CrmBusinessHours>) => set({ business_hours: { ...hours, ...p } });
  const saved = pick(data);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const off = !canEdit || isLoading;

  async function save() {
    if (!storeId || !userId) return;
    if (form.mode === "autopilot" && saved.mode !== "autopilot" &&
        !confirm("Ligar o PILOTO AUTOMÁTICO?\n\nA IA vai responder clientes sozinha, sem ninguém revisar. Recomendamos usar alguns dias no modo Rascunho antes.")) return;
    setSaving(true);
    try {
      await saveAiSettings(storeId, userId, {
        mode: form.mode, knowledge: form.knowledge?.trim() || null, persona: form.persona?.trim() || null, model: form.model?.trim() || null,
        handoff_message: form.handoff_message?.trim() || null, business_hours: form.business_hours,
        max_replies_per_day: form.max_replies_per_day, max_turns: form.max_turns,
      });
      qc.invalidateQueries({ queryKey: aiKeys.settings(storeId) });
      toast.success("Agente de IA salvo.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-violet-500" aria-hidden="true" /> Agente de IA no WhatsApp</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Atende o primeiro contato, entende o que a pessoa quer e passa para um atendente com tudo anotado: cria o negócio no funil, escolhe o vendedor pelo rodízio e cria a tarefa “Assumir atendimento”.
          Nunca inventa preço nem prazo. Se alguém da equipe responder, a IA para naquela conversa.
        </p>
        {!canEdit && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Só gerente ou dono altera estas opções.</p>}
      </div>

      <fieldset className="grid gap-2 sm:grid-cols-3" disabled={off}>
        <legend className="sr-only">Modo do agente</legend>
        {MODES.map((m) => (
          <label key={m.v} className={cn("cursor-pointer rounded-xl border p-3 transition-colors duration-150",
            form.mode === m.v ? (m.v === "autopilot" ? "border-amber-500 bg-amber-500/10" : "border-primary bg-primary/10") : "border-border/60 bg-card hover:bg-muted/40")}>
            <input type="radio" name="ai-mode" value={m.v} checked={form.mode === m.v} onChange={() => set({ mode: m.v })} className="sr-only" />
            <span className="block text-sm font-semibold">{m.title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{m.help}</span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
        <div className="space-y-1.5">
          <div className="flex items-end justify-between gap-2">
            <Label htmlFor="ai-knowledge">O que a IA sabe sobre a loja</Label>
            {!form.knowledge && canEdit && (
              <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => set({ knowledge: KNOWLEDGE_TEMPLATE })}>Usar modelo</Button>
            )}
          </div>
          <Textarea id="ai-knowledge" value={form.knowledge ?? ""} onChange={(e) => set({ knowledge: e.target.value })} rows={9} disabled={off}
            placeholder="Endereço, horário, formas de pagamento, serviços, garantia… A IA só informa o que estiver aqui." className="text-base md:text-sm" maxLength={20000} />
          <p className="text-xs text-muted-foreground">Preço só aparece se estiver escrito aqui. Sem isso, a IA diz que um atendente confirma.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ai-persona">Jeito de falar (opcional)</Label>
            <Input id="ai-persona" value={form.persona ?? ""} onChange={(e) => set({ persona: e.target.value })} disabled={off} maxLength={300}
              placeholder="Ex.: descontraído, usa emoji com moderação, chama de “você”" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-handoff">Frase ao passar para o atendente (opcional)</Label>
            <Input id="ai-handoff" value={form.handoff_message ?? ""} onChange={(e) => set({ handoff_message: e.target.value })} disabled={off} maxLength={300}
              placeholder="Ex.: Já anotei tudo! Um atendente continua com você em instantes." />
          </div>
        </div>

        <div className="space-y-2 border-t border-border/50 pt-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="ai-hours" className="font-medium">Horário de atendimento</Label>
              <p className="text-xs text-muted-foreground">Fora do horário a IA continua atendendo e avisa que um atendente responde quando a loja abrir.</p>
            </div>
            <Switch id="ai-hours" checked={Boolean(hours.enabled)} onCheckedChange={(v) => setHours({ enabled: v })} disabled={off} />
          </div>
          {hours.enabled && (
            <div className="flex flex-wrap items-center gap-2">
              <Input type="time" value={hours.start ?? "08:00"} onChange={(e) => setHours({ start: e.target.value })} className="w-28" aria-label="Abre às" disabled={off} />
              <span className="text-sm text-muted-foreground">às</span>
              <Input type="time" value={hours.end ?? "18:00"} onChange={(e) => setHours({ end: e.target.value })} className="w-28" aria-label="Fecha às" disabled={off} />
              <div className="flex flex-wrap gap-1" role="group" aria-label="Dias de atendimento">
                {DAYS.map((d, i) => {
                  const on = (hours.days ?? []).includes(i);
                  return (
                    <button key={d} type="button" aria-pressed={on} disabled={off}
                      onClick={() => setHours({ days: on ? (hours.days ?? []).filter((x) => x !== i) : [...(hours.days ?? []), i].sort() })}
                      className={cn("h-9 min-w-[44px] rounded-md border px-2 text-xs font-medium", on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 border-t border-border/50 pt-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Mensagens da IA por conversa</Label>
            <Select value={String(form.max_turns)} onValueChange={(v) => set({ max_turns: Number(v) })} disabled={off}>
              <SelectTrigger aria-label="Mensagens da IA por conversa"><SelectValue /></SelectTrigger>
              <SelectContent>{[4, 6, 8, 10, 15].map((n) => <SelectItem key={n} value={String(n)}>Até {n}, depois passa</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Limite por dia (por conversa)</Label>
            <Select value={String(form.max_replies_per_day)} onValueChange={(v) => set({ max_replies_per_day: Number(v) })} disabled={off}>
              <SelectTrigger aria-label="Limite por dia"><SelectValue /></SelectTrigger>
              <SelectContent>{[10, 20, 30, 50].map((n) => <SelectItem key={n} value={String(n)}>{n} respostas</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-model">Modelo (avançado)</Label>
            <Input id="ai-model" value={form.model ?? ""} onChange={(e) => set({ model: e.target.value })} disabled={off} placeholder="padrão do sistema" maxLength={80} />
          </div>
        </div>
      </div>

      {canEdit && (
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Salvar agente
        </Button>
      )}

      {canEdit && <AiSimulator storeId={storeId} form={form} />}
      <AiLearning
        storeId={storeId}
        userId={userId}
        canEdit={canEdit}
        onUseDraft={(text) => {
          set({ knowledge: form.knowledge?.trim() ? `${form.knowledge.trim()}\n\n${text}` : text });
          document.getElementById("ai-knowledge")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
      />
      <AiRunsList storeId={storeId} />
    </div>
  );
}

// ------------------------------------------------------------------ simulador

function DecisionChips({ d }: { d: CrmAiDecision }) {
  const chip = "rounded bg-muted px-1.5 py-px";
  return (
    <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
      <span className={cn(chip, d.decision === "handoff" && "bg-violet-500/15 text-violet-700 dark:text-violet-300", d.decision === "ignore" && "bg-amber-500/15")}>
        {DECISION_LABEL[d.decision] ?? d.decision}
      </span>
      {d.interest && <span className={chip}>{INTEREST_LABEL[d.interest]}</span>}
      {d.device_model && <span className={chip}>{d.device_model}</span>}
      <span className={chip}>{d.score === "hot" ? "quente" : d.score === "warm" ? "morno" : "frio"}</span>
      {d.reason && <span className={chip}>{d.reason}</span>}
    </div>
  );
}

function AiSimulator({ storeId, form }: { storeId: string; form: Form }) {
  const [msgs, setMsgs] = useState<(SimMessage & { d?: CrmAiDecision })[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<CrmAiDecision | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next = [...msgs, { from: "cliente" as const, text }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const r = await simulateAi({
        storeId, messages: next.map(({ from, text: t }) => ({ from, text: t })),
        overrides: { knowledge: form.knowledge, persona: form.persona, handoff_message: form.handoff_message, model: form.model, business_hours: form.business_hours, max_turns: form.max_turns },
      });
      setLast(r.decision);
      if (r.decision.reply) setMsgs([...next, { from: "loja", text: r.decision.reply, d: r.decision }]);
      else setMsgs([...next, { from: "loja", text: "(a IA ficaria em silêncio)", d: r.decision }]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4" aria-labelledby="ai-sim">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id="ai-sim" className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-violet-500" aria-hidden="true" /> Testar a IA</h3>
        {msgs.length > 0 && <Button size="sm" variant="ghost" className="h-8" onClick={() => { setMsgs([]); setLast(null); }}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Recomeçar</Button>}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Escreva como se fosse um cliente. Usa o texto do formulário acima (mesmo sem salvar). Nada é enviado a ninguém.</p>
      <div className="mb-2 max-h-80 min-h-[120px] space-y-2 overflow-y-auto rounded-lg border border-border/50 bg-background/50 p-3">
        {msgs.length === 0 && <p className="text-center text-xs text-muted-foreground">Ex.: “oi, quanto fica pra trocar a tela do A54?”</p>}
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex", m.from === "cliente" ? "justify-start" : "justify-end")}>
            <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.from === "cliente" ? "rounded-bl-md border border-border/50 bg-card" : "rounded-br-md bg-violet-500/15")}>
              {m.from === "loja" && <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300"><Bot className="h-3 w-3" /> IA</span>}
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.d && <DecisionChips d={m.d} />}
            </div>
          </div>
        ))}
        {busy && <p className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> pensando…</p>}
        <div ref={end} />
      </div>
      {last?.decision === "handoff" && (
        <div className="mb-2 rounded-md border border-violet-500/30 bg-violet-500/5 p-2 text-xs">
          <p className="flex items-center gap-1 font-semibold"><UserRound className="h-3.5 w-3.5" /> Iria para o atendente com:</p>
          <p className="mt-0.5"><strong>{last.title || "Negócio"}</strong> · {last.summary}</p>
        </div>
      )}
      <form onSubmit={send} className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Mensagem do cliente…" aria-label="Mensagem do cliente (teste)" disabled={busy} enterKeyHint="send" />
        <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={busy || !input.trim()} aria-label="Enviar teste"><Send className="h-4 w-4" /></Button>
      </form>
    </section>
  );
}

// ------------------------------------------------------------------ histórico

function AiRunsList({ storeId }: { storeId: string }) {
  const { data: runs = [], isLoading } = useAiRuns(storeId);
  const rows = useMemo(() => runs.slice(0, 30), [runs]);
  return (
    <section className="rounded-xl border border-border/60 bg-card p-4" aria-labelledby="ai-runs">
      <h3 id="ai-runs" className="mb-2 font-semibold">Últimas decisões da IA</h3>
      {!isLoading && rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ainda. Elas aparecem aqui quando a IA atuar em conversas reais.</p>}
      <ul className="divide-y divide-border/40">
        {rows.map((r) => (
          <li key={r.id} className="py-2 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium">{r.conversation?.contact?.name ?? "Conversa"}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{relative(r.created_at)}</span>
            </div>
            <p className={cn("text-xs", r.decision === "error" ? "text-destructive" : "text-muted-foreground")}>
              {DECISION_LABEL[r.decision ?? ""] ?? r.decision}
              {r.output?.reason ? ` · ${r.output.reason}` : ""}
              {r.error ? ` · ${r.error.slice(0, 140)}` : ""}
            </p>
            {r.output?.reply && <p className="mt-0.5 line-clamp-2 text-xs italic">“{r.output.reply}”</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
