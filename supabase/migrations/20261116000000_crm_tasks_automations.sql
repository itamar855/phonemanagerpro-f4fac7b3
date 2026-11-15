-- =====================================================================
-- CRM — Fase 5: tarefas e automações
-- * Tarefas ganham vínculo com conversa, origem (pessoa/automação/IA),
--   mensagem sugerida e chave anti-duplicata.
-- * crm_automation_settings: rodízio de atendimento e alertas por loja.
-- * Rodízio: conversa nova sem responsável vai para o próximo da fila.
-- * crm_run_automations(): roda a cada 5 min (pg_cron) e só CRIA TAREFAS
--   (nunca envia mensagem): conversa sem resposta, negócio parado,
--   OS pronta, pedido de avaliação e garantia vencendo.
-- Vendas e OS são apenas LIDAS; nenhuma tabela fora do CRM é alterada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tarefas
-- ---------------------------------------------------------------------
alter table public.crm_tasks add column if not exists conversation_id   uuid references public.crm_conversations(id) on delete set null;
alter table public.crm_tasks add column if not exists source            text not null default 'user';
alter table public.crm_tasks add column if not exists dedupe_key        text;
alter table public.crm_tasks add column if not exists suggested_message text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_tasks_source_check') then
    alter table public.crm_tasks add constraint crm_tasks_source_check check (source in ('user', 'automation', 'ai'));
  end if;
end $$;

create unique index if not exists crm_tasks_dedupe_uq  on public.crm_tasks (store_id, dedupe_key) where dedupe_key is not null;
create index if not exists crm_tasks_store_open        on public.crm_tasks (store_id, due_at) where done_at is null;
create index if not exists crm_tasks_conversation      on public.crm_tasks (conversation_id) where conversation_id is not null;

-- ---------------------------------------------------------------------
-- 2. Configuração das automações (uma linha por loja)
-- ---------------------------------------------------------------------
create table if not exists public.crm_automation_settings (
  store_id             uuid primary key references public.stores(id) on delete cascade,
  round_robin          boolean not null default false,
  round_robin_members  uuid[]  not null default '{}',
  round_robin_cursor   integer not null default 0,
  unanswered_minutes   integer default 30 check (unanswered_minutes is null or unanswered_minutes between 5 and 1440),
  stale_deals          boolean not null default true,
  os_ready             boolean not null default true,
  review_after_days    integer default 3 check (review_after_days is null or review_after_days between 1 and 60),
  warranty_alert_days  integer default 7 check (warranty_alert_days is null or warranty_alert_days between 1 and 60),
  updated_by           uuid references auth.users(id) on delete set null,
  updated_at           timestamptz not null default now()
);

drop trigger if exists crm_automation_settings_touch on public.crm_automation_settings;
create trigger crm_automation_settings_touch before update on public.crm_automation_settings
  for each row execute function public.crm_touch_updated_at();

insert into public.crm_automation_settings (store_id) select id from public.stores on conflict do nothing;

