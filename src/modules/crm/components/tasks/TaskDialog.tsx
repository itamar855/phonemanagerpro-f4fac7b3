import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { TeamMember } from "../../api/inbox";
import { searchContacts } from "../../api/pipeline";
import { createTask, updateTask } from "../../api/tasks";
import { useInvalidateTasks } from "../../hooks/useTasks";
import { formatPhone } from "../../lib/phone";
import { duePresets, fromLocalInput, toLocalInput } from "../../lib/tasks";
import type { CrmTaskWithLinks } from "../../lib/types";

const NONE = "__none__";
type PickedContact = { id: string; name: string; phone: string | null; store_id: string };

export interface TaskPreset {
  storeId: string;
  contact?: { id: string; name: string } | null;
  dealId?: string | null;
  dealTitle?: string | null;
  conversationId?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Editar uma tarefa existente */
  task?: CrmTaskWithLinks | null;
  /** Nova tarefa já ligada a um contato/negócio */
  preset?: TaskPreset | null;
  /** Loja usada quando não há preset (nova tarefa solta) */
  fallbackStoreId: string | null;
  team: TeamMember[];
  userId: string | null;
}

export function TaskDialog({ open, onOpenChange, task, preset, fallbackStoreId, team, userId }: Props) {
  const invalidate = useInvalidateTasks();
  const [form, setForm] = useState({ title: "", due: "", owner: NONE, notes: "" });
  const [contact, setContact] = useState<PickedContact | null>(null);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PickedContact[]>([]);
  const [saving, setSaving] = useState(false);
  const fixedContact = Boolean(task || preset?.contact);
  const storeForSearch = preset?.storeId ?? fallbackStoreId;

  useEffect(() => {
    if (!open) return;
    if (task) {
      setForm({ title: task.title, due: toLocalInput(task.due_at), owner: task.assigned_to ?? NONE, notes: task.notes ?? "" });
    } else {
      setForm({ title: "", due: toLocalInput(duePresets()[1].date), owner: userId ?? NONE, notes: "" });
    }
    setContact(null); setTerm(""); setResults([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  useEffect(() => {
    if (!open || fixedContact || contact) return;
    const t = setTimeout(() => {
      searchContacts(storeForSearch, term).then((r) => setResults(r as PickedContact[])).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [open, term, contact, fixedContact, storeForSearch]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !userId) return;
    setSaving(true);
    try {
      const dueAt = fromLocalInput(form.due);
      const assignedTo = form.owner === NONE ? null : form.owner;
      if (task) {
        await updateTask(task.id, { title: form.title.trim(), due_at: dueAt, assigned_to: assignedTo, notes: form.notes.trim() || null });
        toast.success("Tarefa atualizada.");
      } else {
        const storeId = contact?.store_id ?? preset?.storeId ?? fallbackStoreId;
        if (!storeId) throw new Error("Escolha uma loja no topo da tela.");
        await createTask({
          storeId, title: form.title.trim(), dueAt, assignedTo, notes: form.notes.trim() || null,
          contactId: preset?.contact?.id ?? contact?.id ?? null, dealId: preset?.dealId ?? null,
          conversationId: preset?.conversationId ?? null, createdBy: userId,
        });
        toast.success("Tarefa criada.");
      }
      invalidate();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const linkedName = task?.contact?.name ?? preset?.contact?.name;
  const linkedDeal = task?.deal?.title ?? preset?.dealTitle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          <DialogDescription>
            {linkedName || linkedDeal ? [linkedName, linkedDeal].filter(Boolean).join(" · ") : "Lembrete com data para você ou para a equipe."}
          </DialogDescription>
        </DialogHeader>
        <form id="task-form" onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tk-title">O que fazer?</Label>
            <Input id="tk-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex.: Retornar orçamento da tela" required maxLength={160} autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tk-due">Quando</Label>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Atalhos de prazo">
              {duePresets().map((p) => {
                const v = toLocalInput(p.date);
                return (
                  <button key={p.label} type="button" onClick={() => setForm({ ...form, due: v })}
                    className={cn("min-h-[34px] rounded-full border px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      form.due === v ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                    {p.label}
                  </button>
                );
              })}
              <button type="button" onClick={() => setForm({ ...form, due: "" })}
                className={cn("min-h-[34px] rounded-full border px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  form.due === "" ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                Sem data
              </button>
            </div>
            <Input id="tk-due" type="datetime-local" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select value={form.owner} onValueChange={(v) => setForm({ ...form, owner: v })}>
              <SelectTrigger aria-label="Responsável"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Qualquer pessoa da equipe</SelectItem>
                {team.map((t) => <SelectItem key={t.user_id} value={t.user_id}>{t.display_name}{t.user_id === userId ? " (você)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!fixedContact && (
            <div className="space-y-1.5">
              <Label htmlFor="tk-contact">Contato (opcional)</Label>
              {contact ? (
                <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                  <span><strong>{contact.name}</strong>{contact.phone ? ` · ${formatPhone(contact.phone)}` : ""}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setContact(null)}>Trocar</Button>
                </div>
              ) : (
                <>
                  <Input id="tk-contact" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar por nome ou telefone" autoComplete="off" />
                  {results.length > 0 && (
                    <ul className="max-h-40 overflow-y-auto rounded-md border border-border/60" aria-label="Contatos encontrados">
                      {results.map((r) => (
                        <li key={r.id}>
                          <button type="button" onClick={() => setContact(r)}
                            className="flex min-h-[40px] w-full items-center justify-between px-3 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                            <span className="truncate">{r.name}</span>
                            <span className="ml-2 shrink-0 text-xs text-muted-foreground">{r.phone ? formatPhone(r.phone) : ""}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tk-notes">Observações</Label>
            <Textarea id="tk-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} maxLength={1000} className="text-base md:text-sm" />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form="task-form" disabled={saving || !form.title.trim()}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} {task ? "Salvar" : "Criar tarefa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
