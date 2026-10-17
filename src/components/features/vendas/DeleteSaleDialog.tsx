import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

interface DeleteSaleDialogProps {
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  deleteItem: { id: string; type: "sale" | "pdv" } | null;
  justification: string;
  setJustification: (val: string) => void;
  handleDeleteSale: (item: { id: string; type: "sale" | "pdv" }, reason: string) => Promise<void>;
  loading: boolean;
}

export const DeleteSaleDialog: React.FC<DeleteSaleDialogProps> = ({
  deleteDialogOpen,
  setDeleteDialogOpen,
  deleteItem,
  justification,
  setJustification,
  handleDeleteSale,
  loading,
}) => {
  return (
    <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Confirmar Exclusão de Venda
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Esta ação é permanente. O produto voltará para o estoque e as transações vinculadas serão removidas.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Motivo da Exclusão</Label>
            <Input
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Ex: Erro no lançamento, cancelamento pelo cliente..."
              required
              className="h-10"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={!justification || loading}
              onClick={async () => {
                if (deleteItem) {
                  await handleDeleteSale(deleteItem, justification);
                  setDeleteDialogOpen(false);
                }
              }}
            >
              {loading ? "Excluindo..." : "Confirmar Exclusão"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
