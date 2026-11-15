import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, Send, Sparkles, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { discardSuggestion, sendSuggestion, suggestReply } from "../../api/ai";
import { crmKeys } from "../../hooks/useInbox";
import { aiKeys, useAiSuggestion } from "../../hooks/useAi";

interface Props {
  conversationId: string;
  userId: string | null;
  /** Mostra "Sugerir resposta" (WhatsApp, última mensagem do cliente) */
  canSuggest: boolean;
}

/** Sugestão da IA em modo rascunho: a pessoa revisa, edita e envia (ou descarta). */
export function AiSuggestionBar({ conversationId, userId, canSuggest }: Props) {
  const qc = useQueryClient();
  const { data: sug } = useAiSuggestion(conversationId);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"send" | "discard" | "suggest" | null>(null);

  useEffect(() => { setText(sug?.body ?? ""); setEditing(false); }, [sug?.id, sug?.body]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: aiKeys.suggestion(conversationId) });
    qc.invalidateQueries({ queryKey: crmKeys.messages(conversationId) });
    qc.invalidateQueries({ queryKey: crmKeys.conversation(conversationId) });
    qc.invalidateQueries({ queryKey: ["crm", "conversations"] });
  };

  if (!sug) {
    if (!canSuggest) return null;
    return (
      <div className="flex justify-start border-t border-border/50 px-2 pt-2 md:px-3">
        <Button
          size="sm" variant="ghost" className="h-9 text-violet-700 hover:text-violet-700 dark:text-violet-300"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("suggest");
            try {
              const r = await suggestReply(conversationId);
              if (r.status === "skipped") toast.info(r.reason === "não é cliente" ? "Contato marcado como “não é cliente”." : "Nada para sugerir agora.");
              else if (r.decision?.decision === "ignore") toast.info("A IA acha que esta conversa não é de cliente.");
              refresh();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === "suggest" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
          {busy === "suggest" ? "A IA está pensando…" : "Sugerir resposta com IA"}
        </Button>
      </div>
    );
  }

  async function send() {
    if (!text.trim()) return;
    setBusy("send");
    try {
      const r = await sendSuggestion({ conversationId, suggestionId: sug!.id, body: text.trim() });
      if (r.warning) toast.warning(r.warning);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="Sugestão da IA" className="border-t border-violet-500/30 bg-violet-500/5 px-2 py-2 md:px-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Sugestão da IA
        {sug.kind === "handoff" && (
          <span className="inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-px font-medium">
            <UserRound className="h-3 w-3" aria-hidden="true" /> passa para atendente
          </span>
        )}
        <span className="ml-auto font-normal text-muted-foreground">revise antes de enviar</span>
      </div>
      {editing ? (
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus aria-label="Editar sugestão"
          className="mb-2 text-base md:text-sm" maxLength={4000} />
      ) : (
        <p className="mb-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-violet-500/20 bg-background/60 px-3 py-2 text-sm">{text}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="h-10 flex-1 sm:flex-none" onClick={send} disabled={busy !== null || !text.trim()}>
          {busy === "send" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Enviar
        </Button>
        <Button size="sm" variant="outline" className="h-10" onClick={() => setEditing((v) => !v)} disabled={busy !== null}>
          {editing ? <><Check className="mr-1.5 h-4 w-4" /> Pronto</> : <><Pencil className="mr-1.5 h-4 w-4" /> Editar</>}
        </Button>
        <Button size="sm" variant="ghost" className="h-10" disabled={busy !== null || !userId}
          onClick={async () => {
            setBusy("discard");
            try { await discardSuggestion(sug.id, userId!); refresh(); }
            catch (e) { toast.error((e as Error).message); }
            finally { setBusy(null); }
          }}>
          <X className="mr-1.5 h-4 w-4" /> Descartar
        </Button>
      </div>
    </section>
  );
}
