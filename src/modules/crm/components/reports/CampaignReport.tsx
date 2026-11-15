import { Fragment, useMemo, useState } from "react";
import { ChevronRight, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addSpend, spendReport } from "../../api/adCodes";
import { trackingReport } from "../../api/tracking";
import { useCrmContext } from "../../hooks/useInbox";
import { byCampaign, bySource, costs, type Totals } from "../../lib/campaignReport";
import { brl } from "../../lib/format";
import { pct } from "../../lib/period";

const MANAGER = new Set(["admin", "gerente", "dono"]);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function Cells({ t, spend }: { t: Totals; spend: number | null }) {
  const c = costs(t, spend);
  return (
    <>
      <td className="py-2 text-right">{t.contacts}</td>
      <td className="py-2 text-right">{t.replied}{pct(t.replied, t.contacts) !== null && <span className="text-muted-foreground"> {pct(t.replied, t.contacts)}%</span>}</td>
      <td className="py-2 text-right">{t.won}{pct(t.won, t.contacts) !== null && <span className="text-muted-foreground"> {pct(t.won, t.contacts)}%</span>}</td>
      <td className="py-2 text-right">{brl(t.revenue)}</td>
      <td className="py-2 text-right">{spend !== null ? brl(spend) : "—"}</td>
      <td className="py-2 text-right">{c.cpl !== null ? brl(c.cpl) : "—"}</td>
      <td className="py-2 text-right">{c.cpv !== null ? brl(c.cpv) : "—"}</td>
      <td className={cn("py-2 text-right font-medium", c.roas !== null && (c.roas >= 1 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"))}>
        {c.roas !== null ? `${c.roas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x` : "—"}
      </td>
    </>
  );
}

function SpendForm({ campaign, from, to, onDone }: { campaign: string; from: Date; to: Date; onDone: () => void }) {
  const { storeId, writeStoreId, userId } = useCrmContext();
  const [amount, setAmount] = useState("");
  const [start, setStart] = useState(iso(from));
  const [end, setEnd] = useState(iso(new Date(to.getTime() - 1)));
  const [saving, setSaving] = useState(false);
  return (
    <form className="flex flex-wrap items-end gap-2 rounded-md bg-muted/40 p-2" onSubmit={async (e) => {
      e.preventDefault();
      const v = Number(amount.replace(/\./g, "").replace(",", "."));
      const store = storeId ?? writeStoreId;
      if (!store || !userId || !(v >= 0) || !start || !end) return;
      setSaving(true);
      try { await addSpend({ storeId: store, userId, campaign, start, end, amount: v }); toast.success("Investimento registrado."); onDone(); }
      catch (err) { toast.error((err as Error).message); }
      finally { setSaving(false); }
    }}>
      <label className="text-xs">Investido (R$)<Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} className="h-9 w-28" required /></label>
      <label className="text-xs">De<Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9" required /></label>
      <label className="text-xs">Até<Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9" required /></label>
      <Button type="submit" size="sm" className="h-9" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
    </form>
  );
}

/** Funis comparados + campanha › conjunto › anúncio, com investimento, custo por lead/venda e retorno. */
export function CampaignReport({ storeId, from, to }: { storeId: string | null; from: Date; to: Date }) {
  const qc = useQueryClient();
  const { userRole } = useCrmContext();
  const canEdit = MANAGER.has(String(userRole ?? ""));
  const [kind, setKind] = useState<"repair" | "sales" | null>(null);
  const key = [storeId, from.toISOString(), to.toISOString()];
  const { data: rows = [] } = useQuery({
    queryKey: ["crm", "report-campaigns", ...key, kind],
    queryFn: () => trackingReport(storeId, from, to, kind),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
  const { data: spend = new Map<string, number>() } = useQuery({ queryKey: ["crm", "report-spend", ...key], queryFn: () => spendReport(storeId, from, to), staleTime: 60_000 });
  const sources = useMemo(() => bySource(rows), [rows]);
  const camps = useMemo(() => byCampaign(rows, spend), [rows, spend]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const filter = (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Tipo de negócio">
      {([[null, "Tudo"], ["sales", "Aparelho / acessório"], ["repair", "Conserto"]] as const).map(([v, l]) => (
        <button key={l} role="radio" aria-checked={kind === v} onClick={() => setKind(v)}
          className={cn("min-h-[36px] rounded-full border px-3 text-xs font-medium", kind === v ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
          {l}
        </button>
      ))}
    </div>
  );

  if (!rows.length) {
    return (
      <section className="space-y-2 rounded-xl border border-border/50 bg-card p-4">
        <h2 className="text-sm font-semibold">Campanhas e funis</h2>
        {filter}
        <p className="text-sm text-muted-foreground">
          {kind ? "Nada deste tipo no período." : "Ainda sem origem rastreada no período. Cadastre os códigos de anúncio em Ajustes → Rastreamento e use o “Lead do Instagram”."}
        </p>
      </section>
    );
  }

  const head = (
    <thead className="text-left text-xs text-muted-foreground">
      <tr>
        <th className="py-1.5 font-medium" />
        <th className="py-1.5 text-right font-medium">Leads</th>
        <th className="py-1.5 text-right font-medium">Responderam</th>
        <th className="py-1.5 text-right font-medium">Vendas</th>
        <th className="py-1.5 text-right font-medium">Receita</th>
        <th className="py-1.5 text-right font-medium">Investido</th>
        <th className="py-1.5 text-right font-medium">Custo/lead</th>
        <th className="py-1.5 text-right font-medium">Custo/venda</th>
        <th className="py-1.5 text-right font-medium">Retorno</th>
      </tr>
    </thead>
  );

  return (
    <section className="space-y-4 rounded-xl border border-border/50 bg-card p-4" aria-label="Campanhas e funis">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Funis comparados (contatos novos no período)</h2>
          {filter}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((s) => (
            <div key={s.source} className="rounded-lg border border-border/50 p-3 text-sm">
              <p className="font-medium">{s.source}</p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {s.contacts} leads · {pct(s.replied, s.contacts) ?? 0}% responderam · {s.won} vendas ({pct(s.won, s.contacts) ?? 0}%)
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {brl(s.revenue)}
                {s.won > 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">ticket médio {brl(s.revenue / s.won)}</span>}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-sm font-semibold">Campanha › conjunto › anúncio</h2>
        <p className="mb-2 text-xs text-muted-foreground">Toque na campanha para abrir os conjuntos e anúncios. O investimento é digitado (o CRM não lê o gasto da Meta) e dividido pelos dias do período.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            {head}
            <tbody className="divide-y divide-border/40 tabular-nums">
              {camps.map((c) => {
                const k = `${c.source}|${c.name}`;
                const isOpen = open.has(k);
                return (
                  <Fragment key={k}>
                    <tr>
                      <td className="py-2">
                        <button onClick={() => toggle(k)} className="flex items-center gap-1 text-left font-medium" aria-expanded={isOpen}>
                          <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-90")} aria-hidden="true" />
                          <span>{c.name}</span>
                        </button>
                        <p className="pl-5 text-xs text-muted-foreground">{c.source}</p>
                        {canEdit && c.name !== "—" && (
                          <button onClick={() => setEditing(editing === k ? null : k)} className="ml-5 mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            <Plus className="h-3 w-3" /> investimento
                          </button>
                        )}
                      </td>
                      <Cells t={c} spend={c.spend} />
                    </tr>
                    {editing === k && (
                      <tr><td colSpan={9} className="pb-2">
                        <SpendForm campaign={c.name} from={from} to={to} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["crm", "report-spend"] }); }} />
                      </td></tr>
                    )}
                    {isOpen && c.adsets.map((s) => (
                      <Fragment key={`${k}|${s.name}`}>
                        <tr className="bg-muted/20">
                          <td className="py-1.5 pl-6 text-sm">{s.name === "—" ? <span className="text-muted-foreground">(sem conjunto)</span> : s.name}</td>
                          <Cells t={s} spend={null} />
                        </tr>
                        {s.ads.map((a) => (
                          <tr key={`${k}|${s.name}|${a.name}`} className="bg-muted/10 text-xs">
                            <td className="py-1.5 pl-10">{a.name === "—" ? <span className="text-muted-foreground">(sem anúncio)</span> : a.name}</td>
                            <Cells t={a} spend={null} />
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
