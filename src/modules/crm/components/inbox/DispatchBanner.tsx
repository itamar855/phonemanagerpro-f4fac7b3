import { useEffect, useState } from "react";
import { BellRing, Clock, Hand, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { acceptDispatch, activeDispatch } from "../../api/tasks";
import { crmKeys } from "../../hooks/useInbox";

/** mm:ss que faltam (0 quando passou). */
function remaining(expiresAt: string | null, now: number): string {
  if (!expiresAt) return "";
  const s = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Faixa da distribuição de atendimento no topo da conversa:
 * a vez é minha → "Assumir"; é de outra pessoa → quem e quanto falta (dá para assumir no lugar);
 * loja fechada → aguardando abrir.
 */
export function DispatchBanner({ conversationId, userId, names }: { conversationId: string; userId: string | null; names: Map<string, string> }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { data: d } = useQuery({
    queryKey: ["crm", "dispatch", conversationId],
    queryFn: () => activeDispatch(conversationId),
    refetchInterval: 20_000,
  });

  useEffect(() => {
    if (d?.status !== "offered") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [d?.status]);

  if (!d) return null;
  const mine = d.status === "offered" && d.user_id === userId;
  const left = remaining(d.expires_at, now);

  async function accept() {
    setBusy(true);
    try {
      await acceptDispatch(conversationId);
      qc.invalidateQueries({ queryKey: ["crm", "dispatch", conversationId] });
      qc.invalidateQueries({ queryKey: crmKeys.conversation(conversationId) });
      qc.invalidateQueries({ queryKey: ["crm", "conversations"] });
      qc.invalidateQueries({ queryKey: ["crm", "counts"] });
      qc.invalidateQueries({ queryKey: ["crm", "tasks"] });
      toast.success("Atendimento é seu. Bom atendimento!");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const text = d.status === "waiting"
    ? "Loja fechada: este atendimento vai para a fila quando a loja abrir."
    : mine
      ? <>Este atendimento é seu se assumir em <strong className="tabular-nums">{left}</strong>.</>
      : <>Aguardando <strong>{names.get(d.user_id ?? "") ?? "a pessoa da vez"}</strong> assumir · <span className="tabular-nums">{left}</span></>;

  return (
    <div role="status"
      className={cn("flex items-center gap-2 border-b px-3 py-2 text-sm md:px-4",
        mine ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200" : "border-border/60 bg-muted/40 text-muted-foreground")}>
      {d.status === "waiting" ? <Clock className="h-4 w-4 shrink-0" aria-hidden="true" /> : <BellRing className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="min-w-0 flex-1">{text}</span>
      <Button size="sm" variant={mine ? "default" : "outline"} className="h-9 shrink-0" onClick={accept} disabled={busy}>
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Hand className="mr-1.5 h-4 w-4" aria-hidden="true" />}
        {mine ? "Assumir" : "Assumir eu"}
      </Button>
    </div>
  );
}
