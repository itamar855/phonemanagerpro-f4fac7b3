-- =====================================================================
-- CRM — Fase 6: relatórios
-- crm_report(): um único JSON com tudo que a tela de relatórios mostra.
-- security invoker: a RLS limita às lojas do usuário. Somente leitura.
-- Também: vínculo do negócio com a venda/OS (crm_deal_link_candidates).
-- =====================================================================

create or replace function public.crm_report(
  p_store_id      uuid,
  p_from          timestamptz,
  p_to            timestamptz,
  p_pipeline_kind text default 'sales'
)
returns jsonb
language sql stable security invoker
set search_path = public
as $$
  with
  st as (
    select s.id, s.kind, s.position, s.hidden, s.name, coalesce(s.code, s.name) as key
    from public.crm_stages s
    join public.crm_pipelines p on p.id = s.pipeline_id
    where p.kind = p_pipeline_kind and not p.archived
      and (p_store_id is null or s.store_id = p_store_id)
  ),
  -- negócios do funil escolhido criados no período
  d as (
    select d.*
    from public.crm_deals d
    join public.crm_pipelines p on p.id = d.pipeline_id and p.kind = p_pipeline_kind
    where (p_store_id is null or d.store_id = p_store_id)
      and d.created_at >= p_from and d.created_at < p_to
  ),
  -- etapas por onde cada negócio passou (inicial + movimentos + atual)
  visited as (
    select d.id as deal_id, d.stage_id from d
    union
    select a.deal_id, (a.payload ->> 'stage_id')::uuid from public.crm_activities a join d on d.id = a.deal_id
     where a.type = 'deal_created' and a.payload ? 'stage_id'
    union
    select a.deal_id, (a.payload ->> 'to')::uuid from public.crm_activities a join d on d.id = a.deal_id
     where a.type in ('stage_changed', 'deal_won', 'deal_lost') and a.payload ? 'to'
  ),
  reached as (
    select v.deal_id, max(st.position) as max_pos
    from visited v join st on st.id = v.stage_id and st.kind in ('open', 'won')
    group by v.deal_id
  ),
  funnel_stages as (
    select key, min(name) as name, min(position) as position, min(kind) as kind
    from st where not hidden and kind in ('open', 'won')
    group by key
  ),
  funnel as (
    select fs.key, fs.name, fs.position, fs.kind,
           (select count(*) from reached r where r.max_pos >= fs.position) as deals
    from funnel_stages fs
  ),
  -- negócios fechados no período (qualquer data de criação)
  closed as (
    select d.*
    from public.crm_deals d
    join public.crm_pipelines p on p.id = d.pipeline_id and p.kind = p_pipeline_kind
    where (p_store_id is null or d.store_id = p_store_id)
      and ((d.status = 'won' and d.won_at >= p_from and d.won_at < p_to)
        or (d.status = 'lost' and d.lost_at >= p_from and d.lost_at < p_to))
  ),
  open_now as (
    select d.*
    from public.crm_deals d
    join public.crm_pipelines p on p.id = d.pipeline_id and p.kind = p_pipeline_kind
    where (p_store_id is null or d.store_id = p_store_id) and d.status = 'open'
  ),
  -- conversas cuja 1ª mensagem caiu no período (ignora importadas antigas)
  conv as (
    select c.id, c.channel, c.assigned_to, c.first_response_at, fm.first_at, fm.first_dir
    from public.crm_conversations c
    join public.crm_contacts ct on ct.id = c.contact_id and not ct.ignored
    cross join lateral (
      select m.created_at as first_at, m.direction as first_dir
      from public.crm_messages m
      where m.conversation_id = c.id and m.kind <> 'note'
      order by m.created_at limit 1
    ) fm
    where (p_store_id is null or c.store_id = p_store_id)
      and fm.first_at >= p_from and fm.first_at < p_to
  ),
  resp as (
    select extract(epoch from (first_response_at - first_at)) / 60.0 as minutes
    from conv where first_dir = 'in' and first_response_at is not null and first_response_at >= first_at
  ),
  days as (
    select g::date as day
    from generate_series((p_from at time zone 'America/Sao_Paulo')::date,
                         ((p_to - interval '1 second') at time zone 'America/Sao_Paulo')::date,
                         interval '1 day') g
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'deals_created',  (select count(*) from d),
      'won',            (select count(*) from closed where status = 'won'),
      'won_value',      (select coalesce(sum(value), 0) from closed where status = 'won'),
      'lost',           (select count(*) from closed where status = 'lost'),
      'open',           (select count(*) from open_now),
      'open_value',     (select coalesce(sum(value), 0) from open_now),
      'avg_days_to_win',(select round(avg(extract(epoch from (won_at - created_at)) / 86400.0)::numeric, 1) from closed where status = 'won'),
      'conversations',  (select count(*) from conv),
      'conv_whatsapp',  (select count(*) from conv where channel = 'whatsapp'),
      'conv_instagram', (select count(*) from conv where channel = 'instagram'),
      'answered',       (select count(*) from resp),
      'unanswered',     (select count(*) from conv where first_dir = 'in' and first_response_at is null),
      'resp_avg_min',   (select round(avg(minutes)::numeric, 1) from resp),
      'resp_median_min',(select round((percentile_cont(0.5) within group (order by minutes))::numeric, 1) from resp),
      'resp_within_15', (select count(*) from resp where minutes <= 15)
    ),
    'funnel', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'name', name, 'kind', kind, 'deals', deals) order by position) from funnel), '[]'),
    'lost_reasons', coalesce((
      select jsonb_agg(jsonb_build_object('reason', reason, 'count', n) order by n desc)
      from (select coalesce(nullif(btrim(lost_reason), ''), 'Sem motivo') as reason, count(*) as n from closed where status = 'lost' group by 1) x
    ), '[]'),
    'by_origin', coalesce((
      select jsonb_agg(jsonb_build_object('origin', origin, 'created', created, 'won', won, 'won_value', won_value) order by created desc)
      from (
        select coalesce(origin_channel, 'manual') as origin, count(*) as created,
               count(*) filter (where status = 'won') as won,
               coalesce(sum(value) filter (where status = 'won'), 0) as won_value
        from d group by 1
      ) x
    ), '[]'),
    'by_owner', coalesce((
      select jsonb_agg(jsonb_build_object('owner_id', owner_id, 'won', won, 'won_value', won_value, 'lost', lost, 'open', open, 'open_value', open_value) order by won_value desc, open desc)
      from (
        select owner_id,
               sum(won) as won, sum(won_value) as won_value, sum(lost) as lost, sum(open) as open, sum(open_value) as open_value
        from (
          select owner_id, (status = 'won')::int as won, case when status = 'won' then value else 0 end as won_value,
                 (status = 'lost')::int as lost, 0 as open, 0::numeric as open_value
          from closed
          union all
          select owner_id, 0, 0, 0, 1, value from open_now
        ) u group by owner_id
      ) x
    ), '[]'),
    'handoff', jsonb_build_object(
      'sent',      (select count(*) from public.crm_deals x where (p_store_id is null or x.store_id = p_store_id) and x.handoff_sent_at >= p_from and x.handoff_sent_at < p_to),
      'completed', (select count(*) from public.crm_deals x where (p_store_id is null or x.store_id = p_store_id) and x.handoff_completed_at >= p_from and x.handoff_completed_at < p_to),
      'avg_hours', (select round(avg(extract(epoch from (handoff_completed_at - handoff_sent_at)) / 3600.0)::numeric, 1)
                    from public.crm_deals x where (p_store_id is null or x.store_id = p_store_id)
                     and x.handoff_completed_at >= p_from and x.handoff_completed_at < p_to and x.handoff_sent_at is not null)
    ),
    'tasks', (
      select jsonb_build_object(
        'created', count(*) filter (where t.created_at >= p_from and t.created_at < p_to),
        'done',    count(*) filter (where t.done_at >= p_from and t.done_at < p_to),
        'done_on_time', count(*) filter (where t.done_at >= p_from and t.done_at < p_to and (t.due_at is null or t.done_at <= t.due_at)),
        'overdue_now',  count(*) filter (where t.done_at is null and t.due_at < now())
      )
      from public.crm_tasks t where (p_store_id is null or t.store_id = p_store_id)
    ),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', to_char(days.day, 'YYYY-MM-DD'),
        'conversations', (select count(*) from conv where (conv.first_at at time zone 'America/Sao_Paulo')::date = days.day),
        'deals_created', (select count(*) from d where (d.created_at at time zone 'America/Sao_Paulo')::date = days.day),
        'won_value',     (select coalesce(sum(value), 0) from closed where status = 'won' and (closed.won_at at time zone 'America/Sao_Paulo')::date = days.day)
      ) order by days.day)
      from days
    ), '[]')
  );
