-- CRM com duas lojas: quem tem a permissão CRM (ou é admin) atende as conversas de todas as lojas.
-- O resto do sistema (vendas, caixa, estoque) continua preso a member_stores.
-- Configurações do CRM continuam só para gerente (políticas *_manager_write existentes).

-- Regra única, com o usuário explícito (Edge Functions usam com o service_role)
create or replace function public.crm_can_access(p_user uuid, p_store_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select p_user is not null and p_store_id is not null and (
    exists (select 1 from public.member_stores where user_id = p_user and store_id = p_store_id)
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = p_user
        and (ur.role::text = 'admin' or coalesce(ur.permissions ->> 'leads', 'false') = 'true')
    )
  );
$$;
revoke all on function public.crm_can_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_can_access(uuid, uuid) to service_role;

-- Todas as políticas crm_* e o bucket crm_media usam esta função: mudar aqui abre as duas lojas de uma vez
create or replace function public.crm_is_member(p_store_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.crm_can_access((select auth.uid()), p_store_id);
$$;

-- Equipe para atribuir conversas/negócios: membros da loja + todos que atendem o CRM
create or replace function public.crm_team(p_store_id uuid default null)
returns table (user_id uuid, display_name text, role text)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return;
  end if;
  if p_store_id is not null and not public.crm_is_member(p_store_id) then
    return;
  end if;
  return query
  with people as (
    select ms.user_id from public.member_stores ms
    where (p_store_id is null and public.crm_is_member(ms.store_id)) or ms.store_id = p_store_id
    union
    select ur.user_id from public.user_roles ur
    where ur.role::text = 'admin' or coalesce(ur.permissions ->> 'leads', 'false') = 'true'
  )
  select distinct on (pp.user_id)
         pp.user_id,
         coalesce(nullif(btrim(p.display_name), ''), 'Usuário') as display_name,
         (select ur.role::text from public.user_roles ur where ur.user_id = pp.user_id limit 1) as role
  from people pp
  left join public.profiles p on p.user_id = pp.user_id
  order by pp.user_id;
end;
$$;
revoke all on function public.crm_team(uuid) from public, anon;
grant execute on function public.crm_team(uuid) to authenticated, service_role;

-- Gasto com campanhas é dado de relatório: leitura só para gerente/admin
drop policy if exists crm_campaign_spend_member_select on public.crm_campaign_spend;
create policy crm_campaign_spend_member_select on public.crm_campaign_spend
  for select to authenticated using (public.crm_is_member(store_id) and public.crm_is_manager());
