import { useEffect, useState } from "react";
import { Loader2, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createContact, createDeal, searchContacts } from "../../api/pipeline";
import type { TeamMember } from "../../api/inbox";
import { useInvalidateDeals } from "../../hooks/usePipeline";
import { INTEREST_LABEL } from "../../lib/constants";
import { formatPhone } from "../../lib/phone";
import type { CrmPipeline, CrmStage, Interest } from "../../lib/types";

const NONE = "__none__";
type PickedContact = { id: string; name: string; phone: string | null; store_id: string; origin_channel?: string };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pipeline: CrmPipeline | undefined;
  stages: CrmStage[];
  team: TeamMember[];
  userId: string | null;
  storeId: string | null;
  /** Contato já escolhido (ex.: aberto a partir de uma conversa) */
  presetContact?: PickedContact | null;
  onCreated?: (dealId: string) => void;
}

export function NewDealDialog({ open, onOpenChange, pipeline, stages, team, userId, storeId, presetContact, onCreated }: Props) {
  const invalidate = useInvalidateDeals();
  const openStages = stages.filter((s) => s.kind === "open" && !s.hidden);
  const [contact, setContact] = useState<PickedContact | null>(null);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PickedContact[]>([]);
  const [creatingContact, setCreatingContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", phone: "" });
  const [form, setForm] = useState({ title: "", value: "", interest: NONE, owner: NONE, stage: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setContact(presetContact ?? null);
    setTerm(""); setResults([]); setCreatingContact(false); setNewContact({ name: "", phone: "" });
    setForm({ title: "", value: "", interest: NONE, owner: userId ?? NONE, stage: openStages[0]?.id ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (contact || creatingContact) return;
    const t = setTimeout(() => {
      searchContacts(storeId ?? pipeline?.store_id ?? null, term).then((r) => setResults(r as PickedContact[])).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [term, contact, creatingContact, storeId, pipeline?.store_id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pipeline || !userId || !form.stage || !form.title.trim()) return;
    setSaving(true);
    try {
      let c = contact;
      if (!c) {
        if (!newContact.name.trim()) throw new Error("Escolha ou cadastre o contato.");
        c = await createContact({ storeId: pipeline.store_id, name: newContact.name.trim(), phone: newContact.phone });
      }
      if (c.store_id !== pipeline.store_id) throw new Error("O contato é de outra loja. Troque a loja ativa no topo.");
      const deal = await createDeal({
        storeId: pipeline.store_id, pipelineId: pipeline.id, stageId: form.stage, contactId: c.id, title: form.title.trim(),
        value: Number(form.value.replace(/\./g, "").replace(",", ".")) || 0,
        interest: form.interest === NONE ? null : (form.interest as Interest),
        ownerId: form.owner === NONE ? null : form.owner, createdBy: userId,
        originChannel: (c.origin_channel as string | undefined) ?? "manual",
      });
      invalidate();
      toast.success("Negócio criado.");
      onOpenChange(false);
      onCreated?.(deal.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo negócio</DialogTitle>
          <DialogDescription>{pipeline ? `Funil ${pipeline.name}` : "Selecione um funil"}</DialogDescription>
        </DialogHeader>
        <form id="new-deal" onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nd-contact">Contato</Label>
            {contact ? (
              <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                <span><strong>{contact.name}</strong>{contact.phone ? ` · ${formatPhone(contact.phone)}` : ""}</span>
                {!presetContact && <Button type="button" variant="ghost" size="sm" onClick={() => setContact(null)}>Trocar</Button>}
              </div>
            ) : creatingContact ? (
              <div className="grid gap-2 rounded-md border border-border/60 p-3 sm:grid-cols-2">
                <Input aria-label="Nome do novo contato" placeholder="Nome" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} required />
                <Input aria-label="WhatsApp do novo contato" placeholder="(87) 99999-9999" inputMode="tel" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
                <Button type="button" variant="ghost" size="sm" className="justify-start sm:col-span-2" onClick={() => setCreatingContact(false)}>Buscar contato existente</Button>
              </div>
            ) : (
              <div className="space-y-1">
                <Input id="nd-contact" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar por nome ou telefone" autoComplete="off" />
                {results.length > 0 && (
                  <ul className="max-h-48 overflow-y-auto rounded-md border border-border/60" aria-label="Contatos encontrados">
                    {results.map((r) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => { setContact(r); if (!form.title) setForm((f) => ({ ...f, title: r.name })); }}
                          className="flex min-h-[40px] w-full items-center justify-between px-3 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                          <span className="truncate">{r.name}</span>
                          <span className="ml-2 shrink-0 text-xs text-muted-foreground">{r.phone ? formatPhone(r.phone) : ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => { setCreatingContact(true); setNewContact({ name: term, phone: "" }); }}>
                  <UserPlus className="mr-1.5 h-4 w-4" /> Cadastrar novo contato
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nd-title">O que a pessoa quer?</Label>
            <Input id="nd-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: iPhone 13 128GB, troca de tela A54" required maxLength={120} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nd-value">Valor estimado (R$)</Label>
              <Input id="nd-value" inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value.replace(/[^\d.,]/g, "") })} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Interesse</Label>
              <Select value={form.interest} onValueChange={(v) => setForm({ ...form, interest: v })}>
                <SelectTrigger aria-label="Interesse"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {Object.entries(INTEREST_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                <SelectTrigger aria-label="Etapa"><SelectValue placeholder="Etapa" /></SelectTrigger>
                <SelectContent>{openStages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={form.owner} onValueChange={(v) => setForm({ ...form, owner: v })}>
                <SelectTrigger aria-label="Responsável"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem responsável</SelectItem>
                  {team.map((t) => <SelectItem key={t.user_id} value={t.user_id}>{t.display_name}{t.user_id === userId ? " (você)" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form="new-deal" disabled={saving || !pipeline} className={cn(saving && "opacity-80")}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} Criar negócio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
