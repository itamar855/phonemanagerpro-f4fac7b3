// Entrada do módulo CRM. Carregado sob demanda (lazy) a partir de App.tsx:
// quem não abre /crm não baixa nada daqui.
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { MessagesSquare } from "lucide-react";
import { CrmNav } from "./components/shared/CrmNav";

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

export default function CrmModule() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-2 border-b border-border/50 px-1.5 pb-1.5 pt-1.5 sm:px-3 sm:pb-2 sm:pt-3 md:px-6 md:pt-5">
        {/* no celular o título some: o cabeçalho do app já mostra onde a pessoa está */}
        <div className="hidden items-center gap-2 sm:flex">
          <MessagesSquare className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="font-display text-lg font-bold tracking-tight md:text-xl">CRM</h1>
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
            <Route path="relatorios" element={<ReportsPage />} />
            <Route path="config" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="inbox" replace />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}
