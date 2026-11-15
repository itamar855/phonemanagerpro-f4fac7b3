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
    setPhone(""); setName(""); setUsername(""); setInterest("repair"); setSubject(""); setSource("ad"); setCampaign("");
    setOwner(userId ?? "");
  }, [open, userId]);

  // mensagem colada (às vezes só o número, às vezes "esse é meu zap: ...") → número (+ nome, se ela se apresentou)
  function readPhone(text: string): boolean {
    const p = extractPhone(text);
    if (!p) return false;
    setPhone(formatPhone(`55${p}`));
    const n = extractName(text);
    if (n && !name) setName(n);
    return true;
  }

  // link do perfil ("Copiar URL do perfil"), @ ou o usuário sozinho → @
  function readUser(text: string): boolean {
    const u = extractUsername(text);
    if (!u) return false;
    setUsername(u);
    return true;
  }

  async function pasteInto(kind: "phone" | "user") {
    let t = "";
    try { t = await navigator.clipboard.readText(); }
    catch { toast.info("Toque e segure no campo e escolha Colar (o navegador não deixou ler a área de transferência)."); return; }
    if (!t.trim()) { toast.info("Nada copiado ainda."); return; }
    const ok = kind === "phone" ? readPhone(t) : readUser(t);
    if (!ok) toast.info(kind === "phone" ? "Não achei um número no que foi copiado." : "Não achei um @ no que foi copiado. No perfil: ⋯ → Copiar URL do perfil.");
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
          <DialogDescription>A pessoa mandou o número na DM? Cole aqui e a conversa de WhatsApp abre com a primeira mensagem pronta.</DialogDescription>
        </DialogHeader>

        <form id="ig-lead" onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ig-phone">WhatsApp *</Label>
            <div className="flex gap-2">
              <Input id="ig-phone" inputMode="tel" autoComplete="off" value={phone} required aria-invalid={phone.length > 0 && !validPhone}
                onChange={(e) => setPhone(e.target.value)}
                onPaste={(e) => { if (readPhone(e.clipboardData.getData("text"))) e.preventDefault(); }}
                placeholder="(87) 99999-9999" />
              <Button type="button" variant="outline" className="h-10 shrink-0" onClick={() => pasteInto("phone")} aria-label="Colar o número copiado da DM">
                <ClipboardPaste className="mr-1.5 h-4 w-4" /> Colar
              </Button>
            </div>
            <p className={cn("text-xs", phone.length > 0 && !validPhone ? "text-destructive" : "text-muted-foreground")}>
              {phone.length > 0 && !validPhone ? "Use DDD + número." : "Copie a mensagem com o número na DM e toque em Colar."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ig-user">@ no Instagram</Label>
            <div className="flex gap-2">
              <Input id="ig-user" value={username} autoCapitalize="off" autoCorrect="off" maxLength={31} placeholder="usuario"
                onChange={(e) => setUsername(e.target.value.replace(/^@/, "").trim())}
                onPaste={(e) => { if (readUser(e.clipboardData.getData("text"))) e.preventDefault(); }} />
              <Button type="button" variant="outline" className="h-10 shrink-0" onClick={() => pasteInto("user")} aria-label="Colar o link do perfil">
                <ClipboardPaste className="mr-1.5 h-4 w-4" /> Colar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">No perfil da pessoa: ⋯ → <strong>Copiar URL do perfil</strong> e toque em Colar.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ig-name">Primeiro nome <span className="font-normal text-muted-foreground">(como está no Insta, opcional)</span></Label>
            <Input id="ig-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ana" maxLength={80} autoCapitalize="words" />
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
