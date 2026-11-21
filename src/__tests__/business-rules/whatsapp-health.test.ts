import { describe, expect, it } from "vitest";
import {
  decideHealthAlert, healthAlertText, isDirectJid, latest, needMorePages, probeState, reconcileCandidates, replayOutcome,
  scanStopAt, scanSummary, shouldProbe, webhookIssues, type HealthInput,
} from "../../../supabase/functions/_shared/whatsapp-health-core";

const sp = (iso: string) => Date.parse(`${iso}-03:00`);
const MIN = 60_000;
const CLIENT = "5587999112233@s.whatsapp.net";
const GROUP = "120363012345678901@g.us";
const OTHER_STORE = "5587988887777";
const rec = (id: string, atMs: number, fromMe: boolean, remoteJid = CLIENT, extra: Record<string, unknown> = {}) => ({
  key: { id, fromMe, remoteJid },
  messageTimestamp: Math.floor(atMs / 1000),
  messageType: "conversation",
  ...extra,
});

describe("saúde do WhatsApp — leitura", () => {
  it("separa conversa direta de grupo e não conta o teste da outra loja como cliente", () => {
    const now = sp("2026-11-20T15:00:00");
    const s = scanSummary([
      rec("a", now - 5 * MIN, false, GROUP),
      rec("b", now - 3 * MIN, false, `${OTHER_STORE}@s.whatsapp.net`),
      rec("c", now - 200 * MIN, false),
      rec("d", now - 1 * MIN, true),
    ], [OTHER_STORE]);
    expect(s.lastInboundMs).toBe(now - 3 * MIN);
    expect(s.lastGroupInboundMs).toBe(now - 5 * MIN);
    expect(s.lastDirectInboundMs).toBe(now - 200 * MIN);
    expect(s.oldestMs).toBe(now - 200 * MIN);
  });

  it("contato oculto (@lid) é conversa direta; grupo, transmissão e status não", () => {
    expect(isDirectJid("123456789012345@lid")).toBe(true);
    expect(isDirectJid(CLIENT)).toBe(true);
    expect(isDirectJid(GROUP)).toBe(false);
    expect(isDirectJid("status@broadcast")).toBe(false);
    expect(isDirectJid("123@newsletter")).toBe(false);
  });

  it("guarda sempre o mais recente entre o gravado e o lido", () => {
    expect(latest("2026-11-20T10:00:00Z", Date.parse("2026-11-20T09:00:00Z"))).toBe(Date.parse("2026-11-20T10:00:00Z"));
    expect(latest(null, 5)).toBe(5);
    expect(latest("2026-11-20T10:00:00Z", null)).toBe(Date.parse("2026-11-20T10:00:00Z"));
  });

  it("lê páginas até passar da leitura anterior (com 30 min de sobra), no máximo 8", () => {
    const now = sp("2026-11-20T15:00:00");
    const stop = scanStopAt(now, new Date(now - 15 * MIN).toISOString());
    expect(stop).toBe(now - 45 * MIN);
    expect(scanStopAt(now, null)).toBe(now - 6 * 60 * MIN);
    expect(needMorePages({ page: 1, pageCount: 50, oldestMs: now - 20 * MIN, stopAtMs: stop })).toBe(true);
    expect(needMorePages({ page: 2, pageCount: 50, oldestMs: now - 50 * MIN, stopAtMs: stop })).toBe(false);
    expect(needMorePages({ page: 8, pageCount: 50, oldestMs: now - 20 * MIN, stopAtMs: stop })).toBe(false);
    expect(needMorePages({ page: 1, pageCount: 12, oldestMs: now - 20 * MIN, stopAtMs: stop })).toBe(false);
  });
});

