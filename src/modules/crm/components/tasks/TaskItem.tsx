import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, Check, Clock, Copy, Hand, MessageSquare, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { contactConversationId, deleteTask, updateTask } from "../../api/tasks";
import { useInvalidateTasks } from "../../hooks/useTasks";
import { TASK_KIND_LABEL } from "../../lib/constants";
import { dueLabel, duePresets, taskBucket } from "../../lib/tasks";
import type { CrmTaskWithLinks } from "../../lib/types";

interface Props {
  task: CrmTaskWithLinks;
  userId: string | null;
  names: Map<string, string>;
  onEdit: (t: CrmTaskWithLinks) => void;
  /** Dentro da ficha do contato/negócio: esconde o vínculo repetido */
  compact?: boolean;
}

export function TaskItem({ task, userId, names, onEdit, compact }: Props) {
  const navigate = useNavigate();
  const invalidate = useInvalidateTasks();
  const [busy, setBusy] = useState(false);
  const done = Boolean(task.done_at);
  const bucket = taskBucket(task.due_at);
  const auto = task.source !== "user";

  async function run(fn: () => Promise<void>, ok?: string) {
    setBusy(true);
    try { await fn(); invalidate(); if (ok) toast.success(ok); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function openConversation() {
    const id = task.conversation_id ?? (task.contact_id ? await contactConversationId(task.contact_id) : null);
    if (!id) { toast.info("Este contato ainda não tem conversa no CRM."); return; }
    // a mensagem sugerida vai como rascunho: a pessoa revisa e envia
    navigate(`/crm/inbox/${id}`, { state: task.suggested_message ? { draft: task.suggested_message } : null });
  }

  return (
    <li className={cn("flex items-start gap-3 px-3 py-2.5", done && "opacity-60")}>
      <button
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reabrir: ${task.title}` : `Concluir: ${task.title}`}
        disabled={busy}
        onClick={() => run(() => updateTask(task.id, { done_at: done ? null : new Date().toISOString() }), done ? undefined : "Tarefa concluída.")}
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // área de toque de 44 px sem aumentar o círculo
          "relative before:absolute before:-inset-2.5 before:content-['']",
          done ? "border-emerald-600 bg-emerald-600 text-white" : bucket === "overdue" ? "border-destructive hover:bg-destructive/10" : "border-muted-foreground/50 hover:border-primary hover:bg-primary/10",
        )}
      >
        {done && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium leading-snug", done && "line-through")}>{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className={cn("inline-flex items-center gap-1", !done && bucket === "overdue" && "font-semibold text-destructive", !done && bucket === "today" && "font-medium text-amber-700 dark:text-amber-400")}>
            <Clock className="h-3 w-3" aria-hidden="true" />
            {done ? `feita ${dueLabel(task.done_at)}` : dueLabel(task.due_at)}
          </span>
          {auto && (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-px text-[11px] font-medium">
              <Bot className="h-3 w-3" aria-hidden="true" /> {TASK_KIND_LABEL[task.kind] ?? "Automática"}
            </span>
          )}
          {!compact && task.contact && (
            <Link to={`/crm/contatos/${task.contact.id}`} className="truncate underline-offset-2 hover:text-foreground hover:underline">{task.contact.name}</Link>
          )}
          {!compact && task.deal && (
            <Link to={`/crm/funil?funil=${task.deal.pipeline_id}&negocio=${task.deal.id}`} className="truncate underline-offset-2 hover:text-foreground hover:underline">
              {task.deal.title}
            </Link>
          )}
          <span>{task.assigned_to ? (task.assigned_to === userId ? "você" : names.get(task.assigned_to) ?? "colega") : "sem responsável"}</span>
        </div>
        {task.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{task.notes}</p>}
        {!done && (task.contact_id || task.conversation_id || (!task.assigned_to && userId)) && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(task.contact_id || task.conversation_id) && (
              <Button size="sm" variant="outline" className="h-8" onClick={openConversation}>
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> {task.suggested_message ? "Escrever mensagem" : "Abrir conversa"}
              </Button>
            )}
            {task.suggested_message && (
              <Button size="sm" variant="ghost" className="h-8" onClick={async () => {
                try { await navigator.clipboard.writeText(task.suggested_message!); toast.success("Mensagem copiada."); }
                catch { toast.error("Não foi possível copiar."); }
              }}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar texto
              </Button>
            )}
            {!task.assigned_to && userId && (
              <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => run(() => updateTask(task.id, { assigned_to: userId }), "Tarefa é sua.")}>
                <Hand className="mr-1.5 h-3.5 w-3.5" /> Assumir
              </Button>
            )}
          </div>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Mais ações: ${task.title}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onEdit(task)}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
          {!done && (
            <DropdownMenuItem onSelect={() => run(() => updateTask(task.id, { due_at: duePresets()[1].date.toISOString() }), "Adiada para amanhã.")}>
              <Clock className="mr-2 h-4 w-4" /> Adiar para amanhã
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive"
            onSelect={() => { if (confirm(`Excluir a tarefa "${task.title}"?`)) void run(() => deleteTask(task.id), "Tarefa excluída."); }}>
            <Trash2 className="mr-2 h-4 w-4" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
