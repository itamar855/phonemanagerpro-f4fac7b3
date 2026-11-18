import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Ban, Loader2, Megaphone, Plus, UserCheck, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAttribution } from "../../api/tracking";
import { attributionLabel } from "../../lib/tracking";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { getContactDetail, updateContact } from "../../api/inbox";
import { crmKeys, useCrmContext } from "../../hooks/useInbox";
import { EntityTasks } from "../tasks/EntityTasks";
import { brl, relative } from "../../lib/format";
import { formatPhone } from "../../lib/phone";
import { CHANNEL_LABEL, ORIGIN_LABEL } from "../../lib/constants";
import { ChannelIcon } from "../shared/ChannelIcon";
import { ContactAvatar } from "../shared/ContactAvatar";
import { ContactDeals } from "./ContactDeals";
import { useCrmTags } from "../../hooks/useCrmTags";
import { KIND_CHIPS, TAG_DOTS, tagTone } from "../../lib/labels";

const KIND_OPTIONS = [
  { value: "assistencia", label: KIND_CHIPS.assistencia.label },
  { value: "venda", label: KIND_CHIPS.venda.label },
] as const;

// Mesmos códigos de status usados em Ordens de Serviço (src/utils/osStatus.ts)
const OS_STATUS: Record<string, string> = {
  open: "Aberta", analyzing: "Em análise", waiting_part: "Aguardando peça", repairing: "Em reparo",
  waiting_approval: "Aguard. aprovação", ready: "Pronta p/ retirada", delivered: "Entregue", cancelled: "Cancelada",
};

/** De onde veio o contato (campanha, anúncio ou orgânico). */
function ContactOrigin({ attributionId }: { attributionId: string }) {
  const { data } = useQuery({ queryKey: ["crm", "attribution", attributionId], queryFn: () => getAttribution(attributionId), staleTime: 10 * 60_000 });
  if (!data) return null;
  return (
    <p className="flex items-start gap-1.5">
      <Megaphone className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", data.kind === "organic" ? "text-muted-foreground" : "text-primary")} aria-hidden="true" />
      <span><span className="text-muted-foreground">Origem: </span>{attributionLabel(data)}</span>
    </p>
  );
}

