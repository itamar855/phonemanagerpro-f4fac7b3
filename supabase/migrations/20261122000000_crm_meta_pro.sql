-- =====================================================================
-- CRM — rastreamento Meta completo (pixel hoje, API oficial do WhatsApp amanhã)
-- * crm_tracking_settings: conta oficial do WhatsApp (WABA), página, conjunto de dados
--   ligado à WABA e conta de anúncios (gasto automático)
-- * crm_meta_events: guarda de qual origem (clique no anúncio) é o evento e em que
--   formato foi (pixel = "chat"; messaging = API de Conversões para Mensagens)
-- * crm_meta_enqueue: hora real do evento + Lead de novo anúncio para quem já é contato
-- * crm_meta_backfill: ao ligar, manda os últimos dias (a Meta só aceita até 7 dias)
-- * crm_ad_insights: gasto, impressões, cliques e conversas por anúncio e dia (da Meta)
-- * crm_ads_report: anúncio a anúncio — gasto da Meta × leads, vendas e receita do CRM
-- * crm_tracking_health: o rastreamento está funcionando?
-- =====================================================================

alter table public.crm_tracking_settings add column if not exists waba_id text;
alter table public.crm_tracking_settings add column if not exists page_id text;
alter table public.crm_tracking_settings add column if not exists messaging_dataset_id text;
alter table public.crm_tracking_settings add column if not exists ad_account_id text;
alter table public.crm_tracking_settings add column if not exists insights_synced_at timestamptz;
alter table public.crm_tracking_settings add column if not exists insights_error text;

