import React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { CashRegister, CashEntry, formatCurrency, getMistoLabel, paymentLabels } from "./types";
import { openComprovante } from "@/lib/storageHelper";

interface CashRegisterDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewRegister: CashRegister | null;
  historyEntries: CashEntry[];
  loadingHistoryEntries: boolean;
}

export const CashRegisterDetailModal: React.FC<CashRegisterDetailModalProps> = ({
  open,
  onOpenChange,
  viewRegister,
  historyEntries,
  loadingHistoryEntries,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogTitle>Detalhes do Caixa Fechado</DialogTitle>
        {viewRegister && (
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/20 p-4 rounded-lg border">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Abertura</p>
                <p className="font-medium text-sm">{new Date(viewRegister.opened_at).toLocaleString("pt-BR")}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Fechamento</p>
                <p className="font-medium text-sm">{viewRegister.closed_at ? new Date(viewRegister.closed_at).toLocaleString("pt-BR") : "-"}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Usuário</p>
                <p className="font-medium text-sm">{viewRegister.profiles?.display_name || "Desconhecido"}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Loja</p>
                <p className="font-medium text-sm text-primary">{viewRegister.stores?.name || "Desconhecida"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="border-border/50">
                <CardContent className="p-3">
                  <p className="text-[10px] text-muted-foreground uppercase">Fundo Inicial</p>
                  <p className="font-bold text-blue-500">{formatCurrency(viewRegister.opening_amount)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-3">
                  <p className="text-[10px] text-muted-foreground uppercase">Valor Informado</p>
                  <p className="font-bold text-primary">{formatCurrency(viewRegister.closing_amount)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-3">
                  <p className="text-[10px] text-muted-foreground uppercase">Valor Esperado</p>
                  <p className="font-bold text-muted-foreground">{formatCurrency(viewRegister.expected_amount)}</p>
                </CardContent>
              </Card>
              <Card
                className={`border-border/50 ${
                  Math.abs(viewRegister.difference || 0) > 0 ? "border-destructive/30 bg-destructive/5" : ""
                }`}
              >
                <CardContent className="p-3">
                  <p className="text-[10px] text-muted-foreground uppercase">Diferença</p>
                  <p
                    className={`font-bold ${
                      Math.abs(viewRegister.difference || 0) > 0 ? "text-destructive" : "text-primary"
                    }`}
                  >
                    {formatCurrency(viewRegister.difference)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {viewRegister.difference_reason && (
              <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-md text-sm text-destructive">
                <p className="font-semibold text-xs uppercase mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Motivo da Diferença
                </p>
                <p>{viewRegister.difference_reason}</p>
              </div>
            )}
            {viewRegister.closing_note && (
              <div className="bg-muted p-3 rounded-md text-sm">
                <p className="font-semibold text-xs uppercase mb-1">Observação do Fechamento</p>
                <p>{viewRegister.closing_note}</p>
              </div>
            )}

            {(viewRegister.opening_receipt_url || viewRegister.closing_receipt_url) && (
              <div className="flex flex-wrap gap-2 mt-2">
                {viewRegister.opening_receipt_url && (
                  <a
                    href={viewRegister.opening_receipt_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => openComprovante(viewRegister.opening_receipt_url, e)}
                    className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:underline font-semibold bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20 cursor-pointer"
                  >
                    📂 Comprovante de Abertura
                  </a>
                )}
                {viewRegister.closing_receipt_url && (
                  <a
                    href={viewRegister.closing_receipt_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => openComprovante(viewRegister.closing_receipt_url, e)}
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-500 hover:underline font-semibold bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20 cursor-pointer"
                  >
                    📂 Comprovante de Fechamento
                  </a>
                )}
              </div>
            )}

            <div className="mt-6 border rounded-lg overflow-hidden">
              <div className="bg-muted px-4 py-2 border-b">
                <h3 className="text-sm font-semibold">Lançamentos ({historyEntries.length})</h3>
              </div>
              <div className="p-2 space-y-2 max-h-64 overflow-y-auto">
                {loadingHistoryEntries ? (
                  <p className="text-center py-4 text-xs text-muted-foreground">Carregando...</p>
                ) : historyEntries.length === 0 ? (
                  <p className="text-center py-4 text-xs text-muted-foreground">Nenhum lançamento registrado neste caixa.</p>
                ) : (
                  historyEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between text-xs border rounded-lg p-2 bg-muted/20"
                    >
                      <div className="min-w-0 flex-1 mr-2">
                        <p className="font-medium truncate">
                          {(entry.description || "").replace(/\s*\[MISTO:\{.*?\}\]/, "")}
                        </p>
                        <p className="text-muted-foreground">
                          {entry.payment_method === "misto"
                            ? getMistoLabel(entry.description)
                            : paymentLabels[entry.payment_method || ""] || "Outro"}{" "}
                          · {new Date(entry.created_at).toLocaleString("pt-BR")}
                        </p>
                        {entry.receipt_url && (
                          <div className="flex items-center gap-2 mt-1">
                            <a
                              href={entry.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => openComprovante(entry.receipt_url, e)}
                              className="inline-flex items-center gap-1 text-[10px] text-emerald-500 hover:underline font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 cursor-pointer"
                            >
                              📎 Comprovante
                            </a>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-bold ${
                            ["entrada", "abertura"].includes(entry.type) ? "text-primary" : "text-destructive"
                          }`}
                        >
                          {["entrada", "abertura"].includes(entry.type) ? "+" : "-"}
                          {formatCurrency(Number(entry.amount))}
                        </p>
                        {!entry.confirmed && (
                          <Badge className="text-[8px] bg-orange-500/20 text-orange-600 mt-1">Não confirmado</Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