export function ContactPanel({ contactId, onOpenConversation, showDeals = true }: { contactId: string; onOpenConversation?: (id: string) => void; showDeals?: boolean }) {
  const qc = useQueryClient();
  const { userId } = useCrmContext();
  const { data, isLoading } = useQuery({ queryKey: crmKeys.contact(contactId), queryFn: () => getContactDetail(contactId), staleTime: 30_000 });
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [tag, setTag] = useState("");
  const [saving, setSaving] = useState(false);
  const { tags: storeTags, colorOf } = useCrmTags();

  useEffect(() => {
    if (data) { setName(data.contact.name); setNotes(data.contact.notes ?? ""); }
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  const { contact, customer, orders, conversations } = data;

  async function save(patch: Parameters<typeof updateContact>[1], msg?: string) {
    setSaving(true);
    try {
      await updateContact(contact.id, patch);
      qc.invalidateQueries({ queryKey: crmKeys.contact(contact.id) });
      qc.invalidateQueries({ queryKey: ["crm", "conversations"] });
      qc.invalidateQueries({ queryKey: ["crm", "conversation"] });
      qc.invalidateQueries({ queryKey: ["crm", "counts"] });
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const ready = storeTags.filter((t) => t.store_id === contact.store_id && !contact.tags.some((x) => x.toLowerCase() === t.name.toLowerCase()));

  const addTag = () => {
    const t = tag.trim().toLowerCase();
    if (!t || contact.tags.includes(t)) { setTag(""); return; }
    void save({ tags: [...contact.tags, t] });
    setTag("");
  };

  return (
    <div className="space-y-5 p-4 text-sm">
      <div className="flex flex-col items-center gap-2 text-center">
        <ContactAvatar name={contact.name} avatarUrl={contact.avatar_url} size="lg" />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== contact.name && save({ name: name.trim() }, "Nome atualizado.")}
          aria-label="Nome do contato"
          className="h-9 text-center font-semibold"
        />
        <div className="flex flex-wrap justify-center gap-1.5">
          <Badge variant="secondary" className="gap-1 font-normal">Origem: {ORIGIN_LABEL[contact.origin_channel]}</Badge>
          {contact.ignored && <Badge variant="destructive" className="font-normal">Não é cliente</Badge>}
        </div>
      </div>

      <section aria-labelledby="ct-dados" className="space-y-1.5">
        <h3 id="ct-dados" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dados</h3>
        {contact.phone && <p><span className="text-muted-foreground">WhatsApp: </span>{formatPhone(contact.phone)}</p>}
        {contact.instagram_username && <p><span className="text-muted-foreground">Instagram: </span>@{contact.instagram_username}</p>}
        <p><span className="text-muted-foreground">No CRM desde </span>{relative(contact.created_at)}</p>
        {contact.attribution_id && <ContactOrigin attributionId={contact.attribution_id} />}
      </section>

      {conversations.length > 1 && (
        <section aria-labelledby="ct-conv" className="space-y-1.5">
          <h3 id="ct-conv" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversas</h3>
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpenConversation?.(c.id)}
              className="flex min-h-[40px] w-full items-center gap-2 rounded-md border border-border/50 px-2 text-left hover:bg-muted/50"
            >
              <ChannelIcon channel={c.channel} />
              <span className="flex-1">{CHANNEL_LABEL[c.channel]}</span>
              <span className="text-xs text-muted-foreground">{relative(c.last_message_at)}</span>
            </button>
          ))}
        </section>
      )}

      {showDeals && !contact.ignored && <ContactDeals contact={contact} />}

      {!contact.ignored && (
        <EntityTasks
          userId={userId}
          preset={{
            storeId: contact.store_id,
            contact: { id: contact.id, name: contact.name },
            conversationId: (conversations.find((c) => c.channel === "whatsapp") ?? conversations[0])?.id ?? null,
          }}
        />
      )}

      <section aria-labelledby="ct-cliente" className="space-y-1.5">
        <h3 id="ct-cliente" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cadastro de cliente</h3>
        {customer ? (
          <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 p-2">
            <UserCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{customer.name}</p>
              {customer.cpf && <p className="text-xs text-muted-foreground">CPF cadastrado</p>}
            </div>
            <Link to="/clientes" className="text-xs font-medium text-primary underline-offset-2 hover:underline">Abrir</Link>
          </div>
        ) : (
          <p className="text-muted-foreground">Ainda não é cliente cadastrado.</p>
        )}
      </section>

      {orders.length > 0 && (
        <section aria-labelledby="ct-os" className="space-y-1.5">
          <h3 id="ct-os" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ordens de serviço</h3>
          {orders.map((o) => (
            <Link
              key={o.id}
              to="/ordens-servico"
              className="flex items-center gap-2 rounded-md border border-border/50 p-2 hover:bg-muted/50"
            >
              <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">OS #{o.order_number} · {[o.device_brand, o.device_model].filter(Boolean).join(" ") || "Aparelho"}</p>
                <p className="text-xs text-muted-foreground">{OS_STATUS[o.status] ?? o.status} · {relative(o.created_at)}</p>
              </div>
              {o.final_price ? <span className="text-xs font-medium tabular-nums">{brl(o.final_price)}</span> : null}
            </Link>
          ))}
        </section>
      )}

      <section aria-labelledby="ct-tags" className="space-y-1.5">
        <h3 id="ct-tags" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Etiquetas</h3>
        <div role="group" aria-label="Tipo do lead" className="flex gap-1.5">
          {KIND_OPTIONS.map((k) => {
            const on = contact.lead_kind === k.value;
            return (
              <Button
                key={k.value}
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={on}
                disabled={saving}
                className={cn("h-8 flex-1", on && KIND_CHIPS[k.value].tone, on && "border-current bg-muted/40")}
                onClick={() => save({ lead_kind: on ? null : k.value })}
              >
                {k.label}
              </Button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {contact.tags.map((t) => (
            <span key={t} className={cn("inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-xs font-medium", tagTone(colorOf(contact.store_id, t)))}>
              {t}
              <button onClick={() => save({ tags: contact.tags.filter((x) => x !== t) })} aria-label={`Remover etiqueta ${t}`} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-foreground/10">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {!contact.tags.length && <span className="text-xs text-muted-foreground">Nenhuma etiqueta. A IA marca sozinha conforme a conversa.</span>}
        </div>
        {ready.length > 0 && (
          <div className="flex flex-wrap gap-1" aria-label="Etiquetas prontas">
            {ready.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={saving}
                onClick={() => save({ tags: [...contact.tags, t.name] })}
                className="inline-flex min-h-[28px] items-center gap-1.5 rounded-full border border-border/60 px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <span className={cn("h-2 w-2 rounded-full", TAG_DOTS[t.color ?? ""] ?? "bg-muted-foreground")} aria-hidden="true" />
                {t.name}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); addTag(); }} className="flex gap-1.5">
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Nova etiqueta" aria-label="Nova etiqueta" className="h-9" maxLength={30} />
          <Button type="submit" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Adicionar etiqueta"><Plus className="h-4 w-4" /></Button>
        </form>
      </section>

      <section aria-labelledby="ct-notas" className="space-y-1.5">
        <Label id="ct-notas" htmlFor="ct-notes" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anotações</Label>
        <Textarea id="ct-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Preferências, aparelho atual, observações…" className="text-base md:text-sm" />
        {notes !== (contact.notes ?? "") && (
          <Button size="sm" onClick={() => save({ notes: notes.trim() || null }, "Anotações salvas.")} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Salvar anotações
          </Button>
        )}
      </section>

      <section className="flex items-start justify-between gap-3 rounded-md border border-border/50 p-3">
        <div>
          <Label htmlFor="ct-ignored" className="flex items-center gap-1.5 font-medium"><Ban className="h-4 w-4" aria-hidden="true" /> Não é cliente</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">Fornecedor, pessoal ou spam: some da caixa de entrada e a IA não responde.</p>
        </div>
        <Switch
          id="ct-ignored"
          checked={contact.ignored}
          onCheckedChange={(v) => save({ ignored: v, ignored_reason: v ? "manual" : null }, v ? "Contato ocultado do CRM." : "Contato voltou ao CRM.")}
          disabled={saving}
        />
      </section>
    </div>
  );
}
