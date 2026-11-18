import { describe, expect, it } from "vitest";
import {
  contactLid,
  matchContactByName,
  normalizeName,
  phoneFromEvolutionContacts,
  phoneJidFrom,
  resolveContactJid,
  stripBase64,
  withResolvedPhone,
} from "../../../supabase/functions/whatsapp-webhook/parse.ts";

const LID = "123456789012345@lid";
const PHONE = "5587999112233@s.whatsapp.net";

describe("contatos ocultos (@lid) — identificação", () => {
  it("acha o lid em remoteJid, com ou sem o número junto", () => {
    expect(contactLid({ remoteJid: LID })).toBe(LID);
    expect(contactLid({ remoteJid: LID, remoteJidAlt: PHONE })).toBe(LID);
  });

  it("acha o lid em remoteJidAlt quando remoteJid já é o número", () => {
    expect(contactLid({ remoteJid: PHONE, remoteJidAlt: LID })).toBe(LID);
  });

  it("ignora conversas normais, grupos, status e canais", () => {
    expect(contactLid({ remoteJid: PHONE })).toBeNull();
    expect(contactLid({ remoteJid: "1203630@g.us", participant: LID })).toBeNull();
    expect(contactLid({ remoteJid: "status@broadcast" })).toBeNull();
    expect(contactLid({ remoteJid: "123@newsletter" })).toBeNull();
    expect(contactLid(undefined)).toBeNull();
  });

  it("resolveContactJid continua devolvendo null para @lid sem número (o webhook resolve depois)", () => {
    expect(resolveContactJid({ remoteJid: LID })).toBeNull();
    expect(resolveContactJid({ remoteJid: LID, remoteJidAlt: PHONE })).toBe(PHONE);
  });
});

describe("phoneJidFrom", () => {
  it("aceita jid, @c.us, dígitos e número formatado", () => {
    expect(phoneJidFrom(PHONE)).toBe(PHONE);
    expect(phoneJidFrom("5587999112233@c.us")).toBe(PHONE);
    expect(phoneJidFrom("5587999112233")).toBe(PHONE);
    expect(phoneJidFrom("+55 (87) 99911-2233")).toBe(PHONE);
    expect(phoneJidFrom(5587999112233)).toBe(PHONE);
  });

  it("recusa lid, grupo, id interno e números curtos", () => {
    expect(phoneJidFrom(LID)).toBeNull();
    expect(phoneJidFrom("1203630@g.us")).toBeNull();
    expect(phoneJidFrom("cm3x9a0b10001abcd")).toBeNull();
    expect(phoneJidFrom("12345")).toBeNull();
    expect(phoneJidFrom(null)).toBeNull();
    expect(phoneJidFrom({})).toBeNull();
  });
});

describe("phoneFromEvolutionContacts (/chat/findContacts)", () => {
  it("lê o número de campos alternativos do registro do lid", () => {
    expect(phoneFromEvolutionContacts([{ id: "cm3x9a0b10001abcd", remoteJid: LID, pushName: "Tekcell", remoteJidAlt: PHONE }], LID)).toBe(PHONE);
    expect(phoneFromEvolutionContacts([{ remoteJid: LID, phoneNumber: "5587999112233" }], LID)).toBe(PHONE);
    expect(phoneFromEvolutionContacts({ remoteJid: PHONE, lid: LID }, LID)).toBe(PHONE);
  });

  it("sem número, registro de outro contato ou resposta vazia → null", () => {
    expect(phoneFromEvolutionContacts([{ id: "cm3x9a0b10001abcd", remoteJid: LID, pushName: "Tekcell" }], LID)).toBeNull();
    expect(phoneFromEvolutionContacts([{ remoteJid: PHONE, pushName: "Outro" }], LID)).toBeNull();
    expect(phoneFromEvolutionContacts([], LID)).toBeNull();
    expect(phoneFromEvolutionContacts(null, LID)).toBeNull();
    expect(phoneFromEvolutionContacts({ raw: "<html>erro</html>" }, LID)).toBeNull();
  });

  it("números diferentes para o mesmo lid → não arrisca", () => {
    expect(phoneFromEvolutionContacts([
      { remoteJid: LID, remoteJidAlt: PHONE },
      { remoteJid: LID, remoteJidAlt: "5587988887777@s.whatsapp.net" },
    ], LID)).toBeNull();
  });
});

describe("matchContactByName (último recurso)", () => {
  const contacts = [
    { name: "FastPhone Distribuidora", phone: "5511988887777" },
    { name: "Tekcell", phone: "5587999112233" },
    { name: "Maria", phone: "5587911112222" },
    { name: "maria", phone: "5587933334444" },
    { name: "Sem Telefone", phone: null },
  ];

  it("usa o contato quando há exatamente um com o mesmo nome (sem acento/caixa)", () => {
    expect(matchContactByName(contacts, "tekcell")).toBe(PHONE);
    expect(matchContactByName(contacts, "  FastPhone   Distribuidora ")).toBe("5511988887777@s.whatsapp.net");
    expect(matchContactByName([{ name: "José Peças", phone: "5587999112233" }], "jose pecas")).toBe(PHONE);
  });

  it("dois contatos com o mesmo nome, nenhum ou sem telefone → null", () => {
    expect(matchContactByName(contacts, "Maria")).toBeNull();
    expect(matchContactByName(contacts, "João")).toBeNull();
    expect(matchContactByName(contacts, "Sem Telefone")).toBeNull();
  });

  it("nome genérico ou curto não vale", () => {
    const generic = [{ name: "Lead WhatsApp", phone: "5587999112233" }, { name: "Jo", phone: "5587911112222" }];
    expect(matchContactByName(generic, "Lead WhatsApp")).toBeNull();
    expect(matchContactByName(generic, "Jo")).toBeNull();
    expect(matchContactByName(generic, "")).toBeNull();
    expect(matchContactByName(generic, undefined)).toBeNull();
  });

  it("normalizeName", () => {
    expect(normalizeName("  Ação  Çelular ")).toBe("acao celular");
  });
});

describe("fila de espera", () => {
  const payload = {
    event: "messages.upsert",
    instance: "Restaura Phone Brasil",
    data: {
      key: { remoteJid: LID, fromMe: false, id: "3EB0ABC" },
      pushName: "Tekcell",
      message: { imageMessage: { caption: "nota", base64: "AAAA" } },
      base64: "BBBB",
    },
  };

  it("stripBase64 tira a mídia embutida sem mexer no resto", () => {
    const out = stripBase64(payload);
    expect(out.data.base64).toBeUndefined();
    expect((out.data.message.imageMessage as { base64?: string }).base64).toBeUndefined();
    expect(out.data.message.imageMessage.caption).toBe("nota");
    expect(payload.data.base64).toBe("BBBB");
  });

  it("withResolvedPhone preenche remoteJidAlt e a mensagem passa a ter número", () => {
    const out = withResolvedPhone(payload, PHONE);
    expect(out.data.key).toEqual({ remoteJid: LID, fromMe: false, id: "3EB0ABC", remoteJidAlt: PHONE });
    expect(resolveContactJid(out.data.key)).toBe(PHONE);
    expect((payload.data.key as { remoteJidAlt?: string }).remoteJidAlt).toBeUndefined();
  });
});
