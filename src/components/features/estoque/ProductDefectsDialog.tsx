import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export const PREDEFINED_DEFECTS = [
  "Câmera Frontal com defeito",
  "Câmera Traseira com defeito",
  "Tela com manchas/riscos",
  "Touch travando",
  "Bateria viciada",
  "Não carrega",
  "Wi-Fi/Bluetooth com falha",
  "Alto-falante com chiado",
  "Face ID/Touch ID com defeito",
  "Botão Power/Volume com defeito",
  "Vidro traseiro quebrado",
  "Carcaça amassada/riscada",
];

interface ProductDefectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defectsProduct: Tables<"products"> | null;
  defectsList: string[];
  setDefectsList: React.Dispatch<React.SetStateAction<string[]>>;
  customDefect: string;
  setCustomDefect: (val: string) => void;
  onSaveDefects: () => void | Promise<void>;
  loading: boolean;
}

export const ProductDefectsDialog: React.FC<ProductDefectsDialogProps> = ({
  open,
  onOpenChange,
  defectsProduct,
  defectsList,
  setDefectsList,
  customDefect,
  setCustomDefect,
  onSaveDefects,
  loading,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Gerenciar Defeitos do Aparelho
          </DialogTitle>
        </DialogHeader>
        {defectsProduct && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
              <p className="font-semibold">{defectsProduct.name}</p>
              <p className="text-muted-foreground">
                {defectsProduct.brand} · {defectsProduct.model}{" "}
                {defectsProduct.capacity && `· ${defectsProduct.capacity}`}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Defeitos Ativos</Label>
              {defectsList.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Nenhum defeito registrado.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {defectsList.map((def, idx) => (
                    <Badge
                      key={idx}
                      variant="destructive"
                      className="text-xs gap-1 py-1 px-2.5 bg-destructive hover:bg-destructive"
                    >
                      {def}
                      <button
                        type="button"
                        className="ml-1 hover:text-white/80 font-bold"
                        onClick={() => {
                          setDefectsList(defectsList.filter((_, i) => i !== idx));
                        }}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <hr className="border-border/50" />

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Defeitos Comuns (Clique para adicionar)</Label>
              <div className="flex flex-wrap gap-1.5">
                {PREDEFINED_DEFECTS.map((def) => {
                  const active = defectsList.includes(def);
                  return (
                    <button
                      key={def}
                      type="button"
                      disabled={active}
                      onClick={() => setDefectsList([...defectsList, def])}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        active
                          ? "bg-muted text-muted-foreground border-border cursor-not-allowed"
                          : "bg-background text-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {def}
                    </button>
                  );
                })}
              </div>
            </div>

            <hr className="border-border/50" />

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Outro Defeito (Personalizado)</Label>
              <div className="flex gap-2">
                <Input
                  value={customDefect}
                  onChange={(e) => setCustomDefect(e.target.value)}
                  placeholder="Ex: Câmera com foco ruim, traseira trincada..."
                  className="h-9 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (customDefect.trim()) {
                        if (!defectsList.includes(customDefect.trim())) {
                          setDefectsList([...defectsList, customDefect.trim()]);
                        }
                        setCustomDefect("");
                      }
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={() => {
                    if (customDefect.trim()) {
                      if (!defectsList.includes(customDefect.trim())) {
                        setDefectsList([...defectsList, customDefect.trim()]);
                      }
                      setCustomDefect("");
                    }
                  }}
                  className="h-9 px-3 text-xs"
                >
                  Adicionar
                </Button>
              </div>
            </div>

            <Button
              onClick={onSaveDefects}
              className="w-full h-10 mt-2 font-semibold"
              disabled={loading}
            >
              {loading ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
