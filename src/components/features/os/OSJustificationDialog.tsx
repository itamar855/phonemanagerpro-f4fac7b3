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
import { AlertCircle } from "lucide-react";

interface OSJustificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionType: "delete" | "status" | "transfer" | "update" | null;
  justification: string;
  setJustification: (value: string) => void;
  loading: boolean;
  onConfirm: () => void | Promise<void>;
}

export const OSJustificationDialog: React.FC<OSJustificationDialogProps> = ({
  open,
  onOpenChange,
  actionType,
  justification,
  setJustification,
  loading,
  onConfirm,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            {actionType === "delete" ? "Excluir Ordem de Serviço" : "Justificar Mudança de Status"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            {actionType === "delete"
              ? "Esta ação excluirá a OS permanentemente."
              : "Você está alterando o status da OS para uma fase crítica."}
            <br />
            Por favor, informe o motivo desta alteração:
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-primary">Justificativa / Motivo</Label>
            <Input
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Descreva o motivo da alteração..."
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
              variant={actionType === "delete" ? "destructive" : "default"}
              className="flex-1"
              disabled={!justification || loading}
              onClick={onConfirm}
            >
              {loading
                ? "Processando..."
                : actionType === "delete"
                ? "Excluir OS"
                : "Confirmar Mudança de Status"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
