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
import type { Tables } from "@/integrations/supabase/types";

interface ProductEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editForm: {
    name: string;
    brand: string;
    model: string;
    imei: string;
    serial_number: string;
    cost_price: string;
    sale_price: string;
    store_id: string;
    condition: string;
    color: string;
    capacity: string;
    battery_percentage: string;
    justification: string;
    status: string;
  };
  setEditForm: React.Dispatch<React.SetStateAction<any>>;
  stores: Tables<"stores">[];
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
  loading: boolean;
}

export const ProductEditDialog: React.FC<ProductEditDialogProps> = ({
  open,
  onOpenChange,
  editForm,
  setEditForm,
  stores,
  onSubmit,
  loading,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Editar Aparelho</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f: any) => ({ ...f, name: e.target.value }))}
                required
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Marca</Label>
              <Select
                value={editForm.brand}
                onValueChange={(v) => setEditForm((f: any) => ({ ...f, brand: v }))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="iPhone">iPhone</SelectItem>
                  <SelectItem value="Xiaomi">Xiaomi</SelectItem>
                  <SelectItem value="Samsung">Samsung</SelectItem>
                  <SelectItem value="Motorola">Motorola</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Modelo</Label>
              <Input
                value={editForm.model}
                onChange={(e) => setEditForm((f: any) => ({ ...f, model: e.target.value }))}
                required
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Condição</Label>
              <Select
                value={editForm.condition}
                onValueChange={(v) => setEditForm((f: any) => ({ ...f, condition: v }))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Novo</SelectItem>
                  <SelectItem value="used">Usado</SelectItem>
                  <SelectItem value="refurbished">Recondicionado</SelectItem>
                  <SelectItem value="seminovo_americano">Seminovo (Americano)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Capacidade (GB)</Label>
              <Input
                value={editForm.capacity}
                onChange={(e) => setEditForm((f: any) => ({ ...f, capacity: e.target.value }))}
                placeholder="128"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cor</Label>
              <Input
                value={editForm.color}
                onChange={(e) => setEditForm((f: any) => ({ ...f, color: e.target.value }))}
                placeholder="Preto"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bateria (%)</Label>
              <Input
                type="number"
                value={editForm.battery_percentage}
                onChange={(e) =>
                  setEditForm((f: any) => ({ ...f, battery_percentage: e.target.value }))
                }
                placeholder="100"
                className="h-10"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">IMEI</Label>
            <Input
              value={editForm.imei}
              onChange={(e) => setEditForm((f: any) => ({ ...f, imei: e.target.value }))}
              className="h-10"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Custo (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={editForm.cost_price}
                onChange={(e) => setEditForm((f: any) => ({ ...f, cost_price: e.target.value }))}
                required
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Venda (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={editForm.sale_price}
                onChange={(e) => setEditForm((f: any) => ({ ...f, sale_price: e.target.value }))}
                className="h-10"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Loja</Label>
            <Select
              value={editForm.store_id}
              onValueChange={(v) => setEditForm((f: any) => ({ ...f, store_id: v }))}
            >
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status do Aparelho</Label>
            <Select
              value={editForm.status}
              onValueChange={(v) => setEditForm((f: any) => ({ ...f, status: v }))}
            >
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_stock">Em estoque</SelectItem>
                <SelectItem value="sold">Vendido</SelectItem>
                <SelectItem value="reserved">Reservado</SelectItem>
                <SelectItem value="repair">Em reparo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-primary">Motivo da Alteração</Label>
            <Input
              value={editForm.justification}
              onChange={(e) => setEditForm((f: any) => ({ ...f, justification: e.target.value }))}
              placeholder="Ex: Erro no cadastro, atualização de preço..."
              required
              className="h-10 border-primary/30"
            />
          </div>
          <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
            {loading ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
