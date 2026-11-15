import { forwardRef, type HTMLAttributes } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysInStage, stageFreshness } from "../../lib/board";
import { INTEREST_LABEL } from "../../lib/constants";
import { brl, initials } from "../../lib/format";
import type { CrmDealWithContact, CrmStage } from "../../lib/types";

const FRESH = { ok: "text-emerald-600 dark:text-emerald-400", warn: "text-amber-600 dark:text-amber-400", late: "text-destructive" };

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  deal: CrmDealWithContact;
  stage?: CrmStage;
  ownerName?: string;
  dragging?: boolean;
}

export const DealCardView = forwardRef<HTMLDivElement, CardProps>(({ deal, stage, ownerName, dragging, className, ...rest }, ref) => {
  const fresh = stage && stage.kind === "open" ? stageFreshness(deal.stage_entered_at, stage.sla_hours) : "ok";
  const days = daysInStage(deal.stage_entered_at);
  return (
    <div
      ref={ref}
      {...rest}
      className={cn(
        "group cursor-grab touch-manipulation select-none rounded-lg border border-border/60 bg-card p-3 text-left shadow-sm transition-shadow duration-150",
        "hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
        dragging && "rotate-1 shadow-lg ring-2 ring-primary/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{deal.title}</p>
        {deal.value > 0 && <span className="shrink-0 text-sm font-semibold tabular-nums">{brl(deal.value)}</span>}
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{deal.contact?.name}</p>
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        {deal.interest && <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{INTEREST_LABEL[deal.interest]}</span>}
        {deal.origin_channel === "instagram" && <span className="rounded bg-pink-500/10 px-1.5 py-0.5 text-pink-600 dark:text-pink-400">Instagram</span>}
        {stage?.kind === "open" && (
          <span className={cn("ml-auto inline-flex items-center gap-0.5 tabular-nums", FRESH[fresh])} title="Dias nesta etapa">
            <Clock className="h-3 w-3" aria-hidden="true" /> {days}d
          </span>
        )}
        {ownerName && (
          <span
            className={cn("flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary", stage?.kind !== "open" && "ml-auto")}
            title={`Responsável: ${ownerName}`}
          >
            {initials(ownerName)}
          </span>
        )}
      </div>
    </div>
  );
});
DealCardView.displayName = "DealCardView";

export function SortableDealCard({ deal, stage, ownerName, onOpen }: { deal: CrmDealWithContact; stage: CrmStage; ownerName?: string; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id, data: { stageId: deal.stage_id } });
  return (
    <DealCardView
      ref={setNodeRef}
      deal={deal}
      stage={stage}
      ownerName={ownerName}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      aria-label={`${deal.title}, ${deal.contact?.name ?? ""}. Enter para abrir, espaço para mover.`}
      onClick={() => onOpen(deal.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(deal.id);
        listeners?.onKeyDown?.(e);
      }}
    />
  );
}
