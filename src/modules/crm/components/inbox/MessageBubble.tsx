import { useEffect, useState } from "react";
import { AlertCircle, Bot, Check, CheckCheck, Clock, FileText, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { mediaSignedUrl } from "../../api/inbox";
import type { CrmMessage } from "../../lib/types";

function useMediaSrc(m: CrmMessage) {
  const [src, setSrc] = useState<string | null>(m.media_url);
  useEffect(() => {
    let alive = true;
    if (m.media_path) mediaSignedUrl(m.media_path).then((u) => alive && setSrc(u));
    else setSrc(m.media_url);
    return () => { alive = false; };
  }, [m.media_path, m.media_url]);
  return src;
}

function StatusIcon({ status }: { status: CrmMessage["status"] }) {
  const cls = "h-3.5 w-3.5";
  switch (status) {
    case "pending": return <Clock className={cls} aria-label="Enviando" />;
    case "sent": return <Check className={cls} aria-label="Enviada" />;
    case "delivered": return <CheckCheck className={cls} aria-label="Entregue" />;
    case "read": return <CheckCheck className={cn(cls, "text-sky-500")} aria-label="Lida" />;
    case "failed": return <AlertCircle className={cn(cls, "text-destructive")} aria-label="Falhou" />;
    default: return null;
  }
}

export function MessageBubble({ m, authorName }: { m: CrmMessage; authorName?: string }) {
  const src = useMediaSrc(m);
  const out = m.direction === "out";
  const time = format(new Date(m.created_at), "HH:mm");

  if (m.kind === "note") {
    return (
      <div className="mx-auto my-1 w-full max-w-[85%] rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
        <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
          <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
          Nota interna{authorName ? ` · ${authorName}` : ""} · {time}
        </div>
        <p className="whitespace-pre-wrap break-words text-foreground">{m.body}</p>
      </div>
    );
  }

  const caption = m.body && !/^\[(Imagem|Áudio|Vídeo|Documento|Figurinha)\]$/.test(m.body) ? m.body : null;

  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm md:max-w-[70%]",
          out ? "rounded-br-md bg-primary/15 text-foreground" : "rounded-bl-md border border-border/50 bg-card text-foreground",
          m.status === "failed" && "border border-destructive/50",
        )}
      >
        {out && m.sender_kind === "ai" && (
          <div className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400">
            <Bot className="h-3 w-3" aria-hidden="true" /> IA
          </div>
        )}
        {out && m.sender_kind === "user" && authorName && (
          <div className="mb-0.5 text-[11px] font-semibold text-primary">{authorName}</div>
        )}

        {m.kind === "image" && (src ? (
          <a href={src} target="_blank" rel="noreferrer" className="mb-1 block overflow-hidden rounded-lg">
            <img src={src} alt={caption ?? "Imagem recebida"} loading="lazy" className="max-h-72 w-full object-cover" />
          </a>
        ) : <p className="italic text-muted-foreground">[Imagem indisponível]</p>)}

        {m.kind === "audio" && (src ? (
          <audio controls preload="none" src={src} className="mb-1 h-10 w-60 max-w-full" aria-label="Áudio" />
        ) : <p className="italic text-muted-foreground">[Áudio indisponível]</p>)}

        {(m.kind === "document" || m.kind === "video") && (
          src ? (
            <a href={src} target="_blank" rel="noreferrer" className="mb-1 inline-flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1.5 underline-offset-2 hover:underline">
              <FileText className="h-4 w-4" aria-hidden="true" /> {m.kind === "video" ? "Vídeo" : "Documento"}
            </a>
          ) : <p className="italic text-muted-foreground">[{m.kind === "video" ? "Vídeo" : "Documento"}]</p>
        )}

        {m.kind === "sticker" && <p className="italic text-muted-foreground">[Figurinha]</p>}

        {(m.kind === "text" || caption) && m.kind !== "sticker" && (
          <p className="whitespace-pre-wrap break-words">{m.kind === "text" ? m.body : caption}</p>
        )}

        <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground")}>
          <time dateTime={m.created_at}>{time}</time>
          {out && <StatusIcon status={m.status} />}
        </div>
        {m.status === "failed" && m.error && <p className="mt-1 text-[11px] text-destructive">{m.error}</p>}
      </div>
    </div>
  );
}
