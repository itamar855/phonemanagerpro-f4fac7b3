import { useState } from "react";
import { BookOpen, Check, GraduationCap, Loader2, Pencil, Play, Plus, RotateCcw, Square, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  aiStats, approveExamples, cancelLearning, createExample, latestLearningJob, listExamples, resumeLearning, startLearning, updateExample,
  type AiExample,
} from "../../api/ai";
import { relative } from "../../lib/format";

const SOURCE_LABEL: Record<AiExample["source"], string> = { history: "conversa antiga", correction: "correção da equipe", manual: "cadastrado" };

interface Props {
  storeId: string;
  userId: string | null;
  canEdit: boolean;
  /** Usa o rascunho no campo "O que a IA sabe sobre a loja" (a pessoa ainda revisa e salva) */
  onUseDraft: (text: string) => void;
}

export function AiLearning({ storeId, userId, canEdit, onUseDraft }: Props) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["crm", "ai-learn"] });

  const { data: stats } = useQuery({ queryKey: ["crm", "ai-learn", "stats", storeId], queryFn: () => aiStats(storeId), staleTime: 30_000 });
  const { data: job } = useQuery({
    queryKey: ["crm", "ai-learn", "job", storeId],
    queryFn: () => latestLearningJob(storeId),
    // acompanha o progresso enquanto lê
    refetchInterval: (q) => (q.state.data?.status === "running" ? 5000 : false),
  });
  const running = job?.status === "running";
  const stalled = running && Date.now() - new Date(job!.heartbeat_at).getTime() > 3 * 60_000;
  const [months, setMonths] = useState("4");
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try { await fn(); refresh(); if (ok) toast.success(ok); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  const sent = (stats?.sent_as_is ?? 0) + (stats?.sent_edited ?? 0);
  const pct = job && job.total ? Math.round((job.cursor / job.total) * 100) : 0;

  return (
    <section className="space-y-4 rounded-xl border border-border/60 bg-card p-4" aria-labelledby="ai-learn">
      <div>
        <h3 id="ai-learn" className="flex items-center gap-2 font-semibold"><GraduationCap className="h-4 w-4 text-violet-500" aria-hidden="true" /> Aprendizado</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          A IA usa exemplos reais aprovados de como a loja responde. Eles vêm das conversas antigas (depois da sua revisão) e de cada correção que a equipe faz numa sugestão antes de enviar.
        </p>
      </div>

      {stats && (
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[
            ["Enviadas sem mudar", stats.sent_as_is],
            ["Corrigidas pela equipe", stats.sent_edited],
            ["Descartadas", stats.discarded],
            ["Passou → virou venda", `${stats.handoffs} → ${stats.handoff_won}`],
          ].map(([l, v]) => (
            <div key={String(l)} className="rounded-lg border border-border/50 p-2">
              <dt className="text-[11px] text-muted-foreground">{l}</dt>
              <dd className="text-lg font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
          {sent > 0 && (
            <p className="col-span-full text-xs text-muted-foreground">
              Últimos 30 dias: {Math.round((stats.sent_as_is / sent) * 100)}% das sugestões foram aprovadas sem ninguém precisar mexer.
            </p>
          )}
        </dl>
      )}

      {/* Leitura das conversas antigas */}
      <div className="space-y-2 rounded-lg border border-border/50 p-3">
        <p className="text-sm font-medium">Ler as conversas antigas do WhatsApp</p>
        <p className="text-xs text-muted-foreground">
          Só conversas diretas com clientes (grupos e “não é cliente” ficam de fora). Telefones, e-mails e CPF são escondidos antes de ir para a IA. Roda sozinho em segundo plano; dá para fechar a tela.
        </p>
        {running ? (
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da leitura">
              <div className="h-2 rounded-full bg-violet-500 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {job!.cursor} de {job!.total} conversas · {job!.examples} exemplos e {job!.facts} informações encontrados
              {stalled ? " · parou de avançar" : ""}
            </p>
            {canEdit && (
              <div className="flex gap-2">
                {stalled && <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => resumeLearning(job!.id), "Leitura retomada.")}><RotateCcw className="mr-1.5 h-4 w-4" /> Retomar</Button>}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => cancelLearning(job!.id), "Leitura cancelada.")}><Square className="mr-1.5 h-4 w-4" /> Cancelar</Button>
              </div>
            )}
          </div>
        ) : (
          <>
            {job && (
              <p className="text-xs text-muted-foreground">
                Última leitura {relative(job.finished_at ?? job.created_at)}: {job.status === "done" ? `${job.total} conversas, ${job.examples} exemplos e ${job.facts} informações` : job.status === "cancelled" ? "cancelada" : `falhou${job.error ? ` (${job.error})` : ""}`}.
              </p>
            )}
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={months} onValueChange={setMonths}>
                  <SelectTrigger className="h-9 w-40" aria-label="Período"><SelectValue /></SelectTrigger>
                  <SelectContent>{["2", "4", "6"].map((m) => <SelectItem key={m} value={m}>Últimos {m} meses</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" disabled={busy} onClick={() => act(async () => {
                  const r = await startLearning(storeId, Number(months));
                  toast.success(`Lendo ${r.total} conversas. Pode continuar usando o sistema.`);
                })}>
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />} {job ? "Ler de novo" : "Começar leitura"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {job?.status === "done" && job.knowledge_draft && (
        <div className="space-y-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium"><BookOpen className="h-4 w-4" aria-hidden="true" /> Rascunho do conhecimento da loja</p>
          <p className="text-xs text-muted-foreground">Montado a partir do que a equipe falou nas conversas. Confira, principalmente os preços, antes de usar.</p>
          <Textarea readOnly value={job.knowledge_draft} rows={8} className="text-base md:text-sm" aria-label="Rascunho do conhecimento" />
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => { onUseDraft(job.knowledge_draft!); toast.info("Rascunho colocado no campo de conhecimento. Revise e salve."); }}>
              Usar no conhecimento da loja
            </Button>
          )}
        </div>
      )}

      <ExampleLibrary storeId={storeId} userId={userId} canEdit={canEdit} toReview={stats?.to_review ?? 0} library={stats?.library ?? 0} onChange={refresh} />
    </section>
  );
}

