import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardPaste, Copy, Plus, Search, SlidersHorizontal, Smartphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  deleteModel, deleteRule, fetchModels, insertModels, insertRule, saveSettings, updateModel, updateRule,
} from "../api/db";
import { EmptyState } from "../components/EmptyState";
import { ModelDiscountsSheet } from "../components/ModelDiscountsSheet";
import { useTrocaContext } from "../hooks/context";
import { useInvalidateTroca, useModelRules, useModels, useRules, useSettings, useTrocaStore } from "../hooks/useTroca";
import { formatBRL } from "../lib/calc";
import { iphoneTemplate, parseMoney, parsePriceList, planUpsert, type PriceRow } from "../lib/priceList";
import { QUESTIONS } from "../lib/questions";
import type { RuleKind, TradeModel, TradeRule } from "../lib/types";
import { storageSize } from "../lib/wizard";

const card = "glass rounded-2xl border border-border/50 bg-card/70 p-4";

/** Campo que salva ao sair (ou Enter); volta ao valor salvo se der erro. */
function CommitInput({ value, onCommit, className, label, inputMode, money, placeholder }: {
  value: string;
  placeholder?: string;
  onCommit: (v: string) => Promise<void>;
  className?: string;
  label: string;
  inputMode?: "decimal" | "text";
  money?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = async () => {
    if (text.trim() === value) return;
    if (money && parseMoney(text) === null) { toast.error("Valor inválido"); setText(value); return; }
    try { await onCommit(text.trim()); } catch (e) { toast.error((e as Error).message); setText(value); }
  };
  return (
    <Input aria-label={label} value={text} inputMode={inputMode} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
      onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={cn("h-10", className)} />
  );
}

async function applyRows(storeId: string, rows: PriceRow[], existing: TradeModel[]) {
  const { inserts, updates } = planUpsert(rows, existing);
  await insertModels(storeId, inserts);
  for (const u of updates) await updateModel(u.id, { base_price: u.base_price, active: true });
  return { inserted: inserts.length, updated: updates.length };
}

// ---------------------------------------------------------------- negociação
function SettingsCard() {
  const { storeId } = useTrocaContext();
  const invalidate = useInvalidateTroca();
  const { data } = useSettings(storeId);
  const [pct, setPct] = useState("10");
  const [round, setRound] = useState("10");
  useEffect(() => { if (data) { setPct(String(data.negotiation_pct)); setRound(String(data.round_to)); } }, [data]);
  const dirty = data && (Number(pct) !== data.negotiation_pct || Number(round) !== data.round_to);

  const save = async () => {
    const n = Number(pct.replace(",", "."));
    if (!(n >= 0 && n <= 50)) return toast.error("A margem vai de 0 a 50%.");
    try {
      await saveSettings({ store_id: storeId, negotiation_pct: n, round_to: Number(round) });
      invalidate("settings");
      toast.success("Margem salva.");
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <section className={card} aria-labelledby="t-neg">
      <h2 id="t-neg" className="font-semibold">Faixa de negociação</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        O vendedor vê "pode oferecer de X a Y". Y é o preço base menos os descontos; X fica esta % abaixo de Y.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-sm">
        <div className="space-y-1.5">
          <Label htmlFor="t-pct">Margem (%)</Label>
          <Input id="t-pct" inputMode="decimal" className="h-11" value={pct} onChange={(e) => setPct(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-round">Arredondar para</Label>
          <Select value={round} onValueChange={setRound}>
            <SelectTrigger id="t-round" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 5, 10, 50, 100].map((r) => <SelectItem key={r} value={String(r)}>R$ {r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {dirty && <Button className="mt-3" onClick={save}>Salvar margem</Button>}
    </section>
  );
}

// ---------------------------------------------------------------- modelos
function AddModelDialog({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (v: boolean) => void; existing: TradeModel[] }) {
  const { storeId } = useTrocaContext();
  const invalidate = useInvalidateTroca();
  const [f, setF] = useState({ brand: "Apple", model: "", storage: "", price: "" });
  useEffect(() => { if (open) setF({ brand: "Apple", model: "", storage: "", price: "" }); }, [open]);

  const save = async () => {
    const parsed = parsePriceList(`${f.brand}; ${f.model}; ${f.storage}; ${f.price}`);
    if (!f.model.trim() || !parsed.rows.length) return toast.error("Preencha modelo e valor.");
    try {
      const r = await applyRows(storeId, parsed.rows, existing);
      invalidate("models");
      toast.success(r.inserted ? "Modelo adicionado." : "Preço atualizado.");
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar modelo</DialogTitle>
          <DialogDescription>Valor que a loja paga num aparelho perfeito, sem nenhum defeito.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="am-brand">Marca</Label>
            <Input id="am-brand" className="h-11" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="am-storage">Capacidade</Label>
            <Input id="am-storage" className="h-11" placeholder="128" value={f.storage} onChange={(e) => setF({ ...f, storage: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="am-model">Modelo</Label>
            <Input id="am-model" className="h-11" placeholder="iPhone 13 Pro" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="am-price">Valor base (R$)</Label>
            <Input id="am-price" className="h-11" inputMode="decimal" placeholder="2000" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </div>
        </div>
        <DialogFooter><Button className="h-11 w-full" onClick={save}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasteDialog({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (v: boolean) => void; existing: TradeModel[] }) {
  const { storeId } = useTrocaContext();
  const invalidate = useInvalidateTroca();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setText(""); }, [open]);
  const parsed = useMemo(() => parsePriceList(text), [text]);
  const plan = useMemo(() => planUpsert(parsed.rows, existing), [parsed, existing]);
  const blanks = parsed.skipped.filter((s) => s.reason === "sem valor").length;
  const otherErrors = parsed.skipped.filter((s) => s.reason !== "sem valor");

  const save = async () => {
    setBusy(true);
    try {
      const r = await applyRows(storeId, parsed.rows, existing);
      invalidate("models");
      toast.success(`${r.inserted} novo(s), ${r.updated} preço(s) atualizado(s).`);
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Colar lista de preços</DialogTitle>
          <DialogDescription>
            Uma linha por aparelho: <strong>Marca; Modelo; Capacidade; Valor</strong>. Dá para colar do Excel. Modelo que já existe só tem o preço atualizado.
          </DialogDescription>
        </DialogHeader>
        <Button variant="outline" size="sm" className="w-fit" onClick={() => setText(iphoneTemplate(existing))}>
          <Smartphone className="mr-2 h-4 w-4" /> Preencher iPhones (11 ao 17) sem valor
        </Button>
        <Textarea rows={10} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"Apple; iPhone 13; 128 GB; 2000\nApple; iPhone 13; 256 GB; 2300\nSamsung; Galaxy S23; 256 GB; 1800"} aria-label="Lista de preços" />
        <div className="space-y-1 text-xs text-muted-foreground" aria-live="polite">
          {parsed.rows.length > 0 && <p>{plan.inserts.length} novo(s) e {plan.updates.length} com preço novo.</p>}
          {blanks > 0 && <p>{blanks} linha(s) sem valor serão ignoradas: preencha o valor no fim da linha.</p>}
          {otherErrors.slice(0, 4).map((s) => <p key={s.line} className="text-destructive">Linha {s.line}: {s.reason}</p>)}
        </div>
        <DialogFooter>
          <Button className="h-11 w-full" disabled={busy || !(plan.inserts.length + plan.updates.length)} onClick={save}>
            {busy ? "Salvando…" : "Salvar na tabela"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyDialog({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (v: boolean) => void; existing: TradeModel[] }) {
  const { storeId, storeLabel } = useTrocaContext();
  const { stores } = useTrocaStore();
  const invalidate = useInvalidateTroca();
  const others = stores.filter((s) => s.id !== storeId);
  const [from, setFrom] = useState<string>("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setFrom(others[0]?.id ?? ""); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    setBusy(true);
    try {
      const source = (await fetchModels(from)).filter((m) => m.active);
      const r = await applyRows(storeId, source.map(({ brand, model, storage, base_price }) => ({ brand, model, storage, base_price })), existing);
      invalidate("models");
      toast.success(`${r.inserted} novo(s), ${r.updated} preço(s) atualizado(s).`);
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Copiar preços de outra loja</DialogTitle>
          <DialogDescription>Traz os modelos e valores para a tabela de {storeLabel}. Os descontos não mudam.</DialogDescription>
        </DialogHeader>
        <Select value={from} onValueChange={setFrom}>
          <SelectTrigger className="h-11" aria-label="Loja de origem"><SelectValue placeholder="Loja" /></SelectTrigger>
          <SelectContent>{others.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <DialogFooter><Button className="h-11 w-full" disabled={busy || !from} onClick={copy}>{busy ? "Copiando…" : "Copiar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModelsCard() {
  const { storeId } = useTrocaContext();
  const { stores } = useTrocaStore();
  const invalidate = useInvalidateTroca();
  const { data: models = [], isLoading } = useModels(storeId);
  const { data: rules = [] } = useRules(storeId);
  const { data: overrides = [] } = useModelRules(storeId);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<"add" | "paste" | "copy" | null>(null);
  const [discountsOf, setDiscountsOf] = useState<string | null>(null);
  const ownCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of overrides) m.set(o.model_id, (m.get(o.model_id) ?? 0) + 1);
    return m;
  }, [overrides]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, TradeModel[]>();
    for (const m of models) {
      if (q && !`${m.brand} ${m.model} ${m.storage}`.toLowerCase().includes(q)) continue;
      const k = `${m.brand} · ${m.model}`;
      map.set(k, [...(map.get(k) ?? []), m]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }))
      .map(([k, list]) => [k, list.sort((x, y) => storageSize(x.storage) - storageSize(y.storage))] as const);
  }, [models, search]);

  const remove = async (m: TradeModel) => {
    if (!window.confirm(`Tirar ${m.model} ${m.storage} da tabela?`)) return;
    try { await deleteModel(m.id); invalidate("models"); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <section className={card} aria-labelledby="t-models">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="t-models" className="mr-auto font-semibold">Modelos e preço base <span className="font-normal text-muted-foreground">({models.length})</span></h2>
        <Button size="sm" onClick={() => setDialog("add")}><Plus className="mr-1.5 h-4 w-4" /> Adicionar</Button>
        <Button size="sm" variant="outline" onClick={() => setDialog("paste")}><ClipboardPaste className="mr-1.5 h-4 w-4" /> Colar lista</Button>
        {stores.length > 1 && (
          <Button size="sm" variant="outline" onClick={() => setDialog("copy")}><Copy className="mr-1.5 h-4 w-4" /> Copiar de outra loja</Button>
        )}
      </div>
      {models.some((m) => !m.base_price) && (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          {models.filter((m) => !m.base_price).length} aparelhos sem preço: só aparecem no simulador depois que você puser o valor.
        </p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">
        Quanto a loja paga num aparelho perfeito. Em <strong>Descontos</strong> você põe em R$ o valor de cada peça neste aparelho.
      </p>

      {models.length > 8 && (
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar modelo" className="h-10 pl-9" aria-label="Buscar modelo" />
        </div>
      )}

      {isLoading && <Skeleton className="mt-3 h-24 w-full rounded-xl" />}
      {!isLoading && models.length === 0 && (
        <EmptyState icon={Smartphone} title="Nenhum modelo ainda"
          description='Use "Colar lista" › "Preencher iPhones" para começar rápido: só falta digitar os valores.' />
      )}

      <div className="mt-3 space-y-3">
        {groups.map(([title, list]) => (
          <div key={title} className="rounded-xl border border-border/40">
            <p className="border-b border-border/40 px-3 py-2 text-sm font-medium">{title}</p>
            <ul className="divide-y divide-border/30">
              {list.map((m) => (
                <li key={m.id} className={cn("flex items-center gap-2 px-3 py-1.5", !m.active && "opacity-50")}>
                  <span className="w-16 shrink-0 text-sm tabular-nums">{m.storage || "—"}</span>
                  <div className="relative flex-1 sm:max-w-[160px]">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                    <CommitInput label={`Valor de ${m.model} ${m.storage}`} value={m.base_price ? String(m.base_price) : ""} placeholder="sem preço"
                      inputMode="decimal" money className={cn("pl-8 tabular-nums", !m.base_price && "border-amber-500/60")}
                      onCommit={async (v) => { await updateModel(m.id, { base_price: parseMoney(v)! }); invalidate("models"); }} />
                  </div>
                  <Button variant={ownCount.get(m.id) ? "secondary" : "ghost"} size="sm" className="ml-auto h-10 shrink-0 px-2.5"
                    aria-label={`Descontos do ${m.model} ${m.storage}`} onClick={() => setDiscountsOf(m.id)}>
                    <SlidersHorizontal className="h-4 w-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">Descontos</span>
                    {!!ownCount.get(m.id) && <span className="ml-1 rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{ownCount.get(m.id)}</span>}
                  </Button>
                  <Switch checked={m.active} aria-label={m.active ? "Ativo no simulador" : "Escondido do simulador"}
                    onCheckedChange={async (v) => { try { await updateModel(m.id, { active: v }); invalidate("models"); } catch (e) { toast.error((e as Error).message); } }} />
                  <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive" aria-label="Tirar da tabela" onClick={() => remove(m)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <AddModelDialog open={dialog === "add"} onOpenChange={(v) => setDialog(v ? "add" : null)} existing={models} />
      <PasteDialog open={dialog === "paste"} onOpenChange={(v) => setDialog(v ? "paste" : null)} existing={models} />
      {stores.length > 1 && <CopyDialog open={dialog === "copy"} onOpenChange={(v) => setDialog(v ? "copy" : null)} existing={models} />}
      <ModelDiscountsSheet model={models.find((m) => m.id === discountsOf) ?? null} models={models} rules={rules} overrides={overrides}
        onClose={() => setDiscountsOf(null)} onSaved={() => invalidate("modelRules")} />
    </section>
  );
}

// ---------------------------------------------------------------- descontos
function RuleRow({ rule }: { rule: TradeRule }) {
  const invalidate = useInvalidateTroca();
  const run = async (fn: () => Promise<void>) => {
    try { await fn(); invalidate("rules"); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    // celular: texto em cima; tipo, valor, liga/desliga e apagar numa linha só
    <li className={cn("grid grid-cols-[minmax(0,1fr)_96px_auto_auto] items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_130px_90px_auto_auto]", !rule.active && "opacity-50")}>
      <CommitInput label="Texto da opção" value={rule.label} className="col-span-4 sm:col-span-1"
        onCommit={async (v) => { if (!v) throw new Error("O texto não pode ficar vazio"); await updateRule(rule.id, { label: v }); invalidate("rules"); }} />
      <Select value={rule.kind} onValueChange={(v) => run(() => updateRule(rule.id, { kind: v as RuleKind, amount: v === "block" ? 0 : Math.min(rule.amount, v === "pct" ? 100 : rule.amount) }))}>
        <SelectTrigger className={cn("h-10 px-2.5", rule.kind === "block" && "col-span-2")} aria-label="Tipo de desconto">
          <span className="truncate">{rule.kind === "pct" ? "%" : rule.kind === "fixed" ? "R$" : "Não compra"}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pct">% do preço base</SelectItem>
          <SelectItem value="fixed">R$ fixo</SelectItem>
          <SelectItem value="block">Não compra</SelectItem>
        </SelectContent>
      </Select>
      {rule.kind === "block" ? null : (
        <CommitInput label="Desconto" value={String(rule.amount)} inputMode="decimal" money className="tabular-nums"
          onCommit={async (v) => {
            const n = parseMoney(v)!;
            if (rule.kind === "pct" && n > 100) throw new Error("Máximo 100%");
            await updateRule(rule.id, { amount: n }); invalidate("rules");
          }} />
      )}
      <Switch checked={rule.active} aria-label={rule.active ? "Opção ativa" : "Opção escondida"}
        onCheckedChange={(v) => run(() => updateRule(rule.id, { active: v }))} />
      <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-destructive" aria-label="Apagar opção"
        onClick={() => window.confirm(`Apagar "${rule.label}"?`) && run(() => deleteRule(rule.id))}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

function RulesCard() {
  const { storeId } = useTrocaContext();
  const invalidate = useInvalidateTroca();
  const { data: rules = [], isLoading } = useRules(storeId);

  const add = async (question: TradeRule["question"]) => {
    const pos = Math.max(0, ...rules.filter((r) => r.question === question).map((r) => r.position)) + 1;
    try {
      await insertRule({ store_id: storeId, question, label: "Nova opção", kind: "pct", amount: 0, position: pos, active: true });
      invalidate("rules");
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <section className={card} aria-labelledby="t-rules">
      <h2 id="t-rules" className="font-semibold">Descontos por estado</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Padrão da loja: cada resposta desconta uma % do preço base ou um valor fixo. "Não compra" encerra a avaliação.
        Para peças que mudam de preço por aparelho (tela, bateria, câmera), ponha o valor em R$ em Modelos › Descontos.
      </p>
      {isLoading && <Skeleton className="mt-3 h-40 w-full rounded-xl" />}
      <div className="mt-3 space-y-3">
        {QUESTIONS.map((q) => {
          const list = rules.filter((r) => r.question === q.key).sort((a, b) => a.position - b.position);
          return (
            <div key={q.key} className="rounded-xl border border-border/40">
              <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
                <p className="mr-auto text-sm font-medium">{q.short}{q.multi && <span className="ml-1 font-normal text-muted-foreground">(pode marcar várias)</span>}</p>
                <Button variant="ghost" size="sm" onClick={() => add(q.key)}><Plus className="mr-1 h-4 w-4" /> Opção</Button>
              </div>
              {list.length ? <ul className="divide-y divide-border/30">{list.map((r) => <RuleRow key={r.id} rule={r} />)}</ul>
                : <p className="px-3 py-3 text-xs text-muted-foreground">Sem opções: esta pergunta não aparece para o vendedor.</p>}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Exemplo: num aparelho de {formatBRL(2000)}, 10% desconta {formatBRL(200)}.</p>
    </section>
  );
}

export default function TabelaPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 pt-4">
      <SettingsCard />
      <ModelsCard />
      <RulesCard />
    </div>
  );
}