describe("saúde do WhatsApp — sincronização automática", () => {
  const now = sp("2026-11-20T15:00:00");

  it("reenvia só conversa direta, tipo suportado, que falta, nem nova nem velha demais, mais antiga primeiro", () => {
    const list = reconcileCandidates([
      rec("novo", now - 1 * MIN, false),
      rec("ok2", now - 10 * MIN, false),
      rec("ok1", now - 60 * MIN, true),
      rec("grupo", now - 30 * MIN, false, GROUP),
      rec("reacao", now - 30 * MIN, false, CLIENT, { messageType: "reactionMessage" }),
      rec("ja", now - 30 * MIN, false),
      rec("velho", now - 3 * 24 * 60 * MIN, false),
      rec("ok2", now - 10 * MIN, false),
    ], new Set(["ja"]), now);
    expect(list.map((r) => r.key.id)).toEqual(["ok1", "ok2"]);
  });

  it("respeita o limite por checagem", () => {
    const many = Array.from({ length: 80 }, (_, i) => rec(`m${i}`, now - (10 + i) * MIN, false));
    expect(reconcileCandidates(many, new Set(), now, 60)).toHaveLength(60);
  });

  it("resultado do reenvio: só erro do servidor tenta de novo", () => {
    expect(replayOutcome(200, { status: "success", crm: { message_id: "x" } })).toEqual({ result: "gravada", retry: false });
    expect(replayOutcome(200, { status: "success", crm: { skipped: true } })).toEqual({ result: "pulada", retry: false });
    expect(replayOutcome(200, { status: "pending", reason: "lid_unresolved" })).toEqual({ result: "fila_lid", retry: false });
    expect(replayOutcome(200, { status: "staff" })).toEqual({ result: "staff", retry: false });
    expect(replayOutcome(500, { error: "x" })).toEqual({ result: "erro_500", retry: true });
    expect(replayOutcome(0, null)).toEqual({ result: "erro_0", retry: true });
    expect(replayOutcome(401, null)).toEqual({ result: "nao_autorizado", retry: false });
  });
});

