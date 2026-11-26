import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, Ban, Check, UserRound, CheckCircle2, ChevronRight, Info, RotateCcw, Search, ShoppingBag, Smartphone, ThumbsDown, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createEvaluation } from "../api/db";
import { AcceptDialog } from "../components/AcceptDialog";
import { EmptyState } from "../components/EmptyState";
import { ValueTracker } from "../components/ValueTracker";
import { useTrocaContext } from "../hooks/context";
import { useInvalidateTroca, useModels, useRules, useSettings } from "../hooks/useTroca";
import { computeOffer, formatBRL, toAnswerLine } from "../lib/calc";
import { buildHandoff, deviceName } from "../lib/handoff";
import { QUESTION_BY_KEY } from "../lib/questions";
import type { EvalStatus, QuestionKey, TradeEvaluation, TradeModel, TradeRule } from "../lib/types";
import { activeQuestions, brandsOf, chosenRules, modelNames, variantsOf } from "../lib/wizard";

type Step = { kind: "customer" } | { kind: "device" } | { kind: "storage" } | { kind: "question"; index: number } | { kind: "result" };

const card = "glass rounded-2xl border border-border/50 bg-card/70";
const NO_MODELS: TradeModel[] = [];
const NO_RULES: TradeRule[] = [];
const DEFAULT_SETTINGS = { negotiation_pct: 10, round_to: 10 };
const EMPTY_CUSTOMER = { name: "", phone: "", email: "", imei: "", notes: "" };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function BigOption({ selected, onClick, children, right, tone, multi }: {
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  right?: React.ReactNode;
  tone?: "danger";
  multi?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} role={multi ? "checkbox" : undefined} aria-checked={multi ? !!selected : undefined}
      className={cn(
        "flex min-h-[60px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-base font-medium transition-all duration-150 active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/15 text-foreground" : "border-border/60 bg-card/70 hover:border-primary/50 hover:bg-muted/40",
        tone === "danger" && !selected && "border-destructive/40",
      )}>
      {multi && (
        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
          {selected && <Check className="h-4 w-4" aria-hidden="true" />}
        </span>
      )}
      <span className="min-w-0 flex-1">{children}</span>
      {right}
    </button>
  );
}

function discountTag(rule: TradeRule, base: number) {
  if (rule.kind === "block") return <span className="shrink-0 text-xs font-semibold text-destructive">Não compra</span>;
  const v = toAnswerLine(rule, base).value;
  if (!v) return <span className="shrink-0 text-xs text-muted-foreground">sem desconto</span>;
  return <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">−{formatBRL(v)}</span>;
}

