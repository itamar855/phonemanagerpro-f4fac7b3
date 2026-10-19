import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, AlertCircle, FileWarning, CheckCircle2, X } from "lucide-react";

interface OSFinancialConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  orderNumber: number;
  missingItems: string[];
  onConfirmAdminBypass: () => void | Promise<void>;
  loading?: boolean;
}

export const OSFinancialConfirmDialog: React.FC<OSFinancialConfirmDialogProps> = ({
  open,
  onOpenChange,
  isAdmin,
  orderNumber,
  missingItems,
  onConfirmAdminBypass,
  loading = false,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5 space-y-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            {isAdmin ? (
              <>
                <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
                <span>Autorização Administrativa (OS #{orderNumber})</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                <span>Comprovantes Obrigatórios (OS #{orderNumber})</span>
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {isAdmin ? (
          /* ── Visão do Administrador: Autorização por Exceção ── */
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 space-y-1.5">
              <p className="font-semibold text-xs flex items-center gap-1.5">
                <FileWarning className="h-4 w-4 shrink-0 text-amber-500" />
                Atenção Administrador: Faltam comprovantes anexados!
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Esta OS possui as seguintes pendências de documentação antes do fechamento:
              </p>
            </div>

            {/* Lista de comprovantes faltantes */}
            <div className="space-y-1.5 bg-muted/40 p-2.5 rounded-lg border border-border/40">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">
                Pendências Encontradas:
              </span>
              <ul className="space-y-1 text-[11px]">
                {missingItems.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
                    <span className="font-bold shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Como <strong>Administrador</strong>, você tem a permissão especial de autorizar e confirmar esta transação no Caixa sem os comprovantes. Deseja confirmar agora por exceção?
            </p>

            <DialogFooter className="flex-row justify-end gap-2 pt-2 border-t border-border/40">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={loading}
                className="h-8 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onConfirmAdminBypass}
                disabled={loading}
                className="h-8 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white gap-1.5 shadow"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {loading ? "Confirmando..." : "Confirmar como Administrador"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* ── Visão de Técnicos, Vendedores e Gerentes: Bloqueio Educativo ── */
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 space-y-1.5">
              <p className="font-semibold text-xs flex items-center gap-1.5">
                <FileWarning className="h-4 w-4 shrink-0 text-red-500" />
                Bloqueado: Não é permitido entregar a OS nem confirmar sem os comprovantes!
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Para manter a integridade e evitar furos no Caixa, técnicos, vendedores e gerentes devem anexar todos os comprovantes necessários antes de concluir o atendimento.
              </p>
            </div>

            {/* Lista de comprovantes faltantes */}
            <div className="space-y-1.5 bg-muted/40 p-2.5 rounded-lg border border-border/40">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">
                Pendências Obrigatórias desta OS:
              </span>
              <ul className="space-y-1.5 text-[11px]">
                {missingItems.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 text-red-600 dark:text-red-400 font-medium bg-red-500/5 p-1.5 rounded border border-red-500/20">
                    <span className="font-bold shrink-0">❌</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              💡 <strong>Como resolver:</strong> Feche este aviso, abra os detalhes desta OS e anexe o comprovante de pagamento do serviço e os comprovantes das peças. Assim que anexados, a OS poderá ser entregue e confirmada!
            </p>

            <DialogFooter className="pt-2 border-t border-border/40">
              <Button
                type="button"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="w-full h-8 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Entendi, vou anexar os comprovantes
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
