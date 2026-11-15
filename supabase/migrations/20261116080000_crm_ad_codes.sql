-- =====================================================================
-- CRM — códigos de anúncio, investimento por campanha e relatório em 3 níveis
-- * crm_ad_codes: código curto (#T21 / Ref. T21) → campanha › conjunto › anúncio
-- * crm_campaign_spend: quanto foi investido por campanha num período (digitado)
-- * crm_track_attach: também reconhece código de anúncio na mensagem do WhatsApp
-- * crm_create_instagram_lead: aceita conjunto, anúncio e código
-- * crm_tracking_report: campanha › conjunto › anúncio + quem respondeu
-- =====================================================================

create table if not exists public.crm_ad_codes (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  code           text not null check (code ~ '^[A-Z][A-Z0-9]{1,5}$'),
  level          text not null default 'ad' check (level in ('ad', 'adset', 'campaign')),
  campaign_name  text not null,
  adset_name     text,
  ad_name        text,
  campaign_id    text,
  adset_id       text,
  ad_id          text,
  active         boolean not null default true,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (store_id, code)
);

create table if not exists public.crm_campaign_spend (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  campaign      text not null,
  period_start  date not null,
  period_end    date not null check (period_end >= period_start),
  amount        numeric(12, 2) not null check (amount >= 0),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists crm_campaign_spend_store on public.crm_campaign_spend (store_id, period_start);

do $$
declare t text;
begin
  foreach t in array array['crm_ad_codes', 'crm_campaign_spend']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_manager_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.crm_is_member(store_id))', t || '_member_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.crm_is_member(store_id) and public.crm_is_manager()) with check (public.crm_is_member(store_id) and public.crm_is_manager())', t || '_manager_write', t);
  end loop;
end $$;

-- origem por código de anúncio
alter table public.crm_attributions add column if not exists ad_code text;
alter table public.crm_attributions drop constraint if exists crm_attributions_kind_check;
alter table public.crm_attributions add constraint crm_attributions_kind_check check (kind in ('link', 'ctwa', 'organic', 'manual', 'code'));

