// Entrada do módulo CRM. Carregado sob demanda (lazy) a partir de App.tsx:
// quem não abre /crm não baixa nada daqui.
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Lock, MessagesSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CrmNav } from "./components/shared/CrmNav";
import { StoreFilter } from "./components/shared/StoreTag";
import { PushToggle } from "./components/shared/PushToggle";
import { crmAccess, crmIsAdmin } from "./lib/access";

const InboxPage = lazy(() => import("./pages/InboxPage"));
const PipelinePage = lazy(() => import("./pages/PipelinePage"));
const ContactsPage = lazy(() => import("./pages/ContactsPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center" role="status" aria-label="Carregando">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function NoAccess() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <Lock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="font-display text-lg font-bold">Sem acesso ao CRM</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Peça ao administrador para liberar o módulo <strong>CRM</strong> no seu usuário, em Equipe.
      </p>
    </div>
  );
}

export default function CrmModule() {
  const { userRole, userPermissions } = useAuth();
  const access = crmAccess(userRole, userPermissions);
  const isAdmin = crmIsAdmin(userRole);
  if (access === "loading") return <PageFallback />;
  if (access === "denied") return <NoAccess />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-2 border-b border-border/50 px-1.5 pb-1.5 pt-1.5 sm:px-3 sm:pb-2 sm:pt-3 md:px-6 md:pt-5">
        {/* no celular o título some: o cabeçalho do app já mostra onde a pessoa está */}
        <div className="flex items-center gap-2">
          <MessagesSquare className="hidden h-5 w-5 text-primary sm:block" aria-hidden="true" />
          <h1 className="hidden font-display text-lg font-bold tracking-tight sm:block md:text-xl">CRM</h1>
          <div className="ml-auto flex items-center gap-1">
            <PushToggle />
            <StoreFilter />
          </div>
        </div>
        <CrmNav />
      </header>
      <div className="min-h-0 flex-1">
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route index element={<Navigate to="inbox" replace />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="inbox/:conversationId" element={<InboxPage />} />
            <Route path="funil" element={<PipelinePage />} />
            <Route path="contatos" element={<ContactsPage />} />
            <Route path="contatos/:contactId" element={<ContactsPage />} />
            <Route path="tarefas" element={<TasksPage />} />
            {/* Relatórios e Configurações só do admin; os demais voltam para a caixa de entrada */}
            <Route path="relatorios" element={isAdmin ? <ReportsPage /> : <Navigate to="/crm/inbox" replace />} />
            <Route path="config" element={isAdmin ? <SettingsPage /> : <Navigate to="/crm/inbox" replace />} />
            <Route path="*" element={<Navigate to="inbox" replace />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}
