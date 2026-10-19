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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Copy,
  FileText,
  Printer,
  MessageCircle,
  CheckCircle2,
  DollarSign,
  Banknote,
  CreditCard,
  QrCode,
  Receipt,
  Camera,
  Upload,
  Shield,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { openComprovante } from "@/lib/storageHelper";
import { OsChecklist, ChecklistData } from "@/components/OsChecklist";
import { OsPhotoGallery } from "@/components/OsPhotoGallery";
import { OsParts } from "@/components/OsParts";
import { OS_STATUS_CONFIG as statusConfig, ALL_OS_STATUSES as allStatuses } from "@/utils/osStatus";
import { formatCurrency, TERMS_TEXT } from "./osPdf";
import { toast } from "sonner";

interface OSDetailModalProps {
  detailOrder: any | null;
  onClose: () => void;
  stores: Tables<"stores">[];
  profileMap: Map<string, string>;
  profiles: Tables<"profiles">[];
  isAdmin: boolean;
  updateForm: {
    final_price: string;
    technician_id: string;
    payment_cash: string;
    payment_card: string;
    payment_pix: string;
    payment_other: string;
    payment_notes: string;
    exit_checklist: ChecklistData;
    warranty_end_date: string;
    justification: string;
  };
  setUpdateForm: React.Dispatch<React.SetStateAction<any>>;
  receiptFile: File | null;
  setReceiptFile: (f: File | null) => void;
  existingReceiptUrl: string | null;
  setExistingReceiptUrl: (url: string | null) => void;
  cameraInputRef: React.RefObject<HTMLInputElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  loading: boolean;
  pdfLoading: boolean;
  justification: string;
  setJustification: (value: string) => void;
  handleDuplicateOS: (order: any) => void;
  handleExportPdf: (order: any) => void;
  handleExportThermal: (order: any) => void;
  handleSendWhatsApp: (order: any) => void;
  handleUpdateService: () => void | Promise<void>;
  handleMoveStore: (newStoreId: string, justification: string) => void | Promise<void>;
  onRequestDelete: () => void;
  updateStatus: (orderId: string, newStatus: string, oldStatus: string) => void | Promise<void>;
  getPublicUrl: (orderId: string) => string;
  totalPaid: (order: any) => number;
  isFinancialPending?: boolean;
  onConfirmFinancial?: () => void | Promise<void>;
}

