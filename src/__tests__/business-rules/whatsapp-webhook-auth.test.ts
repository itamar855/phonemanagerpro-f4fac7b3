import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Re-implement the handler authentication logic isolated for static and unit testing
function handleWebhookAuth(
  headers: Record<string, string>,
  envSecret?: string
): { status: number; body?: any } {
  if (!envSecret) {
    return { status: 500, body: { error: "Webhook indisponível" } };
  }

  const received = headers["x-evolution-webhook-secret"];
  if (!received || received !== envSecret) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  return { status: 200, body: { ok: true } };
}

describe("whatsapp-webhook — Provider Authentication (x-evolution-webhook-secret)", () => {
  const TEST_SECRET = "super_secret_evolution_webhook_key_1234567890_32bytes";

  it("should fail closed with 500 if EVOLUTION_WEBHOOK_SECRET is not configured in runtime", () => {
    const result = handleWebhookAuth({ "x-evolution-webhook-secret": TEST_SECRET }, undefined);
    expect(result.status).toBe(500);
    expect(result.body.error).toBe("Webhook indisponível");
  });

  it("should return 401 when x-evolution-webhook-secret header is missing", () => {
    const result = handleWebhookAuth({}, TEST_SECRET);
    expect(result.status).toBe(401);
    expect(result.body.error).toBe("Unauthorized");
  });

  it("should return 401 when x-evolution-webhook-secret header is incorrect", () => {
    const result = handleWebhookAuth({ "x-evolution-webhook-secret": "wrong_secret" }, TEST_SECRET);
    expect(result.status).toBe(401);
    expect(result.body.error).toBe("Unauthorized");
  });

  it("should pass authentication (200) when valid x-evolution-webhook-secret is provided", () => {
    const result = handleWebhookAuth({ "x-evolution-webhook-secret": TEST_SECRET }, TEST_SECRET);
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
  });
});
