import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";

type Sale = any;
type Customer = Tables<"customers">;
type Accessory = { id: string; store_id: string; name: string; category: string; brand: string | null; quantity: number; cost_price: number; sale_price: number | null };
type CartItem = { acc: Accessory; qty: number; price: number };

export const useVendas = () => {
  const { user, userRole, activeStoreId } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Tables<"products">[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [pdvSales, setPdvSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  
  const [currentUserCommissionPercent, setCurrentUserCommissionPercent] = useState<string>("10");

  const fetchData = async () => {
    console.log("[useVendas] fetchData chamada. activeStoreId:", activeStoreId, "userRole:", userRole, "user:", user?.id);
    if (!activeStoreId) {
      console.warn("[useVendas] activeStoreId é null/undefined, abortando fetchData");
      return;
    }
    setLoading(true);

    let salesQuery = supabase.from("sales").select("*");
    let productsQuery = supabase.from("products").select("*");
    let accQuery = supabase.from("accessories" as any).select("*").gt("quantity", 0);
    let pdvQuery = supabase.from("transactions").select("*").eq("type", "income").eq("category", "acessorio");
    let accountsQuery = supabase.from("store_bank_accounts").select("*");

    if (activeStoreId !== "all") {
      salesQuery = salesQuery.eq("store_id", activeStoreId);
      productsQuery = productsQuery.eq("store_id", activeStoreId);
      accQuery = accQuery.eq("store_id", activeStoreId);
      pdvQuery = pdvQuery.eq("store_id", activeStoreId);
      accountsQuery = accountsQuery.eq("store_id", activeStoreId);
    }

    const [salesRes, productsRes, storesRes, accRes, pdvRes, profilesRes, customersRes, accountsRes, currentRoleRes] = await Promise.all([
      salesQuery.order("created_at", { ascending: false }),
      productsQuery,
      supabase.from("stores").select("*"),
      accQuery,
      pdvQuery.order("created_at", { ascending: false }),
      supabase.from("profiles").select("*"),
      supabase.from("customers").select("*").order("name"),
      accountsQuery,
      supabase.from("user_roles").select("commission_sales_percent, commission_on_sales").eq("user_id", user?.id).maybeSingle()
    ]);

    let userCommPercent = "10";
    if (currentRoleRes?.data) {
      const data = currentRoleRes.data as any;
      if (data.commission_on_sales === false) {
        userCommPercent = "0";
      } else {
        userCommPercent = String(data.commission_sales_percent ?? 10);
      }
    }

    if (salesRes.error) {
      console.error("Erro ao buscar vendas:", salesRes.error);
      toast.error(`Erro ao carregar vendas: ${salesRes.error.message}`);
    }
    if (productsRes.error) {
      console.error("Erro ao buscar produtos:", productsRes.error);
      toast.error(`Erro ao carregar produtos: ${productsRes.error.message}`);
    }

    setSales((salesRes.data as unknown as Sale[]) ?? []);
    setProducts(productsRes.data ?? []);
    setStores(storesRes.data ?? []);
    setAccessories((accRes.data as unknown as Accessory[]) ?? []);
    setPdvSales(pdvRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setCustomers(customersRes.data ?? []);
    setBankAccounts(accountsRes.data ?? []);
    
    setCurrentUserCommissionPercent(userCommPercent);

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [activeStoreId]);

  return {
    sales, setSales,
    products, setProducts,
    accessories, setAccessories,
    stores, profiles, customers, setCustomers, bankAccounts,
    pdvSales, setPdvSales,
    loading, setLoading,
    cart, setCart,
    currentUserCommissionPercent,
    fetchData
  };
};