export const OSDetailModal: React.FC<OSDetailModalProps> = ({
  detailOrder,
  onClose,
  stores,
  profileMap,
  profiles,
  isAdmin,
  updateForm,
  setUpdateForm,
  receiptFile,
  setReceiptFile,
  existingReceiptUrl,
  setExistingReceiptUrl,
  cameraInputRef,
  fileInputRef,
  loading,
  pdfLoading,
  justification,
  setJustification,
  handleDuplicateOS,
  handleExportPdf,
  handleExportThermal,
  handleSendWhatsApp,
  handleUpdateService,
  handleMoveStore,
  onRequestDelete,
  updateStatus,
  getPublicUrl,
  totalPaid,
  isFinancialPending = false,
  onConfirmFinancial,
}) => {
  return (
    <Dialog open={!!detailOrder} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[92dvh] overflow-y-auto p-4 sm:p-6">
        {detailOrder && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <span className="text-muted-foreground font-mono text-sm">
                  #{detailOrder.order_number}
                </span>
                OS — {detailOrder.customer_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Alerta explícito de pendência financeira ou confirmação */}
              {detailOrder.status === "delivered" && (
                isFinancialPending ? (
                  <div className="p-3.5 rounded-lg bg-red-500/15 border-2 border-red-500/80 text-red-500 animate-pulse space-y-2.5 shadow-md">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-red-500 animate-bounce mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-xs sm:text-sm leading-snug text-red-600 dark:text-red-400">
                          Atenção: Falta confirmar no financeiro (Caixa) as Transações referentes a esse serviço!
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Para liberar o fechamento completo, anexe o comprovante de pagamento do serviço e das peças utilizadas.
                        </p>
                      </div>
                    </div>
                    {onConfirmFinancial && (
                      <div className="pt-2 border-t border-red-500/30 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          Comprovantes verificados?
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          onClick={onConfirmFinancial}
                          className="h-8 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white gap-1.5 shadow"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar no Financeiro Agora
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span>Transações financeiras deste serviço já confirmadas no Caixa.</span>
                  </div>
                )
              )}

              {/* Status + ações em grid tátil */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Badge className={`text-[10px] border ${statusConfig[detailOrder.status]?.color}`}>
                    {statusConfig[detailOrder.status]?.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(detailOrder.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>

                {/* Grid de Ações Rápidas no Mobile */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full pt-1">
                  <Button
                    type="button"
                    className="h-9 px-2 text-xs gap-1.5 border bg-transparent text-primary border-primary/30 hover:bg-primary/10 active:scale-95 transition-transform"
                    onClick={() => handleDuplicateOS(detailOrder)}
                  >
                    <Copy className="h-3.5 w-3.5" /> Duplicar OS
                  </Button>
                  <Button
                    type="button"
                    className="h-9 px-2 text-xs gap-1.5 border bg-transparent text-foreground hover:bg-muted active:scale-95 transition-transform"
                    onClick={() => handleExportPdf(detailOrder)}
                    disabled={pdfLoading}
                  >
                    <FileText className="h-3.5 w-3.5" /> PDF A4
                  </Button>
                  <Button
                    type="button"
                    className="h-9 px-2 text-xs gap-1.5 border bg-transparent text-foreground hover:bg-muted active:scale-95 transition-transform"
                    onClick={() => handleExportThermal(detailOrder)}
                    disabled={pdfLoading}
                  >
                    <Printer className="h-3.5 w-3.5" /> Cupom 80mm
                  </Button>
                  <Button
                    type="button"
                    className="h-9 px-2 text-xs gap-1.5 border bg-transparent text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 active:scale-95 transition-transform font-medium"
                    onClick={() => handleSendWhatsApp(detailOrder)}
                    disabled={pdfLoading}
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </Button>
                </div>
              </div>

              {/* Link público */}
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <span className="text-[10px] text-muted-foreground flex-1 truncate">
                  {getPublicUrl(detailOrder.id)}
                </span>
                <Button
                  className="h-6 text-[10px] bg-transparent hover:bg-muted"
                  onClick={() => {
                    navigator.clipboard.writeText(getPublicUrl(detailOrder.id));
                    toast.success("Link copiado!");
                  }}
                >
                  Copiar
                </Button>
              </div>

              {/* Cliente */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">
                  Cliente
                </p>
                <p className="font-medium">{detailOrder.customer_name}</p>
                {detailOrder.customer_phone && <p>📞 {detailOrder.customer_phone}</p>}
                {detailOrder.customer_cpf && <p>CPF: {detailOrder.customer_cpf}</p>}
              </div>

              {/* Aparelho */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">
                  Aparelho
                </p>
                <p className="font-medium">
                  {detailOrder.device_brand} {detailOrder.device_model}
                </p>
                {detailOrder.device_imei && <p>IMEI: {detailOrder.device_imei}</p>}
                {detailOrder.device_color && <p>Cor: {detailOrder.device_color}</p>}
                {detailOrder.device_condition && <p>Condição: {detailOrder.device_condition}</p>}
                {detailOrder.device_accessories && <p>Acessórios: {detailOrder.device_accessories}</p>}
                {detailOrder.device_is_off && (
                  <div className="mt-2 p-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg text-[10px] font-bold leading-normal">
                    ⚠️ APARELHO DEU ENTRADA DESLIGADO
                    <span className="block font-medium text-muted-foreground mt-0.5">
                      Não foi possível testar os periféricos e afirmar que estão em perfeito funcionamento.
                    </span>
                  </div>
                )}
              </div>

              {/* Serviço */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">
                  Serviço
                </p>
                <p>
                  <span className="text-muted-foreground">Defeito:</span> {detailOrder.reported_defect}
                </p>
                <p>
                  <span className="text-muted-foreground">Serviço:</span> {detailOrder.requested_service}
                </p>
                <p>
                  <span className="text-muted-foreground">Técnico:</span>{" "}
                  {detailOrder.technician_id
                    ? profileMap.get(detailOrder.technician_id) ?? "—"
                    : "Nenhum (Sem técnico)"}
                </p>
                <p>
                  <span className="text-muted-foreground">Estimado:</span>{" "}
                  {formatCurrency(Number(detailOrder.estimated_price || 0))}
                </p>
                {Boolean(detailOrder.final_price) && (
                  <p>
                    <span className="text-muted-foreground">Final:</span>{" "}
                    <span className="font-bold text-primary">
                      {formatCurrency(Number(detailOrder.final_price))}
                    </span>
                  </p>
                )}
                {detailOrder.estimated_completion && (
                  <p>
                    <span className="text-muted-foreground">Previsão:</span>{" "}
                    {new Date(detailOrder.estimated_completion).toLocaleString("pt-BR")}
                  </p>
                )}
                {detailOrder.warranty_end_date && (
                  <p>
                    <span className="text-muted-foreground">Garantia até:</span>{" "}
                    <span className="font-bold text-green-500">
                      {new Date(detailOrder.warranty_end_date).toLocaleDateString("pt-BR")}
                    </span>
                  </p>
                )}
              </div>

              {/* Entry Checklist Viewer */}
              {detailOrder.entry_checklist && Object.keys(detailOrder.entry_checklist).length > 0 && (
                <OsChecklist
                  title="Checklist de Entrada (Registrado na abertura)"
                  data={detailOrder.entry_checklist as ChecklistData}
                  onChange={() => {}}
                  readonly={true}
                />
              )}

              {/* Galeria de Fotos */}
              <OsPhotoGallery orderId={detailOrder.id} />

              {/* Peças da OS */}
              <OsParts orderId={detailOrder.id} storeId={detailOrder.store_id} />

              {/* Pagamento atual */}
              {totalPaid(detailOrder) > 0 && (
                <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
                  <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">
                    Pagamento Recebido
                  </p>
                  {Number(detailOrder.payment_cash) > 0 && (
                    <p>
                      <span className="text-muted-foreground">Dinheiro:</span>{" "}
                      {formatCurrency(Number(detailOrder.payment_cash))}
                    </p>
                  )}
                  {Number(detailOrder.payment_card) > 0 && (
                    <p>
                      <span className="text-muted-foreground">Cartão:</span>{" "}
                      {formatCurrency(Number(detailOrder.payment_card))}
                    </p>
                  )}
                  {Number(detailOrder.payment_pix) > 0 && (
                    <p>
                      <span className="text-muted-foreground">PIX:</span>{" "}
                      {formatCurrency(Number(detailOrder.payment_pix))}
                    </p>
                  )}
                  {Number(detailOrder.payment_other) > 0 && (
                    <p>
                      <span className="text-muted-foreground">Outro:</span>{" "}
                      {formatCurrency(Number(detailOrder.payment_other))}
                    </p>
                  )}
                  <p className="font-bold text-primary">
                    Total: {formatCurrency(totalPaid(detailOrder))}
                  </p>
                  {detailOrder.payment_notes && (
                    <p className="text-muted-foreground">{detailOrder.payment_notes}</p>
                  )}

                  {detailOrder.receipt_url && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <a
                        href={detailOrder.receipt_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => openComprovante(detailOrder.receipt_url, e)}
                        className="text-[10px] text-primary underline flex items-center gap-1 font-semibold cursor-pointer"
                      >
                        <Receipt className="h-3 w-3" /> Ver Comprovante de Pagamento
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Assinatura */}
              {detailOrder.signature_data && (
                <div className="rounded-lg bg-muted/50 p-3 text-xs">
                  <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide mb-2">
                    Assinatura do Cliente
                  </p>
                  <img
                    src={detailOrder.signature_data}
                    alt="Assinatura"
                    className="max-h-20 rounded border border-border"
                  />
                </div>
              )}

              {/* Termos */}
              <div className="rounded-lg border border-border p-3 text-xs">
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide mb-2">
                  Termos e Condições
                </p>
                <div className="max-h-28 overflow-y-auto">
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                    {TERMS_TEXT}
                  </p>
                </div>
                {detailOrder.terms_accepted && (
                  <div className="flex items-center gap-1 mt-2 text-primary font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px]">Cliente aceitou os termos de serviço</span>
                  </div>
                )}
                {detailOrder.device_is_off && (
                  <div className="flex items-center gap-1 mt-1 text-red-500 font-bold">
                    <CheckCircle2 className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-[10px]">
                      Cliente ciente: Aparelho entrou Desligado (sem teste de periféricos)
                    </span>
                  </div>
                )}
              </div>

              {/* Atualizar serviço */}
              {detailOrder.status !== "cancelled" && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
                  <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" /> Atualizar Serviço
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Valor Final (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={updateForm.final_price}
                        onChange={(e) =>
                          setUpdateForm((f: any) => ({ ...f, final_price: e.target.value }))
                        }
                        placeholder="0.00"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fim da Garantia (Opcional)</Label>
                      <Input
                        type="date"
                        value={updateForm.warranty_end_date}
                        onChange={(e) =>
                          setUpdateForm((f: any) => ({ ...f, warranty_end_date: e.target.value }))
                        }
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-xs">Técnico Responsável</Label>
                      <Select
                        value={updateForm.technician_id || "none"}
                        onValueChange={(v) =>
                          setUpdateForm((f: any) => ({ ...f, technician_id: v }))
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum (Sem técnico)</SelectItem>
                          {profiles.map((p) => (
                            <SelectItem key={p.user_id} value={p.user_id}>
                              {p.display_name ?? p.user_id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="pt-2">
                    <OsChecklist
                      title="Checklist de Saída (Testes Pós-Reparo)"
                      data={updateForm.exit_checklist}
                      onChange={(d) => setUpdateForm({ ...updateForm, exit_checklist: d })}
                    />
                  </div>

                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Formas de Pagamento Recebidas
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] flex items-center gap-1">
                        <Banknote className="h-3 w-3" /> Dinheiro
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={updateForm.payment_cash}
                        onChange={(e) =>
                          setUpdateForm((f: any) => ({ ...f, payment_cash: e.target.value }))
                        }
                        placeholder="0.00"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] flex items-center gap-1">
                        <CreditCard className="h-3 w-3" /> Cartão
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={updateForm.payment_card}
                        onChange={(e) =>
                          setUpdateForm((f: any) => ({ ...f, payment_card: e.target.value }))
                        }
                        placeholder="0.00"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] flex items-center gap-1">
                        <QrCode className="h-3 w-3" /> PIX
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={updateForm.payment_pix}
                        onChange={(e) =>
                          setUpdateForm((f: any) => ({ ...f, payment_pix: e.target.value }))
                        }
                        placeholder="0.00"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] flex items-center gap-1">
                        <DollarSign className="h-3 w-3" /> Outro
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={updateForm.payment_other}
                        onChange={(e) =>
                          setUpdateForm((f: any) => ({ ...f, payment_other: e.target.value }))
                        }
                        placeholder="0.00"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Obs. de Pagamento</Label>
                    <Input
                      value={updateForm.payment_notes}
                      onChange={(e) =>
                        setUpdateForm((f: any) => ({ ...f, payment_notes: e.target.value }))
                      }
                      placeholder="Ex: Parte em dinheiro, parte no cartão"
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold flex items-center gap-1">
                      <Receipt className="h-3 w-3" /> Anexar Comprovante
                    </Label>
                    {receiptFile ? (
                      <div className="flex items-center gap-2 rounded bg-primary/10 p-2 text-[10px] text-primary border border-primary/20 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate flex-1">{receiptFile.name}</span>
                        <button onClick={() => setReceiptFile(null)} className="hover:underline">
                          Remover
                        </button>
                      </div>
                    ) : existingReceiptUrl ? (
                      <div className="flex items-center gap-2 rounded bg-green-500/10 p-2 text-[10px] text-green-600 border border-green-500/20 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate flex-1">Comprovante já enviado</span>
                        <button
                          onClick={() => setExistingReceiptUrl(null)}
                          className="text-destructive hover:underline"
                        >
                          Trocar
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 text-[10px] gap-1.5"
                          onClick={() => cameraInputRef.current?.click()}
                        >
                          <Camera className="h-3 w-3" /> Tirar Foto
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 text-[10px] gap-1.5"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="h-3 w-3" /> Galeria
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Total pago preview */}
                  {(parseFloat(updateForm.payment_cash) || 0) +
                    (parseFloat(updateForm.payment_card) || 0) +
                    (parseFloat(updateForm.payment_pix) || 0) +
                    (parseFloat(updateForm.payment_other) || 0) >
                    0 && (
                    <div className="flex justify-between text-xs font-bold rounded-lg bg-primary/10 text-primary px-3 py-2">
                      <span>Total Recebido</span>
                      <span>
                        {formatCurrency(
                          (parseFloat(updateForm.payment_cash) || 0) +
                            (parseFloat(updateForm.payment_card) || 0) +
                            (parseFloat(updateForm.payment_pix) || 0) +
                            (parseFloat(updateForm.payment_other) || 0)
                        )}
                      </span>
                    </div>
                  )}

                  <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm -mx-3 -mb-3 p-3.5 border-t border-primary/20 rounded-b-lg shadow-lg z-10 space-y-2 mt-4">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-primary">
                        Campo Obrigatório: Motivo da Alteração
                      </Label>
                      <Input
                        value={updateForm.justification}
                        onChange={(e) =>
                          setUpdateForm((f: any) => ({ ...f, justification: e.target.value }))
                        }
                        placeholder="Ex: Atualização de preço, peça adicionada, técnico alterado..."
                        required
                        className="h-9 text-xs border-primary/40 bg-background shadow-sm"
                      />
                    </div>

                    <Button
                      className="w-full h-11 font-bold shadow-md active:scale-[0.99] transition-transform"
                      onClick={handleUpdateService}
                      disabled={loading || !updateForm.justification}
                    >
                      {loading ? "Salvando..." : "Salvar Alterações e Justificar"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Atualizar status */}
              {detailOrder.status !== "delivered" && detailOrder.status !== "cancelled" && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Atualizar Status
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {allStatuses
                      .filter((s) => s !== detailOrder.status)
                      .map((s) => (
                        <Button
                          key={s}
                          className="text-xs h-9 px-3 bg-transparent border border-border text-foreground hover:bg-muted active:scale-95 transition-transform"
                          onClick={() => updateStatus(detailOrder.id, s, detailOrder.status)}
                        >
                          {statusConfig[s].label}
                        </Button>
                      ))}
                  </div>
                </div>
              )}

              {detailOrder.internal_notes && (
                <div className="rounded-lg bg-muted/50 p-3 text-xs border-l-2 border-yellow-500">
                  <p className="font-semibold text-yellow-500 text-[10px] uppercase tracking-wide mb-1">
                    Notas Internas
                  </p>
                  <p>{detailOrder.internal_notes}</p>
                </div>
              )}

              {/* Área Administrativa */}
              {isAdmin && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-4">
                  <p className="text-xs font-bold text-destructive uppercase tracking-wider flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" /> Controle Administrativo
                  </p>

                  <div className="space-y-2">
                    <Label className="text-[10px] text-muted-foreground uppercase">
                      Mover para outra unidade
                    </Label>
                    <div className="space-y-2">
                      <Input
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        placeholder="Motivo da transferência..."
                        className="h-8 text-xs border-destructive/20"
                      />
                      <Select
                        value={detailOrder.store_id}
                        onValueChange={(v) => {
                          if (!justification) {
                            toast.error("Por favor, informe o motivo antes de transferir.");
                            return;
                          }
                          handleMoveStore(v, justification);
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {stores
                            .filter((s) => s.id !== detailOrder.store_id)
                            .map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-destructive/20">
                    <Button
                      variant="destructive"
                      className="w-full h-9 text-xs gap-2"
                      onClick={onRequestDelete}
                      disabled={loading}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir Ordem de Serviço
                    </Button>
                    <p className="text-[10px] text-center text-destructive/60 mt-2 italic">
                      Esta ação é irreversível e removerá todos os registros vinculados.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
