import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MessageSquare, Save, Trash2, Trophy, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { crmDb } from "../../api/db";
import { addDealNote, deleteDeal, updateDeal, type DealPatch } from "../../api/pipeline";
import type { TeamMember } from "../../api/inbox";
import { useDealActivities, useInvalidateDeals } from "../../hooks/usePipeline";
import { INTEREST_LABEL } from "../../lib/constants";
import { relative } from "../../lib/format";
import type { CrmActivity, CrmDealWithContact, CrmStage, Interest } from "../../lib/types";
import { EntityTasks } from "../tasks/EntityTasks";
import { LostReasonDialog } from "./LostReasonDialog";

const NONE = "__none__";

function activityText(a: CrmActivity, stageName: (id: unknown) => string, who: (id: string | null) => string) {
  const p = a.payload as Record<string, unknown>;
  switch (a.type) {
    case "deal_created": return `${who(a.actor_id)} criou o negócio`;
    case "stage_changed": return `${who(a.actor_id)} moveu de ${stageName(p.from)} para ${stageName(p.to)}`;
    case "deal_won": return `${who(a.actor_id)} marcou como ganho`;
    case "deal_lost": return `${who(a.actor_id)} marcou como perdido${p.lost_reason ? `: ${p.lost_reason}` : ""}`;
    case "note": return String(p.text ?? "");
    default: return a.type;
  }
}

interface Props {
  deal: CrmDealWithContact | null;
  stages: CrmStage[];
  team: TeamMember[];
  userId: string | null;
  onClose: () => void;
}

