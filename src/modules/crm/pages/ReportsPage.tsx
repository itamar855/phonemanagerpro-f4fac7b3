import { useMemo, useState } from "react";
import { BarChart3, Clock, MessagesSquare, Target, Trophy, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { crmReport, type CrmReport } from "../api/reports";
import { EmptyState } from "../components/shared/EmptyState";
import { useCrmContext, useTeam } from "../hooks/useInbox";
import { ORIGIN_LABEL } from "../lib/constants";
import { brl } from "../lib/format";
import { minutesLabel, pct, PERIOD_LABEL, periodRange, type PeriodKey } from "../lib/period";

type Metric = "conversations" | "deals_created" | "won_value";
const METRIC_LABEL: Record<Metric, string> = { conversations: "Conversas novas", deals_created: "Negócios criados", won_value: "Valor ganho" };

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="radio" aria-checked={active} onClick={onClick}
      className={cn("min-h-[36px] shrink-0 rounded-full border px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Trophy; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-3 md:p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}</p>
      <p className="mt-1 font-display text-xl font-bold tabular-nums md:text-2xl">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border/50 bg-card p-4", className)} aria-label={title}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Barra horizontal com rótulo e valor em texto (a cor não carrega informação sozinha). */
function HBar({ label, value, max, detail }: { label: string; value: number; max: number; detail?: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground"><strong className="text-foreground">{value}</strong>{detail ? ` · ${detail}` : ""}</span>
      </div>
      <div className="h-2 rounded-full bg-muted" aria-hidden="true">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${w}%` }} />
      </div>
    </li>
  );
}

function DailyChart({ series, metric }: { series: CrmReport["series"]; metric: Metric }) {
  const data = series.map((s) => ({ ...s, label: format(parseISO(s.day), "dd/MM", { locale: ptBR }) }));
  const money = metric === "won_value";
  return (
    <div className="h-56 w-full" role="img" aria-label={`${METRIC_LABEL[metric]} por dia`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={money ? 64 : 36}
            tickFormatter={(v: number) => (money ? brl(v).replace(/\s/g, " ") : String(v))} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--popover-foreground))" }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            itemStyle={{ color: "hsl(var(--popover-foreground))" }}
            formatter={(v: number) => [money ? brl(v) : v, METRIC_LABEL[metric]]}
          />
          <Bar dataKey={metric} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ReportsPage() {
  const { storeId } = useCrmContext();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [kind, setKind] = useState<"sales" | "service">("sales");
  const [metric, setMetric] = useState<Metric>("conversations");
  const range = useMemo(() => periodRange(period), [period]);
  const { data: r, isLoading, isError, error } = useQuery({
    queryKey: ["crm", "report", storeId, period, kind],
    queryFn: () => crmReport({ storeId, from: range.from, to: range.to, kind }),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
  const { data: team = [] } = useTeam(storeId);
  const names = useMemo(() => new Map(team.map((t) => [t.user_id, t.display_name])), [team]);

  const t = r?.totals;
  const closed = (t?.won ?? 0) + (t?.lost ?? 0);
  const winRate = t ? pct(t.won, closed) : null;
  const within15 = t ? pct(t.resp_within_15, t.answered) : null;
  const funnelTop = r?.funnel[0]?.deals ?? 0;
  const lostMax = Math.max(0, ...(r?.lost_reasons ?? []).map((x) => x.count));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 p-3 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 overflow-x-auto" role="radiogroup" aria-label="Período">
            {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((k) => <Chip key={k} active={period === k} onClick={() => setPeriod(k)}>{PERIOD_LABEL[k]}</Chip>)}
          </div>
          <div className="flex gap-1" role="radiogroup" aria-label="Funil">
            <Chip active={kind === "sales"} onClick={() => setKind("sales")}>Vendas</Chip>
            <Chip active={kind === "service"} onClick={() => setKind("service")}>Assistência</Chip>
          </div>
        </div>

        {isError && <EmptyState icon={BarChart3} title="Não foi possível carregar" description={(error as Error).message} />}
        {isLoading && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        )}

        {r && t && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi icon={MessagesSquare} label="Conversas novas" value={String(t.conversations)}
                hint={t.conv_instagram > 0 ? `${t.conv_whatsapp} WhatsApp · ${t.conv_instagram} Instagram` : t.unanswered > 0 ? `${t.unanswered} sem resposta` : undefined} />
              <Kpi icon={Clock} label="1ª resposta (mediana)" value={minutesLabel(t.resp_median_min)}
                hint={within15 !== null ? `${within15}% em até 15 min` : "sem conversas respondidas"} />
              <Kpi icon={Trophy} label="Ganhos no período" value={brl(t.won_value)}
                hint={`${t.won} negócio(s)${winRate !== null ? ` · ${winRate}% de conversão` : ""}`} />
              <Kpi icon={Wallet} label="Em aberto agora" value={brl(t.open_value)} hint={`${t.open} negócio(s) no funil`} />
            </div>

            <Panel title="Por dia">
              <div className="mb-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Indicador do gráfico">
                {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => <Chip key={m} active={metric === m} onClick={() => setMetric(m)}>{METRIC_LABEL[m]}</Chip>)}
              </div>
              <DailyChart series={r.series} metric={metric} />
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title={`Funil · negócios criados no período (${t.deals_created})`}>
                {funnelTop === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum negócio criado neste período.</p>
                ) : (
                  <ol className="space-y-3">
                    {r.funnel.map((f, i) => {
                      const prev = i > 0 ? r.funnel[i - 1].deals : null;
                      const step = prev !== null ? pct(f.deals, prev) : null;
                      return (
                        <HBar key={f.key} label={f.name} value={f.deals} max={funnelTop}
                          detail={i === 0 ? "100%" : `${pct(f.deals, funnelTop)}% do início${step !== null ? ` · ${step}% da etapa anterior` : ""}`} />
                      );
                    })}
                  </ol>
                )}
                {t.avg_days_to_win !== null && (
                  <p className="mt-3 text-xs text-muted-foreground">Tempo médio até ganhar: <strong className="text-foreground">{String(t.avg_days_to_win).replace(".", ",")} dia(s)</strong></p>
                )}
              </Panel>

              <Panel title={`Motivos de perda (${t.lost})`}>
                {r.lost_reasons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum negócio perdido neste período.</p>
                ) : (
                  <ul className="space-y-3">
                    {r.lost_reasons.map((x) => <HBar key={x.reason} label={x.reason} value={x.count} max={lostMax} detail={`${pct(x.count, t.lost)}%`} />)}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Origem dos negócios">
                {r.by_origin.length === 0 ? <p className="text-sm text-muted-foreground">Sem negócios no período.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr><th className="py-1.5 font-medium">Origem</th><th className="py-1.5 text-right font-medium">Criados</th><th className="py-1.5 text-right font-medium">Ganhos</th><th className="py-1.5 text-right font-medium">Valor ganho</th></tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 tabular-nums">
                        {r.by_origin.map((o) => (
                          <tr key={o.origin}>
                            <td className="py-2">{ORIGIN_LABEL[o.origin] ?? o.origin}</td>
                            <td className="py-2 text-right">{o.created}</td>
                            <td className="py-2 text-right">{o.won}{pct(o.won, o.created) !== null ? <span className="text-muted-foreground"> ({pct(o.won, o.created)}%)</span> : null}</td>
                            <td className="py-2 text-right">{brl(o.won_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel title="Por vendedor">
                {r.by_owner.length === 0 ? <p className="text-sm text-muted-foreground">Sem negócios no período.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr><th className="py-1.5 font-medium">Responsável</th><th className="py-1.5 text-right font-medium">Ganhos</th><th className="py-1.5 text-right font-medium">Perdidos</th><th className="py-1.5 text-right font-medium">Em aberto</th></tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 tabular-nums">
                        {r.by_owner.map((o) => (
                          <tr key={o.owner_id ?? "none"}>
                            <td className="py-2">{o.owner_id ? names.get(o.owner_id) ?? "Colega" : <span className="text-muted-foreground">Sem responsável</span>}</td>
                            <td className="py-2 text-right">{o.won} · {brl(o.won_value)}</td>
                            <td className="py-2 text-right">{o.lost}</td>
                            <td className="py-2 text-right">{o.open} · {brl(o.open_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Tarefas">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Concluídas no período</dt><dd className="text-lg font-semibold tabular-nums">{r.tasks.done}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">No prazo</dt><dd className="text-lg font-semibold tabular-nums">{pct(r.tasks.done_on_time, r.tasks.done) ?? "—"}{r.tasks.done > 0 ? "%" : ""}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Criadas no período</dt><dd className="text-lg font-semibold tabular-nums">{r.tasks.created}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Atrasadas agora</dt><dd className={cn("text-lg font-semibold tabular-nums", r.tasks.overdue_now > 0 && "text-destructive")}>{r.tasks.overdue_now}</dd></div>
                </dl>
              </Panel>

              {r.handoff.sent > 0 ? (
                <Panel title="Instagram → WhatsApp">
                  <dl className="grid grid-cols-3 gap-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Chamados</dt><dd className="text-lg font-semibold tabular-nums">{r.handoff.sent}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Chegaram</dt><dd className="text-lg font-semibold tabular-nums">{r.handoff.completed} <span className="text-xs font-normal text-muted-foreground">({pct(r.handoff.completed, r.handoff.sent)}%)</span></dd></div>
                    <div><dt className="text-xs text-muted-foreground">Tempo médio</dt><dd className="text-lg font-semibold tabular-nums">{r.handoff.avg_hours !== null ? `${String(r.handoff.avg_hours).replace(".", ",")} h` : "—"}</dd></div>
                  </dl>
                </Panel>
              ) : (
                <Panel title="Atendimento">
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Respondidas</dt><dd className="text-lg font-semibold tabular-nums">{t.answered}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Sem resposta</dt><dd className={cn("text-lg font-semibold tabular-nums", t.unanswered > 0 && "text-destructive")}>{t.unanswered}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">1ª resposta (média)</dt><dd className="text-lg font-semibold tabular-nums">{minutesLabel(t.resp_avg_min)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground"><Target className="mr-1 inline h-3 w-3" aria-hidden="true" />Em até 15 min</dt><dd className="text-lg font-semibold tabular-nums">{within15 ?? "—"}{within15 !== null ? "%" : ""}</dd></div>
                  </dl>
                </Panel>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
