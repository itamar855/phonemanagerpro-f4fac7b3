import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2, Share } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { appServiceWorker, currentSubscription, disablePush, enablePush, testPush } from "../../api/push";
import { currentPushEnv, pushSupport } from "../../lib/push";

type State = "loading" | "on" | "off" | "blocked" | "ios-install" | "unsupported" | "dev";

/** Sino do cabeçalho do CRM: liga/desliga o aviso de mensagem nova NESTE aparelho. */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const support = pushSupport(currentPushEnv());
    if (support !== "ok") { setState(support); return; }
    if (!(await appServiceWorker())) { setState("dev"); return; }
    if (Notification.permission === "denied") { setState("blocked"); return; }
    setState((await currentSubscription()) && Notification.permission === "granted" ? "on" : "off");
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); void refresh(); }
  }

  const Icon = state === "on" ? BellRing : state === "off" || state === "loading" ? Bell : BellOff;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative h-9 w-9 shrink-0", state === "on" && "text-primary")}
          aria-label={state === "on" ? "Avisos no celular ligados" : "Avisos no celular"}
          title="Avisos de mensagem nova"
        >
          <Icon className="h-5 w-5" />
          {state === "off" && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 text-sm">
        <div>
          <p className="font-semibold">Avisos de mensagem nova</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Conversa com responsável avisa só ele (e o admin). Sem responsável, avisa todos do CRM. Vale para este aparelho.
          </p>
        </div>
        {state === "on" && (
          <>
            <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300"><BellRing className="h-4 w-4" /> Ligados neste aparelho</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" disabled={busy} onClick={() => run(async () => testPush((await currentSubscription())?.endpoint), "Aviso de teste enviado.")}>
                Enviar teste
              </Button>
              <Button size="sm" variant="ghost" className="flex-1" disabled={busy} onClick={() => run(disablePush, "Avisos desligados neste aparelho.")}>
                Desligar
              </Button>
            </div>
          </>
        )}
        {state === "off" && (
          <Button size="sm" className="w-full" disabled={busy} onClick={() => run(async () => { const s = await enablePush(); await testPush(s.endpoint); }, "Avisos ligados! Mandamos um teste.")}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Bell className="mr-1.5 h-4 w-4" />} Ativar neste aparelho
          </Button>
        )}
        {state === "blocked" && (
          <p className="text-xs">As notificações estão <strong>bloqueadas</strong> para este site. Libere em Configurações do navegador → Notificações e volte aqui.</p>
        )}
        {state === "ios-install" && (
          <p className="text-xs">
            No iPhone, os avisos só funcionam com o app instalado: toque em <Share className="inline h-3.5 w-3.5" aria-label="Compartilhar" /> <strong>Compartilhar → Adicionar à Tela de Início</strong>, abra pelo ícone e ative aqui.
          </p>
        )}
        {state === "unsupported" && <p className="text-xs">Este navegador não recebe avisos. Use o Chrome (Android/PC) ou o app instalado no iPhone.</p>}
        {state === "dev" && <p className="text-xs">Disponível no endereço publicado do sistema (ou no app instalado).</p>}
        {state === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </PopoverContent>
    </Popover>
  );
}