export function DealDrawer({ deal, stages, team, userId, onClose }: Props) {
  const navigate = useNavigate();
  const invalidate = useInvalidateDeals();
  const { data: activities = [] } = useDealActivities(deal?.id);
  const [form, setForm] = useState({ title: "", value: "", interest: NONE, owner: NONE, expected: "" });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [askLost, setAskLost] = useState(false);

  useEffect(() => {
    if (deal) setForm({
      title: deal.title, value: deal.value ? String(deal.value) : "", interest: deal.interest ?? NONE,
      owner: deal.owner_id ?? NONE, expected: deal.expected_close_date ?? "",
    });
  }, [deal]);

  if (!deal) return <Sheet open={false} onOpenChange={() => onClose()}><SheetContent /></Sheet>;
  const names = new Map(team.map((t) => [t.user_id, t.display_name]));
  const who = (id: string | null) => (id ? names.get(id) ?? "Alguém" : "Sistema");
  const stageName = (id: unknown) => stages.find((s) => s.id === id)?.name ?? "outra etapa";
  const wonStage = stages.find((s) => s.kind === "won");
  const lostStage = stages.find((s) => s.kind === "lost");

  async function save(patch: DealPatch, msg?: string, key = "save") {
    setSaving(key);
    try {
      await updateDeal(deal!.id, patch);
      invalidate();
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function openConversation() {
    const { data } = await crmDb.from("crm_conversations").select("id").eq("contact_id", deal!.contact_id)
      .order("last_message_at", { ascending: false, nullsFirst: false }).limit(1);
    if (data?.[0]?.id) navigate(`/crm/inbox/${data[0].id}`);
    else toast.info("Este contato ainda não tem conversa.");
  }

  const value = Number(String(form.value).replace(/\./g, "").replace(",", ".")) || 0;
  const dirty = form.title.trim() !== deal.title || value !== Number(deal.value) || (form.interest === NONE ? null : form.interest) !== deal.interest
    || (form.owner === NONE ? null : form.owner) !== deal.owner_id || (form.expected || null) !== deal.expected_close_date;

  return (
    <Sheet open={Boolean(deal)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/50 px-4 py-3 text-left">
          <SheetTitle className="pr-6">{deal.title}</SheetTitle>
          <p className="text-sm text-muted-foreground">{deal.contact?.name} · {stageName(deal.stage_id)}{deal.status === "lost" && deal.lost_reason ? ` · ${deal.lost_reason}` : ""}</p>
        </SheetHeader>

        <div className="space-y-5 p-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={openConversation}><MessageSquare className="mr-1.5 h-4 w-4" /> Conversa</Button>
            {deal.status !== "won" && wonStage && (
              <Button size="sm" onClick={() => save({ stage_id: wonStage.id }, "Negócio ganho! 🎉", "won")} disabled={saving !== null}>
                {saving === "won" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trophy className="mr-1.5 h-4 w-4" />} Ganhou
              </Button>
            )}
            {deal.status !== "lost" && lostStage && (
              <Button size="sm" variant="outline" onClick={() => setAskLost(true)} disabled={saving !== null}>
                <XCircle className="mr-1.5 h-4 w-4" /> Perdeu
              </Button>
            )}
          </div>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.title.trim()) return;
              void save({
                title: form.title.trim(), value, interest: form.interest === NONE ? null : (form.interest as Interest),
                owner_id: form.owner === NONE ? null : form.owner, expected_close_date: form.expected || null,
              }, "Negócio atualizado.");
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="dl-title">Título</Label>
              <Input id="dl-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={120} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dl-value">Valor (R$)</Label>
                <Input id="dl-value" inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value.replace(/[^\d.,]/g, "") })} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dl-exp">Previsão de fechar</Label>
                <Input id="dl-exp" type="date" value={form.expected} onChange={(e) => setForm({ ...form, expected: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Select
                value={deal.stage_id}
                onValueChange={(v) => {
                  if (stages.find((s) => s.id === v)?.kind === "lost") setAskLost(true);
                  else void save({ stage_id: v }, "Etapa alterada.", "stage");
                }}
              >
                <SelectTrigger aria-label="Etapa"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.filter((s) => !s.hidden || s.id === deal.stage_id).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {dirty && (
              <Button type="submit" size="sm" disabled={saving !== null}>
                {saving === "save" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Salvar alterações
              </Button>
            )}
          </form>

          <EntityTasks
            byDeal
            userId={userId}
            preset={{ storeId: deal.store_id, contact: deal.contact ? { id: deal.contact.id, name: deal.contact.name } : null, dealId: deal.id, dealTitle: deal.title }}
          />

          <section className="space-y-2" aria-labelledby="dl-hist">
            <h3 id="dl-hist" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Histórico</h3>
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!note.trim() || !userId) return;
                try {
                  await addDealNote({ storeId: deal.store_id, dealId: deal.id, contactId: deal.contact_id, userId, text: note.trim() });
                  setNote("");
                  invalidate();
                } catch (err) { toast.error((err as Error).message); }
              }}
            >
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={1} placeholder="Anotar algo sobre o negócio…" aria-label="Nova anotação" className="min-h-[40px]" />
              <Button type="submit" size="sm" variant="outline" disabled={!note.trim()}>Anotar</Button>
            </form>
            <ol className="space-y-2">
              {activities.map((a) => (
                <li key={a.id} className="rounded-md border border-border/40 px-3 py-2 text-sm">
                  <p className={a.type === "note" ? "whitespace-pre-wrap" : "text-muted-foreground"}>{activityText(a, stageName, who)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{a.type === "note" ? `${who(a.actor_id)} · ` : ""}{relative(a.created_at)}</p>
                </li>
              ))}
            </ol>
          </section>

          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={async () => {
              if (!confirm(`Excluir o negócio "${deal.title}"? O histórico dele também é apagado.`)) return;
              try { await deleteDeal(deal.id); invalidate(); onClose(); toast.success("Negócio excluído."); }
              catch (e) { toast.error((e as Error).message); }
            }}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Excluir negócio
          </Button>
        </div>

        <LostReasonDialog
          open={askLost}
          dealTitle={deal.title}
          onCancel={() => setAskLost(false)}
          onConfirm={(reason) => { setAskLost(false); if (lostStage) void save({ stage_id: lostStage.id, lost_reason: reason }, "Negócio marcado como perdido.", "lost"); }}
        />
      </SheetContent>
    </Sheet>
  );
}
