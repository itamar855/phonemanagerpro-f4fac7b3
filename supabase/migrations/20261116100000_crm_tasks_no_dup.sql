-- CRM — tarefas de retomada/assumir sem duplicar: so cria se nao houver uma aberta para a conversa
-- (antes dependia de dois cadastros cairem no mesmo segundo).

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
  select p_store_id, 'Retomar ' || v_contact.name || ' (veio do Instagram)', 'ig_followup', now() + make_interval(hours => coalesce(v_hours, 2)),
          v_owner, v_contact.id, v_deal, v_conv, 'automation', 'ig_followup:' || v_conv || ':' || floor(extract(epoch from now()))::bigint
   where not exists (select 1 from public.crm_tasks t where t.conversation_id = v_conv and t.kind = 'ig_followup' and t.done_at is null)
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

create or replace function public.crm_ai_handoff(
  p_conversation_id uuid,
  p_title           text,
  p_summary         text,
  p_score           text    default null,
  p_interest        text    default null,
  p_reason          text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv     public.crm_conversations%rowtype;
  v_contact  public.crm_contacts%rowtype;
  v_pipe     uuid;
  v_stage    uuid;
  v_owner    uuid;
  v_deal     uuid;
  v_kind     text := case when p_interest = 'repair' then 'service' else 'sales' end;
begin
  select * into v_conv from public.crm_conversations where id = p_conversation_id for update;
  if v_conv.id is null then raise exception 'Conversa não encontrada.'; end if;
  select * into v_contact from public.crm_contacts where id = v_conv.contact_id;

  v_owner := coalesce(v_conv.assigned_to, public.crm_pick_assignee(v_conv.store_id));

  -- negócio aberto já existente do contato: atualiza em vez de duplicar
  select d.id into v_deal from public.crm_deals d
   where d.contact_id = v_contact.id and d.status = 'open'
   order by d.created_at desc limit 1;

  if v_deal is null then
    select p.id into v_pipe from public.crm_pipelines p
     where p.store_id = v_conv.store_id and p.kind = v_kind and not p.archived
     order by p.is_default desc, p.position limit 1;
    if v_pipe is null then
      select p.id into v_pipe from public.crm_pipelines p
       where p.store_id = v_conv.store_id and not p.archived order by p.is_default desc, p.position limit 1;
    end if;
    select s.id into v_stage from public.crm_stages s
     where s.pipeline_id = v_pipe and s.kind = 'open' and not s.hidden
     order by s.position limit 1;

    insert into public.crm_deals (store_id, pipeline_id, stage_id, contact_id, title, interest, owner_id,
                                  origin_channel, ai_summary, ai_score)
    values (v_conv.store_id, v_pipe, v_stage, v_contact.id,
            coalesce(nullif(btrim(p_title), ''), v_contact.name),
            case when p_interest in ('device', 'repair', 'accessory', 'other') then p_interest end,
            v_owner, v_contact.origin_channel, p_summary,
            case when p_score in ('hot', 'warm', 'cold') then p_score end)
    returning id into v_deal;
  else
    update public.crm_deals set
      ai_summary = p_summary,
      ai_score   = coalesce(case when p_score in ('hot', 'warm', 'cold') then p_score end, ai_score),
      owner_id   = coalesce(owner_id, v_owner)
    where id = v_deal;
  end if;

  update public.crm_conversations set
    handler = 'human',
    assigned_to = coalesce(assigned_to, v_owner),
    status = case when status = 'resolved' then 'open' else status end
  where id = v_conv.id;

  insert into public.crm_tasks (store_id, title, notes, kind, due_at, assigned_to, contact_id, deal_id, conversation_id, source, dedupe_key)
  select v_conv.store_id, 'Assumir atendimento: ' || v_contact.name, p_summary, 'reply', now(), v_owner,
          v_contact.id, v_deal, v_conv.id, 'ai', 'ai_handoff:' || v_conv.id || ':' || floor(extract(epoch from now()))::bigint
   where not exists (select 1 from public.crm_tasks t where t.conversation_id = v_conv.id and t.source = 'ai' and t.kind = 'reply' and t.done_at is null)
  on conflict (store_id, dedupe_key) where dedupe_key is not null do nothing;

  insert into public.crm_activities (store_id, contact_id, deal_id, conversation_id, actor_kind, type, payload)
  values (v_conv.store_id, v_contact.id, v_deal, v_conv.id, 'ai', 'ai_handoff',
          jsonb_build_object('reason', p_reason, 'score', p_score, 'summary', p_summary));

  return jsonb_build_object('deal_id', v_deal, 'owner_id', v_owner);
end;
$$;

revoke all on function public.crm_create_instagram_lead(uuid, text, text, text, text, text, text, text, uuid, text, text, text) from public, anon;
grant execute on function public.crm_create_instagram_lead(uuid, text, text, text, text, text, text, text, uuid, text, text, text) to authenticated, service_role;

revoke all on function public.crm_ai_handoff(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.crm_ai_handoff(uuid, text, text, text, text, text) to service_role;
