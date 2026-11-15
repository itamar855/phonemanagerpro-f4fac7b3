-- =====================================================================
-- CRM — rastreamento de campanhas e API de Conversões da Meta
-- * crm_track_links / crm_track_clicks: link de rastreio → WhatsApp com código
-- * crm_attributions: de onde veio cada contato (link, anúncio do WhatsApp, orgânico)
-- * crm_tracking_settings: dataset (pixel) da Meta e eventos ligados
-- * crm_meta_events: fila de eventos (Lead, Lead qualificado, Compra), sem duplicar
-- O token da Meta fica em crm_channel_secrets (só o servidor lê).
-- =====================================================================

create table if not exists public.crm_tracking_settings (
  store_id               uuid primary key references public.stores(id) on delete cascade,
  enabled                boolean not null default false,
  dataset_id             text,
  test_event_code        text,
  whatsapp_number        text,              -- número que os links abrem (55 + DDD + número)
  send_lead              boolean not null default true,
  send_qualified         boolean not null default true,
  send_purchase          boolean not null default true,
  qualified_event_name   text not null default 'QualifiedLead',
  qualified_stage_codes  text[] not null default '{proposal,svc_quote}',
  only_attributed        boolean not null default false,  -- true: só contatos que vieram de anúncio/link
  updated_by             uuid references auth.users(id) on delete set null,
  updated_at             timestamptz not null default now()
);

