-- =====================================================================
-- CRM — distribuição de atendimento com aviso no WhatsApp
--
-- Cliente pendente (a IA passou o atendimento, ou chegou conversa nova
-- sem IA) → o próximo da fila do rodízio recebe um aviso no WhatsApp
-- pessoal → tem N minutos para tocar em "Assumir" (ou responder o
-- cliente). Se não assumir, passa para o próximo. Depois de uma volta
-- inteira sem ninguém, fica com o dono e para de repassar.
-- Loja fechada: espera abrir (horário do agente de IA).
--
-- O envio do aviso é feito pela função crm-dispatch (Evolution); aqui
-- ficam as regras, a fila e o relógio (pg_cron a cada minuto).
-- =====================================================================

alter table public.crm_automation_settings
  add column if not exists dispatch_enabled  boolean not null default false,
  add column if not exists dispatch_minutes  integer not null default 5,
  add column if not exists dispatch_owner_id uuid references auth.users(id) on delete set null;

do $$
begin
  alter table public.crm_automation_settings
    add constraint crm_automation_dispatch_minutes_chk check (dispatch_minutes between 1 and 60);
exception when duplicate_object then null;
end $$;

alter table public.crm_conversations
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid references auth.users(id) on delete set null;

create table if not exists public.crm_dispatches (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  conversation_id  uuid not null references public.crm_conversations(id) on delete cascade,
  cycle_id         uuid not null,                      -- uma rodada de distribuição
  user_id          uuid references auth.users(id) on delete set null,
  status           text not null default 'waiting'
                   check (status in ('waiting', 'offered', 'accepted', 'expired', 'owner', 'cancelled')),
  offered_at       timestamptz,
  expires_at       timestamptz,
  decided_at       timestamptz,
  notify_status    text check (notify_status in ('pending', 'sending', 'sent', 'failed')),
  notify_error     text,
  notified_at      timestamptz,
  created_at       timestamptz not null default now()
);
create unique index if not exists crm_dispatches_active_uq on public.crm_dispatches (conversation_id) where status in ('waiting', 'offered');
create index if not exists crm_dispatches_open on public.crm_dispatches (status, expires_at) where status in ('waiting', 'offered');
create index if not exists crm_dispatches_notify on public.crm_dispatches (created_at) where notify_status in ('pending', 'sending');
create index if not exists crm_dispatches_cycle on public.crm_dispatches (cycle_id);

alter table public.crm_dispatches enable row level security;
drop policy if exists crm_dispatches_select on public.crm_dispatches;
create policy crm_dispatches_select on public.crm_dispatches for select to authenticated
  using (public.crm_is_member(store_id));
grant select on public.crm_dispatches to authenticated;

-- ---------------------------------------------------------------------
-- Ajudantes
-- ---------------------------------------------------------------------

