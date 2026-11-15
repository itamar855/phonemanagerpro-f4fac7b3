import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Copy, Hash, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createAdCode, listAdCodes, setAdCodeActive } from "../../api/adCodes";
import { crmDb } from "../../api/db";
import { adCodePath, adTexts, suggestCode, type AdCode } from "../../lib/adCodes";

const LEVELS: { v: AdCode["level"]; l: string; help: string }[] = [
  { v: "ad", l: "Por anúncio", help: "Mais detalhe: sabe qual criativo trouxe o lead. Bom para testar criativos." },
  { v: "adset", l: "Por conjunto", help: "Todos os anúncios do conjunto usam o mesmo código." },
  { v: "campaign", l: "Por campanha", help: "O mínimo de trabalho e de detalhe." },
];

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast.success("Copiado. Cole no anúncio."); } catch { toast.error("Não foi possível copiar."); }
}

/** Cadastro dos códigos (#T21) e textos prontos para o "Modelo de mensagem" dos anúncios. */
export function AdCodesCard({ storeId, userId, canEdit }: { storeId: string; userId: string | null; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: codes = [] } = useQuery({ queryKey: ["crm", "ad-codes", storeId], queryFn: () => listAdCodes(storeId) });
  const { data: storeName } = useQuery({
    queryKey: ["crm", "store-name", storeId],
    queryFn: async () => ((await crmDb.from("stores").select("name").eq("id", storeId).maybeSingle()).data?.name as string | undefined) ?? "nossa loja",
    staleTime: 10 * 60_000,
  });
  const [level, setLevel] = useState<AdCode["level"]>("ad");
  const [campaign, setCampaign] = useState("");
  const [adset, setAdset] = useState("");
  const [ad, setAd] = useState("");
  const [adId, setAdId] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const campaignNames = useMemo(() => [...new Set(codes.map((c) => c.campaign_name))], [codes]);
  const adsetNames = useMemo(() => [...new Set(codes.filter((c) => c.campaign_name === campaign).map((c) => c.adset_name).filter(Boolean))] as string[], [codes, campaign]);

  useEffect(() => {
    if (!codeTouched && campaign.trim()) setCode(suggestCode(campaign, codes.map((c) => c.code), level));
  }, [campaign, level, codes, codeTouched]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !campaign.trim() || !code) return;
    if (level !== "campaign" && !adset.trim()) { toast.error("Informe o conjunto."); return; }
    if (level === "ad" && !ad.trim()) { toast.error("Informe o anúncio."); return; }
    setSaving(true);
    try {
      await createAdCode({
        storeId, userId, code, level, campaign: campaign.trim(),
        adset: level !== "campaign" ? adset.trim() : null, ad: level === "ad" ? ad.trim() : null, adId: adId.trim() || null,
      });
      qc.invalidateQueries({ queryKey: ["crm", "ad-codes", storeId] });
      toast.success(`Código ${code} criado. Copie os textos para o anúncio.`);
      setOpen(code);
      setAd(""); setAdId(""); setCodeTouched(false);
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-card p-4" aria-labelledby="trk-codes">
      <div>
        <h3 id="trk-codes" className="flex items-center gap-1.5 font-semibold"><Hash className="h-4 w-4 text-primary" aria-hidden="true" /> Códigos de anúncio</h3>
        <p className="text-xs text-muted-foreground">
          Para anúncios que abrem a DM do Instagram (ou o WhatsApp): o código vai na saudação e nas perguntas prontas do anúncio.
          Quando o vendedor cola a mensagem, o CRM sabe a campanha, o conjunto e o anúncio. Mensagens do WhatsApp com o código são reconhecidas sozinhas.
        </p>
      </div>

      {canEdit && (
        <form onSubmit={save} className="space-y-3 rounded-lg border border-border/50 p-3">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Nível do código">
            {LEVELS.map((l) => (
              <button key={l.v} type="button" role="radio" aria-checked={level === l.v} onClick={() => { setLevel(l.v); setCodeTouched(false); }}
                className={cn("min-h-[36px] rounded-full border px-3 text-xs font-medium", level === l.v ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}>
                {l.l}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">{LEVELS.find((l) => l.v === level)?.help}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ac-camp" className="text-xs">Campanha (nome no Gerenciador)</Label>
              <Input id="ac-camp" list="ac-camps" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Tela Novembro" required maxLength={120} />
              <datalist id="ac-camps">{campaignNames.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            {level !== "campaign" && (
              <div className="space-y-1">
                <Label htmlFor="ac-set" className="text-xs">Conjunto</Label>
                <Input id="ac-set" list="ac-sets" value={adset} onChange={(e) => setAdset(e.target.value)} placeholder="Público 25-45" maxLength={120} />
                <datalist id="ac-sets">{adsetNames.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            )}
            {level === "ad" && (
              <div className="space-y-1">
                <Label htmlFor="ac-ad" className="text-xs">Anúncio</Label>
                <Input id="ac-ad" value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Vídeo 1" maxLength={120} />
              </div>
            )}
            {level === "ad" && (
              <div className="space-y-1">
                <Label htmlFor="ac-adid" className="text-xs">ID do anúncio (opcional)</Label>
                <Input id="ac-adid" inputMode="numeric" value={adId} onChange={(e) => setAdId(e.target.value.replace(/\D/g, ""))} placeholder="120210…" maxLength={30} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="ac-code" className="text-xs">Código</Label>
              <Input id="ac-code" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)); setCodeTouched(true); }}
                className="w-28 font-mono text-base font-semibold" placeholder="T21" />
            </div>
            <Button type="submit" size="sm" className="h-10" disabled={saving || !campaign.trim() || code.length < 2}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} Gerar código e textos
            </Button>
          </div>
        </form>
      )}

      {codes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">Nenhum código ainda.</p>
      ) : (
        <ul className="divide-y divide-border/40 rounded-lg border border-border/50">
          {codes.map((c) => {
            const t = adTexts(c.code, storeName ?? "nossa loja");
            const isOpen = open === c.code;
            return (
              <li key={c.id} className={cn("p-3 text-sm", !c.active && "opacity-60")}>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-sm font-semibold text-primary">{c.code}</span>
                  <span className="min-w-0 flex-1 truncate">{adCodePath(c)}</span>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(isOpen ? null : c.code)} aria-expanded={isOpen}>
                    Textos <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                  </Button>
                </div>
                {isOpen && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">No Gerenciador → anúncio → <strong>Modelo de mensagem</strong>: cole a saudação e as perguntas.</p>
                    {[{ label: "Saudação", text: t.greeting }, ...t.questions.map((q, i) => ({ label: `Pergunta ${i + 1}`, text: q }))].map((x) => (
                      <div key={x.label} className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
                        <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{x.label}</span>
                        <span className="min-w-0 flex-1 text-xs">{x.text}</span>
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => copy(x.text)} aria-label={`Copiar ${x.label}`}><Copy className="h-3.5 w-3.5" /></Button>
                      </div>
                    ))}
                    {canEdit && (
                      <Button size="sm" variant="ghost" className="h-8" onClick={async () => {
                        try { await setAdCodeActive(c.id, !c.active); qc.invalidateQueries({ queryKey: ["crm", "ad-codes", storeId] }); }
                        catch (e) { toast.error((e as Error).message); }
                      }}>{c.active ? "Desativar código" : "Reativar código"}</Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
