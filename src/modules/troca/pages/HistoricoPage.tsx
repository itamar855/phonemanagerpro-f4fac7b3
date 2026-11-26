import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Ban, CheckCircle2, History, Search, ShoppingBag, ThumbsDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { deleteEvaluation, updateEvaluation } from "../api/db";
import { AcceptDialog } from "../components/AcceptDialog";
import { EmptyState } from "../components/EmptyState";
import { useTrocaContext } from "../hooks/context";
import { useEvaluations, useInvalidateTroca, useSettings } from "../hooks/useTroca";
import { formatBRL } from "../lib/calc";
import { buildHandoff, deviceName } from "../lib/handoff";
import { QUESTION_BY_KEY } from "../lib/questions";
import type { EvalStatus, TradeEvaluation } from "../lib/types";

type Filter = "todas" | EvalStatus;
const NO_EVALS: TradeEvaluation[] = [];

const STATUS: Record<EvalStatus, { label: string; tone: string }> = {
  simulada: { label: "Vai pensar", tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  aceita: { label: "Aceita", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  recusada: { label: "Recusada", tone: "bg-muted text-muted-foreground" },
};

function StatusTag({ ev }: { ev: TradeEvaluation }) {
  if (ev.blocked) return <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">Conta presa</span>;
  const s = STATUS[ev.status];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", s.tone)}>
      {s.label}{ev.sale_id ? " · vendida" : ""}
    </span>
  );
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function HistoricoPage() {
  const { storeId, isManager } = useTrocaContext();
  const navigate = useNavigate();
  const invalidate = useInvalidateTroca();
  const { data, isLoading, isError, error } = useEvaluations(storeId);
  const settings = useSettings(storeId);
  const [filter, setFilter] = useState<Filter>("todas");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const list = data?.list ?? NO_EVALS;
  const names = data?.names ?? new Map<string, string>();
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((e) =>
      (filter === "todas" || e.status === filter) &&
      (!q || [e.customer_name, e.customer_phone, e.customer_email, e.model, e.storage, e.imei].some((v) => v?.toLowerCase().includes(q))));
  }, [list, filter, search]);
  const open = list.find((e) => e.id === openId) ?? null;

  const patch = async (p: Parameters<typeof updateEvaluation>[1], msg: string) => {
    if (!open) return;
    setBusy(true);
    try {
      await updateEvaluation(open.id, p);
      invalidate("evaluations");
      setAcceptOpen(false);
      toast.success(msg);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!open || !window.confirm("Apagar esta avaliação do histórico?")) return;
    setBusy(true);
    try {
      await deleteEvaluation(open.id);
      invalidate("evaluations");
      setOpenId(null);
      toast.success("Avaliação apagada.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handoff = open ? buildHandoff(open) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-3 pt-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, modelo ou IMEI"
          className="h-11 pl-9" aria-label="Buscar no histórico" />
      </div>
      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none]" role="radiogroup" aria-label="Situação">
        {(["todas", "simulada", "aceita", "recusada"] as Filter[]).map((f) => (
          <button key={f} role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}
            className={cn("min-h-[36px] shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
              filter === f ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            {f === "todas" ? "Todas" : STATUS[f].label}
          </button>
        ))}
      </div>

      {isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      {isError && <EmptyState icon={History} title="Não foi possível carregar" description={(error as Error).message} />}
      {!isLoading && !isError && shown.length === 0 && (
        <EmptyState icon={History} title={list.length ? "Nada com esse filtro" : "Nenhuma avaliação ainda"}
          description={list.length ? undefined : "As avaliações salvas no simulador aparecem aqui."} />
      )}

      {shown.length > 0 && (
        <ul className="glass divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/50 bg-card/70">
          {shown.map((e) => (
            <li key={e.id}>
              <button onClick={() => setOpenId(e.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{deviceName(e)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.customer_name || "Sem nome"} · {fmtDate(e.created_at)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {e.blocked ? "—" : e.status === "aceita" && e.agreed_value !== null ? formatBRL(e.agreed_value) : `até ${formatBRL(e.offer_max)}`}
                  </p>
                  <StatusTag ev={e} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:mx-auto sm:max-w-lg">
          {open && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle>{deviceName(open)}</SheetTitle>
                <SheetDescription>
                  {fmtDate(open.created_at)} · avaliado por {names.get(open.created_by ?? "") ?? "—"}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
                  <span className="text-muted-foreground">{open.blocked ? "Resultado" : "Faixa oferecida"}</span>
                  <span className="font-semibold tabular-nums">
                    {open.blocked ? "Não comprar" : `${formatBRL(open.offer_min)} a ${formatBRL(open.offer_max)}`}
                  </span>
                </div>
                {open.status === "aceita" && open.agreed_value !== null && (
                  <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 p-3">
                    <span className="text-emerald-700 dark:text-emerald-300">Fechou por</span>
                    <span className="font-bold tabular-nums">{formatBRL(open.agreed_value)}</span>
                  </div>
                )}
                <dl className="divide-y divide-border/40">
                  <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">Preço base</dt><dd className="tabular-nums">{formatBRL(open.base_price)}</dd></div>
                  {open.answers.map((a, i) => (
                    <div key={i} className="flex justify-between gap-3 py-2">
                      <dt className="min-w-0 text-muted-foreground">{QUESTION_BY_KEY.get(a.question)?.short}: {a.label}</dt>
                      <dd className={cn("shrink-0 tabular-nums", (a.value > 0 || a.kind === "block") && "text-destructive")}>
                        {a.kind === "block" ? "Não compra" : a.value > 0 ? `−${formatBRL(a.value)}` : "ok"}
                      </dd>
                    </div>
                  ))}
                  {open.customer_name && <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">Cliente</dt><dd>{open.customer_name}</dd></div>}
                  {open.customer_phone && <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">WhatsApp</dt><dd>{open.customer_phone}</dd></div>}
                  {open.customer_email && <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">E-mail</dt><dd className="min-w-0 truncate">{open.customer_email}</dd></div>}
                  {open.imei && <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">IMEI</dt><dd className="tabular-nums">{open.imei}</dd></div>}
                  {open.notes && <div className="py-2"><dt className="text-muted-foreground">Observação</dt><dd className="mt-1 whitespace-pre-wrap">{open.notes}</dd></div>}
                </dl>

                <div className="grid gap-2 pb-2">
                  {handoff && (
                    <Button className="h-12 text-base" onClick={() => navigate("/vendas", { state: { tradeIn: handoff } })}>
                      <ShoppingBag className="mr-2 h-5 w-5" /> Usar na venda
                    </Button>
                  )}
                  {!open.blocked && open.status !== "aceita" && (
                    <Button className="h-12" disabled={busy} onClick={() => setAcceptOpen(true)}>
                      <CheckCircle2 className="mr-2 h-5 w-5" /> Cliente aceitou
                    </Button>
                  )}
                  {open.status !== "recusada" && !open.sale_id && (
                    <Button variant="outline" className="h-12" disabled={busy}
                      onClick={() => patch({ status: "recusada", agreed_value: null }, "Marcada como recusada.")}>
                      {open.blocked ? <Ban className="mr-2 h-4 w-4" /> : <ThumbsDown className="mr-2 h-4 w-4" />} Recusou
                    </Button>
                  )}
                  {isManager && (
                    <Button variant="ghost" className="h-11 text-destructive hover:text-destructive" disabled={busy} onClick={remove}>
                      <Trash2 className="mr-2 h-4 w-4" /> Apagar do histórico
                    </Button>
                  )}
                </div>
              </div>
              <AcceptDialog open={acceptOpen} onOpenChange={setAcceptOpen} offerMin={open.offer_min} offerMax={open.offer_max}
                roundTo={settings.data?.round_to ?? 10} busy={busy}
                onConfirm={(v) => patch({ status: "aceita", agreed_value: v }, "Troca aceita.")} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
