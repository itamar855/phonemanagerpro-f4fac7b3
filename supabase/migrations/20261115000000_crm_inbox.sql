-- =====================================================================
-- CRM — Fase 2: apoio à Caixa de Entrada
-- crm_team: equipe da loja (para atribuir conversas), só para membros.
-- crm_inbox_counts: contadores das abas, respeitando a RLS de quem chama.
-- =====================================================================

create or replace function public.crm_team(p_store_id uuid default null)
returns table (user_id uuid, display_name text, role text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;
  return query
  select distinct on (ms.user_id)
         ms.user_id,
         coalesce(nullif(btrim(p.display_name), ''), 'Usuário') as display_name,
         (select ur.role::text from public.user_roles ur where ur.user_id = ms.user_id limit 1) as role
  from public.member_stores ms
  left join public.profiles p on p.user_id = ms.user_id
  where (p_store_id is not null and ms.store_id = p_store_id and public.crm_is_member(p_store_id))
     or (p_store_id is null and public.crm_is_member(ms.store_id))
  order by ms.user_id;
end;
$$;

revoke all on function public.crm_team(uuid) from public, anon;
grant execute on function public.crm_team(uuid) to authenticated, service_role;

-- Contadores das abas/filtros (security invoker: a RLS limita às lojas do usuário)
create or replace function public.crm_inbox_counts(p_store_id uuid default null)
returns jsonb
language sql stable security invoker
set search_path = public
as $$
  with base as (
    select v.channel, v.status, v.assigned_to, v.handler, v.unread_count
    from public.crm_conversations v
    join public.crm_contacts c on c.id = v.contact_id
    where not c.ignored
      and (p_store_id is null or v.store_id = p_store_id)
  )
  select jsonb_build_object(
    'all',        count(*) filter (where status <> 'resolved'),
    'whatsapp',   count(*) filter (where status <> 'resolved' and channel = 'whatsapp'),
    'instagram',  count(*) filter (where status <> 'resolved' and channel = 'instagram'),
    'unread_all',       count(*) filter (where status <> 'resolved' and unread_count > 0),
    'unread_whatsapp',  count(*) filter (where status <> 'resolved' and unread_count > 0 and channel = 'whatsapp'),
    'unread_instagram', count(*) filter (where status <> 'resolved' and unread_count > 0 and channel = 'instagram'),
    'mine',       count(*) filter (where status <> 'resolved' and assigned_to = (select auth.uid())),
    'unassigned', count(*) filter (where status <> 'resolved' and assigned_to is null),
    'ai',         count(*) filter (where status <> 'resolved' and handler = 'ai')
  )
  from base;
$$;

revoke all on function public.crm_inbox_counts(uuid) from public, anon;
grant execute on function public.crm_inbox_counts(uuid) to authenticated, service_role;
