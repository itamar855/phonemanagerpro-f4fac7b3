// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- linhas cruas do Postgres */
/**
 * Link da avaliação para o cliente (20261127000000_tradein_share_link.sql) num Postgres
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

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const V1 = "00000000-0000-0000-0000-0000000000a1"; // vendedor loja A
const VB = "00000000-0000-0000-0000-0000000000b1"; // vendedor loja B
const CONTACT = "c0000000-0000-0000-0000-000000000001";

let db: PGlite;
const val = async <T = any>(sql: string, params: any[] = []): Promise<T> => {
  const r = await db.query<Record<string, T>>(sql, params);
  return r.rows[0] ? Object.values(r.rows[0])[0] : (undefined as T);
};
const errorOf = async (sql: string, params: any[] = []) => {
  try { await db.query(sql, params); return null; } catch (e) { return String(e.message); }
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

let E1: string;
let T1: string;

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

    insert into auth.users values ('${V1}'), ('${VB}');
    insert into public.stores (id, name) values ('${A}', 'Restaura Centro'), ('${B}', 'Loja B');
    insert into public.member_stores values ('${V1}', '${A}'), ('${VB}', '${B}');
    insert into public.user_roles values ('${V1}', 'vendedor', null), ('${VB}', 'vendedor', null);
    insert into public.crm_contacts values ('${CONTACT}', '${A}', '8799990000');
  `);
  await db.exec(MODULE);
  await db.exec(EMAIL);
  await db.exec(SHARE);
  E1 = await newEval(A, V1);
});

describe("tradein link: loja cria e renova", () => {
  it("vendedor da loja cria o link de 3 dias; criar de novo mantém o código e renova", async () => {
    const s = await share(E1);
    expect(s.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const hours = (new Date(s.expires_at).getTime() - Date.now()) / 36e5;
    expect(hours).toBeGreaterThan(71.9);
    expect(hours).toBeLessThan(72.1);
    await db.query(`update tradein_shares set expires_at = now() + interval '1 hour' where evaluation_id = $1`, [E1]);
    const again = await share(E1);
    expect(again.token).toBe(s.token);
    expect((new Date(again.expires_at).getTime() - Date.now()) / 36e5).toBeGreaterThan(71.9);
    T1 = s.token;
  });

  it("vendedor de outra loja e visitante não criam link; ninguém escreve direto na tabela", async () => {
    expect(await asUser(VB, () => errorOf(`select * from tradein_share_create($1)`, [E1]))).toMatch(/não encontrada/);
    expect(await anon(() => errorOf(`select * from tradein_share_create($1)`, [E1]))).toMatch(/permission denied/);
    expect(await asUser(V1, () => errorOf(`update tradein_shares set review_offer = 9999`))).toMatch(/permission denied/);
    expect(await asUser(V1, () => errorOf(`delete from tradein_shares`))).toMatch(/permission denied/);
  });

  it("RLS: a loja lê o próprio link; outra loja e visitante não", async () => {
    expect(await asUser(V1, () => val(`select count(*)::int from tradein_shares`))).toBe(1);
    expect(await asUser(VB, () => val(`select count(*)::int from tradein_shares`))).toBe(0);
    expect(await anon(() => errorOf(`select * from tradein_shares`))).toMatch(/permission denied/);
  });
});

describe("tradein link: o que o cliente vê", () => {
  it("mostra base, descontos e valor (teto), sem dados internos; marca que abriu", async () => {
    const d = await pub("tradein_public_get", [T1]);
    expect(d.store_name).toBe("Restaura Centro");
    expect(d.customer_first_name).toBe("Maria");
    expect(d.base_price).toBe(2000);
    expect(d.offer).toBe(1900);
    expect(d.status).toBe("aberta");
    expect(d.answers[0].label).toBe("Riscos leves");
    expect(d.rules.length).toBeGreaterThan(15);
    const raw = JSON.stringify(d);
    for (const secret of ["9999-0000", "maria@x.com", "350000000000001", "cliente chato", "offer_min", "1710", "negotiation"]) {
      expect(raw).not.toContain(secret);
    }
    expect(await val(`select opened_at is not null from tradein_shares where token = $1`, [T1])).toBe(true);
  });

  it("código errado ou mal formado não mostra nada", async () => {
    expect(await pub("tradein_public_get", ["A".repeat(24)])).toBeNull();
    expect(await pub("tradein_public_get", ["' or 1=1 --"])).toBeNull();
  });
});

describe("tradein link: cliente refaz a avaliação", () => {
  it("o banco recalcula pelo preço base e cria tarefa no CRM para quem avaliou", async () => {
    const d = await pub("tradein_public_review", [T1, await answersOk(), "  A bateria está 88%  "]);
    // 5% + 5% de 2000 + R$ 30 sem caixa = 230 → 1770
    expect(d.review.discount_total).toBe(230);
    expect(d.review.offer).toBe(1770);
    expect(d.review.blocked).toBe(false);
    expect(d.review.note).toBe("A bateria está 88%");
    expect(d.review.answers.map((l: { question: string }) => l.question)).toEqual(["conta", "tela", "bateria", "carcaca", "biometria", "acessorios"]);
    expect(d.reviews_left).toBe(4);
    // a avaliação da loja não muda
    expect(await val(`select offer_max::int from tradein_evaluations where id = $1`, [E1])).toBe(1900);
    const t = (await db.query<any>(`select * from crm_tasks where dedupe_key = $1`, [`tradein:${E1}:revisao1`])).rows[0];
    expect(t.assigned_to).toBe(V1);
    expect(t.contact_id).toBe(CONTACT);
    expect(t.store_id).toBe(A);
    expect(t.title).toContain("Maria Souza revisou");
    expect(t.notes).toContain("Loja: R$ 1.900 · Cliente: R$ 1.770");
  });

  it("recusa respostas inválidas: duas na mesma pergunta, pergunta faltando, regra de outra loja", async () => {
    const ok = await answersOk();
    const twoScreens = [...ok, await rule(A, "tela", "Trincada")];
    expect(await anon(() => errorOf(`select tradein_public_review($1, $2)`, [T1, twoScreens]))).toMatch(/só uma resposta/);
    expect(await anon(() => errorOf(`select tradein_public_review($1, $2)`, [T1, ok.slice(1)]))).toMatch(/falta: conta/);
    const other = [...ok.slice(0, 5), await rule(B, "acessorios", "Sem a caixa")];
    expect(await anon(() => errorOf(`select tradein_public_review($1, $2)`, [T1, other]))).toMatch(/tabela da loja mudou/);
  });

  it("conta vinculada zera o valor; peças trocadas podem ser várias", async () => {
    const ids = await answersOk();
    ids[0] = await rule(A, "conta", "Ainda vinculada");
    const d = await pub("tradein_public_review", [T1, ids]);
    expect(d.review.blocked).toBe(true);
    expect(d.review.offer).toBe(0);
    const multi = [...(await answersOk()), await rule(A, "pecas", "Tela trocada"), await rule(A, "pecas", "Câmera")];
    const d2 = await pub("tradein_public_review", [T1, multi]);
    expect(d2.review.offer).toBe(1370); // 230 + 10% + 10% = 630
  });

  it("no máximo 5 revisões por link", async () => {
    const ok = await answersOk();
    await pub("tradein_public_review", [T1, ok]);
    await pub("tradein_public_review", [T1, ok]);
    expect(await anon(() => errorOf(`select tradein_public_review($1, $2)`, [T1, ok]))).toMatch(/5 vezes/);
    expect(await val(`select count(*)::int from crm_tasks where dedupe_key like $1`, [`tradein:${E1}:revisao%`])).toBe(5);
  });
});

describe("tradein link: aceite e fotos", () => {
  it("aceitar grava o valor da loja uma vez só e avisa no CRM", async () => {
    const d = await pub("tradein_public_accept", [T1]);
    expect(d.accepted_value).toBe(1900);
    const first = await val(`select accepted_at from tradein_shares where token = $1`, [T1]);
    await pub("tradein_public_accept", [T1]);
    expect(await val(`select accepted_at from tradein_shares where token = $1`, [T1])).toEqual(first);
    expect(await val(`select count(*)::int from crm_tasks where dedupe_key = $1`, [`tradein:${E1}:aceite`])).toBe(1);
  });

  it("aparelho com conta presa na avaliação da loja não pode ser aceito", async () => {
    const e = await val<string>(`insert into tradein_evaluations (store_id, brand, model, base_price, offer_min, offer_max, blocked) values ($1, 'Apple', 'X', 100, 0, 0, true) returning id`, [A]);
    const s = await share(e);
    expect(await anon(() => errorOf(`select tradein_public_accept($1)`, [s.token]))).toMatch(/conta ainda vinculada/);
    expect((await pub("tradein_public_get", [s.token])).offer).toBe(0);
  });

  it("fotos: até 4, só na pasta do link, nome certo; o banco reconta", async () => {
    const put = (name: string) => anon(() => errorOf(`insert into storage.objects (bucket_id, name) values ('tradein-photos', $1)`, [name]));
    const n = (i: number) => `${T1}/0000000${i}-0000-0000-0000-000000000000.webp`;
    for (let i = 1; i <= 4; i++) expect(await put(n(i))).toBeNull();
    expect(await put(n(5))).toMatch(/row-level security/);
    expect(await put(`${"B".repeat(24)}/00000001-0000-0000-0000-000000000000.webp`)).toMatch(/row-level security/);
    expect(await put(`${T1}/../x.html`)).toMatch(/row-level security/);
    const d = await pub("tradein_public_photos_sent", [T1]);
    expect(d.photo_count).toBe(4);
    expect(d.photos_left).toBe(0);
    expect(await val(`select count(*)::int from crm_tasks where dedupe_key = $1`, [`tradein:${E1}:fotos4`])).toBe(1);
    expect(await anon(() => val(`select count(*)::int from storage.objects where bucket_id = 'tradein-photos'`))).toBe(4);
  });

  it("selo: a loja marca como visto; outra loja não mexe", async () => {
    await asUser(VB, () => db.query(`select tradein_share_mark_seen($1)`, [E1]));
    expect(await val(`select seen_at is null from tradein_shares where token = $1`, [T1])).toBe(true);
    await asUser(V1, () => db.query(`select tradein_share_mark_seen($1)`, [E1]));
    expect(await val(`select seen_at >= activity_at from tradein_shares where token = $1`, [T1])).toBe(true);
  });
});

describe("tradein link: vencido ou encerrado", () => {
  it("link vencido: cliente vê o aviso, sem tabela, e não mexe mais; a loja ainda vê as fotos", async () => {
    await db.query(`update tradein_shares set expires_at = now() - interval '1 minute' where token = $1`, [T1]);
    const d = await pub("tradein_public_get", [T1]);
    expect(d.status).toBe("vencida");
    expect(d.rules).toEqual([]);
    const ok = await answersOk();
    expect(await anon(() => errorOf(`select tradein_public_review($1, $2)`, [T1, ok]))).toMatch(/venceu/);
    expect(await anon(() => errorOf(`select tradein_public_accept($1)`, [T1]))).toMatch(/venceu/);
    expect(await anon(() => val(`select count(*)::int from storage.objects where bucket_id = 'tradein-photos'`))).toBe(0);
    expect(await asUser(V1, () => val(`select count(*)::int from storage.objects where bucket_id = 'tradein-photos'`))).toBe(4);
    expect(await asUser(VB, () => val(`select count(*)::int from storage.objects where bucket_id = 'tradein-photos'`))).toBe(0);
  });

  it("recusada continua aberta (cliente quer refazer); troca aceita na loja encerra o link", async () => {
    const e = await newEval(A, V1);
    const s = await share(e);
    await db.query(`update tradein_evaluations set status = 'recusada' where id = $1`, [e]);
    expect((await pub("tradein_public_get", [s.token])).status).toBe("aberta");
    await db.query(`update tradein_evaluations set status = 'aceita', agreed_value = 1800 where id = $1`, [e]);
    const closed = await pub("tradein_public_get", [s.token]);
    expect(closed.status).toBe("encerrada");
    expect(closed.offer).toBe(1800);
    const ok = await answersOk();
    expect(await anon(() => errorOf(`select tradein_public_review($1, $2)`, [s.token, ok]))).toMatch(/encerrada/);
  });

  it("rodar a migration de novo não quebra nem duplica", async () => {
    await db.exec(SHARE);
    expect(await val(`select count(*)::int from storage.buckets where id = 'tradein-photos'`)).toBe(1);
    expect(await val(`select public from storage.buckets where id = 'tradein-photos'`)).toBe(false);
  });
});
