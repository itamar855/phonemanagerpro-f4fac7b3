import { useState } from "react";
import { toast } from "sonner";
import { Copy, Link2, MessageCircle, RefreshCw, Send, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createShare } from "../api/share";
import { deviceName } from "../lib/handoff";
import { customerWhatsApp, shareExpiryLabel, shareMessage, shareUrl, SHARE_DAYS } from "../lib/share";
import type { TradeEvaluation } from "../lib/types";

/**
 * "Enviar avaliação pro cliente": cria (ou renova) o link de 3 dias e abre o WhatsApp do
 * cliente com a mensagem pronta. Sem WhatsApp válido, copia ou compartilha o link.
 */
export function ShareLinkPanel({ evaluation, onChanged, className }: {
  evaluation: TradeEvaluation;
  onChanged?: () => void;
  className?: string;
}) {
  const [link, setLink] = useState(() => evaluation.share ? { token: evaluation.share.token, expires_at: evaluation.share.expires_at } : null);
  const [busy, setBusy] = useState(false);
  const expired = !!link && new Date(link.expires_at) <= new Date();

  const make = async () => {
    setBusy(true);
    try {
      const s = await createShare(evaluation.id);
      setLink(s);
      onChanged?.();
      toast.success(expired ? `Link renovado por ${SHARE_DAYS} dias.` : "Link pronto.");
    } catch (e) {
      toast.error(`Não foi possível criar o link: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!link) {
    return (
      <Button variant="outline" className={cn("h-12 w-full", className)} disabled={busy} onClick={make}>
        <Send className="mr-2 h-4 w-4" /> {busy ? "Criando link…" : "Enviar avaliação pro cliente"}
      </Button>
    );
  }

  const url = shareUrl(link.token);
  const text = shareMessage({
    firstName: evaluation.customer_name?.trim().split(/\s+/)[0] || null,
    device: deviceName(evaluation),
    offer: evaluation.agreed_value ?? evaluation.offer_max,
    blocked: evaluation.blocked,
    url,
  });
  const wa = customerWhatsApp(evaluation.customer_phone, text);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Mensagem com o link copiada.");
    } catch {
      window.prompt("Copie o link:", url);
    }
  };

  return (
    <div className={cn("space-y-2 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-left", className)}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Link2 className="h-4 w-4 text-primary" aria-hidden="true" />
        {expired ? "O link venceu" : "Link para o cliente"}
      </p>
      <p className="text-xs text-muted-foreground">
        {expired
          ? "Renove para o cliente ver de novo. Os preços usados são os da avaliação."
          : `Vale até ${shareExpiryLabel(link.expires_at)}. O cliente vê o valor base, cada desconto e pode refazer ou mandar fotos.`}
      </p>
      {expired ? (
        <Button className="h-11 w-full" disabled={busy} onClick={make}>
          <RefreshCw className="mr-2 h-4 w-4" /> Renovar por {SHARE_DAYS} dias
        </Button>
      ) : (
        <div className="grid gap-2">
          {wa && (
            <Button asChild className="h-12 w-full bg-emerald-600 text-white hover:bg-emerald-700">
              <a href={wa} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-5 w-5" /> Enviar no WhatsApp
              </a>
            </Button>
          )}
          <div className={cn("grid gap-2", canShare && "grid-cols-2")}>
            <Button variant="outline" className="h-11" onClick={copy}>
              <Copy className="mr-2 h-4 w-4" /> Copiar
            </Button>
            {canShare && (
              <Button variant="outline" className="h-11"
                onClick={() => navigator.share({ text }).catch(() => undefined)}>
                <Share2 className="mr-2 h-4 w-4" /> Compartilhar
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
