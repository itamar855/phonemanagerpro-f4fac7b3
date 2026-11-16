/**
 * imageOptimizer.ts
 * Utilitário para conversão automática e otimização de imagens para WebP no cliente (browser).
 * Reduz consumo de banda, armazenamento e acelera o carregamento do sistema.
 * 
 * Trava de segurança: Arquivos não-imagem (como comprovantes em PDF) e arquivos corrompidos
 * são preservados integralmente sem qualquer alteração.
 */

export interface OptimizeOptions {
  quality?: number; // 0.1 a 1.0 (padrão: 0.82)
  maxDimension?: number; // largura ou altura máxima (padrão: 1920px)
}

/**
 * Comprovantes (Pix, cupom, boleto, nota de peça): só precisam do texto legível.
 * 1400 px + qualidade 0,68 deixa a foto de celular com ~80–200 KB.
 * Fotos de aparelho/OS continuam no padrão (mais detalhe).
 */
export const RECEIPT_IMAGE: OptimizeOptions = { maxDimension: 1400, quality: 0.68 };

/**
 * Converte um arquivo de imagem para WebP no navegador de forma assíncrona.
 * Se o arquivo for PDF, SVG ou se ocorrer qualquer falha durante a conversão,
 * retorna o arquivo original sem interrupções.
 */
export async function convertToWebP(
  file: File,
  options: OptimizeOptions = {}
): Promise<File> {
  // 1. Verificação defensiva de tipo e extensão
  if (!file || !(file instanceof File)) {
    return file;
  }

  const fileNameLower = file.name.toLowerCase();

  // Preserva PDFs e SVGs imediatamente sem processamento
  if (
    file.type === "application/pdf" ||
    fileNameLower.endsWith(".pdf") ||
    file.type === "image/svg+xml" ||
    fileNameLower.endsWith(".svg")
  ) {
    return file;
  }

  // Verifica se é imagem suportada
  const isImage =
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|bmp|gif|avif|heic)$/i.test(fileNameLower);

  if (!isImage) {
    return file;
  }

  // Se já for WebP e for menor que 300KB, não precisa reprocessar
  if (
    (file.type === "image/webp" || fileNameLower.endsWith(".webp")) &&
    file.size < 300 * 1024
  ) {
    return file;
  }

  const quality = options.quality ?? 0.82;
  const maxDimension = options.maxDimension ?? 1920;

  try {
    // 2. Carrega a imagem no browser
    const blobUrl = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = (err) => reject(err);
      image.src = blobUrl;
    });

    URL.revokeObjectURL(blobUrl);

    // 3. Calcula dimensões mantendo proporção
    let { width, height } = img;
    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    // 4. Renderiza em canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }

    ctx.drawImage(img, 0, 0, width, height);

    // 5. Converte para Blob WebP
    const webpBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/webp", quality);
    });

    if (!webpBlob) {
      return file;
    }

    // Trava de tamanho: nunca sobe um arquivo maior que o original (vale para qualquer formato
    // que o navegador consiga exibir; o original já estava mais enxuto).
    if (webpBlob.size >= file.size && /^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      return file;
    }

    // 6. Gera novo nome com extensão .webp
    const baseName = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
    const newFileName = `${baseName}.webp`;

    return new File([webpBlob], newFileName, {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch (error) {
    // Fallback silencioso e seguro: preserva o arquivo original
    console.warn("Auto-convert WebP: Não foi possível converter imagem, mantendo original.", error);
    return file;
  }
}
