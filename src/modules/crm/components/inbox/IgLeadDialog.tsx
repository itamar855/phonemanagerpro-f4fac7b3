import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardPaste, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { campaignSuggestions, createInstagramLead, igFirstMessageTemplate, type IgSource } from "../../api/igLead";
import { useCrmContext, useTeam } from "../../hooks/useInbox";
import { INTEREST_LABEL } from "../../lib/constants";
import { DEFAULT_IG_MESSAGE, extractName, extractPhone, extractUsername, fillTemplate } from "../../lib/igLead";
import { formatPhone } from "../../lib/phone";
import { ChannelIcon } from "../shared/ChannelIcon";

const SOURCES: { v: IgSource; l: string }[] = [
  { v: "ad", l: "Anúncio" }, { v: "post", l: "Post" }, { v: "story", l: "Story" }, { v: "organic", l: "Perfil / outro" },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick}
      className={cn("min-h-[40px] rounded-full border px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}

/**
 * O vendedor pegou o WhatsApp da pessoa na DM do Instagram: cadastra em poucos toques,
 * e o CRM abre a conversa de WhatsApp com a primeira mensagem pronta para revisar e enviar.
 */
export function IgLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { storeId, writeStoreId, userId } = useCrmContext();
  const store = storeId ?? writeStoreId;
  const { data: team = [] } = useTeam(store);
  const { data: campaigns = [] } = useQuery({ queryKey: ["crm", "campaigns", store], queryFn: () => campaignSuggestions(store!), enabled: open && Boolean(store) });
  const { data: template } = useQuery({ queryKey: ["crm", "ig-template", store], queryFn: () => igFirstMessageTemplate(store!), enabled: open && Boolean(store) });

  const [paste, setPaste] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [interest, setInterest] = useState<string>("repair");
  const [subject, setSubject] = useState("");
  const [source, setSource] = useState<IgSource>("ad");
  const [campaign, setCampaign] = useState("");
  const [owner, setOwner] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPaste(""); setPhone(""); setName(""); setUsername(""); setInterest("repair"); setSubject(""); setSource("ad"); setCampaign("");
    setOwner(userId ?? "");
  }, [open, userId]);

  // texto colado da DM → número, @ e nome
  function readText(text: string) {
    setPaste(text);
    const p = extractPhone(text);
    if (p) setPhone(formatPhone(`55${p}`));
    const u = extractUsername(text);
    if (u && !username) setUsername(u);
    const n = extractName(text);
    if (n && !name) setName(n);
    if (!p && text.trim()) toast.info("Não achei um número no texto. Digite no campo WhatsApp.");
  }

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) readText(t);
      else toast.info("A área de transferência está vazia.");
    } catch {
      toast.info("Cole o texto no campo abaixo (o navegador não deixou ler a área de transferência).");
    }
  }

  const validPhone = Boolean(extractPhone(phone));
  const preview = useMemo(() => fillTemplate(template || DEFAULT_IG_MESSAGE, { name: name || null, store: "[sua loja]", subject: subject || null }), [template, name, subject]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!store || !validPhone) return;
    setSaving(true);
    try {
      const r = await createInstagramLead({
        storeId: store, phone, name: name.trim() || null, username: username.trim() || null, interest,
        subject: subject.trim() || null, source, campaign: source === "ad" ? campaign.trim() || null : null, ownerId: owner || null,
      });
      const draft = fillTemplate(template || DEFAULT_IG_MESSAGE, { name: name.trim() || r.contact_name, store: r.store_name, subject: subject.trim() || null });
      for (const k of ["conversations", "counts", "contacts", "board", "tasks", "task-counts"]) qc.invalidateQueries({ queryKey: ["crm", k] });
      toast.success(r.existing ? `${r.contact_name} já estava no CRM: atualizei a origem e abri a conversa.` : "Lead cadastrado. Revise a mensagem e envie.");
      onOpenChange(false);
      navigate(`/crm/inbox/${r.conversation_id}`, { state: { draft } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ChannelIcon channel="instagram" className="h-5 w-5" /> Lead do Instagram</DialogTitle>
          <DialogDescription>Pegou o WhatsApp na DM? Cadastre aqui e a conversa abre com a primeira mensagem pronta.</DialogDescription>
        </DialogHeader>

        <form id="ig-lead" onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="ig-paste">Texto da DM (opcional)</Label>
              <Button type="button" size="sm" variant="outline" className="h-9" onClick={pasteFromClipboard}>
                <ClipboardPaste className="mr-1.5 h-4 w-4" /> Colar da DM
              </Button>
            </div>
            <Textarea id="ig-paste" value={paste} onChange={(e) => readText(e.target.value)} rows={2}
              placeholder="Copie a mensagem em que a pessoa passou o número e cole aqui" className="text-base md:text-sm" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ig-phone">WhatsApp *</Label>
              <Input id="ig-phone" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(87) 99999-9999" required
                aria-invalid={phone.length > 0 && !validPhone} />
              {phone.length > 0 && !validPhone && <p className="text-xs text-destructive">Use DDD + número.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ig-name">Nome</Label>
              <Input id="ig-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ana Souza" maxLength={80} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ig-user">@ no Instagram</Label>
              <Input id="ig-user" value={username} onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))} placeholder="usuario" maxLength={31} autoCapitalize="off" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>O que a pessoa quer</Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Interesse">
              {Object.entries(INTEREST_LABEL).map(([k, l]) => <Chip key={k} active={interest === k} onClick={() => setInterest(k)}>{l}</Chip>)}
            </div>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex.: troca de tela do iPhone 12" aria-label="Assunto" maxLength={120} />
          </div>

          <div className="space-y-1.5">
            <Label>De onde veio</Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Origem">
              {SOURCES.map((s) => <Chip key={s.v} active={source === s.v} onClick={() => setSource(s.v)}>{s.l}</Chip>)}
            </div>
            {source === "ad" && (
              <>
                <Input list="ig-campaigns" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Campanha (ex.: Tela Novembro)" aria-label="Campanha" maxLength={120} />
                <datalist id="ig-campaigns">{campaigns.map((c) => <option key={c} value={c} />)}</datalist>
              </>
            )}
          </div>

          {team.length > 1 && (
            <div className="space-y-1.5">
              <Label>Quem atende</Label>
              <Select value={owner} onValueChange={setOwner}>
                <SelectTrigger aria-label="Quem atende"><SelectValue /></SelectTrigger>
                <SelectContent>{team.map((t) => <SelectItem key={t.user_id} value={t.user_id}>{t.display_name}{t.user_id === userId ? " (você)" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><MessageCircle className="h-3.5 w-3.5" /> Primeira mensagem (dá para editar antes de enviar)</p>
            <p className="whitespace-pre-wrap">{preview}</p>
          </div>
        </form>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form="ig-lead" disabled={saving || !validPhone || !store}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-1.5 h-4 w-4" />} Cadastrar e abrir conversa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
