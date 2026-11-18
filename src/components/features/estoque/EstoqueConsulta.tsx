import { useEffect, useMemo, useState } from "react";
import { Cpu, Eye, Package, Search, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { matchesStock, splitStock, type ConsultaAccessory, type ConsultaProduct } from "./consultaRules";

const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// mesmos nomes da tabela de aparelhos (AparelhosTable)
const CONDITION: Record<string, string> = { new: "Novo", used: "Usado", refurbished: "Recondicionado", seminovo_americano: "Seminovo (Americano)" };

/**
 * Estoque de OUTRA loja, só para consulta (funcionário vê se a outra loja tem o aparelho/acessório).
 * Sem custo, sem editar, vender, transferir ou dar entrada — a RLS também só deixa alterar a própria loja.
 */
export function EstoqueConsulta({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [products, setProducts] = useState<ConsultaProduct[]>([]);
  const [accessories, setAccessories] = useState<ConsultaAccessory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      supabase.from("products")
        .select("id, name, brand, model, color, capacity, battery_percentage, condition, sale_price, product_type")
        .eq("store_id", storeId).eq("status", "in_stock").order("name"),
      supabase.from("accessories" as never)
        .select("id, name, brand, category, quantity, sale_price")
        .eq("store_id", storeId).gt("quantity", 0).order("name"),
    ]).then(([p, a]) => {
      if (!alive) return;
      if (p.error || a.error) setError((p.error ?? a.error)!.message);
      setProducts((p.data ?? []) as ConsultaProduct[]);
      setAccessories((a.data ?? []) as unknown as ConsultaAccessory[]);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [storeId]);

  const { devices, parts } = useMemo(() => splitStock(products.filter((p) => matchesStock(p, search))), [products, search]);
  const accs = useMemo(() => accessories.filter((a) => matchesStock(a, search)), [accessories, search]);

  return (
    <div className="space-y-3">
      <div role="status" className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-sm">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
        <p>
          <span className="font-semibold">Estoque da {storeName} — só consulta.</span>{" "}
          <span className="text-muted-foreground">Para vender ou transferir um item daqui, fale com a {storeName} ou com o administrador.</span>
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Buscar no estoque da ${storeName}...`} className="h-10 pl-9" aria-label="Buscar" />
      </div>

      {error && <p className="text-sm text-destructive">Não foi possível carregar: {error}</p>}

      <Tabs defaultValue="aparelhos">
        <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b border-border/50 bg-transparent sm:w-auto">
          <TabsTrigger value="aparelhos" className="gap-2 rounded-none bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary">
            <Package className="h-4 w-4" /> Aparelhos ({devices.length})
          </TabsTrigger>
          <TabsTrigger value="acessorios" className="gap-2 rounded-none bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary">
            <Zap className="h-4 w-4" /> Acessórios ({accs.length})
          </TabsTrigger>
          <TabsTrigger value="pecas" className="gap-2 rounded-none bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary">
            <Cpu className="h-4 w-4" /> Peças ({parts.length})
          </TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="mt-4 space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : (
          <>
            <TabsContent value="aparelhos" className="mt-3">
              <StockList empty="Nenhum aparelho em estoque." items={devices.map((p) => ({
                id: p.id,
                title: [p.name, p.model && !p.name.includes(p.model) ? p.model : null].filter(Boolean).join(" "),
                details: [p.capacity, p.color, p.battery_percentage != null ? `Bateria ${p.battery_percentage}%` : null].filter(Boolean).join(" · "),
                badge: p.condition ? CONDITION[p.condition] ?? "Usado" : null,
                price: brl(p.sale_price),
              }))} />
            </TabsContent>
            <TabsContent value="acessorios" className="mt-3">
              <StockList empty="Nenhum acessório em estoque." items={accs.map((a) => ({
                id: a.id, title: a.name, details: [a.brand, `${a.quantity} un.`].filter(Boolean).join(" · "), badge: null, price: brl(a.sale_price),
              }))} />
            </TabsContent>
            <TabsContent value="pecas" className="mt-3">
              <StockList empty="Nenhuma peça em estoque." items={parts.map((p) => ({
                id: p.id, title: p.name, details: [p.brand, p.model].filter(Boolean).join(" · "), badge: null, price: brl(p.sale_price),
              }))} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function StockList({ items, empty }: { items: { id: string; title: string; details: string; badge: string | null; price: string }[]; empty: string }) {
  if (!items.length) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border/50 rounded-lg border border-border/60 bg-card">
      {items.map((i) => (
        <li key={i.id} className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 truncate text-sm font-medium">
              <span className="truncate">{i.title}</span>
              {i.badge && <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">{i.badge}</Badge>}
            </div>
            {i.details && <p className="truncate text-xs text-muted-foreground">{i.details}</p>}
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{i.price}</span>
        </li>
      ))}
    </ul>
  );
}
