// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- payloads JSON externos (Evolution/Meta/PostgREST) sem tipos */
/**
 * Testa as migrations do CRM num Postgres real em memória (PGlite),
 * com stubs mínimos do Supabase (auth.uid, papéis, member_stores...).
 * Os testes dependem uns dos outros (mesmo banco), na ordem em que aparecem.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = path.resolve(__dirname, "../../../supabase/migrations");
const read = (f: string) => readFileSync(path.join(MIGRATIONS, f), "utf8");
const FOUNDATION = read("20261114200000_crm_foundation.sql");
const IMPORT = read("20261114200100_crm_import_legacy_leads.sql");
const INBOX = read("20261115000000_crm_inbox.sql");
const PIPELINE = read("20261115030000_crm_pipeline.sql");
const TASKS = read("20261116000000_crm_tasks_automations.sql");
const REPORTS = read("20261116010000_crm_reports.sql");
const AVATARS = read("20261116020000_crm_contact_avatars.sql");
const AI = read("20261116030000_crm_ai_agent.sql");
const TRANSCRIPT = read("20261116040000_crm_audio_transcript.sql");
const LEARNING = read("20261116050000_crm_ai_learning.sql");
const TRACKING = read("20261116060000_crm_tracking.sql");
const IG_MANUAL = read("20261116070000_crm_ig_manual_lead.sql");

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const U1 = "00000000-0000-0000-0000-0000000000a1"; // vendedor loja A
const U2 = "00000000-0000-0000-0000-0000000000b1"; // vendedor loja B
const ADM = "00000000-0000-0000-0000-0000000000ad"; // admin das duas

let db: PGlite;
const val = async <T = any>(sql: string, params: any[] = []): Promise<T> => {
  const r = await db.query<Record<string, T>>(sql, params);
  return r.rows[0] ? Object.values(r.rows[0])[0] : (undefined as T);
};
const one = async (sql: string, params: any[] = []) => (await db.query<any>(sql, params)).rows[0];
const errorOf = async (sql: string, params: any[] = []) => {
  try { await db.query(sql, params); return null; } catch (e: any) { return String(e.message); }
};
const ingest = async (args: Record<string, unknown>) => {
  const keys = Object.keys(args);
  const r = await db.query<{ r: any }>(
    `select crm_ingest_message(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`,
    Object.values(args),
  );
  return r.rows[0].r;
};
const asUser = async <T>(uid: string, fn: () => Promise<T>) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
const stage = (store: string, kind: "sales" | "service", code: string) =>
  val<string>(`select s.id from crm_stages s join crm_pipelines p on p.id = s.pipeline_id where p.store_id = $1 and p.kind = $2 and s.code = $3`, [store, kind, code]);

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(`
    create schema auth; create schema extensions;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public, auth, extensions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant select on auth.users to authenticated, service_role;
    create type public.app_role as enum ('admin','gerente','vendedor','tecnico','dono');
    create table public.stores (id uuid primary key default gen_random_uuid(), name text, created_at timestamptz default now());
    create table public.member_stores (id uuid primary key default gen_random_uuid(), user_id uuid, store_id uuid, created_at timestamptz default now());
    create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid, role public.app_role);
    create table public.profiles (id uuid primary key default gen_random_uuid(), user_id uuid, display_name text);
    create table public.customers (id uuid primary key default gen_random_uuid(), name text, phone text, store_id uuid, created_at timestamptz default now());
    create table public.service_orders (id uuid primary key default gen_random_uuid(), store_id uuid, order_number serial, customer_id uuid,
      customer_name text, customer_phone text, device_brand text, device_model text, status text default 'open', completed_at timestamptz,
      delivered_at timestamptz, warranty_end_date timestamptz, updated_at timestamptz default now(), created_at timestamptz default now(),
      final_price numeric, estimated_price numeric);
    create table public.products (id uuid primary key default gen_random_uuid(), store_id uuid, name text, brand text, model text);
    create table public.sales (id uuid primary key default gen_random_uuid(), store_id uuid, product_id uuid, customer_id uuid,
      customer_name text, customer_phone text, warranty_days integer, seller_id uuid, created_by uuid, created_at timestamptz default now(),
      sale_price numeric);
    create table public.leads (id uuid primary key default gen_random_uuid(), name text, phone text, email text, source text, status text,
      notes text, store_id uuid, created_at timestamptz default now(), instagram_user_id text, instagram_username text, avatar_url text);
    create table public.lead_messages (id uuid primary key default gen_random_uuid(), lead_id uuid, content text, sender text,
      created_at timestamptz default now(), sender_user_id uuid, message_type text, media_url text, store_id uuid not null);
    create publication supabase_realtime;
    grant select on all tables in schema public to authenticated;

    insert into auth.users values ('${U1}'), ('${U2}'), ('${ADM}');
    insert into public.stores (id, name) values ('${A}', 'Loja A'), ('${B}', 'Loja B');
    insert into public.member_stores (user_id, store_id) values ('${U1}', '${A}'), ('${U2}', '${B}'), ('${ADM}', '${A}'), ('${ADM}', '${B}');
    insert into public.user_roles (user_id, role) values ('${U1}', 'vendedor'), ('${U2}', 'vendedor'), ('${ADM}', 'admin');
    insert into public.profiles (user_id, display_name) values ('${U1}', 'Vendedor A'), ('${U2}', 'Vendedor B'), ('${ADM}', 'Dono');
    insert into public.customers (name, phone, store_id) values ('Maria Cliente', '(87) 99911-2233', '${A}');

    insert into public.leads (id, name, phone, source, store_id, created_at) values
      ('10000000-0000-0000-0000-000000000001', 'Lead WhatsApp', '558799112233',    'whatsapp',  '${A}', now() - interval '9 days'),
      ('10000000-0000-0000-0000-000000000002', 'Maria',         '5587999112233',   'whatsapp',  '${A}', now() - interval '8 days'),
      ('10000000-0000-0000-0000-000000000003', 'João',          '(81) 98888-7777', 'os_vendas', '${A}', now() - interval '7 days'),
      ('10000000-0000-0000-0000-000000000004', 'Grupo Família', '558791234567-1600000000', 'whatsapp', '${A}', now()),
      ('10000000-0000-0000-0000-000000000005', 'Grupo novo',    '120363012345678901', 'whatsapp', '${A}', now()),
      ('10000000-0000-0000-0000-000000000006', 'Maria',         '5587999112233',   'whatsapp',  '${B}', now()),
      ('10000000-0000-0000-0000-000000000007', 'Sem telefone',  null,              'manual',    '${A}', now());
    insert into public.lead_messages (lead_id, content, sender, message_type, store_id, created_at) values
      ('10000000-0000-0000-0000-000000000001', 'Oi, tem iPhone 13?', 'lead',     'text', '${A}', now() - interval '9 days'),
      ('10000000-0000-0000-0000-000000000002', 'Ainda tem?',         'lead',     'text', '${A}', now() - interval '8 days'),
      ('10000000-0000-0000-0000-000000000002', 'Tem sim!',           'vendedor', 'text', '${A}', now() - interval '8 days' + interval '5 minutes'),
      ('10000000-0000-0000-0000-000000000004', 'msg do grupo',       'lead',     'text', '${A}', now());
  `);
  await db.exec(FOUNDATION);
  await db.exec(IMPORT);
  await db.exec(INBOX);
  await db.exec(PIPELINE);
  await db.exec(TASKS);
  await db.exec(REPORTS);
  await db.exec(AVATARS);
  await db.exec(AI);
  await db.exec(TRANSCRIPT);
  await db.exec(LEARNING);
  await db.exec(TRACKING);
  await db.exec(IG_MANUAL);
}, 60_000);

describe("CRM — fundação", () => {
  it("cria 2 funis por loja, Vendas com a jornada Instagram → WhatsApp", async () => {
    expect(await val(`select count(*)::int from crm_pipelines`)).toBe(4);
    const codes = (await db.query<{ code: string }>(
      `select s.code from crm_stages s join crm_pipelines p on p.id = s.pipeline_id where p.store_id = $1 and p.kind = 'sales' order by s.position`, [A],
    )).rows.map((r) => r.code);
    expect(codes).toEqual(["ig_new", "wa_invited", "wa_active", "proposal", "won", "lost"]);
  });

  it("normaliza telefone e casa com/sem o 9º dígito", async () => {
    expect(await val(`select crm_normalize_phone('5587999112233')`)).toBe("87999112233");
    expect(await val(`select crm_normalize_phone('(87) 99911-2233')`)).toBe("87999112233");
    expect(await val(`select crm_normalize_phone('087999112233')`)).toBe("87999112233");
    expect(await val(`select crm_phone_key('558799112233') = crm_phone_key('5587999112233')`)).toBe(true);
    expect(await val(`select crm_normalize_phone('120363012345678901')`)).toBeNull();
    expect(await val(`select crm_normalize_phone('558791234567-1600000000')`)).toBeNull();
  });

  it("loja nova já nasce com os funis", async () => {
    await db.exec(`insert into public.stores (name) values ('Loja Nova')`);
    expect(await val(`select count(*)::int from crm_pipelines p join stores s on s.id = p.store_id where s.name = 'Loja Nova'`)).toBe(2);
  });
});

describe("CRM — importação dos leads antigos", () => {
  it("junta duplicatas por telefone, sem misturar lojas, e mantém lead sem telefone", async () => {
    expect(await val(`select count(*)::int from crm_contacts where store_id = $1`, [A])).toBe(3);
    expect(await val(`select count(*)::int from crm_contacts where store_id = $1`, [B])).toBe(1);
    const maria = await one(`select * from crm_contacts where store_id = $1 and phone_key = crm_phone_key('5587999112233')`, [A]);
    expect(maria.name).toBe("Maria");
    expect(maria.phone).toBe("5587999112233");
    expect(maria.legacy_lead_ids).toHaveLength(2);
    expect(maria.customer_id).not.toBeNull();
  });

  it("não importa grupos de WhatsApp", async () => {
    expect(await val(`select count(*)::int from crm_contacts where name like 'Grupo%'`)).toBe(0);
    expect(await val(`select count(*)::int from crm_messages`)).toBe(3);
  });

  it("conversas antigas entram resolvidas, sem negócios", async () => {
    expect(await val(`select count(*)::int from crm_conversations where status <> 'resolved'`)).toBe(0);
    expect(await val(`select last_message_preview from crm_conversations`)).toBe("Tem sim!");
    expect(await val(`select count(*)::int from crm_deals`)).toBe(0);
    expect(await val(`select origin_channel from crm_contacts where name = 'João'`)).toBe("os_vendas");
  });

  it("rodar de novo não duplica", async () => {
    await db.exec(IMPORT);
    expect(await val(`select count(*)::int from crm_messages`)).toBe(3);
    expect(await val(`select count(*)::int from crm_contacts`)).toBe(4);
  });
});

describe("CRM — ingestão de mensagens", () => {
  let carlosConv: string;

  it("cria contato e conversa com a 1ª mensagem; id externo repetido é ignorado", async () => {
    const r = await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "in", p_sender_kind: "contact", p_body: "Quero trocar a tela", p_phone: "5511988887777", p_name: "Carlos", p_external_id: "WA1" });
    expect(r.contact_created).toBe(true);
    carlosConv = r.conversation_id;
    const dup = await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "in", p_sender_kind: "contact", p_body: "Quero trocar a tela", p_phone: "5511988887777", p_external_id: "WA1" });
    expect(dup.duplicate).toBe(true);
  });

  it("número sem o 9º dígito cai no mesmo contato e soma não lidas", async () => {
    const r = await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "in", p_sender_kind: "contact", p_body: "oi de novo", p_phone: "551188887777", p_external_id: "WA2" });
    expect(r.contact_created).toBe(false);
    expect(await val(`select unread_count from crm_conversations where id = $1`, [carlosConv])).toBe(2);
  });

  it("resposta de pessoa zera não lidas, marca 1ª resposta e devolve ao humano", async () => {
    await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "out", p_sender_kind: "user", p_body: "Bom dia!", p_phone: "5511988887777", p_external_id: "WA3" });
    const c = await one(`select unread_count, first_response_at, handler from crm_conversations where id = $1`, [carlosConv]);
    expect(c.unread_count).toBe(0);
    expect(c.first_response_at).not.toBeNull();
    expect(c.handler).toBe("human");
  });

  it("envio do celular da loja para desconhecido não cria contato", async () => {
    const r = await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "out", p_sender_kind: "user", p_body: "pedido ao fornecedor", p_phone: "5511900001111", p_external_id: "WA4" });
    expect(r.skipped).toBe(true);
  });

  it("conversa resolvida reabre quando a pessoa escreve", async () => {
    const r = await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "in", p_sender_kind: "contact", p_body: "voltei", p_phone: "5587999112233", p_external_id: "WA5" });
    expect(r.contact_created).toBe(false);
    expect(await val(`select status from crm_conversations where id = $1`, [r.conversation_id])).toBe("open");
  });

  it("status de entrega só avança", async () => {
    await db.query(`select crm_update_message_status($1, 'WA3', 'read')`, [A]);
    await db.query(`select crm_update_message_status($1, 'WA3', 'delivered')`, [A]);
    expect(await val(`select status from crm_messages where external_id = 'WA3'`)).toBe("read");
  });
});

describe("CRM — jornada Instagram → WhatsApp", () => {
  let ana: string;
  let code: string;

  it("lead do Instagram recebe código estável e negócio em 'Chamado para o WhatsApp'", async () => {
    const r = await ingest({ p_store_id: A, p_channel: "instagram", p_direction: "in", p_sender_kind: "contact", p_body: "Quanto o 15 Pro?", p_instagram_user_id: "IG777", p_instagram_username: "ana.cel", p_external_id: "IGM1" });
    ana = r.contact_id;
    expect(await val(`select origin_channel from crm_contacts where id = $1`, [ana])).toBe("instagram");
    const pipe = await val<string>(`select id from crm_pipelines where store_id = $1 and kind = 'sales'`, [A]);
    await db.query(`insert into crm_deals (store_id, pipeline_id, stage_id, contact_id, title, origin_channel) values ($1, $2, $3, $4, 'iPhone 15 Pro', 'instagram')`, [A, pipe, await stage(A, "sales", "ig_new"), ana]);
    code = await val<string>(`select crm_ensure_handoff_code($1)`, [ana]);
    expect(code).toMatch(/^IG-[A-Z0-9]{4}$/);
    expect(await val(`select crm_ensure_handoff_code($1)`, [ana])).toBe(code);
    await db.query(`update crm_deals set stage_id = $1, handoff_sent_at = now() where contact_id = $2`, [await stage(A, "sales", "wa_invited"), ana]);
  });

  it("mensagem no WhatsApp com o código junta no mesmo contato e move o negócio", async () => {
    const r = await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "in", p_sender_kind: "contact", p_body: `Olá! Vim do Instagram · ref ${code.toLowerCase()}`, p_phone: "5521977776666", p_name: "Ana", p_external_id: "WA6" });
    expect(r).toMatchObject({ handoff: true, contact_id: ana, deals_moved: 1 });
    const d = await one(`select s.code, d.handoff_completed_at, d.origin_channel from crm_deals d join crm_stages s on s.id = d.stage_id where d.contact_id = $1`, [ana]);
    expect(d.code).toBe("wa_active");
    expect(d.handoff_completed_at).not.toBeNull();
    expect(d.origin_channel).toBe("instagram");
    expect(await val(`select count(*)::int from crm_conversations where contact_id = $1`, [ana])).toBe(2);
    expect(await val(`select phone from crm_contacts where id = $1`, [ana])).toBe("5521977776666");
  });

  it("se a pessoa já tinha contato pelo WhatsApp, os dois são juntados sem perder mensagens", async () => {
    const bia = (await ingest({ p_store_id: A, p_channel: "instagram", p_direction: "in", p_sender_kind: "contact", p_body: "oi", p_instagram_user_id: "IG888", p_external_id: "IGM2" })).contact_id;
    const biaWa = (await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "in", p_sender_kind: "contact", p_body: "oi antes", p_phone: "5531966665555", p_external_id: "WA7" })).contact_id;
    const code2 = await val<string>(`select crm_ensure_handoff_code($1)`, [bia]);
    const r = await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "in", p_sender_kind: "contact", p_body: `ref ${code2}`, p_phone: "5531966665555", p_external_id: "WA8" });
    expect(r.contact_id).toBe(bia);
    expect(await val(`select count(*)::int from crm_contacts where id = $1`, [biaWa])).toBe(0);
    expect(await val(`select count(*)::int from crm_messages where contact_id = $1`, [bia])).toBe(3);
  });
});

describe("CRM — regras do negócio", () => {
  it("perder exige motivo; ganhar limpa o motivo; histórico registra tudo", async () => {
    const dealId = await val<string>(`select d.id from crm_deals d join crm_contacts c on c.id = d.contact_id where c.instagram_user_id = 'IG777'`);
    expect(await errorOf(`update crm_deals set stage_id = $1 where id = $2`, [await stage(A, "sales", "lost"), dealId])).toMatch(/motivo da perda/);
    await db.query(`update crm_deals set stage_id = $1, lost_reason = 'Achou mais barato' where id = $2`, [await stage(A, "sales", "lost"), dealId]);
    expect(await val(`select status from crm_deals where id = $1`, [dealId])).toBe("lost");
    await db.query(`update crm_deals set stage_id = $1, value = 5200 where id = $2`, [await stage(A, "sales", "won"), dealId]);
    const won = await one(`select status, won_at, lost_reason from crm_deals where id = $1`, [dealId]);
    expect(won.status).toBe("won");
    expect(won.won_at).not.toBeNull();
    expect(won.lost_reason).toBeNull();
    expect(await val<number>(`select count(*)::int from crm_activities where deal_id = $1`, [dealId])).toBeGreaterThanOrEqual(5);
  });

  it("etapas do Instagram ficam ocultas e o resumo soma por etapa", async () => {
    const hidden = (await db.query<{ code: string }>(`select code from crm_stages where store_id = $1 and hidden order by code`, [A])).rows.map((r) => r.code);
    expect(hidden).toEqual(["ig_new", "wa_invited"]);
    const pipe = await val<string>(`select id from crm_pipelines where store_id = $1 and kind = 'sales'`, [A]);
    const won = (await db.query<{ deals: number; total: string }>(
      `select s.deals, s.total from crm_pipeline_summary($1) s join crm_stages st on st.id = s.stage_id where st.code = 'won'`, [pipe],
    )).rows[0];
    expect(won.deals).toBe(1);
    expect(Number(won.total)).toBe(5200);
  });

  it("negócio não vai para funil de outra loja", async () => {
    const dealId = await val<string>(`select id from crm_deals limit 1`);
    const pipeB = await val<string>(`select id from crm_pipelines where store_id = $1 and kind = 'sales'`, [B]);
    expect(await errorOf(`update crm_deals set pipeline_id = $1 where id = $2`, [pipeB, dealId])).toMatch(/não pertence|outra loja/);
  });
});

describe("CRM — segurança (RLS)", () => {
  it("vendedor só enxerga e cria na própria loja", async () => {
    await asUser(U1, async () => {
      expect(await val(`select count(*)::int from crm_contacts where store_id = $1`, [B])).toBe(0);
      expect(await val<number>(`select count(*)::int from crm_contacts where store_id = $1`, [A])).toBeGreaterThan(0);
      expect(await errorOf(`insert into crm_contacts (store_id, name) values ($1, 'x')`, [B])).not.toBeNull();
    });
  });

  it("pelo app só grava nota interna; envio de mensagem passa pelo servidor", async () => {
    await asUser(U1, async () => {
      const conv = await one(`select id, contact_id from crm_conversations where store_id = $1 limit 1`, [A]);
      const ins = (kind: string) => errorOf(
        `insert into crm_messages (store_id, conversation_id, contact_id, direction, sender_kind, sender_user_id, kind, body) values ($1,$2,$3,'out','user',$4,$5,'x')`,
        [A, conv.id, conv.contact_id, U1, kind],
      );
      expect(await ins("text")).not.toBeNull();
      expect(await ins("note")).toBeNull();
      expect(await errorOf(`select crm_ingest_message(p_store_id => $1, p_channel => 'whatsapp', p_direction => 'in', p_sender_kind => 'contact', p_phone => '5511911112222')`, [A])).not.toBeNull();
    });
  });

  it("vendedor não altera etapas nem apaga contatos; admin altera etapas", async () => {
    await asUser(U1, async () => {
      await db.query(`update crm_stages set name = 'x' where store_id = $1`, [A]);
      await db.query(`delete from crm_contacts where store_id = $1`, [A]);
    });
    expect(await val(`select count(*)::int from crm_stages where name = 'x'`)).toBe(0);
    expect(await val<number>(`select count(*)::int from crm_contacts where store_id = $1`, [A])).toBeGreaterThan(0);
    await asUser(ADM, async () => {
      await db.query(`update crm_stages set sla_hours = 12 where store_id = $1 and code = 'wa_invited'`, [A]);
    });
    expect(await val(`select sla_hours from crm_stages where store_id = $1 and code = 'wa_invited'`, [A])).toBe(12);
  });

  it("equipe: só membros da loja veem os colegas", async () => {
    const teamA = await asUser(U1, () => db.query<{ display_name: string }>(`select display_name from crm_team($1) order by 1`, [A]));
    expect(teamA.rows.map((r) => r.display_name)).toEqual(["Dono", "Vendedor A"]);
    const fromB = await asUser(U2, () => db.query(`select * from crm_team($1)`, [A]));
    expect(fromB.rows).toHaveLength(0);
  });

  it("contadores da caixa de entrada respeitam a loja", async () => {
    const a = await asUser(U1, () => val<any>(`select crm_inbox_counts(null)`));
    const b = await asUser(U2, () => val<any>(`select crm_inbox_counts(null)`));
    expect(a.all).toBeGreaterThan(0);
    expect(a.instagram).toBeGreaterThan(0);
    expect(b.all).toBe(0);
  });

  it("funções do app checam a loja", async () => {
    const ana = await val<string>(`select id from crm_contacts where instagram_user_id = 'IG777'`);
    const bia = await val<string>(`select id from crm_contacts where instagram_user_id = 'IG888'`);
    await asUser(U2, async () => {
      expect(await errorOf(`select crm_ensure_handoff_code($1)`, [ana])).toMatch(/Sem acesso/);
      expect(await errorOf(`select crm_merge_contacts($1, $2)`, [ana, bia])).toMatch(/Sem acesso/);
    });
  });
});

describe("CRM — tarefas e automações", () => {
  const later = "now() + interval '1 hour'";

  it("toda loja tem configuração; vendedor lê mas não altera", async () => {
    expect(await val(`select count(*)::int from crm_automation_settings`)).toBe(3);
    await asUser(U1, async () => {
      expect(await val(`select unanswered_minutes from crm_automation_settings where store_id = $1`, [A])).toBe(30);
      await db.query(`update crm_automation_settings set round_robin = true where store_id = $1`, [A]);
    });
    expect(await val(`select round_robin from crm_automation_settings where store_id = $1`, [A])).toBe(false);
  });

  it("rodízio distribui conversas novas entre os escolhidos, pulando quem saiu da loja", async () => {
    await db.query(`update crm_automation_settings set round_robin = true, round_robin_members = array[$1::uuid, $2::uuid, $3::uuid] where store_id = $4`, [U1, U2, ADM, A]);
    const owners: string[] = [];
    for (const [i, phone] of ["5511900000001", "5511900000002", "5511900000003"].entries()) {
      const r = await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "in", p_sender_kind: "contact", p_body: "oi", p_phone: phone, p_external_id: `RR${i}` });
      owners.push(await val<string>(`select assigned_to from crm_conversations where id = $1`, [r.conversation_id]));
    }
    // U2 não é membro da loja A → fica fora; alterna U1 / ADM
    expect(owners).toEqual([U1, ADM, U1]);
    await db.query(`update crm_automation_settings set round_robin = false where store_id = $1`, [A]);
  });

  it("conversa sem resposta vira tarefa uma única vez e fecha sozinha ao responder", async () => {
    const conv = await val<string>(`select cv.id from crm_conversations cv join crm_contacts c on c.id = cv.contact_id where c.phone = '5511900000001'`);
    const r1 = await val<any>(`select crm_run_automations(${later})`);
    expect(r1.reply).toBeGreaterThan(0);
    const t = await one(`select * from crm_tasks where conversation_id = $1 and kind = 'reply'`, [conv]);
    expect(t).toMatchObject({ source: "automation", assigned_to: U1, done_at: null });
    expect((await val<any>(`select crm_run_automations(${later})`)).reply).toBe(0);
    await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "out", p_sender_kind: "user", p_body: "Olá!", p_phone: "5511900000001", p_external_id: "RR-out" });
    expect(await val(`select done_at is not null from crm_tasks where id = $1`, [t.id])).toBe(true);
  });

  it("negócio parado além do prazo gera tarefa; mudar de etapa fecha", async () => {
    const pipe = await val<string>(`select id from crm_pipelines where store_id = $1 and kind = 'sales'`, [A]);
    const contact = await val<string>(`select id from crm_contacts where phone = '5511900000002'`);
    const deal = await val<string>(
      `insert into crm_deals (store_id, pipeline_id, stage_id, contact_id, title, owner_id) values ($1, $2, $3, $4, 'Moto G', $5) returning id`,
      [A, pipe, await stage(A, "sales", "proposal"), contact, ADM],
    );
    await db.query(`update crm_deals set stage_entered_at = now() - interval '4 days' where id = $1`, [deal]);
    expect((await val<any>(`select crm_run_automations()`)).stale_deal).toBe(1);
    const t = await one(`select * from crm_tasks where deal_id = $1`, [deal]);
    expect(t).toMatchObject({ kind: "stale_deal", assigned_to: ADM });
    await db.query(`update crm_deals set stage_id = $1 where id = $2`, [await stage(A, "sales", "won"), deal]);
    expect(await val(`select done_at is not null from crm_tasks where id = $1`, [t.id])).toBe(true);
  });

  it("pós-venda: OS pronta, avaliação e garantia viram sugestões (sem enviar nada)", async () => {
    const maria = await one(`select id, customer_id from crm_contacts where store_id = $1 and phone = '5587999112233'`, [A]);
    const prod = await val<string>(`insert into products (store_id, name, brand, model) values ($1, 'iPhone', 'Apple', 'iPhone 13') returning id`, [A]);
    await db.query(
      `insert into service_orders (store_id, customer_id, customer_name, customer_phone, device_brand, device_model, status, completed_at, delivered_at, warranty_end_date) values
        ($1, $2, 'Maria Cliente', '(87) 99911-2233', 'Samsung', 'A54', 'ready', now(), null, null),
        ($1, null, 'Zé', '(11) 97777-0000', 'Moto', 'G8', 'delivered', now() - interval '20 days', now() - interval '4 days', now() + interval '3 days'),
        ($1, null, 'Antigo', null, null, null, 'ready', now() - interval '30 days', null, null)`,
      [A, maria.customer_id],
    );
    await db.query(
      `insert into sales (store_id, product_id, customer_name, customer_phone, warranty_days, seller_id, created_at) values ($1, $2, 'Maria', '87999112233', 90, $3, now() - interval '3 days 12 hours')`,
      [A, prod, U1],
    );
    const r = await val<any>(`select crm_run_automations()`);
    expect(r).toMatchObject({ os_ready: 1, review: 2, warranty: 1 });

    const ready = await one(`select * from crm_tasks where kind = 'os_ready'`);
    expect(ready.contact_id).toBe(maria.id);
    expect(ready.conversation_id).not.toBeNull();
    expect(ready.suggested_message).toMatch(/^Olá Maria! Seu aparelho Samsung A54 \(OS #\d+\) já está pronto/);
    const saleReview = await one(`select * from crm_tasks where dedupe_key like 'review_sale:%'`);
    expect(saleReview).toMatchObject({ assigned_to: U1, contact_id: maria.id });
    expect(saleReview.title).toBe("Pedir avaliação · compra de Apple iPhone 13");
    // nada vira mensagem: o motor só cria tarefas
    expect(await val(`select count(*)::int from crm_messages where body like '%avaliação%'`)).toBe(0);
    expect(await val<any>(`select crm_run_automations()`)).toMatchObject({ os_ready: 0, review: 0, warranty: 0 });
  });

  it("contadores de tarefas: minhas + sem responsável, vencidas e de hoje", async () => {
    await db.query(`insert into crm_tasks (store_id, title, due_at, assigned_to) values ($1, 'vencida', now() - interval '2 hours', $2), ($1, 'de outro', now() - interval '2 hours', $3)`, [A, U1, ADM]);
    const c = await asUser(U1, () => val<any>(`select crm_task_counts($1)`, [A]));
    const mine = await asUser(U1, () => val<number>(`select count(*)::int from crm_tasks where done_at is null and (assigned_to = $1 or assigned_to is null) and due_at < now()`, [U1]));
    expect(c.overdue).toBe(mine);
    expect(c.overdue).toBeGreaterThanOrEqual(1);
    const b = await asUser(U2, () => val<any>(`select crm_task_counts(null)`));
    expect(b.open).toBe(0);
  });
});

describe("CRM — relatórios e vínculo com Vendas/OS", () => {
  const period = `now() - interval '7 days', now() + interval '1 minute'`;

  it("resume o funil, ganhos, origem e tempo de resposta da loja", async () => {
    const r = await asUser(U1, () => val<any>(`select crm_report($1, ${period})`, [A]));
    expect(r.totals).toMatchObject({ deals_created: 2, won: 2, lost: 0 });
    expect(Number(r.totals.won_value)).toBe(5200);
    expect(r.funnel.map((f: any) => f.name)).toEqual(["Em atendimento", "Orçamento / negociação", "Ganho"]);
    expect(r.funnel.map((f: any) => f.deals)).toEqual([2, 2, 2]);
    expect(r.by_origin.find((o: any) => o.origin === "instagram")).toMatchObject({ created: 1, won: 1 });
    expect(r.totals.conversations).toBeGreaterThan(0);
    expect(r.totals.answered).toBeGreaterThanOrEqual(1);
    expect(r.series).toHaveLength(8);
  });

  it("perdas entram com o motivo; outra loja não vê nada", async () => {
    const pipe = await val<string>(`select id from crm_pipelines where store_id = $1 and kind = 'sales'`, [A]);
    const contact = await val<string>(`select id from crm_contacts where phone = '5511900000003'`);
    await db.query(`insert into crm_deals (store_id, pipeline_id, stage_id, contact_id, title, lost_reason) values ($1, $2, $3, $4, 'Capinha', 'Achou mais barato')`,
      [A, pipe, await stage(A, "sales", "lost"), contact]);
    const r = await asUser(U1, () => val<any>(`select crm_report($1, ${period})`, [A]));
    expect(r.lost_reasons).toEqual([{ reason: "Achou mais barato", count: 1 }]);
    const b = await asUser(U2, () => val<any>(`select crm_report(null, ${period})`));
    expect(b.totals.deals_created).toBe(0);
    expect(b.totals.conversations).toBe(0);
  });

  it("sugere a venda e a OS do mesmo cliente para vincular ao negócio", async () => {
    const pipe = await val<string>(`select id from crm_pipelines where store_id = $1 and kind = 'sales'`, [A]);
    const maria = await val<string>(`select id from crm_contacts where store_id = $1 and phone = '5587999112233'`, [A]);
    const deal = await val<string>(`insert into crm_deals (store_id, pipeline_id, stage_id, contact_id, title) values ($1, $2, $3, $4, 'Tela A54') returning id`,
      [A, pipe, await stage(A, "sales", "proposal"), maria]);
    const rows = await asUser(U1, () => db.query<any>(`select * from crm_deal_link_candidates($1)`, [deal]));
    expect(rows.rows.map((r) => r.kind).sort()).toEqual(["sale", "service_order"]);
    expect(rows.rows.find((r) => r.kind === "service_order").label).toMatch(/^OS #\d+ · Samsung A54$/);
    await asUser(U2, async () => {
      expect(await errorOf(`select * from crm_deal_link_candidates($1)`, [deal])).toMatch(/Sem acesso/);
    });
  });
});

describe("CRM — agente de IA", () => {
  const newConv = async (phone: string, id: string) =>
    (await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "in", p_sender_kind: "contact", p_body: "oi, quanto custa a tela do A54?", p_phone: phone, p_name: "Cliente IA", p_external_id: id })).conversation_id as string;

  it("conversa nova nasce com a IA só quando o agente está ligado", async () => {
    const off = await newConv("5511955550001", "AI1");
    expect(await val(`select handler from crm_conversations where id = $1`, [off])).toBe("human");
    await db.query(`update crm_ai_settings set mode = 'draft' where store_id = $1`, [A]);
    const on = await newConv("5511955550002", "AI2");
    expect(await val(`select handler from crm_conversations where id = $1`, [on])).toBe("ai");
  });

  it("pessoa respondendo devolve ao humano; resposta da IA não", async () => {
    const conv = await val<string>(`select cv.id from crm_conversations cv join crm_contacts c on c.id = cv.contact_id where c.phone = '5511955550002'`);
    await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "out", p_sender_kind: "ai", p_body: "Olá! Qual o modelo?", p_phone: "5511955550002", p_external_id: "AI2-out" });
    expect(await val(`select handler from crm_conversations where id = $1`, [conv])).toBe("ai");
    await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "out", p_sender_kind: "user", p_body: "Oi, aqui é o João", p_phone: "5511955550002", p_external_id: "AI2-h" });
    expect(await val(`select handler from crm_conversations where id = $1`, [conv])).toBe("human");
  });

  it("passagem cria negócio de assistência na 1ª etapa visível, tarefa e usa o rodízio", async () => {
    await db.query(`update crm_automation_settings set round_robin = true, round_robin_members = array[$1::uuid] where store_id = $2`, [U1, A]);
    const conv = await newConv("5511955550003", "AI3");
    expect(await val(`select assigned_to from crm_conversations where id = $1`, [conv])).toBe(U1);
    const r = await val<any>(`select crm_ai_handoff($1, 'Troca de tela A54', 'Quer trocar a tela do A54, urgente.', 'hot', 'repair', 'qualificado')`, [conv]);
    const deal = await one(`select d.*, s.code, p.kind from crm_deals d join crm_stages s on s.id = d.stage_id join crm_pipelines p on p.id = d.pipeline_id where d.id = $1`, [r.deal_id]);
    expect(deal).toMatchObject({ kind: "service", code: "svc_new", owner_id: U1, ai_score: "hot", interest: "repair", title: "Troca de tela A54" });
    expect(await val(`select handler from crm_conversations where id = $1`, [conv])).toBe("human");
    const task = await one(`select * from crm_tasks where conversation_id = $1 and source = 'ai'`, [conv]);
    expect(task.title).toMatch(/^Assumir atendimento: /);
    expect(task.assigned_to).toBe(U1);
    // de novo: atualiza o mesmo negócio aberto, sem duplicar
    const r2 = await val<any>(`select crm_ai_handoff($1, 'x', 'Resumo novo', 'warm', 'repair', 'pediu humano')`, [conv]);
    expect(r2.deal_id).toBe(r.deal_id);
    expect(await val(`select ai_summary from crm_deals where id = $1`, [r.deal_id])).toBe("Resumo novo");
    await db.query(`update crm_automation_settings set round_robin = false where store_id = $1`, [A]);
  });

  it("venda vai para o funil de Vendas (etapa do Instagram fica de fora)", async () => {
    const conv = await newConv("5511955550004", "AI4");
    const r = await val<any>(`select crm_ai_handoff($1, 'iPhone 13', 'Quer iPhone 13', 'warm', 'device', null)`, [conv]);
    expect(await val(`select s.code from crm_deals d join crm_stages s on s.id = d.stage_id where d.id = $1`, [r.deal_id])).toBe("wa_active");
  });

  it("sugestões: membro só descarta; ligar/desligar a IA checa a loja", async () => {
    const conv = await val<string>(`select cv.id from crm_conversations cv join crm_contacts c on c.id = cv.contact_id where c.phone = '5511955550004'`);
    const sug = await val<string>(`insert into crm_ai_suggestions (store_id, conversation_id, body) values ($1, $2, 'Olá!') returning id`, [A, conv]);
    await asUser(U1, async () => {
      expect(await errorOf(`update crm_ai_suggestions set status = 'sent', decided_by = $2 where id = $1`, [sug, U1])).not.toBeNull();
      await db.query(`update crm_ai_suggestions set status = 'discarded', decided_by = $2, decided_at = now() where id = $1`, [sug, U1]);
      expect(await errorOf(`insert into crm_ai_suggestions (store_id, conversation_id, body) values ($1, $2, 'x')`, [A, conv])).not.toBeNull();
      await db.query(`select crm_set_conversation_handler($1, 'ai')`, [conv]);
    });
    expect(await val(`select status from crm_ai_suggestions where id = $1`, [sug])).toBe("discarded");
    expect(await val(`select handler from crm_conversations where id = $1`, [conv])).toBe("ai");
    await asUser(U2, async () => {
      expect(await errorOf(`select crm_set_conversation_handler($1, 'human')`, [conv])).toMatch(/Sem acesso/);
    });
    await asUser(U1, async () => {
      await db.query(`select crm_set_conversation_handler($1, 'human')`, [conv]);
    });
    expect(await val(`select handler from crm_conversations where id = $1`, [conv])).toBe("human");
  });
});

describe("CRM — o agente aprende", () => {
  const add = (q: string, a: string, status = "approved", kind = "qa") =>
    val<string | null>(`select crm_ai_add_example($1, $2, null, $3, $4, 'history', $5)`, [A, kind, q, a, status]);

  it("biblioteca não guarda repetido e marca resposta com preço", async () => {
    expect(await add("vocês trocam tela de iphone 11?", "Trocamos sim! Fica pronto no mesmo dia.")).not.toBeNull();
    expect(await add("voces trocam tela do iphone 11", "Trocamos sim, fica pronto no mesmo dia.")).toBeNull();
    const id = await add("quanto custa a película 3D?", "A película 3D sai por R$ 30.");
    expect(await val(`select has_price from crm_ai_examples where id = $1`, [id])).toBe(true);
    expect(await add("", "Garantia de 90 dias nos consertos.", "pending", "fact")).not.toBeNull();
    expect(await add("", "Garantia de 90 dias em todos os consertos.", "pending", "fact")).toBeNull();
  });

  it("acha exemplos aprovados parecidos com a mensagem (pendentes ficam de fora)", async () => {
    await add("tem capinha pro A54?", "Temos várias! Quer ver fotos?", "pending");
    const rows = (await db.query<{ question: string }>(`select question from crm_ai_similar_examples($1, 'oi, troca tela de iphone 11 ai?')`, [A])).rows;
    expect(rows[0]?.question).toBe("vocês trocam tela de iphone 11?");
    const capa = (await db.query(`select * from crm_ai_similar_examples($1, 'tem capinha pro A54?')`, [A])).rows;
    expect(capa).toHaveLength(0);
  });

  it("vendedor só lê a biblioteca; gerência aprova", async () => {
    const pend = await val<string>(`select id from crm_ai_examples where question = 'tem capinha pro A54?'`);
    await asUser(U1, async () => {
      expect(await val<number>(`select count(*)::int from crm_ai_examples`)).toBeGreaterThan(0);
      await db.query(`update crm_ai_examples set status = 'approved' where id = $1`, [pend]);
    });
    expect(await val(`select status from crm_ai_examples where id = $1`, [pend])).toBe("pending");
    await asUser(ADM, async () => {
      await db.query(`update crm_ai_examples set status = 'approved' where id = $1`, [pend]);
    });
    expect(await val(`select status from crm_ai_examples where id = $1`, [pend])).toBe("approved");
    const s = await asUser(U1, () => val<any>(`select crm_ai_stats($1, 30)`, [A]));
    expect(s.library).toBeGreaterThanOrEqual(3);
    expect(await asUser(U2, () => val<any>(`select crm_ai_stats(null, 30)`)).then((x: any) => x.library)).toBe(0);
  });
});

describe("CRM — rastreamento de campanhas (Meta)", () => {
  const newContact = async (phone: string, id: string) =>
    (await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "in", p_sender_kind: "contact", p_body: "Olá! (cód. K7Q2M)", p_phone: phone, p_external_id: id })).contact_id as string;
  const events = (contact: string) => db.query<any>(`select event_name, event_id, value, status from crm_meta_events where contact_id = $1 order by created_at`, [contact]).then((r) => r.rows);

  it("liga o contato ao clique do link pelo código (com campanha, fbclid e IP)", async () => {
    const link = await val<string>(`insert into crm_track_links (store_id, slug, name) values ($1, 'promo-tela', 'Promo tela') returning id`, [A]);
    await db.query(
      `insert into crm_track_clicks (store_id, link_id, code, fbclid, fbc, utm, campaign_id, ad_id, ip, user_agent)
       values ($1, $2, 'K7Q2M', 'IwAR123', 'fb.1.1700000000000.IwAR123', '{"utm_source":"facebook","utm_campaign":"Tela A54","utm_content":"Video 1"}', '111', '333', '200.1.2.3', 'Mozilla')`,
      [A, link],
    );
    const c = await newContact("5511944440001", "TRK1");
    const r = await val<any>(`select crm_track_attach($1, 'k7q2m', '{}', true)`, [c]);
    expect(r).toMatchObject({ attached: true, kind: "link" });
    const at = await one(`select a.* from crm_contacts c join crm_attributions a on a.id = c.attribution_id where c.id = $1`, [c]);
    expect(at).toMatchObject({ kind: "link", utm_campaign: "Tela A54", ad_id: "333", fbc: "fb.1.1700000000000.IwAR123", ip: "200.1.2.3" });
    expect(await val(`select contact_id from crm_track_clicks where code = 'K7Q2M'`)).toBe(c);
    // o mesmo código não liga outra pessoa
    const other = await newContact("5511944440002", "TRK2");
    expect((await val<any>(`select crm_track_attach($1, 'K7Q2M', '{}', true)`, [other])).attached).toBe(false);
  });

  it("anúncio que abre o WhatsApp direto e origem orgânica (só no 1º contato)", async () => {
    const c = await newContact("5511944440003", "TRK3");
    expect((await val<any>(`select crm_track_attach($1, null, '{"entry_point":"ctwa_ad","ad_source_id":"999","ad_title":"Tela em 1h"}', true)`, [c])).kind).toBe("ctwa");
    const o = await newContact("5511944440004", "TRK4");
    expect((await val<any>(`select crm_track_attach($1, null, '{"entry_point":"click_to_chat_link"}', false)`, [o])).attached).toBe(false);
    expect((await val<any>(`select crm_track_attach($1, null, '{"entry_point":"click_to_chat_link"}', true)`, [o])).kind).toBe("organic");
  });

  it("fila da Meta: só com rastreamento ligado; Lead, qualificado e compra sem duplicar", async () => {
    const c = await val<string>(`select id from crm_contacts where phone = '5511944440001'`);
    expect(await val(`select crm_meta_enqueue($1, null, 'lead')`, [c])).toBeNull(); // desligado
    await db.query(`update crm_tracking_settings set enabled = true, dataset_id = '123456' where store_id = $1`, [A]);
    expect(await val(`select crm_meta_enqueue($1, null, 'lead')`, [c])).not.toBeNull();
    expect(await val(`select crm_meta_enqueue($1, null, 'lead')`, [c])).toBeNull(); // já na fila

    const pipe = await val<string>(`select id from crm_pipelines where store_id = $1 and kind = 'sales'`, [A]);
    const deal = await val<string>(`insert into crm_deals (store_id, pipeline_id, stage_id, contact_id, title, value) values ($1, $2, $3, $4, 'Tela A54', 450) returning id`,
      [A, pipe, await stage(A, "sales", "wa_active"), c]);
    await db.query(`update crm_deals set stage_id = $1 where id = $2`, [await stage(A, "sales", "proposal"), deal]);
    await db.query(`update crm_deals set stage_id = $1 where id = $2`, [await stage(A, "sales", "won"), deal]);
    const ev = await events(c);
    expect(ev.map((e: any) => e.event_name)).toEqual(["Lead", "QualifiedLead", "Purchase"]);
    expect(Number(ev[2].value)).toBe(450);
  });

  it("modo só anúncio ignora contato sem origem rastreada; relatório por campanha", async () => {
    await db.query(`update crm_tracking_settings set only_attributed = true where store_id = $1`, [A]);
    const plain = await newContact("5511944440005", "TRK5");
    expect(await val(`select crm_meta_enqueue($1, null, 'lead')`, [plain])).toBeNull();
    await db.query(`update crm_tracking_settings set only_attributed = false where store_id = $1`, [A]);

    const rows = await asUser(U1, () => db.query<any>(`select * from crm_tracking_report($1, now() - interval '1 day', now() + interval '1 minute')`, [A]));
    const tela = rows.rows.find((r: any) => r.campaign === "Tela A54");
    expect(tela).toMatchObject({ source: "Link de rastreio", ad: "Video 1", contacts: 1, won: 1 });
    expect(Number(tela.revenue)).toBe(450);
    const b = await asUser(U2, () => db.query(`select * from crm_tracking_report(null, now() - interval '1 day', now() + interval '1 minute')`));
    expect(b.rows).toHaveLength(0);
  });
});

describe("CRM — lead do Instagram (manual)", () => {
  const create = (args: Record<string, unknown>) => {
    const keys = Object.keys(args);
    return db.query<{ r: any }>(`select crm_create_instagram_lead(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, Object.values(args)).then((x) => x.rows[0].r);
  };

  it("cria contato, origem, conversa (com o vendedor, sem IA), negócio, retomada e evento Lead", async () => {
    const r = await asUser(U1, () => create({
      p_store_id: A, p_phone: "(81) 98877-6655", p_name: "Bruna Lima", p_username: "@bruna.lima", p_interest: "repair",
      p_subject: "Troca de tela iPhone 12", p_source: "ad", p_campaign: "Tela Novembro",
    }));
    expect(r.existing).toBe(false);
    const c = await one(`select * from crm_contacts where id = $1`, [r.contact_id]);
    expect(c).toMatchObject({ name: "Bruna Lima", phone: "5581988776655", instagram_username: "bruna.lima", origin_channel: "instagram", owner_id: U1 });
    expect(await one(`select kind, utm_campaign, utm_medium, entry_point from crm_attributions where id = $1`, [c.attribution_id]))
      .toEqual({ kind: "manual", utm_campaign: "Tela Novembro", utm_medium: "paid", entry_point: "instagram_ad" });
    // agente de IA está em rascunho nesta loja (testes anteriores), mas a conversa fica com o vendedor
    expect(await one(`select handler, assigned_to, status from crm_conversations where id = $1`, [r.conversation_id]))
      .toEqual({ handler: "human", assigned_to: U1, status: "open" });
    expect(await val(`select s.code from crm_deals d join crm_stages s on s.id = d.stage_id where d.id = $1`, [r.deal_id])).toBe("svc_new");
    const t = await one(`select * from crm_tasks where conversation_id = $1 and kind = 'ig_followup'`, [r.conversation_id]);
    expect(t.assigned_to).toBe(U1);
    expect(await val<boolean>(`select due_at between now() + interval '119 minutes' and now() + interval '121 minutes' from crm_tasks where id = $1`, [t.id])).toBe(true);
    expect(await val(`select count(*)::int from crm_meta_events where contact_id = $1 and event_name = 'Lead'`, [r.contact_id])).toBe(1);
  });

  it("mesmo número de novo: reaproveita contato, conversa e negócio", async () => {
    const r = await asUser(U1, () => create({ p_store_id: A, p_phone: "81988776655", p_name: "Outra", p_source: "organic" }));
    expect(r.existing).toBe(true);
    expect(r.contact_name).toBe("Bruna Lima");
    expect(await val(`select count(*)::int from crm_deals where contact_id = $1`, [r.contact_id])).toBe(1);
    expect(await val(`select count(*)::int from crm_conversations where contact_id = $1`, [r.contact_id])).toBe(1);
    // origem do primeiro toque continua a do anúncio
    expect(await val(`select a.kind || ':' || coalesce(a.utm_campaign, '') from crm_contacts c join crm_attributions a on a.id = c.attribution_id where c.id = $1`, [r.contact_id])).toBe("manual:Tela Novembro");
  });

  it("número inválido e loja de outra pessoa são recusados", async () => {
    expect(await asUser(U1, () => errorOf(`select crm_create_instagram_lead($1, '123')`, [A]))).toMatch(/inválido/);
    expect(await asUser(U2, () => errorOf(`select crm_create_instagram_lead($1, '81988776655')`, [A]))).toMatch(/Sem acesso/);
  });

  it("a pessoa respondendo no WhatsApp fecha a retomada e conta no relatório", async () => {
    await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "out", p_sender_kind: "user", p_body: "Oi Bruna! Aqui é a loja", p_phone: "5581988776655", p_external_id: "IGM-out" });
    const conv = await val<string>(`select cv.id from crm_conversations cv join crm_contacts c on c.id = cv.contact_id where c.phone = '5581988776655'`);
    // cadastrar o mesmo lead duas vezes seguidas não duplica a retomada
    expect(await val(`select count(*)::int from crm_tasks where conversation_id = $1 and kind = 'ig_followup' and done_at is null`, [conv])).toBe(1);
    await ingest({ p_store_id: A, p_channel: "whatsapp", p_direction: "in", p_sender_kind: "contact", p_body: "Oi! Quero sim", p_phone: "5581988776655", p_external_id: "IGM-in" });
    expect(await val(`select count(*)::int from crm_tasks where conversation_id = $1 and kind = 'ig_followup' and done_at is null`, [conv])).toBe(0);
    const rep = await asUser(U1, () => val<any>(`select crm_ig_manual_report($1, now() - interval '1 day', now() + interval '1 minute')`, [A]));
    expect(rep).toMatchObject({ leads: 1, from_ads: 1, replied: 1, won: 0 });
    const camp = await asUser(U1, () => db.query<any>(`select * from crm_tracking_report($1, now() - interval '1 day', now() + interval '1 minute') where campaign = 'Tela Novembro'`, [A]));
    expect(camp.rows[0]).toMatchObject({ source: "Anúncio Instagram", contacts: 1 });
  });
});
