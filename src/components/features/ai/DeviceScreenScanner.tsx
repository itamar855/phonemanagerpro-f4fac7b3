import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Sparkles, Upload, RotateCcw, CheckCircle2, AlertTriangle, Loader2, Smartphone, HardDrive, Battery, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ScannedDeviceData {
  brand?: string;
  model?: string;
  model_number?: string;
  imei?: string;
  imei2?: string;
  serial_number?: string;
  capacity?: string;
  color?: string;
  battery_percentage?: string;
  detected: boolean;
  notes?: string;
  error_message?: string;
}

interface DeviceScreenScannerProps {
  onScanComplete: (data: ScannedDeviceData) => void;
  triggerText?: string;
  className?: string;
  size?: "default" | "sm" | "lg";
}

/**
 * Resizes and compresses an image on client canvas to reduce payload size to < 200KB
 * ensuring ultra-fast transfer and zero edge-function timeouts.
 */
function compressImage(file: File, maxWidth = 1280, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("Falha ao carregar imagem para compressão"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

export function DeviceScreenScanner({
  onScanComplete,
  triggerText = "Escanear Tela com IA",
  className = "",
  size = "sm",
}: DeviceScreenScannerProps) {
  const [open, setOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<ScannedDeviceData | null>(null);
  const [activeGuideTab, setActiveGuideTab] = useState<"iphone" | "android">("iphone");

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      setScannedData(null);

      // 1. Client-side compression
      const compressedBase64 = await compressImage(file);
      setPreviewImage(compressedBase64);

      // 2. Call Supabase Edge Function
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          type: "scan_device_screen",
          image: compressedBase64,
        },
      });

      if (error) {
        let msg = error.message;
        try {
          if ((error as any).context && typeof (error as any).context.json === "function") {
            const errJson = await (error as any).context.json();
            if (errJson?.error) msg = errJson.error;
          }
        } catch {}
        throw new Error(msg || "Erro ao comunicar com a inteligência artificial");
      }

      const result: ScannedDeviceData = data?.result;
      if (!result) {
        throw new Error("Não foi possível interpretar os dados da imagem.");
      }

      setScannedData(result);

      if (result.detected) {
        toast.success("Tela do aparelho identificada com sucesso!");
      } else {
        toast.error(result.error_message || "Não foi possível ler as informações da tela.");
      }
    } catch (err: any) {
      console.error("Device screen scanner error:", err);
      toast.error(err.message || "Erro ao escanear aparelho.");
      setScannedData({
        detected: false,
        error_message: err.message || "Erro durante o processamento da imagem.",
      });
    } finally {
      setIsProcessing(false);
      // Reset input value so user can select the same file again if desired
      if (e.target) e.target.value = "";
    }
  };

  const handleApply = () => {
    if (!scannedData || !scannedData.detected) return;
    onScanComplete(scannedData);
    toast.success("Dados preenchidos no formulário!");
    setOpen(false);
    resetState();
  };

  const resetState = () => {
    setPreviewImage(null);
    setScannedData(null);
    setIsProcessing(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={() => {
          resetState();
          setOpen(true);
        }}
        className={`group border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10 text-primary font-medium transition-all duration-200 shadow-sm ${className}`}
      >
        <Sparkles className="h-3.5 w-3.5 mr-1.5 text-primary animate-pulse" />
        <Camera className="h-3.5 w-3.5 mr-1.5" />
        {triggerText}
      </Button>

      {/* Hidden file inputs: one with capture='environment' for rear camera, one for gallery */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <Dialog open={open} onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetState();
      }}>
        <DialogContent className="sm:max-w-md max-w-[95vw] p-5 rounded-2xl overflow-hidden">
          <DialogHeader className="text-left space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Escanear Tela do Aparelho
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Identificação automática com IA de Marca, Modelo, IMEI e Armazenamento
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {!previewImage ? (
            <div className="space-y-4 pt-2">
              {/* Visual guidance cards */}
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Como preparar o aparelho do cliente:
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setActiveGuideTab("iphone")}
                      className={`text-[11px] px-2 py-0.5 rounded-md font-medium transition-colors ${
                        activeGuideTab === "iphone"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      iPhone
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveGuideTab("android")}
                      className={`text-[11px] px-2 py-0.5 rounded-md font-medium transition-colors ${
                        activeGuideTab === "android"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Android
                    </button>
                  </div>
                </div>

                {activeGuideTab === "iphone" ? (
                  <div className="text-xs text-foreground/90 space-y-1 bg-background/80 p-2.5 rounded-lg border border-border/40">
                    <p className="font-medium text-primary flex items-center gap-1.5">
                      <Smartphone className="h-3.5 w-3.5" /> iPhone / iPad:
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Abra: <strong className="text-foreground">Ajustes &gt; Geral &gt; Sobre</strong>
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Dica: Role até aparecer o <strong>IMEI</strong> e tire a foto mostrando todo o topo e o IMEI.
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-foreground/90 space-y-1 bg-background/80 p-2.5 rounded-lg border border-border/40">
                    <p className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <Smartphone className="h-3.5 w-3.5" /> Samsung, Xiaomi, Motorola:
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Abra: <strong className="text-foreground">Configurações &gt; Sobre o telefone</strong>
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Dica: Mostre o <strong>Nome do Modelo</strong> e os campos de <strong>IMEI (ranhura 1)</strong>.
                    </p>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="space-y-2 pt-1">
                <Button
                  type="button"
                  size="lg"
                  className="w-full h-12 text-sm font-semibold shadow-md bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-xl"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="h-5 w-5" />
                  Tirar Foto com a Câmera
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  className="w-full h-10 text-xs font-medium text-muted-foreground hover:text-foreground gap-2 rounded-xl border-dashed"
                  onClick={() => galleryInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  Escolher da Galeria ou Arquivo
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {/* Photo preview with futuristic scan effect */}
              <div className="relative rounded-xl overflow-hidden border border-border bg-black/90 aspect-[4/3] max-h-[220px] flex items-center justify-center">
                <img
                  src={previewImage}
                  alt="Tela do Aparelho"
                  className={`w-full h-full object-contain ${isProcessing ? "opacity-75 blur-[0.5px]" : ""}`}
                />

                {isProcessing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px]">
                    {/* Laser scanning line animation */}
                    <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse shadow-[0_0_12px_#22d3ee]" />
                    <Loader2 className="h-8 w-8 text-cyan-400 animate-spin mb-2" />
                    <span className="text-xs font-medium text-white px-3 py-1 rounded-full bg-black/70 border border-cyan-400/30">
                      Analisando tela com IA...
                    </span>
                  </div>
                )}
              </div>

              {/* Extraction result card */}
              {scannedData && !isProcessing && (
                <div>
                  {scannedData.detected ? (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" />
                          Informações Detectadas
                        </div>
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                          IA de Alta Precisão
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded-lg bg-background/80 border border-border/50">
                          <span className="text-[10px] text-muted-foreground block">Marca</span>
                          <span className="font-semibold text-foreground">{scannedData.brand || "—"}</span>
                        </div>

                        <div className="p-2 rounded-lg bg-background/80 border border-border/50">
                          <span className="text-[10px] text-muted-foreground block">Modelo</span>
                          <span className="font-semibold text-foreground truncate block" title={scannedData.model}>
                            {scannedData.model || "—"}
                          </span>
                        </div>

                        {scannedData.imei && (
                          <div className="p-2 rounded-lg bg-background/80 border border-border/50 col-span-2">
                            <span className="text-[10px] text-muted-foreground block">IMEI</span>
                            <span className="font-mono font-semibold text-primary tracking-wide">
                              {scannedData.imei}
                            </span>
                          </div>
                        )}

                        {scannedData.capacity && (
                          <div className="p-2 rounded-lg bg-background/80 border border-border/50">
                            <span className="text-[10px] text-muted-foreground block flex items-center gap-1">
                              <HardDrive className="h-3 w-3" /> Armazenamento
                            </span>
                            <span className="font-semibold text-foreground">{scannedData.capacity} GB</span>
                          </div>
                        )}

                        {scannedData.battery_percentage && (
                          <div className="p-2 rounded-lg bg-background/80 border border-border/50">
                            <span className="text-[10px] text-muted-foreground block flex items-center gap-1">
                              <Battery className="h-3 w-3" /> Bateria / Saúde
                            </span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {scannedData.battery_percentage}%
                            </span>
                          </div>
                        )}

                        {scannedData.color && (
                          <div className="p-2 rounded-lg bg-background/80 border border-border/50">
                            <span className="text-[10px] text-muted-foreground block">Cor</span>
                            <span className="font-semibold text-foreground">{scannedData.color}</span>
                          </div>
                        )}

                        {scannedData.model_number && (
                          <div className="p-2 rounded-lg bg-background/80 border border-border/50">
                            <span className="text-[10px] text-muted-foreground block">Nº Modelo</span>
                            <span className="font-mono text-xs text-foreground">{scannedData.model_number}</span>
                          </div>
                        )}
                      </div>

                      {scannedData.notes && (
                        <p className="text-[10px] text-muted-foreground italic px-1">
                          {scannedData.notes}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        Não foi possível identificar
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {scannedData.error_message ||
                          "A tela do aparelho não ficou legível. Verifique se a foto está focada e ilumine a tela."}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  disabled={isProcessing}
                  onClick={() => {
                    setPreviewImage(null);
                    setScannedData(null);
                  }}
                  className="flex-1 text-xs gap-1.5 rounded-xl"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Tirar Outra
                </Button>

                {scannedData?.detected && (
                  <Button
                    type="button"
                    size="default"
                    disabled={isProcessing}
                    onClick={handleApply}
                    className="flex-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 rounded-xl shadow-md"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Preencher Formulário
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
