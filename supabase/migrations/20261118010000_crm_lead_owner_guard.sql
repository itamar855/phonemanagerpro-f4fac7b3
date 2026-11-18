-- Funil por técnico e "não tomar a vez do outro".
-- 1) Técnico vê e mexe só nos negócios dele (owner_id). Vendedoras e admin veem o funil inteiro.
-- 2) Quem não é gerente não troca o responsável de conversa/negócio que é de OUTRA pessoa.
--    Pegar um lead sem dono e passar adiante o seu continuam livres; o sistema (sem usuário) também.
-- 3) Responder uma conversa que está na vez de outra pessoa (oferta ativa da fila) é recusado no crm-send.

create or replace function public.crm_is_tecnico()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role::text = 'tecnico');
$$;
revoke all on function public.crm_is_tecnico() from public, anon;
grant execute on function public.crm_is_tecnico() to authenticated, service_role;

create or replace function public.crm_user_name(p_user uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce((select nullif(btrim(display_name), '') from public.profiles where user_id = p_user limit 1), 'outra pessoa');
$$;
revoke all on function public.crm_user_name(uuid) from public, anon, authenticated;
grant execute on function public.crm_user_name(uuid) to service_role;

-- ---- 1) negócios do técnico ----
drop policy if exists crm_deals_member_select on public.crm_deals;
drop policy if exists crm_deals_member_insert on public.crm_deals;
drop policy if exists crm_deals_member_update on public.crm_deals;
drop policy if exists crm_deals_member_delete on public.crm_deals;
create policy crm_deals_member_select on public.crm_deals for select to authenticated
  using (public.crm_is_member(store_id) and (not public.crm_is_tecnico() or owner_id = (select auth.uid())));
create policy crm_deals_member_insert on public.crm_deals for insert to authenticated
  with check (public.crm_is_member(store_id) and (not public.crm_is_tecnico() or owner_id = (select auth.uid())));
create policy crm_deals_member_update on public.crm_deals for update to authenticated
  using (public.crm_is_member(store_id) and (not public.crm_is_tecnico() or owner_id = (select auth.uid())))
  with check (public.crm_is_member(store_id));
create policy crm_deals_member_delete on public.crm_deals for delete to authenticated
  using (public.crm_is_member(store_id) and (not public.crm_is_tecnico() or owner_id = (select auth.uid())));

-- técnico criando negócio sem dono: fica dele
create or replace function public.crm_deals_tecnico_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select auth.uid()) is not null and new.owner_id is null and public.crm_is_tecnico() then
    new.owner_id := (select auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists crm_deals_tecnico_owner on public.crm_deals;
create trigger crm_deals_tecnico_owner before insert on public.crm_deals
  for each row execute function public.crm_deals_tecnico_owner();

-- ---- 2) não troca o dono de lead alheio ----
create or replace function public.crm_guard_owner_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_old uuid;
  v_new uuid;
begin
  if tg_table_name = 'crm_deals' then
    v_old := old.owner_id; v_new := new.owner_id;
  else
    v_old := old.assigned_to; v_new := new.assigned_to;
  end if;
  if v_uid is null                     -- sistema: webhook, fila, cron
     or coalesce(current_setting('crm.system_assign', true), '') = 'on'  -- a fila redistribuindo (crm_dispatch_assign)
     or v_new is not distinct from v_old
     or v_old is null                  -- lead sem dono: pode pegar
     or v_old = v_uid                  -- o lead é seu: pode passar adiante
     or public.crm_is_manager() then
    return new;
  end if;
  raise exception 'Este lead é de %. Só o administrador pode transferir.', public.crm_user_name(v_old)
    using errcode = 'P0001';
end;
$$;
revoke all on function public.crm_guard_owner_change() from public, anon, authenticated;

drop trigger if exists crm_conversations_guard_owner on public.crm_conversations;
create trigger crm_conversations_guard_owner before update of assigned_to on public.crm_conversations
  for each row execute function public.crm_guard_owner_change();
drop trigger if exists crm_deals_guard_owner on public.crm_deals;
create trigger crm_deals_guard_owner before update of owner_id on public.crm_deals
  for each row execute function public.crm_guard_owner_change();

-- A fila passa conversa + negócios abertos + tarefas para quem assumiu: troca feita pelo sistema.
-- Quem pode assumir é checado antes, em crm_dispatch_accept.
create or replace function public.crm_dispatch_assign(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact uuid;
begin
  perform set_config('crm.system_assign', 'on', true);
  update public.crm_conversations set assigned_to = p_user_id
   where id = p_conversation_id returning contact_id into v_contact;
  update public.crm_deals set owner_id = p_user_id
   where contact_id = v_contact and status = 'open';
  update public.crm_tasks set assigned_to = p_user_id
   where conversation_id = p_conversation_id and done_at is null and kind = 'reply';
  perform set_config('crm.system_assign', 'off', true);
end;
$$;
revoke all on function public.crm_dispatch_assign(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_dispatch_assign(uuid, uuid) to service_role;

-- "Assumir": só quem está na vez (ou lead sem dono, ou o admin)
create or replace function public.crm_dispatch_accept(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid;
  v_owner uuid;
  v_uid   uuid := (select auth.uid());
begin
  select store_id, assigned_to into v_store, v_owner from public.crm_conversations where id = p_conversation_id;
  if v_store is null or not public.crm_is_member(v_store) then raise exception 'Sem acesso a esta conversa.'; end if;
  if v_owner is not null and v_owner is distinct from v_uid and not public.crm_is_manager() then
    raise exception 'Este lead é de %. Só o administrador pode transferir.', public.crm_user_name(v_owner)
      using errcode = 'P0001';
  end if;
  perform public.crm_dispatch_mark_accepted(p_conversation_id, v_uid);
end;
$$;
revoke all on function public.crm_dispatch_accept(uuid) from public, anon;
grant execute on function public.crm_dispatch_accept(uuid) to authenticated, service_role;

-- ---- 3) responder na vez de outra pessoa (usado pelo crm-send, que roda como service_role) ----
create or replace function public.crm_turn_blocker(p_conversation_id uuid, p_user uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.user_roles ur where ur.user_id = p_user and ur.role::text in ('admin', 'gerente', 'dono')) then null
    when v.assigned_to is null or v.assigned_to = p_user then null
    when exists (select 1 from public.crm_dispatches d
                 where d.conversation_id = v.id and d.status in ('waiting', 'offered') and d.user_id = v.assigned_to)
      then format('Este atendimento está na vez de %s. Aguarde ou peça ao administrador para transferir.', public.crm_user_name(v.assigned_to))
    else null
  end
  from public.crm_conversations v
  where v.id = p_conversation_id;
$$;
revoke all on function public.crm_turn_blocker(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_turn_blocker(uuid, uuid) to service_role;
