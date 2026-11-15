-- =====================================================================
-- CRM — Fase 3: funil de negócios
-- Etapas ocultáveis (Instagram pausado), totais por etapa e movimentação.
-- =====================================================================

alter table public.crm_stages add column if not exists hidden boolean not null default false;

-- Instagram pausado: esconde as etapas da jornada Insta → WhatsApp (reativar com hidden = false)
update public.crm_stages set hidden = true where code in ('ig_new', 'wa_invited');
update public.crm_stages set name = 'Em atendimento' where code = 'wa_active' and name = 'No WhatsApp (atendimento)';

-- Totais por etapa (quantidade e valor). security invoker: a RLS limita às lojas do usuário.
create or replace function public.crm_pipeline_summary(p_pipeline_id uuid, p_owner_id uuid default null)
returns table (stage_id uuid, deals integer, total numeric)
language sql stable security invoker
set search_path = public
as $$
  select s.id,
         count(d.id)::int,
         coalesce(sum(d.value), 0)
  from public.crm_stages s
  left join public.crm_deals d
    on d.stage_id = s.id
   and (p_owner_id is null or d.owner_id = p_owner_id)
   and (s.kind = 'open' or d.stage_entered_at > now() - interval '30 days')
  where s.pipeline_id = p_pipeline_id
  group by s.id;
$$;

revoke all on function public.crm_pipeline_summary(uuid, uuid) from public, anon;
grant execute on function public.crm_pipeline_summary(uuid, uuid) to authenticated, service_role;
