import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

/** Celular (abaixo do breakpoint md do Tailwind). */
export function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const f = () => setMobile(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return mobile;
}

function read() {
  const v = typeof window !== "undefined" ? window.visualViewport : null;
  return { height: v?.height ?? (typeof window !== "undefined" ? window.innerHeight : 0), offsetTop: v?.offsetTop ?? 0 };
}

/**
 * Área realmente visível da tela. Quando o teclado abre no celular, ela encolhe:
 * usar esta altura mantém o campo de mensagem logo acima do teclado (como no WhatsApp).
 */
export function useVisualViewport() {
  const [s, setS] = useState(read);
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const f = () => setS(read());
    v.addEventListener("resize", f);
    v.addEventListener("scroll", f);
    return () => { v.removeEventListener("resize", f); v.removeEventListener("scroll", f); };
  }, []);
  return s;
}
