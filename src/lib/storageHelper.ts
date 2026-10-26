import { useEffect, useState } from "react";
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
  if (urlOrPath.includes("/comprovantes/")) {
    return urlOrPath.split("/comprovantes/")[1].split("?")[0];
  }
  if (urlOrPath.startsWith("comprovantes/")) {
    return urlOrPath.substring(13).split("?")[0];
  }
  return urlOrPath.split("?")[0];
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
  const isFullUrl =
    urlOrPath.startsWith("http://") ||
    urlOrPath.startsWith("https://") ||
    urlOrPath.startsWith("blob:") ||
    urlOrPath.startsWith("data:");

  // Abre imediatamente no gesto síncrono do clique para evitar bloqueio de popups pelos navegadores
  let newTab: Window | null = null;
  try {
    newTab = window.open(isFullUrl ? urlOrPath : "about:blank", "_blank", "noopener,noreferrer");
  } catch (err) {
    console.warn("Popup bloqueado pelo navegador:", err);
  }

  try {
    const signedUrl = await getSignedComprovanteUrl(urlOrPath);
    const targetUrl = signedUrl || urlOrPath;

    if (newTab && !newTab.closed) {
      if (targetUrl !== urlOrPath || !isFullUrl) {
        newTab.location.href = targetUrl;
      }
    } else if (!newTab) {
      // Fallback síncrono com elemento de âncora caso window.open tenha sido bloqueado
      const link = document.createElement("a");
      link.href = targetUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (err) {
    console.error("Erro ao resolver URL do comprovante:", err);
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
