-- Notificação no celular (Web Push) de mensagem nova no CRM.
-- Cada aparelho que ativa o sino vira uma inscrição. Quem recebe: conversa com dono → o dono e os admins;
-- sem dono → todos com acesso ao CRM daquela loja (crm_can_access).

create table if not exists public.crm_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);
create index if not exists crm_push_subscriptions_user on public.crm_push_subscriptions (user_id);

alter table public.crm_push_subscriptions enable row level security;
revoke all on table public.crm_push_subscriptions from anon;
drop policy if exists crm_push_own_select on public.crm_push_subscriptions;
drop policy if exists crm_push_own_insert on public.crm_push_subscriptions;
drop policy if exists crm_push_own_delete on public.crm_push_subscriptions;
create policy crm_push_own_select on public.crm_push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy crm_push_own_insert on public.crm_push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy crm_push_own_delete on public.crm_push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

-- mensagens picadas: um aviso por conversa a cada 45 s
alter table public.crm_conversations add column if not exists push_notified_at timestamptz;

/** Reserva o aviso: devolve true só para a primeira mensagem da rajada. */
create or replace function public.crm_push_claim(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_ok boolean;
begin
  update public.crm_conversations
     set push_notified_at = now()
   where id = p_conversation_id
     and (push_notified_at is null or push_notified_at < now() - interval '45 seconds')
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;
revoke all on function public.crm_push_claim(uuid) from public, anon, authenticated;
grant execute on function public.crm_push_claim(uuid) to service_role;

create or replace function public.crm_push_recipients(p_conversation_id uuid)
returns table (subscription_id uuid, user_id uuid, endpoint text, p256dh text, auth text)
language sql stable security definer
set search_path = public
as $$
  with conv as (
    select store_id, assigned_to from public.crm_conversations where id = p_conversation_id
  ), people as (
    -- com dono: ele + admins
    select c.assigned_to as uid from conv c where c.assigned_to is not null
    union
    select ur.user_id from public.user_roles ur, conv c where c.assigned_to is not null and ur.role::text = 'admin'
    union
    -- sem dono: todos que acessam o CRM desta loja
    select s.user_id from public.crm_push_subscriptions s, conv c
     where c.assigned_to is null and public.crm_can_access(s.user_id, c.store_id)
  )
  select s.id, s.user_id, s.endpoint, s.p256dh, s.auth
    from public.crm_push_subscriptions s
    join people p on p.uid = s.user_id
    join conv c on true
   where public.crm_can_access(s.user_id, c.store_id);
$$;
revoke all on function public.crm_push_recipients(uuid) from public, anon, authenticated;
grant execute on function public.crm_push_recipients(uuid) to service_role;
