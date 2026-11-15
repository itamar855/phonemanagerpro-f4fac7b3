-- =====================================================================
-- CRM — assistência: o funil acompanha a OS sozinho
-- * crm_sync_service_orders(): a cada 5 min (pg_cron), só LÊ service_orders:
--     OS nova do mesmo cliente  → vincula ao negócio de conserto aberto e move para "Aprovado / em reparo"
--     OS entregue               → "Concluído" com o valor final da OS (dispara o Purchase para a Meta)
--     OS cancelada              → "Perdido" (motivo: OS cancelada)
--   OS aberta no balcão sem negócio no CRM não cria nada.
-- * crm_automation_settings.os_sync liga/desliga
-- * crm_tracking_report ganha o filtro Conserto / Aparelho
-- =====================================================================

alter table public.crm_automation_settings add column if not exists os_sync boolean not null default true;

create or replace function public.crm_sync_service_orders(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  v_linked   integer := 0;
  v_won      integer := 0;
  v_lost     integer := 0;
  v_stage    uuid;
begin
  -- 1. OS nova (últimos 30 dias, não cancelada, ainda sem negócio) → negócio de conserto aberto do mesmo cliente
  for r in
    select distinct on (so.id) so.id as os_id, so.status as os_status, d.id as deal_id, d.pipeline_id, st.position as cur_pos
    from public.service_orders so
    join public.crm_automation_settings s on s.store_id = so.store_id and s.os_sync
    join public.crm_contacts c on c.store_id = so.store_id
      and ((so.customer_id is not null and c.customer_id = so.customer_id)
        or (c.phone_key is not null and c.phone_key = public.crm_phone_key(so.customer_phone)))
    join public.crm_deals d on d.contact_id = c.id and d.status = 'open' and d.service_order_id is null
      and d.created_at <= so.created_at + interval '1 day'
    join public.crm_pipelines p on p.id = d.pipeline_id
    join public.crm_stages st on st.id = d.stage_id
    where so.created_at > p_now - interval '30 days'
      and so.status <> 'cancelled'
      and (p.kind = 'service' or d.interest = 'repair')
      and not exists (select 1 from public.crm_deals x where x.service_order_id = so.id)
    order by so.id, d.created_at desc
  loop
    -- o mesmo negócio pode ter casado com mais de uma OS: fica com a primeira
    if exists (select 1 from public.crm_deals where id = r.deal_id and service_order_id is not null) then continue; end if;
    select s2.id into v_stage from public.crm_stages s2
     where s2.pipeline_id = r.pipeline_id and s2.code = 'svc_approved';
    update public.crm_deals set
      service_order_id = r.os_id,
      stage_id = case when v_stage is not null and r.cur_pos < (select position from public.crm_stages where id = v_stage) then v_stage else stage_id end
    where id = r.deal_id;
    insert into public.crm_activities (store_id, contact_id, deal_id, actor_kind, type, payload)
    select d.store_id, d.contact_id, d.id, 'system', 'os_linked', jsonb_build_object('service_order_id', r.os_id)
    from public.crm_deals d where d.id = r.deal_id;
    v_linked := v_linked + 1;
  end loop;

  -- 2. OS entregue → Concluído com o valor da OS
  for r in
    select d.id as deal_id, d.pipeline_id, coalesce(nullif(so.final_price, 0), nullif(so.estimated_price, 0), d.value) as amount
    from public.crm_deals d
    join public.service_orders so on so.id = d.service_order_id
    join public.crm_automation_settings s on s.store_id = d.store_id and s.os_sync
    where d.status = 'open' and so.status = 'delivered'
  loop
    select id into v_stage from public.crm_stages where pipeline_id = r.pipeline_id and kind = 'won' order by position limit 1;
    if v_stage is null then continue; end if;
    -- valor e etapa juntos: o evento Purchase sai com o valor certo
    update public.crm_deals set stage_id = v_stage, value = coalesce(r.amount, 0) where id = r.deal_id;
    v_won := v_won + 1;
  end loop;

  -- 3. OS cancelada → Perdido
  for r in
    select d.id as deal_id, d.pipeline_id
    from public.crm_deals d
    join public.service_orders so on so.id = d.service_order_id
    join public.crm_automation_settings s on s.store_id = d.store_id and s.os_sync
    where d.status = 'open' and so.status = 'cancelled'
  loop
    select id into v_stage from public.crm_stages where pipeline_id = r.pipeline_id and kind = 'lost' order by position limit 1;
    if v_stage is null then continue; end if;
    update public.crm_deals set stage_id = v_stage, lost_reason = 'OS cancelada' where id = r.deal_id;
    v_lost := v_lost + 1;
  end loop;

  return jsonb_build_object('linked', v_linked, 'won', v_won, 'lost', v_lost);
end;
$$;
revoke all on function public.crm_sync_service_orders(timestamptz) from public, anon, authenticated;
grant execute on function public.crm_sync_service_orders(timestamptz) to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule('crm-os-sync', '*/5 * * * *', 'select public.crm_sync_service_orders()');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Relatório por campanha com filtro: null = tudo, 'repair' = conserto, 'sales' = aparelho/acessório
-- ---------------------------------------------------------------------
drop function if exists public.crm_tracking_report(uuid, timestamptz, timestamptz);
create or replace function public.crm_tracking_report(p_store_id uuid, p_from timestamptz, p_to timestamptz, p_kind text default null)
returns table (source text, campaign text, adset text, ad text, contacts integer, replied integer, qualified integer, won integer, revenue numeric)
language sql stable security invoker
set search_path = public
as $$
  with dk as (
    -- negócios com o tipo: conserto (funil de assistência ou interesse conserto) ou venda
    select d.*, case when p.kind = 'service' or d.interest = 'repair' then 'repair' else 'sales' end as k
    from public.crm_deals d join public.crm_pipelines p on p.id = d.pipeline_id
  ),
  a as (
    select c.id as contact_id, c.created_at,
           case at.kind when 'link' then 'Link de rastreio' when 'ctwa' then 'Anúncio → WhatsApp'
                        when 'code' then 'Anúncio (código)'
                        when 'manual' then case when at.utm_medium = 'paid' then 'Anúncio → Instagram' else 'Instagram' end
                        else 'Orgânico' end as source,
           coalesce(nullif(at.utm_campaign, ''), case when at.kind = 'ctwa' then coalesce(at.ad_title, 'Anúncio') end,
                    case when at.kind = 'manual' then replace(at.entry_point, 'instagram_', 'Instagram · ') end, '—') as campaign,
           coalesce(nullif(at.utm_term, ''), '—') as adset,
           coalesce(nullif(at.utm_content, ''), at.ad_id, at.ad_source_id, case when at.kind = 'organic' then at.entry_point end, '—') as ad
    from public.crm_contacts c
    join public.crm_attributions at on at.id = c.attribution_id
    where (p_store_id is null or c.store_id = p_store_id)
      and c.created_at >= p_from and c.created_at < p_to
      and (p_kind is null or exists (select 1 from dk where dk.contact_id = c.id and dk.k = p_kind))
  )
  select a.source, a.campaign, a.adset, a.ad,
         count(distinct a.contact_id)::int,
         count(distinct a.contact_id) filter (where exists (
           select 1 from public.crm_messages m where m.contact_id = a.contact_id and m.direction = 'in' and m.kind <> 'note'))::int,
         count(distinct d.contact_id) filter (where d.ai_summary is not null or s.code in ('proposal', 'svc_quote', 'svc_approved') or d.status = 'won')::int,
         count(distinct d.id) filter (where d.status = 'won')::int,
         coalesce(sum(d.value) filter (where d.status = 'won'), 0)
  from a
  left join dk d on d.contact_id = a.contact_id and (p_kind is null or d.k = p_kind)
  left join public.crm_stages s on s.id = d.stage_id
  group by 1, 2, 3, 4
  order by 9 desc, 5 desc;
$$;
revoke all on function public.crm_tracking_report(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.crm_tracking_report(uuid, timestamptz, timestamptz, text) to authenticated, service_role;
