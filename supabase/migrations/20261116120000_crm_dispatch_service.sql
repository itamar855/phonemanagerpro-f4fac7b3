-- =====================================================================
-- CRM — fila de Assistência na distribuição
--
-- Conserto (negócio aberto no funil de assistência ou interesse "conserto")
-- vai primeiro para os técnicos da loja. Se nenhum assumir, segue para a
-- fila de vendas (rodízio); se ninguém de vendas assumir, fica com o dono.
-- Cada loja tem o seu WhatsApp, então cada uma distribui para a própria equipe.
-- =====================================================================

alter table public.crm_automation_settings
  add column if not exists service_members uuid[]  not null default '{}',
  add column if not exists service_cursor  integer not null default 0;

alter table public.crm_dispatches
  add column if not exists queue text;

do $$
begin
  alter table public.crm_dispatches add constraint crm_dispatches_queue_chk check (queue is null or queue in ('service', 'sales', 'owner'));
exception when duplicate_object then null;
end $$;

-- A conversa é de conserto? (negócio aberto no funil de assistência ou com interesse "conserto")
create or replace function public.crm_dispatch_is_service(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.crm_conversations c
      join public.crm_deals d on d.contact_id = c.contact_id and d.status = 'open'
      join public.crm_pipelines p on p.id = d.pipeline_id
     where c.id = p_conversation_id and (p.kind = 'service' or d.interest = 'repair'));
$$;
revoke all on function public.crm_dispatch_is_service(uuid) from public, anon, authenticated;

-- Próxima pessoa de uma fila (na ordem, a partir do cursor) que ainda é da loja,
-- tem telefone e não recebeu nesta rodada. step = quanto andar o cursor.
create or replace function public.crm_dispatch_next(p_store_id uuid, p_members uuid[], p_cursor integer, p_cycle_id uuid)
returns table (user_id uuid, step integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_list uuid[];
  v_n    integer;
  v_u    uuid;
begin
  select array(
           select u.m from unnest(coalesce(p_members, '{}')) with ordinality as u(m, i)
            where exists (select 1 from public.member_stores ms where ms.store_id = p_store_id and ms.user_id = u.m)
              and public.crm_staff_phone(u.m) is not null
            order by u.i)
    into v_list;
  v_n := coalesce(cardinality(v_list), 0);
  for k in 0 .. v_n - 1 loop
    v_u := v_list[((coalesce(p_cursor, 0) + k) % v_n) + 1];
    if not exists (select 1 from public.crm_dispatches d where d.cycle_id = p_cycle_id and d.user_id = v_u and d.status <> 'waiting') then
      user_id := v_u; step := k + 1;
      return next;
      return;
    end if;
  end loop;
end;
$$;
revoke all on function public.crm_dispatch_next(uuid, uuid[], integer, uuid) from public, anon, authenticated;

-- Oferece ao próximo: conserto → técnicos → vendas → dono. Venda → vendas → dono.
create or replace function public.crm_dispatch_offer(p_conversation_id uuid, p_cycle_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv    public.crm_conversations%rowtype;
  s         public.crm_automation_settings%rowtype;
  v_pick    uuid;
  v_step    integer;
  v_queue   text;
  v_owner   uuid;
begin
  select * into v_conv from public.crm_conversations where id = p_conversation_id;
  select * into s from public.crm_automation_settings where store_id = v_conv.store_id;

  if cardinality(s.service_members) > 0 and public.crm_dispatch_is_service(v_conv.id) then
    select n.user_id, n.step into v_pick, v_step
      from public.crm_dispatch_next(v_conv.store_id, s.service_members, s.service_cursor, p_cycle_id) n;
    if v_pick is not null then
      v_queue := 'service';
      update public.crm_automation_settings set service_cursor = service_cursor + v_step where store_id = v_conv.store_id;
    end if;
  end if;

  if v_pick is null then
    select n.user_id, n.step into v_pick, v_step
      from public.crm_dispatch_next(v_conv.store_id, s.round_robin_members, s.round_robin_cursor, p_cycle_id) n;
    if v_pick is not null then
      v_queue := 'sales';
      update public.crm_automation_settings set round_robin_cursor = round_robin_cursor + v_step where store_id = v_conv.store_id;
    end if;
  end if;

  if v_pick is not null then
    insert into public.crm_dispatches (store_id, conversation_id, cycle_id, user_id, queue, status, offered_at, expires_at, notify_status)
    values (v_conv.store_id, v_conv.id, p_cycle_id, v_pick, v_queue, 'offered', now(),
            now() + make_interval(mins => coalesce(s.dispatch_minutes, 5)), 'pending');
    perform public.crm_dispatch_assign(v_conv.id, v_pick);
    insert into public.crm_activities (store_id, contact_id, conversation_id, actor_kind, type, payload)
    values (v_conv.store_id, v_conv.contact_id, v_conv.id, 'system', 'dispatch_offered', jsonb_build_object('user_id', v_pick, 'queue', v_queue));
    return 'offered';
  end if;

  -- ninguém sobrando: fica com o dono e para de repassar
  v_owner := public.crm_dispatch_owner(v_conv.store_id);
  insert into public.crm_dispatches (store_id, conversation_id, cycle_id, user_id, queue, status, offered_at, decided_at, notify_status)
  values (v_conv.store_id, v_conv.id, p_cycle_id, v_owner, 'owner', 'owner', now(), now(),
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
