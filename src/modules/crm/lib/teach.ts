// "Ensinar a IA" direto na conversa: monta o exemplo a partir da resposta que a IA deu.
import type { CrmMessage } from "./types";

type Msg = Pick<CrmMessage, "id" | "direction" | "sender_kind" | "kind" | "body" | "transcript">;

const MEDIA_ONLY = /^\[(Imagem|Áudio|Vídeo|Documento|Figurinha)\]$/i;

/** O que o cliente disse logo antes desta resposta da IA (mensagens seguidas dele, só texto e áudio transcrito). */
export function teachQuestion(messages: Msg[], aiMessageId: string): string {
  const idx = messages.findIndex((m) => m.id === aiMessageId);
  if (idx <= 0) return "";
  const said: string[] = [];
  for (let i = idx - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind === "note" || m.sender_kind === "system") continue;
    if (m.direction === "out") break;
    const text = m.kind === "audio" ? (m.transcript ?? "").trim() : (m.body ?? "").trim();
    if (text && !MEDIA_ONLY.test(text)) said.unshift(text);
  }
  return said.join("\n").slice(0, 500);
}

/** Acrescenta uma regra ao "O que a IA sabe sobre a loja" (uma linha com "- "), sem repetir. */
export function appendRule(knowledge: string | null, rule: string): string {
  const base = (knowledge ?? "").replace(/\s+$/, "");
  const line = rule.trim().replace(/\s+/g, " ").replace(/^[-•]\s*/, "");
  if (!line) return base;
  if (base.toLowerCase().includes(line.toLowerCase())) return base;
  return base ? `${base}\n- ${line}` : `- ${line}`;
}

export const CRM_MANAGER_ROLES = new Set(["admin", "gerente", "dono"]);
