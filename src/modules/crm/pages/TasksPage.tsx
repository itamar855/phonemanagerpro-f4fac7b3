import { useMemo, useState } from "react";
import { CheckCircle2, ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TaskScope } from "../api/tasks";
import { EmptyState } from "../components/shared/EmptyState";
import { TaskDialog } from "../components/tasks/TaskDialog";
import { TaskItem } from "../components/tasks/TaskItem";
import { useCrmContext, useTeam } from "../hooks/useInbox";
import { useTasks, useTasksRealtime } from "../hooks/useTasks";
import { BUCKET_LABEL, groupTasks } from "../lib/tasks";
import type { CrmTaskWithLinks } from "../lib/types";

type View = "open" | "done";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="radio" aria-checked={active} onClick={onClick}
      className={cn("min-h-[36px] rounded-full border px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}

export default function TasksPage() {
  const { storeId, writeStoreId, userId } = useCrmContext();
  const [scope, setScope] = useState<TaskScope>("mine");
  const [view, setView] = useState<View>("open");
  const [dialog, setDialog] = useState<{ open: boolean; task: CrmTaskWithLinks | null }>({ open: false, task: null });
  const { data: tasks = [], isLoading, isError, error } = useTasks(storeId, userId, scope, view === "done");
  const { data: team = [] } = useTeam(storeId);
  const names = useMemo(() => new Map(team.map((t) => [t.user_id, t.display_name])), [team]);
  useTasksRealtime(storeId);

  const groups = useMemo(() => (view === "open" ? groupTasks(tasks) : [{ bucket: "done" as const, tasks }]), [tasks, view]);
  const overdue = view === "open" ? tasks.filter((t) => t.due_at && new Date(t.due_at) < new Date()).length : 0;
  const edit = (task: CrmTaskWithLinks) => setDialog({ open: true, task });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3 py-3 md:px-6">
        <div className="flex gap-1" role="radiogroup" aria-label="De quem">
          <Chip active={scope === "mine"} onClick={() => setScope("mine")}>Minhas</Chip>
          <Chip active={scope === "all"} onClick={() => setScope("all")}>Toda a equipe</Chip>
        </div>
        <div className="flex gap-1" role="radiogroup" aria-label="Situação">
          <Chip active={view === "open"} onClick={() => setView("open")}>A fazer</Chip>
          <Chip active={view === "done"} onClick={() => setView("done")}>Concluídas</Chip>
        </div>
        {overdue > 0 && <span className="text-xs font-semibold text-destructive">{overdue} atrasada(s)</span>}
        <Button size="sm" className="ml-auto" onClick={() => setDialog({ open: true, task: null })}>
          <Plus className="mr-1.5 h-4 w-4" /> Nova tarefa
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 md:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          {isError && <EmptyState icon={ListTodo} title="Não foi possível carregar" description={(error as Error).message} />}
          {!isLoading && !isError && tasks.length === 0 && (
            view === "open"
              ? <EmptyState icon={CheckCircle2} title="Tudo em dia" description="Nenhuma tarefa pendente. Crie retornos pela conversa, pelo funil ou aqui." />
              : <EmptyState icon={ListTodo} title="Nenhuma tarefa concluída ainda" />
          )}
          {groups.map(({ bucket, tasks: list }) => (
            <section key={bucket} aria-labelledby={`tb-${bucket}`}>
              {view === "open" && (
                <h2 id={`tb-${bucket}`} className={cn("mb-1.5 text-xs font-semibold uppercase tracking-wide",
                  bucket === "overdue" ? "text-destructive" : "text-muted-foreground")}>
                  {BUCKET_LABEL[bucket as keyof typeof BUCKET_LABEL]} · {list.length}
                </h2>
              )}
              <ul className={cn("divide-y divide-border/40 overflow-hidden rounded-xl border bg-card",
                bucket === "overdue" ? "border-destructive/40" : "border-border/50")}>
                {list.map((t) => <TaskItem key={t.id} task={t} userId={userId} names={names} onEdit={edit} />)}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <TaskDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        task={dialog.task}
        fallbackStoreId={storeId ?? writeStoreId}
        team={team}
        userId={userId}
      />
    </div>
  );
}
