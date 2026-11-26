import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Smartphone, Download, CheckCircle2 } from "lucide-react";

/** Evento do Chrome para instalar o PWA (não está nos tipos do DOM). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const Instalar = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua));

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full border-border/50 shadow-lg shadow-black/10">
        <CardContent className="p-8 text-center space-y-6">
          <div className="mx-auto rounded-2xl bg-primary/15 p-4 w-fit">
            <Smartphone className="h-12 w-12 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Cell Pro 360</h1>
            <p className="text-muted-foreground text-sm mt-2">
              Instale o app no seu celular para acesso rápido
            </p>
          </div>

          {isInstalled ? (
            <div className="flex items-center justify-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-medium">App já instalado!</p>
            </div>
          ) : deferredPrompt ? (
            <Button onClick={handleInstall} className="w-full h-12 gap-2 text-base font-semibold">
              <Download className="h-5 w-5" />
              Instalar App
            </Button>
          ) : isIOS ? (
            <div className="space-y-3 text-left">
              <p className="text-sm font-medium">Para instalar no iPhone:</p>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Toque no ícone <strong>Compartilhar</strong> (⬆️) no Safari</li>
                <li>Selecione <strong>"Adicionar à Tela de Início"</strong></li>
                <li>Toque em <strong>"Adicionar"</strong></li>
              </ol>
            </div>
          ) : (
            <div className="space-y-3 text-left">
              <p className="text-sm font-medium">Para instalar:</p>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Abra o menu do navegador (⋮)</li>
                <li>Selecione <strong>"Instalar app"</strong> ou <strong>"Adicionar à tela inicial"</strong></li>
              </ol>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Instalar;
