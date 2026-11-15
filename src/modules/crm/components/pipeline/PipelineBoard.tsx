import { useEffect, useMemo, useState } from "react";
import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { positionBetween } from "../../lib/board";
import { STAGE_DOT } from "../../lib/constants";
import { brl } from "../../lib/format";
import type { CrmDealWithContact, CrmStage } from "../../lib/types";
import { DealCardView, SortableDealCard } from "./DealCard";
import { LostReasonDialog } from "./LostReasonDialog";

type Columns = Record<string, CrmDealWithContact[]>;
const COL = "col:";

function group(stages: CrmStage[], deals: CrmDealWithContact[]): Columns {
  const cols: Columns = Object.fromEntries(stages.map((s) => [s.id, [] as CrmDealWithContact[]]));
  for (const d of deals) cols[d.stage_id]?.push(d);
  for (const id of Object.keys(cols)) cols[id].sort((a, b) => a.position - b.position);
  return cols;
}

interface Props {
  stages: CrmStage[];
  deals: CrmDealWithContact[];
  summary?: Map<string, { deals: number; total: number }>;
  ownerNames: Map<string, string>;
  onOpen: (dealId: string) => void;
  onMove: (dealId: string, toStageId: string, position: number, lostReason?: string) => Promise<void>;
}

function Column({ stage, deals, summary, ownerNames, onOpen }: {
  stage: CrmStage; deals: CrmDealWithContact[]; summary?: { deals: number; total: number }; ownerNames: Map<string, string>; onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: COL + stage.id });
  const total = summary?.total ?? deals.reduce((s, d) => s + Number(d.value || 0), 0);
  const count = summary?.deals ?? deals.length;
  return (
    <section
      aria-label={`Etapa ${stage.name}`}
      className="flex h-full w-[82vw] max-w-[300px] shrink-0 snap-start flex-col rounded-xl border border-border/50 bg-muted/30 sm:w-[280px]"
    >
      <header className="flex items-center gap-2 border-b border-border/40 px-3 py-2.5">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", STAGE_DOT[stage.color ?? ""] ?? "bg-slate-400")} aria-hidden="true" />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{stage.name}</h3>
        <span className="rounded-full bg-background px-2 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>
      </header>
      <p className="px-3 pt-1.5 text-xs font-medium tabular-nums text-muted-foreground">
        {brl(total)}{stage.kind !== "open" ? " · últimos 30 dias" : ""}
      </p>
      <div ref={setNodeRef} className={cn("min-h-[120px] flex-1 space-y-2 overflow-y-auto p-2 transition-colors duration-150", isOver && "bg-primary/5")}>
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          {deals.map((d) => (
            <SortableDealCard key={d.id} deal={d} stage={stage} ownerName={d.owner_id ? ownerNames.get(d.owner_id) : undefined} onOpen={onOpen} />
          ))}
        </SortableContext>
        {deals.length === 0 && (
          <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">Arraste um negócio para cá</p>
        )}
      </div>
    </section>
  );
}

export function PipelineBoard({ stages, deals, summary, ownerNames, onOpen, onMove }: Props) {
  const [cols, setCols] = useState<Columns>(() => group(stages, deals));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingLost, setPendingLost] = useState<{ dealId: string; stageId: string; position: number; title: string } | null>(null);
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  // Sincroniza com o servidor quando não há arraste em andamento
  useEffect(() => { if (!activeId && !pendingLost) setCols(group(stages, deals)); }, [stages, deals, activeId, pendingLost]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const containerOf = (id: string) => (id.startsWith(COL) ? id.slice(COL.length) : Object.keys(cols).find((k) => cols[k].some((d) => d.id === id)));
  const active = activeId ? Object.values(cols).flat().find((d) => d.id === activeId) : null;

  function onDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)); }

  function onDragOver(e: DragOverEvent) {
    const { active: a, over } = e;
    if (!over) return;
    const from = containerOf(String(a.id));
    const to = containerOf(String(over.id));
    if (!from || !to || from === to) return;
    setCols((prev) => {
      const moving = prev[from].find((d) => d.id === a.id);
      if (!moving) return prev;
      const target = prev[to];
      const overIndex = target.findIndex((d) => d.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : target.length;
      return {
        ...prev,
        [from]: prev[from].filter((d) => d.id !== a.id),
        [to]: [...target.slice(0, insertAt), { ...moving, stage_id: to }, ...target.slice(insertAt)],
      };
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    setActiveId(null);
    if (!over) { setCols(group(stages, deals)); return; }
    const to = containerOf(String(over.id));
    if (!to) return;
    let list = cols[to];
    const oldIndex = list.findIndex((d) => d.id === a.id);
    const overIndex = list.findIndex((d) => d.id === over.id);
    if (oldIndex >= 0 && overIndex >= 0 && oldIndex !== overIndex) {
      list = arrayMove(list, oldIndex, overIndex);
      setCols((prev) => ({ ...prev, [to]: list }));
    }
    const idx = list.findIndex((d) => d.id === a.id);
    const original = deals.find((d) => d.id === a.id);
    if (idx < 0 || !original) return;
    const position = positionBetween(list[idx - 1]?.position, list[idx + 1]?.position);
    if (original.stage_id === to && Math.abs(original.position - position) < 1e-9) return;

    if (stageById.get(to)?.kind === "lost" && original.stage_id !== to) {
      setPendingLost({ dealId: original.id, stageId: to, position, title: original.title });
      return;
    }
    try { await onMove(original.id, to, position); } catch { setCols(group(stages, deals)); }
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}
        onDragCancel={() => { setActiveId(null); setCols(group(stages, deals)); }}>
        <div className="flex h-full snap-x gap-3 overflow-x-auto px-3 pb-3 md:px-6">
          {stages.map((s) => (
            <Column key={s.id} stage={s} deals={cols[s.id] ?? []} summary={summary?.get(s.id)} ownerNames={ownerNames} onOpen={onOpen} />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
          {active ? <DealCardView deal={active} stage={stageById.get(active.stage_id)} ownerName={active.owner_id ? ownerNames.get(active.owner_id) : undefined} dragging /> : null}
        </DragOverlay>
      </DndContext>
      <LostReasonDialog
        open={Boolean(pendingLost)}
        dealTitle={pendingLost?.title}
        onCancel={() => { setPendingLost(null); setCols(group(stages, deals)); }}
        onConfirm={async (reason) => {
          const p = pendingLost!;
          setPendingLost(null);
          try { await onMove(p.dealId, p.stageId, p.position, reason); } catch { setCols(group(stages, deals)); }
        }}
      />
    </>
  );
}
