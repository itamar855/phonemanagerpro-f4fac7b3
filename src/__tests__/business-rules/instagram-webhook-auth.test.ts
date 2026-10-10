import { describe, it, expect } from "vitest";

// ─── HMAC Verification Logic (identical to Edge Function: crypto.subtle.verify on rawBytes) ─
async function verifyMetaHmacSha256(
  rawBytes: Uint8Array,
  signatureHeader: string | null | undefined,
  appSecret?: string
): Promise<{ status: number; error?: string }> {
  if (!appSecret) {
    return { status: 500, error: "Webhook indisponível" };
  }

  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return { status: 401, error: "Assinatura do webhook ausente" };
  }

  const hexString = signatureHeader.slice(7).trim().toLowerCase();
  if (hexString.length !== 64 || !/^[0-9a-f]{64}$/.test(hexString)) {
    return { status: 401, error: "Assinatura do webhook inválida" };
  }

  try {
    const signatureBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      signatureBytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as unknown as BufferSource,
      rawBytes as unknown as BufferSource
    );

    return isValid ? { status: 200 } : { status: 401, error: "Assinatura do webhook inválida" };
  } catch (err) {
    return { status: 401, error: "Assinatura do webhook inválida" };
  }
}

// ─── Panel Action Validation Logic (identical to Edge Function) ─────────────
interface UserMock {
  id: string;
}

interface RoleMock {
  role?: string;
  permissions?: Record<string, boolean>;
}

function handlePanelAuth(
  type: "sync-profile" | "send-message" | "debug-token",
  authHeader: string | null | undefined,
  user?: UserMock | null,
  roleData?: RoleMock | null,
  callerStoreIds: string[] = [],
  actionParams: {
    userId?: string;
    storeId?: string;
    message?: string;
    leadStoreIdServerSide?: string;
  } = {}
): { status: number; error?: string } {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { status: 401, error: "Token de autorização ausente ou malformado" };
  }

  if (!user) {
    return { status: 401, error: "Sessão inválida ou expirada" };
  }

  const callerRole = roleData?.role;
  const callerPermissions = roleData?.permissions ?? {};

  // Regra canônica: dono NÃO tem bypass automático.
  // Modelo canônico comprovado: admin possui bypass de módulo, outros exigem permissions.leads === true
  const hasLeadsPermission = callerRole === "admin" || callerPermissions.leads === true;
  if (!hasLeadsPermission) {
    return { status: 403, error: "Acesso negado: usuário não possui permissão para o módulo de Leads" };
  }

  if (callerStoreIds.length === 0) {
    return { status: 403, error: "Acesso negado: usuário não possui nenhuma loja vinculada" };
  }

  let targetStoreId: string | null = null;

  if (type === "debug-token") {
    if (callerRole !== "admin" || callerPermissions.configuracoes !== true) {
      return { status: 403, error: "Acesso negado para diagnóstico" };
    }
    if (!actionParams.storeId) {
      return { status: 400, error: "storeId é obrigatório para diagnóstico" };
    }
    if (!callerStoreIds.includes(actionParams.storeId)) {
      return { status: 403, error: "Acesso negado: loja fora do escopo do usuário" };
    }
    targetStoreId = actionParams.storeId;
  } else if (type === "sync-profile") {
    if (!actionParams.userId) {
      return { status: 400, error: "Parâmetro obrigatório ausente (userId)" };
    }
    if (actionParams.storeId) {
      if (!callerStoreIds.includes(actionParams.storeId)) {
        return { status: 403, error: "Acesso negado: loja fora do escopo do usuário" };
      }
      targetStoreId = actionParams.storeId;
    } else {
      if (!actionParams.leadStoreIdServerSide) {
        return { status: 400, error: "Não foi possível determinar a loja do lead; forneça storeId" };
      }
      if (!callerStoreIds.includes(actionParams.leadStoreIdServerSide)) {
        return { status: 403, error: "Acesso negado: loja fora do escopo do usuário" };
      }
      targetStoreId = actionParams.leadStoreIdServerSide;
    }
  } else if (type === "send-message") {
    if (!actionParams.userId || !actionParams.message) {
      return { status: 400, error: "Parâmetros obrigatórios ausentes (userId, message)" };
    }
    const leadStoreId = actionParams.leadStoreIdServerSide;
    if (!leadStoreId) {
      return { status: 404, error: "Lead não encontrado ou sem loja associada" };
    }
    if (!callerStoreIds.includes(leadStoreId)) {
      return { status: 403, error: "Acesso negado: lead pertence a loja fora do escopo do usuário" };
    }
    targetStoreId = leadStoreId;
  }

  return { status: 200 };
}

