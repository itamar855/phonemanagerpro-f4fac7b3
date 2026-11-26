import { cn } from "@/lib/utils";
import { formatBRL, type Offer } from "../lib/calc";
import { QUESTION_BY_KEY } from "../lib/questions";

/**
 * Painel que o cliente acompanha durante a avaliação: valor base do aparelho na loja,
 * cada desconto que entrou e quanto vale até agora. Atualiza a cada resposta.
 */
export function ValueTracker({ offer, deviceLabel }: { offer: Offer; deviceLabel: string }) {
  const discounts = offer.lines.filter((l) => l.value > 0);
  const blocked = offer.lines.find((l) => l.kind === "block");
  const now = Math.max(0, offer.base - offer.discountTotal);

  return (
    <section aria-label="Valor do aparelho até agora" aria-live="polite"
      className="glass overflow-hidden rounded-2xl border border-border/50 bg-card/70">
      <div className="flex items-end justify-between gap-3 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Valor base na loja</p>
          <p className="truncate text-xs text-muted-foreground">{deviceLabel}</p>
          <p className="font-display text-lg font-bold tabular-nums">{formatBRL(offer.base)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Valor até agora</p>
          <p key={blocked ? "block" : now}
            className={cn("font-display text-2xl font-extrabold tabular-nums animate-in fade-in-0 zoom-in-95 duration-300",
              blocked ? "text-destructive" : "text-primary")}>
            {blocked ? "Não compra" : formatBRL(now)}
          </p>
        </div>
      </div>
      {discounts.length > 0 && (
        <ul className="divide-y divide-border/40 px-4 text-sm">
          {discounts.map((l) => (
            <li key={`${l.question}|${l.label}`} className="flex justify-between gap-3 py-2 animate-in fade-in-0 slide-in-from-top-1 duration-300">
              <span className="min-w-0 text-muted-foreground">{QUESTION_BY_KEY.get(l.question)?.short}: {l.label}</span>
              <span className="shrink-0 tabular-nums text-destructive">−{formatBRL(l.value)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 py-2 text-xs font-medium">
            <span className="text-muted-foreground">Total descontado</span>
            <span className="tabular-nums text-destructive">−{formatBRL(offer.discountTotal)}</span>
          </li>
        </ul>
      )}
    </section>
  );
}
