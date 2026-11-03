import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface CacheEntry {
  signedUrl: string;
  expiresAt: number;
}

// Cache em memória para URLs assinadas evitando chamadas redundantes ao Supabase
const signedUrlCache = new Map<string, CacheEntry>();

/**
 * Extrai o caminho relativo no bucket comprovantes a partir de uma URL completa ou relativa.
 */
export function extractStoragePath(urlOrPath: string): string {
  if (!urlOrPath) return "";
  let clean = urlOrPath;
  if (clean.includes("/comprovantes/")) {
    clean = clean.split("/comprovantes/")[1].split("?")[0];
  } else if (clean.startsWith("comprovantes/")) {
    clean = clean.substring(13).split("?")[0];
  } else {
    clean = clean.split("?")[0];
  }
  try {
    return decodeURIComponent(clean);
  } catch {
    return clean;
  }
}

/**
 * Constrói um caminho de armazenamento seguro prefixado pelo store_id.
 * Formato: <store_id>/<categoria>/<timestamp>_<nome_sanitizado>
 */
export function buildSafeStoragePath(storeId: string, category: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const cleanCategory = category.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const safeStoreId = storeId || "sem-loja";
  return `${safeStoreId}/${cleanCategory}/${Date.now()}_${safeName}`;
}

/**
 * Obtém uma URL assinada temporária (padrão: 1 hora) com cache em memória.
 */
export async function getSignedComprovanteUrl(
  urlOrPath: string | null | undefined,
  expiresInSeconds = 3600
): Promise<string> {
  if (!urlOrPath) return "";
  if (urlOrPath.includes("token=") || urlOrPath.startsWith("blob:") || urlOrPath.startsWith("data:")) {
    return urlOrPath;
  }

  const path = extractStoragePath(urlOrPath);
  if (!path) return urlOrPath;

  const now = Date.now();
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > now) {
    return cached.signedUrl;
  }

  try {
    const { data, error } = await supabase.storage
      .from("comprovantes")
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      console.warn("Falha ao gerar URL assinada para comprovante:", error?.message);
      return urlOrPath;
    }

    signedUrlCache.set(path, {
      signedUrl: data.signedUrl,
      expiresAt: now + (expiresInSeconds - 120) * 1000, // 2 minutos de margem
    });

    return data.signedUrl;
  } catch (err) {
    console.error("Exceção ao obter URL assinada:", err);
    return urlOrPath;
  }
}

/**
 * Analisa e extrai uma lista de URLs de comprovantes a partir de string única, JSON array ou separadas por vírgula.
 */
export function parseReceiptUrls(urlOrJson: string | null | undefined): string[] {
  if (!urlOrJson) return [];
  const trimmed = urlOrJson.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
      }
    } catch (e) {
      // Ignora falha de parse e segue para fallback
    }
  }
  if (trimmed.includes(",")) {
    return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [trimmed].filter(Boolean);
}

/**
 * Abre o comprovante em nova aba de forma segura utilizando URL assinada sem bloqueio de popup.
 */
export async function openComprovante(urlOrPath: string | null | undefined, e?: React.MouseEvent) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (!urlOrPath) return;

  const urls = parseReceiptUrls(urlOrPath);
  if (urls.length === 0) return;

  for (const target of urls) {
    await openSingleComprovante(target);
  }
}

async function openSingleComprovante(urlOrPath: string) {
  if (!urlOrPath) return;

  // 1. Abre a nova aba síncrona no contexto direto do clique
  // CRÍTICO: NÃO passar "noopener" no 3º parâmetro do window.open(), pois por especificação HTML
  // window.open() com "noopener" retorna null, impedindo qualquer redirecionamento posterior.
  let newTab: Window | null = null;
  try {
    newTab = window.open("", "_blank");
    if (newTab) {
      newTab.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Carregando Comprovante...</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                margin: 0;
                background: #090d16;
                color: #e2e8f0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              }
              .spinner {
                width: 38px;
                height: 38px;
                border: 3px solid rgba(255,255,255,0.1);
                border-top-color: #10b981;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
              }
              @keyframes spin { to { transform: rotate(360deg); } }
              p { margin-top: 16px; font-size: 14px; font-weight: 500; color: #94a3b8; }
            </style>
          </head>
          <body>
            <div class="spinner"></div>
            <p>Carregando comprovante seguro...</p>
          </body>
        </html>
      `);
      newTab.document.close();
    }
  } catch (err) {
    console.warn("Popup bloqueado pelo navegador:", err);
  }

  try {
    const signedUrl = await getSignedComprovanteUrl(urlOrPath);
    const targetUrl = signedUrl || urlOrPath;

    if (newTab && !newTab.closed) {
      // Redireciona a aba aberta para a URL assinada real
      newTab.location.replace(targetUrl);
      // Desconecta o opener para máxima segurança agora que a navegação foi disparada
      try {
        newTab.opener = null;
      } catch {}
    } else {
      // Se o popup foi impedido pelas políticas rígidas do navegador, oferece feedback imediato e ação com 1 clique
      toast.info("Comprovante pronto para visualização", {
        description: "Seu navegador impediu a abertura automática da aba.",
        action: {
          label: "Abrir Comprovante",
          onClick: () => window.open(targetUrl, "_blank", "noopener,noreferrer"),
        },
      });
    }
  } catch (err) {
    console.error("Erro ao resolver URL do comprovante:", err);
    if (newTab && !newTab.closed) {
      newTab.close();
    }
    toast.error("Não foi possível carregar o comprovante.");
  }
}

/**
 * Hook do React para resolver URLs assinadas com reatividade e ciclo de vida seguro.
 */
export function useSignedUrl(urlOrPath: string | null | undefined): string | null {
  const [signedUrl, setSignedUrl] = useState<string | null>(urlOrPath || null);

  useEffect(() => {
    if (!urlOrPath) {
      setSignedUrl(null);
      return;
    }

    let isMounted = true;
    getSignedComprovanteUrl(urlOrPath).then((url) => {
      if (isMounted) {
        setSignedUrl(url);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [urlOrPath]);

  return signedUrl;
}
