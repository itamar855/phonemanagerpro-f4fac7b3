-- =====================================================================
-- CRM — Lead do Instagram (manual): o vendedor pegou o número na DM
-- * crm_create_instagram_lead: contato + origem + conversa de WhatsApp +
--   negócio + tarefa de retomada + evento Lead para a Meta, numa transação
-- * Mensagem modelo e prazo da retomada configuráveis por loja
-- * A tarefa de retomada fecha sozinha quando a pessoa responde
-- * crm_ig_manual_report: Instagram → WhatsApp (números pegos, responderam, venda)
-- =====================================================================

alter table public.crm_automation_settings add column if not exists ig_first_message text
  not null default 'Oi {primeiro_nome}! Aqui é a {loja}, você falou com a gente no Instagram{sobre} 😊 Posso te ajudar por aqui?';
alter table public.crm_automation_settings add column if not exists ig_followup_hours integer not null default 2;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_automation_settings_ig_followup_check') then
    alter table public.crm_automation_settings add constraint crm_automation_settings_ig_followup_check check (ig_followup_hours between 1 and 72);
  end if;
end $$;

-- origem preenchida à mão pelo vendedor
alter table public.crm_attributions drop constraint if exists crm_attributions_kind_check;
alter table public.crm_attributions add constraint crm_attributions_kind_check check (kind in ('link', 'ctwa', 'organic', 'manual'));

create or replace function public.crm_create_instagram_lead(
  p_store_id       uuid,
  p_phone          text,
  p_name           text    default null,
  p_username       text    default null,
  p_interest       text    default null,
  p_subject        text    default null,
  p_source         text    default 'organic',   -- ad | post | story | organic
  p_campaign       text    default null,
  p_owner_id       uuid    default null
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

  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || v_key, 0));

  -- 1. contato (o mesmo número na loja = a mesma pessoa)
  select * into v_contact from public.crm_contacts where store_id = p_store_id and phone_key = v_key;
  if v_contact.id is null then
    insert into public.crm_contacts (store_id, name, phone, phone_key, instagram_username, origin_channel, owner_id)
    values (p_store_id, coalesce(v_name, case when v_user is not null then '@' || v_user end, '+55 ' || v_norm),
            '55' || v_norm, v_key, v_user, 'instagram', v_owner)
    returning * into v_contact;
  else
    v_existing := true;
    update public.crm_contacts c set
      instagram_username = coalesce(c.instagram_username, v_user),
      ignored = false,
      name = case when v_name is not null and (c.name in ('Contato', 'Lead WhatsApp') or c.name like '+55 %' or c.name like '@%') then v_name else c.name end
    where c.id = v_contact.id
    returning * into v_contact;
  end if;

  -- 2. origem (primeiro toque; não substitui uma origem de anúncio já rastreada)
  insert into public.crm_attributions (store_id, contact_id, kind, entry_point, entry_app, utm_source, utm_medium, utm_campaign)
  values (p_store_id, v_contact.id, 'manual', 'instagram_' || p_source, 'instagram', 'instagram',
          case when p_source = 'ad' then 'paid' else 'organic' end, nullif(btrim(p_campaign), ''))
  returning id into v_attr;
  update public.crm_contacts c set attribution_id = v_attr
   where c.id = v_contact.id and (c.attribution_id is null
     or exists (select 1 from public.crm_attributions a where a.id = c.attribution_id and a.kind = 'organic'));

  -- 3. conversa de WhatsApp (aberta, com quem cadastrou)
  select id into v_conv from public.crm_conversations where contact_id = v_contact.id and channel = 'whatsapp';
  if v_conv is null then
    insert into public.crm_conversations (store_id, contact_id, channel, status, assigned_to, handler)
    values (p_store_id, v_contact.id, 'whatsapp', 'open', v_owner, 'human')
    returning id into v_conv;
  end if;
  -- o vendedor já está conversando com a pessoa: a conversa fica com ele (a IA não assume)
  update public.crm_conversations set status = 'open', assigned_to = coalesce(assigned_to, v_owner), handler = 'human' where id = v_conv;

  -- 4. negócio aberto (reaproveita se já existir)
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

  -- 5. retomada se não responder
  select coalesce(ig_followup_hours, 2) into v_hours from public.crm_automation_settings where store_id = p_store_id;
  insert into public.crm_tasks (store_id, title, kind, due_at, assigned_to, contact_id, deal_id, conversation_id, source, dedupe_key)
  values (p_store_id, 'Retomar ' || v_contact.name || ' (veio do Instagram)', 'ig_followup', now() + make_interval(hours => coalesce(v_hours, 2)),
          v_owner, v_contact.id, v_deal, v_conv, 'automation', 'ig_followup:' || v_conv || ':' || floor(extract(epoch from now()))::bigint)
  on conflict (store_id, dedupe_key) where dedupe_key is not null do nothing;

  insert into public.crm_activities (store_id, contact_id, deal_id, conversation_id, actor_kind, actor_id, type, payload)
  values (p_store_id, v_contact.id, v_deal, v_conv, 'user', v_uid, 'ig_lead_created',
          jsonb_build_object('source', p_source, 'campaign', nullif(btrim(p_campaign), ''), 'existing', v_existing));

  -- 6. evento Lead para a Meta (se o rastreamento estiver ligado)
  perform public.crm_meta_enqueue(v_contact.id, v_deal, 'lead', null);

  return jsonb_build_object(
    'contact_id', v_contact.id, 'conversation_id', v_conv, 'deal_id', v_deal, 'existing', v_existing,
    'contact_name', v_contact.name, 'store_name', (select name from public.stores where id = p_store_id)
  );
