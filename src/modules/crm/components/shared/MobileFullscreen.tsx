import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useVisualViewport } from "../../hooks/useViewport";

/**
 * Tela cheia no celular, por cima do cabeçalho e da barra inferior do app
 * (vai direto no <body> para escapar do layout). Acompanha o teclado.
 */
export function MobileFullscreen({ children, label }: { children: ReactNode; label: string }) {
  const { height, offsetTop } = useVisualViewport();

  // a página de trás não rola enquanto a tela cheia está aberta
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return createPortal(
    <div
      role="region"
      aria-label={label}
      className="fixed inset-x-0 top-0 z-50 flex flex-col overscroll-contain bg-background"
      style={{ height: height || "100dvh", transform: offsetTop ? `translateY(${offsetTop}px)` : undefined }}
    >
      {children}
    </div>,
    document.body,
  );
}
