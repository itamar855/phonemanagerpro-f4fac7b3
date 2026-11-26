import { useQuery } from "@tanstack/react-query";
import { Camera, CheckCircle2, Eye, PencilLine } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { listPhotos } from "../api/share";
import { formatBRL } from "../lib/calc";
import { diffAnswers, shareExpiryLabel } from "../lib/share";
import type { TradeEvaluation } from "../lib/types";
import { ShareLinkPanel } from "./ShareLinkPanel";

/** Tag da lista do histórico: o que o cliente fez pelo link. */
export function CustomerTag({ ev, fresh }: { ev: TradeEvaluation; fresh: boolean }) {
  const s = ev.share;
  if (!s) return null;
  const label = s.accepted_at ? "Cliente aceitou" : s.reviewed_at ? "Cliente revisou" : s.photo_count ? "Cliente mandou fotos" : null;
  if (!label) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
      fresh ? "bg-amber-500 text-white" : "bg-amber-500/10 text-amber-700 dark:text-amber-300")}>
      {fresh && <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />}
      {label}
    </span>
  );
}

/** No detalhe do histórico: o link, o que o cliente mudou, o aceite e as fotos. */
export function CustomerLinkSection({ ev, onChanged }: { ev: TradeEvaluation; onChanged: () => void }) {
  const s = ev.share;
  const photos = useQuery({
    queryKey: ["troca", "photos", s?.token, s?.photo_count],
    queryFn: () => listPhotos(s!.token),
    enabled: !!s && s.photo_count > 0,
    staleTime: 30 * 60_000,
  });
  if (!s && ev.status === "aceita") return null;

  const storeValue = ev.blocked ? 0 : ev.agreed_value ?? ev.offer_max;
  const diffs = s?.review_answers ? diffAnswers(ev.answers, s.review_answers) : [];
  const expired = !!s && new Date(s.expires_at) <= new Date();

  return (
    <section className="space-y-3" aria-labelledby="t-link">
      <h3 id="t-link" className="text-sm font-semibold">Avaliação do cliente pelo link</h3>
      {s && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          {s.opened_at ? `Abriu em ${shareExpiryLabel(s.opened_at)}` : "Ainda não abriu"}
          {" · "}{expired ? `venceu em ${shareExpiryLabel(s.expires_at)}` : `vale até ${shareExpiryLabel(s.expires_at)}`}
        </p>
      )}

      {s?.accepted_at && (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <p>Aceitou <strong className="tabular-nums">{formatBRL(s.accepted_value)}</strong> pelo link em {shareExpiryLabel(s.accepted_at)}. Chame para fechar e use <strong>Cliente aceitou</strong> aqui embaixo.</p>
        </div>
      )}

      {s?.reviewed_at && (
        <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-semibold">
            <PencilLine className="h-4 w-4" aria-hidden="true" /> Cliente refez a avaliação
            <span className="ml-auto text-xs font-normal text-muted-foreground">{s.review_count}× · {shareExpiryLabel(s.reviewed_at)}</span>
          </p>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-background/60 p-2">
              <p className="text-[11px] text-muted-foreground">Loja</p>
              <p className="font-bold tabular-nums">{ev.blocked ? "Não compra" : formatBRL(storeValue)}</p>
            </div>
            <div className="rounded-lg bg-background/60 p-2">
              <p className="text-[11px] text-muted-foreground">Cliente</p>
              <p className="font-bold tabular-nums">{s.review_blocked ? "Não compra" : formatBRL(s.review_offer)}</p>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Pergunta</th><th className="py-1 font-medium">Loja viu</th><th className="py-1 font-medium">Cliente disse</th></tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {diffs.map((d) => (
                <tr key={d.question} className={cn(d.changed && "font-semibold")}>
                  <td className="py-1.5 pr-2 align-top">{d.short}</td>
                  <td className="py-1.5 pr-2 align-top">{d.store.join(", ")}</td>
                  <td className={cn("py-1.5 align-top", d.changed && "text-amber-700 dark:text-amber-300")}>{d.customer.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.review_note && <p className="italic text-muted-foreground">"{s.review_note}"</p>}
        </div>
      )}

      {s && s.photo_count > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Camera className="h-3.5 w-3.5" aria-hidden="true" /> Fotos do cliente</p>
          <div className="grid grid-cols-4 gap-2">
            {photos.isLoading && Array.from({ length: s.photo_count }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
            {photos.data?.map((p) => (
              <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-border/50">
                <img src={p.url} alt="Foto do aparelho enviada pelo cliente" className="aspect-square w-full object-cover" loading="lazy" />
              </a>
            ))}
          </div>
          {photos.isError && <p className="text-xs text-destructive">Não foi possível carregar as fotos.</p>}
        </div>
      )}

      {ev.status !== "aceita" && <ShareLinkPanel key={s?.expires_at ?? "novo"} evaluation={ev} onChanged={onChanged} />}
    </section>
  );
}
