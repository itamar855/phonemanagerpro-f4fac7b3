import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Check, CheckCircle2, Copy, Loader2, LogIn, LogOut, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { igAppSave, igAuthUrl, igDisconnect, igSave, igStatus } from "../../api/inbox";
import { relative } from "../../lib/format";
import { ChannelIcon } from "../shared/ChannelIcon";

function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input id={id} value={value} readOnly className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label={`Copiar ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border/50 bg-muted/30 p-3" aria-labelledby={`ig-step-${n}`}>
      <h4 id={`ig-step-${n}`} className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">{n}</span>
        {title}
      </h4>
      {children}
    </section>
  );
}

export function InstagramChannelCard({ storeId }: { storeId: string | null }) {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const key = ["crm", "ig-channel", storeId];
  const status = useQuery({ queryKey: key, queryFn: () => igStatus(storeId), staleTime: 30_000, retry: false });
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const s = status.data;

  useEffect(() => { if (s?.app_id && !appId) setAppId(s.app_id); }, [s?.app_id, appId]);

  // Aviso do popup de login (página /integracao/instagram)
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin || ev.data?.type !== "crm-ig-oauth") return;
      if (ev.data.ok) {
        if (ev.data.subscribed) toast.success(`Instagram${ev.data.user ? ` @${ev.data.user}` : ""} conectado ao CRM!`);
        else toast.warning("Instagram conectado, mas a inscrição no webhook falhou. Confira o webhook na Meta e conecte de novo.");
      } else {
        toast.error(ev.data.msg || "Não foi possível conectar o Instagram.");
      }
      qc.invalidateQueries({ queryKey: key });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Link aberto em outro navegador: confere a conexão a cada 5 s enquanto houver link ativo
  const [linkActiveUntil, setLinkActiveUntil] = useState<number | null>(null);
  useEffect(() => {
    if (!linkActiveUntil) return;
    const t = setInterval(() => {
      if (Date.now() > linkActiveUntil) { setLinkActiveUntil(null); return; }
      qc.invalidateQueries({ queryKey: key });
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkActiveUntil]);
  useEffect(() => { if (s?.connected && linkActiveUntil) { setLinkActiveUntil(null); toast.success(`Instagram @${s.username} conectado ao CRM!`); } }, [s?.connected, s?.username, linkActiveUntil]);

  function openPopup() {
    // abre a janela já no clique (evita bloqueio de popup) e depois aponta para o login
    const w = window.open("about:blank", "crm-ig-login", "width=520,height=720,menubar=no,toolbar=no");
    void run("oauth", async () => {
      try {
        const { url } = await igAuthUrl(storeId, window.location.origin);
        if (w && !w.closed) w.location.href = url;
        else window.location.assign(url); // popup bloqueado: vai na mesma aba
      } catch (e) {
        w?.close();
        throw e;
      }
    });
  }

  function copyLink() {
    void run("link", async () => {
      const { url } = await igAuthUrl(storeId, window.location.origin);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado! Abra no navegador em que o Instagram da loja está logado. Vale por 15 minutos, uma vez.");
      } catch {
        window.prompt("Copie o link de autorização:", url);
      }
      setLinkActiveUntil(Date.now() + 15 * 60 * 1000);
    });
  }

  // Volta do login do Instagram: ?ig=ok|error
  useEffect(() => {
    const ig = params.get("ig");
    if (!ig) return;
    if (ig === "ok") {
      const user = params.get("user");
      if (params.get("sub") === "1") toast.success(`Instagram${user ? ` @${user}` : ""} conectado ao CRM!`);
      else toast.warning(`Instagram${user ? ` @${user}` : ""} conectado, mas a inscrição no webhook falhou. Confira o webhook na Meta e conecte de novo.`);
    } else {
      toast.error(params.get("msg") || "Não foi possível conectar o Instagram.");
    }
    const next = new URLSearchParams(params);
    ["ig", "user", "sub", "msg"].forEach((k) => next.delete(k));
    setParams(next, { replace: true });
    qc.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  const appReady = Boolean(s?.app_id && s?.has_app_secret);

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-pink-500/10 p-2"><ChannelIcon channel="instagram" className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Instagram Direct</h3>
          {status.isLoading ? (
            <p className="text-sm text-muted-foreground">Verificando…</p>
          ) : status.isError ? (
            <p className="text-sm text-destructive">{(status.error as Error).message}</p>
          ) : s?.connected ? (
            <p className="flex flex-wrap items-center gap-1.5 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" /> Conectado como <strong>@{s.username}</strong>
              {!s.webhook_subscribed && <span className="text-amber-600 dark:text-amber-400">· webhook ainda não inscrito</span>}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" /> Não conectado
            </p>
          )}
          {s?.connected && s.token_expires_at && (
            <p className="mt-0.5 text-xs text-muted-foreground">O acesso renova sozinho; vence {relative(s.token_expires_at)} se não for renovado.</p>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => status.refetch()} aria-label="Atualizar status">
          <RefreshCw className={status.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {s?.can_manage && (
        <div className="space-y-3">
          <Step n={1} title="No painel da Meta, cole estes endereços">
            <p className="text-xs text-muted-foreground">Casos de uso → Instagram → Configuração da API com login do Instagram.</p>
            {s.webhook_url && <CopyField id="ig-cb" label="Webhook · URL de callback" value={s.webhook_url} />}
            {s.verify_token && <CopyField id="ig-vt" label="Webhook · Verificar token" value={s.verify_token} />}
            {s.oauth_redirect_url && <CopyField id="ig-redir" label="Login da empresa · URI de redirecionamento do OAuth" value={s.oauth_redirect_url} />}
          </Step>

          <Step n={2} title="Dados do app do Instagram">
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run("app", async () => {
                  await igAppSave(storeId, appId.trim(), appSecret.trim() || undefined);
                  setAppSecret("");
                  toast.success("Dados do app salvos.");
                  qc.invalidateQueries({ queryKey: key });
                });
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="ig-appid">ID do app do Instagram</Label>
                <Input id="ig-appid" value={appId} onChange={(e) => setAppId(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="1428409599038852" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ig-secret">Chave secreta do app do Instagram</Label>
                <Input id="ig-secret" type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} autoComplete="off"
                  placeholder={s.has_app_secret ? "•••••• (mantida se ficar em branco)" : "Clique em Mostrar na Meta e cole aqui"} required={!s.has_app_secret} />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">Não é a "Chave Secreta do Aplicativo" do Facebook: é a do Instagram, ao lado do ID do app do Instagram. Fica só no servidor.</p>
              <div className="sm:col-span-2">
                <Button type="submit" size="sm" variant="outline" disabled={busy !== null || !appId}>
                  {busy === "app" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Salvar dados do app
                </Button>
              </div>
            </form>
          </Step>

          <Step n={3} title="Conectar a conta da loja">
            <p className="text-xs text-muted-foreground">
              Abre uma janelinha do Instagram para autorizar. Dica: entre antes em instagram.com com a <strong>conta da loja</strong> neste
              navegador (sem VPN) — aí a janelinha só pede "Autorizar". Se o Instagram da loja estiver logado em outro navegador ou no
              celular, copie o link e abra lá.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!appReady || busy !== null} onClick={openPopup}>
                {busy === "oauth" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <LogIn className="mr-1.5 h-4 w-4" />}
                {s.connected ? "Reconectar com Instagram" : "Conectar com Instagram"}
              </Button>
              <Button size="sm" variant="outline" disabled={!appReady || busy !== null} onClick={copyLink}>
                {busy === "link" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Copy className="mr-1.5 h-4 w-4" />}
                Copiar link de autorização
              </Button>
              {s.connected && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!confirm("Desconectar o Instagram? As DMs param de chegar no CRM.")) return;
                    void run("off", async () => { await igDisconnect(storeId); toast.success("Instagram desconectado."); qc.invalidateQueries({ queryKey: key }); });
                  }}
                >
                  <LogOut className="mr-1.5 h-4 w-4" /> Desconectar
                </Button>
              )}
            </div>
            {!appReady && <p className="text-xs text-amber-600 dark:text-amber-400">Salve primeiro os dados do app (passo 2).</p>}
            {linkActiveUntil && !s.connected && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Aguardando a autorização pelo link…
              </p>
            )}
          </Step>

          <details className="rounded-lg border border-border/50 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-muted-foreground">Alternativa: conectar colando um token gerado no painel</summary>
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run("token", async () => {
                  const r = await igSave(storeId, token.trim(), appSecret.trim() || undefined);
                  setToken("");
                  if (r.subscribed) toast.success(`Instagram @${r.username} conectado.`);
                  else toast.warning(`@${r.username} conectado, mas a inscrição no webhook falhou: ${r.subscribe_error ?? "erro desconhecido"}.`);
                  qc.invalidateQueries({ queryKey: key });
                });
              }}
            >
              <Label htmlFor="ig-token">Token de acesso (Gerar token)</Label>
              <Input id="ig-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="IGAA…" autoComplete="off" required />
              <Button type="submit" size="sm" variant="outline" disabled={busy !== null || !token.trim() || (!s.has_app_secret && !appSecret.trim())}>
                {busy === "token" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Conectar com token
              </Button>
            </form>
          </details>
        </div>
      )}
      {s && !s.can_manage && <p className="text-xs text-muted-foreground">Somente admin, dono ou gerente altera a conexão.</p>}
    </div>
  );
}