export default function SimuladorPage() {
  const { storeId, isManager } = useTrocaContext();
  const navigate = useNavigate();
  const invalidate = useInvalidateTroca();
  const models = useModels(storeId);
  const rules = useRules(storeId);
  const settings = useSettings(storeId);

  const [steps, setSteps] = useState<Step[]>([{ kind: "customer" }]);
  const [brand, setBrand] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<{ brand: string; model: string } | null>(null);
  const [variant, setVariant] = useState<TradeModel | null>(null);
  const [answers, setAnswers] = useState<Partial<Record<QuestionKey, string[]>>>({});
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER);
  const [editCustomer, setEditCustomer] = useState(false);
  const [saved, setSaved] = useState<TradeEvaluation | null>(null);
  const [saving, setSaving] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);

  const allModels = models.data ?? NO_MODELS;
  const allRules = rules.data ?? NO_RULES;
  const brands = useMemo(() => brandsOf(allModels), [allModels]);
  const currentBrand = brand && brands.includes(brand) ? brand : brands[0] ?? null;
  const names = useMemo(() => modelNames(allModels, currentBrand, search), [allModels, currentBrand, search]);
  const variants = picked ? variantsOf(allModels, picked.brand, picked.model) : [];
  const questions = useMemo(() => activeQuestions(allRules), [allRules]);
  const offerSettings = settings.data ?? DEFAULT_SETTINGS;
  const base = variant?.base_price ?? 0;
  const offer = useMemo(
    () => computeOffer(base, chosenRules(allRules, answers), offerSettings),
    [base, allRules, answers, offerSettings],
  );

  const step = steps[steps.length - 1];
  // painel do cliente: só as respostas até a pergunta da tela (ao voltar, não mostra as da frente)
  const shownKeys = step.kind === "question" ? questions.slice(0, step.index + 1).map((q) => q.question.key).join() : null;
  const progressOffer = useMemo(() => {
    const keys = shownKeys?.split(",");
    const visible = keys ? Object.fromEntries(Object.entries(answers).filter(([k]) => keys.includes(k))) : answers;
    return computeOffer(base, chosenRules(allRules, visible), offerSettings);
  }, [base, allRules, answers, offerSettings, shownKeys]);
  const go = (s: Step) => setSteps((prev) => [...prev, s]);
  const back = () => setSteps((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  const firstQuestion = (): Step => (questions.length ? { kind: "question", index: 0 } : { kind: "result" });

  const reset = () => {
    setSteps([{ kind: "customer" }]);
    setSearch("");
    setPicked(null);
    setVariant(null);
    setAnswers({});
    setCustomer(EMPTY_CUSTOMER);
    setEditCustomer(false);
    setSaved(null);
  };

  const chooseModel = (m: { brand: string; model: string }) => {
    setPicked(m);
    setAnswers({});
    const v = variantsOf(allModels, m.brand, m.model);
    if (v.length === 1) { setVariant(v[0]); go(firstQuestion()); }
    else { setVariant(null); go({ kind: "storage" }); }
  };

  const chooseVariant = (v: TradeModel) => { setVariant(v); go(firstQuestion()); };

  const answerSingle = (index: number, rule: TradeRule) => {
    setAnswers((a) => ({ ...a, [rule.question]: [rule.id] }));
    if (rule.kind === "block") return go({ kind: "result" }); // conta presa: nem precisa continuar
    go(index + 1 < questions.length ? { kind: "question", index: index + 1 } : { kind: "result" });
  };

  const toggleMulti = (rule: TradeRule) => {
    setAnswers((a) => {
      const cur = a[rule.question] ?? [];
      return { ...a, [rule.question]: cur.includes(rule.id) ? cur.filter((x) => x !== rule.id) : [...cur, rule.id] };
    });
  };

  const nextFrom = (index: number) => go(index + 1 < questions.length ? { kind: "question", index: index + 1 } : { kind: "result" });

  const save = async (status: EvalStatus, agreed: number | null = null) => {
    if (!variant) return;
    const email = customer.email.trim().toLowerCase();
    if (email && !EMAIL_RE.test(email)) { toast.error("E-mail inválido. Confira ou deixe em branco."); return; }
    setSaving(true);
    try {
      const ev = await createEvaluation({
        store_id: storeId,
        model_id: variant.id,
        brand: variant.brand,
        model: variant.model,
        storage: variant.storage,
        base_price: offer.base,
        answers: offer.lines,
        discount_total: offer.discountTotal,
        offer_min: offer.offerMin,
        offer_max: offer.offerMax,
        blocked: offer.blocked,
        status,
        agreed_value: status === "aceita" ? agreed : null,
        customer_name: customer.name.trim() || null,
        customer_phone: customer.phone.trim() || null,
        customer_email: email || null,
        imei: customer.imei.replace(/\s/g, "") || null,
        notes: customer.notes.trim() || null,
      });
      setSaved(ev);
      setAcceptOpen(false);
      invalidate("evaluations");
      toast.success(status === "aceita" ? "Troca aceita e salva." : "Avaliação salva no histórico.");
    } catch (e) {
      toast.error(`Não foi possível salvar: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const sendToSale = (ev: TradeEvaluation) => {
    const tradeIn = buildHandoff(ev);
    if (tradeIn) navigate("/vendas", { state: { tradeIn } });
  };

  // ---------- estados de carregamento / tabela vazia ----------
  if (models.isLoading || rules.isLoading || settings.isLoading) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
      </div>
    );
  }
  if (models.isError || rules.isError) {
    return <EmptyState icon={Smartphone} title="Não foi possível carregar a tabela" description={String((models.error ?? rules.error) as Error)} />;
  }
  if (!brands.length) {
    return (
      <EmptyState icon={Smartphone} title="A tabela de preços ainda está vazia"
        description={isManager ? "Cadastre os modelos e o valor de cada um para os vendedores começarem a avaliar." : "Peça ao gerente para cadastrar os modelos e valores da troca."}
        action={isManager ? <Button asChild><Link to="/troca/tabela">Abrir tabela de preços</Link></Button> : undefined} />
    );
  }

  const totalSteps = 2 + (variants.length > 1 ? 1 : 0) + questions.length + 1;
  const position = step.kind === "customer" ? 1
    : step.kind === "device" ? 2
    : step.kind === "storage" ? 3
    : step.kind === "question" ? 2 + (variants.length > 1 ? 1 : 0) + step.index + 1
    : totalSteps;
  const customerLine = [customer.name.trim(), customer.phone.trim()].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 pb-20 pt-4 sm:pb-4">
      {/* progresso + voltar */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-10 px-2" onClick={back} disabled={steps.length === 1 || !!saved}
          aria-label="Voltar um passo">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={totalSteps} aria-valuenow={position}>
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${(position / totalSteps) * 100}%` }} />
        </div>
        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{position}/{totalSteps}</span>
        {steps.length > 1 && !saved && (
          <Button variant="ghost" size="sm" className="h-10 px-2" onClick={reset} aria-label="Começar de novo">
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>

      {step.kind !== "customer" && (customerLine || (picked && step.kind !== "device")) && (
        <p className="-mt-2 flex flex-wrap items-center justify-center gap-x-2 text-center text-sm text-muted-foreground">
          {customerLine && <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" aria-hidden="true" />{customerLine}</span>}
          {customerLine && picked && step.kind !== "device" && <span aria-hidden="true">·</span>}
          {picked && step.kind !== "device" && <span>{picked.model}{variant ? ` ${variant.storage}` : ""}</span>}
        </p>
      )}

      {/* 0. cliente: nome e WhatsApp agora; e-mail e observação no fim */}
      {step.kind === "customer" && (
        <section className="space-y-4" aria-labelledby="t-customer">
          <div>
            <h2 id="t-customer" className="font-display text-xl font-bold">Quem é o cliente?</h2>
            <p className="text-sm text-muted-foreground">Opcional, mas ajuda a achar a avaliação depois e chamar no WhatsApp.</p>
          </div>
          <div className={cn(card, "space-y-3 p-4")}>
            <div className="space-y-1.5">
              <Label htmlFor="tc-name">Nome</Label>
              <Input id="tc-name" className="h-12 text-base" maxLength={120} autoComplete="off" value={customer.name}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tc-phone">WhatsApp</Label>
              <Input id="tc-phone" className="h-12 text-base" type="tel" inputMode="tel" maxLength={30} autoComplete="off" placeholder="(87) 9 9999-9999"
                value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && go({ kind: "device" })} />
            </div>
          </div>
          <Button className="h-14 w-full text-base" onClick={() => go({ kind: "device" })}>
            {customer.name.trim() || customer.phone.trim() ? "Avaliar o aparelho" : "Pular e avaliar o aparelho"} <ChevronRight className="ml-1 h-5 w-5" />
          </Button>
        </section>
      )}

      {/* painel que o cliente acompanha: valor base e descontos entrando a cada resposta */}
      {step.kind === "question" && variant && <ValueTracker offer={progressOffer} deviceLabel={deviceName(variant)} />}

      {/* 1. aparelho */}
      {step.kind === "device" && (
        <section className="space-y-3" aria-labelledby="t-device">
          <h2 id="t-device" className="font-display text-xl font-bold">Qual aparelho o cliente quer dar?</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar modelo (ex.: 13 Pro)"
              className="h-12 pl-10 text-base" aria-label="Buscar modelo" />
          </div>
          {!search && brands.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Marca">
              {brands.map((b) => (
                <button key={b} role="radio" aria-checked={b === currentBrand} onClick={() => setBrand(b)}
                  className={cn("min-h-[44px] shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors",
                    b === currentBrand ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card/70 text-muted-foreground")}>
                  {b}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {names.map((m) => (
              <BigOption key={`${m.brand}|${m.model}`} onClick={() => chooseModel(m)}
                right={<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}>
                {m.model}
                {search && <span className="block text-xs font-normal text-muted-foreground">{m.brand}</span>}
              </BigOption>
            ))}
          </div>
          {!names.length && (
            <p className="rounded-xl bg-muted/40 p-4 text-center text-sm text-muted-foreground">
              Nenhum modelo encontrado. {isManager ? "Cadastre na Tabela de preços." : "Peça ao gerente para cadastrar na tabela."}
            </p>
          )}
        </section>
      )}

      {/* 2. capacidade */}
      {step.kind === "storage" && picked && (
        <section className="space-y-3" aria-labelledby="t-storage">
          <h2 id="t-storage" className="font-display text-xl font-bold">Qual a capacidade?</h2>
          <p className="text-sm text-muted-foreground">Ajustes › Geral › Sobre › Capacidade</p>
          <div className="grid grid-cols-2 gap-2">
            {variants.map((v) => (
              <BigOption key={v.id} selected={variant?.id === v.id} onClick={() => chooseVariant(v)}>
                <span className="block text-lg font-bold">{v.storage || "Única"}</span>
              </BigOption>
            ))}
          </div>
        </section>
      )}

      {/* 3. perguntas de estado */}
      {step.kind === "question" && questions[step.index] && (() => {
        const { question, options } = questions[step.index];
        const chosen = answers[question.key] ?? [];
        return (
          <section className="space-y-3" aria-labelledby="t-q">
            <h2 id="t-q" className="font-display text-xl font-bold">{question.title}</h2>
            <p className="flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {question.hint}
            </p>
            <div className="grid gap-2" role={question.multi ? "group" : "radiogroup"} aria-labelledby="t-q">
              {question.multi && question.noneLabel && (
                <BigOption selected={chosen.length === 0} onClick={() => { setAnswers((a) => ({ ...a, [question.key]: [] })); nextFrom(step.index); }}>
                  {question.noneLabel}
                </BigOption>
              )}
              {options.map((r) => (
                <BigOption key={r.id} multi={question.multi} selected={chosen.includes(r.id)} tone={r.kind === "block" ? "danger" : undefined}
                  onClick={() => (question.multi ? toggleMulti(r) : answerSingle(step.index, r))} right={discountTag(r, base)}>
                  {r.label}
                </BigOption>
              ))}
            </div>
            {question.multi && chosen.length > 0 && (
              <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-30 px-4 sm:static sm:px-0">
                <Button className="mx-auto flex h-14 w-full max-w-xl text-base shadow-lg sm:shadow-none" onClick={() => nextFrom(step.index)}>
                  Continuar <ChevronRight className="ml-1 h-5 w-5" />
                </Button>
              </div>
            )}
          </section>
        );
      })()}

      {/* 4. resultado */}
      {step.kind === "result" && variant && (
        <section className="space-y-4" aria-labelledby="t-result">
          {offer.blocked ? (
            <div className={cn(card, "border-destructive/50 bg-destructive/10 p-5 text-center")}>
              <Ban className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
              <h2 id="t-result" className="mt-2 font-display text-2xl font-bold text-destructive">Não compre este aparelho</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {offer.lines.filter((l) => l.kind === "block").map((l) => `${QUESTION_BY_KEY.get(l.question)?.short}: ${l.label}`).join(" · ")}
              </p>
              <p className="mt-2 text-sm">Aparelho com conta presa não pode ser revendido. Peça para o cliente desvincular e avalie de novo.</p>
            </div>
          ) : (
            <div className={cn(card, "overflow-hidden")}>
              <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-5 text-center">
                <p className="text-sm font-medium text-muted-foreground">Pode oferecer</p>
                <h2 id="t-result" className="mt-1 font-display text-3xl font-extrabold tabular-nums sm:text-4xl">
                  {formatBRL(offer.offerMin)} <span className="text-xl font-semibold text-muted-foreground">a</span> {formatBRL(offer.offerMax)}
                </h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  Comece pelo menor. {formatBRL(offer.offerMax)} é o teto: acima disso, fale com o gerente.
                </p>
              </div>
              <dl className="divide-y divide-border/40 px-4 text-sm">
                <div className="flex justify-between gap-3 py-2.5">
                  <dt className="text-muted-foreground">Valor base na loja ({deviceName(variant)})</dt>
                  <dd className="font-semibold tabular-nums">{formatBRL(offer.base)}</dd>
                </div>
                {offer.lines.filter((l) => l.value > 0).map((l, i) => (
                  <div key={i} className="flex justify-between gap-3 py-2.5">
                    <dt className="min-w-0 text-muted-foreground">{QUESTION_BY_KEY.get(l.question)?.short}: {l.label}</dt>
                    <dd className="shrink-0 tabular-nums text-destructive">−{formatBRL(l.value)}</dd>
                  </div>
                ))}
                {offerSettings.negotiation_pct > 0 && (
                  <div className="flex justify-between gap-3 py-2.5 text-xs text-muted-foreground">
                    <dt>Margem de negociação</dt>
                    <dd>{offerSettings.negotiation_pct}%</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {!saved ? (
            <>
              <div className={cn(card, "space-y-3 p-4")}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Cliente <span className="font-normal text-muted-foreground">(opcional)</span></p>
                  {customerLine && !editCustomer && (
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditCustomer(true)}>Editar</Button>
                  )}
                </div>
                {customerLine && !editCustomer && <p className="text-sm text-muted-foreground">{customerLine}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  {(!customerLine || editCustomer) && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="tc-name2">Nome</Label>
                        <Input id="tc-name2" className="h-11" maxLength={120} autoComplete="off" value={customer.name}
                          onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="tc-phone2">WhatsApp</Label>
                        <Input id="tc-phone2" className="h-11" type="tel" inputMode="tel" maxLength={30} autoComplete="off" value={customer.phone}
                          onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
                      </div>
                    </>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="tc-email">E-mail</Label>
                    <Input id="tc-email" className="h-11" type="email" inputMode="email" maxLength={160} autoComplete="off" placeholder="cliente@email.com"
                      value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tc-imei">IMEI</Label>
                    <Input id="tc-imei" className="h-11" inputMode="numeric" maxLength={20} autoComplete="off" placeholder="*#06#"
                      value={customer.imei} onChange={(e) => setCustomer({ ...customer, imei: e.target.value })} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="tc-notes">Observação</Label>
                    <Textarea id="tc-notes" rows={2} maxLength={500} value={customer.notes}
                      onChange={(e) => setCustomer({ ...customer, notes: e.target.value })} />
                  </div>
                </div>
              </div>

              {offer.blocked ? (
                <div className="grid gap-2">
                  <Button variant="outline" className="h-14 text-base" disabled={saving} onClick={() => save("recusada")}>
                    <ThumbsDown className="mr-2 h-5 w-5" /> Salvar como recusada
                  </Button>
                  <Button variant="ghost" className="h-12" onClick={reset}>Nova avaliação</Button>
                </div>
              ) : (
                <div className="grid gap-2">
                  <Button className="h-14 text-base" disabled={saving} onClick={() => setAcceptOpen(true)}>
                    <CheckCircle2 className="mr-2 h-5 w-5" /> Cliente aceitou
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-12" disabled={saving} onClick={() => save("simulada")}>
                      <Clock className="mr-2 h-4 w-4" /> Vai pensar
                    </Button>
                    <Button variant="outline" className="h-12" disabled={saving} onClick={() => save("recusada")}>
                      <ThumbsDown className="mr-2 h-4 w-4" /> Recusou
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className={cn(card, "space-y-3 p-4 text-center")}>
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" aria-hidden="true" />
              <p className="font-semibold">
                {saved.status === "aceita" ? `Troca fechada por ${formatBRL(saved.agreed_value)}` : saved.status === "recusada" ? "Salva como recusada" : "Salva no histórico"}
              </p>
              {buildHandoff(saved) && (
                <Button className="h-14 w-full text-base" onClick={() => sendToSale(saved)}>
                  <ShoppingBag className="mr-2 h-5 w-5" /> Usar na venda
                </Button>
              )}
              <Button variant={buildHandoff(saved) ? "ghost" : "default"} className="h-12 w-full" onClick={reset}>Nova avaliação</Button>
            </div>
          )}
        </section>
      )}

      <AcceptDialog open={acceptOpen} onOpenChange={setAcceptOpen} offerMin={offer.offerMin} offerMax={offer.offerMax}
        roundTo={offerSettings.round_to} busy={saving} onConfirm={(v) => save("aceita", v)} />
    </div>
  );
}
