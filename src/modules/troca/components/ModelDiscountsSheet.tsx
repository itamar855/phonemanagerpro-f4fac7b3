import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { saveModelRules } from "../api/db";
import { formatBRL, ruleAmountLabel, toAnswerLine } from "../lib/calc";
import { parseMoney } from "../lib/priceList";
import { activeQuestions } from "../lib/wizard";
import type { TradeModel, TradeModelRule, TradeRule } from "../lib/types";

const label = (m: TradeModel) => `${m.model}${m.storage ? ` ${m.storage}` : ""}`;

/** Texto do campo a partir do valor gravado (só R$; % gravado antes vira R$ sobre o preço base). */
function draftOf(model: TradeModel, rules: TradeRule[], overrides: TradeModelRule[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of overrides.filter((x) => x.model_id === model.id)) {
    if (!rules.some((r) => r.id === o.rule_id)) continue;
    const v = o.kind === "pct" ? Math.round(model.base_price * o.amount) / 100 : o.amount;
    out[o.rule_id] = String(v).replace(".", ",");
  }
  return out;
}

/**
 * Descontos de um aparelho (modelo + capacidade), em R$. Em branco = padrão da loja.
 * Pedido do dono: a tela de um 8 Plus não custa o mesmo que a de um 15 Pro Max.
 */
export function ModelDiscountsSheet({ model, models, rules, overrides, onClose, onSaved }: {
  model: TradeModel | null;
  models: TradeModel[];
  rules: TradeRule[];
  overrides: TradeModelRule[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const groups = useMemo(() => activeQuestions(rules), [rules]);

  useEffect(() => {
    if (model) setDraft(draftOf(model, rules, overrides));
    // só ao abrir outro aparelho: não apagar o que está sendo digitado se a lista recarregar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id]);

  // outros aparelhos com valores próprios; outras capacidades do mesmo modelo primeiro
  const sources = useMemo(() => {
    if (!model) return [];
    const withValues = new Set(overrides.map((o) => o.model_id));
    const same = (m: TradeModel) => m.brand.trim().toLowerCase() === model.brand.trim().toLowerCase()
      && m.model.trim().toLowerCase() === model.model.trim().toLowerCase();
    return models
      .filter((m) => m.id !== model.id && withValues.has(m.id))
      .sort((a, b) => Number(same(b)) - Number(same(a)) || label(a).localeCompare(label(b), "pt-BR", { numeric: true }));
  }, [model, models, overrides]);

  if (!model) return null;

  const copyFrom = (id: string) => {
    const src = models.find((m) => m.id === id);
    if (!src) return;
    // copia em R$ (o mesmo valor da peça), não em %
    setDraft(draftOf(src, rules, overrides));
    toast.success(`Valores de ${label(src)} copiados. Confira e salve.`);
  };

  const save = async () => {
    const set: { rule_id: string; kind: "fixed"; amount: number }[] = [];
    const clear: string[] = [];
    const had = new Set(overrides.filter((o) => o.model_id === model.id).map((o) => o.rule_id));
    for (const r of rules) {
      if (r.kind === "block") continue;
      const text = (draft[r.id] ?? "").trim();
      if (!text) { if (had.has(r.id)) clear.push(r.id); continue; }
      const v = parseMoney(text);
      if (v === null) { toast.error(`Valor inválido em "${r.label}"`); return; }
      set.push({ rule_id: r.id, kind: "fixed", amount: v });
    }
    setSaving(true);
    try {
      await saveModelRules(model.id, set, clear);
      onSaved();
      toast.success(`Descontos do ${label(model)} salvos.`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const filled = Object.values(draft).filter((v) => v.trim()).length;

  return (
    <Sheet open={!!model} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="flex max-h-[92dvh] flex-col rounded-t-2xl p-0 sm:mx-auto sm:max-w-lg">
        <SheetHeader className="px-4 pt-4 text-left">
          <SheetTitle>Descontos do {label(model)}</SheetTitle>
          <SheetDescription>
            Valor base {formatBRL(model.base_price)}. Ponha em R$ quanto custa cada coisa neste aparelho.
            Em branco usa o padrão da loja.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          {sources.length > 0 && (
            <Select onValueChange={copyFrom}>
              <SelectTrigger className="h-11" aria-label="Copiar valores de outro aparelho">
                <div className="flex min-w-0 items-center gap-2 text-sm"><Copy className="h-4 w-4 shrink-0" /><SelectValue placeholder="Copiar de outro aparelho" /></div>
              </SelectTrigger>
              <SelectContent>
                {sources.map((m) => <SelectItem key={m.id} value={m.id}>{label(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {groups.map(({ question, options }) => (
            <div key={question.key} className="rounded-xl border border-border/40">
              <p className="border-b border-border/40 px-3 py-2 text-sm font-medium">{question.short}</p>
              <ul className="divide-y divide-border/30">
                {options.map((r) => {
                  const std = r.kind === "block" ? "Não compra"
                    : r.kind === "pct" ? `${ruleAmountLabel(r.kind, r.amount)} = ${formatBRL(toAnswerLine(r, model.base_price).value)}`
                    : formatBRL(r.amount);
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{r.label}</p>
                        {(r.kind === "block" || r.amount > 0) && <p className="text-xs text-muted-foreground">Padrão da loja: {std}</p>}
                      </div>
                      {r.kind === "block" ? (
                        <span className="shrink-0 text-xs font-semibold text-destructive">Não compra</span>
                      ) : !r.amount && !draft[r.id] ? (
                        <span className="shrink-0 text-xs text-muted-foreground">sem desconto</span>
                      ) : (
                        <div className="relative w-28 shrink-0">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                          <Input aria-label={`Desconto de ${r.label} no ${label(model)}`} inputMode="decimal" placeholder="padrão"
                            className="h-10 pl-8 text-right tabular-nums" value={draft[r.id] ?? ""}
                            onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <SheetFooter className="border-t border-border/50 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <Button className="h-12 w-full" disabled={saving} onClick={save}>
            {saving ? "Salvando…" : filled ? `Salvar (${filled} ${filled === 1 ? "valor próprio" : "valores próprios"})` : "Salvar (tudo no padrão da loja)"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
