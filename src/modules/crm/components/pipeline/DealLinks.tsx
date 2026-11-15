import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ExternalLink, Link2, Receipt, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { dealLinkCandidates, type LinkCandidate } from "../../api/reports";
import { updateDeal } from "../../api/pipeline";
import { useInvalidateDeals } from "../../hooks/usePipeline";
import { brl, relative } from "../../lib/format";
import type { CrmDeal } from "../../lib/types";

/**
 * Liga o negócio à venda ou OS que saiu dele (o CRM só lê Vendas/OS).
 * Sugere as vendas e OS dos últimos 90 dias do mesmo cliente.
 */
export function DealLinks({ deal }: { deal: CrmDeal }) {
  const invalidate = useInvalidateDeals();
  const [busy, setBusy] = useState<string | null>(null);
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["crm", "deal-links", deal.id],
    queryFn: () => dealLinkCandidates(deal.id),
    staleTime: 60_000,
  });

  const linked = (c: LinkCandidate) => (c.kind === "sale" ? deal.sale_id === c.id : deal.service_order_id === c.id);
  const hasLink = Boolean(deal.sale_id || deal.service_order_id);

  async function toggle(c: LinkCandidate) {
    setBusy(c.id);
    try {
      const on = !linked(c);
      await updateDeal(deal.id, c.kind === "sale" ? { sale_id: on ? c.id : null } : { service_order_id: on ? c.id : null });
      invalidate();
      toast.success(on ? "Vinculado ao negócio." : "Vínculo removido.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2" aria-labelledby="dl-links">
      <h3 id="dl-links" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Venda / OS deste negócio</h3>
      {!isLoading && candidates.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {hasLink ? "Vinculado a um registro com mais de 90 dias." : "Nenhuma venda ou OS deste cliente nos últimos 90 dias."}
        </p>
      )}
      {candidates.length > 0 && (
        <ul className="divide-y divide-border/40 rounded-md border border-border/50">
          {candidates.map((c) => {
            const on = linked(c);
            const Icon = c.kind === "sale" ? Receipt : Wrench;
            return (
              <li key={`${c.kind}:${c.id}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.amount ? `${brl(c.amount)} · ` : ""}{relative(c.happened_at)}</p>
                </div>
                {c.kind === "service_order" && (
                  <Button asChild variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Abrir ${c.label}`}>
                    <Link to={`/ordens-servico?openOs=${c.id}`}><ExternalLink className="h-4 w-4" /></Link>
                  </Button>
                )}
                <Button size="sm" variant={on ? "secondary" : "outline"} className="h-8 shrink-0" disabled={busy !== null} onClick={() => toggle(c)}
                  aria-pressed={on}>
                  {on ? <><Check className="mr-1 h-3.5 w-3.5" /> Vinculado</> : <><Link2 className="mr-1 h-3.5 w-3.5" /> Vincular</>}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {deal.status === "won" && !hasLink && (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="h-8"><Link to="/vendas"><Receipt className="mr-1.5 h-3.5 w-3.5" /> Registrar venda</Link></Button>
          <Button asChild size="sm" variant="outline" className="h-8"><Link to="/ordens-servico"><Wrench className="mr-1.5 h-3.5 w-3.5" /> Abrir OS</Link></Button>
        </div>
      )}
    </section>
  );
}
