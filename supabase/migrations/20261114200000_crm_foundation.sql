-- =====================================================================
-- CRM — Fase 1: fundação
-- Tabelas crm_*, RLS por loja (member_stores), normalização de telefone,
-- ingestão atômica de mensagens, junção de contatos e funis padrão.
-- As tabelas antigas (leads, lead_messages, lead_responses) NÃO são tocadas.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Funções utilitárias
-- ---------------------------------------------------------------------

-- Telefone brasileiro → DDD + número (10 ou 11 dígitos), ou null.
create or replace function public.crm_normalize_phone(p text)
returns text
language sql immutable parallel safe
set search_path = public
as $$
  with d as (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as x),
  s as (
    select case
      when length(x) in (12, 13) and left(x, 2) = '55' then substr(x, 3)
      when length(x) in (11, 12) and left(x, 1) = '0'  then ltrim(x, '0')
      else x
    end as n
    from d
  )
  select case when length(n) in (10, 11) and left(n, 1) <> '0' then n else null end from s;
$$;

-- Chave de casamento: DDD + 8 últimos dígitos (resolve o 9º dígito).
create or replace function public.crm_phone_key(p text)
returns text
language sql immutable parallel safe
set search_path = public
as $$
  select case when n is null then null else left(n, 2) || right(n, 8) end
  from (select public.crm_normalize_phone(p) as n) t;
$$;

create or replace function public.crm_is_member(p_store_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.member_stores
    where user_id = (select auth.uid()) and store_id = p_store_id
  );
$$;

create or replace function public.crm_is_manager()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role::text in ('admin', 'gerente', 'dono')
  );
$$;

create or replace function public.crm_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------

