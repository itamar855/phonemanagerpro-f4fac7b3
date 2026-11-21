import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Columns3, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { updateDeal } from "../api/pipeline";
import { DealDrawer } from "../components/pipeline/DealDrawer";
import { NewDealDialog } from "../components/pipeline/NewDealDialog";
import { PipelineBoard } from "../components/pipeline/PipelineBoard";
import { EmptyState } from "../components/shared/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { useCrmContext, useTeam } from "../hooks/useInbox";
import { crmIsAdmin } from "../lib/access";
import { pipelineKeys, useBoardDeals, useDealsRealtime, useInvalidateDeals, usePipelines, usePipelineSummary, useStages } from "../hooks/usePipeline";
import { pickPipelineId, visibleStages } from "../lib/board";
import { brl } from "../lib/format";
import type { CrmDealWithContact } from "../lib/types";

export default function PipelinePage() {
  const { storeId, userId, writeStoreId } = useCrmContext();
  const qc = useQueryClient();
  const invalidate = useInvalidateDeals();
  const [params, setParams] = useSearchParams();
  const { data: pipelines = [], isLoading: loadingPipes } = usePipelines(storeId);
  const pipelineId = pickPipelineId(pipelines, params.get("funil"), writeStoreId);
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const { userRole } = useAuth();
  // Admin abre em "Todos"; atendente e técnico abrem em "Meus" (dá para trocar)
  const [mineChoice, setMine] = useState<boolean | null>(null);
  const mine = mineChoice ?? !crmIsAdmin(userRole);
  const ownerFilter = mine ? userId : null;
  const { data: stages = [] } = useStages(pipelineId);
  const { data: deals = [], isLoading: loadingDeals } = useBoardDeals(pipelineId, ownerFilter);
  const { data: summary } = usePipelineSummary(pipelineId, ownerFilter);
  const { data: team = [] } = useTeam(pipeline?.store_id ?? storeId);
  const ownerNames = useMemo(() => new Map(team.map((t) => [t.user_id, t.display_name])), [team]);
  const shown = useMemo(() => visibleStages(stages), [stages]);
  const [newOpen, setNewOpen] = useState(false);
  const openDealId = params.get("negocio");
  const openDeal = deals.find((d) => d.id === openDealId) ?? null;

  useDealsRealtime(storeId);

  // Visão "todas as lojas": cada loja tem seus funis; mostra o nome da loja no seletor se houver repetição
  useEffect(() => {
    if (!params.get("funil") && pipelineId && pipelines.length) {
      const next = new URLSearchParams(params);
      next.set("funil", pipelineId);
      setParams(next, { replace: true });
    }
  }, [pipelineId, pipelines.length, params, setParams]);

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: k !== "negocio" });
  };

  const openTotal = useMemo(
    () => shown.filter((s) => s.kind === "open").reduce((sum, s) => sum + (summary?.get(s.id)?.total ?? 0), 0),
    [shown, summary],
  );

  async function move(dealId: string, toStageId: string, position: number, lostReason?: string, value?: number) {
    const key = pipelineKeys.board(pipelineId!, ownerFilter);
    const prev = qc.getQueryData<CrmDealWithContact[]>(key);
    qc.setQueryData<CrmDealWithContact[]>(key, (d) => d?.map((x) => (x.id === dealId ? { ...x, stage_id: toStageId, position, ...(value ? { value } : {}) } : x)));
    try {
      // valor e etapa no mesmo update: o evento Purchase para a Meta já sai com o valor
      await updateDeal(dealId, { stage_id: toStageId, position, ...(lostReason ? { lost_reason: lostReason } : {}), ...(value ? { value } : {}) });
      const kind = stages.find((s) => s.id === toStageId)?.kind;
      if (kind === "won") toast.success("Negócio ganho! 🎉");
      invalidate();
    } catch (e) {
      qc.setQueryData(key, prev);
      toast.error((e as Error).message);
      throw e;
    }
  }

  if (loadingPipes) return <div className="p-6"><Skeleton className="h-8 w-60" /></div>;
  if (!pipelines.length) return <EmptyState icon={Columns3} title="Nenhum funil" description="Selecione uma loja no topo para ver o funil dela." />;

  const multiStore = new Set(pipelines.map((p) => p.store_id)).size > 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3 py-3 md:px-6">
        <div role="tablist" aria-label="Funil" className="flex gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
          {pipelines.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={p.id === pipelineId}
              onClick={() => setParam("funil", p.id)}
              className={cn(
                "min-h-[36px] shrink-0 rounded-md px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                p.id === pipelineId ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.name}{multiStore && p.store?.name ? ` · ${p.store.name.replace(/^.*\((.*)\)$/, "$1")}` : ""}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Negócios de quem" className="flex gap-1 rounded-lg bg-muted/50 p-1">
          {[{ v: false, l: "Todos" }, { v: true, l: "Meus" }].map((o) => (
            <button key={o.l} role="radio" aria-checked={mine === o.v} onClick={() => setMine(o.v)}
              className={cn("min-h-[36px] rounded-md px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mine === o.v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {o.l}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Em aberto: <strong className="tabular-nums text-foreground">{brl(openTotal)}</strong>
        </p>
        <Button size="sm" className="ml-auto" onClick={() => setNewOpen(true)} disabled={!pipeline}>
          <Plus className="mr-1.5 h-4 w-4" /> Novo negócio
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        {loadingDeals ? (
          <div className="flex gap-3 px-3 md:px-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 w-[280px] shrink-0 rounded-xl" />)}</div>
        ) : (
          <PipelineBoard
            stages={shown}
            deals={deals}
            summary={summary}
            ownerNames={ownerNames}
            onOpen={(id) => setParam("negocio", id)}
            onMove={move}
          />
        )}
      </div>

      <DealDrawer deal={openDeal} stages={stages} team={team} userId={userId} onClose={() => setParam("negocio", null)} />
      <NewDealDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        pipeline={pipeline}
        stages={stages}
        team={team}
        userId={userId}
        storeId={storeId}
        onCreated={(id) => setParam("negocio", id)}
      />
    </div>
  );
}
