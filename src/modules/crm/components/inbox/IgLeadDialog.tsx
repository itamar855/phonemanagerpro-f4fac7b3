import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ClipboardPaste, Loader2, Megaphone, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { findDuplicate, listAdCodes } from "../../api/adCodes";
import { campaignSuggestions, createInstagramLead, igFirstMessageTemplate, type IgSource } from "../../api/igLead";
import { useCrmContext, useTeam } from "../../hooks/useInbox";
import { adCodePath, parsePasted, type AdCode } from "../../lib/adCodes";
import { INTEREST_LABEL } from "../../lib/constants";
import { DEFAULT_IG_MESSAGE, extractName, extractPhone, fillTemplate } from "../../lib/igLead";
import { formatPhone } from "../../lib/phone";
import { ChannelIcon } from "../shared/ChannelIcon";

const SOURCES: { v: IgSource; l: string }[] = [
  { v: "ad", l: "Anúncio" }, { v: "post", l: "Post" }, { v: "story", l: "Story" }, { v: "organic", l: "Perfil / outro" },
];
const OTHER = "__other__";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick}
      className={cn("min-h-[40px] rounded-full border px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}

function useDebounced<T>(v: T, ms = 400) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/**
 * O vendedor pegou o WhatsApp da pessoa na DM do Instagram: cola o link do perfil, a mensagem com o número
 * e (se veio de anúncio) a saudação/pergunta com o código — tudo no mesmo botão. A conversa de WhatsApp
 * abre com a primeira mensagem pronta para revisar e enviar.
 */
export function IgLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { storeId, writeStoreId, userId } = useCrmContext();
  const store = storeId ?? writeStoreId;
  const { data: team = [] } = useTeam(store);
  const { data: campaigns = [] } = useQuery({ queryKey: ["crm", "campaigns", store], queryFn: () => campaignSuggestions(store!), enabled: open && Boolean(store) });
  const { data: template } = useQuery({ queryKey: ["crm", "ig-template", store], queryFn: () => igFirstMessageTemplate(store!), enabled: open && Boolean(store) });
  const { data: codes = [] } = useQuery({ queryKey: ["crm", "ad-codes", store], queryFn: () => listAdCodes(store!), enabled: open && Boolean(store) });
  const activeCodes = useMemo(() => codes.filter((c) => c.active), [codes]);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [interest, setInterest] = useState<string>("repair");
  const [subject, setSubject] = useState("");
  const [source, setSource] = useState<IgSource>("ad");
  const [adCode, setAdCode] = useState<AdCode | null>(null);
  const [pick, setPick] = useState<string>(""); // código escolhido na lista, ou OTHER
  const [campaign, setCampaign] = useState("");
  const [owner, setOwner] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhone(""); setName(""); setUsername(""); setInterest("repair"); setSubject(""); setSource("ad");
    setAdCode(null); setPick(""); setCampaign(""); setOwner(userId ?? "");
  }, [open, userId]);

  // contato repetido (pelo número ou pelo @)
  const dPhone = useDebounced(phone);
  const dUser = useDebounced(username);
  const phoneDigits = extractPhone(dPhone);
  const { data: dup } = useQuery({
    queryKey: ["crm", "dup", store, phoneDigits, dUser],
    queryFn: () => findDuplicate(store!, phoneDigits, dUser || null),
    enabled: open && Boolean(store) && Boolean(phoneDigits || dUser.length >= 3),
    staleTime: 30_000,
  });

  /** Aplica o que foi colado. Devolve a lista do que foi reconhecido. */
  function apply(text: string): string[] {
    const r = parsePasted(text, activeCodes);
    const got: string[] = [];
    if (r.phone) { setPhone(formatPhone(`55${r.phone}`)); got.push("WhatsApp"); const n = extractName(text); if (n && !name) setName(n); }
    if (r.username) { setUsername(r.username); got.push("@"); }
    if (r.code) { setAdCode(r.code); setSource("ad"); setPick(r.code.code); got.push(`anúncio ${r.code.code}`); }
    return got;
  }

  async function pasteSmart() {
    let t = "";
    try { t = await navigator.clipboard.readText(); }
    catch { toast.info("Toque e segure num campo e escolha Colar (o navegador não deixou ler a área de transferência)."); return; }
    if (!t.trim()) { toast.info("Nada copiado ainda."); return; }
    const got = apply(t);
    if (got.length) toast.success(`Preenchido: ${got.join(", ")}`);
    else toast.info("Não reconheci. Copie o link do perfil, a mensagem com o número ou a saudação do anúncio.");
  }

  const onFieldPaste = (e: React.ClipboardEvent) => { if (apply(e.clipboardData.getData("text")).length) e.preventDefault(); };

  function choose(v: string) {
    setPick(v);
    if (v === OTHER) { setAdCode(null); return; }
    setAdCode(activeCodes.find((c) => c.code === v) ?? null);
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
        subject: subject.trim() || null, source,
        adCode: source === "ad" ? adCode?.code ?? null : null,
        campaign: source === "ad" && !adCode ? campaign.trim() || null : null, ownerId: owner || null,
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
          <DialogDescription>Copie no Instagram e toque em Colar: o link do perfil, a mensagem com o número e, se veio de anúncio, a saudação com o código.</DialogDescription>
        </DialogHeader>

        <form id="ig-lead" onSubmit={submit} className="space-y-4">
          <Button type="button" className="h-12 w-full text-base" onClick={pasteSmart}>
            <ClipboardPaste className="mr-2 h-5 w-5" /> Colar do Instagram
          </Button>

          {dup && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="status">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="flex-1">
                Já existe <strong>{dup.name}</strong> com este {dup.by === "phone" ? "número" : "@"}. Ao cadastrar, atualizo esse contato em vez de criar outro.{" "}
                <Link to={`/crm/contatos/${dup.id}`} onClick={() => onOpenChange(false)} className="font-medium text-primary underline-offset-2 hover:underline">Ver ficha</Link>
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ig-phone">WhatsApp *</Label>
              <Input id="ig-phone" inputMode="tel" autoComplete="off" value={phone} required aria-invalid={phone.length > 0 && !validPhone}
                onChange={(e) => setPhone(e.target.value)} onPaste={onFieldPaste} placeholder="(87) 99999-9999" />
              {phone.length > 0 && !validPhone && <p className="text-xs text-destructive">Use DDD + número.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ig-user">@ no Instagram</Label>
              <Input id="ig-user" value={username} autoCapitalize="off" autoCorrect="off" maxLength={31} placeholder="usuario"
                onChange={(e) => setUsername(e.target.value.replace(/^@/, "").trim())} onPaste={onFieldPaste} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ig-name">Primeiro nome <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Input id="ig-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ana" maxLength={80} autoCapitalize="words" />
          </div>

          <div className="space-y-1.5">
            <Label>De onde veio</Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Origem">
              {SOURCES.map((s) => <Chip key={s.v} active={source === s.v} onClick={() => setSource(s.v)}>{s.l}</Chip>)}
            </div>
            {source === "ad" && (adCode ? (
              <div className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
                <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{adCode.code} · {adCodePath(adCode)}</p>
                  <p className="text-xs text-muted-foreground">Campanha, conjunto e anúncio vão para a ficha e para os relatórios.</p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setAdCode(null); setPick(""); }} aria-label="Trocar anúncio">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Select value={pick} onValueChange={choose}>
                  <SelectTrigger aria-label="Qual anúncio"><SelectValue placeholder={activeCodes.length ? "Qual anúncio? (ou cole a saudação)" : "Qual campanha?"} /></SelectTrigger>
                  <SelectContent>
                    {activeCodes.map((c) => <SelectItem key={c.id} value={c.code}>{c.code} · {adCodePath(c)}</SelectItem>)}
                    <SelectItem value={OTHER}>Outra / não sei o código</SelectItem>
                  </SelectContent>
                </Select>
                {(pick === OTHER || activeCodes.length === 0) && (
                  <>
                    <Input list="ig-campaigns" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Nome da campanha (opcional)" aria-label="Campanha" maxLength={120} />
                    <datalist id="ig-campaigns">{campaigns.map((c) => <option key={c} value={c} />)}</datalist>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>O que a pessoa quer</Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Interesse">
              {Object.entries(INTEREST_LABEL).map(([k, l]) => <Chip key={k} active={interest === k} onClick={() => setInterest(k)}>{l}</Chip>)}
            </div>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex.: troca de tela do iPhone 12" aria-label="Assunto" maxLength={120} />
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
