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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRightLeft } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface ProductTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transferProduct: Tables<"products"> | null;
  storeMap: Map<string, string>;
  stores: Tables<"stores">[];
  transferStoreId: string;
  setTransferStoreId: (id: string) => void;
  justification: string;
  setJustification: (val: string) => void;
  onTransfer: () => void | Promise<void>;
  loading: boolean;
}

export const ProductTransferDialog: React.FC<ProductTransferDialogProps> = ({
  open,
  onOpenChange,
  transferProduct,
  storeMap,
  stores,
  transferStoreId,
  setTransferStoreId,
  justification,
  setJustification,
  onTransfer,
  loading,
}) => {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" /> Transferir Aparelho
          </DialogTitle>
        </DialogHeader>
        {transferProduct && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
              <p className="font-semibold">{transferProduct.name}</p>
              <p className="text-muted-foreground">
                {transferProduct.brand} · {transferProduct.model}
              </p>
              <p className="text-muted-foreground">
                Loja atual:{" "}
                <span className="font-medium text-foreground">
                  {storeMap.get(transferProduct.store_id)}
                </span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Transferir para</Label>
              <Select value={transferStoreId} onValueChange={setTransferStoreId}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecione a loja destino" />
                </SelectTrigger>
                <SelectContent>
                  {stores
                    .filter((s) => s.id !== transferProduct.store_id)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-primary">Motivo da Transferência</Label>
              <Input
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Ex: Necessidade de estoque na outra loja"
                required
                className="h-10 border-primary/30"
              />
            </div>
            <Button
              onClick={onTransfer}
              className="w-full h-11 font-semibold"
              disabled={loading || !transferStoreId}
            >
              {loading ? "Transferindo..." : "Confirmar Transferência"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
