import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CreditCard, Receipt } from "lucide-react";
import { CashEntry, formatCurrency } from "./types";

interface CashActionModalsProps {
  // Abrir Caixa
  openDialog: boolean;
  setOpenDialog: (open: boolean) => void;
  openForm: { amount: string; note: string; receipt: File | null };
  setOpenForm: React.Dispatch<React.SetStateAction<{ amount: string; note: string; receipt: File | null }>>;
  handleOpenRegister: () => Promise<void>;

  // Confirmar Lançamento
  confirmDialog: boolean;
  setConfirmDialog: (open: boolean) => void;
  confirmEntry: CashEntry | null;
  confirmFile: File | null;
  setConfirmFile: (file: File | null) => void;
  confirmFiles?: File[];
  setConfirmFiles?: React.Dispatch<React.SetStateAction<File[]>> | ((files: File[]) => void);
  confirmOrderFile: File | null;
  setConfirmOrderFile: (file: File | null) => void;
  handleConfirmEntry: (fromDetailModal: boolean) => Promise<void>;

  // Fechar Caixa
  closeDialog: boolean;
  setCloseDialog: (open: boolean) => void;
  closeForm: { amount: string; note: string; reason: string; receipt: File | null };
  setCloseForm: React.Dispatch<React.SetStateAction<{ amount: string; note: string; reason: string; receipt: File | null }>>;
  handleCloseRegister: () => Promise<void>;
  isBlind: boolean;
  expectedCash: number;
  totalPix: number;
  totalCard: number;
  totalTotal: number;
  difference: number;

  // Sangria
  sangriaDialog: boolean;
  setSangriaDialog: (open: boolean) => void;
  sangriaForm: { amount: string; description: string };
  setSangriaForm: React.Dispatch<React.SetStateAction<{ amount: string; description: string }>>;
  handleSangria: () => Promise<void>;

  // Novo Lançamento
  entryDialog: boolean;
  setEntryDialog: (open: boolean) => void;
  entryForm: { type: "entrada" | "saida"; amount: string; description: string; payment_method: string };
  setEntryForm: React.Dispatch<React.SetStateAction<{ type: "entrada" | "saida"; amount: string; description: string; payment_method: string }>>;
  handleEntry: () => Promise<void>;

  // Bloqueio de Fechamento
  blockCloseDialog: boolean;
  setBlockCloseDialog: (open: boolean) => void;
  pendingCount: number;

  // Justificativa
  justDialogOpened: boolean;
  setJustDialogOpened: (open: boolean) => void;
  justification: string;
  setJustification: (val: string) => void;
  pendingAction: { type: "delete" | "unconfirm" | "reopen"; id: string } | null;
  setPendingAction: (action: { type: "delete" | "unconfirm" | "reopen"; id: string } | null) => void;
  handleDeleteEntry: (id: string, reason: string) => Promise<void>;
  handleUnconfirmEntry: (id: string, reason: string) => Promise<void>;
  handleReopenRegister: (id: string, reason: string) => Promise<void>;

  loading: boolean;
}