$$;

revoke all on function public.crm_report(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.crm_report(uuid, timestamptz, timestamptz, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Vínculo do negócio com Venda/OS: candidatos do mesmo cliente (por cadastro
-- ou telefone) nos últimos 90 dias. security definer com checagem de loja,
-- devolvendo só o mínimo (sem valores de pagamento ou comissão).
-- ---------------------------------------------------------------------
create or replace function public.crm_deal_link_candidates(p_deal_id uuid)
returns table (kind text, id uuid, label text, amount numeric, happened_at timestamptz)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_deal    public.crm_deals%rowtype;
  v_contact public.crm_contacts%rowtype;
begin
  select d.* into v_deal from public.crm_deals d where d.id = p_deal_id;
  if v_deal.id is null or not public.crm_is_member(v_deal.store_id) then
    raise exception 'Sem acesso a este negócio.';
  end if;
  select c.* into v_contact from public.crm_contacts c where c.id = v_deal.contact_id;

  return query
  select 'sale'::text, sa.id,
         coalesce(nullif(btrim(concat_ws(' ', p.brand, p.model)), ''), p.name, 'Venda')
           || coalesce(' · ' || nullif(btrim(sa.customer_name), ''), ''),
         sa.sale_price, sa.created_at
  from public.sales sa
  left join public.products p on p.id = sa.product_id
  where sa.store_id = v_deal.store_id
    and sa.created_at > now() - interval '90 days'
    and ((v_contact.customer_id is not null and sa.customer_id = v_contact.customer_id)
      or (v_contact.phone_key is not null and public.crm_phone_key(sa.customer_phone) = v_contact.phone_key))
  union all
  select 'service_order'::text, so.id,
         'OS #' || so.order_number || coalesce(' · ' || nullif(btrim(concat_ws(' ', so.device_brand, so.device_model)), ''), ''),
         coalesce(so.final_price, so.estimated_price), so.created_at
  from public.service_orders so
  where so.store_id = v_deal.store_id
    and so.created_at > now() - interval '90 days'
    and so.status <> 'cancelled'
    and ((v_contact.customer_id is not null and so.customer_id = v_contact.customer_id)
      or (v_contact.phone_key is not null and public.crm_phone_key(so.customer_phone) = v_contact.phone_key))
  order by 5 desc
  limit 20;
end;
$$;

revoke all on function public.crm_deal_link_candidates(uuid) from public, anon;
grant execute on function public.crm_deal_link_candidates(uuid) to authenticated, service_role;