alter table public.crm_meta_events add column if not exists attribution_id uuid;
alter table public.crm_meta_events add column if not exists format text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_meta_events_attribution_id_fkey') then
    alter table public.crm_meta_events add constraint crm_meta_events_attribution_id_fkey
      foreign key (attribution_id) references public.crm_attributions(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_meta_events_format_check') then
    alter table public.crm_meta_events add constraint crm_meta_events_format_check check (format is null or format in ('pixel', 'messaging'));
  end if;
end $$;
create index if not exists crm_meta_events_attribution on public.crm_meta_events (attribution_id) where attribution_id is not null;
create index if not exists crm_attributions_clid on public.crm_attributions (contact_id, created_at desc) where ctwa_clid is not null;

-- ---------------------------------------------------------------------
-- Fila de eventos (idempotente pelo event_id)
-- p_event_time: quando aconteceu (padrão: agora)
-- p_attribution_id: origem específica — um contato antigo que clicou num anúncio novo
--   gera outro Lead, ligado a esse clique
-- ---------------------------------------------------------------------
drop function if exists public.crm_meta_enqueue(uuid, uuid, text, numeric);
create or replace function public.crm_meta_enqueue(
  p_contact_id uuid, p_deal_id uuid, p_kind text, p_value numeric default null,
  p_event_time timestamptz default null, p_attribution_id uuid default null
)
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
  v_attr   uuid;
  v_id     uuid;
begin
  select * into c from public.crm_contacts where id = p_contact_id;
  if c.id is null or c.ignored or c.phone is null then return null; end if;
  select * into s from public.crm_tracking_settings where store_id = c.store_id;
  if s.store_id is null or not s.enabled or coalesce(s.dataset_id, s.messaging_dataset_id) is null then return null; end if;
  if s.only_attributed and c.attribution_id is null then return null; end if;

  if p_kind = 'lead' and s.send_lead then
    -- Lead de anúncio repetido: no máximo um por contato a cada 24 h (o WhatsApp pode repetir os dados do anúncio)
    if p_attribution_id is not null and exists (
      select 1 from public.crm_meta_events e where e.contact_id = c.id and e.event_name = 'Lead' and e.created_at > now() - interval '24 hours'
    ) then
      return null;
    end if;
    v_name := 'Lead'; v_eid := 'lead:' || c.id || coalesce(':' || p_attribution_id, '');
  elsif p_kind = 'qualified' and s.send_qualified then
    v_name := s.qualified_event_name; v_eid := 'qualified:' || coalesce(p_deal_id::text, c.id::text);
  elsif p_kind = 'purchase' and s.send_purchase then
    v_name := 'Purchase'; v_eid := 'purchase:' || p_deal_id;
  else
    return null;
  end if;

  -- origem do evento: a informada, senão o último clique em anúncio (ctwa_clid), senão a 1ª origem
  v_attr := coalesce(
    p_attribution_id,
    (select a.id from public.crm_attributions a where a.contact_id = c.id and a.ctwa_clid is not null
       and a.created_at <= coalesce(p_event_time, now()) order by a.created_at desc limit 1),
    c.attribution_id);

  insert into public.crm_meta_events (store_id, contact_id, deal_id, event_name, event_id, value, event_time, attribution_id)
  values (c.store_id, c.id, p_deal_id, v_name, v_eid, p_value, coalesce(p_event_time, now()), v_attr)
  on conflict (store_id, event_id) do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.crm_meta_enqueue(uuid, uuid, text, numeric, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.crm_meta_enqueue(uuid, uuid, text, numeric, timestamptz, uuid) to service_role;

-- ---------------------------------------------------------------------
-- Ao ligar o rastreamento: manda os leads e as vendas dos últimos dias
-- (a API de Conversões recusa evento com mais de 7 dias)
-- ---------------------------------------------------------------------
create or replace function public.crm_meta_backfill(p_store_id uuid, p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since  timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 7)) + interval '1 hour';
  v_leads  integer := 0;
  v_sales  integer := 0;
  r        record;
begin
  for r in
    select c.id, c.created_at from public.crm_contacts c
    where c.store_id = p_store_id and c.created_at >= v_since and not c.ignored and c.phone is not null
  loop
    if public.crm_meta_enqueue(r.id, null, 'lead', null, r.created_at) is not null then v_leads := v_leads + 1; end if;
  end loop;
  for r in
    select d.id, d.contact_id, d.value, d.won_at from public.crm_deals d
    where d.store_id = p_store_id and d.status = 'won' and d.won_at >= v_since and d.contact_id is not null
  loop
    if public.crm_meta_enqueue(r.contact_id, r.id, 'purchase', r.value, r.won_at) is not null then v_sales := v_sales + 1; end if;
  end loop;
  return jsonb_build_object('leads', v_leads, 'purchases', v_sales);
end;
$$;
revoke all on function public.crm_meta_backfill(uuid, integer) from public, anon, authenticated;
grant execute on function public.crm_meta_backfill(uuid, integer) to service_role;

-- ---------------------------------------------------------------------
-- Gasto por anúncio e dia, lido da Meta (Insights da conta de anúncios)
-- ---------------------------------------------------------------------
create table if not exists public.crm_ad_insights (
  store_id       uuid not null references public.stores(id) on delete cascade,
  date           date not null,
  ad_id          text not null,
  ad_name        text,
  adset_id       text,
  adset_name     text,
  campaign_id    text,
  campaign_name  text,
  spend          numeric(12, 2) not null default 0,
  impressions    integer not null default 0,
  clicks         integer not null default 0,
  conversations  integer not null default 0,   -- conversas por mensagem iniciadas (contagem da Meta)
  updated_at     timestamptz not null default now(),
  primary key (store_id, date, ad_id)
);
create index if not exists crm_ad_insights_ad on public.crm_ad_insights (store_id, ad_id);

alter table public.crm_ad_insights enable row level security;
revoke all on table public.crm_ad_insights from anon;
drop policy if exists crm_ad_insights_member_select on public.crm_ad_insights;
create policy crm_ad_insights_member_select on public.crm_ad_insights for select to authenticated using (public.crm_is_member(store_id));

-- ---------------------------------------------------------------------
-- Relatório anúncio a anúncio: o que a Meta cobrou × o que virou no CRM
-- Datas no fuso de São Paulo. p_kind: null = tudo, 'repair' = conserto, 'sales' = aparelho/acessório
-- ---------------------------------------------------------------------
create or replace function public.crm_ads_report(p_store_id uuid, p_from date, p_to date, p_kind text default null)
returns table (
  campaign_id text, campaign_name text, adset_id text, adset_name text, ad_id text, ad_name text,
  spend numeric, impressions integer, clicks integer, conversations integer,
  leads integer, replied integer, qualified integer, won integer, revenue numeric
)
language sql stable security invoker
set search_path = public
as $$
  with dk as (
    select d.*, case when p.kind = 'service' or d.interest = 'repair' then 'repair' else 'sales' end as k
    from public.crm_deals d join public.crm_pipelines p on p.id = d.pipeline_id
  ),
  att as (
    select c.id as contact_id, c.store_id,
           coalesce(nullif(a.ad_id, ''), nullif(a.ad_source_id, '')) as ad_id,
           a.campaign_id, a.adset_id, coalesce(nullif(a.utm_campaign, ''), a.ad_title) as campaign_name,
           nullif(a.utm_term, '') as adset_name, coalesce(nullif(a.utm_content, ''), a.ad_title) as ad_name
    from public.crm_contacts c
    join public.crm_attributions a on a.id = c.attribution_id
    where (p_store_id is null or c.store_id = p_store_id)
      and (c.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
      and coalesce(nullif(a.ad_id, ''), nullif(a.ad_source_id, '')) is not null
      and (p_kind is null or exists (select 1 from dk where dk.contact_id = c.id and dk.k = p_kind))
  ),
  crm as (
    select att.store_id, att.ad_id,
           max(att.campaign_id) as campaign_id, max(att.adset_id) as adset_id,
           max(att.campaign_name) as campaign_name, max(att.adset_name) as adset_name, max(att.ad_name) as ad_name,
           count(distinct att.contact_id)::int as leads,
           count(distinct att.contact_id) filter (where exists (
             select 1 from public.crm_messages m where m.contact_id = att.contact_id and m.direction = 'in' and m.kind <> 'note'))::int as replied,
           count(distinct d.contact_id) filter (where d.ai_summary is not null or s.code in ('proposal', 'svc_quote', 'svc_approved') or d.status = 'won')::int as qualified,
           count(distinct d.id) filter (where d.status = 'won')::int as won,
           coalesce(sum(d.value) filter (where d.status = 'won'), 0) as revenue
    from att
    left join dk d on d.contact_id = att.contact_id and (p_kind is null or d.k = p_kind)
    left join public.crm_stages s on s.id = d.stage_id
    group by att.store_id, att.ad_id
  ),
  ins as (
    select i.store_id, i.ad_id,
           (array_agg(i.campaign_id order by i.date desc))[1] as campaign_id,
           (array_agg(i.campaign_name order by i.date desc))[1] as campaign_name,
           (array_agg(i.adset_id order by i.date desc))[1] as adset_id,
           (array_agg(i.adset_name order by i.date desc))[1] as adset_name,
           (array_agg(i.ad_name order by i.date desc))[1] as ad_name,
           sum(i.spend) as spend, sum(i.impressions)::int as impressions, sum(i.clicks)::int as clicks,
           sum(i.conversations)::int as conversations
    from public.crm_ad_insights i
    where (p_store_id is null or i.store_id = p_store_id) and i.date between p_from and p_to
    group by i.store_id, i.ad_id
  )
  select coalesce(i.campaign_id, c.campaign_id), coalesce(i.campaign_name, c.campaign_name, 'Campanha sem nome'),
         coalesce(i.adset_id, c.adset_id), coalesce(i.adset_name, c.adset_name, '—'),
         coalesce(i.ad_id, c.ad_id), coalesce(i.ad_name, c.ad_name, 'Anúncio ' || coalesce(i.ad_id, c.ad_id)),
         i.spend, i.impressions, i.clicks, i.conversations,
         coalesce(c.leads, 0), coalesce(c.replied, 0), coalesce(c.qualified, 0), coalesce(c.won, 0), coalesce(c.revenue, 0)
  from ins i
  full join crm c on c.store_id = i.store_id and c.ad_id = i.ad_id
  order by coalesce(c.revenue, 0) desc, coalesce(i.spend, 0) desc;
$$;
revoke all on function public.crm_ads_report(uuid, date, date, text) from public, anon;
grant execute on function public.crm_ads_report(uuid, date, date, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Saúde do rastreamento (últimos 7 dias)
-- ---------------------------------------------------------------------
create or replace function public.crm_tracking_health(p_store_id uuid)
returns jsonb
language sql stable security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'sent_7d',        (select count(*) from public.crm_meta_events e where e.store_id = p_store_id and e.status = 'sent' and e.sent_at > now() - interval '7 days'),
    'messaging_7d',   (select count(*) from public.crm_meta_events e where e.store_id = p_store_id and e.status = 'sent' and e.format = 'messaging' and e.sent_at > now() - interval '7 days'),
    'failed_7d',      (select count(*) from public.crm_meta_events e where e.store_id = p_store_id and e.status = 'failed' and e.created_at > now() - interval '7 days'),
    'pending',        (select count(*) from public.crm_meta_events e where e.store_id = p_store_id and e.status = 'pending'),
    'last_sent_at',   (select max(e.sent_at) from public.crm_meta_events e where e.store_id = p_store_id and e.status = 'sent'),
    'last_error',     (select e.error from public.crm_meta_events e where e.store_id = p_store_id and e.error is not null order by e.created_at desc limit 1),
    'ad_contacts_7d', (select count(*) from public.crm_attributions a where a.store_id = p_store_id and a.kind = 'ctwa' and a.created_at > now() - interval '7 days'),
    'ad_no_clid_7d',  (select count(*) from public.crm_attributions a where a.store_id = p_store_id and a.kind = 'ctwa' and a.ctwa_clid is null and a.created_at > now() - interval '7 days'),
    'insights_synced_at', (select s.insights_synced_at from public.crm_tracking_settings s where s.store_id = p_store_id),
    'insights_error', (select s.insights_error from public.crm_tracking_settings s where s.store_id = p_store_id),
    'spend_7d',       (select coalesce(sum(i.spend), 0) from public.crm_ad_insights i where i.store_id = p_store_id and i.date > current_date - 7)
  );
$$;
revoke all on function public.crm_tracking_health(uuid) from public, anon;
grant execute on function public.crm_tracking_health(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Gasto da Meta a cada 2 horas (só lojas com conta de anúncios configurada)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('crm-meta-insights', '17 */2 * * *', $job$
      select net.http_post(
        url := 'https://hzrqtolfbwnmmeliazmh.supabase.co/functions/v1/crm-meta',
        headers := jsonb_build_object('Content-Type', 'application/json',
                   'x-crm-internal', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')),
        body := '{"action":"sync_insights"}'::jsonb)
      where exists (select 1 from public.crm_tracking_settings where ad_account_id is not null)
        and exists (select 1 from vault.decrypted_secrets where name = 'crm_cron_secret');
    $job$);
  end if;
end $$;
