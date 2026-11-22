import { Fragment, useMemo, useState } from "react";
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { adsReport } from "../../api/tracking";
import { adCosts, adsTotals, adsTree, adVerdict, matchRate, type AdTotals } from "../../lib/adsReport";
import { brl } from "../../lib/format";

const money = (v: number | null) => (v === null ? "—" : brl(v));

function Verdict({ t }: { t: AdTotals }) {
  const v = adVerdict(t);
  if (!v) return null;
  const up = v === "escalar";
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn("ml-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase",
      up ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-destructive/15 text-destructive")}>
      <Icon className="h-3 w-3" aria-hidden="true" /> {up ? "escalar" : "cortar"}
    </span>
  );
}

function Cells({ t }: { t: AdTotals }) {
  const c = adCosts(t);
  return (
    <>
      <td className="py-2 text-right">{money(t.spend || null)}</td>
      <td className="py-2 text-right">{t.conversations || "—"}</td>
      <td className="py-2 text-right">{t.leads}</td>
      <td className="py-2 text-right">{t.won}</td>
      <td className="py-2 text-right">{brl(t.revenue)}</td>
      <td className="py-2 text-right">{money(c.perLead)}</td>
      <td className="py-2 text-right">{money(c.perSale)}</td>
      <td className={cn("py-2 text-right font-medium", c.roas !== null && (c.roas >= 1 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"))}>
        {c.roas !== null ? `${c.roas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x` : "—"}
      </td>
    </>
  );
}

/** Anúncio a anúncio: o que a Meta cobrou × o que virou venda no CRM. */
export function AdsReport({ storeId, from, to }: { storeId: string | null; from: Date; to: Date }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["crm", "report-ads", storeId, from.toISOString(), to.toISOString()],
    queryFn: () => adsReport(storeId, from, to),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
  const tree = useMemo(() => adsTree(rows), [rows]);
  const total = useMemo(() => adsTotals(rows), [rows]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  if (isLoading && !rows.length) return null;
  if (!rows.length) {
    return (
      <section className="space-y-1 rounded-xl border border-border/50 bg-card p-4">
        <h2 className="text-sm font-semibold">Anúncios da Meta</h2>
        <p className="text-sm text-muted-foreground">
          Nenhum anúncio no período. Coloque a conta de anúncios em Ajustes → Rastreamento para o gasto entrar sozinho; os leads de anúncio aparecem aqui assim que chegarem.
        </p>
      </section>
    );
  }

  const c = adCosts(total);
  const match = matchRate(total);
  const kpis = [
    { label: "Investido", value: money(total.spend || null) },
    { label: "Vendas", value: `${total.won} · ${brl(total.revenue)}` },
    { label: "Custo por venda", value: money(c.perSale) },
    { label: "Retorno", value: c.roas !== null ? `${c.roas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x` : "—" },
  ];

  return (
    <section className="space-y-3 rounded-xl border border-border/50 bg-card p-4" aria-label="Anúncios da Meta">
      <div>
        <h2 className="text-sm font-semibold">Anúncios da Meta · gasto × vendas</h2>
        <p className="text-xs text-muted-foreground">
          Gasto e conversas vêm da Meta; leads, vendas e receita vêm do CRM (contatos novos no período). “Cortar” = gastou e não vendeu ou vendeu menos que gastou;
          “escalar” = retorno de 3x ou mais.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-border/50 p-2.5">
            <p className="text-[11px] text-muted-foreground">{k.label}</p>
            <p className="text-sm font-semibold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>
      {match !== null && match < 0.6 && (
        <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
          A Meta contou {total.conversations} conversas e o CRM identificou {total.leads} leads desses anúncios. Parte das conversas pode estar chegando sem
          os dados do anúncio — veja “Saúde do rastreamento” em Ajustes.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 font-medium" />
              <th className="py-1.5 text-right font-medium">Investido</th>
              <th className="py-1.5 text-right font-medium">Conversas (Meta)</th>
              <th className="py-1.5 text-right font-medium">Leads (CRM)</th>
              <th className="py-1.5 text-right font-medium">Vendas</th>
              <th className="py-1.5 text-right font-medium">Receita</th>
              <th className="py-1.5 text-right font-medium">Custo/lead</th>
              <th className="py-1.5 text-right font-medium">Custo/venda</th>
              <th className="py-1.5 text-right font-medium">Retorno</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 tabular-nums">
            {tree.map((camp) => {
              const isOpen = open.has(camp.key);
              return (
                <Fragment key={camp.key}>
                  <tr>
                    <td className="py-2">
                      <button onClick={() => toggle(camp.key)} className="flex min-h-[32px] items-center gap-1 text-left font-medium" aria-expanded={isOpen}>
                        <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-90")} aria-hidden="true" />
                        <span>{camp.name}</span><Verdict t={camp} />
                      </button>
                    </td>
                    <Cells t={camp} />
                  </tr>
                  {isOpen && camp.adsets.map((set) => (
                    <Fragment key={`${camp.key}|${set.key}`}>
                      <tr className="bg-muted/20">
                        <td className="py-1.5 pl-6">{set.name === "—" ? <span className="text-muted-foreground">(sem conjunto)</span> : set.name}<Verdict t={set} /></td>
                        <Cells t={set} />
                      </tr>
                      {set.ads.map((ad) => (
                        <tr key={`${camp.key}|${set.key}|${ad.id}`} className="bg-muted/10 text-xs">
                          <td className="py-1.5 pl-10">{ad.name}<Verdict t={ad} /></td>
                          <Cells t={ad} />
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
    </section>
  );
}
