import { useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fetchWhatsAppHealth, runWhatsAppCheck } from "../../api/health";
import { healthView, type HealthTone } from "../../lib/whatsappHealth";
import { cn } from "@/lib/utils";

const TONE: Record<HealthTone, { icon: typeof CheckCircle2; className: string; ring: string }> = {
  ok: { icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400", ring: "border-emerald-500/30 bg-emerald-500/5" },
  warn: { icon: AlertTriangle, className: "text-amber-600 dark:text-amber-400", ring: "border-amber-500/30 bg-amber-500/5" },
  bad: { icon: AlertTriangle, className: "text-destructive", ring: "border-destructive/40 bg-destructive/5" },
};

const shortName = (name: string) => name.replace(/^.*\(([^)]+)\).*$/, "$1");

/** Saúde do WhatsApp de cada loja: o que o vigia viu na última checagem (a cada 15 min). Só gerência. */
export function WhatsAppHealthCard() {
  const qc = useQueryClient();
  const health = useQuery({ queryKey: ["crm", "whatsapp-health"], queryFn: fetchWhatsAppHealth, refetchInterval: 60_000, staleTime: 30_000 });
  const [busy, setBusy] = useState(false);
  const rows = health.data ?? [];
  if (!health.isLoading && !health.isError && rows.length === 0) return null; // não é gerência ou não há número

  async function checkNow() {
    setBusy(true);
    try {
      await runWhatsAppCheck();
      await qc.invalidateQueries({ queryKey: ["crm", "whatsapp-health"] });
      toast.success("Checagem feita.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const now = Date.now();
  return (
    <section aria-labelledby="wa-health-title" className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-sky-500/10 p-2"><Activity className="h-5 w-5 text-sky-600 dark:text-sky-400" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <h3 id="wa-health-title" className="font-semibold">Saúde do WhatsApp</h3>
          <p className="text-sm text-muted-foreground">O CRM confere a cada 15 min, recupera sozinho as mensagens que faltarem e avisa o admin se algo parar.</p>
        </div>
        <Button size="sm" variant="outline" onClick={checkNow} disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />} Checar agora
        </Button>
      </div>

      {health.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {health.isError && <p className="text-sm text-destructive">{(health.error as Error).message}</p>}

      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => {
          const v = healthView(r, now);
          const t = TONE[v.tone];
          const Icon = t.icon;
          return (
            <li key={r.config_id} className={cn("rounded-lg border p-3", t.ring)}>
              <p className="text-sm font-semibold">{shortName(r.store_name)}</p>
              <p className={cn("mt-0.5 flex items-center gap-1.5 text-sm font-medium", t.className)}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {v.headline}
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {v.details.map((d) => <li key={d} className="break-words">{d}</li>)}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
