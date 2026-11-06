import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";

type AuthContextType = {
  session: Session | null;
  user: User | null;
  userDisplayName: string | null;
  userRole: Enums<"app_role"> | null;
  userPermissions: Record<string, boolean> | null;
  userStoreIds: string[];
  activeStoreId: string | null;
  setActiveStoreId: (id: string) => void;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  userDisplayName: null,
  userRole: null,
  userPermissions: null,
  userStoreIds: [],
  activeStoreId: null,
  setActiveStoreId: () => {},
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<Enums<"app_role"> | null>(null);
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean> | null>(null);
  const [userStoreIds, setUserStoreIds] = useState<string[]>([]);
  const [activeStoreId, setActiveStoreIdState] = useState<string | null>(() => localStorage.getItem("cellmanager-active-store-id"));
  const [loading, setLoading] = useState(true);

  const setActiveStoreId = useCallback((id: string) => {
    localStorage.setItem("cellmanager-active-store-id", id);
    setActiveStoreIdState(id);
    window.dispatchEvent(new CustomEvent("store-changed", { detail: { id } }));
  }, []);

  const fetchUserData = async (userId: string) => {
    const [roleRes, storesRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role, permissions").eq("user_id", userId).maybeSingle(),
      supabase.from("member_stores" as any).select("store_id").eq("user_id", userId),
      supabase.from("profiles").select("display_name").eq("user_id", userId).maybeSingle(),
    ]);
    
    if (roleRes.data) {
      setUserRole((roleRes.data as any).role);
      setUserPermissions((roleRes.data as any).permissions as Record<string, boolean>);
    } else {
      setUserRole(null);
      setUserPermissions(null);
    }

    if (profileRes.data?.display_name) {
      setUserDisplayName(profileRes.data.display_name);
    } else {
      setUserDisplayName(null);
    }

    const assignedStoreIds = storesRes.data ? (storesRes.data as any[]).map(s => s.store_id) : [];
    setUserStoreIds(assignedStoreIds);

    const isAll = (roleRes.data as any)?.role === 'admin';
    const currentActive = localStorage.getItem("cellmanager-active-store-id");

    if (!isAll && assignedStoreIds.length > 0) {
      // Se não é admin e não tem uma loja ativa válida no momento, força a 1ª da lista
      if (!currentActive || !assignedStoreIds.includes(currentActive)) {
        setActiveStoreId(assignedStoreIds[0]);
      }
    } else if (isAll && !currentActive) {
      setActiveStoreId("all");
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchUserData(session.user.id), 0);
        } else {
          setUserRole(null);
          setUserPermissions(null);
          setUserDisplayName(null);
          setUserStoreIds([]);
          setActiveStoreIdState(null);
          localStorage.removeItem("cellmanager-active-store-id");
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, userDisplayName, userRole, userPermissions, userStoreIds, activeStoreId, setActiveStoreId, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