-- ---------------------------------------------------------------------
-- Ligar a mensagem ao clique / anúncio / código (chamado pelo webhook)
-- p_code: código do link de rastreio (cód. K7Q2M) ou do anúncio (#T21)
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
  ac      public.crm_ad_codes%rowtype;
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
    if k.id is null then
      select * into ac from public.crm_ad_codes where store_id = c.store_id and code = upper(p_code) and active;
    end if;
  end if;

  if k.id is not null then
    v_kind := 'link';
  elsif ac.id is not null then
    v_kind := 'code';
  elsif coalesce(n->>'ctwa_clid', n->>'ad_source_id', '') <> '' or n->>'entry_point' in ('ctwa_ad', 'ctwa') then
    v_kind := 'ctwa';
  elsif p_is_new and coalesce(n->>'entry_point', '') <> '' then
    v_kind := 'organic';
  else
    return jsonb_build_object('attached', false);
  end if;

  if k.id is not null and k.contact_id = c.id then
    return jsonb_build_object('attached', false, 'already', true);
  end if;
  -- mesmo código de anúncio já registrado neste contato: não repete
  if ac.id is not null and exists (select 1 from public.crm_attributions a where a.contact_id = c.id and a.ad_code = ac.code) then
    return jsonb_build_object('attached', false, 'already', true);
  end if;

  insert into public.crm_attributions (store_id, contact_id, kind, click_id, entry_point, entry_app, ad_source_id, ad_source_url,
    ad_title, ctwa_clid, utm_source, utm_medium, utm_campaign, utm_content, utm_term, campaign_id, adset_id, ad_id, fbc, ip, user_agent, ad_code)
  values (c.store_id, c.id, v_kind, k.id, n->>'entry_point', n->>'entry_app', n->>'ad_source_id', n->>'ad_source_url',
    n->>'ad_title', n->>'ctwa_clid',
    coalesce(k.utm->>'utm_source', case when ac.id is not null then 'meta' end),
    coalesce(k.utm->>'utm_medium', case when ac.id is not null then 'paid' end),
    coalesce(k.utm->>'utm_campaign', ac.campaign_name),
    coalesce(k.utm->>'utm_content', ac.ad_name),
    coalesce(k.utm->>'utm_term', ac.adset_name),
    coalesce(k.campaign_id, ac.campaign_id), coalesce(k.adset_id, ac.adset_id), coalesce(k.ad_id, ac.ad_id, n->>'ad_source_id'),
    k.fbc, k.ip, k.user_agent, ac.code)
  returning id into v_attr;

  if k.id is not null then
    update public.crm_track_clicks set contact_id = c.id, matched_at = now() where id = k.id;
  end if;
  update public.crm_contacts set attribution_id = v_attr
   where id = c.id and (attribution_id is null
     or (v_kind <> 'organic' and exists (select 1 from public.crm_attributions a where a.id = crm_contacts.attribution_id and a.kind = 'organic')));

  insert into public.crm_activities (store_id, contact_id, actor_kind, type, payload)
  values (c.store_id, c.id, 'system', 'attribution', jsonb_build_object('kind', v_kind, 'campaign', coalesce(k.utm->>'utm_campaign', ac.campaign_name),
          'code', ac.code, 'ad', coalesce(k.ad_id, ac.ad_name, n->>'ad_source_id')));

  return jsonb_build_object('attached', true, 'kind', v_kind, 'attribution_id', v_attr);
end;
$$;
revoke all on function public.crm_track_attach(uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.crm_track_attach(uuid, text, jsonb, boolean) to service_role;

-- ---------------------------------------------------------------------
-- Lead do Instagram: agora com conjunto, anúncio e código
-- ---------------------------------------------------------------------
drop function if exists public.crm_create_instagram_lead(uuid, text, text, text, text, text, text, text, uuid);
create or replace function public.crm_create_instagram_lead(
  p_store_id       uuid,
  p_phone          text,
  p_name           text    default null,
  p_username       text    default null,
  p_interest       text    default null,
  p_subject        text    default null,
  p_source         text    default 'organic',   -- ad | post | story | organic
  p_campaign       text    default null,
  p_owner_id       uuid    default null,
  p_adset          text    default null,
  p_ad             text    default null,
  p_ad_code        text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_norm     text := public.crm_normalize_phone(p_phone);
  v_key      text := public.crm_phone_key(p_phone);
  v_user     text := nullif(lower(regexp_replace(coalesce(p_username, ''), '[^A-Za-z0-9._]', '', 'g')), '');
  v_name     text := nullif(btrim(p_name), '');
  v_contact  public.crm_contacts%rowtype;
  ac         public.crm_ad_codes%rowtype;
  v_conv     uuid;
  v_deal     uuid;
  v_pipe     uuid;
  v_stage    uuid;
  v_attr     uuid;
  v_hours    integer;
  v_existing boolean := false;
  v_owner    uuid;
  v_kind     text := case when p_interest = 'repair' then 'service' else 'sales' end;
begin
  if v_uid is null or not public.crm_is_member(p_store_id) then raise exception 'Sem acesso a esta loja.'; end if;
  if v_key is null then raise exception 'Número de WhatsApp inválido. Use DDD + número.'; end if;
  if p_source not in ('ad', 'post', 'story', 'organic') then raise exception 'Origem inválida.'; end if;
  v_owner := coalesce(p_owner_id, v_uid);
  if p_ad_code is not null then
    select * into ac from public.crm_ad_codes where store_id = p_store_id and code = upper(btrim(p_ad_code));
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || v_key, 0));

  select * into v_contact from public.crm_contacts where store_id = p_store_id and phone_key = v_key;
  if v_contact.id is null and v_user is not null then
    -- mesma pessoa já cadastrada pelo @ (sem telefone ainda)
    select * into v_contact from public.crm_contacts where store_id = p_store_id and lower(instagram_username) = v_user and phone_key is null limit 1;
    if v_contact.id is not null then
      update public.crm_contacts set phone = '55' || v_norm, phone_key = v_key where id = v_contact.id returning * into v_contact;
      v_existing := true;
    end if;
  end if;
  if v_contact.id is null then
    insert into public.crm_contacts (store_id, name, phone, phone_key, instagram_username, origin_channel, owner_id)
    values (p_store_id, coalesce(v_name, case when v_user is not null then '@' || v_user end, '+55 ' || v_norm),
            '55' || v_norm, v_key, v_user, 'instagram', v_owner)
    returning * into v_contact;
  elsif not v_existing then
    v_existing := true;
    update public.crm_contacts c set
      instagram_username = coalesce(c.instagram_username, v_user),
      ignored = false,
      name = case when v_name is not null and (c.name in ('Contato', 'Lead WhatsApp') or c.name like '+55 %' or c.name like '@%') then v_name else c.name end
    where c.id = v_contact.id
    returning * into v_contact;
  end if;

  insert into public.crm_attributions (store_id, contact_id, kind, entry_point, entry_app, utm_source, utm_medium,
                                       utm_campaign, utm_term, utm_content, campaign_id, adset_id, ad_id, ad_code)
  values (p_store_id, v_contact.id, 'manual', 'instagram_' || p_source, 'instagram', 'instagram',
          case when p_source = 'ad' then 'paid' else 'organic' end,
          coalesce(ac.campaign_name, nullif(btrim(p_campaign), '')),
          coalesce(ac.adset_name, nullif(btrim(p_adset), '')),
          coalesce(ac.ad_name, nullif(btrim(p_ad), '')),
          ac.campaign_id, ac.adset_id, ac.ad_id, ac.code)
  returning id into v_attr;
  update public.crm_contacts c set attribution_id = v_attr
   where c.id = v_contact.id and (c.attribution_id is null
     or exists (select 1 from public.crm_attributions a where a.id = c.attribution_id and a.kind = 'organic'));

  select id into v_conv from public.crm_conversations where contact_id = v_contact.id and channel = 'whatsapp';
  if v_conv is null then
    insert into public.crm_conversations (store_id, contact_id, channel, status, assigned_to, handler)
    values (p_store_id, v_contact.id, 'whatsapp', 'open', v_owner, 'human')
    returning id into v_conv;
  end if;
  update public.crm_conversations set status = 'open', assigned_to = coalesce(assigned_to, v_owner), handler = 'human' where id = v_conv;

  select id into v_deal from public.crm_deals where contact_id = v_contact.id and status = 'open' order by created_at desc limit 1;
  if v_deal is null then
    select p.id into v_pipe from public.crm_pipelines p
     where p.store_id = p_store_id and p.kind = v_kind and not p.archived order by p.is_default desc, p.position limit 1;
    select s.id into v_stage from public.crm_stages s
     where s.pipeline_id = v_pipe and s.kind = 'open' and not s.hidden order by s.position limit 1;
    insert into public.crm_deals (store_id, pipeline_id, stage_id, contact_id, title, interest, owner_id, origin_channel, created_by)
    values (p_store_id, v_pipe, v_stage, v_contact.id, coalesce(nullif(btrim(p_subject), ''), v_contact.name),
            case when p_interest in ('device', 'repair', 'accessory', 'other') then p_interest end, v_owner, 'instagram', v_uid)
    returning id into v_deal;
  end if;

  select coalesce(ig_followup_hours, 2) into v_hours from public.crm_automation_settings where store_id = p_store_id;
  insert into public.crm_tasks (store_id, title, kind, due_at, assigned_to, contact_id, deal_id, conversation_id, source, dedupe_key)
  values (p_store_id, 'Retomar ' || v_contact.name || ' (veio do Instagram)', 'ig_followup', now() + make_interval(hours => coalesce(v_hours, 2)),
          v_owner, v_contact.id, v_deal, v_conv, 'automation', 'ig_followup:' || v_conv || ':' || floor(extract(epoch from now()))::bigint)
  on conflict (store_id, dedupe_key) where dedupe_key is not null do nothing;

  insert into public.crm_activities (store_id, contact_id, deal_id, conversation_id, actor_kind, actor_id, type, payload)
  values (p_store_id, v_contact.id, v_deal, v_conv, 'user', v_uid, 'ig_lead_created',
          jsonb_build_object('source', p_source, 'campaign', coalesce(ac.campaign_name, nullif(btrim(p_campaign), '')),
                             'code', ac.code, 'existing', v_existing));

  perform public.crm_meta_enqueue(v_contact.id, v_deal, 'lead', null);

  return jsonb_build_object(
    'contact_id', v_contact.id, 'conversation_id', v_conv, 'deal_id', v_deal, 'existing', v_existing,
    'contact_name', v_contact.name, 'store_name', (select name from public.stores where id = p_store_id)
  );
end;
$$;
revoke all on function public.crm_create_instagram_lead(uuid, text, text, text, text, text, text, text, uuid, text, text, text) from public, anon;
grant execute on function public.crm_create_instagram_lead(uuid, text, text, text, text, text, text, text, uuid, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Relatório: origem › campanha › conjunto › anúncio (contatos novos no período)
-- ---------------------------------------------------------------------
drop function if exists public.crm_tracking_report(uuid, timestamptz, timestamptz);
create or replace function public.crm_tracking_report(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns table (source text, campaign text, adset text, ad text, contacts integer, replied integer, qualified integer, won integer, revenue numeric)
language sql stable security invoker
set search_path = public
as $$
  with a as (
    select c.id as contact_id, c.created_at,
           case at.kind when 'link' then 'Link de rastreio' when 'ctwa' then 'Anúncio → WhatsApp'
                        when 'code' then 'Anúncio (código)'
                        when 'manual' then case when at.utm_medium = 'paid' then 'Anúncio → Instagram' else 'Instagram' end
                        else 'Orgânico' end as source,
           coalesce(nullif(at.utm_campaign, ''), case when at.kind = 'ctwa' then coalesce(at.ad_title, 'Anúncio') end,
                    case when at.kind = 'manual' then replace(at.entry_point, 'instagram_', 'Instagram · ') end, '—') as campaign,
           coalesce(nullif(at.utm_term, ''), '—') as adset,
           coalesce(nullif(at.utm_content, ''), at.ad_id, at.ad_source_id, case when at.kind = 'organic' then at.entry_point end, '—') as ad
    from public.crm_contacts c
    join public.crm_attributions at on at.id = c.attribution_id
    where (p_store_id is null or c.store_id = p_store_id)
      and c.created_at >= p_from and c.created_at < p_to
  )
  select a.source, a.campaign, a.adset, a.ad,
         count(distinct a.contact_id)::int,
         count(distinct a.contact_id) filter (where exists (
           select 1 from public.crm_messages m where m.contact_id = a.contact_id and m.direction = 'in' and m.kind <> 'note'))::int,
         count(distinct d.contact_id) filter (where d.ai_summary is not null or s.code in ('proposal', 'svc_quote') or d.status = 'won')::int,
         count(distinct d.id) filter (where d.status = 'won')::int,
         coalesce(sum(d.value) filter (where d.status = 'won'), 0)
  from a
  left join public.crm_deals d on d.contact_id = a.contact_id
  left join public.crm_stages s on s.id = d.stage_id
  group by 1, 2, 3, 4
  order by 9 desc, 5 desc;
$$;
revoke all on function public.crm_tracking_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.crm_tracking_report(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- Investimento por campanha no período (proporcional aos dias em comum)
create or replace function public.crm_campaign_spend_report(p_store_id uuid, p_from date, p_to date)
returns table (campaign text, spend numeric)
language sql stable security invoker
set search_path = public
as $$
  select s.campaign,
         round(sum(s.amount * (least(s.period_end, p_to) - greatest(s.period_start, p_from) + 1)::numeric
                   / (s.period_end - s.period_start + 1)), 2)
  from public.crm_campaign_spend s
  where (p_store_id is null or s.store_id = p_store_id)
    and s.period_start <= p_to and s.period_end >= p_from
  group by s.campaign;
$$;
revoke all on function public.crm_campaign_spend_report(uuid, date, date) from public, anon;
grant execute on function public.crm_campaign_spend_report(uuid, date, date) to authenticated, service_role;
