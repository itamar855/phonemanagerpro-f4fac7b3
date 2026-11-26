// Entrada do simulador de troca (trade-in). Carregado sob demanda (lazy) a partir de App.tsx:
// quem não abre /troca não baixa nada daqui.
import { lazy, Suspense } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { ArrowLeftRight, History, Lock, Settings2, Smartphone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { trocaAccess, trocaIsManager } from "./lib/access";
import { useEvaluations, useTrocaStore } from "./hooks/useTroca";
import { hasNews } from "./lib/share";
import { TrocaContext } from "./hooks/context";

const SimuladorPage = lazy(() => import("./pages/SimuladorPage"));
const HistoricoPage = lazy(() => import("./pages/HistoricoPage"));
const TabelaPage = lazy(() => import("./pages/TabelaPage"));

function PageFallback() {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center" role="status" aria-label="Carregando">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function NoAccess() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <Lock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="font-display text-lg font-bold">Sem acesso ao simulador de troca</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Peça ao administrador para liberar <strong>Vendas</strong> no seu usuário, em Equipe.
      </p>
    </div>
  );
}

const TABS = [
  { to: "/troca/avaliar", label: "Avaliar", icon: Smartphone, manager: false },
  { to: "/troca/historico", label: "Histórico", icon: History, manager: false },
  { to: "/troca/tabela", label: "Tabela de preços", short: "Tabela", icon: Settings2, manager: true },
];

export default function TrocaModule() {
  const { userRole, userPermissions, user } = useAuth();
  const access = trocaAccess(userRole, userPermissions);
  const isManager = trocaIsManager(userRole);
  const { stores, storeId, pick, loading } = useTrocaStore();
  // selo na aba Histórico: cliente revisou, aceitou ou mandou foto pelo link
  const evals = useEvaluations(access === "denied" || access === "loading" ? null : storeId);
  const news = evals.data?.list.filter((e) => hasNews(e.share)).length ?? 0;

  if (access === "loading" || loading) return <PageFallback />;
  if (access === "denied") return <NoAccess />;
  if (!storeId) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Seu usuário não está ligado a nenhuma loja. Peça ao administrador para vincular em Equipe.
      </div>
    );
  }

  const tabs = TABS.filter((t) => !t.manager || isManager);
  const store = stores.find((s) => s.id === storeId);

  return (
    <TrocaContext.Provider value={{ storeId, storeLabel: store?.label ?? "Loja", isManager, userId: user?.id ?? null }}>
      <div className="-mx-1 flex flex-col sm:mx-0">
        <header className="flex flex-col gap-2 border-b border-border/50 pb-2">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="hidden h-5 w-5 text-primary sm:block" aria-hidden="true" />
            <h1 className="hidden font-display text-lg font-bold tracking-tight sm:block md:text-xl">Troca de aparelhos</h1>
            {stores.length > 1 && (
              <div className="flex gap-1 sm:ml-auto" role="radiogroup" aria-label="Loja">
                {stores.map((s) => (
                  <button key={s.id} role="radio" aria-checked={s.id === storeId} onClick={() => pick(s.id)}
                    className={cn("min-h-[36px] rounded-full border px-3 text-xs font-medium transition-colors duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      s.id === storeId ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <nav aria-label="Seções da troca" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
            className="grid gap-1 sm:flex">
            {tabs.map(({ to, label, short, icon: Icon }) => (
              <NavLink key={to} to={to}
                className={({ isActive }) => cn(
                  "flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{short ?? label}</span>
                {to === "/troca/historico" && news > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white"
                    aria-label={`${news} ${news === 1 ? "novidade" : "novidades"} do cliente`}>{news}</span>
                )}
              </NavLink>
            ))}
          </nav>
        </header>
        <div>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route index element={<Navigate to="avaliar" replace />} />
              <Route path="avaliar" element={<SimuladorPage key={storeId} />} />
              <Route path="historico" element={<HistoricoPage />} />
              <Route path="tabela" element={isManager ? <TabelaPage /> : <Navigate to="/troca/avaliar" replace />} />
              <Route path="*" element={<Navigate to="avaliar" replace />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </TrocaContext.Provider>
  );
}
