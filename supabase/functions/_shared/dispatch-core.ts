// Texto do aviso de atendimento (sem dependências: testado no Vitest).

export interface DispatchNotice {
  id: string;
  kind: "offered" | "owner";
  store_id: string;
  conversation_id: string;
  staff_phone: string | null;
  staff_name: string;
  minutes: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  deal_title: string | null;
  summary: string | null;
}

/** (87) 99999-1234 a partir de 55 + DDD + número. */
export function formatPhone(phone: string | null): string {
  const d = String(phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

export function noticeText(n: DispatchNotice, appUrl: string): string {
  const first = (n.staff_name || "").split(/\s+/)[0] || "pessoal";
  const who = [n.contact_name || "Cliente", formatPhone(n.contact_phone)].filter(Boolean).join(" · ");
  const link = `${appUrl.replace(/\/+$/, "")}/crm/inbox/${n.conversation_id}`;
  const about = [n.deal_title ? `📝 ${n.deal_title}` : null, n.summary ? n.summary.trim().slice(0, 300) : null].filter(Boolean).join("\n");
  const lines = n.kind === "owner"
    ? [`⚠️ *Ninguém assumiu este atendimento*, ${first}. Ficou com você.`, "", `👤 ${who}`, about, "", `Abrir conversa: ${link}`]
    : [`🔔 *Novo atendimento pra você*, ${first}!`, "", `👤 ${who}`, about, "",
      `Assuma em até ${n.minutes ?? 5} min: ${link}`, "Se não assumir, passa pro próximo da fila."];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
