// Utilidades HTTP e de acesso comuns às Edge Functions do CRM.
import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-evolution-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500) console.error(error);
  return json({ error: (error as Error)?.message || "Erro interno" }, status);
}

export function getServiceRoleKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const key = JSON.parse(raw)?.["default"];
      if (typeof key === "string" && key.startsWith("sb_secret_")) return key;
    } catch { /* formato antigo */ }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase privileged credential unavailable.");
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Usuário do token Authorization (o id que vier no corpo nunca é usado). */
export async function requireUser(req: Request, admin: SupabaseClient): Promise<User> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError(401, "Não autenticado.");
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) throw new HttpError(401, "Sessão inválida.");
  return data.user;
}

export async function requireMember(admin: SupabaseClient, userId: string, storeId: string) {
  const { data } = await admin.from("member_stores").select("id").eq("user_id", userId).eq("store_id", storeId).limit(1);
  if (!data || data.length === 0) throw new HttpError(403, "Você não tem acesso a esta loja.");
}

export const MANAGER_ROLES = ["admin", "gerente", "dono"];

export async function isManager(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r: any) => MANAGER_ROLES.includes(String(r.role)));
}

export async function requireManager(admin: SupabaseClient, userId: string) {
  if (!(await isManager(admin, userId))) throw new HttpError(403, "Apenas admin, dono ou gerente.");
}