// ------------------------------------------------------------------ biblioteca

function ExampleLibrary({ storeId, userId, canEdit, toReview, library, onChange }: {
  storeId: string; userId: string | null; canEdit: boolean; toReview: number; library: number; onChange: () => void;
}) {
  const [tab, setTab] = useState<"pending" | "approved">(toReview > 0 ? "pending" : "approved");
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["crm", "ai-learn", "examples", storeId, tab],
    queryFn: () => listExamples(storeId, tab),
  });
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const noPrice = rows.filter((r) => !r.has_price);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    try { await fn(); onChange(); if (ok) toast.success(ok); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Biblioteca de exemplos">
        {([["pending", `Para revisar (${toReview})`], ["approved", `Biblioteca (${library})`]] as const).map(([v, l]) => (
          <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
            className={cn("min-h-[36px] rounded-full border px-3 text-xs font-medium", tab === v ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}>
            {l}
          </button>
        ))}
        {canEdit && tab === "pending" && noPrice.length > 0 && (
          <Button size="sm" variant="outline" className="ml-auto h-9"
            onClick={() => userId && run(() => approveExamples(noPrice.map((r) => r.id), userId), `${noPrice.length} exemplos aprovados.`)}>
            <Check className="mr-1.5 h-4 w-4" /> Aprovar os {noPrice.length} sem preço
          </Button>
        )}
        {canEdit && tab === "approved" && (
          <Button size="sm" variant="ghost" className="ml-auto h-9" onClick={() => setAdding((v) => !v)}><Plus className="mr-1.5 h-4 w-4" /> Novo exemplo</Button>
        )}
      </div>

      {adding && (
        <form className="space-y-2 rounded-lg border border-border/50 p-3" onSubmit={(e) => {
          e.preventDefault();
          if (!q.trim() || !a.trim() || !userId) return;
          void run(() => createExample(storeId, userId, q.trim(), a.trim()), "Exemplo adicionado.").then(() => { setQ(""); setA(""); setAdding(false); });
        }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="O cliente pergunta… (ex.: vocês fazem entrega?)" aria-label="Pergunta do cliente" maxLength={500} />
          <Textarea value={a} onChange={(e) => setA(e.target.value)} placeholder="A loja responde…" aria-label="Resposta da loja" rows={2} maxLength={1000} className="text-base md:text-sm" />
          <Button type="submit" size="sm" disabled={!q.trim() || !a.trim()}>Adicionar</Button>
        </form>
      )}

      {!isLoading && rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          {tab === "pending" ? "Nada para revisar." : "A biblioteca está vazia. Leia as conversas antigas ou corrija sugestões da IA para ela começar a aprender."}
        </p>
      )}
      <ul className="max-h-[480px] divide-y divide-border/40 overflow-y-auto rounded-lg border border-border/50 empty:hidden">
        {rows.map((r) => <ExampleRow key={r.id} r={r} userId={userId} canEdit={canEdit} onChange={onChange} />)}
      </ul>
    </div>
  );
}

function ExampleRow({ r, userId, canEdit, onChange }: { r: AiExample; userId: string | null; canEdit: boolean; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState(r.answer);
  async function set(patch: Parameters<typeof updateExample>[2], ok?: string) {
    if (!userId) return;
    try { await updateExample(r.id, userId, patch); onChange(); if (ok) toast.success(ok); }
    catch (e) { toast.error((e as Error).message); }
  }
  return (
    <li className="space-y-1 p-3 text-sm">
      <p className="text-xs text-muted-foreground">Cliente: <span className="text-foreground">{r.question}</span></p>
      {editing ? (
        <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} className="text-base md:text-sm" aria-label="Editar resposta" />
      ) : (
        <p>Loja: {r.answer}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-px">{SOURCE_LABEL[r.source]}</span>
        {r.has_price && <span className="rounded bg-amber-500/15 px-1.5 py-px text-amber-700 dark:text-amber-400">tem preço (a IA não repete)</span>}
        {canEdit && (
          <span className="ml-auto flex gap-1">
            {editing ? (
              <Button size="sm" variant="outline" className="h-8" onClick={() => { void set({ answer: answer.trim(), status: "approved" }, "Exemplo salvo e aprovado."); setEditing(false); }}>
                <Check className="mr-1 h-3.5 w-3.5" /> Salvar
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(true)} aria-label="Editar exemplo"><Pencil className="h-3.5 w-3.5" /></Button>
            )}
            {r.status === "pending" && (
              <Button size="sm" variant="outline" className="h-8" onClick={() => set({ status: "approved" })}><Check className="mr-1 h-3.5 w-3.5" /> Aprovar</Button>
            )}
            <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive" onClick={() => set({ status: "rejected" })}
              aria-label={r.status === "pending" ? "Rejeitar exemplo" : "Tirar da biblioteca"}>
              {r.status === "pending" ? <X className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </span>
        )}
      </div>
    </li>
  );
}
