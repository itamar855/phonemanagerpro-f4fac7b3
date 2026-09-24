import React from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check, X, Minus, CheckCircle2 } from "lucide-react";

export const CHECKLIST_ITEMS = [
  "Câmera Frontal",
  "Câmera Traseira",
  "Alto-falante",
  "Microfone",
  "Wi-Fi",
  "Bluetooth",
  "Sinal de Rede / Chip",
  "Touch Screen",
  "Display / LCD",
  "Botão Home / Biometria",
  "Botão Power",
  "Botões de Volume",
  "Conector de Carga",
  "Face ID / Reconhecimento Facial",
  "Sensor de Proximidade",
  "Bateria (Saúde/Carga)",
  "Carcaça Exterior",
  "Vidro Traseiro",
  "Parafusos do Fundo",
  "Gaveta do Chip"
];

export type CheckItemStatus = "ok" | "defeito" | "na" | "nao_testado";

export type ChecklistData = Record<string, CheckItemStatus>;

export const VISUAL_CHECKLIST_ITEMS = [
  "Display / LCD",
  "Botão Home / Biometria",
  "Botão Power",
  "Botões de Volume",
  "Carcaça Exterior",
  "Vidro Traseiro",
  "Parafusos do Fundo",
  "Gaveta do Chip"
];

interface OsChecklistProps {
  data: ChecklistData;
  onChange: (newData: ChecklistData) => void;
  title?: string;
  readonly?: boolean;
  deviceIsOff?: boolean;
}

export function OsChecklist({ data, onChange, title = "Checklist do Aparelho", readonly = false, deviceIsOff = false }: OsChecklistProps) {
  const handleChange = (item: string, status: CheckItemStatus) => {
    if (readonly) return;
    onChange({ ...data, [item]: status });
  };

  const handleMarkAllOk = () => {
    if (readonly) return;
    const updated: ChecklistData = { ...data };
    CHECKLIST_ITEMS.forEach((item) => {
      const isVisual = VISUAL_CHECKLIST_ITEMS.includes(item);
      if (!deviceIsOff || isVisual) {
        updated[item] = "ok";
      }
    });
    onChange(updated);
  };

  const getStatusColor = (status?: CheckItemStatus) => {
    switch (status) {
      case "ok": return "text-emerald-500 bg-emerald-500/10 border-emerald-500/30";
      case "defeito": return "text-destructive bg-destructive/10 border-destructive/30";
      case "na": return "text-muted-foreground bg-muted/60 border-border";
      default: return "text-muted-foreground/70 bg-muted/20 border-border/40";
    }
  };

  const getStatusLabel = (status?: CheckItemStatus) => {
    switch (status) {
      case "ok": return "✅ OK";
      case "defeito": return "❌ Defeito";
      case "na": return "N/A";
      default: return "Pendente";
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/70 p-3 sm:p-4 bg-card/95 w-full shadow-sm">
      <div className="flex items-center justify-between gap-2 flex-wrap pb-1 border-b border-border/40">
        <div>
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
            {title}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {readonly ? "Conferência do estado dos periféricos" : "Toque para alternar o status de cada item"}
          </p>
        </div>

        {!readonly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleMarkAllOk}
            className="h-7 px-2.5 text-[11px] font-medium gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 active:scale-95 transition-transform"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Marcar Todos OK
          </Button>
        )}
      </div>

      {readonly ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {CHECKLIST_ITEMS.map((item) => {
            const status = data[item] || "nao_testado";
            return (
              <div key={item} className="flex flex-col gap-1 p-2 rounded-lg border border-border/50 bg-muted/20">
                <span className="text-[10px] leading-tight text-muted-foreground font-medium truncate">{item}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold w-fit border ${getStatusColor(status)}`}>
                  {getStatusLabel(status)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {CHECKLIST_ITEMS.map((item) => {
            const value = data[item] || "nao_testado";
            const isVisual = VISUAL_CHECKLIST_ITEMS.includes(item);
            const isFieldDisabled = readonly || (deviceIsOff && !isVisual);

            return (
              <div 
                key={item} 
                className={`p-2 rounded-lg border transition-colors ${
                  isFieldDisabled 
                    ? "opacity-50 border-border/30 bg-muted/10" 
                    : value === "ok" 
                      ? "border-emerald-500/30 bg-emerald-500/5" 
                      : value === "defeito" 
                        ? "border-destructive/30 bg-destructive/5" 
                        : "border-border/60 bg-muted/15"
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <Label className="text-[11px] font-medium truncate" title={item}>
                    {item}
                  </Label>
                  {deviceIsOff && !isVisual && (
                    <span className="text-[9px] text-red-500 font-semibold uppercase tracking-wider shrink-0">
                      Desligado
                    </span>
                  )}
                </div>

                {/* Seletor Tátil Mobile de 1 Toque (Segmented Control) */}
                <div className="grid grid-cols-3 gap-1 bg-background/80 p-0.5 rounded-md border border-border/50">
                  <button
                    type="button"
                    disabled={isFieldDisabled}
                    onClick={() => handleChange(item, value === "ok" ? "nao_testado" : "ok")}
                    className={`h-7 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition-all active:scale-95 ${
                      value === "ok"
                        ? "bg-emerald-500 text-white font-bold shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Check className="h-3 w-3" /> OK
                  </button>

                  <button
                    type="button"
                    disabled={isFieldDisabled}
                    onClick={() => handleChange(item, value === "defeito" ? "nao_testado" : "defeito")}
                    className={`h-7 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition-all active:scale-95 ${
                      value === "defeito"
                        ? "bg-destructive text-white font-bold shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <X className="h-3 w-3" /> Defeito
                  </button>

                  <button
                    type="button"
                    disabled={isFieldDisabled}
                    onClick={() => handleChange(item, value === "na" ? "nao_testado" : "na")}
                    className={`h-7 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition-all active:scale-95 ${
                      value === "na"
                        ? "bg-muted-foreground text-background font-bold shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Minus className="h-3 w-3" /> N/A
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

