import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

interface ProductDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  justification: string;
  setJustification: (val: string) => void;
  onConfirmDelete: () => void | Promise<void>;
  loading: boolean;
}

export const ProductDeleteDialog: React.FC<ProductDeleteDialogProps> = ({
  open,
  onOpenChange,
  justification,
  setJustification,
  onConfirmDelete,
  loading,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Confirmar Exclusão
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Esta ação é permanente. Por favor, informe o motivo da exclusão para continuar.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Motivo da Exclusão</Label>
            <Input
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Ex: Item danificado, erro de entrada..."
              required
              className="h-10"
            />
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={!justification || loading}
              onClick={onConfirmDelete}
            >
              {loading ? "Excluindo..." : "Confirmar Exclusão"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
