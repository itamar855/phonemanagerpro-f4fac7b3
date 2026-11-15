import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  dealTitle?: string;
  onCancel: () => void;
  /** value: o valor digitado, ou null para marcar ganho sem valor */
  onConfirm: (value: number | null) => void;
}

/** Ganhou sem valor? O valor é o que mostra para a Meta (e para você) qual anúncio dá dinheiro. */
export function WonValueDialog({ open, dealTitle, onCancel, onConfirm }: Props) {
  const [v, setV] = useState("");
  useEffect(() => { if (open) setV(""); }, [open]);
  const value = Number(v.replace(/\./g, "").replace(",", "."));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-emerald-600" /> Qual foi o valor da venda?</DialogTitle>
          <DialogDescription>
            {dealTitle ? `"${dealTitle}" vai para Ganho. ` : ""}Com o valor, o relatório e a Meta sabem quanto cada campanha faturou.
          </DialogDescription>
        </DialogHeader>
        <form id="won-value" onSubmit={(e) => { e.preventDefault(); if (value > 0) onConfirm(value); }}>
          <Input inputMode="decimal" autoFocus value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="R$ 0,00"
            aria-label="Valor da venda" className="h-12 text-lg" />
        </form>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onConfirm(null)}>Marcar sem valor</Button>
          <Button type="submit" form="won-value" disabled={!(value > 0)}>Salvar e marcar ganho</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
