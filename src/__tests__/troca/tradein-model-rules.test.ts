// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- linhas cruas do Postgres */
/**
 * Desconto próprio de cada aparelho (20261128000000_tradein_model_rules.sql) num Postgres
 * real em memória (PGlite), com stubs mínimos do Supabase (auth, papéis, CRM, storage).
 * Os testes dependem uns dos outros (mesmo banco), na ordem em que aparecem.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";

const mig = (f: string) => readFileSync(path.resolve(__dirname, "../../../supabase/migrations", f), "utf8");
const MODULE = mig("20261125000000_tradein_module.sql");
const EMAIL = mig("20261126000000_tradein_customer_email.sql");
const SHARE = mig("20261127000000_tradein_share_link.sql");
const MODEL_RULES = mig("20261128000000_tradein_model_rules.sql");

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const V1 = "00000000-0000-0000-0000-0000000000a1"; // vendedor loja A
const VB = "00000000-0000-0000-0000-0000000000b1"; // vendedor loja B
const GA = "00000000-0000-0000-0000-0000000000a9"; // gerente loja A
const CONTACT = "c0000000-0000-0000-0000-000000000001";

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
const anon = <T>(fn: () => Promise<T>) => asUser(null, fn);
/** id da regra da loja pelo começo do texto */
const rule = (store: string, question: string, label: string) =>
  val<string>(`select id from tradein_rules where store_id = $1 and question = $2 and label like $3 || '%'`, [store, question, label]);
const answersOk = async (store = A) => [
  await rule(store, "conta", "Desvinculada"),
  await rule(store, "tela", "Riscos leves"),
  await rule(store, "bateria", "85%"),
  await rule(store, "carcaca", "Perfeita"),
  await rule(store, "biometria", "Face ID"),
  await rule(store, "acessorios", "Sem a caixa"),
];
const newEval = (store: string, by: string) =>
  val<string>(
    `insert into tradein_evaluations (store_id, created_by, customer_name, customer_phone, customer_email, imei, notes,
       brand, model, storage, base_price, answers, discount_total, offer_min, offer_max)
     values ($1, $2, 'Maria Souza', '(87) 9 9999-0000', 'maria@x.com', '350000000000001', 'cliente chato',
       'Apple', 'iPhone 13', '128 GB', 2000,
       '[{"question":"tela","label":"Riscos leves","kind":"pct","amount":5,"value":100}]', 100, 1710, 1900)
     returning id`, [store, by]);
const share = (evalId: string, uid = V1) =>
  asUser(uid, () => db.query<{ token: string; expires_at: string }>(`select * from tradein_share_create($1)`, [evalId]).then((r) => r.rows[0]));
const pub = async (fn: string, args: any[]) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(", ");
  return anon(() => val<any>(`select ${fn}(${ph})`, args));
};

