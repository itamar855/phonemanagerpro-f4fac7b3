import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, Plus, Pencil, Trash2 } from "lucide-react";

const categoryLabels: Record<string, string> = {
  carregador: "Carregador", cabo: "Cabo", capa: "Capa", pelicula: "Película",
  fone: "Fone", peca: "Peça", ferramenta: "Ferramenta", outro: "Outro",
};

interface AcessoriosTableProps {
  filteredAccessories: any[];
  activeStoreId: string | null;
  storeMap: Map<string, string>;
  formatCurrency: (v: number) => string;
  openAccDialog: (a?: any) => void;
  setDeleteId: (id: string) => void;
  setDeleteType: (t: "product" | "accessory") => void;
  setJustification: (j: string) => void;
  setDeleteDialogOpen: (open: boolean) => void;
}

export const AcessoriosTable: React.FC<AcessoriosTableProps> = ({
  filteredAccessories, activeStoreId, storeMap, formatCurrency,
  openAccDialog, setDeleteId, setDeleteType, setJustification, setDeleteDialogOpen,
}) => {
  return (
    <>
      <div className="flex justify-end">
        <Button className="gap-2 h-10" onClick={() => openAccDialog()} disabled={activeStoreId === "all"}>
          <Plus className="h-4 w-4" /> Novo Acessório
        </Button>
      </div>

      {filteredAccessories.length > 0 ? (
        <div className="space-y-2">
          {filteredAccessories.map((a) => {
            const isLow = a.quantity <= a.min_quantity;
            const margin = a.sale_price ? Number(a.sale_price) - Number(a.cost_price) : null;
            return (
              <Card key={a.id} className={`border-border/50 shadow-lg shadow-black/10 ${isLow ? "border-yellow-500/30" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{a.name}</p>
                        <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                          {categoryLabels[a.category] || a.category}
                        </Badge>
                        {isLow && (
                          <Badge className="text-[10px] bg-yellow-500/15 text-yellow-500 border-yellow-500/20">
                            Estoque baixo
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {a.brand && `${a.brand} · `}
                        {activeStoreId === "all" ? (
                          <Badge variant="outline" className="text-[9px] bg-muted/50 border-primary/20 text-primary">
                            {storeMap.get(a.store_id) || "—"}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">{storeMap.get(a.store_id) || "—"}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{a.description}</p>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <div>
                        <p className="text-xs text-muted-foreground">Qtd</p>
                        <p className={`font-display font-bold text-lg ${isLow ? "text-yellow-500" : "text-primary"}`}>{a.quantity}</p>
                        <p className="text-xs text-muted-foreground">Custo: {formatCurrency(Number(a.cost_price))}</p>
                        {margin !== null && (
                          <p className={`text-xs font-medium ${margin >= 0 ? "text-primary" : "text-destructive"}`}>
                            +{formatCurrency(margin)}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button className="h-7 w-7 p-0 bg-transparent text-foreground hover:bg-muted" onClick={() => openAccDialog(a)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => { setDeleteId(a.id); setDeleteType("accessory"); setJustification(""); setDeleteDialogOpen(true); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Zap className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium text-sm">Nenhum acessório encontrado</p>
            <p className="text-xs mt-1">Cadastre carregadores, cabos, capas e peças</p>
          </CardContent>
        </Card>
      )}
    </>
  );
};
