import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface VendidosTabProps {
  soldProducts: Tables<"products">[];
  formatCurrency: (value: number) => string;
  loadHistory: (product: Tables<"products">) => void;
}

export const VendidosTab: React.FC<VendidosTabProps> = ({
  soldProducts,
  formatCurrency,
  loadHistory,
}) => {
  if (soldProducts.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Package className="h-10 w-10 mb-3 opacity-30" />
          <p className="font-medium text-sm">Nenhum aparelho vendido encontrado</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {soldProducts.map((p) => (
        <Card key={p.id} className="border-border/50 opacity-80">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm truncate">{p.name}</p>
                  <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">
                    Vendido
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {p.brand} · {p.model} · IMEI: {p.imei}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">Vendido por</p>
                <p className="font-display font-bold text-sm">
                  {formatCurrency(Number(p.sale_price || 0))}
                </p>
                <Button
                  className="h-7 text-[10px] mt-1 bg-transparent text-muted-foreground hover:bg-muted"
                  onClick={() => loadHistory(p)}
                >
                  Ver Histórico
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