create table if not exists public.crm_track_links (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name        text not null,
  message     text not null default 'Olá! Quero mais informações.',
  active      boolean not null default true,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.crm_track_clicks (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  link_id      uuid references public.crm_track_links(id) on delete set null,
  code         text not null unique,
  fbclid       text,
  fbc          text,
  utm          jsonb not null default '{}',
  campaign_id  text,
  adset_id     text,
  ad_id        text,
  ip           text,
  user_agent   text,
  referer      text,
  contact_id   uuid references public.crm_contacts(id) on delete set null,
  matched_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists crm_track_clicks_store on public.crm_track_clicks (store_id, created_at desc);

create table if not exists public.crm_attributions (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id) on delete cascade,
  contact_id      uuid not null references public.crm_contacts(id) on delete cascade,
  kind            text not null check (kind in ('link', 'ctwa', 'organic')),
  click_id        uuid references public.crm_track_clicks(id) on delete set null,
  entry_point     text,
  entry_app       text,
  ad_source_id    text,
  ad_source_url   text,
  ad_title        text,
  ctwa_clid       text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  campaign_id     text,
  adset_id        text,
  ad_id           text,
  fbc             text,
  ip              text,
  user_agent      text,
  created_at      timestamptz not null default now()
);
create index if not exists crm_attributions_contact on public.crm_attributions (contact_id, created_at);
create index if not exists crm_attributions_store on public.crm_attributions (store_id, created_at desc);

alter table public.crm_contacts add column if not exists attribution_id uuid references public.crm_attributions(id) on delete set null;

create table if not exists public.crm_meta_events (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  contact_id       uuid references public.crm_contacts(id) on delete cascade,
  deal_id          uuid references public.crm_deals(id) on delete set null,
  event_name       text not null,
  event_id         text not null,
  event_time       timestamptz not null default now(),
  value            numeric(12, 2),
  status           text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts         integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  response         jsonb,
  error            text,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  unique (store_id, event_id)
);
create index if not exists crm_meta_events_pending on public.crm_meta_events (next_attempt_at) where status = 'pending';
create index if not exists crm_meta_events_store on public.crm_meta_events (store_id, created_at desc);

-- RLS
do $$
declare t text;
begin
  foreach t in array array['crm_tracking_settings','crm_track_links','crm_track_clicks','crm_attributions','crm_meta_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.crm_is_member(store_id))', t || '_member_select', t);
  end loop;
end $$;

drop policy if exists crm_tracking_settings_manager_write on public.crm_tracking_settings;
create policy crm_tracking_settings_manager_write on public.crm_tracking_settings for all to authenticated
  using (public.crm_is_member(store_id) and public.crm_is_manager())
  with check (public.crm_is_member(store_id) and public.crm_is_manager());
drop policy if exists crm_track_links_manager_write on public.crm_track_links;
create policy crm_track_links_manager_write on public.crm_track_links for all to authenticated
  using (public.crm_is_member(store_id) and public.crm_is_manager())
  with check (public.crm_is_member(store_id) and public.crm_is_manager());

insert into public.crm_tracking_settings (store_id) select id from public.stores on conflict do nothing;

-- ---------------------------------------------------------------------
-- Fila de eventos (idempotente pelo event_id)
-- ---------------------------------------------------------------------
create or replace function public.crm_meta_enqueue(p_contact_id uuid, p_deal_id uuid, p_kind text, p_value numeric default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.crm_tracking_settings%rowtype;
  c        public.crm_contacts%rowtype;
  v_name   text;
  v_eid    text;
  v_id     uuid;
begin
  select * into c from public.crm_contacts where id = p_contact_id;
  if c.id is null or c.ignored or c.phone is null then return null; end if;
  select * into s from public.crm_tracking_settings where store_id = c.store_id;
  if s.store_id is null or not s.enabled or s.dataset_id is null then return null; end if;
  if s.only_attributed and c.attribution_id is null then return null; end if;

  if p_kind = 'lead' and s.send_lead then
    v_name := 'Lead'; v_eid := 'lead:' || c.id;
  elsif p_kind = 'qualified' and s.send_qualified then
    v_name := s.qualified_event_name; v_eid := 'qualified:' || coalesce(p_deal_id::text, c.id::text);
  elsif p_kind = 'purchase' and s.send_purchase then
    v_name := 'Purchase'; v_eid := 'purchase:' || p_deal_id;
  else
    return null;
  end if;

  insert into public.crm_meta_events (store_id, contact_id, deal_id, event_name, event_id, value)
  values (c.store_id, c.id, p_deal_id, v_name, v_eid, p_value)
  on conflict (store_id, event_id) do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.crm_meta_enqueue(uuid, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.crm_meta_enqueue(uuid, uuid, text, numeric) to service_role;

-- Negócio ganho → Compra; chegou na etapa de qualificado → Lead qualificado
create or replace function public.crm_deals_meta_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_code text;
begin
  if new.stage_id is distinct from old.stage_id then
    if new.status = 'won' then
      perform public.crm_meta_enqueue(new.contact_id, new.id, 'purchase', new.value);
    else
      select code into v_code from public.crm_stages where id = new.stage_id;
      if exists (select 1 from public.crm_tracking_settings s where s.store_id = new.store_id and v_code = any (s.qualified_stage_codes)) then
        perform public.crm_meta_enqueue(new.contact_id, new.id, 'qualified', new.value);
      end if;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.crm_deals_meta_events() from public, anon, authenticated;
drop trigger if exists crm_deals_meta_events on public.crm_deals;
create trigger crm_deals_meta_events after update of stage_id on public.crm_deals
  for each row execute function public.crm_deals_meta_events();

-- IA passou para o atendente → Lead qualificado
create or replace function public.crm_activities_meta_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'ai_handoff' and new.contact_id is not null then
    perform public.crm_meta_enqueue(new.contact_id, new.deal_id, 'qualified', null);
  end if;
  return null;
end;
$$;
revoke all on function public.crm_activities_meta_events() from public, anon, authenticated;
drop trigger if exists crm_activities_meta_events on public.crm_activities;
create trigger crm_activities_meta_events after insert on public.crm_activities
  for each row execute function public.crm_activities_meta_events();

-- ---------------------------------------------------------------------
-- Ligar a mensagem ao clique/anúncio (chamado pelo webhook)
-- p_native: dados que o WhatsApp manda junto (entryPoint, anúncio...)
-- ---------------------------------------------------------------------
create or replace function public.crm_track_attach(p_contact_id uuid, p_code text, p_native jsonb default '{}', p_is_new boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c       public.crm_contacts%rowtype;
  k       public.crm_track_clicks%rowtype;
  v_attr  uuid;
  v_kind  text;
  n       jsonb := coalesce(p_native, '{}');
begin
  select * into c from public.crm_contacts where id = p_contact_id;
  if c.id is null then return jsonb_build_object('attached', false); end if;

  if p_code is not null then
    select * into k from public.crm_track_clicks
     where code = upper(p_code) and store_id = c.store_id and created_at > now() - interval '7 days'
       and (contact_id is null or contact_id = c.id);
  end if;

  if k.id is not null then
    v_kind := 'link';
  elsif coalesce(n->>'ctwa_clid', n->>'ad_source_id', '') <> '' or n->>'entry_point' in ('ctwa_ad', 'ctwa') then
    v_kind := 'ctwa';
  elsif p_is_new and coalesce(n->>'entry_point', '') <> '' then
    v_kind := 'organic';
  else
    return jsonb_build_object('attached', false);
  end if;

  -- mesmo clique já ligado a este contato: nada a fazer
  if k.id is not null and k.contact_id = c.id then
    return jsonb_build_object('attached', false, 'already', true);
  end if;

  insert into public.crm_attributions (store_id, contact_id, kind, click_id, entry_point, entry_app, ad_source_id, ad_source_url,
    ad_title, ctwa_clid, utm_source, utm_medium, utm_campaign, utm_content, utm_term, campaign_id, adset_id, ad_id, fbc, ip, user_agent)
  values (c.store_id, c.id, v_kind, k.id, n->>'entry_point', n->>'entry_app', n->>'ad_source_id', n->>'ad_source_url',
    n->>'ad_title', n->>'ctwa_clid', k.utm->>'utm_source', k.utm->>'utm_medium', k.utm->>'utm_campaign', k.utm->>'utm_content',
    k.utm->>'utm_term', k.campaign_id, k.adset_id, coalesce(k.ad_id, n->>'ad_source_id'), k.fbc, k.ip, k.user_agent)
  returning id into v_attr;

  if k.id is not null then
    update public.crm_track_clicks set contact_id = c.id, matched_at = now() where id = k.id;
  end if;
  -- primeiro toque fica para sempre; orgânico não substitui anúncio
  update public.crm_contacts set attribution_id = v_attr
   where id = c.id and (attribution_id is null
     or (v_kind <> 'organic' and exists (select 1 from public.crm_attributions a where a.id = crm_contacts.attribution_id and a.kind = 'organic')));

  insert into public.crm_activities (store_id, contact_id, actor_kind, type, payload)
  values (c.store_id, c.id, 'system', 'attribution', jsonb_build_object('kind', v_kind, 'campaign', k.utm->>'utm_campaign', 'ad', coalesce(k.ad_id, n->>'ad_source_id')));

  return jsonb_build_object('attached', true, 'kind', v_kind, 'attribution_id', v_attr);
end;
$$;
revoke all on function public.crm_track_attach(uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.crm_track_attach(uuid, text, jsonb, boolean) to service_role;

-- ---------------------------------------------------------------------
-- Resultado por campanha (security invoker: RLS da loja)
-- ---------------------------------------------------------------------
create or replace function public.crm_tracking_report(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns table (source text, campaign text, ad text, contacts integer, qualified integer, won integer, revenue numeric)
language sql stable security invoker
set search_path = public
as $$
  with a as (
    select c.id as contact_id,
           case at.kind when 'link' then 'Link de rastreio' when 'ctwa' then 'Anúncio WhatsApp' else 'Orgânico' end as source,
           coalesce(nullif(at.utm_campaign, ''), case when at.kind = 'ctwa' then coalesce(at.ad_title, 'Anúncio') end, '—') as campaign,
           coalesce(nullif(at.utm_content, ''), at.ad_id, at.ad_source_id, case when at.kind = 'organic' then at.entry_point end, '—') as ad
    from public.crm_contacts c
    join public.crm_attributions at on at.id = c.attribution_id
    where (p_store_id is null or c.store_id = p_store_id)
      and c.created_at >= p_from and c.created_at < p_to
  )
  select a.source, a.campaign, a.ad,
         count(distinct a.contact_id)::int,
         count(distinct d.contact_id) filter (where d.ai_summary is not null or s.code in ('proposal', 'svc_quote') or d.status = 'won')::int,
         count(distinct d.id) filter (where d.status = 'won')::int,
         coalesce(sum(d.value) filter (where d.status = 'won'), 0)
  from a
  left join public.crm_deals d on d.contact_id = a.contact_id
  left join public.crm_stages s on s.id = d.stage_id
  group by 1, 2, 3
  order by 7 desc, 4 desc;
$$;
revoke all on function public.crm_tracking_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.crm_tracking_report(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Envio automático da fila (a cada minuto, só quando há pendentes)
-- Precisa de pg_net e do segredo 'crm_cron_secret' no Vault (criados à parte).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    perform cron.schedule('crm-meta-flush', '* * * * *', $job$
      select net.http_post(
        url := 'https://hzrqtolfbwnmmeliazmh.supabase.co/functions/v1/crm-meta',
        headers := jsonb_build_object('Content-Type', 'application/json',
                   'x-crm-internal', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')),
        body := '{"action":"flush"}'::jsonb)
      where exists (select 1 from public.crm_meta_events where status = 'pending' and next_attempt_at <= now())
        and exists (select 1 from vault.decrypted_secrets where name = 'crm_cron_secret');
    $job$);
  end if;
end $$;
