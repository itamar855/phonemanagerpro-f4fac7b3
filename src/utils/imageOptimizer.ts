/**
 * imageOptimizer.ts
 * Utilitário para conversão automática e otimização de imagens para WebP no cliente (browser).
 * Reduz consumo de banda, armazenamento e acelera o carregamento do sistema.
 * 
 * Trava de segurança: Arquivos não-imagem (como comprovantes em PDF) e arquivos corrompidos
 * são preservados integralmente sem qualquer alteração.
 */

interface OptimizeOptions {
  quality?: number; // 0.1 a 1.0 (padrão: 0.82)
  maxDimension?: number; // largura ou altura máxima (padrão: 1920px)
}

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

    // Trava de tamanho: se a imagem já era WebP ou se o novo blob por algum motivo ficou maior,
    // e o arquivo original já era bem comprimido, mantém o menor.
    if (file.type === "image/webp" && webpBlob.size >= file.size) {
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
