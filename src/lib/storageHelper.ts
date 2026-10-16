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
 * Abre o comprovante em nova aba de forma segura utilizando URL assinada.
 */
export async function openComprovante(urlOrPath: string | null | undefined, e?: React.MouseEvent) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (!urlOrPath) return;

  const signedUrl = await getSignedComprovanteUrl(urlOrPath);
  if (signedUrl) {
    window.open(signedUrl, "_blank", "noopener,noreferrer");
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