end;
$$;
revoke all on function public.crm_create_instagram_lead(uuid, text, text, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.crm_create_instagram_lead(uuid, text, text, text, text, text, text, text, uuid) to authenticated, service_role;

-- A pessoa respondeu no WhatsApp: a retomada some sozinha
create or replace function public.crm_conversations_close_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.last_message_direction = 'out' and old.last_message_direction is distinct from 'out')
     or (new.status = 'resolved' and old.status <> 'resolved') then
    update public.crm_tasks set done_at = now()
     where conversation_id = new.id and kind = 'reply' and source = 'automation' and done_at is null;
  end if;
  if new.last_inbound_at is distinct from old.last_inbound_at and new.last_inbound_at is not null then
    update public.crm_tasks set done_at = now()
     where conversation_id = new.id and kind = 'ig_followup' and done_at is null and created_at <= new.last_inbound_at;
  end if;
  return null;
end;
$$;
drop trigger if exists crm_conversations_close_tasks on public.crm_conversations;
create trigger crm_conversations_close_tasks
  after update of last_message_direction, status, last_inbound_at on public.crm_conversations
  for each row execute function public.crm_conversations_close_tasks();

-- Relatório por campanha passa a reconhecer a origem manual do Instagram
create or replace function public.crm_tracking_report(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns table (source text, campaign text, ad text, contacts integer, qualified integer, won integer, revenue numeric)
language sql stable security invoker
set search_path = public
as $$
  with a as (
    select c.id as contact_id,
           case at.kind when 'link' then 'Link de rastreio' when 'ctwa' then 'Anúncio WhatsApp'
                        when 'manual' then case when at.utm_medium = 'paid' then 'Anúncio Instagram' else 'Instagram' end
                        else 'Orgânico' end as source,
           coalesce(nullif(at.utm_campaign, ''), case when at.kind = 'ctwa' then coalesce(at.ad_title, 'Anúncio') end,
                    case when at.kind = 'manual' then replace(at.entry_point, 'instagram_', 'Instagram · ') end, '—') as campaign,
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

-- Instagram → WhatsApp (leads cadastrados à mão no período)
create or replace function public.crm_ig_manual_report(p_store_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security invoker
set search_path = public
as $$
  with l as (
    select distinct on (a.contact_id) a.contact_id, a.conversation_id, a.created_at, a.payload
    from public.crm_activities a
    where a.type = 'ig_lead_created' and (p_store_id is null or a.store_id = p_store_id)
      and a.created_at >= p_from and a.created_at < p_to
    order by a.contact_id, a.created_at
  ),
  r as (
    select l.*,
           (select min(m.created_at) from public.crm_messages m
             where m.conversation_id = l.conversation_id and m.direction = 'in' and m.created_at >= l.created_at) as replied_at,
           exists (select 1 from public.crm_deals d where d.contact_id = l.contact_id and d.status = 'won' and d.won_at >= l.created_at) as won,
           (select coalesce(sum(d.value), 0) from public.crm_deals d where d.contact_id = l.contact_id and d.status = 'won' and d.won_at >= l.created_at) as revenue
    from l
  )
  select jsonb_build_object(
    'leads', count(*),
    'from_ads', count(*) filter (where payload->>'source' = 'ad'),
    'replied', count(*) filter (where replied_at is not null),
    'median_reply_min', round((percentile_cont(0.5) within group (order by extract(epoch from (replied_at - created_at)) / 60.0))::numeric, 0),
    'won', count(*) filter (where won),
    'revenue', coalesce(sum(revenue), 0)
  )
  from r;
$$;
revoke all on function public.crm_ig_manual_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.crm_ig_manual_report(uuid, timestamptz, timestamptz) to authenticated, service_role;
