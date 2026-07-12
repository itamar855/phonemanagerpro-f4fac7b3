import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Package, ArrowUpDown, ShoppingBag, Store, Landmark, PiggyBank,
  LogOut, Smartphone, Wrench, Users, Sun, Moon, UserCircle, FileText, Download, Brain, Settings, Activity, ChevronDown, Wallet, MessageSquare, ShieldCheck,
  MoreHorizontal, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/", permission: "dashboard" },
  { label: "Vendas", icon: ShoppingBag, path: "/vendas", permission: "vendas" },
  { label: "Estoque", icon: Package, path: "/estoque", permission: "estoque" },
  { label: "OS", icon: Wrench, path: "/ordens-servico", permission: "os" },
  { label: "Clientes", icon: UserCircle, path: "/clientes", permission: "clientes" },
  { label: "CRM de Leads", icon: MessageSquare, path: "/leads" },
  { label: "Transações", icon: ArrowUpDown, path: "/transacoes", permission: "transacoes" },
  { label: "Relatórios", icon: FileText, path: "/relatorios", permission: "relatorios" },
  { label: "Lojas", icon: Store, path: "/lojas", permission: "lojas" },
  { label: "Equipe", icon: Users, path: "/equipe", permission: "equipe" },
  { label: "Contas", icon: Landmark, path: "/contas", permission: "contas" },
  { label: "Caixa", icon: PiggyBank, path: "/caixa", permission: "caixa" },
  { label: "Meu PF", icon: Wallet, path: "/financas-pf", permission: "financas_pf" },
  { label: "Auditoria", icon: Activity, path: "/auditoria", permission: "auditoria" },
  { label: "Config.", icon: Settings, path: "/configuracoes", permission: "configuracoes" },
  { label: "IA", icon: Brain, path: "/assistente-ia", permission: "ia" },
  { label: "Teste Meta", icon: ShieldCheck, path: "/teste-meta", permission: "configuracoes" },
];