// ─── Helper para gerar assinatura HMAC real via crypto.subtle nos testes ────
async function generateMetaSignature(bytes: Uint8Array, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, bytes as unknown as BufferSource);
  const hex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

describe("instagram-webhook — Hardening Cirúrgico Completo", () => {
  const APP_SECRET = "0123456789abcdef0123456789abcdef";
  const STORE_A = "store-aaa-111";
  const STORE_B = "store-bbb-222";

  describe("Validação Criptográfica Meta Webhook (crypto.subtle.verify sobre rawBytes)", () => {
    const rawString = JSON.stringify({
      object: "instagram",
      entry: [{ id: "123", time: 1670000000, messaging: [{ message: { text: "Olá" } }] }],
    });
    const rawBytes = new TextEncoder().encode(rawString);

    it("POST com assinatura HMAC correta sobre rawBytes -> passa com 200", async () => {
      const validSig = await generateMetaSignature(rawBytes, APP_SECRET);
      const result = await verifyMetaHmacSha256(rawBytes, validSig, APP_SECRET);
      expect(result.status).toBe(200);
    });

    it("alteração de 1 byte no rawBytes -> falha com 401", async () => {
      const validSig = await generateMetaSignature(rawBytes, APP_SECRET);
      const tamperedBytes = new Uint8Array(rawBytes);
      tamperedBytes[0] = tamperedBytes[0] ^ 0xff; // inverte 1 byte
      const result = await verifyMetaHmacSha256(tamperedBytes, validSig, APP_SECRET);
      expect(result.status).toBe(401);
      expect(result.error).toBe("Assinatura do webhook inválida");
    });

    it("header ausente -> 401", async () => {
      const result = await verifyMetaHmacSha256(rawBytes, null, APP_SECRET);
      expect(result.status).toBe(401);
      expect(result.error).toBe("Assinatura do webhook ausente");
    });

    it("header malformado (sem prefixo sha256=) -> 401", async () => {
      const hex = "a".repeat(64);
      const result = await verifyMetaHmacSha256(rawBytes, hex, APP_SECRET);
      expect(result.status).toBe(401);
      expect(result.error).toBe("Assinatura do webhook ausente");
    });

    it("hex com comprimento inválido (!== 64 caracteres) -> 401", async () => {
      const result = await verifyMetaHmacSha256(rawBytes, "sha256=abcdef", APP_SECRET);
      expect(result.status).toBe(401);
      expect(result.error).toBe("Assinatura do webhook inválida");
    });

    it("hex com caracteres não-hexadecimais -> 401", async () => {
      const invalidHex = "sha256=" + "g".repeat(64);
      const result = await verifyMetaHmacSha256(rawBytes, invalidHex, APP_SECRET);
      expect(result.status).toBe(401);
      expect(result.error).toBe("Assinatura do webhook inválida");
    });

    it("APP_SECRET ausente no runtime -> 500 Fail Closed", async () => {
      const validSig = await generateMetaSignature(rawBytes, APP_SECRET);
      const result = await verifyMetaHmacSha256(rawBytes, validSig, undefined);
      expect(result.status).toBe(500);
      expect(result.error).toBe("Webhook indisponível");
    });
  });

  describe("Ações do Painel — Autenticação e Escopo Estrito de Lojas", () => {
    const adminUser = { id: "admin-1" };
    const adminRole = { role: "admin", permissions: { configuracoes: true, leads: true } };

    const sellerUser = { id: "seller-1" };
    const sellerRole = { role: "vendedor", permissions: { leads: true } };

    const sellerNoLeads = { id: "seller-2" };
    const sellerNoLeadsRole = { role: "vendedor", permissions: { leads: false } };

    const ownerUser = { id: "dono-1" };
    const ownerNoLeadsRole = { role: "dono", permissions: { leads: false } };

    it("send-message sem JWT -> 401", () => {
      const res = handlePanelAuth("send-message", null);
      expect(res.status).toBe(401);
    });

    it("token JWT inválido -> 401", () => {
      const res = handlePanelAuth("send-message", "Bearer token_falso", null);
      expect(res.status).toBe(401);
    });

    it("vendedor sem permissão leads -> 403", () => {
      const res = handlePanelAuth("send-message", "Bearer jwt", sellerNoLeads, sellerNoLeadsRole, [STORE_A], {
        userId: "ig-123",
        message: "teste",
        leadStoreIdServerSide: STORE_A,
      });
      expect(res.status).toBe(403);
    });

    it("dono sem permissão explícita de leads -> 403 (sem bypass automático)", () => {
      const res = handlePanelAuth("send-message", "Bearer jwt", ownerUser, ownerNoLeadsRole, [STORE_A], {
        userId: "ig-123",
        message: "teste",
        leadStoreIdServerSide: STORE_A,
      });
      expect(res.status).toBe(403);
    });

    it("admin possui bypass canônico de permissão leads -> 200 (se loja válida)", () => {
      const res = handlePanelAuth("send-message", "Bearer jwt", adminUser, { role: "admin", permissions: {} }, [STORE_A], {
        userId: "ig-123",
        message: "teste",
        leadStoreIdServerSide: STORE_A,
      });
      expect(res.status).toBe(200);
    });

    it("sync-profile cross-store (tentando acessar loja B sem pertencer a ela) -> 403", () => {
      const res = handlePanelAuth("sync-profile", "Bearer jwt", sellerUser, sellerRole, [STORE_A], {
        userId: "ig-123",
        storeId: STORE_B,
      });
      expect(res.status).toBe(403);
      expect(res.error).toContain("loja fora do escopo do usuário");
    });

    it("send-message cross-store (lead pertence à loja B, mas caller só tem loja A) -> 403", () => {
      const res = handlePanelAuth("send-message", "Bearer jwt", sellerUser, sellerRole, [STORE_A], {
        userId: "ig-123",
        message: "Olá",
        leadStoreIdServerSide: STORE_B,
      });
      expect(res.status).toBe(403);
      expect(res.error).toContain("lead pertence a loja fora do escopo do usuário");
    });

    it("debug-token cross-store (admin tenta inspecionar loja B sem tê-la em member_stores) -> 403", () => {
      const res = handlePanelAuth("debug-token", "Bearer jwt", adminUser, adminRole, [STORE_A], {
        storeId: STORE_B,
      });
      expect(res.status).toBe(403);
      expect(res.error).toContain("loja fora do escopo do usuário");
    });

    it("debug-token por usuário não-admin -> 403", () => {
      const res = handlePanelAuth("debug-token", "Bearer jwt", sellerUser, sellerRole, [STORE_A], {
        storeId: STORE_A,
      });
      expect(res.status).toBe(403);
      expect(res.error).toBe("Acesso negado para diagnóstico");
    });

    it("send-message com caller autorizado e loja correta -> 200", () => {
      const res = handlePanelAuth("send-message", "Bearer jwt", sellerUser, sellerRole, [STORE_A], {
        userId: "ig-123",
        message: "Olá",
        leadStoreIdServerSide: STORE_A,
      });
      expect(res.status).toBe(200);
    });

    it("sync-profile com caller autorizado e loja correta -> 200", () => {
      const res = handlePanelAuth("sync-profile", "Bearer jwt", sellerUser, sellerRole, [STORE_A], {
        userId: "ig-123",
        storeId: STORE_A,
      });
      expect(res.status).toBe(200);
    });

    it("sync-profile sem loja resolvível (sem storeId e sem lead server-side) -> 400", () => {
      const res = handlePanelAuth("sync-profile", "Bearer jwt", sellerUser, sellerRole, [STORE_A], {
        userId: "ig-123",
      });
      expect(res.status).toBe(400);
      expect(res.error).toContain("Não foi possível determinar a loja do lead; forneça storeId");
    });

    it("debug-token sem storeId -> 400", () => {
      const res = handlePanelAuth("debug-token", "Bearer jwt", adminUser, adminRole, [STORE_A], {});
      expect(res.status).toBe(400);
      expect(res.error).toContain("storeId é obrigatório para diagnóstico");
    });
  });
});
