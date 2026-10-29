import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { RankingTab } from "@/components/features/relatorios/RankingTab";
import { getPeriodDates, getPeriodLabel } from "@/components/features/relatorios/types";
import {
  aggregatePhoneRanking,
  aggregateAccessoryRanking,
  type RankSellerPhone,
  type RankSellerAccessory,
  type StoreAccessoryMetrics,
} from "@/utils/rankingGamification";
import { Trophy, Sparkles } from "lucide-react";

const Ranking = () => {
  const { user, userRole, activeStoreId } = useAuth();
  const isAdmin = userRole === "admin";

  const [stores, setStores] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [storeId, setStoreId] = useState<string>("all");
  const [rankPeriod, setRankPeriod] = useState<string>("month");
  const [rankSpecificDay, setRankSpecificDay] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [rankCustomStart] = useState<string>("");
  const [rankCustomEnd] = useState<string>("");

  const [ranking, setRanking] = useState<any[]>([]);
  const [rankingPhones, setRankingPhones] = useState<RankSellerPhone[]>([]);
  const [rankingAccessories, setRankingAccessories] = useState<RankSellerAccessory[]>([]);
  const [storeAccessoryMetrics, setStoreAccessoryMetrics] = useState<Record<string, StoreAccessoryMetrics>>({});

  useEffect(() => {
    supabase.from("stores").select("*").then((r) => setStores(r.data ?? []));
    supabase.from("profiles").select("*").then((r) => setProfiles(r.data ?? []));
  }, []);

  useEffect(() => {
    if (activeStoreId && !isAdmin) {
      setStoreId(activeStoreId);
    }
  }, [activeStoreId, isAdmin]);

  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.user_id, p.display_name ?? p.user_id])),
    [profiles]
  );
  const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const currentStoreName =
    storeId !== "all"
      ? ((storeMap.get(storeId) as any)?.name ?? "Todas as Lojas")
      : "Todas as Lojas";
  const currentRankPeriodLabel = getPeriodLabel(
    rankPeriod,
    rankCustomStart,
    rankCustomEnd,
    rankSpecificDay
  );

  const fetchRankingData = useCallback(async () => {
    const { start, end } = getPeriodDates(
      rankPeriod,
      rankCustomStart,
      rankCustomEnd,
      rankSpecificDay
    );
    const effectiveStoreId = isAdmin ? storeId : activeStoreId || "all";

    const [salesRes, productsRes, rolesRes, accTxRes] = await Promise.all([
      supabase
        .from("sales")
        .select("*, products(*)")
        .gte("created_at", start)
        .lte("created_at", end),
      supabase.from("products").select("*"),
      supabase.from("user_roles").select("*"),
      supabase
        .from("transactions")
        .select("*")
        .eq("type", "income")
        .eq("category", "acessorio")
        .gte("created_at", start)
        .lte("created_at", end),
    ]);

    const allSales = (salesRes.data ?? []) as any[];
    const products = (productsRes.data ?? []) as any[];
    const productMap = new Map(products.map((p: any) => [p.id, p]));
    const roles = (rolesRes.data ?? []) as any[];
    const allAccTx = (accTxRes.data ?? []) as any[];

    // 1. Trilha Geral de Celulares (Vendedoras + Técnicos)
    const phoneRanking = aggregatePhoneRanking({
      sales: allSales,
      profiles,
      stores,
      userRoles: roles,
      productMap,
    });
    setRankingPhones(phoneRanking);

    // 2. Trilha de Acessórios (Por Loja / Metas Locais)
    const { ranking: accRanking, storeMetrics: accMetrics } = aggregateAccessoryRanking({
      transactions: allAccTx,
      sales: allSales,
      profiles,
      stores,
      userRoles: roles,
      filterStoreId: effectiveStoreId,
    });
    setRankingAccessories(accRanking);
    setStoreAccessoryMetrics(accMetrics);

    // 3. Formato compatível com o gráfico
    const legacyStats: any[] = phoneRanking.map((p) => ({
      uid: p.uid,
      nome: p.nome,
      role: p.role,
      totalVendas: p.totalVendas,
      qtdVendas: p.qtdCelulares,
      lucro: p.totalLucro,
      comissoes: p.comissoesVendas,
      osEntregues: 0,
    }));
    setRanking(legacyStats);
  }, [
    rankPeriod,
    storeId,
    rankCustomStart,
    rankCustomEnd,
    rankSpecificDay,
    isAdmin,
    activeStoreId,
    profiles,
    stores,
  ]);

  useEffect(() => {
    fetchRankingData();
  }, [fetchRankingData]);

  // Sincronização em tempo real (Vendas adicionadas, alteradas ou canceladas no caixa)
  useEffect(() => {
    const channel = supabase
      .channel("ranking_realtime_sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales" },
        () => {
          fetchRankingData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => {
          fetchRankingData();
        }
      )
      .subscribe();

    const handleSettingsChanged = () => {
      fetchRankingData();
    };
    window.addEventListener("ranking_patent_settings_changed", handleSettingsChanged);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("ranking_patent_settings_changed", handleSettingsChanged);
    };
  }, [fetchRankingData]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-6 w-6 text-yellow-500" />
            Ranking & Metas
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Acompanhe sua evolução, pódio mensal e patentes de vendas
          </p>
        </div>
      </div>

      <RankingTab
        rankPeriod={rankPeriod}
        setRankPeriod={setRankPeriod}
        rankSpecificDay={rankSpecificDay}
        setRankSpecificDay={setRankSpecificDay}
        isAdmin={isAdmin}
        storeId={storeId}
        setStoreId={setStoreId}
        stores={stores}
        ranking={ranking}
        rankingPhones={rankingPhones}
        rankingAccessories={rankingAccessories}
        storeAccessoryMetrics={storeAccessoryMetrics}
        currentRankPeriodLabel={currentRankPeriodLabel}
        currentStoreName={currentStoreName}
        activeStoreId={activeStoreId}
        currentUserId={user?.id}
      />
    </div>
  );
};

export default Ranking;