const AppLayout = ({ children }: { children: ReactNode }) => {
  const { user, userRole, userPermissions, userStoreIds, activeStoreId, setActiveStoreId, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [activeStoreName, setActiveStoreName] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    supabase.from("stores").select("id, name").then(({ data }) => {
      if (data) {
        let allowedStores = data;
        if (userRole !== "admin" && userStoreIds && userStoreIds.length > 0) {
          allowedStores = data.filter(s => userStoreIds.includes(s.id));
        }
        
        // Add "Todas as lojas" if user is admin
        if (userRole === "admin") {
          allowedStores = [{ id: "all", name: "Todas as lojas" }, ...allowedStores];
        }
        
        setStores(allowedStores);
        
        const storedActive = localStorage.getItem("cellmanager-active-store-id");
        const currentActive = activeStoreId || storedActive;
        
        if (currentActive === "all" && userRole === "admin") {
          setActiveStoreName("Todas as lojas");
          if (!activeStoreId) setActiveStoreId("all");
          return;
        }

        if (currentActive) {
          const found = allowedStores.find(s => s.id === currentActive);
          if (found) {
            setActiveStoreName(found.name);
            if (!activeStoreId) setActiveStoreId(found.id);
          } else if (allowedStores.length > 0) {
            const defaultStore = allowedStores[0];
            setActiveStoreName(defaultStore.name);
            setActiveStoreId(defaultStore.id);
          }
        } else if (allowedStores.length > 0) {
          const defaultStore = userRole === "admin" ? { id: "all", name: "Todas as lojas" } : allowedStores[0];
          setActiveStoreName(defaultStore.name);
          setActiveStoreId(defaultStore.id);
        }
      }
    });
  }, [userRole, userStoreIds, activeStoreId, setActiveStoreId]);

  const handleStoreChange = (store: { id: string; name: string }) => {
    setActiveStoreName(store.name);
    setActiveStoreId(store.id);
  };

  const filteredNavItems = navItems.filter((item) => {
    // Admins see everything
    if (userRole === "admin") return true;
    
    // If item has no specific permission required, it's public (for logged in users)
    if (!item.permission) return true;
    
    // Check granular permission
    return userPermissions?.[item.permission] === true;
  });

  return (
    <div className="flex h-[100dvh] overflow-hidden text-foreground bg-background">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar-background border-r border-sidebar-border">
        <div className="p-6 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary/15 p-1.5">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <h1 className="font-display text-lg font-bold text-sidebar-foreground tracking-tight">
              Cell Pro 360
            </h1>
          </div>
        </div>

        {/* Desktop Store Switcher */}
        <div className="px-4 pb-4">
          {stores.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="w-full justify-between h-9 px-3 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold gap-1.5 rounded-lg border border-primary/20">
                  <span className="flex items-center gap-2 truncate">
                    <Store className="h-4 w-4 shrink-0" />
                    <span className="truncate">{activeStoreName || "Selecionar Loja"}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[224px]">
                {stores.map(s => (
                  <DropdownMenuItem
                    key={s.id}
                    onClick={() => handleStoreChange(s)}
                    className={cn(activeStoreId === s.id && "font-bold text-primary")}
                  >
                    {s.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : stores.length === 1 ? (
            <div className="flex items-center px-3 h-9 bg-primary/10 text-primary rounded-lg text-xs font-semibold gap-2 border border-primary/20">
              <Store className="h-4 w-4 shrink-0" />
              <span className="truncate">{activeStoreName || stores[0].name}</span>
            </div>
          ) : null}
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto pt-2">
          {filteredNavItems.map((item) => {
            const Icon = item.icon || Smartphone;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.98]",
                  location.pathname === item.path
                    ? "bg-primary/10 text-primary shadow-sm font-semibold"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <Icon className="h-4.5 w-4.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
              {user?.email?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              className="h-9 px-3 justify-start bg-transparent text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
              {theme === "dark" ? "Claro" : "Escuro"}
            </Button>
            <Link to="/instalar">
              <Button className="h-9 px-3 bg-transparent text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent">
                <Download className="h-4 w-4 mr-2" /> App
              </Button>
            </Link>
          </div>
          <Button
            className="h-9 px-3 w-full justify-start bg-transparent text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between border-b border-border bg-card px-4 py-3 safe-top">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-primary/15 p-1">
              <Smartphone className="h-4 w-4 text-primary" />
            </div>
            <span className="font-display font-bold text-sm">Cell Pro 360</span>
          </div>
          <div className="flex items-center gap-1">
            {stores.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-8 px-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold gap-1 rounded-lg">
                    <Store className="h-3.5 w-3.5" />
                    <span className="max-w-[80px] truncate">{activeStoreName || "Loja"}</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {stores.map(s => (
                    <DropdownMenuItem
                      key={s.id}
                      onClick={() => handleStoreChange(s)}
                      className={activeStoreId === s.id ? "font-bold text-primary" : ""}
                    >
                      {s.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : stores.length === 1 ? (
              <div className="flex items-center px-3 h-8 bg-primary/10 text-primary rounded-lg text-xs font-semibold gap-1.5 border border-primary/20">
                <Store className="h-3.5 w-3.5" />
                <span className="max-w-[100px] truncate">{activeStoreName || stores[0].name}</span>
              </div>
            ) : null}
            <Button className="h-8 w-8 p-0 bg-transparent hover:bg-muted" onClick={toggleTheme}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button className="h-8 w-8 p-0 bg-transparent hover:bg-muted" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 md:p-8 pb-24 md:pb-8">
          {children}
        </main>

        {/* Mobile bottom nav (Apple HIG layout) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border/50 safe-bottom z-40">
          <div className="grid grid-cols-5 py-1 px-1 h-16 items-center">
            {(() => {
              const primaryPaths = ["/", "/vendas", "/estoque", "/ordens-servico"];
              const primaryNavItems = filteredNavItems.filter(item => primaryPaths.includes(item.path));

              return (
                <>
                  {primaryNavItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    const Icon = item.icon || Smartphone;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={cn(
                          "flex flex-col items-center justify-center gap-1 h-full rounded-xl transition-all active:scale-95 text-center",
                          isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-[10px] font-medium leading-none">{item.label}</span>
                      </Link>
                    );
                  })}
                  
                  <button
                    type="button"
                    onClick={() => setMenuOpen(true)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 h-full rounded-xl transition-all active:scale-95 text-center",
                      menuOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <MoreHorizontal className="h-5 w-5" />
                    <span className="text-[10px] font-medium leading-none">Mais</span>
                  </button>
                </>
              );
            })()}
          </div>
        </nav>

        {/* Mobile Drawer (iOS Sheet Style) */}
        {menuOpen && (() => {
          const primaryPaths = ["/", "/vendas", "/estoque", "/ordens-servico"];
          const secondaryNavItems = filteredNavItems.filter(item => !primaryPaths.includes(item.path));

          return (
            <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm transition-all duration-300">
              <div className="absolute inset-0" onClick={() => setMenuOpen(false)} />
              <div className="relative bg-card rounded-t-2xl border-t border-border p-4 pb-8 max-h-[70vh] overflow-y-auto z-10 shadow-2xl">
                <div className="flex justify-between items-center pb-3 border-b border-border/50 mb-3">
                  <span className="font-display font-bold text-sm">Mais Módulos</span>
                  <button 
                    onClick={() => setMenuOpen(false)}
                    className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 active:scale-95"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                
                <div className="grid grid-cols-1 gap-1">
                  {secondaryNavItems.map((item) => {
                    const Icon = item.icon || Smartphone;
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-3 h-11 rounded-lg text-sm font-medium transition-all",
                          isActive
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50 active:bg-muted"
                        )}
                      >
                        <Icon className="h-4.5 w-4.5 shrink-0" />
                        <span className="flex-1 text-left">{item.label}</span>
                        <span className="text-xs text-muted-foreground/30">→</span>
                      </Link>
                    );
                  })}
                </div>
                
                <div className="mt-4 pt-4 border-t border-border/50 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 h-11 px-3 justify-center bg-muted/20 text-foreground border border-border/50 hover:bg-muted/40"
                      variant="outline"
                      onClick={toggleTheme}
                    >
                      {theme === "dark" ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                      {theme === "dark" ? "Modo Claro" : "Modo Escuro"}
                    </Button>
                    <Link to="/instalar" className="flex-1" onClick={() => setMenuOpen(false)}>
                      <Button className="w-full h-11 px-3 bg-muted/20 text-foreground border border-border/50 hover:bg-muted/40" variant="outline">
                        <Download className="h-4 w-4 mr-2" /> Instalar
                      </Button>
                    </Link>
                  </div>
                  <Button
                    className="h-11 w-full justify-center bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20"
                    onClick={() => { setMenuOpen(false); signOut(); }}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sair da Conta
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default AppLayout;
