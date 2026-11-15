import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Paperclip, Send, StickyNote, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CrmQuickReply } from "../../lib/types";

export type ComposerMode = "reply" | "note";

interface Props {
  disabledReason?: string | null;
  quickReplies: CrmQuickReply[];
  onSend: (args: { mode: ComposerMode; text: string; file: File | null }) => Promise<void>;
}

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_FILE = 16 * 1024 * 1024;

export function Composer({ disabledReason, quickReplies, onSend }: Props) {
  const [mode, setMode] = useState<ComposerMode>("reply");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const slash = mode === "reply" && text.startsWith("/") && !text.includes(" ") ? text.slice(1).toLowerCase() : null;
  const matches = useMemo(
    () => (slash === null ? [] : quickReplies.filter((q) => q.shortcut.toLowerCase().startsWith(slash)).slice(0, 6)),
    [slash, quickReplies],
  );

  const blocked = mode === "reply" && Boolean(disabledReason);
  const canSend = !sending && !blocked && (text.trim().length > 0 || (mode === "reply" && file !== null));

  async function submit() {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend({ mode, text: text.trim(), file: mode === "reply" ? file : null });
      setText("");
      setFile(null);
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  }

  // Enter envia; Shift+Enter quebra linha; não envia durante composição (IME/teclado virtual)
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (matches.length > 0) {
      e.preventDefault();
      setText(matches[0].body);
      return;
    }
    e.preventDefault();
    if (e.nativeEvent.isComposing || e.keyCode === 229 || e.repeat) return;
    formRef.current?.requestSubmit();
  }

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_FILE) { toast.error("Arquivo acima de 16 MB."); return; }
    setFile(f);
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      className={cn("border-t border-border/50 p-2 md:p-3", mode === "note" && "bg-amber-500/5")}
    >
      <div className="mb-2 flex items-center gap-1" role="radiogroup" aria-label="Tipo de mensagem">
        {(["reply", "note"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "inline-flex min-h-[32px] items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mode === m
                ? m === "note" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "note" ? <StickyNote className="h-3.5 w-3.5" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
            {m === "note" ? "Nota interna" : "Responder"}
          </button>
        ))}
        {mode === "reply" && quickReplies.length > 0 && (
          <span className="ml-auto hidden items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
            <Zap className="h-3 w-3" aria-hidden="true" /> digite / para respostas rápidas
          </span>
        )}
      </div>

      {blocked && <p className="mb-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{disabledReason}</p>}

      {matches.length > 0 && (
        <ul className="mb-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-md" aria-label="Respostas rápidas">
          {matches.map((q) => (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => setText(q.body)}
                className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="text-xs font-semibold text-primary">/{q.shortcut}</span>
                <span className="line-clamp-1 text-xs text-muted-foreground">{q.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {file && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs">
          <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{file.name}</span>
          <button type="button" onClick={() => setFile(null)} aria-label="Remover anexo" className="ml-auto flex h-7 w-7 items-center justify-center rounded hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {mode === "reply" && (
          <>
            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => fileRef.current?.click()} disabled={blocked || sending} aria-label="Anexar imagem ou PDF">
              <Paperclip className="h-5 w-5" />
            </Button>
          </>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={blocked}
          placeholder={mode === "note" ? "Nota visível só para a equipe…" : file ? "Legenda (opcional)…" : "Escreva uma mensagem…"}
          aria-label={mode === "note" ? "Nota interna" : "Mensagem"}
          className="max-h-40 min-h-[44px] flex-1 resize-none"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={!canSend} aria-label={mode === "note" ? "Salvar nota" : "Enviar"}>
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : mode === "note" ? <StickyNote className="h-5 w-5" /> : <Send className="h-5 w-5" />}
        </Button>
      </div>
    </form>
  );
}