create table if not exists public.crm_contacts (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  name                text not null default 'Contato',
  phone               text,                 -- 55 + DDD + número
  phone_key           text,                 -- DDD + 8 últimos dígitos
  email               text,
  instagram_user_id   text,
  instagram_username  text,
  avatar_url          text,
  customer_id         uuid references public.customers(id) on delete set null,
  origin_channel      text not null default 'manual'
                      check (origin_channel in ('whatsapp', 'instagram', 'manual', 'os_vendas', 'import')),
  handoff_code        text,                 -- código do link Instagram → WhatsApp (ex.: IG-4F2K)
  tags                text[] not null default '{}',
  ignored             boolean not null default false,  -- "não é cliente": fora do CRM e da IA
  ignored_reason      text,
  notes               text,
  owner_id            uuid references auth.users(id) on delete set null,
  legacy_lead_ids     uuid[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists crm_contacts_store_phone_key_uq  on public.crm_contacts (store_id, phone_key) where phone_key is not null;
create unique index if not exists crm_contacts_store_instagram_uq  on public.crm_contacts (store_id, instagram_user_id) where instagram_user_id is not null;
create unique index if not exists crm_contacts_handoff_code_uq     on public.crm_contacts (handoff_code) where handoff_code is not null;
create index if not exists crm_contacts_customer_idx  on public.crm_contacts (customer_id);
create index if not exists crm_contacts_store_created on public.crm_contacts (store_id, created_at desc);
create index if not exists crm_contacts_name_trgm     on public.crm_contacts using gin (name extensions.gin_trgm_ops);

create table if not exists public.crm_conversations (
  id                      uuid primary key default gen_random_uuid(),
  store_id                uuid not null references public.stores(id) on delete cascade,
  contact_id              uuid not null references public.crm_contacts(id) on delete cascade,
  channel                 text not null check (channel in ('whatsapp', 'instagram')),
  external_thread_id      text,             -- remoteJid do WhatsApp / id do Instagram
  status                  text not null default 'open' check (status in ('open', 'pending', 'resolved')),
  assigned_to             uuid references auth.users(id) on delete set null,
  handler                 text not null default 'human' check (handler in ('ai', 'human')),
  ai_paused_until         timestamptz,
  unread_count            integer not null default 0,
  last_message_at         timestamptz,
  last_message_preview    text,
  last_message_direction  text check (last_message_direction in ('in', 'out')),
  last_inbound_at         timestamptz,      -- janela de 24 h do Instagram
  first_response_at       timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (contact_id, channel)
);
create index if not exists crm_conversations_store_last   on public.crm_conversations (store_id, last_message_at desc nulls last);
create index if not exists crm_conversations_store_status on public.crm_conversations (store_id, status, last_message_at desc nulls last);
create index if not exists crm_conversations_assigned     on public.crm_conversations (assigned_to, status);

create table if not exists public.crm_messages (
  id                      uuid primary key default gen_random_uuid(),
  store_id                uuid not null references public.stores(id) on delete cascade,
  conversation_id         uuid not null references public.crm_conversations(id) on delete cascade,
  contact_id              uuid not null references public.crm_contacts(id) on delete cascade,
  direction               text not null check (direction in ('in', 'out')),
  sender_kind             text not null check (sender_kind in ('contact', 'user', 'ai', 'system')),
  sender_user_id          uuid references auth.users(id) on delete set null,
  kind                    text not null default 'text'
                          check (kind in ('text', 'image', 'audio', 'video', 'document', 'sticker', 'note')),
  body                    text,
  media_path              text,             -- caminho no bucket privado
  media_url               text,             -- URL pública antiga (dados migrados)
  media_mime              text,
  external_id             text,             -- id da mensagem no WhatsApp/Instagram
  status                  text not null default 'received'
                          check (status in ('pending', 'sent', 'delivered', 'read', 'failed', 'received')),
  error                   text,
  legacy_lead_message_id  uuid unique,
  created_at              timestamptz not null default now(),
  inserted_at             timestamptz not null default now()
);
create unique index if not exists crm_messages_conv_external_uq on public.crm_messages (conversation_id, external_id) where external_id is not null;
create index if not exists crm_messages_conv_created    on public.crm_messages (conversation_id, created_at desc);
create index if not exists crm_messages_store_external  on public.crm_messages (store_id, external_id) where external_id is not null;
create index if not exists crm_messages_contact_created on public.crm_messages (contact_id, created_at desc);

create table if not exists public.crm_pipelines (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  name        text not null,
  kind        text not null default 'sales' check (kind in ('sales', 'service')),
  position    integer not null default 0,
  is_default  boolean not null default false,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists crm_pipelines_store on public.crm_pipelines (store_id, position);

create table if not exists public.crm_stages (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  pipeline_id  uuid not null references public.crm_pipelines(id) on delete cascade,
  name         text not null,
  code         text,                        -- código estável usado por automações (ig_new, wa_invited...)
  position     integer not null default 0,
  kind         text not null default 'open' check (kind in ('open', 'won', 'lost')),
  sla_hours    integer,                     -- tempo máximo parado na etapa
  color        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (pipeline_id, code)
);
create index if not exists crm_stages_pipeline on public.crm_stages (pipeline_id, position);

create table if not exists public.crm_deals (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references public.stores(id) on delete cascade,
  pipeline_id           uuid not null references public.crm_pipelines(id) on delete cascade,
  stage_id              uuid not null references public.crm_stages(id) on delete restrict,
  contact_id            uuid not null references public.crm_contacts(id) on delete cascade,
  title                 text not null,
  value                 numeric(12, 2) not null default 0 check (value >= 0),
  interest              text check (interest in ('device', 'repair', 'accessory', 'other')),
  owner_id              uuid references auth.users(id) on delete set null,
  status                text not null default 'open' check (status in ('open', 'won', 'lost')),
  lost_reason           text,
  expected_close_date   date,
  position              double precision not null default extract(epoch from now()),
  stage_entered_at      timestamptz not null default now(),
  origin_channel        text check (origin_channel in ('whatsapp', 'instagram', 'manual', 'os_vendas', 'import')),
  handoff_sent_at       timestamptz,        -- link do WhatsApp enviado no Instagram
  handoff_completed_at  timestamptz,        -- pessoa chegou no WhatsApp
  sale_id               uuid,
  service_order_id      uuid references public.service_orders(id) on delete set null,
  ai_summary            text,
  ai_score              text check (ai_score in ('hot', 'warm', 'cold')),
  won_at                timestamptz,
  lost_at               timestamptz,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists crm_deals_board   on public.crm_deals (pipeline_id, stage_id, position);
create index if not exists crm_deals_contact on public.crm_deals (contact_id);
create index if not exists crm_deals_store   on public.crm_deals (store_id, status);
create index if not exists crm_deals_owner   on public.crm_deals (owner_id, status);

create table if not exists public.crm_activities (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  contact_id       uuid references public.crm_contacts(id) on delete cascade,
  deal_id          uuid references public.crm_deals(id) on delete cascade,
  conversation_id  uuid references public.crm_conversations(id) on delete set null,
  actor_kind       text not null default 'system' check (actor_kind in ('user', 'ai', 'system')),
  actor_id         uuid references auth.users(id) on delete set null,
  type             text not null,
  payload          jsonb not null default '{}',
  created_at       timestamptz not null default now()
);
create index if not exists crm_activities_contact on public.crm_activities (contact_id, created_at desc);
create index if not exists crm_activities_deal    on public.crm_activities (deal_id, created_at desc);

create table if not exists public.crm_tasks (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  title        text not null,
  notes        text,
  kind         text not null default 'follow_up',
  due_at       timestamptz,
  done_at      timestamptz,
  assigned_to  uuid references auth.users(id) on delete set null,
  contact_id   uuid references public.crm_contacts(id) on delete cascade,
  deal_id      uuid references public.crm_deals(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists crm_tasks_assignee on public.crm_tasks (assigned_to, done_at, due_at);
create index if not exists crm_tasks_contact  on public.crm_tasks (contact_id);
create index if not exists crm_tasks_deal     on public.crm_tasks (deal_id);

create table if not exists public.crm_quick_replies (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  shortcut    text not null,
  body        text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists crm_quick_replies_uq on public.crm_quick_replies (store_id, lower(shortcut));

create table if not exists public.crm_tags (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  name        text not null,
  color       text,
  created_at  timestamptz not null default now()
);
create unique index if not exists crm_tags_uq on public.crm_tags (store_id, lower(name));

create table if not exists public.crm_ai_settings (
  store_id              uuid primary key references public.stores(id) on delete cascade,
  mode                  text not null default 'off' check (mode in ('off', 'draft', 'autopilot')),
  knowledge             text,
  collect_fields        jsonb not null default '["interest","device_model","defect","urgency","name"]',
  business_hours        jsonb,
  max_replies_per_day   integer not null default 30,
  handoff_message       text,
  updated_by            uuid references auth.users(id) on delete set null,
  updated_at            timestamptz not null default now()
);

create table if not exists public.crm_ai_runs (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  conversation_id     uuid references public.crm_conversations(id) on delete cascade,
  trigger_message_id  uuid references public.crm_messages(id) on delete set null,
  decision            text,
  input               jsonb,
  output              jsonb,
  model               text,
  latency_ms          integer,
  error               text,
  created_at          timestamptz not null default now()
);
create index if not exists crm_ai_runs_conv on public.crm_ai_runs (conversation_id, created_at desc);

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['crm_contacts','crm_conversations','crm_pipelines','crm_stages','crm_deals','crm_tasks','crm_quick_replies','crm_ai_settings']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.crm_touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Regras dos negócios (etapa → status, motivo de perda, histórico)
-- ---------------------------------------------------------------------

create or replace function public.crm_deals_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_stage_kind  text;
  v_stage_store uuid;
  v_contact_store uuid;
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id or new.pipeline_id is distinct from old.pipeline_id then
    select kind, store_id into v_stage_kind, v_stage_store
    from public.crm_stages where id = new.stage_id and pipeline_id = new.pipeline_id;
    if v_stage_kind is null then
      raise exception 'A etapa não pertence a este funil.';
    end if;
    if v_stage_store <> new.store_id then
      raise exception 'O funil é de outra loja.';
    end if;
    new.stage_entered_at := now();
    new.status  := case v_stage_kind when 'won' then 'won' when 'lost' then 'lost' else 'open' end;
    new.won_at  := case when v_stage_kind = 'won'  then coalesce(new.won_at, now())  else null end;
    new.lost_at := case when v_stage_kind = 'lost' then coalesce(new.lost_at, now()) else null end;
    if v_stage_kind = 'lost' and coalesce(btrim(new.lost_reason), '') = '' then
      raise exception 'Informe o motivo da perda.';
    end if;
    if v_stage_kind <> 'lost' then
      new.lost_reason := null;
    end if;
  end if;

  if tg_op = 'INSERT' or new.contact_id is distinct from old.contact_id then
    select store_id into v_contact_store from public.crm_contacts where id = new.contact_id;
    if v_contact_store is distinct from new.store_id then
      raise exception 'O contato é de outra loja.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_deals_before_write on public.crm_deals;
create trigger crm_deals_before_write
  before insert or update on public.crm_deals
  for each row execute function public.crm_deals_before_write();

create or replace function public.crm_deals_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.crm_activities (store_id, contact_id, deal_id, actor_kind, actor_id, type, payload)
    values (new.store_id, new.contact_id, new.id, case when v_actor is null then 'system' else 'user' end, v_actor,
            'deal_created', jsonb_build_object('stage_id', new.stage_id, 'value', new.value));
  elsif new.stage_id is distinct from old.stage_id then
    insert into public.crm_activities (store_id, contact_id, deal_id, actor_kind, actor_id, type, payload)
    values (new.store_id, new.contact_id, new.id, case when v_actor is null then 'system' else 'user' end, v_actor,
            case new.status when 'won' then 'deal_won' when 'lost' then 'deal_lost' else 'stage_changed' end,
            jsonb_build_object('from', old.stage_id, 'to', new.stage_id, 'lost_reason', new.lost_reason));
  end if;
  return null;
end;
$$;

drop trigger if exists crm_deals_after_write on public.crm_deals;
create trigger crm_deals_after_write
  after insert or update on public.crm_deals
  for each row execute function public.crm_deals_after_write();

-- ---------------------------------------------------------------------
-- 4. Funis padrão (jornada Instagram → WhatsApp)
-- ---------------------------------------------------------------------

create or replace function public.crm_seed_store(p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales   uuid;
  v_service uuid;
begin
  if exists (select 1 from public.crm_pipelines where store_id = p_store_id) then
    return;
  end if;

  insert into public.crm_pipelines (store_id, name, kind, position, is_default)
  values (p_store_id, 'Vendas', 'sales', 0, true) returning id into v_sales;

  insert into public.crm_stages (store_id, pipeline_id, name, code, position, kind, sla_hours, color) values
    (p_store_id, v_sales, 'Novo no Instagram',         'ig_new',     0, 'open', 2,    'pink'),
    (p_store_id, v_sales, 'Chamado para o WhatsApp',   'wa_invited', 1, 'open', 24,   'amber'),
    (p_store_id, v_sales, 'No WhatsApp (atendimento)', 'wa_active',  2, 'open', 24,   'green'),
    (p_store_id, v_sales, 'Orçamento / negociação',    'proposal',   3, 'open', 72,   'blue'),
    (p_store_id, v_sales, 'Ganho',                     'won',        4, 'won',  null, 'emerald'),
    (p_store_id, v_sales, 'Perdido',                   'lost',       5, 'lost', null, 'slate');

  insert into public.crm_pipelines (store_id, name, kind, position, is_default)
  values (p_store_id, 'Assistência', 'service', 1, false) returning id into v_service;

  insert into public.crm_stages (store_id, pipeline_id, name, code, position, kind, sla_hours, color) values
    (p_store_id, v_service, 'Novo contato',            'svc_new',      0, 'open', 4,    'blue'),
    (p_store_id, v_service, 'Orçamento enviado',       'svc_quote',    1, 'open', 48,   'amber'),
    (p_store_id, v_service, 'Aprovado / em reparo',    'svc_approved', 2, 'open', null, 'violet'),
    (p_store_id, v_service, 'Concluído',               'won',          3, 'won',  null, 'emerald'),
    (p_store_id, v_service, 'Perdido',                 'lost',         4, 'lost', null, 'slate');

  insert into public.crm_ai_settings (store_id) values (p_store_id) on conflict do nothing;
end;
$$;

create or replace function public.crm_stores_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crm_seed_store(new.id);
  return null;
end;
$$;

drop trigger if exists crm_stores_seed on public.stores;
create trigger crm_stores_seed
  after insert on public.stores
  for each row execute function public.crm_stores_after_insert();

select public.crm_seed_store(id) from public.stores;

-- ---------------------------------------------------------------------
-- 5. Junção de contatos (mesma pessoa em dois registros)
-- ---------------------------------------------------------------------

create or replace function public.crm_merge_contacts(p_keep uuid, p_drop uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.crm_contacts%rowtype;
  d public.crm_contacts%rowtype;
  dc record;
  v_keep_conv uuid;
begin
  if p_keep = p_drop then return p_keep; end if;
  select * into k from public.crm_contacts where id = p_keep for update;
  select * into d from public.crm_contacts where id = p_drop for update;
  if k.id is null or d.id is null then raise exception 'Contato não encontrado.'; end if;
  if k.store_id <> d.store_id then raise exception 'Contatos de lojas diferentes.'; end if;
  if (select auth.uid()) is not null and not public.crm_is_member(k.store_id) then
    raise exception 'Sem acesso a esta loja.';
  end if;

  for dc in select * from public.crm_conversations where contact_id = d.id loop
    select id into v_keep_conv from public.crm_conversations where contact_id = k.id and channel = dc.channel;
    if v_keep_conv is null then
      update public.crm_conversations set contact_id = k.id where id = dc.id;
    else
      delete from public.crm_messages m
       where m.conversation_id = dc.id and m.external_id is not null
         and exists (select 1 from public.crm_messages x where x.conversation_id = v_keep_conv and x.external_id = m.external_id);
      update public.crm_messages set conversation_id = v_keep_conv where conversation_id = dc.id;
      update public.crm_conversations kc set
        unread_count        = kc.unread_count + dc.unread_count,
        last_message_at     = greatest(kc.last_message_at, dc.last_message_at),
        last_inbound_at     = greatest(kc.last_inbound_at, dc.last_inbound_at),
        first_response_at   = least(kc.first_response_at, dc.first_response_at),
        external_thread_id  = coalesce(kc.external_thread_id, dc.external_thread_id),
        status              = case when 'open' in (kc.status, dc.status) then 'open' else kc.status end
      where kc.id = v_keep_conv;
      delete from public.crm_conversations where id = dc.id;
    end if;
  end loop;

  update public.crm_messages   set contact_id = k.id where contact_id = d.id;
  update public.crm_deals      set contact_id = k.id where contact_id = d.id;
  update public.crm_tasks      set contact_id = k.id where contact_id = d.id;
  update public.crm_activities set contact_id = k.id where contact_id = d.id;

  delete from public.crm_contacts where id = d.id;

  update public.crm_contacts set
    phone              = coalesce(k.phone, d.phone),
    phone_key          = coalesce(k.phone_key, d.phone_key),
    email              = coalesce(k.email, d.email),
    instagram_user_id  = coalesce(k.instagram_user_id, d.instagram_user_id),
    instagram_username = coalesce(k.instagram_username, d.instagram_username),
    avatar_url         = coalesce(k.avatar_url, d.avatar_url),
    customer_id        = coalesce(k.customer_id, d.customer_id),
    handoff_code       = coalesce(k.handoff_code, d.handoff_code),
    owner_id           = coalesce(k.owner_id, d.owner_id),
    origin_channel     = case when d.created_at < k.created_at then d.origin_channel else k.origin_channel end,
    created_at         = least(k.created_at, d.created_at),
    tags               = (select coalesce(array_agg(distinct t), '{}') from unnest(k.tags || d.tags) t),
    legacy_lead_ids    = k.legacy_lead_ids || d.legacy_lead_ids,
    notes              = nullif(concat_ws(E'\n', k.notes, d.notes), '')
  where id = k.id;

  insert into public.crm_activities (store_id, contact_id, actor_kind, actor_id, type, payload)
  values (k.store_id, k.id, case when (select auth.uid()) is null then 'system' else 'user' end, (select auth.uid()),
          'contacts_merged', jsonb_build_object('merged_contact_id', d.id, 'merged_name', d.name));
  return k.id;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Código do link Instagram → WhatsApp
-- ---------------------------------------------------------------------

create or replace function public.crm_ensure_handoff_code(p_contact_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid;
  v_code  text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  select store_id, handoff_code into v_store, v_code from public.crm_contacts where id = p_contact_id;
  if v_store is null then raise exception 'Contato não encontrado.'; end if;
  if (select auth.uid()) is not null and not public.crm_is_member(v_store) then
    raise exception 'Sem acesso a esta loja.';
  end if;
  if v_code is not null then return v_code; end if;

  for attempt in 1..20 loop
    v_code := 'IG-';
    for i in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    begin
      update public.crm_contacts set handoff_code = v_code where id = p_contact_id;
      return v_code;
    exception when unique_violation then
      -- tenta outro código
    end;
  end loop;
  raise exception 'Não foi possível gerar o código.';
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Ingestão única de mensagens (webhooks, histórico, envio)
-- ---------------------------------------------------------------------

create or replace function public.crm_ingest_message(
  p_store_id            uuid,
  p_channel             text,
  p_direction           text,
  p_sender_kind         text,
  p_kind                text        default 'text',
  p_body                text        default null,
  p_phone               text        default null,
  p_instagram_user_id   text        default null,
  p_instagram_username  text        default null,
  p_name                text        default null,
  p_avatar_url          text        default null,
  p_external_thread_id  text        default null,
  p_media_path          text        default null,
  p_media_url           text        default null,
  p_media_mime          text        default null,
  p_external_id         text        default null,
  p_created_at          timestamptz default null,
  p_sender_user_id      uuid        default null,
  p_status              text        default null,
  p_create_contact      boolean     default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm      text := public.crm_normalize_phone(p_phone);
  v_key       text := public.crm_phone_key(p_phone);
  v_at        timestamptz := coalesce(p_created_at, now());
  v_create    boolean := coalesce(p_create_contact, p_direction = 'in');
  v_contact   public.crm_contacts%rowtype;
  v_coded     public.crm_contacts%rowtype;
  v_conv      public.crm_conversations%rowtype;
  v_msg_id    uuid;
  v_code      text;
  v_customer  uuid;
  v_created   boolean := false;
  v_handoff   boolean := false;
  v_moved     integer := 0;
  v_name      text := nullif(btrim(p_name), '');
  v_preview   text;
begin
  if p_channel not in ('whatsapp', 'instagram') then raise exception 'Canal inválido: %', p_channel; end if;
  if p_direction not in ('in', 'out') then raise exception 'Direção inválida: %', p_direction; end if;
  if p_channel = 'whatsapp' and v_key is null then raise exception 'Telefone inválido para WhatsApp.'; end if;
  if p_channel = 'instagram' and p_instagram_user_id is null then raise exception 'Instagram sem id do usuário.'; end if;

  -- Serializa mensagens simultâneas da mesma pessoa (evita contato duplicado)
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || coalesce(v_key, p_instagram_user_id), 0));

  -- 1. Contato
  if p_channel = 'instagram' then
    select * into v_contact from public.crm_contacts where store_id = p_store_id and instagram_user_id = p_instagram_user_id;
  else
    select * into v_contact from public.crm_contacts where store_id = p_store_id and phone_key = v_key;
  end if;

  -- 1b. Chegou no WhatsApp com o código do link do Instagram
  if p_channel = 'whatsapp' and p_direction = 'in' and p_body is not null then
    v_code := substring(upper(p_body) from 'IG-([A-Z0-9]{4,8})');
    if v_code is not null then
      select * into v_coded from public.crm_contacts where store_id = p_store_id and handoff_code = 'IG-' || v_code;
      if v_coded.id is not null then
        if v_contact.id is not null and v_contact.id <> v_coded.id then
          perform public.crm_merge_contacts(v_coded.id, v_contact.id);
        end if;
        select * into v_contact from public.crm_contacts where id = v_coded.id;
        v_handoff := true;
      end if;
    end if;
  end if;

  if v_contact.id is null then
    if not v_create then
      return jsonb_build_object('skipped', true, 'reason', 'unknown_contact');
    end if;
    if v_key is not null then
      select c.id into v_customer from public.customers c
       where public.crm_phone_key(c.phone) = v_key
       order by (c.store_id = p_store_id) desc, c.created_at
       limit 1;
    end if;
    insert into public.crm_contacts (store_id, name, phone, phone_key, instagram_user_id, instagram_username, avatar_url, customer_id, origin_channel)
    values (
      p_store_id,
      coalesce(case when p_direction = 'in' then v_name end,
               case when p_instagram_username is not null then '@' || p_instagram_username end,
               case when v_norm is not null then '+55 ' || v_norm end,
               'Contato'),
      case when v_norm is not null then '55' || v_norm end,
      v_key, p_instagram_user_id, p_instagram_username, p_avatar_url, v_customer, p_channel
    )
    returning * into v_contact;
    v_created := true;
  else
    update public.crm_contacts c set
      phone = coalesce(c.phone, case when v_norm is not null then '55' || v_norm end),
      phone_key = case
        when c.phone_key is null and v_key is not null
         and not exists (select 1 from public.crm_contacts o where o.store_id = c.store_id and o.phone_key = v_key and o.id <> c.id)
        then v_key else c.phone_key end,
      instagram_user_id  = coalesce(c.instagram_user_id, p_instagram_user_id),
      instagram_username = coalesce(p_instagram_username, c.instagram_username),
      avatar_url         = coalesce(p_avatar_url, c.avatar_url),
      name = case
        when p_direction = 'in' and v_name is not null
         and (c.name in ('Contato', 'Lead WhatsApp', 'Lead Instagram') or c.name like '+55 %' or c.name like '@%')
        then v_name else c.name end
    where c.id = v_contact.id
    returning * into v_contact;
  end if;

  -- 2. Conversa do canal
  select * into v_conv from public.crm_conversations where contact_id = v_contact.id and channel = p_channel;
  if v_conv.id is null then
    insert into public.crm_conversations (store_id, contact_id, channel, external_thread_id, status)
    values (p_store_id, v_contact.id, p_channel, p_external_thread_id, 'open')
    returning * into v_conv;
  end if;

  -- 3. Mensagem (idempotente pelo id externo)
  insert into public.crm_messages (store_id, conversation_id, contact_id, direction, sender_kind, sender_user_id,
                                   kind, body, media_path, media_url, media_mime, external_id, status, created_at)
  values (p_store_id, v_conv.id, v_contact.id, p_direction, p_sender_kind, p_sender_user_id,
          coalesce(p_kind, 'text'), p_body, p_media_path, p_media_url, p_media_mime, p_external_id,
          coalesce(p_status, case when p_direction = 'in' then 'received' else 'sent' end), v_at)
  on conflict (conversation_id, external_id) where external_id is not null do nothing
  returning id into v_msg_id;

  if v_msg_id is null then
    return jsonb_build_object('duplicate', true, 'contact_id', v_contact.id, 'conversation_id', v_conv.id);
  end if;

  -- 4. Estado da conversa
  v_preview := left(coalesce(nullif(btrim(p_body), ''), '[' || coalesce(p_kind, 'text') || ']'), 160);
  update public.crm_conversations cv set
    last_message_preview   = case when cv.last_message_at is null or v_at >= cv.last_message_at then v_preview else cv.last_message_preview end,
    last_message_direction = case when cv.last_message_at is null or v_at >= cv.last_message_at then p_direction else cv.last_message_direction end,
    last_message_at        = greatest(coalesce(cv.last_message_at, v_at), v_at),
    last_inbound_at        = case when p_direction = 'in' then greatest(coalesce(cv.last_inbound_at, v_at), v_at) else cv.last_inbound_at end,
    unread_count           = case
                               when p_direction = 'in' and not v_contact.ignored then cv.unread_count + 1
                               when p_direction = 'out' and p_sender_kind in ('user', 'ai') then 0
                               else cv.unread_count end,
    first_response_at      = case when cv.first_response_at is null and p_direction = 'out' and p_sender_kind in ('user', 'ai') then v_at else cv.first_response_at end,
    status                 = case when p_direction = 'in' and cv.status = 'resolved' and not v_contact.ignored then 'open' else cv.status end,
    handler                = case when p_direction = 'out' and p_sender_kind = 'user' then 'human' else cv.handler end,
    external_thread_id     = coalesce(cv.external_thread_id, p_external_thread_id)
  where cv.id = v_conv.id;

  -- 5. Jornada: pessoa chegou do Instagram no WhatsApp → move o negócio
  if v_handoff then
    update public.crm_deals d set
      stage_id = s_to.id,
      handoff_completed_at = coalesce(d.handoff_completed_at, now())
    from public.crm_stages s_from, public.crm_stages s_to
    where d.contact_id = v_contact.id
      and d.status = 'open'
      and s_from.id = d.stage_id and s_from.code in ('ig_new', 'wa_invited')
      and s_to.pipeline_id = d.pipeline_id and s_to.code = 'wa_active';
    get diagnostics v_moved = row_count;

    insert into public.crm_activities (store_id, contact_id, conversation_id, actor_kind, type, payload)
    values (p_store_id, v_contact.id, v_conv.id, 'system', 'handoff_completed',
            jsonb_build_object('code', 'IG-' || v_code, 'deals_moved', v_moved));
  end if;

  if v_created then
    insert into public.crm_activities (store_id, contact_id, conversation_id, actor_kind, type, payload)
    values (p_store_id, v_contact.id, v_conv.id, 'system', 'contact_created',
            jsonb_build_object('channel', p_channel, 'customer_id', v_customer));
  end if;

  return jsonb_build_object(
    'contact_id', v_contact.id,
    'conversation_id', v_conv.id,
    'message_id', v_msg_id,
    'contact_created', v_created,
    'handoff', v_handoff,
    'deals_moved', v_moved,
    'ignored', v_contact.ignored
  );
end;
$$;

-- Status de entrega/leitura vindo do provedor (só avança: sent → delivered → read)
create or replace function public.crm_update_message_status(p_store_id uuid, p_external_id text, p_status text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.crm_messages m set status = p_status
  where m.store_id = p_store_id and m.external_id = p_external_id and m.direction = 'out'
    and array_position(array['pending','sent','delivered','read'], p_status)
      > coalesce(array_position(array['pending','sent','delivered','read'], m.status), 0);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Funções de servidor: só service_role executa
revoke all on function public.crm_ingest_message(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.crm_update_message_status(uuid, text, text) from public, anon, authenticated;
revoke all on function public.crm_seed_store(uuid) from public, anon, authenticated;
revoke all on function public.crm_stores_after_insert() from public, anon, authenticated;
grant execute on function public.crm_ingest_message(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, uuid, text, boolean) to service_role;
grant execute on function public.crm_update_message_status(uuid, text, text) to service_role;
grant execute on function public.crm_seed_store(uuid) to service_role;

-- Funções que o app chama (checam a loja por dentro)
revoke all on function public.crm_merge_contacts(uuid, uuid) from public, anon;
revoke all on function public.crm_ensure_handoff_code(uuid) from public, anon;
grant execute on function public.crm_merge_contacts(uuid, uuid) to authenticated, service_role;
grant execute on function public.crm_ensure_handoff_code(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['crm_contacts','crm_conversations','crm_messages','crm_pipelines','crm_stages','crm_deals',
                           'crm_activities','crm_tasks','crm_quick_replies','crm_tags','crm_ai_settings','crm_ai_runs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;

-- Dados do dia a dia: qualquer membro da loja
do $$
declare t text;
begin
  foreach t in array array['crm_contacts','crm_conversations','crm_deals','crm_tasks','crm_quick_replies','crm_tags']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_member_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.crm_is_member(store_id))', t || '_member_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.crm_is_member(store_id))', t || '_member_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.crm_is_member(store_id)) with check (public.crm_is_member(store_id))', t || '_member_update', t);
  end loop;
end $$;

-- Apagar: contatos/conversas só gerência; negócios, tarefas, respostas e etiquetas qualquer membro
create policy crm_contacts_member_delete      on public.crm_contacts      for delete to authenticated using (public.crm_is_member(store_id) and public.crm_is_manager());
create policy crm_conversations_member_delete on public.crm_conversations for delete to authenticated using (public.crm_is_member(store_id) and public.crm_is_manager());
create policy crm_deals_member_delete         on public.crm_deals         for delete to authenticated using (public.crm_is_member(store_id));
create policy crm_tasks_member_delete         on public.crm_tasks         for delete to authenticated using (public.crm_is_member(store_id));
create policy crm_quick_replies_member_delete on public.crm_quick_replies for delete to authenticated using (public.crm_is_member(store_id));
create policy crm_tags_member_delete          on public.crm_tags          for delete to authenticated using (public.crm_is_member(store_id));

-- Mensagens: leitura pelos membros; pelo app só se grava nota interna (envios passam pelo servidor)
drop policy if exists crm_messages_member_select on public.crm_messages;
drop policy if exists crm_messages_note_insert on public.crm_messages;
create policy crm_messages_member_select on public.crm_messages for select to authenticated using (public.crm_is_member(store_id));
create policy crm_messages_note_insert on public.crm_messages for insert to authenticated
  with check (public.crm_is_member(store_id) and kind = 'note' and direction = 'out'
              and sender_kind = 'user' and sender_user_id = (select auth.uid()));

-- Histórico: leitura pelos membros; o app grava só como ele mesmo
drop policy if exists crm_activities_member_select on public.crm_activities;
drop policy if exists crm_activities_user_insert on public.crm_activities;
create policy crm_activities_member_select on public.crm_activities for select to authenticated using (public.crm_is_member(store_id));
create policy crm_activities_user_insert on public.crm_activities for insert to authenticated
  with check (public.crm_is_member(store_id) and actor_kind = 'user' and actor_id = (select auth.uid()));

-- Configuração (funis, etapas, IA): leitura pelos membros, escrita só gerência
do $$
declare t text;
begin
  foreach t in array array['crm_pipelines','crm_stages','crm_ai_settings']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_member_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_manager_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.crm_is_member(store_id))', t || '_member_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.crm_is_member(store_id) and public.crm_is_manager()) with check (public.crm_is_member(store_id) and public.crm_is_manager())', t || '_manager_write', t);
  end loop;
end $$;

-- Decisões da IA: só leitura
drop policy if exists crm_ai_runs_member_select on public.crm_ai_runs;
create policy crm_ai_runs_member_select on public.crm_ai_runs for select to authenticated using (public.crm_is_member(store_id));

-- ---------------------------------------------------------------------
-- 9. Tempo real
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['crm_conversations','crm_messages','crm_deals','crm_tasks']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
