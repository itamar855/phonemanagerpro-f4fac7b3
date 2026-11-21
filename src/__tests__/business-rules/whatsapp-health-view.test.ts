import { describe, expect, it } from "vitest";
import { healthView, whenSp, type WhatsAppHealthRow } from "../../modules/crm/lib/whatsappHealth";

const sp = (iso: string) => new Date(`${iso}-03:00`).toISOString();
const now = Date.parse(`2026-11-20T15:00:00-03:00`);
const row = (over: Partial<WhatsAppHealthRow> = {}): WhatsAppHealthRow => ({
  config_id: "c", store_id: "s", store_name: "Restaura Phone Brasil (Vila Eulalia)", instance_name: "i",
  state: "open", checked_at: sp("2026-11-20T14:50:00"),
  last_inbound_at: sp("2026-11-20T14:55:00"), last_direct_inbound_at: sp("2026-11-20T14:40:00"),
  webhook_ok: true, webhook_issue: null, webhook_fixed_at: null, evo_errors: 0, last_error: null, last_error_at: null,
  last_sync_at: null, synced_24h: 0, lid_pending: 0, probe_sent_at: null, probe_ok_at: null, last_alert_at: null, last_alert_kind: null,
  ...over,
});

describe("card Saúde do WhatsApp", () => {
  it("normal: recebendo", () => {
    const v = healthView(row(), now);
    expect(v.tone).toBe("ok");
    expect(v.details[0]).toBe("Última conversa de cliente: 14:40");
  });

  it("grupos chegando, conversas de clientes paradas há mais de 2h30 → vermelho", () => {
    const v = healthView(row({ last_direct_inbound_at: sp("2026-11-20T12:10:00") }), now);
    expect(v.tone).toBe("bad");
    expect(v.headline).toBe("Conversas de clientes não chegam desde 12:10");
  });

  it("nada chegando há mais de 90 min no expediente → vermelho", () => {
    expect(healthView(row({ last_inbound_at: sp("2026-11-20T12:00:00"), last_direct_inbound_at: sp("2026-11-19T18:00:00") }), now).headline)
      .toBe("Não recebe nada desde 12:00");
  });

  it("de manhã cedo a noite quieta não conta", () => {
    const early = Date.parse(`2026-11-20T08:40:00-03:00`);
    expect(healthView(row({ checked_at: sp("2026-11-20T08:30:00"), last_inbound_at: sp("2026-11-19T21:00:00"), last_direct_inbound_at: sp("2026-11-19T19:00:00") }), early).tone).toBe("ok");
  });

  it("Evolution com erro, desconectado, webhook errado, vigia parado", () => {
    expect(healthView(row({ evo_errors: 2, last_error: "Servidor do WhatsApp indisponível" }), now).headline).toBe("Servidor do WhatsApp com erro");
    expect(healthView(row({ state: "close" }), now).headline).toBe("Desconectado");
    expect(healthView(row({ webhook_ok: false, webhook_issue: "endereço errado" }), now).headline).toBe("Webhook errado: endereço errado");
    expect(healthView(row({ checked_at: sp("2026-11-20T13:00:00") }), now).tone).toBe("warn");
    expect(healthView(row({ checked_at: null }), now).headline).toBe("Ainda não checado pelo vigia");
  });

  it("mostra recuperadas, fila do @lid e teste entre lojas quando houver", () => {
    const d = healthView(row({ synced_24h: 3, lid_pending: 2, probe_ok_at: sp("2026-11-20T14:20:00") }), now).details;
    expect(d).toContain("Recuperadas automaticamente (24 h): 3");
    expect(d).toContain("Esperando o número do contato: 2");
    expect(d).toContain("Teste entre as lojas chegou: 14:20");
  });

  it("data de outro dia aparece com dia/mês", () => {
    expect(whenSp(sp("2026-11-19T18:05:00"), now)).toBe("19/11 18:05");
    expect(whenSp(null, now)).toBe("—");
  });
});
