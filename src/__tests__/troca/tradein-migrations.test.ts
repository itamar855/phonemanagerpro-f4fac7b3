// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- linhas cruas do Postgres */
/**
 * Testa a migration do simulador de troca num Postgres real em memória (PGlite),
 * com stubs mínimos do Supabase (auth.uid, papéis, member_stores, app_store_access).
 * Os testes dependem uns dos outros (mesmo banco), na ordem em que aparecem.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";

const MIGRATION = readFileSync(
  path.resolve(__dirname, "../../../supabase/migrations/20261125000000_tradein_module.sql"),
  "utf8",
);
const EMAIL = readFileSync(
  path.resolve(__dirname, "../../../supabase/migrations/20261126000000_tradein_customer_email.sql"),
  "utf8",
);

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const V1 = "00000000-0000-0000-0000-0000000000a1"; // vendedor loja A
const V2 = "00000000-0000-0000-0000-0000000000a2"; // outro vendedor loja A
const GA = "00000000-0000-0000-0000-0000000000a9"; // gerente loja A
const VB = "00000000-0000-0000-0000-0000000000b1"; // vendedor loja B
const ADM = "00000000-0000-0000-0000-0000000000ad"; // admin (sem member_stores)
const SALE = "50000000-0000-0000-0000-000000000001";

let db: PGlite;
const val = async <T = any>(sql: string, params: any[] = []): Promise<T> => {
  const r = await db.query<Record<string, T>>(sql, params);
  return r.rows[0] ? Object.values(r.rows[0])[0] : (undefined as T);
};
const errorOf = async (sql: string, params: any[] = []) => {
  try { await db.query(sql, params); return null; } catch (e: any) { return String(e.message); }
};
const asUser = async <T>(uid: string | null, fn: () => Promise<T>) => {
  await db.exec(uid
    ? `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`
    : `set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
const insertEval = (store: string, extra = "") =>
  db.query<{ id: string; created_by: string }>(
    `insert into tradein_evaluations (store_id, brand, model, storage, base_price, answers, discount_total, offer_min, offer_max ${extra ? "," + extra.split("=")[0] : ""})
     values ($1, 'Apple', 'iPhone 13', '128 GB', 2000, '[{"question":"tela","label":"Riscos leves","kind":"pct","amount":5}]', 100, 1710, 1900 ${extra ? "," + extra.split("=")[1] : ""})
     returning id, created_by`, [store]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public, auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create type public.app_role as enum ('admin','gerente','vendedor','tecnico','dono');
    create table public.stores (id uuid primary key default gen_random_uuid(), name text);
    create table public.member_stores (user_id uuid, store_id uuid);
    create table public.user_roles (user_id uuid, role public.app_role, permissions jsonb);
    create table public.sales (id uuid primary key default gen_random_uuid(), store_id uuid);
    -- igual à 20261118020000_store_data_isolation.sql
    create function public.app_store_access(p_store_id uuid) returns boolean language sql stable security definer set search_path = public as $$
      select (select auth.uid()) is not null and (
        exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role::text = 'admin')
        or (p_store_id is not null and exists (
          select 1 from public.member_stores where user_id = (select auth.uid()) and store_id = p_store_id)));
    $$;

    insert into auth.users values ('${V1}'), ('${V2}'), ('${GA}'), ('${VB}'), ('${ADM}');
    insert into public.stores (id, name) values ('${A}', 'Loja A'), ('${B}', 'Loja B');
    insert into public.member_stores values ('${V1}', '${A}'), ('${V2}', '${A}'), ('${GA}', '${A}'), ('${VB}', '${B}');
    insert into public.user_roles values ('${V1}', 'vendedor', null), ('${V2}', 'vendedor', null), ('${GA}', 'gerente', null),
      ('${VB}', 'vendedor', null), ('${ADM}', 'admin', null);
    insert into public.sales (id, store_id) values ('${SALE}', '${A}');
  `);
  await db.exec(MIGRATION);
  await db.exec(EMAIL);
});

describe("tradein: estrutura e descontos padrão", () => {
  it("cria configuração e descontos padrão para as lojas que já existem", async () => {
    expect(await val(`select count(*)::int from tradein_settings`)).toBe(2);
    expect(await val(`select negotiation_pct::float from tradein_settings where store_id = $1`, [A])).toBe(10);
    const perStore = await val<number>(`select count(*)::int from tradein_rules where store_id = $1`, [A]);
    expect(perStore).toBeGreaterThan(15);
    expect(await val(`select count(*)::int from tradein_rules where store_id = $1`, [B])).toBe(perStore);
    // conta vinculada bloqueia a compra
    expect(await val(`select kind from tradein_rules where store_id = $1 and question = 'conta' and position = 2`, [A])).toBe("block");
  });

  it("loja nova já nasce com os descontos; semear de novo não duplica", async () => {
    const id = await val<string>(`insert into stores (name) values ('Loja C') returning id`);
    const n = await val<number>(`select count(*)::int from tradein_rules where store_id = $1`, [id]);
    expect(n).toBeGreaterThan(15);
    await db.query(`select tradein_seed_store($1)`, [id]);
    expect(await val(`select count(*)::int from tradein_rules where store_id = $1`, [id])).toBe(n);
    await db.query(`delete from stores where id = $1`, [id]);
  });

  it("regras de integridade: % até 100, faixa coerente, bloqueado não pode ser aceito", async () => {
    expect(await errorOf(`insert into tradein_rules (store_id, question, label, kind, amount) values ($1, 'tela', 'x', 'pct', 150)`, [A])).toMatch(/check/);
    expect(await errorOf(`insert into tradein_rules (store_id, question, label, kind, amount) values ($1, 'outra', 'x', 'pct', 5)`, [A])).toMatch(/check/);
    expect(await errorOf(`insert into tradein_evaluations (store_id, brand, model, base_price, offer_min, offer_max) values ($1, 'Apple', 'X', 100, 90, 50)`, [A])).toMatch(/range/);
    expect(await errorOf(`insert into tradein_evaluations (store_id, brand, model, base_price, offer_min, offer_max, blocked, status) values ($1, 'Apple', 'X', 100, 0, 0, true, 'aceita')`, [A])).toMatch(/blocked_not_accepted/);
    expect(await errorOf(`insert into tradein_evaluations (store_id, brand, model, base_price, offer_min, offer_max, agreed_value) values ($1, 'Apple', 'X', 100, 0, 0, 50)`, [A])).toMatch(/agreed_only_accepted/);
  });

  it("modelo repetido (mesma marca/modelo/capacidade, ignorando maiúsculas) não entra duas vezes", async () => {
    await db.query(`insert into tradein_models (store_id, brand, model, storage, base_price) values ($1, 'Apple', 'iPhone 13', '128 GB', 2000)`, [A]);
    expect(await errorOf(`insert into tradein_models (store_id, brand, model, storage, base_price) values ($1, 'apple', 'iphone 13 ', '128 gb', 1)`, [A])).toMatch(/tradein_models_uq/);
    // na outra loja pode
    await db.query(`insert into tradein_models (store_id, brand, model, storage, base_price) values ($1, 'Apple', 'iPhone 13', '128 GB', 1900)`, [B]);
  });
});

describe("tradein: RLS por loja", () => {
  it("vendedor lê a tabela só da própria loja; visitante sem login não lê nada", async () => {
    const seen = await asUser(V1, () => db.query<any>(`select distinct store_id from tradein_models`));
    expect(seen.rows.map((r) => r.store_id)).toEqual([A]);
    expect(await asUser(V1, () => val(`select count(*)::int from tradein_rules where store_id = $1`, [B]))).toBe(0);
    expect(await asUser(null, () => errorOf(`select * from tradein_models`))).toMatch(/permission denied/);
  });

  it("vendedor não altera a tabela; gerente altera só na loja dele; admin altera tudo", async () => {
    expect(await asUser(V1, () => errorOf(`insert into tradein_models (store_id, brand, model, base_price) values ($1, 'Apple', 'iPhone 12', 1500)`, [A]))).toMatch(/row-level security/);
    expect(await asUser(V1, () => val(`with u as (update tradein_models set base_price = 1 where store_id = $1 returning 1) select count(*)::int from u`, [A]))).toBe(0);
    expect(await asUser(V1, () => val(`with u as (update tradein_settings set negotiation_pct = 40 returning 1) select count(*)::int from u`))).toBe(0);

    await asUser(GA, () => db.query(`insert into tradein_models (store_id, brand, model, storage, base_price) values ($1, 'Apple', 'iPhone 12', '64 GB', 1500)`, [A]));
    expect(await asUser(GA, () => val(`with u as (update tradein_rules set amount = 7 where store_id = $1 and question = 'tela' and position = 2 returning 1) select count(*)::int from u`, [A]))).toBe(1);
    expect(await asUser(GA, () => errorOf(`insert into tradein_models (store_id, brand, model, base_price) values ($1, 'Apple', 'iPhone 12', 1500)`, [B]))).toMatch(/row-level security/);
    expect(await asUser(GA, () => val(`with u as (update tradein_settings set negotiation_pct = 15 where store_id = $1 returning 1) select count(*)::int from u`, [B]))).toBe(0);

    await asUser(ADM, () => db.query(`update tradein_settings set negotiation_pct = 12 where store_id = $1`, [B]));
    expect(await val(`select negotiation_pct::float from tradein_settings where store_id = $1`, [B])).toBe(12);
  });

  it("vendedor salva avaliação na própria loja (autor é sempre quem está logado) e não na outra", async () => {
    const r = await asUser(V1, () => insertEval(A, `created_by='${VB}'`));
    expect(r.rows[0].created_by).toBe(V1);
    expect(await asUser(V1, () => errorOf(`insert into tradein_evaluations (store_id, brand, model, base_price, offer_min, offer_max) values ($1, 'Apple', 'X', 1, 0, 0)`, [B]))).toMatch(/row-level security/);
    expect(await asUser(VB, () => val(`select count(*)::int from tradein_evaluations`))).toBe(0);
    expect(await asUser(ADM, () => val(`select count(*)::int from tradein_evaluations`))).toBe(1);
  });

  it("o cálculo salvo não muda; outro vendedor da loja fecha a venda e liga a avaliação", async () => {
    const id = await val<string>(`select id from tradein_evaluations limit 1`);
    await asUser(V2, () => db.query(
      `update tradein_evaluations set offer_max = 99999, base_price = 99999, store_id = $2, created_by = $3,
         status = 'aceita', agreed_value = 1850, sale_id = $4, imei = '123456789012345' where id = $1`,
      [id, B, V2, SALE]));
    const row = await val<any>(`select row_to_json(e) from tradein_evaluations e where id = $1`, [id]);
    expect(Number(row.offer_max)).toBe(1900);
    expect(Number(row.base_price)).toBe(2000);
    expect(row.store_id).toBe(A);
    expect(row.created_by).toBe(V1);
    expect(row.status).toBe("aceita");
    expect(Number(row.agreed_value)).toBe(1850);
    expect(row.sale_id).toBe(SALE);
    expect(row.imei).toBe("123456789012345");
  });

  it("vendedor da outra loja não mexe; só gerente apaga", async () => {
    const id = await val<string>(`select id from tradein_evaluations limit 1`);
    expect(await asUser(VB, () => val(`with u as (update tradein_evaluations set notes = 'x' where id = $1 returning 1) select count(*)::int from u`, [id]))).toBe(0);
    expect(await asUser(V1, () => val(`with d as (delete from tradein_evaluations where id = $1 returning 1) select count(*)::int from d`, [id]))).toBe(0);
    expect(await asUser(GA, () => val(`with d as (delete from tradein_evaluations where id = $1 returning 1) select count(*)::int from d`, [id]))).toBe(1);
  });

  it("modelo apagado da tabela não apaga o histórico", async () => {
    const r = await asUser(V1, () => insertEval(A));
    const id = r.rows[0].id;
    const modelId = await val<string>(`select id from tradein_models where store_id = $1 and model = 'iPhone 12'`, [A]);
    await db.query(`update tradein_evaluations set model_id = $2 where id = $1`, [id, modelId]); // guard: model_id congela
    expect(await val(`select model_id from tradein_evaluations where id = $1`, [id])).toBeNull();
    const r2 = await asUser(V1, () => db.query<{ id: string }>(
      `insert into tradein_evaluations (store_id, model_id, brand, model, base_price, offer_min, offer_max)
       values ($1, $2, 'Apple', 'iPhone 12', 1500, 1300, 1450) returning id`, [A, modelId]));
    const withModel = r2.rows[0].id;
    expect(await val(`select model_id from tradein_evaluations where id = $1`, [withModel])).toBe(modelId);
    await asUser(GA, () => db.query(`delete from tradein_models where id = $1`, [modelId]));
    expect(await val(`select count(*)::int from tradein_evaluations where id = $1 and model_id is null and model = 'iPhone 12'`, [withModel])).toBe(1);
  });

  it("e-mail do cliente: opcional, validado e editável depois de salvo", async () => {
    const id = await val<string>(`select id from tradein_evaluations limit 1`);
    expect(await errorOf(`update tradein_evaluations set customer_email = 'sem-arroba' where id = $1`, [id])).toMatch(/customer_email_check/);
    await asUser(V1, () => db.query(`update tradein_evaluations set customer_email = 'ana@exemplo.com' where id = $1`, [id]));
    expect(await val(`select customer_email from tradein_evaluations where id = $1`, [id])).toBe("ana@exemplo.com");
  });

  it("migrations rodam de novo sem erro (idempotentes)", async () => {
    await db.exec(MIGRATION);
    await db.exec(EMAIL);
    expect(await val(`select count(*)::int from tradein_settings`)).toBe(2);
  });
});