let M13: string;
let M8: string;
let MB: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth; create schema storage;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
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
    create function public.app_store_access(p_store_id uuid) returns boolean language sql stable security definer set search_path = public as $$
      select (select auth.uid()) is not null and (
        exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role::text = 'admin')
        or (p_store_id is not null and exists (
          select 1 from public.member_stores where user_id = (select auth.uid()) and store_id = p_store_id)));
    $$;
    -- CRM (só o que o link usa)
    create function public.crm_phone_key(p text) returns text language sql immutable as $$
      select case when n is null then null else left(n, 2) || right(n, 8) end
        from (select nullif(regexp_replace(regexp_replace(coalesce(p, ''), '\\D', '', 'g'), '^55', ''), '') as n) t;
    $$;
    create table public.crm_contacts (id uuid primary key, store_id uuid, phone_key text);
    create table public.crm_tasks (
      id uuid primary key default gen_random_uuid(), store_id uuid not null, title text not null, notes text,
      kind text not null default 'follow_up', due_at timestamptz, done_at timestamptz, assigned_to uuid,
      contact_id uuid, deal_id uuid, created_by uuid, source text not null default 'user', dedupe_key text);
    create unique index crm_tasks_dedupe_uq on public.crm_tasks (store_id, dedupe_key) where dedupe_key is not null;
    -- storage
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
    alter table storage.objects enable row level security;
    grant all on storage.objects to anon, authenticated, service_role;

    insert into auth.users values ('${V1}'), ('${VB}'), ('${GA}');
    insert into public.stores (id, name) values ('${A}', 'Restaura Centro'), ('${B}', 'Loja B');
    insert into public.member_stores values ('${V1}', '${A}'), ('${VB}', '${B}'), ('${GA}', '${A}');
    insert into public.user_roles values ('${V1}', 'vendedor', null), ('${VB}', 'vendedor', null), ('${GA}', 'gerente', null);
    insert into public.crm_contacts values ('${CONTACT}', '${A}', '8799990000');
  `);
  await db.exec(MODULE);
  await db.exec(EMAIL);
  await db.exec(SHARE);
  await db.exec(MODEL_RULES);
  M13 = await val<string>(`insert into tradein_models (store_id, brand, model, storage, base_price) values ($1, 'Apple', 'iPhone 13', '128 GB', 2000) returning id`, [A]);
  M8 = await val<string>(`insert into tradein_models (store_id, brand, model, storage, base_price) values ($1, 'Apple', 'iPhone 8 Plus', '64 GB', 2000) returning id`, [A]);
  MB = await val<string>(`insert into tradein_models (store_id, brand, model, storage, base_price) values ($1, 'Apple', 'iPhone 13', '128 GB', 2000) returning id`, [B]);
});

const setOverride = (uid: string, model: string, ruleId: string, kind: string, amount: number) =>
  asUser(uid, () => errorOf(`insert into tradein_model_rules (model_id, rule_id, kind, amount) values ($1, $2, $3, $4)
    on conflict (model_id, rule_id) do update set kind = excluded.kind, amount = excluded.amount`, [model, ruleId, kind, amount]));
const evalFor = (model: string) =>
  val<string>(`insert into tradein_evaluations (store_id, created_by, model_id, brand, model, storage, base_price, answers, discount_total, offer_min, offer_max)
    values ($1, $2, $3, 'Apple', 'iPhone', '', 2000, '[]', 0, 1800, 2000) returning id`, [A, V1, model]);
const shareOf = (evalId: string) =>
  asUser(V1, () => db.query<{ token: string }>(`select * from tradein_share_create($1)`, [evalId]).then((r) => r.rows[0].token));

describe("tradein: desconto de cada aparelho", () => {
  it("gerente põe valor próprio no aparelho; a loja vem do aparelho; vendedor só lê", async () => {
    const tela = await rule(A, "pecas", "Tela trocada");
    expect(await setOverride(GA, M13, tela, "fixed", 450)).toBeNull();
    expect(await setOverride(GA, M8, tela, "fixed", 180)).toBeNull();
    expect(await val(`select store_id from tradein_model_rules where model_id = $1`, [M13])).toBe(A);
    expect(await asUser(V1, () => val(`select count(*)::int from tradein_model_rules`))).toBe(2);
    expect(await asUser(VB, () => val(`select count(*)::int from tradein_model_rules`))).toBe(0);
    expect(await anon(() => errorOf(`select * from tradein_model_rules`))).toMatch(/permission denied/);
  });

  it("vendedor não mexe; opção de outra loja, Não compra e % acima de 100 são recusados", async () => {
    const tela = await rule(A, "pecas", "Tela trocada");
    expect(await setOverride(V1, M13, tela, "fixed", 1)).toMatch(/row-level security/);
    expect(await setOverride(GA, M13, await rule(B, "pecas", "Tela trocada"), "fixed", 1)).toMatch(/mesma loja/);
    expect(await setOverride(GA, MB, tela, "fixed", 1)).toMatch(/mesma loja|row-level security/);
    expect(await setOverride(GA, M13, await rule(A, "conta", "Ainda vinculada"), "fixed", 1)).toMatch(/Não compra/);
    expect(await setOverride(GA, M13, await rule(A, "tela", "Riscos leves"), "pct", 120)).toMatch(/check/);
  });

  it("o link do cliente mostra o valor do aparelho e o banco recalcula com ele", async () => {
    const t13 = await shareOf(await evalFor(M13));
    const d = await anon(() => val<any>(`select tradein_public_get($1)`, [t13]));
    const tela = d.rules.find((r: any) => r.label === "Tela trocada");
    expect(tela.kind).toBe("fixed");
    expect(Number(tela.amount)).toBe(450);
    // padrão da loja continua onde não tem valor próprio
    expect(d.rules.find((r: any) => r.label === "Riscos leves").kind).toBe("pct");

    const ids = [
      await rule(A, "conta", "Desvinculada"), await rule(A, "tela", "Perfeita"), await rule(A, "bateria", "90%"),
      await rule(A, "carcaca", "Perfeita"), await rule(A, "biometria", "Face ID"), await rule(A, "pecas", "Tela trocada"),
    ];
    const r13 = await anon(() => val<any>(`select tradein_public_review($1, $2)`, [t13, ids]));
    expect(r13.review.offer).toBe(1550); // 2000 − 450
    expect(r13.review.answers.find((l: any) => l.question === "pecas")).toMatchObject({ kind: "fixed", value: 450 });

    const t8 = await shareOf(await evalFor(M8));
    expect((await anon(() => val<any>(`select tradein_public_review($1, $2)`, [t8, ids]))).review.offer).toBe(1820);
  });

  it("aparelho apagado da tabela: valores dele somem e a avaliação volta ao padrão da loja", async () => {
    const e = await evalFor(M8);
    await asUser(GA, () => db.query(`delete from tradein_models where id = $1`, [M8]));
    expect(await val(`select count(*)::int from tradein_model_rules where model_id = $1`, [M8])).toBe(0);
    expect(await val(`select model_id from tradein_evaluations where id = $1`, [e])).toBeNull();
    const t = await shareOf(e);
    const d = await anon(() => val<any>(`select tradein_public_get($1)`, [t]));
    expect(d.rules.find((r: any) => r.label === "Tela trocada")).toMatchObject({ kind: "pct" });
  });

  it("apagar a opção da loja apaga os valores dela nos aparelhos; rodar a migration de novo não quebra", async () => {
    const extra = await asUser(GA, () => val<string>(`insert into tradein_rules (store_id, question, label, kind, amount) values ($1, 'pecas', 'Alto-falante trocado', 'pct', 3) returning id`, [A]));
    expect(await setOverride(GA, M13, extra, "fixed", 60)).toBeNull();
    await asUser(GA, () => db.query(`delete from tradein_rules where id = $1`, [extra]));
    expect(await val(`select count(*)::int from tradein_model_rules where rule_id = $1`, [extra])).toBe(0);
    await db.exec(MODEL_RULES);
    expect(await val(`select count(*)::int from tradein_model_rules`)).toBe(1);
  });
});
