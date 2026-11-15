import { NavLink } from "react-router-dom";
import { BarChart3, Columns3, Inbox, ListTodo, Settings2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/crm/inbox", label: "Caixa de Entrada", short: "Conversas", icon: Inbox },
  { to: "/crm/funil", label: "Funil", short: "Funil", icon: Columns3 },
  { to: "/crm/contatos", label: "Contatos", short: "Contatos", icon: Users },
  { to: "/crm/tarefas", label: "Tarefas", short: "Tarefas", icon: ListTodo },
  { to: "/crm/relatorios", label: "Relatórios", short: "Relatórios", icon: BarChart3 },
  { to: "/crm/config", label: "Configurações", short: "Config.", icon: Settings2 },
];

export function CrmNav() {
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
        </NavLink>
      ))}
    </nav>
  );
}
