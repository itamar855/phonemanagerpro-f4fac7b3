import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Link2, Loader2, Plus, Radar, Save, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  connectedNumber, createLink, getTrackingSettings, linkClickCounts, listLinks, listMetaEvents, saveTracking, sendTestEvent, setLinkActive,
  trackingStatus, type TrackingSettings as TS,
} from "../../api/tracking";
import { useCrmContext } from "../../hooks/useInbox";
import { relative } from "../../lib/format";
import { META_URL_PARAMS, slugify, TRACK_BASE } from "../../lib/tracking";
import { EmptyState } from "../shared/EmptyState";

const MANAGER = new Set(["admin", "gerente", "dono"]);
const KEY = (storeId: string) => ["crm", "tracking", storeId];

async function copy(text: string, what = "Copiado.") {
  try { await navigator.clipboard.writeText(text); toast.success(what); } catch { toast.error("Não foi possível copiar."); }
}

export function TrackingSettings() {
  const { storeId, userId, userRole } = useCrmContext();
  const canEdit = MANAGER.has(String(userRole ?? ""));
  if (!storeId) return <EmptyState icon={Radar} title="Escolha uma loja" description="O rastreamento é configurado por loja. Selecione a loja no topo da tela." />;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Radar className="h-4 w-4 text-primary" aria-hidden="true" /> Rastreamento de campanhas</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Descobre de qual campanha e anúncio veio cada contato e devolve para a Meta o que aconteceu depois (lead, lead qualificado e venda com valor),
          para os anúncios aprenderem a trazer quem compra.
        </p>
      </div>
      <MetaCard storeId={storeId} canEdit={canEdit} />
      <LinksCard storeId={storeId} userId={userId} canEdit={canEdit} />
      <EventsCard storeId={storeId} />
    </div>
  );
}

// ------------------------------------------------------------------ Meta