-- Loja aberta agora? Usa o horário do agente de IA; sem horário = sempre aberta.
create or replace function public.crm_store_open(p_store_id uuid, p_at timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when h is null or not coalesce((h->>'enabled')::boolean, false) then true
    else extract(dow from (p_at at time zone 'America/Sao_Paulo'))::int
           in (select jsonb_array_elements_text(coalesce(h->'days', '[]'::jsonb))::int)
         and (p_at at time zone 'America/Sao_Paulo')::time >= coalesce(h->>'start', '00:00')::time
         and (p_at at time zone 'America/Sao_Paulo')::time <  coalesce(h->>'end', '23:59')::time
  end
  from (select (select a.business_hours from public.crm_ai_settings a where a.store_id = p_store_id) as h) x;
$$;
revoke all on function public.crm_store_open(uuid, timestamptz) from public, anon;
grant execute on function public.crm_store_open(uuid, timestamptz) to authenticated, service_role;

-- Telefone (55 + DDD + número) de quem é da equipe.
create or replace function public.crm_staff_phone(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select '55' || public.crm_normalize_phone(p.phone)
  from public.profiles p
  where p.user_id = p_user_id and nullif(btrim(p.phone), '') is not null
  limit 1;
$$;
revoke all on function public.crm_staff_phone(uuid) from public, anon, authenticated;

-- Quem fica com o atendimento quando ninguém assume: o escolhido nos ajustes,
-- senão o primeiro dono/admin da loja.
create or replace function public.crm_dispatch_owner(p_store_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.dispatch_owner_id from public.crm_automation_settings s
      where s.store_id = p_store_id
        and exists (select 1 from public.member_stores ms where ms.store_id = p_store_id and ms.user_id = s.dispatch_owner_id)),
    (select ms.user_id from public.member_stores ms
       join public.user_roles r on r.user_id = ms.user_id
      where ms.store_id = p_store_id and r.role::text in ('dono', 'admin')
      order by (r.role::text = 'dono') desc, ms.created_at
      limit 1));
$$;
revoke all on function public.crm_dispatch_owner(uuid) from public, anon, authenticated;

-- Passa a conversa (e o negócio aberto e a tarefa "Assumir atendimento") para a pessoa.
create or replace function public.crm_dispatch_assign(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact uuid;
begin
  update public.crm_conversations set assigned_to = p_user_id
   where id = p_conversation_id returning contact_id into v_contact;
  update public.crm_deals set owner_id = p_user_id
   where contact_id = v_contact and status = 'open';
  update public.crm_tasks set assigned_to = p_user_id
   where conversation_id = p_conversation_id and done_at is null and kind = 'reply';
end;
$$;
revoke all on function public.crm_dispatch_assign(uuid, uuid) from public, anon, authenticated;

-- Oferece ao próximo da fila que ainda não recebeu nesta rodada.
-- Sem ninguém sobrando: fica com o dono (e conta como assumido por ele).
create or replace function public.crm_dispatch_offer(p_conversation_id uuid, p_cycle_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv    public.crm_conversations%rowtype;
  s         public.crm_automation_settings%rowtype;
  v_members uuid[];
  v_n       integer;
  v_pick    uuid;
  v_step    integer;
  v_owner   uuid;
begin
  select * into v_conv from public.crm_conversations where id = p_conversation_id;
  select * into s from public.crm_automation_settings where store_id = v_conv.store_id;

  -- só quem ainda é da loja e tem telefone para receber o aviso
  select array(
           select u.m from unnest(s.round_robin_members) with ordinality as u(m, i)
            where exists (select 1 from public.member_stores ms where ms.store_id = v_conv.store_id and ms.user_id = u.m)
              and public.crm_staff_phone(u.m) is not null
            order by u.i)
    into v_members;
  v_n := coalesce(cardinality(v_members), 0);

  for k in 0 .. v_n - 1 loop
    if not exists (select 1 from public.crm_dispatches d
                    where d.cycle_id = p_cycle_id and d.user_id = v_members[((s.round_robin_cursor + k) % v_n) + 1]
                      and d.status <> 'waiting') then
      v_pick := v_members[((s.round_robin_cursor + k) % v_n) + 1];
      v_step := k + 1;
      exit;
    end if;
  end loop;

  if v_pick is not null then
    update public.crm_automation_settings set round_robin_cursor = round_robin_cursor + v_step where store_id = v_conv.store_id;
    insert into public.crm_dispatches (store_id, conversation_id, cycle_id, user_id, status, offered_at, expires_at, notify_status)
    values (v_conv.store_id, v_conv.id, p_cycle_id, v_pick, 'offered', now(),
            now() + make_interval(mins => coalesce(s.dispatch_minutes, 5)), 'pending');
    perform public.crm_dispatch_assign(v_conv.id, v_pick);
    insert into public.crm_activities (store_id, contact_id, conversation_id, actor_kind, type, payload)
    values (v_conv.store_id, v_conv.contact_id, v_conv.id, 'system', 'dispatch_offered', jsonb_build_object('user_id', v_pick));
    return 'offered';
  end if;

  -- volta inteira sem ninguém (ou fila vazia): fica com o dono e para de repassar
  v_owner := public.crm_dispatch_owner(v_conv.store_id);
  insert into public.crm_dispatches (store_id, conversation_id, cycle_id, user_id, status, offered_at, decided_at, notify_status)
  values (v_conv.store_id, v_conv.id, p_cycle_id, v_owner, 'owner', now(), now(),
          case when v_owner is not null and public.crm_staff_phone(v_owner) is not null then 'pending' end);
  if v_owner is not null then
    perform public.crm_dispatch_assign(v_conv.id, v_owner);
  end if;
  update public.crm_conversations set accepted_at = now(), accepted_by = v_owner where id = v_conv.id;
  insert into public.crm_activities (store_id, contact_id, conversation_id, actor_kind, type, payload)
  values (v_conv.store_id, v_conv.contact_id, v_conv.id, 'system', 'dispatch_owner', jsonb_build_object('user_id', v_owner));
  return 'owner';
end;
$$;
revoke all on function public.crm_dispatch_offer(uuid, uuid) from public, anon, authenticated;

-- Começa a distribuir uma conversa (se a loja usa a distribuição e ninguém assumiu ainda).
create or replace function public.crm_dispatch_start(p_conversation_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv  public.crm_conversations%rowtype;
  v_cycle uuid := gen_random_uuid();
begin
  select * into v_conv from public.crm_conversations where id = p_conversation_id;
  if v_conv.id is null or v_conv.status = 'resolved' or v_conv.accepted_at is not null then return null; end if;
  if not exists (select 1 from public.crm_automation_settings s where s.store_id = v_conv.store_id and s.dispatch_enabled) then return null; end if;
  if exists (select 1 from public.crm_contacts c where c.id = v_conv.contact_id and c.ignored) then return null; end if;
  if exists (select 1 from public.crm_dispatches d where d.conversation_id = v_conv.id and d.status in ('waiting', 'offered')) then return null; end if;

  if public.crm_store_open(v_conv.store_id) then
    return public.crm_dispatch_offer(v_conv.id, v_cycle);
  end if;
  insert into public.crm_dispatches (store_id, conversation_id, cycle_id, status) values (v_conv.store_id, v_conv.id, v_cycle, 'waiting');
  return 'waiting';
end;
$$;
revoke all on function public.crm_dispatch_start(uuid) from public, anon, authenticated;
grant execute on function public.crm_dispatch_start(uuid) to service_role;

-- Marca como assumido (pelo botão ou respondendo o cliente).
create or replace function public.crm_dispatch_mark_accepted(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.crm_conversations%rowtype;
begin
  select * into v_conv from public.crm_conversations where id = p_conversation_id;
  if v_conv.id is null then return; end if;
  update public.crm_dispatches
     set status = 'accepted', decided_at = now(),
         notify_status = case when notify_status = 'pending' then null else notify_status end  -- já assumiu: não precisa avisar
   where conversation_id = p_conversation_id and status in ('waiting', 'offered');
  if p_user_id is not null then
    perform public.crm_dispatch_assign(p_conversation_id, p_user_id);
  end if;
  update public.crm_conversations set accepted_at = now(), accepted_by = p_user_id where id = p_conversation_id;
  update public.crm_tasks set done_at = now()
   where conversation_id = p_conversation_id and done_at is null and kind = 'reply' and source = 'ai';
  insert into public.crm_activities (store_id, contact_id, conversation_id, actor_kind, actor_id, type, payload)
  values (v_conv.store_id, v_conv.contact_id, v_conv.id, 'user', p_user_id, 'dispatch_accepted', '{}');
end;
$$;
revoke all on function public.crm_dispatch_mark_accepted(uuid, uuid) from public, anon, authenticated;

-- Botão "Assumir" no app (qualquer pessoa da loja pode assumir).
create or replace function public.crm_dispatch_accept(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid;
begin
  select store_id into v_store from public.crm_conversations where id = p_conversation_id;
  if v_store is null or not public.crm_is_member(v_store) then raise exception 'Sem acesso a esta conversa.'; end if;
  perform public.crm_dispatch_mark_accepted(p_conversation_id, (select auth.uid()));
end;
$$;
revoke all on function public.crm_dispatch_accept(uuid) from public, anon;
grant execute on function public.crm_dispatch_accept(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Relógio: a cada minuto
-- ---------------------------------------------------------------------
create or replace function public.crm_dispatch_tick()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  v_res      text;
  v_cancel   integer := 0;
  v_offered  integer := 0;
  v_owner    integer := 0;
  v_expired  integer := 0;
begin
  -- 1. não precisa mais: conversa resolvida, contato fora do CRM, IA voltou a atender ou distribuição desligada
  with gone as (
    update public.crm_dispatches d
       set status = 'cancelled', decided_at = now(),
           notify_status = case when d.notify_status = 'pending' then null else d.notify_status end
      from public.crm_conversations c
      join public.crm_contacts ct on ct.id = c.contact_id
      left join public.crm_automation_settings s on s.store_id = c.store_id
     where d.conversation_id = c.id and d.status in ('waiting', 'offered')
       and (c.status = 'resolved' or ct.ignored or c.handler = 'ai' or c.accepted_at is not null or not coalesce(s.dispatch_enabled, false))
    returning 1)
  select count(*) into v_cancel from gone;

  -- 2. ninguém assumiu a tempo: passa para o próximo
  for r in select * from public.crm_dispatches where status = 'offered' and expires_at <= now() order by expires_at for update skip locked loop
    -- aviso que nem saiu ainda não vai mais (já passou a vez dele)
    update public.crm_dispatches set status = 'expired', decided_at = now(),
           notify_status = case when notify_status = 'pending' then null else notify_status end
     where id = r.id;
    v_expired := v_expired + 1;
    if public.crm_store_open(r.store_id) then
      v_res := public.crm_dispatch_offer(r.conversation_id, r.cycle_id);
      if v_res = 'owner' then v_owner := v_owner + 1; else v_offered := v_offered + 1; end if;
    else
      insert into public.crm_dispatches (store_id, conversation_id, cycle_id, status) values (r.store_id, r.conversation_id, r.cycle_id, 'waiting');
    end if;
  end loop;

  -- 3. a loja abriu: distribui quem estava esperando
  for r in select * from public.crm_dispatches where status = 'waiting' order by created_at for update skip locked loop
    if public.crm_store_open(r.store_id) then
      delete from public.crm_dispatches where id = r.id;
      v_res := public.crm_dispatch_offer(r.conversation_id, r.cycle_id);
      if v_res = 'owner' then v_owner := v_owner + 1; else v_offered := v_offered + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('cancelled', v_cancel, 'expired', v_expired, 'offered', v_offered, 'owner', v_owner);
end;
$$;
revoke all on function public.crm_dispatch_tick() from public, anon, authenticated;
grant execute on function public.crm_dispatch_tick() to service_role;

-- Avisos a enviar (a função crm-dispatch pega, envia e confirma).
-- Também marca o número da pessoa da equipe como "não é cliente" para a
-- conversa com ela não virar lead nem receber resposta da IA.
create or replace function public.crm_dispatch_claim_notifications(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  with picked as (
    select d.id from public.crm_dispatches d
     where d.status in ('offered', 'owner')
       and (d.notify_status = 'pending'
            or (d.notify_status = 'sending' and d.notified_at is null and d.created_at < now() - interval '3 minutes'))
     order by d.created_at
     limit greatest(1, least(p_limit, 50))
     for update skip locked
  ), claimed as (
    update public.crm_dispatches d set notify_status = 'sending'
      from picked where d.id = picked.id
    returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'kind', c.status, 'store_id', c.store_id, 'conversation_id', c.conversation_id,
           'user_id', c.user_id, 'staff_phone', public.crm_staff_phone(c.user_id),
           'staff_name', coalesce((select p.display_name from public.profiles p where p.user_id = c.user_id limit 1), 'Equipe'),
           'expires_at', c.expires_at,
           'minutes', (select s.dispatch_minutes from public.crm_automation_settings s where s.store_id = c.store_id),
           'contact_name', ct.name, 'contact_phone', ct.phone,
           'deal_title', (select d.title from public.crm_deals d where d.contact_id = ct.id and d.status = 'open' order by d.created_at desc limit 1),
           'summary', coalesce(
              (select d.ai_summary from public.crm_deals d where d.contact_id = ct.id and d.status = 'open' order by d.created_at desc limit 1),
              cv.last_message_preview)
         ) order by c.created_at), '[]'::jsonb)
    into v_out
    from claimed c
    join public.crm_conversations cv on cv.id = c.conversation_id
    join public.crm_contacts ct on ct.id = cv.contact_id;

  -- números da equipe fora do CRM
  insert into public.crm_contacts (store_id, name, phone, phone_key, origin_channel, ignored, ignored_reason, tags)
  select distinct on (x->>'store_id', public.crm_phone_key(x->>'staff_phone'))
         (x->>'store_id')::uuid, 'Equipe: ' || (x->>'staff_name'), x->>'staff_phone', public.crm_phone_key(x->>'staff_phone'),
         'manual', true, 'equipe da loja', array['equipe']
    from jsonb_array_elements(v_out) x
   where x->>'staff_phone' is not null and public.crm_phone_key(x->>'staff_phone') is not null
  on conflict (store_id, phone_key) where phone_key is not null
  do update set ignored = true, ignored_reason = coalesce(public.crm_contacts.ignored_reason, 'equipe da loja'),
                tags = case when 'equipe' = any (public.crm_contacts.tags) then public.crm_contacts.tags else array_append(public.crm_contacts.tags, 'equipe') end;

  return v_out;
end;
$$;
revoke all on function public.crm_dispatch_claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.crm_dispatch_claim_notifications(integer) to service_role;

create or replace function public.crm_dispatch_notified(p_id uuid, p_ok boolean, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.crm_dispatches
     set notify_status = case when p_ok then 'sent' else 'failed' end,
         notified_at = now(), notify_error = left(p_error, 500)
   where id = p_id;
$$;
revoke all on function public.crm_dispatch_notified(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.crm_dispatch_notified(uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------

-- A IA passou o atendimento → distribui.
create or replace function public.crm_dispatch_on_handoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'ai_handoff' and new.conversation_id is not null then
    perform public.crm_dispatch_start(new.conversation_id);
  end if;
  return new;
end;
$$;
revoke all on function public.crm_dispatch_on_handoff() from public, anon, authenticated;
drop trigger if exists crm_activities_dispatch on public.crm_activities;
create trigger crm_activities_dispatch after insert on public.crm_activities
  for each row when (new.type = 'ai_handoff') execute function public.crm_dispatch_on_handoff();

-- Mensagens: cliente escrevendo sem ninguém atendendo → distribui;
-- alguém da loja respondendo → conta como assumido.
create or replace function public.crm_dispatch_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv   public.crm_conversations%rowtype;
  v_offer  uuid;
begin
  if new.kind = 'note' then return new; end if;

  if new.direction = 'out' and new.sender_kind = 'user' then
    select d.user_id into v_offer from public.crm_dispatches d
     where d.conversation_id = new.conversation_id and d.status in ('waiting', 'offered') limit 1;
    if found then
      perform public.crm_dispatch_mark_accepted(new.conversation_id, coalesce(new.sender_user_id, v_offer));
    end if;
    return new;
  end if;

  if new.direction = 'in'
     and exists (select 1 from public.crm_automation_settings s where s.store_id = new.store_id and s.dispatch_enabled) then
    select * into v_conv from public.crm_conversations where id = new.conversation_id;
    -- com a IA atendendo quem dispara é a passagem; conversa em andamento (alguém da loja
    -- respondeu nas últimas 12 h) não é redistribuída
    if v_conv.handler = 'human' and v_conv.accepted_at is null
       and not exists (select 1 from public.crm_messages m
                        where m.conversation_id = new.conversation_id and m.direction = 'out' and m.sender_kind = 'user'
                          and m.created_at > now() - interval '12 hours') then
      perform public.crm_dispatch_start(new.conversation_id);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.crm_dispatch_on_message() from public, anon, authenticated;
drop trigger if exists crm_messages_dispatch on public.crm_messages;
create trigger crm_messages_dispatch after insert on public.crm_messages
  for each row execute function public.crm_dispatch_on_message();

-- Conversa resolvida ou devolvida para a IA: a próxima vez distribui de novo.
create or replace function public.crm_dispatch_reset()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.status = 'resolved' and old.status <> 'resolved') or (new.handler = 'ai' and old.handler <> 'ai') then
    new.accepted_at := null;
    new.accepted_by := null;
  end if;
  return new;
end;
$$;
drop trigger if exists crm_conversations_dispatch_reset on public.crm_conversations;
create trigger crm_conversations_dispatch_reset before update of status, handler on public.crm_conversations
  for each row execute function public.crm_dispatch_reset();

-- Quem tem telefone para receber o aviso (tela de ajustes; só gerência).
create or replace function public.crm_team_phones(p_store_id uuid)
returns table (user_id uuid, has_phone boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.crm_is_member(p_store_id) and public.crm_is_manager()) then raise exception 'Sem acesso.'; end if;
  return query
    select ms.user_id, public.crm_staff_phone(ms.user_id) is not null
      from public.member_stores ms where ms.store_id = p_store_id;
end;
$$;
revoke all on function public.crm_team_phones(uuid) from public, anon;
grant execute on function public.crm_team_phones(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- pg_cron: relógio a cada minuto; chama a função de envio só se houver aviso
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('crm-dispatch', '* * * * *', $job$
      select public.crm_dispatch_tick()
       where exists (select 1 from public.crm_dispatches where status in ('waiting', 'offered'));
      select net.http_post(
        url := 'https://hzrqtolfbwnmmeliazmh.supabase.co/functions/v1/crm-dispatch',
        headers := jsonb_build_object('Content-Type', 'application/json',
                   'x-crm-internal', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')),
        body := '{"action":"notify"}'::jsonb)
       where exists (select 1 from public.crm_dispatches where notify_status = 'pending')
         and exists (select 1 from vault.decrypted_secrets where name = 'crm_cron_secret');
    $job$);
  end if;
end $$;
