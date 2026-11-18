import { describe, it, expect } from "vitest";
import {
  alertText, decideAlert, extractRecords, formatSince, inWatchWindow, instanceKey, messageTimeMs, openOfDay,
  summarizeMessages, type InboundSummary,
} from "../../../supabase/functions/_shared/whatsapp-watchdog-core";

// Horário de São Paulo = UTC-3
const sp = (iso: string) => Date.parse(`${iso}-03:00`);
const MIN = 60_000;
const msg = (atMs: number, fromMe: boolean, remoteJid = "5587999112233@s.whatsapp.net") => ({
  key: { id: String(atMs), fromMe, remoteJid },
  messageTimestamp: Math.floor(atMs / 1000),
});
const sum = (lastInboundMs: number | null, oldestMs: number | null = lastInboundMs): InboundSummary =>
  ({ lastInboundMs, oldestMs, count: 1 });

describe("vigia do WhatsApp — leitura das mensagens", () => {
  it("acha a recebida mais recente, ignorando as enviadas, sem depender da ordem", () => {
    const now = sp("2026-11-17T15:00:00");
    const s = summarizeMessages([
      msg(now - 5 * MIN, true),
      msg(now - 200 * MIN, false),
      msg(now - 40 * MIN, false),
      msg(now - 300 * MIN, true),
    ]);
    expect(s.lastInboundMs).toBe(now - 40 * MIN);
    expect(s.oldestMs).toBe(now - 300 * MIN);
    expect(s.count).toBe(4);
  });

  it("mensagem de grupo recebida conta como sinal de vida", () => {
    const now = sp("2026-11-17T15:00:00");
    const s = summarizeMessages([msg(now - 10 * MIN, false, "120363012345678901@g.us"), msg(now - 2 * MIN, true)]);
    expect(s.lastInboundMs).toBe(now - 10 * MIN);
  });

  it("só enviadas: sem recebida, mas sabe a mais antiga da página", () => {
    const now = sp("2026-11-17T15:00:00");
    const s = summarizeMessages([msg(now - 10 * MIN, true), msg(now - 400 * MIN, true)]);
    expect(s.lastInboundMs).toBeNull();
    expect(s.oldestMs).toBe(now - 400 * MIN);
  });

  it("timestamp em segundos, ms, texto ou {low}; inválido é ignorado", () => {
    expect(messageTimeMs({ messageTimestamp: 1763391600 })).toBe(1763391600000);
    expect(messageTimeMs({ messageTimestamp: "1763391600" })).toBe(1763391600000);
    expect(messageTimeMs({ messageTimestamp: 1763391600000 })).toBe(1763391600000);
    expect(messageTimeMs({ messageTimestamp: { low: 1763391600, high: 0 } })).toBe(1763391600000);
    expect(messageTimeMs({ messageTimestamp: null })).toBeNull();
    expect(summarizeMessages([{ key: { fromMe: false } }]).count).toBe(0);
  });

  it("aceita os formatos de resposta da Evolution", () => {
    const r = [msg(1, false)];
    expect(extractRecords({ messages: { total: 1, pages: 1, records: r } })).toBe(r);
    expect(extractRecords(r)).toBe(r);
    expect(extractRecords({ records: r })).toBe(r);
    expect(extractRecords(null)).toEqual([]);
  });
});

