import { useMemo, useState } from "react";
import { ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeam } from "../../hooks/useInbox";
import { useEntityTasks } from "../../hooks/useTasks";
import type { CrmTaskWithLinks } from "../../lib/types";
import { TaskDialog, type TaskPreset } from "./TaskDialog";
import { TaskItem } from "./TaskItem";

interface Props {
  preset: TaskPreset;
  userId: string | null;
  /** Lista tarefas do negócio (senão, as do contato) */
  byDeal?: boolean;
}

/** Bloco "Tarefas" da ficha do contato e da gaveta do negócio. */
export function EntityTasks({ preset, userId, byDeal }: Props) {
  const { data: tasks = [], isLoading } = useEntityTasks(byDeal ? { dealId: preset.dealId ?? undefined } : { contactId: preset.contact?.id });
  const { data: team = [] } = useTeam(preset.storeId);
  const names = useMemo(() => new Map(team.map((t) => [t.user_id, t.display_name])), [team]);
  const [dialog, setDialog] = useState<{ open: boolean; task: CrmTaskWithLinks | null }>({ open: false, task: null });
  const open = tasks.filter((t) => !t.done_at);

  return (
    <section className="space-y-2" aria-labelledby={`tasks-${preset.dealId ?? preset.contact?.id}`}>
      <div className="flex items-center justify-between">
        <h3 id={`tasks-${preset.dealId ?? preset.contact?.id}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tarefas{open.length > 0 ? ` (${open.length})` : ""}
        </h3>
        <Button size="sm" variant="ghost" className="h-8" onClick={() => setDialog({ open: true, task: null })}>
          <Plus className="mr-1 h-4 w-4" /> Nova
        </Button>
      </div>
      {!isLoading && tasks.length === 0 ? (
        <p className="flex items-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          <ListTodo className="h-4 w-4" aria-hidden="true" /> Nenhuma tarefa. Agende um retorno para não esquecer.
        </p>
      ) : (
        <ul className="divide-y divide-border/40 rounded-md border border-border/50 empty:hidden">
          {tasks.map((t) => (
            <TaskItem key={t.id} task={t} userId={userId} names={names} compact onEdit={(task) => setDialog({ open: true, task })} />
          ))}
        </ul>
      )}
      <TaskDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        task={dialog.task}
        preset={preset}
        fallbackStoreId={preset.storeId}
        team={team}
        userId={userId}
      />
    </section>
  );
}
