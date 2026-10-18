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

interface AccessoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editAcc: any | null;
  accForm: {
    name: string;
    category: string;
    brand: string;
    quantity: string;
    min_quantity: string;
    cost_price: string;
    sale_price: string;
    store_id: string;
    description: string;
    justification: string;
  };
  setAccForm: React.Dispatch<React.SetStateAction<any>>;
  activeStoreId: string;
  storeMap: Map<string, string>;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
  loading: boolean;
}

export const AccessoryModal: React.FC<AccessoryModalProps> = ({
  open,
  onOpenChange,
  editAcc,
  accForm,
  setAccForm,
  activeStoreId,
  storeMap,
  onSubmit,
  loading,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {editAcc ? "Editar Acessório" : "Cadastrar Acessório"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome</Label>
              <Input
                value={accForm.name}
                onChange={(e) => setAccForm((f: any) => ({ ...f, name: e.target.value }))}
                placeholder="Carregador 20W"
                required
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select
                value={accForm.category}
                onValueChange={(v) => setAccForm((f: any) => ({ ...f, category: v }))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="carregador">Carregador</SelectItem>
                  <SelectItem value="cabo">Cabo</SelectItem>
                  <SelectItem value="capa">Capa</SelectItem>
                  <SelectItem value="pelicula">Película</SelectItem>
                  <SelectItem value="fone">Fone</SelectItem>
                  <SelectItem value="peca">Peça de Reposição</SelectItem>
                  <SelectItem value="ferramenta">Ferramenta</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Marca</Label>
              <Input
                value={accForm.brand}
                onChange={(e) => setAccForm((f: any) => ({ ...f, brand: e.target.value }))}
                placeholder="Apple, Samsung..."
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Input
                value={accForm.description}
                onChange={(e) =>
                  setAccForm((f: any) => ({ ...f, description: e.target.value }))
                }
                placeholder="USB-C 1m..."
                className="h-10"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Quantidade</Label>
              <Input
                type="number"
                min="0"
                value={accForm.quantity}
                onChange={(e) =>
                  setAccForm((f: any) => ({ ...f, quantity: e.target.value }))
                }
                required
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Qtd Mínima (alerta)</Label>
              <Input
                type="number"
                min="0"
                value={accForm.min_quantity}
                onChange={(e) =>
                  setAccForm((f: any) => ({ ...f, min_quantity: e.target.value }))
                }
                required
                className="h-10"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Custo (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={accForm.cost_price}
                onChange={(e) =>
                  setAccForm((f: any) => ({ ...f, cost_price: e.target.value }))
                }
                placeholder="25.00"
                required
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Venda (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={accForm.sale_price}
                onChange={(e) =>
                  setAccForm((f: any) => ({ ...f, sale_price: e.target.value }))
                }
                placeholder="50.00"
                className="h-10"
              />
            </div>
          </div>
          {editAcc && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-primary">Motivo da Alteração</Label>
              <Input
                value={accForm.justification}
                onChange={(e) =>
                  setAccForm((f: any) => ({ ...f, justification: e.target.value }))
                }
                placeholder="Ex: Correção de preço, ajuste de estoque..."
                required
                className="h-10 border-primary/30"
              />
            </div>
          )}
          <div className="space-y-1.5 grayscale opacity-60 pointer-events-none">
            <Label className="text-xs">Loja (Vinculada à Loja Ativa)</Label>
            <Input
              value={storeMap.get(activeStoreId || "") || ""}
              readOnly
              className="h-10"
            />
          </div>
          <Button
            type="submit"
            className="w-full h-11 font-semibold"
            disabled={loading || !activeStoreId}
          >
            {loading ? "Salvando..." : editAcc ? "Salvar Alterações" : "Cadastrar Acessório"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