describe("saúde do WhatsApp — webhook", () => {
  const expected = { url: "https://x.supabase.co/functions/v1/whatsapp-webhook", secret: "s3cr3t" };
  const good = { enabled: true, url: expected.url, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE"], headers: { "x-evolution-webhook-secret": "s3cr3t" } };

  it("webhook certo não tem problema (aceita { webhook: … } e barra no fim)", () => {
    expect(webhookIssues(good, expected)).toEqual([]);
    expect(webhookIssues({ webhook: { ...good, url: `${expected.url}/` } }, expected)).toEqual([]);
  });

  it("aponta cada problema sem mostrar o segredo", () => {
    expect(webhookIssues(null, expected)).toEqual(["sem webhook"]);
    const bad = webhookIssues({ enabled: false, url: "https://outro/webhook", events: ["CONNECTION_UPDATE"], headers: { "x-evolution-webhook-secret": "velho" } }, expected);
    expect(bad).toEqual(["desligado", "endereço errado", "sem o evento de mensagens", "senha do webhook diferente"]);
    expect(bad.join(" ")).not.toContain("velho");
  });
});

describe("saúde do WhatsApp — teste entre as lojas", () => {
  it("só manda teste no expediente, depois de 1 h sem conversa direta, no máximo a cada 2 h", () => {
    const now = sp("2026-11-20T15:00:00");
    expect(shouldProbe({ nowMs: now, lastDirectInboundMs: now - 70 * MIN, lastProbeSentMs: null, probePending: false })).toBe(true);
    expect(shouldProbe({ nowMs: now, lastDirectInboundMs: now - 30 * MIN, lastProbeSentMs: null, probePending: false })).toBe(false);
    expect(shouldProbe({ nowMs: now, lastDirectInboundMs: now - 70 * MIN, lastProbeSentMs: now - 60 * MIN, probePending: false })).toBe(false);
    expect(shouldProbe({ nowMs: sp("2026-11-20T22:00:00"), lastDirectInboundMs: null, lastProbeSentMs: null, probePending: false })).toBe(false);
    // 8h30: a noite não conta, ainda não passou 1 h de expediente
    expect(shouldProbe({ nowMs: sp("2026-11-20T08:30:00"), lastDirectInboundMs: sp("2026-11-19T19:00:00"), lastProbeSentMs: null, probePending: false })).toBe(false);
  });

  it("teste chegou, esperando ou não chegou (10 min)", () => {
    const now = sp("2026-11-20T15:00:00");
    expect(probeState({ probeId: null, sentMs: null, seenIds: new Set(), nowMs: now })).toBe("none");
    expect(probeState({ probeId: "p", sentMs: now - 5 * MIN, seenIds: new Set(), nowMs: now })).toBe("waiting");
    expect(probeState({ probeId: "p", sentMs: now - 15 * MIN, seenIds: new Set(["p"]), nowMs: now })).toBe("arrived");
    expect(probeState({ probeId: "p", sentMs: now - 15 * MIN, seenIds: new Set(), nowMs: now })).toBe("missing");
  });
});

describe("saúde do WhatsApp — avisos", () => {
  const base = (over: Partial<HealthInput> = {}): HealthInput => ({
    nowMs: sp("2026-11-20T15:00:00"), state: "open", lastInboundMs: sp("2026-11-20T14:55:00"), lastDirectInboundMs: sp("2026-11-20T14:30:00"),
    evoErrors: 0, probe: "none", webhookIssues: [], webhookFixed: false, lastAlertMs: null, lastAlertKind: null, ...over,
  });

  it("tudo normal: sem aviso", () => {
    expect(decideHealthAlert(base())).toBeNull();
  });

  it("incidente de 20/11: grupos chegando e nenhuma conversa direta há mais de 2h30 → avisa", () => {
    const d = decideHealthAlert(base({ lastDirectInboundMs: sp("2026-11-20T12:10:00") }));
    expect(d?.kind).toBe("direct_silent");
    expect(decideHealthAlert(base({ lastDirectInboundMs: sp("2026-11-20T13:00:00") }))).toBeNull();
    // sem grupos chegando também, o caso é do "zumbi" (outro aviso)
    expect(decideHealthAlert(base({ lastDirectInboundMs: sp("2026-11-20T12:10:00"), lastInboundMs: sp("2026-11-20T12:10:00") }))).toBeNull();
  });

  it("teste da outra loja não chegou → avisa na hora", () => {
    expect(decideHealthAlert(base({ probe: "missing" }))?.kind).toBe("probe_missing");
  });

  it("Evolution com erro 3 vezes seguidas → avisa, mesmo fora do expediente", () => {
    expect(decideHealthAlert(base({ evoErrors: 2 }))).toBeNull();
    expect(decideHealthAlert(base({ evoErrors: 3, nowMs: sp("2026-11-20T23:00:00") }))?.kind).toBe("evolution_down");
  });

  it("webhook errado que não se corrigiu → avisa; corrigido sozinho → não", () => {
    expect(decideHealthAlert(base({ webhookIssues: ["senha do webhook diferente"] }))?.kind).toBe("webhook_broken");
    expect(decideHealthAlert(base({ webhookIssues: ["senha do webhook diferente"], webhookFixed: true }))).toBeNull();
  });

  it("instância desconectada no expediente → avisa", () => {
    expect(decideHealthAlert(base({ state: "close" }))?.kind).toBe("disconnected");
    expect(decideHealthAlert(base({ state: "connecting" }))).toBeNull();
  });

  it("mesmo aviso no máximo a cada 6 h; outro tipo de aviso passa", () => {
    const now = sp("2026-11-20T15:00:00");
    expect(decideHealthAlert(base({ probe: "missing", lastAlertMs: now - 60 * MIN, lastAlertKind: "probe_missing" }))).toBeNull();
    // "zumbi", teste que não chegou, conversas paradas e desconectado pedem a mesma ação: não repete
    expect(decideHealthAlert(base({ probe: "missing", lastAlertMs: now - 60 * MIN, lastAlertKind: "zombie" }))).toBeNull();
    expect(decideHealthAlert(base({ probe: "missing", lastAlertMs: now - 60 * MIN, lastAlertKind: null }))).toBeNull();
    expect(decideHealthAlert(base({ evoErrors: 3, lastAlertMs: now - 60 * MIN, lastAlertKind: "zombie" }))?.kind).toBe("evolution_down");
    expect(decideHealthAlert(base({ probe: "missing", lastAlertMs: now - 7 * 60 * MIN, lastAlertKind: "zombie" }))?.kind).toBe("probe_missing");
  });

  it("textos falam a língua da loja e dizem o que fazer", () => {
    const t = healthAlertText("direct_silent", "Vila Eulalia", sp("2026-11-20T12:10:00"));
    expect(t.title).toContain("Vila Eulalia");
    expect(t.body).toContain("20/11 12:10");
    expect(t.body).toContain("Conectar (QR Code)");
    expect(healthAlertText("webhook_broken", "X", null, ["endereço errado"]).body).toContain("endereço errado");
  });
});