function MetaCard({ storeId, canEdit }: { storeId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: s, isLoading } = useQuery({ queryKey: [...KEY(storeId), "settings"], queryFn: () => getTrackingSettings(storeId) });
  const { data: status } = useQuery({ queryKey: [...KEY(storeId), "status"], queryFn: () => trackingStatus(storeId), enabled: canEdit });
  const [f, setF] = useState<Partial<TS>>({});
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  useEffect(() => {
    if (!s) return;
    setF(s);
    if (!s.whatsapp_number && canEdit) connectedNumber(storeId).then((n) => n && setF((x) => ({ ...x, whatsapp_number: x.whatsapp_number || n }))).catch(() => {});
  }, [s, storeId, canEdit]);

  const set = (p: Partial<TS>) => setF((x) => ({ ...x, ...p }));
  const off = !canEdit || isLoading;

  async function save() {
    setBusy("save");
    try {
      await saveTracking(storeId, {
        enabled: Boolean(f.enabled), dataset_id: f.dataset_id ?? null, test_event_code: f.test_event_code ?? null, whatsapp_number: f.whatsapp_number ?? null,
        send_lead: f.send_lead, send_qualified: f.send_qualified, send_purchase: f.send_purchase, only_attributed: f.only_attributed,
        ...(token.trim() ? { access_token: token.trim() } : {}),
      });
      setToken("");
      qc.invalidateQueries({ queryKey: KEY(storeId) });
      toast.success("Rastreamento salvo.");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }

  const toggle = (k: keyof TS, label: string, help: string) => (
    <label className="flex items-start justify-between gap-3 py-2">
      <span><span className="text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">{help}</span></span>
      <Switch checked={Boolean(f[k])} onCheckedChange={(v) => set({ [k]: v } as Partial<TS>)} disabled={off} />
    </label>
  );

  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-card p-4" aria-labelledby="trk-meta">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="trk-meta" className="font-semibold">Meta · API de Conversões</h3>
          <p className="text-xs text-muted-foreground">Gerenciador de Eventos → seu conjunto de dados (pixel) → Configurações.</p>
        </div>
        <Switch checked={Boolean(f.enabled)} onCheckedChange={(v) => set({ enabled: v })} disabled={off} aria-label="Enviar eventos para a Meta" />
      </div>
      {!canEdit && <p className="text-xs text-amber-700 dark:text-amber-400">Só gerente ou dono altera estas opções.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="trk-ds">ID do conjunto de dados (pixel)</Label>
          <Input id="trk-ds" inputMode="numeric" value={f.dataset_id ?? ""} onChange={(e) => set({ dataset_id: e.target.value.replace(/\D/g, "") })} disabled={off} placeholder="Ex.: 123456789012345" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trk-tok">Token de acesso</Label>
          <Input id="trk-tok" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} disabled={off}
            placeholder={status?.has_token ? "•••••• salvo (cole outro para trocar)" : "Gerar token na seção API de Conversões"} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trk-wa">WhatsApp que os links abrem</Label>
          <Input id="trk-wa" inputMode="tel" value={f.whatsapp_number ?? ""} onChange={(e) => set({ whatsapp_number: e.target.value.replace(/\D/g, "") })} disabled={off} placeholder="5587999999999" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trk-test">Código de teste (opcional)</Label>
          <Input id="trk-test" value={f.test_event_code ?? ""} onChange={(e) => set({ test_event_code: e.target.value.trim() })} disabled={off} placeholder="TEST12345" />
          <p className="text-[11px] text-muted-foreground">Com o código, os eventos aparecem em “Testar eventos” e não contam nas campanhas. Apague para valer de verdade.</p>
        </div>
      </div>

      <div className="divide-y divide-border/50 border-t border-border/50">
        {toggle("send_lead", "Lead", "Primeira mensagem de um contato novo no WhatsApp.")}
        {toggle("send_qualified", "Lead qualificado", "A IA passou para o atendente ou o negócio chegou em Orçamento.")}
        {toggle("send_purchase", "Compra (Purchase)", "Negócio ganho, com o valor em R$. É o que ensina a Meta a trazer quem compra.")}
        {toggle("only_attributed", "Só contatos de anúncio/link", "Desligado: manda de todos os contatos (a Meta reconhece pelo telefone).")}
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={busy !== null}>
            {busy === "save" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Salvar
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null || !f.test_event_code}
            onClick={async () => {
              setBusy("test");
              try { const r = await sendTestEvent(storeId); toast.success(`A Meta recebeu ${r.events_received ?? 1} evento de teste.`); }
              catch (e) { toast.error((e as Error).message); }
              finally { setBusy(null); }
            }}>
            {busy === "test" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Enviar evento de teste
          </Button>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ links

function LinksCard({ storeId, userId, canEdit }: { storeId: string; userId: string | null; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: links = [] } = useQuery({ queryKey: [...KEY(storeId), "links"], queryFn: () => listLinks(storeId) });
  const { data: counts } = useQuery({ queryKey: [...KEY(storeId), "clicks"], queryFn: () => linkClickCounts(storeId), staleTime: 60_000 });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [message, setMessage] = useState("Olá! Vi o anúncio e quero mais informações.");
  const [saving, setSaving] = useState(false);

  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-card p-4" aria-labelledby="trk-links">
      <div>
        <h3 id="trk-links" className="font-semibold">Links de rastreio para os anúncios</h3>
        <p className="text-xs text-muted-foreground">
          Use como destino do anúncio (ou no site / bio). O clique é gravado com a campanha e o anúncio, e a pessoa cai no WhatsApp com a mensagem pronta e um código.
          Quando ela envia, o CRM liga o contato àquele clique.
        </p>
      </div>

      {canEdit && (
        <form className="grid gap-2 rounded-lg border border-border/50 p-3 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          if (!userId || !name.trim() || !slug) return;
          setSaving(true);
          try {
            await createLink({ storeId, userId, name: name.trim(), slug, message: message.trim() || "Olá! Quero mais informações." });
            setName(""); setSlug(""); setSlugTouched(false);
            qc.invalidateQueries({ queryKey: KEY(storeId) });
            toast.success("Link criado.");
          } catch (err) { toast.error((err as Error).message); }
          finally { setSaving(false); }
        }}>
          <Input value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} placeholder="Nome (ex.: Promo troca de tela)" aria-label="Nome do link" required maxLength={80} />
          <div className="flex items-center gap-1 rounded-md border border-input bg-background pl-2 text-sm">
            <span className="shrink-0 text-muted-foreground">/w/</span>
            <input value={slug} onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }} aria-label="Endereço do link"
              className="h-10 min-w-0 flex-1 bg-transparent pr-2 text-base outline-none md:text-sm" required />
          </div>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={300} aria-label="Mensagem que a pessoa envia" className="text-base sm:col-span-2 md:text-sm" />
          <Button type="submit" size="sm" disabled={saving || !name.trim() || slug.length < 2} className="sm:w-fit">
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} Criar link
          </Button>
        </form>
      )}

      {links.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">Nenhum link ainda.</p>
      ) : (
        <ul className="divide-y divide-border/40 rounded-lg border border-border/50">
          {links.map((l) => {
            const url = `${TRACK_BASE}${l.slug}`;
            const c = counts?.get(l.id);
            return (
              <li key={l.id} className={cn("space-y-1.5 p-3 text-sm", !l.active && "opacity-60")}>
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{c ? `${c.clicks} cliques · ${c.matched} contatos (30 d)` : "0 cliques"}</span>
                </div>
                <p className="truncate text-xs text-primary">{url}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-8" onClick={() => copy(url, "Link copiado.")}><Copy className="mr-1 h-3.5 w-3.5" /> Link</Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => copy(META_URL_PARAMS, "Parâmetros copiados. Cole em “Parâmetros de URL” do anúncio.")}>
                    <Copy className="mr-1 h-3.5 w-3.5" /> Parâmetros do anúncio
                  </Button>
                  {canEdit && (
                    <Button size="sm" variant="ghost" className="h-8" onClick={async () => {
                      try { await setLinkActive(l.id, !l.active); qc.invalidateQueries({ queryKey: KEY(storeId) }); } catch (e) { toast.error((e as Error).message); }
                    }}>{l.active ? "Desativar" : "Ativar"}</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        No Gerenciador de Anúncios: destino = o link acima; em <strong>Parâmetros de URL</strong>, cole os parâmetros copiados (campanha, conjunto e anúncio chegam preenchidos).
        Para anúncios que abrem o WhatsApp direto, o CRM lê os dados do anúncio que o WhatsApp manda junto com a primeira mensagem.
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ eventos

const STATUS: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  sent: { label: "enviado", cls: "text-emerald-700 dark:text-emerald-400", icon: CheckCircle2 },
  pending: { label: "na fila", cls: "text-muted-foreground", icon: Loader2 },
  failed: { label: "falhou", cls: "text-destructive", icon: XCircle },
  skipped: { label: "não enviado", cls: "text-muted-foreground", icon: XCircle },
};

function EventsCard({ storeId }: { storeId: string }) {
  const { data: events = [] } = useQuery({ queryKey: [...KEY(storeId), "events"], queryFn: () => listMetaEvents(storeId), refetchInterval: 30_000 });
  return (
    <section className="rounded-xl border border-border/60 bg-card p-4" aria-labelledby="trk-events">
      <h3 id="trk-events" className="mb-2 font-semibold">Eventos enviados para a Meta</h3>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum evento ainda. Eles aparecem aqui quando o rastreamento estiver ligado.</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {events.map((e) => {
            const st = STATUS[e.status] ?? STATUS.pending;
            const Icon = st.icon;
            return (
              <li key={e.id} className="flex items-start gap-2 py-2 text-sm">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", st.cls)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate"><strong>{e.event_name}</strong> · {e.contact?.name ?? "contato"}{e.value ? ` · R$ ${Number(e.value).toLocaleString("pt-BR")}` : ""}</p>
                  <p className={cn("text-xs", st.cls)}>{st.label}{e.error ? ` · ${e.error.slice(0, 140)}` : ""}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{relative(e.created_at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
