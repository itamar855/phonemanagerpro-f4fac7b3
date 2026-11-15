// Página pública de retorno do login do Instagram.
// - Aberta como popup pelo CRM: avisa a janela principal e fecha sozinha.
// - Aberta por link em outro navegador/celular: mostra o resultado (não exige login no sistema).
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

// Mesmo valor escutado pelo cartão do Instagram em src/modules/crm (o módulo não importa páginas)
const IG_OAUTH_MESSAGE = "crm-ig-oauth";

export default function IntegracaoInstagram() {
  const [params] = useSearchParams();
  const result = useMemo(() => ({
    ok: params.get("ig") === "ok",
    user: params.get("user") ?? "",
    subscribed: params.get("sub") !== "0",
    msg: params.get("msg") ?? "",
  }), [params]);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage({ type: IG_OAUTH_MESSAGE, ...result }, window.location.origin);
        setClosing(true);
        setTimeout(() => window.close(), 1200);
      } catch {
        /* janela principal em outro domínio: só mostra o resultado */
      }
    }
  }, [result]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border/60 bg-card p-6 text-center shadow-sm">
        {result.ok ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" aria-hidden="true" />
        ) : (
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" aria-hidden="true" />
        )}
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">
            {result.ok ? `Instagram${result.user ? ` @${result.user}` : ""} conectado` : "Não foi possível conectar"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {result.ok
              ? result.subscribed
                ? "As mensagens do Direct já vão chegar no CRM."
                : "Conectado, mas a inscrição no webhook falhou. Confira o webhook no painel da Meta e conecte de novo."
              : result.msg || "Tente de novo pelo CRM."}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {closing ? "Esta janela vai fechar sozinha…" : "Pode fechar esta aba e voltar ao CRM."}
        </p>
        {!closing && (
          <Link to="/crm/config" className="inline-block text-sm font-medium text-primary underline-offset-2 hover:underline">
            Abrir o CRM
          </Link>
        )}
      </div>
    </main>
  );
}
