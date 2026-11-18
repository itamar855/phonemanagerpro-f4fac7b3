import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TAG_COLOR_KEYS, TAG_DOTS } from "../../lib/labels";

const COLOR_NAME: Record<string, string> = {
  red: "Vermelho", orange: "Laranja", amber: "Âmbar", lime: "Lima", emerald: "Verde", cyan: "Ciano",
  blue: "Azul", indigo: "Anil", violet: "Roxo", pink: "Rosa", rose: "Rubi", slate: "Cinza",
};

/** Escolha da cor da etiqueta: bolinha + "Cor" (compacto ao lado do campo de nome). */
export function TagColorPicker({ value, onChange, label = "Cor da etiqueta", compact = false }: {
  value: string | null; onChange: (c: string) => void; label?: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${COLOR_NAME[value ?? ""] ?? "sem cor"}`}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground hover:bg-muted"
        >
          <span className={cn("h-4 w-4 rounded-full ring-1 ring-black/10", TAG_DOTS[value ?? ""] ?? "bg-muted-foreground")} />
          {!compact && <span>Cor</span>}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-6 gap-1" role="radiogroup" aria-label={label}>
          {TAG_COLOR_KEYS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={value === c}
              aria-label={COLOR_NAME[c] ?? c}
              title={COLOR_NAME[c] ?? c}
              onClick={() => { onChange(c); setOpen(false); }}
              className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
            >
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-white", TAG_DOTS[c])}>
                {value === c && <Check className="h-3.5 w-3.5" />}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
