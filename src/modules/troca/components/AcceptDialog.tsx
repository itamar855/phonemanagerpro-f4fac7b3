import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { floorTo, formatBRL } from "../lib/calc";
import { parseMoney } from "../lib/priceList";

/** Pergunta por quanto a troca fechou (atalhos: menor, meio e teto da faixa). */
export function AcceptDialog({ open, onOpenChange, offerMin, offerMax, roundTo, busy, onConfirm }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  offerMin: number;
  offerMax: number;
  roundTo: number;
  busy?: boolean;
  onConfirm: (value: number) => void;
}) {
  const [text, setText] = useState("");
  useEffect(() => { if (open) setText(""); }, [open]);

  const mid = floorTo((offerMin + offerMax) / 2, roundTo);
  const quick = [...new Set([offerMin, mid, offerMax])];
  const value = parseMoney(text);
  const above = value !== null && value > offerMax;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Por quanto fechou?</DialogTitle>
          <DialogDescription>Valor que o cliente vai abater na compra.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {quick.map((v) => (
            <button key={v} type="button" onClick={() => setText(String(v))}
              className={cn("min-h-[48px] rounded-xl border text-sm font-semibold tabular-nums transition-colors",
                value === v ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-muted/60")}>
              {formatBRL(v)}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="troca-agreed">Outro valor (R$)</Label>
          <Input id="troca-agreed" inputMode="decimal" autoComplete="off" placeholder="Ex.: 1500"
            className="h-12 text-lg tabular-nums" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {above && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Acima do teto de {formatBRL(offerMax)}. Confirme com o gerente antes de fechar.
          </p>
        )}
        <DialogFooter>
          <Button className="h-12 w-full text-base" disabled={busy || value === null || value <= 0}
            onClick={() => value !== null && onConfirm(value)}>
            {busy ? "Salvando…" : value ? `Confirmar ${formatBRL(value)}` : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