describe("vigia do WhatsApp — quando avisar", () => {
  const at11 = sp("2026-11-17T11:00:00");

  it("open e nada recebido há mais de 90 min no expediente → avisa", () => {
    const d = decideAlert({ state: "open", summary: sum(at11 - 91 * MIN), nowMs: at11, lastAlertMs: null });
    expect(d).toEqual({ alert: true, reason: "alert", sinceMs: at11 - 91 * MIN });
  });

  it("recebeu há 90 min ou menos → não avisa", () => {
    expect(decideAlert({ state: "open", summary: sum(at11 - 90 * MIN), nowMs: at11, lastAlertMs: null }).reason).toBe("receiving");
    expect(decideAlert({ state: "open", summary: sum(at11 - 5 * MIN), nowMs: at11, lastAlertMs: null }).alert).toBe(false);
  });

  it("instância fora do ar (close/connecting) não é zumbi", () => {
    for (const state of ["close", "connecting", "not_found", "unknown"]) {
      expect(decideAlert({ state, summary: sum(at11 - 600 * MIN), nowMs: at11, lastAlertMs: null }).reason).toBe("not_open");
    }
  });

  it("fora das 8h–20h de São Paulo não avisa", () => {
    const night = sp("2026-11-17T21:00:00");
    expect(decideAlert({ state: "open", summary: sum(night - 600 * MIN), nowMs: night, lastAlertMs: null }).reason).toBe("outside_hours");
    const early = sp("2026-11-17T07:59:00");
    expect(decideAlert({ state: "open", summary: sum(early - 600 * MIN), nowMs: early, lastAlertMs: null }).reason).toBe("outside_hours");
    expect(inWatchWindow(sp("2026-11-17T08:00:00"))).toBe(true);
    expect(inWatchWindow(sp("2026-11-17T19:59:00"))).toBe(true);
    expect(inWatchWindow(sp("2026-11-17T20:00:00"))).toBe(false);
  });

  it("a noite quieta não conta: o 1º aviso possível do dia é às 9h30", () => {
    const lastNight = sp("2026-11-16T19:00:00");
    expect(openOfDay(sp("2026-11-17T09:00:00"))).toBe(sp("2026-11-17T08:00:00"));
    expect(decideAlert({ state: "open", summary: sum(lastNight), nowMs: sp("2026-11-17T08:15:00"), lastAlertMs: null }).alert).toBe(false);
    expect(decideAlert({ state: "open", summary: sum(lastNight), nowMs: sp("2026-11-17T09:30:00"), lastAlertMs: null }).alert).toBe(false);
    const d = decideAlert({ state: "open", summary: sum(lastNight), nowMs: sp("2026-11-17T09:31:00"), lastAlertMs: null });
    expect(d.alert).toBe(true);
    expect(d.sinceMs).toBe(lastNight); // a mensagem mostra desde quando não chega nada
  });

  it("no fim do dia (UTC já no dia seguinte) o expediente é o de São Paulo", () => {
    const now = sp("2026-11-17T19:45:00"); // 22:45 UTC
    expect(openOfDay(now)).toBe(sp("2026-11-17T08:00:00"));
    expect(decideAlert({ state: "open", summary: sum(sp("2026-11-17T18:00:00")), nowMs: now, lastAlertMs: null }).alert).toBe(true);
  });

  it("no máximo um aviso a cada 6 horas", () => {
    const s = sum(at11 - 300 * MIN);
    expect(decideAlert({ state: "open", summary: s, nowMs: at11, lastAlertMs: at11 - 5 * 60 * MIN }).reason).toBe("cooldown");
    expect(decideAlert({ state: "open", summary: s, nowMs: at11, lastAlertMs: at11 - 6 * 60 * MIN }).alert).toBe(true);
  });

  it("50 últimas só enviadas: usa a mais antiga da página como limite", () => {
    const old = decideAlert({ state: "open", summary: sum(null, at11 - 120 * MIN), nowMs: at11, lastAlertMs: null });
    expect(old).toEqual({ alert: true, reason: "alert", sinceMs: at11 - 120 * MIN });
    const busy = decideAlert({ state: "open", summary: sum(null, at11 - 30 * MIN), nowMs: at11, lastAlertMs: null });
    expect(busy.reason).toBe("receiving");
  });

  it("sem nenhuma mensagem na instância não dá para saber → não avisa", () => {
    expect(decideAlert({ state: "open", summary: sum(null, null), nowMs: at11, lastAlertMs: null }).reason).toBe("no_data");
  });
});

describe("vigia do WhatsApp — mensagem", () => {
  it("mostra a hora de São Paulo; outro dia leva a data", () => {
    const now = sp("2026-11-17T15:00:00");
    expect(formatSince(sp("2026-11-17T09:05:00"), now)).toBe("09:05");
    expect(formatSince(sp("2026-11-16T19:40:00"), now)).toBe("16/11 às 19:40");
  });

  it("texto do aviso pede desconectar e ler o QR de novo", () => {
    const t = alertText(sp("2026-11-17T09:05:00"), sp("2026-11-17T11:00:00"));
    expect(t).toContain("WhatsApp da loja parou de receber mensagens desde 09:05 — desconecte e leia o QR de novo");
  });

  it("mesmo número em duas lojas é checado uma vez só", () => {
    expect(instanceKey({ api_url: "https://Evo.example.com/", instance_name: "Loja" }))
      .toBe(instanceKey({ api_url: "https://evo.example.com", instance_name: "Loja" }));
    expect(instanceKey({ api_url: "https://evo.example.com", instance_name: "Loja" }))
      .not.toBe(instanceKey({ api_url: "https://evo.example.com", instance_name: "Outra" }));
  });
});
