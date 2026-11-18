import { useState } from "react";
import { Loader2, Plus, Sparkles, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { createTag, deleteTag, tagRecentConversations, updateTag } from "../../api/tags";
import { crmTagsKey, useCrmTags } from "../../hooks/useCrmTags";
import { useCrmContext } from "../../hooks/useInbox";
import { useCrmStores } from "../../hooks/useCrmStores";
import { TAG_COLOR_KEYS, TAG_DOTS, tagTone, type CrmTag } from "../../lib/labels";
import { EmptyState } from "../shared/EmptyState";

function ColorPicker({ value, onChange, label }: { value: string | null; onChange: (c: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 hover:bg-muted">
          <span className={cn("h-4 w-4 rounded-full", TAG_DOTS[value ?? ""] ?? "bg-muted-foreground")} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Cor">
          {TAG_COLOR_KEYS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={value === c}
              aria-label={c}
              onClick={() => { onChange(c); setOpen(false); }}
              className={cn("flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted", value === c && "ring-2 ring-ring")}
            >
              <span className={cn("h-4 w-4 rounded-full", TAG_DOTS[c])} />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TagRow({ tag, onChanged }: { tag: CrmTag; onChanged: () => void }) {
  const [name, setName] = useState(tag.name);
  const run = async (fn: () => Promise<void>) => {
    try { await fn(); onChanged(); } catch (e) { toast.error((e as Error).message); setName(tag.name); }
  };
  return (
    <li className="flex items-center gap-2 p-2.5">
      <ColorPicker value={tag.color} label={`Cor de ${tag.name}`} onChange={(c) => run(() => updateTag(tag.id, { color: c }))} />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name.trim() !== tag.name && run(() => updateTag(tag.id, { name: name.trim() }))}
        aria-label="Nome da etiqueta"
        maxLength={30}
        className="h-9"
      />
      <span className={cn("hidden shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium sm:inline", tagTone(tag.color))}>{name || tag.name}</span>
      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Excluir ${tag.name}`} onClick={() => run(() => deleteTag(tag.id))}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

/** Lista de etiquetas prontas da loja (a IA só usa estas). Só o admin vê esta tela. */
export function TagsSettingsCard() {
  const { storeId, writeStoreId } = useCrmContext();
  const { byId } = useCrmStores();
  const target = storeId ?? writeStoreId;
  const qc = useQueryClient();
  const { tags, loading } = useCrmTags();
  const list = tags.filter((t) => t.store_id === target);
  const [name, setName] = useState("");
  const [color, setColor] = useState("blue");
  const [saving, setSaving] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: crmTagsKey });
  const [backfill, setBackfill] = useState<string | null>(null);

  // lotes de até 24 conversas por chamada, até acabar (ou só sobrarem falhas)
  async function tagRecent() {
    let total = 0;
    setBackfill("Lendo as conversas…");
    try {
      for (let i = 0; i < 20; i++) {
        const r = await tagRecentConversations(target);
        total += r.tagged;
        setBackfill(`${total} leads etiquetados…`);
        if (!r.more || r.processed === r.failed) break;
      }
      qc.invalidateQueries({ queryKey: ["crm", "conversations"] });
      qc.invalidateQueries({ queryKey: ["crm", "contact"] });
      toast.success(total ? `A IA etiquetou ${total} leads.` : "Nenhuma conversa recente sem etiqueta.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBackfill(null);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!target || !name.trim()) return;
    setSaving(true);
    try { await createTag(target, name, color); setName(""); refresh(); toast.success("Etiqueta criada."); }
    catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A IA lê cada conversa e marca o lead com estas etiquetas{target && byId.get(target) ? <> da loja <strong className="text-foreground">{byId.get(target)!.label}</strong></> : null}.
        Quente, Morno e Frio são a temperatura: o lead fica com uma só. A equipe também pode marcar à mão no painel do contato.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
        <p className="text-sm">Etiquetar agora as conversas dos últimos 30 dias que a IA ainda não leu.</p>
        <Button size="sm" variant="outline" className="h-9" onClick={tagRecent} disabled={Boolean(backfill) || !target}>
          {backfill ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
          {backfill ?? "Etiquetar com IA"}
        </Button>
      </div>
      <form onSubmit={add} className="flex items-end gap-2 rounded-xl border border-border/60 bg-card p-3">
        <ColorPicker value={color} onChange={setColor} label="Cor da nova etiqueta" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="tag-name">Nova etiqueta</Label>
          <Input id="tag-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Quer parcelar" maxLength={30} required />
        </div>
        <Button type="submit" size="sm" className="h-9" disabled={saving || !target}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} Adicionar
        </Button>
      </form>
      {loading ? null : list.length === 0 ? (
        <EmptyState icon={Tags} title="Nenhuma etiqueta" description="Crie as etiquetas que a IA e a equipe vão usar nos leads." />
      ) : (
        <ul className="divide-y divide-border/50 rounded-xl border border-border/60 bg-card">
          {list.map((t) => <TagRow key={`${t.id}:${t.name}:${t.color}`} tag={t} onChanged={refresh} />)}
        </ul>
      )}
    </div>
  );
}
