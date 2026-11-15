import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, LogOut, QrCode, RefreshCw, Save, Webhook } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  channelConfigureWebhook, channelConnect, channelLogout, channelSaveConfig, channelStatus,
} from "../../api/inbox";
import { crmKeys } from "../../hooks/useInbox";
import { ChannelIcon } from "../shared/ChannelIcon";

const STATE_LABEL: Record<string, { text: string; tone: "ok" | "warn" | "bad" }> = {
  open: { text: "Conectado", tone: "ok" },
  connecting: { text: "Aguardando leitura do QR Code", tone: "warn" },
  close: { text: "Desconectado", tone: "bad" },
  not_found: { text: "Instância não existe no servidor", tone: "bad" },
  unreachable: { text: "Servidor da Evolution fora do ar", tone: "bad" },
  unknown: { text: "Estado desconhecido", tone: "warn" },
};

export function WhatsAppChannelCard({ storeId }: { storeId: string | null }) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: crmKeys.channel(storeId), queryFn: () => channelStatus(storeId), staleTime: 10_000, retry: false });
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ api_url: "", instance_name: "", api_key: "" });

  const s = status.data;
  useEffect(() => {
    if (s?.configured) setForm((f) => ({ ...f, instance_name: f.instance_name || s.instance_name || "", api_url: f.api_url || (s.api_host ? `https://${s.api_host}` : "") }));
  }, [s]);

  // enquanto o QR estiver na tela, confere a conexão a cada 5 s
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(() => qc.invalidateQueries({ queryKey: crmKeys.channel(storeId) }), 5000);
    return () => clearInterval(t);
  }, [qr, qc, storeId]);
  useEffect(() => { if (s?.state === "open" && qr) { setQr(null); toast.success("WhatsApp conectado!"); } }, [s?.state, qr]);

  async function run(name: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(name);
    try {
      await fn();
      if (ok) toast.success(ok);
      qc.invalidateQueries({ queryKey: crmKeys.channel(storeId) });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const state = STATE_LABEL[s?.state ?? "unknown"] ?? STATE_LABEL.unknown;
  const canManage = Boolean(s?.can_manage);

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-emerald-500/10 p-2"><ChannelIcon channel="whatsapp" className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">WhatsApp (Evolution API)</h3>
          {status.isLoading ? (
            <p className="text-sm text-muted-foreground">Verificando…</p>
          ) : status.isError ? (
            <p className="text-sm text-destructive">{(status.error as Error).message}</p>
          ) : !s?.configured ? (
            <p className="text-sm text-muted-foreground">Nenhum número configurado.</p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm">
              {state.tone === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" /> : <AlertTriangle className={state.tone === "bad" ? "h-4 w-4 text-destructive" : "h-4 w-4 text-amber-500"} aria-hidden="true" />}
              <span>{state.text}</span>
              <span className="text-muted-foreground">· {s.instance_name}</span>
            </p>
          )}
          {s?.shared_from_other_store && <p className="mt-1 text-xs text-muted-foreground">Usando o número configurado em outra loja.</p>}
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => status.refetch()} aria-label="Atualizar status">
          <RefreshCw className={status.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {qr && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 bg-white p-4">
          <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="QR Code para conectar o WhatsApp" className="h-56 w-56" />
          <p className="text-center text-xs text-neutral-700">No celular da loja: WhatsApp → Aparelhos conectados → Conectar aparelho.</p>
        </div>
      )}

      {canManage && s?.configured && (
        <div className="flex flex-wrap gap-2">
          {s.state !== "open" && (
            <Button size="sm" disabled={busy !== null || s.state === "unreachable"} onClick={() => run("qr", async () => { const r = await channelConnect(storeId); if (r.base64) setQr(r.base64); else toast.info("O servidor não devolveu QR Code. Verifique se a instância existe."); })}>
              {busy === "qr" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <QrCode className="mr-1.5 h-4 w-4" />} Conectar (QR Code)
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => run("hook", () => channelConfigureWebhook(storeId), "Webhook configurado com o segredo.")} disabled={busy !== null || s.state === "unreachable"}>
            {busy === "hook" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Webhook className="mr-1.5 h-4 w-4" />} Configurar webhook
          </Button>
          {s.state === "open" && (
            <Button size="sm" variant="outline" onClick={() => { if (confirm("Desconectar o WhatsApp da loja? As mensagens param de chegar até conectar de novo.")) void run("logout", () => channelLogout(storeId), "WhatsApp desconectado."); }} disabled={busy !== null}>
              <LogOut className="mr-1.5 h-4 w-4" /> Desconectar
            </Button>
          )}
        </div>
      )}

      {canManage && (
        <form
          className="grid gap-3 border-t border-border/50 pt-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run("save", () => channelSaveConfig(storeId, { api_url: form.api_url, instance_name: form.instance_name, api_key: form.api_key || undefined }), "Configuração salva.").then(() => setForm((f) => ({ ...f, api_key: "" })));
          }}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="evo-url">URL da Evolution API</Label>
            <Input id="evo-url" value={form.api_url} onChange={(e) => setForm({ ...form, api_url: e.target.value })} placeholder="https://evolution.suaempresa.com" inputMode="url" autoComplete="off" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evo-inst">Nome da instância</Label>
            <Input id="evo-inst" value={form.instance_name} onChange={(e) => setForm({ ...form, instance_name: e.target.value })} autoComplete="off" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evo-key">API Key</Label>
            <Input id="evo-key" type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder={s?.has_api_key ? "•••••• (mantida se ficar em branco)" : "Cole a chave"} autoComplete="new-password" />
            <p className="text-xs text-muted-foreground">A chave fica só no servidor e nunca é mostrada de volta.</p>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" disabled={busy !== null}>
              {busy === "save" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Salvar configuração
            </Button>
          </div>
        </form>
      )}
      {!canManage && !status.isLoading && <p className="text-xs text-muted-foreground">Somente admin, dono ou gerente altera a conexão.</p>}
    </div>
  );
}
