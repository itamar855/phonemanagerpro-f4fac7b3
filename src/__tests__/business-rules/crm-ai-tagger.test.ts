import { describe, expect, it } from "vitest";
import { mergeTags, parseTagging, sameTags, taggingSystemPrompt } from "../../../supabase/functions/_shared/ai-tagger-core";

const LIST = ["Quente", "Morno", "Frio", "Conserto de tela", "Bateria", "Não liga", "Quer iPhone", "Orçamento enviado"];

describe("IA que etiqueta o lead", () => {
  it("prompt traz a lista exata e o estado atual", () => {
    const p = taggingSystemPrompt("Loja X", LIST, { lead_kind: null, tags: ["vip"] });
    expect(p).toContain('"Conserto de tela"');
    expect(p).toContain("Etiquetas atuais do lead: vip");
    expect(p).toContain("Tipo atual: não definido");
  });

  it("aceita só etiquetas da lista, com a grafia da lista (sem acento/maiúscula importar)", () => {
    const d = parseTagging(JSON.stringify({ lead_kind: "assistencia", tags: ["nao liga", "QUENTE", "Inventada", "Quente", 3] }), LIST);
    expect(d).toEqual({ lead_kind: "assistencia", tags: ["Não liga", "Quente"] });
  });

  it("reconhece fornecedor e o prompt explica quando usar", () => {
    expect(parseTagging('{"lead_kind":"fornecedor","tags":[]}', LIST)).toEqual({ lead_kind: "fornecedor", tags: [] });
    expect(taggingSystemPrompt("Loja X", LIST, { lead_kind: null, tags: [] })).toMatch(/"fornecedor" se é empresa/);
  });

  it("tipo desconhecido vira null; resposta inválida não etiqueta nada", () => {
    expect(parseTagging('{"lead_kind":"desconhecido","tags":[]}', LIST)).toEqual({ lead_kind: null, tags: [] });
    expect(parseTagging("isso não é json", LIST)).toEqual({ lead_kind: null, tags: [] });
    expect(parseTagging("```json\n{\"lead_kind\":\"venda\",\"tags\":[\"Quer iPhone\"]}\n```", LIST)).toEqual({ lead_kind: "venda", tags: ["Quer iPhone"] });
  });

  it("duas temperaturas na resposta: fica a primeira", () => {
    expect(parseTagging({ lead_kind: "venda", tags: ["Morno", "Quer iPhone", "Quente"] }, LIST).tags).toEqual(["Morno", "Quer iPhone"]);
  });

  it("junção: temperatura nova troca a antiga, o resto soma, nada se repete, manuais ficam", () => {
    expect(mergeTags(["vip", "Morno", "Bateria"], ["Quente", "bateria", "Orçamento enviado"])).toEqual(["vip", "Bateria", "Quente", "Orçamento enviado"]);
    expect(mergeTags(["Frio"], ["Quer iPhone"])).toEqual(["Frio", "Quer iPhone"]);
    expect(mergeTags([], [])).toEqual([]);
  });

  it("detecta quando nada mudou (não grava à toa)", () => {
    expect(sameTags(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameTags(["a"], ["a", "b"])).toBe(false);
  });
});
