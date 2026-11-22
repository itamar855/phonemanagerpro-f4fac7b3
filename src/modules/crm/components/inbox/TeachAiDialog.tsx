import { useEffect, useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { teachAi } from "../../api/ai";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  storeId: string;
  userId: string;
  conversationId: string;
  /** o que o cliente disse antes da resposta */
  question: string;
  /** o que a IA respondeu */
  aiAnswer: string;
}

/** Corrige uma resposta da IA ali mesmo: vira exemplo aprovado e, se quiser, uma regra fixa da loja. */
export function TeachAiDialog({ open, onOpenChange, storeId, userId, conversationId, question, aiAnswer }: Props) {
  const qc = useQueryClient();
  const [q, setQ] = useState(question);
  const [answer, setAnswer] = useState(aiAnswer);
  const [rule, setRule] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setQ(question); setAnswer(aiAnswer); setRule(""); }
  }, [open, question, aiAnswer]);

  const changed = answer.trim() && answer.trim() !== aiAnswer.trim();

  async function save() {
    setBusy(true);
    try {
      await teachAi({ storeId, userId, conversationId, question: q, answer, rule });
      qc.invalidateQueries({ queryKey: ["crm", "ai"] });
      toast.success(rule.trim() ? "Ensinado! A resposta e a regra já valem nos próximos atendimentos." : "Ensinado! A IA usa isso nos próximos casos parecidos.");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-violet-500" aria-hidden="true" /> Ensinar a IA</DialogTitle>
          <DialogDescription>Escreva como ela deveria ter respondido. Nada é enviado ao cliente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="teach-q">O cliente disse</Label>
            <Textarea id="teach-q" value={q} onChange={(e) => setQ(e.target.value)} rows={2} maxLength={500} className="text-base md:text-sm"
              placeholder="Ex.: meu celular caiu na água" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teach-a">Resposta certa</Label>
            <Textarea id="teach-a" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} maxLength={1000} className="text-base md:text-sm" />
            <p className="text-xs text-muted-foreground">A IA copia o jeito de responder em conversas parecidas.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teach-rule">Regra ou informação fixa (opcional)</Label>
            <Textarea id="teach-rule" value={rule} onChange={(e) => setRule(e.target.value)} rows={2} maxLength={500} className="text-base md:text-sm"
              placeholder="Ex.: Não trocamos bateria de Apple Watch. / Avaliação de aparelho molhado é grátis." />
            <p className="text-xs text-muted-foreground">Preço, serviço que faz ou não, prazo… Entra em “O que a IA sabe sobre a loja” e vale sempre.</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={save} disabled={busy || (!changed && !rule.trim())}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Ensinar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
