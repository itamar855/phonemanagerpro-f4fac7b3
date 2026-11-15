import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, Loader2, LogOut, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { igDisconnect, igSave, igStatus } from "../../api/inbox";
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

export function InstagramChannelCard({ storeId }: { storeId: string | null }) {
  const qc = useQueryClient();
  const key = ["crm", "ig-channel", storeId];
  const status = useQuery({ queryKey: key, queryFn: () => igStatus(storeId), staleTime: 30_000, retry: false });
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const s = status.data;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    try {
      const r = await igSave(storeId, token.trim(), secret.trim() || undefined);
      setToken(""); setSecret("");
      if (r.subscribed) toast.success(`Instagram @${r.username} conectado e inscrito no webhook.`);
      else toast.warning(`@${r.username} conectado, mas a inscrição no webhook falhou: ${r.subscribe_error ?? "erro desconhecido"}. Confira o webhook no painel da Meta e salve de novo.`);
      qc.invalidateQueries({ queryKey: key });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

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
            <p className="mt-0.5 text-xs text-muted-foreground">Token renova sozinho; vence {relative(s.token_expires_at)} se não for renovado.</p>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => status.refetch()} aria-label="Atualizar status">
          <RefreshCw className={status.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {s?.can_manage && (
        <>
          <div className="space-y-3 rounded-lg border border-border/50 bg-muted/30 p-3">
            <p className="text-sm font-medium">1. No painel da Meta → Instagram → Configuração da API → Configurar webhooks, cole:</p>
            {s.webhook_url && <CopyField id="ig-cb" label="URL de callback" value={s.webhook_url} />}
            {s.verify_token ? (
              <CopyField id="ig-vt" label="Verificar token" value={s.verify_token} />
            ) : (
              <p className="text-xs text-destructive">Token de verificação ainda não configurado no servidor.</p>
            )}
            <p className="text-xs text-muted-foreground">Depois clique em "Verificar e salvar" na Meta e ative o campo <code>messages</code>.</p>
          </div>

          <form onSubmit={save} className="space-y-3">
            <p className="text-sm font-medium">2. Cole aqui o token gerado ("Gerar token") e a chave secreta do app do Instagram:</p>
            <div className="space-y-1.5">
              <Label htmlFor="ig-token">Token de acesso</Label>
              <Input id="ig-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={s.connected ? "•••••• (cole um novo para trocar)" : "IGAA…"} autoComplete="off" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ig-secret">Chave secreta do app do Instagram</Label>
              <Input id="ig-secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={s.has_app_secret ? "•••••• (mantida se ficar em branco)" : "Em Configuração da API → Chave secreta do app do Instagram"} autoComplete="off" required={!s.has_app_secret} />
              <p className="text-xs text-muted-foreground">Ficam só no servidor e nunca são mostrados de volta. A chave secreta confere que as mensagens vieram mesmo da Meta.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={busy !== null || !token.trim()}>
                {busy === "save" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} {s.connected ? "Atualizar conexão" : "Conectar Instagram"}
              </Button>
              {s.connected && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (!confirm("Desconectar o Instagram? As DMs param de chegar no CRM.")) return;
                    setBusy("off");
                    try { await igDisconnect(storeId); toast.success("Instagram desconectado."); qc.invalidateQueries({ queryKey: key }); }
                    catch (err) { toast.error((err as Error).message); }
                    finally { setBusy(null); }
                  }}
                >
                  <LogOut className="mr-1.5 h-4 w-4" /> Desconectar
                </Button>
              )}
            </div>
          </form>
        </>
      )}
      {s && !s.can_manage && <p className="text-xs text-muted-foreground">Somente admin, dono ou gerente altera a conexão.</p>}
    </div>
  );
}
