// Página pública /avaliacao/:token — o cliente vê a avaliação que a loja fez do aparelho dele,
// como chegamos no valor, e pode refazer, mandar fotos ou aceitar. Sem login: tudo pelas
// funções tradein_public_* com o código do link.
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, Ban, Camera, Check, CheckCircle2, ChevronDown, Clock, ImagePlus, Info, PencilLine, Smartphone, Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { listPhotos, publicAccept, publicGet, publicReview, publicUploadPhotos } from "../api/share";
import { computeOffer, formatBRL, ruleAmountLabel, toAnswerLine } from "../lib/calc";
import { QUESTION_BY_KEY } from "../lib/questions";
import { diffAnswers, MAX_PHOTOS, selectionFromAnswers, shareExpiryLabel, TOKEN_RE, type PublicEvaluation } from "../lib/share";
import type { AnswerLine, QuestionKey, TradeRule } from "../lib/types";
import { activeQuestions, chosenRules } from "../lib/wizard";

const card = "glass rounded-2xl border border-border/50 bg-card/80";

// As perguntas do simulador falam com o vendedor; aqui falam com o cliente.
const ASK: Record<QuestionKey, { title: string; hint?: string }> = {
  conta: { title: "Sua conta (iCloud ou Google) já saiu do aparelho?", hint: "Aparelho com conta vinculada não pode ser revendido." },
  tela: { title: "Como está a tela?", hint: "Olhe com a tela acesa num fundo branco e teste o toque nos cantos." },
  bateria: { title: "Qual a saúde da bateria?", hint: "iPhone: Ajustes › Bateria › Saúde da Bateria." },
  carcaca: { title: "E a carcaça (laterais e traseira)?", hint: "Amassados nas quinas e trincas no vidro de trás contam aqui." },
  biometria: { title: "Face ID ou digital funciona?" },
  pecas: { title: "Alguma peça já foi trocada?", hint: "iPhone: Ajustes › Geral › Sobre mostra \"peça desconhecida\" se houver." },
  acessorios: { title: "Vem com caixa e cabo?", hint: "Marque o que está faltando." },
};

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function Money({ v, className }: { v: number; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{formatBRL(v)}</span>;
}

/** Linhas "como chegamos no valor": base, cada resposta (com ou sem desconto) e o total. */
function Breakdown({ base, lines, discount, offer, blocked, agreed }: {
  base: number; lines: AnswerLine[]; discount: number; offer: number; blocked: boolean; agreed: boolean;
}) {
  const rounding = !blocked && !agreed ? Math.max(0, base - discount - offer) : 0;
  return (
    <dl className="divide-y divide-border/40 text-sm">
      <div className="flex justify-between gap-3 py-2.5">
        <dt className="text-muted-foreground">Valor base na loja <span className="block text-xs">aparelho perfeito, com tudo funcionando</span></dt>
        <dd className="shrink-0 font-semibold"><Money v={base} /></dd>
      </div>
      {lines.map((l, i) => (
        <div key={i} className="flex justify-between gap-3 py-2.5">
          <dt className="min-w-0">
            <span className="block text-xs text-muted-foreground">{QUESTION_BY_KEY.get(l.question)?.short}</span>
            {l.label}
          </dt>
          <dd className={cn("shrink-0 self-end tabular-nums", l.kind === "block" || l.value > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
            {l.kind === "block" ? "Não compra" : l.value > 0 ? `−${formatBRL(l.value)}` : "sem desconto"}
          </dd>
        </div>
      ))}
      {discount > 0 && (
        <div className="flex justify-between gap-3 py-2.5 font-medium">
          <dt>Total de descontos</dt>
          <dd className="text-destructive">−<Money v={discount} /></dd>
        </div>
      )}
      {rounding > 0 && (
        <div className="flex justify-between gap-3 py-2 text-xs text-muted-foreground">
          <dt>Arredondamento</dt>
          <dd>−<Money v={rounding} /></dd>
        </div>
      )}
    </dl>
  );
}

/** Tabela de descontos da loja, para o cliente ver de onde vem cada número. */
function RulesTable({ rules, base }: { rules: TradeRule[]; base: number }) {
  const [open, setOpen] = useState(false);
  const groups = activeQuestions(rules);
  if (!groups.length) return null;
  return (
    <div className={card}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left text-sm font-semibold">
        Ver a tabela de descontos da loja
        <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div className="space-y-4 px-4 pb-4 animate-in fade-in-0 slide-in-from-top-1">
          <p className="text-xs text-muted-foreground">
            Os descontos em % são sempre sobre o valor base ({formatBRL(base)}) e somam entre si.
          </p>
          {groups.map(({ question, options }) => (
            <div key={question.key}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{question.short}</p>
              <ul className="divide-y divide-border/40 rounded-xl bg-muted/30 text-sm">
                {options.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3 px-3 py-2">
                    <span className="min-w-0">{r.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {r.kind === "block" ? "Não compra" : Number(r.amount) === 0 ? "sem desconto"
                        : r.kind === "pct" ? `${ruleAmountLabel(r.kind, r.amount)} (−${formatBRL(toAnswerLine(r, base).value)})` : `−${formatBRL(r.amount)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Option({ selected, storePick, multi, danger, onClick, children, right }: {
  selected: boolean; storePick: boolean; multi: boolean; danger: boolean; onClick: () => void; children: React.ReactNode; right: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} role={multi ? "checkbox" : "radio"} aria-checked={selected}
      className={cn(
        "flex min-h-[56px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-[15px] transition-all duration-150 active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/15 font-medium" : "border-border/60 bg-background/40 hover:border-primary/50",
        danger && !selected && "border-destructive/40",
      )}>
      <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center border-2",
        multi ? "rounded-md" : "rounded-full",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
        {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        {children}
        {storePick && <span className="ml-2 inline-block rounded-full bg-muted px-2 py-0.5 align-middle text-[11px] font-medium text-muted-foreground">a loja marcou</span>}
      </span>
      {right}
    </button>
  );
}

/** O cliente refaz as respostas em cima do que a loja marcou; o valor muda na hora. */
function ReviewForm({ data, onCancel, onSent, token }: {
  data: PublicEvaluation; token: string; onCancel: () => void; onSent: (d: PublicEvaluation) => void;
}) {
  const groups = useMemo(() => activeQuestions(data.rules), [data.rules]);
  const storeSel = useMemo(() => selectionFromAnswers(data.answers, data.rules), [data.answers, data.rules]);
  const [sel, setSel] = useState<Partial<Record<QuestionKey, string[]>>>(() =>
    data.review ? selectionFromAnswers(data.review.answers, data.rules) : storeSel);
  const [note, setNote] = useState(data.review?.note ?? "");
  const [sending, setSending] = useState(false);

  const mine = computeOffer(data.base_price, chosenRules(data.rules, sel), { negotiation_pct: 0, round_to: data.round_to });
  const missing = groups.filter((g) => !g.question.multi && !(sel[g.question.key]?.length));

  const pick = (q: QuestionKey, id: string, multi: boolean) =>
    setSel((s) => {
      const cur = s[q] ?? [];
      if (!multi) return { ...s, [q]: [id] };
      return { ...s, [q]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });

  const send = async () => {
    if (missing.length) {
      toast.error(`Falta responder: ${missing.map((m) => m.question.short).join(", ")}`);
      document.getElementById(`q-${missing[0].question.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSending(true);
    try {
      const d = await publicReview(token, Object.values(sel).flat().filter(Boolean) as string[], note.trim());
      if (d) onSent(d);
      toast.success("Pronto! Mandamos sua avaliação para a loja.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-3 pb-36" aria-labelledby="t-review">
      <button type="button" onClick={onCancel} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar para a avaliação
      </button>
      <div>
        <h2 id="t-review" className="font-display text-xl font-bold">Faça você mesmo</h2>
        <p className="text-sm text-muted-foreground">
          Já deixamos marcado o que a loja viu. Mude o que achar diferente: o valor muda na hora, com a mesma tabela da loja.
        </p>
      </div>

      {groups.map(({ question, options }) => {
        const chosen = sel[question.key] ?? [];
        const store = storeSel[question.key] ?? [];
        const changed = [...chosen].sort().join() !== [...store].sort().join();
        const ask = ASK[question.key];
        return (
          <fieldset key={question.key} id={`q-${question.key}`} className={cn(card, "space-y-2 p-4", changed && "border-amber-500/50")}>
            <legend className="sr-only">{ask.title}</legend>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{ask.title}</p>
              {changed && <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">você mudou</span>}
            </div>
            {ask.hint && <p className="text-xs text-muted-foreground">{ask.hint}</p>}
            <div className="grid gap-2" role={question.multi ? "group" : "radiogroup"} aria-label={ask.title}>
              {question.multi && question.noneLabel && (
                <Option selected={chosen.length === 0} storePick={store.length === 0} multi={false} danger={false}
                  onClick={() => setSel((s) => ({ ...s, [question.key]: [] }))} right={null}>
                  {question.noneLabel}
                </Option>
              )}
              {options.map((r) => (
                <Option key={r.id} selected={chosen.includes(r.id)} storePick={store.includes(r.id)} multi={question.multi}
                  danger={r.kind === "block"} onClick={() => pick(question.key, r.id, question.multi)}
                  right={<span className={cn("shrink-0 text-xs tabular-nums", r.kind === "block" ? "font-semibold text-destructive" : "text-muted-foreground")}>
                    {r.kind === "block" ? "Não compra" : toAnswerLine(r, data.base_price).value ? `−${formatBRL(toAnswerLine(r, data.base_price).value)}` : "sem desconto"}
                  </span>}>
                  {r.label}
                </Option>
              ))}
            </div>
          </fieldset>
        );
      })}

      <div className={cn(card, "space-y-2 p-4")}>
        <label htmlFor="rv-note" className="font-semibold">Quer explicar alguma coisa? <span className="font-normal text-muted-foreground">(opcional)</span></label>
        <Textarea id="rv-note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Ex.: a bateria está em 88%, mandei o print nas fotos." className="text-base" />
      </div>

      {/* barra fixa: valor da loja × o seu */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-lg space-y-2">
          <div className="flex items-end justify-between gap-3 text-sm" aria-live="polite">
            <span className="text-muted-foreground">Loja: <Money v={data.offer} /></span>
            <span className="text-right">
              <span className="block text-xs text-muted-foreground">Seu valor</span>
              <span key={mine.blocked ? "b" : mine.offerMax}
                className={cn("font-display text-2xl font-extrabold tabular-nums animate-in fade-in-0 zoom-in-95", mine.blocked ? "text-destructive" : "text-primary")}>
                {mine.blocked ? "Não compra" : formatBRL(mine.offerMax)}
              </span>
            </span>
          </div>
          <Button className="h-12 w-full text-base" disabled={sending} onClick={send}>
            {sending ? "Enviando…" : "Enviar minha avaliação para a loja"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            O vendedor confere no aparelho. Você pode revisar mais {data.reviews_left} {data.reviews_left === 1 ? "vez" : "vezes"}.
          </p>
        </div>
      </div>
    </section>
  );
}

function Photos({ token, data, onSent }: { token: string; data: PublicEvaluation; onSent: (d: PublicEvaluation) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const photos = useQuery({ queryKey: ["troca-public-photos", token, data.photo_count], queryFn: () => listPhotos(token), enabled: data.photo_count > 0 });

  const upload = async (list: FileList | null) => {
    const files = Array.from(list ?? []).slice(0, data.photos_left);
    if (!files.length) return;
    setBusy(true);
    try {
      const d = await publicUploadPhotos(token, files);
      if (d) onSent(d);
      toast.success(files.length === 1 ? "Foto enviada para a loja." : `${files.length} fotos enviadas para a loja.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <section className={cn(card, "space-y-3 p-4")} aria-labelledby="t-photos">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Camera className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 id="t-photos" className="font-semibold">Mandar fotos do aparelho</h2>
          <p className="text-sm text-muted-foreground">Print da saúde da bateria, foto da tela acesa, da traseira. Até {MAX_PHOTOS} fotos.</p>
        </div>
      </div>
      {data.photo_count > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {photos.isLoading && Array.from({ length: data.photo_count }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
          {photos.data?.map((p) => (
            <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-border/50">
              <img src={p.url} alt="Foto enviada" className="aspect-square w-full object-cover" loading="lazy" />
            </a>
          ))}
        </div>
      )}
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      {data.photos_left > 0 ? (
        <Button variant="outline" className="h-12 w-full" disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus className="mr-2 h-5 w-5" /> {busy ? "Enviando…" : data.photo_count ? `Mandar mais (${data.photos_left} restantes)` : "Escolher fotos"}
        </Button>
      ) : (
        <p className="text-center text-sm text-muted-foreground">Fotos enviadas. A loja já recebeu.</p>
      )}
    </section>
  );
}

export default function AvaliacaoPublicaPage() {
  const { token = "" } = useParams();
  const valid = TOKEN_RE.test(token);
  const qc = useQueryClient();
  const key = ["troca-public", token];
  const q = useQuery({ queryKey: key, queryFn: () => publicGet(token), enabled: valid, retry: 1, staleTime: 60_000 });
  const [mode, setMode] = useState<"view" | "review">("view");
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    document.title = "Avaliação do seu aparelho";
    // link privado: não entra no Google
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  const update = (d: PublicEvaluation) => qc.setQueryData(key, d);
  const d = q.data;

  if (!valid || (q.isSuccess && !d)) {
    return (
      <Shell>
        <div className={cn(card, "p-6 text-center")}>
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" aria-hidden="true" />
          <h1 className="mt-2 font-display text-xl font-bold">Link não encontrado</h1>
          <p className="mt-1 text-sm text-muted-foreground">Confira se copiou o link inteiro ou peça um novo para a loja.</p>
        </div>
      </Shell>
    );
  }
  if (q.isLoading || !d) {
    return (
      <Shell>
        {q.isError ? (
          <div className={cn(card, "p-6 text-center")}>
            <p className="font-semibold">Não conseguimos abrir a avaliação</p>
            <p className="mt-1 text-sm text-muted-foreground">{(q.error as Error).message}</p>
            <Button className="mt-4 h-11" onClick={() => q.refetch()}>Tentar de novo</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        )}
      </Shell>
    );
  }

  const open = d.status === "aberta";
  const device = `${d.model}${d.storage ? ` ${d.storage}` : ""}`;

  if (mode === "review" && open) {
    return (
      <Shell store={d.store_name}>
        <ReviewForm data={d} token={token} onCancel={() => setMode("view")}
          onSent={(nd) => { update(nd); setMode("view"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      </Shell>
    );
  }

  const accept = async () => {
    setAccepting(true);
    try {
      const nd = await publicAccept(token);
      if (nd) update(nd);
      setConfirmAccept(false);
      toast.success("Proposta aceita! A loja vai te chamar para fechar.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAccepting(false);
    }
  };

  const diffs = d.review ? diffAnswers(d.answers, d.review.answers).filter((x) => x.changed) : [];

  return (
    <Shell store={d.store_name}>
      {/* valor */}
      <section className={cn(card, "overflow-hidden")} aria-labelledby="t-value">
        <div className={cn("p-5 text-center", d.blocked ? "bg-destructive/10" : "bg-gradient-to-br from-primary/20 via-primary/10 to-transparent")}>
          <p className="text-sm text-muted-foreground">
            {d.customer_first_name ? `Oi, ${d.customer_first_name}! ` : ""}Avaliamos seu
          </p>
          <p className="flex items-center justify-center gap-1.5 font-semibold"><Smartphone className="h-4 w-4" aria-hidden="true" />{device}</p>
          {d.blocked ? (
            <>
              <Ban className="mx-auto mt-3 h-9 w-9 text-destructive" aria-hidden="true" />
              <h1 id="t-value" className="mt-1 font-display text-2xl font-bold text-destructive">Conta ainda vinculada</h1>
              <p className="mt-1 text-sm text-muted-foreground">Com o iCloud ou a conta Google no aparelho, a loja não consegue comprar. Tire a conta e refaça a avaliação aqui.</p>
            </>
          ) : (
            <>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{d.agreed ? "Valor combinado" : "Valor da avaliação"}</p>
              <h1 id="t-value" className="font-display text-4xl font-extrabold tabular-nums">{formatBRL(d.offer)}</h1>
              <p className="mt-1 text-xs text-muted-foreground">para usar como parte do pagamento</p>
            </>
          )}
        </div>
        <div className="flex items-center justify-center gap-1.5 border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {d.status === "aberta" && `Avaliado em ${fmtDay(d.evaluated_at)} · vale até ${shareExpiryLabel(d.expires_at)}`}
          {d.status === "vencida" && "Essa avaliação venceu. Peça uma nova para a loja: os preços mudam."}
          {d.status === "encerrada" && "Essa troca já foi fechada na loja."}
        </div>
      </section>

      {d.accepted_at && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <p>Você aceitou {formatBRL(d.accepted_value)} em {fmtDay(d.accepted_at)}. A loja vai te chamar para fechar. Leve o aparelho para o vendedor conferir.</p>
        </div>
      )}

      {d.review && (
        <section className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm" aria-labelledby="t-myreview">
          <div className="flex items-center justify-between gap-3">
            <h2 id="t-myreview" className="font-semibold">Sua avaliação foi para a loja</h2>
            <span className="font-display text-lg font-bold tabular-nums">{d.review.blocked ? "Não compra" : formatBRL(d.review.offer)}</span>
          </div>
          {diffs.length > 0 ? (
            <ul className="space-y-1.5">
              {diffs.map((x) => (
                <li key={x.question}>
                  <span className="font-medium">{x.short}:</span>{" "}
                  <span className="text-muted-foreground line-through">{x.store.join(", ")}</span> → {x.customer.join(", ")}
                </li>
              ))}
            </ul>
          ) : <p className="text-muted-foreground">Você marcou o mesmo que a loja.</p>}
          {d.review.note && <p className="italic text-muted-foreground">"{d.review.note}"</p>}
          <p className="text-xs text-muted-foreground">O vendedor vai conferir no aparelho e te chamar.</p>
        </section>
      )}

      {/* como chegamos no valor */}
      <section className={cn(card, "px-4 pt-3")} aria-labelledby="t-how">
        <h2 id="t-how" className="font-semibold">Como chegamos nesse valor</h2>
        <p className="text-xs text-muted-foreground">O que o vendedor conferiu no aparelho, pergunta por pergunta.</p>
        <Breakdown base={d.base_price} lines={d.answers} discount={d.discount_total} offer={d.offer} blocked={d.blocked} agreed={d.agreed} />
        <div className="flex items-center justify-between gap-3 border-t border-border/60 py-3 font-semibold">
          <span>{d.agreed ? "Valor combinado" : "Valor da avaliação"}</span>
          <span className="font-display text-lg tabular-nums">{d.blocked ? "—" : formatBRL(d.offer)}</span>
        </div>
      </section>

      {open && <RulesTable rules={d.rules} base={d.base_price} />}

      {open && (
        <div className="grid grid-cols-1 gap-2 [&>*]:min-w-0">
          {!d.blocked && !d.accepted_at && (confirmAccept ? (
            <div className={cn(card, "space-y-2 p-4 text-center")}>
              <p className="font-semibold">Aceitar {formatBRL(d.offer)} pelo seu {d.model}?</p>
              <p className="text-xs text-muted-foreground">A loja confere o aparelho na hora de fechar a troca.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-12" onClick={() => setConfirmAccept(false)}>Voltar</Button>
                <Button className="h-12" disabled={accepting} onClick={accept}>{accepting ? "Enviando…" : "Sim, aceito"}</Button>
              </div>
            </div>
          ) : (
            <Button className="h-14 text-base" onClick={() => setConfirmAccept(true)}>
              <CheckCircle2 className="mr-2 h-5 w-5" /> Aceito essa proposta
            </Button>
          ))}
          {d.reviews_left > 0 && d.rules.length > 0 ? (
            <Button variant="outline" className="h-auto min-h-14 whitespace-normal py-3 text-base" onClick={() => { setMode("review"); window.scrollTo({ top: 0 }); }}>
              <PencilLine className="mr-2 h-5 w-5" /> {d.review ? "Refazer minha avaliação" : "Não concordo, vou avaliar eu mesmo"}
            </Button>
          ) : d.reviews_left <= 0 && (
            <p className="text-center text-xs text-muted-foreground">Você já revisou o máximo de vezes. Fale com a loja.</p>
          )}
        </div>
      )}

      {open && <Photos token={token} data={d} onSent={update} />}

      <p className="flex items-start justify-center gap-1.5 px-2 pb-6 text-center text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        O valor final depende do vendedor conferir o aparelho na loja.
      </p>
    </Shell>
  );
}

function Shell({ children, store }: { children: React.ReactNode; store?: string }) {
  return (
    <div className="min-h-dvh bg-background bg-gradient-to-b from-primary/10 via-background to-background">
      <header className="mx-auto flex max-w-lg items-center gap-2 px-4 pb-2 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Store className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="truncate font-display font-bold leading-tight">{store ?? "Avaliação"}</p>
          <p className="text-xs text-muted-foreground">Avaliação do seu aparelho na troca</p>
        </div>
      </header>
      <main className="mx-auto max-w-lg space-y-3 px-4 pt-2">{children}</main>
    </div>
  );
}
