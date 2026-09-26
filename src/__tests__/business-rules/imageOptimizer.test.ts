import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convertToWebP } from '@/utils/imageOptimizer';

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
      global.Image = MockImage as any;

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
      } as any;

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
