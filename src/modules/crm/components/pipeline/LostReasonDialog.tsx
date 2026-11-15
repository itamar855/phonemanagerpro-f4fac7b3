import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { LOST_REASONS } from "../../lib/constants";

interface Props {
  open: boolean;
  dealTitle?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/** Perder exige motivo (regra também garantida no banco). */
export function LostReasonDialog({ open, dealTitle, onCancel, onConfirm }: Props) {
  const [choice, setChoice] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  useEffect(() => { if (open) { setChoice(null); setDetail(""); } }, [open]);
  const reason = [choice, detail.trim()].filter(Boolean).join(" — ");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Por que perdemos?</DialogTitle>
          <DialogDescription>{dealTitle ? `"${dealTitle}" vai para Perdido.` : "O negócio vai para Perdido."} O motivo entra nos relatórios.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Motivo da perda">
          {LOST_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={choice === r}
              onClick={() => setChoice(choice === r ? null : r)}
              className={cn(
                "min-h-[36px] rounded-full border px-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                choice === r ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-muted",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} placeholder="Detalhe (opcional, ou escreva outro motivo)" aria-label="Detalhe do motivo" />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button variant="destructive" disabled={!reason} onClick={() => onConfirm(reason)}>Marcar como perdido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
