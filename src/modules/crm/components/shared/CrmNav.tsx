import { NavLink } from "react-router-dom";
import { BarChart3, Columns3, Inbox, ListTodo, Settings2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCrmContext } from "../../hooks/useInbox";
import { useTaskCounts } from "../../hooks/useTasks";
import { crmTabVisible } from "../../lib/access";

const TABS = [
  { to: "/crm/inbox", label: "Caixa de Entrada", short: "Conversas", icon: Inbox },
  { to: "/crm/funil", label: "Funil", short: "Funil", icon: Columns3 },
  { to: "/crm/contatos", label: "Contatos", short: "Contatos", icon: Users },
  { to: "/crm/tarefas", label: "Tarefas", short: "Tarefas", icon: ListTodo },
  { to: "/crm/relatorios", label: "Relatórios", short: "Relatório", icon: BarChart3 },
  { to: "/crm/config", label: "Configurações", short: "Ajustes", icon: Settings2 },
];

export function CrmNav() {
  const { storeId, userRole } = useCrmContext();
  const tabs = TABS.filter((t) => crmTabVisible(t.to, userRole));
  const { data: counts } = useTaskCounts(storeId);
  const dueToday = counts?.today ?? 0;
  const late = (counts?.overdue ?? 0) > 0;

  return (
    <nav aria-label="Seções do CRM" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      className="grid gap-0.5 sm:-mx-1 sm:flex sm:gap-1 sm:overflow-x-auto sm:px-1 sm:[scrollbar-width:none]">
      {tabs.map(({ to, label, short, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              // celular: barra de app (ícone em cima, nome embaixo, colunas iguais)
              "relative flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-[10.5px] font-medium leading-tight transition-colors duration-150",
              "sm:inline-flex sm:min-h-[40px] sm:shrink-0 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )
          }
        >
          <Icon className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
          <span className="w-full truncate text-center sm:hidden">{short}</span>
          {to === "/crm/tarefas" && dueToday > 0 && (
            <span
              className={cn("min-w-[18px] rounded-full px-1 text-center text-[10px] font-semibold leading-[18px] tabular-nums",
                "max-sm:absolute max-sm:right-1 max-sm:top-0.5 sm:min-w-[20px] sm:px-1.5 sm:text-[11px] sm:leading-5",
                late ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground")}
              aria-label={late ? `${counts?.overdue} atrasada(s), ${dueToday} para hoje` : `${dueToday} para hoje`}
            >
              {dueToday}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
