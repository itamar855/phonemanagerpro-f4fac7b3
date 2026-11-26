import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convertToWebP, RECEIPT_IMAGE } from '@/utils/imageOptimizer';

describe('Image Optimizer — Defensive WebP Conversion', () => {
  it('should preserve PDF files completely untouched without converting', async () => {
    const pdfBlob = new Blob(['%PDF-1.4 mock content'], { type: 'application/pdf' });
    const pdfFile = new File([pdfBlob], 'comprovante-bancario.pdf', { type: 'application/pdf' });

    const result = await convertToWebP(pdfFile);

    expect(result).toBe(pdfFile);
    expect(result.name).toBe('comprovante-bancario.pdf');
    expect(result.type).toBe('application/pdf');
  });

  it('should preserve SVG files completely untouched', async () => {
    const svgBlob = new Blob(['<svg></svg>'], { type: 'image/svg+xml' });
    const svgFile = new File([svgBlob], 'logo-vetorial.svg', { type: 'image/svg+xml' });

    const result = await convertToWebP(svgFile);

    expect(result).toBe(svgFile);
    expect(result.name).toBe('logo-vetorial.svg');
    expect(result.type).toBe('image/svg+xml');
  });

  it('should preserve already lightweight WebP files untouched', async () => {
    const smallWebpBlob = new Blob(['RIFFmockWEBP'], { type: 'image/webp' });
    const webpFile = new File([smallWebpBlob], 'foto-otimizada.webp', { type: 'image/webp' });

    const result = await convertToWebP(webpFile);

    expect(result).toBe(webpFile);
    expect(result.name).toBe('foto-otimizada.webp');
  });

  it('should return original file safely if environment lacks canvas/Image or encounters error (safe fallback)', async () => {
    const jpgBlob = new Blob(['fake-jpg-content'], { type: 'image/jpeg' });
    const jpgFile = new File([jpgBlob], 'foto-camera.jpg', { type: 'image/jpeg' });

    // In node environment without canvas, it should gracefully fallback to the original file
    const result = await convertToWebP(jpgFile);

    expect(result).toBeDefined();
    expect(result.name).toBe('foto-camera.jpg');
  });

  it('should correctly convert to webp when DOM/Canvas APIs are available', async () => {
    // Mock browser canvas & Image environment
    const mockWebpBlob = new Blob(['RIFFfakeWEBP'], { type: 'image/webp' });
    
    const originalCreateElement = global.document?.createElement;
    const originalImage = global.Image;
    const originalCreateObjectURL = global.URL?.createObjectURL;
    const originalRevokeObjectURL = global.URL?.revokeObjectURL;

    try {
      global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      global.URL.revokeObjectURL = vi.fn();

      class MockImage {
        width = 800;
        height = 600;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_: string) {
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }
      }
      global.Image = MockImage as unknown as typeof Image;

      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue({
          drawImage: vi.fn(),
        }),
        toBlob: vi.fn((callback: (blob: Blob | null) => void) => {
          callback(mockWebpBlob);
        }),
      };

      global.document = {
        createElement: vi.fn((tag: string) => {
          if (tag === 'canvas') return mockCanvas;
          return {};
        }),
      } as unknown as Document;

      const pngBlob = new Blob(['fake-large-png-content'], { type: 'image/png' });
      const pngFile = new File([pngBlob], 'comprovante_pix.png', { type: 'image/png' });

      const result = await convertToWebP(pngFile);

      expect(result.name).toBe('comprovante_pix.webp');
      expect(result.type).toBe('image/webp');
    } finally {
      if (originalCreateElement) global.document.createElement = originalCreateElement;
      if (originalImage) global.Image = originalImage;
      if (originalCreateObjectURL) global.URL.createObjectURL = originalCreateObjectURL;
      if (originalRevokeObjectURL) global.URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });
});

/** Navegador falso: imagem w×h; o canvas devolve um WebP de `outBytes` bytes. */
async function withFakeCanvas<T>(w: number, h: number, outBytes: number, run: (canvas: { width: number; height: number; toBlob: ReturnType<typeof vi.fn> }) => Promise<T>) {
  const saved = { doc: global.document, img: global.Image, create: global.URL.createObjectURL, revoke: global.URL.revokeObjectURL };
  const canvas = {
    width: 0, height: 0,
    getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
    toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(new Blob([new Uint8Array(outBytes)], { type: 'image/webp' }))),
  };
  try {
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
    global.URL.revokeObjectURL = vi.fn();
    global.Image = class { width = w; height = h; onload: (() => void) | null = null; set src(_: string) { setTimeout(() => this.onload?.(), 0); } } as unknown as typeof Image;
    global.document = { createElement: vi.fn(() => canvas) } as unknown as Document;
    return await run(canvas);
  } finally {
    global.document = saved.doc; global.Image = saved.img;
    global.URL.createObjectURL = saved.create; global.URL.revokeObjectURL = saved.revoke;
  }
}

describe('Image Optimizer — comprovantes', () => {
  it('comprovante: reduz para 1400 px e usa qualidade 0,68', async () => {
    const jpg = new File([new Uint8Array(3_000_000)], 'pix.jpg', { type: 'image/jpeg' });
    await withFakeCanvas(3000, 4000, 150_000, async (canvas) => {
      const out = await convertToWebP(jpg, RECEIPT_IMAGE);
      expect(canvas.width).toBe(1050);
      expect(canvas.height).toBe(1400);
      expect(canvas.toBlob.mock.calls[0][2]).toBe(0.68);
      expect(out.type).toBe('image/webp');
      expect(out.size).toBe(150_000);
    });
  });

  it('iPhone (Safari sem WebP no canvas): comprime em JPEG em vez de subir PNG gigante', async () => {
    const jpg = new File([new Uint8Array(2_500_000)], 'IMG_0001.jpg', { type: 'image/jpeg' });
    await withFakeCanvas(3024, 4032, 0, async (canvas) => {
      canvas.toBlob.mockImplementation((cb: (b: Blob | null) => void, type: string) =>
        type === 'image/jpeg'
          ? cb(new Blob([new Uint8Array(140_000)], { type: 'image/jpeg' }))
          : cb(new Blob([new Uint8Array(4_200_000)], { type: 'image/png' })));
      const out = await convertToWebP(jpg, RECEIPT_IMAGE);
      expect(out.type).toBe('image/jpeg');
      expect(out.name).toBe('IMG_0001.jpg');
      expect(out.size).toBe(140_000);
    });
  });

  it('nunca sobe arquivo maior que o original', async () => {
    const jpg = new File([new Uint8Array(40_000)], 'cupom.jpg', { type: 'image/jpeg' });
    await withFakeCanvas(900, 1200, 60_000, async () => {
      const out = await convertToWebP(jpg, RECEIPT_IMAGE);
      expect(out).toBe(jpg);
    });
  });
});
