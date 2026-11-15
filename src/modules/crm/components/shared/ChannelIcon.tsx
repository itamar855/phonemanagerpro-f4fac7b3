import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Channel } from "../../lib/types";

/** Ícone do Instagram (o lucide v1 não traz ícones de marca). */
function InstagramGlyph({ className, label }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Cores de marca só como acento (ícone), nunca como fundo de texto. */
export function ChannelIcon({ channel, className }: { channel: Channel; className?: string }) {
  return channel === "instagram" ? (
    <InstagramGlyph className={cn("h-3.5 w-3.5 text-pink-500", className)} label="Instagram" />
  ) : (
    <MessageCircle className={cn("h-3.5 w-3.5 text-emerald-500", className)} aria-label="WhatsApp" />
  );
}