-- loja nova: funis + configuração das automações
create or replace function public.crm_stores_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crm_seed_store(new.id);
  insert into public.crm_automation_settings (store_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;
revoke all on function public.crm_stores_after_insert() from public, anon, authenticated;

alter table public.crm_automation_settings enable row level security;
revoke all on table public.crm_automation_settings from anon;
drop policy if exists crm_automation_settings_member_select on public.crm_automation_settings;
drop policy if exists crm_automation_settings_manager_write on public.crm_automation_settings;
create policy crm_automation_settings_member_select on public.crm_automation_settings
  for select to authenticated using (public.crm_is_member(store_id));
create policy crm_automation_settings_manager_write on public.crm_automation_settings
  for all to authenticated
  using (public.crm_is_member(store_id) and public.crm_is_manager())
  with check (public.crm_is_member(store_id) and public.crm_is_manager());

-- ---------------------------------------------------------------------
-- 3. Rodízio: conversa nova (aberta, contato não ignorado) sem responsável
-- ---------------------------------------------------------------------
create or replace function public.crm_conversations_round_robin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_members uuid[];
  v_cursor  integer;
begin
  if new.assigned_to is not null or new.status = 'resolved' then
    return new;
  end if;
  if exists (select 1 from public.crm_contacts where id = new.contact_id and ignored) then
    return new;
  end if;

  -- só quem ainda é membro da loja, na ordem configurada
  select array(
           select u.m from unnest(s.round_robin_members) with ordinality as u(m, i)
           where exists (select 1 from public.member_stores ms where ms.store_id = s.store_id and ms.user_id = u.m)
           order by u.i)
    into v_members
  from public.crm_automation_settings s
  where s.store_id = new.store_id and s.round_robin;

  if coalesce(cardinality(v_members), 0) = 0 then
    return new;
  end if;

  update public.crm_automation_settings
     set round_robin_cursor = round_robin_cursor + 1
   where store_id = new.store_id
  returning round_robin_cursor - 1 into v_cursor;

  new.assigned_to := v_members[(v_cursor % cardinality(v_members)) + 1];
  return new;
end;
$$;

drop trigger if exists crm_conversations_round_robin on public.crm_conversations;
create trigger crm_conversations_round_robin
  before insert on public.crm_conversations
  for each row execute function public.crm_conversations_round_robin();

-- ---------------------------------------------------------------------
-- 4. Tarefas automáticas se fecham sozinhas quando o motivo some
-- ---------------------------------------------------------------------
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
  return null;
end;
$$;

drop trigger if exists crm_conversations_close_tasks on public.crm_conversations;
create trigger crm_conversations_close_tasks
  after update of last_message_direction, status on public.crm_conversations
  for each row execute function public.crm_conversations_close_tasks();

create or replace function public.crm_deals_close_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage_id is distinct from old.stage_id then
    update public.crm_tasks set done_at = now()
     where deal_id = new.id and kind = 'stale_deal' and source = 'automation' and done_at is null;
  end if;
  return null;
end;
$$;

drop trigger if exists crm_deals_close_tasks on public.crm_deals;
create trigger crm_deals_close_tasks
  after update of stage_id on public.crm_deals
  for each row execute function public.crm_deals_close_tasks();

-- ---------------------------------------------------------------------
-- 5. Motor das automações (só cria tarefas; idempotente pela dedupe_key)
-- ---------------------------------------------------------------------
create or replace function public.crm_run_automations(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_reply    integer := 0;
  n_stale    integer := 0;
  n_ready    integer := 0;
  n_review   integer := 0;
  n_warranty integer := 0;
  n          integer;
begin
  -- 5.1 Conversa sem resposta (só mensagens dos últimos 2 dias, para não inundar)
  insert into public.crm_tasks (store_id, title, kind, due_at, assigned_to, contact_id, conversation_id, source, dedupe_key)
  select c.store_id, 'Responder ' || ct.name, 'reply', p_now, c.assigned_to, ct.id, c.id, 'automation',
         'reply:' || c.id || ':' || floor(extract(epoch from c.last_inbound_at))::bigint
  from public.crm_conversations c
  join public.crm_contacts ct on ct.id = c.contact_id and not ct.ignored
  join public.crm_automation_settings s on s.store_id = c.store_id and s.unanswered_minutes is not null
  where c.status <> 'resolved'
    and c.last_message_direction = 'in'
    and c.last_inbound_at <= p_now - make_interval(mins => s.unanswered_minutes)
    and c.last_inbound_at >  p_now - interval '2 days'
  on conflict (store_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n_reply = row_count;

  -- 5.2 Negócio parado além do prazo da etapa
  insert into public.crm_tasks (store_id, title, kind, due_at, assigned_to, contact_id, deal_id, source, dedupe_key)
  select d.store_id, 'Retomar: ' || d.title || ' (' || st.name || ')', 'stale_deal', p_now, d.owner_id, d.contact_id, d.id, 'automation',
         'stale:' || d.id || ':' || floor(extract(epoch from d.stage_entered_at))::bigint
  from public.crm_deals d
  join public.crm_stages st on st.id = d.stage_id and st.kind = 'open' and st.sla_hours is not null
  join public.crm_automation_settings s on s.store_id = d.store_id and s.stale_deals
  where d.status = 'open'
    and d.stage_entered_at <= p_now - make_interval(hours => st.sla_hours)
  on conflict (store_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n_stale = row_count;

  -- 5.3 OS pronta: avisar o cliente (só as que ficaram prontas nos últimos 3 dias)
  insert into public.crm_tasks (store_id, title, notes, kind, due_at, contact_id, conversation_id, source, dedupe_key, suggested_message)
  select so.store_id,
         'Avisar que a OS #' || so.order_number || ' está pronta',
         concat_ws(' · ', nullif(btrim(so.customer_name), ''), nullif(btrim(concat_ws(' ', so.device_brand, so.device_model)), ''), so.customer_phone),
         'os_ready', p_now, x.contact_id, x.conversation_id, 'automation', 'os_ready:' || so.id,
         'Olá' || coalesce(' ' || split_part(nullif(btrim(so.customer_name), ''), ' ', 1), '') || '! Seu aparelho'
           || coalesce(' ' || nullif(btrim(concat_ws(' ', so.device_brand, so.device_model)), ''), '')
           || ' (OS #' || so.order_number || ') já está pronto para retirada. 😊'
  from public.service_orders so
  join public.crm_automation_settings s on s.store_id = so.store_id and s.os_ready
  left join lateral (
    select c.id as contact_id,
           (select cv.id from public.crm_conversations cv where cv.contact_id = c.id and cv.channel = 'whatsapp') as conversation_id
    from public.crm_contacts c
    where c.store_id = so.store_id and not c.ignored
      and ((so.customer_id is not null and c.customer_id = so.customer_id)
        or (c.phone_key is not null and c.phone_key = public.crm_phone_key(so.customer_phone)))
    order by (c.customer_id is not distinct from so.customer_id) desc, c.created_at
    limit 1
  ) x on true
  where so.status = 'ready'
    and coalesce(so.completed_at, so.updated_at) > p_now - interval '3 days'
  on conflict (store_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n_ready = row_count;

  -- 5.4 Pedir avaliação: OS entregue / compra feita há N dias (janela de 3 dias)
  insert into public.crm_tasks (store_id, title, notes, kind, due_at, contact_id, conversation_id, source, dedupe_key, suggested_message)
  select so.store_id,
         'Pedir avaliação · OS #' || so.order_number,
         concat_ws(' · ', nullif(btrim(so.customer_name), ''), so.customer_phone),
         'review', p_now, x.contact_id, x.conversation_id, 'automation', 'review_os:' || so.id,
         'Olá' || coalesce(' ' || split_part(nullif(btrim(so.customer_name), ''), ' ', 1), '')
           || '! Tudo certo com o seu aparelho? Se puder, deixe uma avaliação sobre o nosso atendimento. Ajuda muito! 🙏'
  from public.service_orders so
  join public.crm_automation_settings s on s.store_id = so.store_id and s.review_after_days is not null
  left join lateral (
    select c.id as contact_id,
           (select cv.id from public.crm_conversations cv where cv.contact_id = c.id and cv.channel = 'whatsapp') as conversation_id
    from public.crm_contacts c
    where c.store_id = so.store_id and not c.ignored
      and ((so.customer_id is not null and c.customer_id = so.customer_id)
        or (c.phone_key is not null and c.phone_key = public.crm_phone_key(so.customer_phone)))
    order by (c.customer_id is not distinct from so.customer_id) desc, c.created_at
    limit 1
  ) x on true
  where so.status = 'delivered' and so.delivered_at is not null
    and so.delivered_at <= p_now - make_interval(days => s.review_after_days)
    and so.delivered_at >  p_now - make_interval(days => s.review_after_days + 3)
  on conflict (store_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n = row_count;
  n_review := n;

  insert into public.crm_tasks (store_id, title, notes, kind, due_at, assigned_to, contact_id, conversation_id, source, dedupe_key, suggested_message)
  select sa.store_id,
         'Pedir avaliação · compra' || coalesce(' de ' || nullif(btrim(concat_ws(' ', p.brand, p.model)), ''), ''),
         concat_ws(' · ', nullif(btrim(sa.customer_name), ''), sa.customer_phone),
         'review', p_now, coalesce(sa.seller_id, sa.created_by), x.contact_id, x.conversation_id, 'automation', 'review_sale:' || sa.id,
         'Olá' || coalesce(' ' || split_part(nullif(btrim(sa.customer_name), ''), ' ', 1), '')
           || '! Está gostando do seu aparelho novo? Se puder, deixe uma avaliação sobre a sua compra. Ajuda muito! 🙏'
  from public.sales sa
  join public.crm_automation_settings s on s.store_id = sa.store_id and s.review_after_days is not null
  left join public.products p on p.id = sa.product_id
  left join lateral (
    select c.id as contact_id,
           (select cv.id from public.crm_conversations cv where cv.contact_id = c.id and cv.channel = 'whatsapp') as conversation_id
    from public.crm_contacts c
    where c.store_id = sa.store_id and not c.ignored
      and ((sa.customer_id is not null and c.customer_id = sa.customer_id)
        or (c.phone_key is not null and c.phone_key = public.crm_phone_key(sa.customer_phone)))
    order by (c.customer_id is not distinct from sa.customer_id) desc, c.created_at
    limit 1
  ) x on true
  where sa.created_at <= p_now - make_interval(days => s.review_after_days)
    and sa.created_at >  p_now - make_interval(days => s.review_after_days + 3)
  on conflict (store_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n = row_count;
  n_review := n_review + n;

  -- 5.5 Garantia vencendo nos próximos N dias (OS e vendas)
  insert into public.crm_tasks (store_id, title, notes, kind, due_at, contact_id, conversation_id, source, dedupe_key)
  select so.store_id,
         'Garantia vencendo · OS #' || so.order_number,
         concat_ws(' · ', nullif(btrim(so.customer_name), ''), so.customer_phone, 'vence em ' || to_char(so.warranty_end_date at time zone 'America/Sao_Paulo', 'DD/MM')),
         'warranty', p_now, x.contact_id, x.conversation_id, 'automation', 'warranty_os:' || so.id
  from public.service_orders so
  join public.crm_automation_settings s on s.store_id = so.store_id and s.warranty_alert_days is not null
  left join lateral (
    select c.id as contact_id,
           (select cv.id from public.crm_conversations cv where cv.contact_id = c.id and cv.channel = 'whatsapp') as conversation_id
    from public.crm_contacts c
    where c.store_id = so.store_id and not c.ignored
      and ((so.customer_id is not null and c.customer_id = so.customer_id)
        or (c.phone_key is not null and c.phone_key = public.crm_phone_key(so.customer_phone)))
    order by (c.customer_id is not distinct from so.customer_id) desc, c.created_at
    limit 1
  ) x on true
  where so.status <> 'cancelled'
    and so.warranty_end_date >  p_now
    and so.warranty_end_date <= p_now + make_interval(days => s.warranty_alert_days)
  on conflict (store_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n = row_count;
  n_warranty := n;

  insert into public.crm_tasks (store_id, title, notes, kind, due_at, assigned_to, contact_id, conversation_id, source, dedupe_key)
  select sa.store_id,
         'Garantia vencendo · compra' || coalesce(' de ' || nullif(btrim(concat_ws(' ', p.brand, p.model)), ''), ''),
         concat_ws(' · ', nullif(btrim(sa.customer_name), ''), sa.customer_phone,
                   'vence em ' || to_char((sa.created_at + make_interval(days => sa.warranty_days)) at time zone 'America/Sao_Paulo', 'DD/MM')),
         'warranty', p_now, coalesce(sa.seller_id, sa.created_by), x.contact_id, x.conversation_id, 'automation', 'warranty_sale:' || sa.id
  from public.sales sa
  join public.crm_automation_settings s on s.store_id = sa.store_id and s.warranty_alert_days is not null
  left join public.products p on p.id = sa.product_id
  left join lateral (
    select c.id as contact_id,
           (select cv.id from public.crm_conversations cv where cv.contact_id = c.id and cv.channel = 'whatsapp') as conversation_id
    from public.crm_contacts c
    where c.store_id = sa.store_id and not c.ignored
      and ((sa.customer_id is not null and c.customer_id = sa.customer_id)
        or (c.phone_key is not null and c.phone_key = public.crm_phone_key(sa.customer_phone)))
    order by (c.customer_id is not distinct from sa.customer_id) desc, c.created_at
    limit 1
  ) x on true
  where coalesce(sa.warranty_days, 0) > 0
    and sa.created_at + make_interval(days => sa.warranty_days) >  p_now
    and sa.created_at + make_interval(days => sa.warranty_days) <= p_now + make_interval(days => s.warranty_alert_days)
  on conflict (store_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n = row_count;
  n_warranty := n_warranty + n;

  return jsonb_build_object('reply', n_reply, 'stale_deal', n_stale, 'os_ready', n_ready, 'review', n_review, 'warranty', n_warranty);
end;
$$;

revoke all on function public.crm_run_automations(timestamptz) from public, anon, authenticated;
grant execute on function public.crm_run_automations(timestamptz) to service_role;
revoke all on function public.crm_conversations_round_robin() from public, anon, authenticated;
revoke all on function public.crm_conversations_close_tasks() from public, anon, authenticated;
revoke all on function public.crm_deals_close_tasks() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Contadores das tarefas (badge do menu). security invoker: RLS da loja.
-- ---------------------------------------------------------------------
create or replace function public.crm_task_counts(p_store_id uuid default null)
returns jsonb
language sql stable security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'overdue', count(*) filter (where due_at < now()),
    -- vencidas + as que vencem até o fim de hoje (horário de Brasília)
    'today',   count(*) filter (where due_at < (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 day') at time zone 'America/Sao_Paulo'),
    'open',    count(*)
  )
  from public.crm_tasks t
  where t.done_at is null
    and (p_store_id is null or t.store_id = p_store_id)
    and (t.assigned_to = (select auth.uid()) or t.assigned_to is null);
$$;

revoke all on function public.crm_task_counts(uuid) from public, anon;
grant execute on function public.crm_task_counts(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. Agendamento (pg_cron) — a cada 5 minutos
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('crm-automations', '*/5 * * * *', 'select public.crm_run_automations()');
  end if;
end $$;
