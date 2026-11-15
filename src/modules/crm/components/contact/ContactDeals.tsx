import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCrmContext, useTeam } from "../../hooks/useInbox";
import { useContactDeals, usePipelines, useStages } from "../../hooks/usePipeline";
import { brl } from "../../lib/format";
import type { CrmContact } from "../../lib/types";
import { NewDealDialog } from "../pipeline/NewDealDialog";

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Aberto", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  won: { label: "Ganho", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  lost: { label: "Perdido", cls: "bg-muted text-muted-foreground" },
};

/** Negócios do contato + criar novo (usado no painel da conversa e na ficha do contato). */
export function ContactDeals({ contact }: { contact: Pick<CrmContact, "id" | "name" | "phone" | "store_id" | "origin_channel"> }) {
  const { userId } = useCrmContext();
  const { data: deals = [] } = useContactDeals(contact.id);
  const { data: pipelines = [] } = usePipelines(contact.store_id);
  const pipeline = pipelines.find((p) => p.is_default) ?? pipelines[0];
  const { data: stages = [] } = useStages(pipeline?.id);
  const { data: team = [] } = useTeam(contact.store_id);
  const [open, setOpen] = useState(false);
  const stageName = (id: string) => stages.find((s) => s.id === id)?.name;

  return (
    <section aria-labelledby={`deals-${contact.id}`} className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h3 id={`deals-${contact.id}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Negócios</h3>
        <Button variant="ghost" size="sm" className="h-8" onClick={() => setOpen(true)} disabled={!pipeline}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Novo
        </Button>
      </div>
      {deals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum negócio ainda.</p>
      ) : (
        deals.map((d) => (
          <Link
            key={d.id}
            to={`/crm/funil?funil=${d.pipeline_id}&negocio=${d.id}`}
            className="flex items-center gap-2 rounded-md border border-border/50 p-2 text-sm hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{d.title}</p>
              <p className="truncate text-xs text-muted-foreground">{stageName(d.stage_id) ?? (d.status === "open" ? "Em andamento" : "")}</p>
            </div>
            {d.value > 0 && <span className="text-xs font-semibold tabular-nums">{brl(d.value)}</span>}
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", STATUS[d.status]?.cls)}>{STATUS[d.status]?.label}</span>
          </Link>
        ))
      )}
      <NewDealDialog
        open={open}
        onOpenChange={setOpen}
        pipeline={pipeline}
        stages={stages}
        team={team}
        userId={userId}
        storeId={contact.store_id}
        presetContact={{ id: contact.id, name: contact.name, phone: contact.phone, store_id: contact.store_id, origin_channel: contact.origin_channel }}
      />
    </section>
  );
}
