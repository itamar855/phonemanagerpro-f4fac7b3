import { NavLink } from "react-router-dom";
import { BarChart3, Columns3, Inbox, ListTodo, Settings2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCrmContext } from "../../hooks/useInbox";
import { useTaskCounts } from "../../hooks/useTasks";

const TABS = [
  { to: "/crm/inbox", label: "Caixa de Entrada", short: "Conversas", icon: Inbox },
  { to: "/crm/funil", label: "Funil", short: "Funil", icon: Columns3 },
  { to: "/crm/contatos", label: "Contatos", short: "Contatos", icon: Users },
  { to: "/crm/tarefas", label: "Tarefas", short: "Tarefas", icon: ListTodo },
  { to: "/crm/relatorios", label: "Relatórios", short: "Relatórios", icon: BarChart3 },
  { to: "/crm/config", label: "Configurações", short: "Config.", icon: Settings2 },
];

export function CrmNav() {
  const { storeId } = useCrmContext();
  const { data: counts } = useTaskCounts(storeId);
  const dueToday = counts?.today ?? 0;
  const late = (counts?.overdue ?? 0) > 0;

  return (
    <nav aria-label="Seções do CRM" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
      {TABS.map(({ to, label, short, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              "inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )
          }
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{short}</span>
          {to === "/crm/tarefas" && dueToday > 0 && (
            <span
              className={cn("min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 tabular-nums",
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
