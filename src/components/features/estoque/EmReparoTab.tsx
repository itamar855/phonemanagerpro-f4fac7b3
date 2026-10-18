import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, AlertTriangle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface EmReparoTabProps {
  inRepair: Tables<"products">[];
  activeStoreId: string;
  storeMap: Map<string, string>;
  formatCurrency: (value: number) => string;
  setRepairProduct: (p: any) => void;
  setRepairModalOpen: (open: boolean) => void;
  setDefectsProduct: (p: Tables<"products">) => void;
  setDefectsList: (list: string[]) => void;
  setCustomDefect: (val: string) => void;
  setDefectsDialogOpen: (open: boolean) => void;
  loadHistory: (product: Tables<"products">) => void;
}

export const EmReparoTab: React.FC<EmReparoTabProps> = ({
  inRepair,
  activeStoreId,
  storeMap,
  formatCurrency,
  setRepairProduct,
  setRepairModalOpen,
  setDefectsProduct,
  setDefectsList,
  setCustomDefect,
  setDefectsDialogOpen,
  loadHistory,
}) => {
  if (inRepair.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Wrench className="h-10 w-10 mb-3 opacity-30" />
          <p className="font-medium text-sm">Nenhum aparelho em reparo</p>
          <p className="text-xs mt-1">Aparelhos enviados para reparo aparecem aqui</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {inRepair.map((p) => {
        const conditionLabel =
          p.condition === "new"
            ? "Novo"
            : p.condition === "refurbished"
            ? "Recondicionado"
            : p.condition === "seminovo_americano"
            ? "Seminovo (Americano)"
            : "Usado";

        return (
          <Card key={p.id} className="border-destructive/30 shadow-lg shadow-black/10 bg-destructive/5">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{p.name}</p>
                    <Badge className="text-[10px] bg-destructive/15 text-destructive border-destructive/20">
                      🔧 Em Reparo
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.brand} · {p.model} {p.capacity && `· ${p.capacity}`} {p.color && `· ${p.color}`} · {conditionLabel}
                    {p.imei && ` · IMEI: ${p.imei}`}
                  </p>
                  {p.defects && p.defects.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {p.defects.map((def: string, idx: number) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 font-medium"
                        >
                          ⚠️ {def}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {activeStoreId === "all" && (
                    <Badge
                      variant="outline"
                      className="text-[9px] mt-1 bg-muted/50 border-primary/20 text-primary"
                    >
                      {storeMap.get(p.store_id) || "—"}
                    </Badge>
                  )}
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <div>
                    <p className="text-xs text-muted-foreground">Custo atual</p>
                    <p className="font-display font-bold text-sm">
                      {formatCurrency(Number(p.cost_price))}
                    </p>
                  </div>
                  <Button
                    className="h-8 text-[11px] gap-1.5 bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => {
                      setRepairProduct(p as any);
                      setRepairModalOpen(true);
                    }}
                  >
                    <Wrench className="h-3.5 w-3.5" /> Gerenciar Reparo
                  </Button>
                  <Button
                    className="h-7 text-[10px] gap-1 bg-transparent text-muted-foreground hover:bg-muted"
                    onClick={() => {
                      setDefectsProduct(p);
                      setDefectsList(p.defects || []);
                      setCustomDefect("");
                      setDefectsDialogOpen(true);
                    }}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> Defeitos
                    {p.defects && p.defects.length > 0 && (
                      <span className="ml-0.5 px-1 py-0.5 text-[8px] bg-destructive text-destructive-foreground rounded-full leading-none font-bold">
                        {p.defects.length}
                      </span>
                    )}
                  </Button>
                  <Button
                    className="h-7 text-[10px] gap-1 bg-transparent text-muted-foreground hover:bg-muted"
                    onClick={() => loadHistory(p)}
                  >
                    Ver Histórico
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