export const CashActionModals: React.FC<CashActionModalsProps> = ({
  openDialog,
  setOpenDialog,
  openForm,
  setOpenForm,
  handleOpenRegister,

  confirmDialog,
  setConfirmDialog,
  confirmEntry,
  confirmFile,
  setConfirmFile,
  confirmFiles,
  setConfirmFiles,
  confirmOrderFile,
  setConfirmOrderFile,
  handleConfirmEntry,

  closeDialog,
  setCloseDialog,
  closeForm,
  setCloseForm,
  handleCloseRegister,
  isBlind,
  expectedCash,
  totalPix,
  totalCard,
  totalTotal,
  difference,

  sangriaDialog,
  setSangriaDialog,
  sangriaForm,
  setSangriaForm,
  handleSangria,

  entryDialog,
  setEntryDialog,
  entryForm,
  setEntryForm,
  handleEntry,

  blockCloseDialog,
  setBlockCloseDialog,
  pendingCount,

  justDialogOpened,
  setJustDialogOpened,
  justification,
  setJustification,
  pendingAction,
  setPendingAction,
  handleDeleteEntry,
  handleUnconfirmEntry,
  handleReopenRegister,

  loading,
}) => {
  return (
    <>
      {/* Abrir Caixa */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Abrir Caixa</DialogTitle>
          <div className="space-y-4 mt-2">
            <Label className="text-xs">Fundo inicial (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={openForm.amount}
              onChange={(e) => setOpenForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0.00"
            />
            <div className="space-y-2">
              <Label className="text-xs">Comprovante</Label>
              <Input
                type="file"
                onChange={(e) => setOpenForm((f) => ({ ...f, receipt: e.target.files?.[0] || null }))}
              />
            </div>
            <Button className="w-full" onClick={handleOpenRegister} disabled={loading}>
              Abrir Caixa
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar Lançamento */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Confirmar Lançamento</DialogTitle>
          <div className="space-y-4 mt-2">
            <p className="text-xs">
              {confirmEntry?.description} - {confirmEntry && formatCurrency(Number(confirmEntry.amount))}
            </p>
            {(() => {
              const isCash = confirmEntry?.payment_method === "dinheiro";
              const currentFilesCount = confirmFiles ? confirmFiles.length : (confirmFile ? 1 : 0);

              return (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <CreditCard className="h-3 w-3" /> Comprovante de Pagamento
                        {!isCash && <span className="text-destructive">*</span>}
                      </span>
                      {isCash ? (
                        <span className="text-[10px] text-emerald-600 font-medium">
                          (Opcional para dinheiro em espécie)
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          (Permite múltiplos)
                        </span>
                      )}
                    </Label>
                    <Input
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (setConfirmFiles) setConfirmFiles(files);
                        setConfirmFile(files[0] || null);
                      }}
                    />
                    {confirmFiles && confirmFiles.length > 1 && (
                      <p className="text-[10px] text-primary font-medium">
                        {confirmFiles.length} comprovantes selecionados
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1 text-blue-500">
                      <Receipt className="h-3 w-3" /> Comprovante do Pedido ao Fornecedor (opcional)
                    </Label>
                    <Input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => setConfirmOrderFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => handleConfirmEntry(false)}
                    disabled={loading || (!isCash && currentFilesCount === 0)}
                  >
                    {loading ? "Confirmando..." : "Confirmar"}
                  </Button>
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Fechar Caixa */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Fechar Caixa</DialogTitle>
          <div className="space-y-4 mt-2">
            {!isBlind && (
              <div className="space-y-1 bg-muted/30 p-3 rounded-lg border border-border/50">
                <div className="flex justify-between text-[10px] uppercase text-muted-foreground font-bold">
                  <span>Dinheiro (Gaveta):</span>
                  <span>{formatCurrency(expectedCash)}</span>
                </div>
                <div className="flex justify-between text-[10px] uppercase text-muted-foreground font-bold border-b pb-1">
                  <span>PIX e Cartão:</span>
                  <span>{formatCurrency(totalPix + totalCard)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold pt-1 text-primary">
                  <span>Total Geral Esperado:</span>
                  <span>{formatCurrency(totalTotal)}</span>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Valor Total Informado (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={closeForm.amount}
                onChange={(e) => setCloseForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
              />
              {!isBlind && (
                <p
                  className={`text-xs font-semibold ${
                    Math.abs(difference) < 0.1 ? "text-primary" : "text-destructive"
                  }`}
                >
                  Diferença: {formatCurrency(difference)}
                </p>
              )}
            </div>
            {Math.abs(difference) > 0.1 && (
              <Textarea
                value={closeForm.reason}
                onChange={(e) => setCloseForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Motivo da diferença..."
                className="min-h-[60px]"
              />
            )}
            <div className="space-y-2">
              <Label className="text-xs">Comprovante</Label>
              <Input
                type="file"
                onChange={(e) => setCloseForm((f) => ({ ...f, receipt: e.target.files?.[0] || null }))}
              />
            </div>
            <Button
              className="w-full bg-destructive text-white hover:bg-destructive/90"
              onClick={handleCloseRegister}
              disabled={loading || !closeForm.amount}
            >
              Fechar Caixa
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sangria */}
      <Dialog open={sangriaDialog} onOpenChange={setSangriaDialog}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Realizar Sangria</DialogTitle>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor da Sangria (Dinheiro)</Label>
              <Input
                type="number"
                step="0.01"
                value={sangriaForm.amount}
                onChange={(e) => setSangriaForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição / Destino</Label>
              <Input
                value={sangriaForm.description}
                onChange={(e) => setSangriaForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ex: Retirada para o banco, pagamento fornecedor..."
              />
            </div>
            <Button
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white"
              onClick={handleSangria}
              disabled={loading || !sangriaForm.amount}
            >
              Confirmar Sangria
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Novo Lançamento */}
      <Dialog open={entryDialog} onOpenChange={setEntryDialog}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Novo Lançamento</DialogTitle>
          <div className="space-y-4 mt-2">
            <Select
              value={entryForm.type}
              onValueChange={(v) => setEntryForm((f) => ({ ...f, type: v as any }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="saida">Saída</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={entryForm.description}
              onChange={(e) => setEntryForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descrição"
            />
            <Input
              type="number"
              step="0.01"
              value={entryForm.amount}
              onChange={(e) => setEntryForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="Valor"
            />
            <Button className="w-full" onClick={handleEntry} disabled={loading}>
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bloqueio de Fechamento */}
      <Dialog open={blockCloseDialog} onOpenChange={setBlockCloseDialog}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Fechamento Bloqueado
          </DialogTitle>
          <div className="space-y-4 mt-2 text-sm">
            <p>Você não pode fechar o caixa pois existem pendências ou divergências financeiras:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              {pendingCount > 0 && (
                <li>
                  Existem <strong>{pendingCount}</strong> lançamentos pendentes de confirmação.
                </li>
              )}
              {Math.abs(difference) > 0.01 && (
                <li>
                  Há uma diferença de caixa no valor de <strong>{formatCurrency(difference)}</strong>.
                </li>
              )}
            </ul>
            <p className="font-semibold text-primary mt-4">
              Apenas um administrador pode forçar o fechamento neste estado.
            </p>
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={() => setBlockCloseDialog(false)}>Entendi</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Justificativa de Ação (Excluir, Desconfirmar, Reabrir) */}
      <Dialog open={justDialogOpened} onOpenChange={setJustDialogOpened}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Justificar Ação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground italic">
              {pendingAction?.type === "delete"
                ? "Esta exclusão é permanente."
                : pendingAction?.type === "unconfirm"
                ? "Este lançamento voltará a ser pendente."
                : "O caixa será reaberto."}
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-primary">Campo Obrigatório: Motivo</Label>
              <Input
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Informe o motivo desta alteração..."
                required
                className="h-10"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setJustDialogOpened(false)}>
                Cancelar
              </Button>
              <Button
                variant={pendingAction?.type === "delete" ? "destructive" : "default"}
                className="flex-1"
                disabled={!justification || loading}
                onClick={async () => {
                  if (!pendingAction) return;
                  if (pendingAction.type === "delete") await handleDeleteEntry(pendingAction.id, justification);
                  if (pendingAction.type === "unconfirm") await handleUnconfirmEntry(pendingAction.id, justification);
                  if (pendingAction.type === "reopen") await handleReopenRegister(pendingAction.id, justification);
                  setJustDialogOpened(false);
                  setPendingAction(null);
                }}
              >
                {loading ? "Processando..." : "Confirmar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
