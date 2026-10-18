import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Tables } from "@/integrations/supabase/types";

interface ProductHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  historyProduct: Tables<"products"> | null;
  productHistory: any[];
  formatCurrency: (value: number) => string;
}

export const ProductHistoryDialog: React.FC<ProductHistoryDialogProps> = ({
  open,
  onOpenChange,
  historyProduct,
  productHistory,
  formatCurrency,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Histórico do Aparelho</DialogTitle>
        </DialogHeader>
        {historyProduct && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
              <p className="font-semibold">{historyProduct.name}</p>
              <p className="text-muted-foreground">
                {historyProduct.imei && `IMEI: ${historyProduct.imei}`} · Custo:{" "}
                {formatCurrency(Number(historyProduct.cost_price))}
              </p>
            </div>
            <div className="space-y-3 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
              {productHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center">Nenhum registro encontrado.</p>
              ) : (
                productHistory.map((h) => (
                  <div
                    key={h.id}
                    className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                  >
                    <div className="flex items-center justify-center w-5 h-5 rounded-full border border-primary bg-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow"></div>
                    <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.25rem)] bg-card p-3 rounded border shadow-sm text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-primary">{h.action}</span>
                        <span className="text-muted-foreground text-[10px]">
                          {new Date(h.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-muted-foreground">
                        {h.notes && <p className="mb-0.5">{h.notes}</p>}
                        {h.old_cost !== null && h.new_cost !== null && (
                          <p>
                            Custo: <span className="line-through">{formatCurrency(h.old_cost)}</span>{" "}
                            →{" "}
                            <span className="font-medium text-foreground">
                              {formatCurrency(h.new_cost)}
                            </span>
                          </p>
                        )}
                        {h.old_cost === null && h.new_cost !== null && (
                          <p>
                            Custo:{" "}
                            <span className="font-medium text-foreground">
                              {formatCurrency(h.new_cost)}
                            </span>
                          </p>
                        )}
                      </div>
                      <div className="text-[10px] font-medium text-muted-foreground mt-2 border-t pt-1 border-border/50">
                        {h.created_by_profile?.display_name || "Sistema"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
