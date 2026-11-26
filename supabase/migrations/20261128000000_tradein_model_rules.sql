-- =====================================================================
-- Simulador de troca: desconto próprio de cada aparelho (modelo + capacidade)
--
-- Pedido do dono (26/11/2026): % genérico fica impreciso. A tela de um 8 Plus não custa
-- o mesmo que a de um 15 Pro Max. Cada linha de tradein_models (modelo + capacidade)
-- pode ter o próprio valor (R$ ou %) para qualquer opção de desconto da loja.
-- O que não for preenchido segue o padrão da loja (tradein_rules).
-- "Não compra" (block) não tem valor, então não entra aqui.
--
-- O simulador, o link do cliente (tradein_public_get) e o recálculo da revisão
-- (tradein_public_review) passam a usar tradein_effective_rules.
-- =====================================================================

create table if not exists public.tradein_model_rules (
  model_id    uuid not null references public.tradein_models(id) on delete cascade,
  rule_id     uuid not null references public.tradein_rules(id) on delete cascade,
  store_id    uuid not null references public.stores(id) on delete cascade,
  kind        text not null default 'fixed' check (kind in ('pct', 'fixed')),
  amount      numeric(12,2) not null check (amount >= 0 and (kind <> 'pct' or amount <= 100)),
  updated_at  timestamptz not null default now(),
  primary key (model_id, rule_id)
);
create index if not exists tradein_model_rules_store on public.tradein_model_rules (store_id);
create index if not exists tradein_model_rules_rule on public.tradein_model_rules (rule_id);

-- loja vem do aparelho; a opção tem que ser da mesma loja e não pode ser "Não compra"
create or replace function public.tradein_model_rules_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_model_store uuid;
  v_rule_store  uuid;
  v_rule_kind   text;
begin
  select m.store_id into v_model_store from public.tradein_models m where m.id = new.model_id;
  select r.store_id, r.kind into v_rule_store, v_rule_kind from public.tradein_rules r where r.id = new.rule_id;
  if v_model_store is null or v_rule_store is distinct from v_model_store then
    raise exception 'Aparelho e desconto precisam ser da mesma loja.' using errcode = 'P0001';
  end if;
  if v_rule_kind = 'block' then
    raise exception '"Não compra" não tem valor por aparelho.' using errcode = 'P0001';
  end if;
  new.store_id := v_model_store;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.tradein_model_rules_guard() from public, anon, authenticated;
drop trigger if exists tradein_model_rules_guard on public.tradein_model_rules;
create trigger tradein_model_rules_guard before insert or update on public.tradein_model_rules
  for each row execute function public.tradein_model_rules_guard();

alter table public.tradein_model_rules enable row level security;
revoke all on table public.tradein_model_rules from anon;
drop policy if exists tradein_model_rules_read on public.tradein_model_rules;
create policy tradein_model_rules_read on public.tradein_model_rules for select to authenticated
  using (public.app_store_access(store_id));
drop policy if exists tradein_model_rules_write on public.tradein_model_rules;
create policy tradein_model_rules_write on public.tradein_model_rules for all to authenticated
  using (public.app_store_access(store_id) and public.tradein_is_manager())
  with check (public.app_store_access(store_id) and public.tradein_is_manager());

-- Opções ativas da loja com o valor do aparelho, quando houver (sem aparelho: padrão da loja)
create or replace function public.tradein_effective_rules(p_store_id uuid, p_model_id uuid)
returns table (id uuid, question text, label text, kind text, amount numeric, "position" integer)
language sql stable
security definer
set search_path = public
as $$
  select r.id, r.question, r.label,
         case when r.kind = 'block' then r.kind else coalesce(o.kind, r.kind) end,
         case when r.kind = 'block' then r.amount else coalesce(o.amount, r.amount) end,
         r.position
    from public.tradein_rules r
    left join public.tradein_model_rules o on o.rule_id = r.id and o.model_id = p_model_id
   where r.store_id = p_store_id and r.active;
$$;
revoke all on function public.tradein_effective_rules(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Link do cliente: mesmas funções de 20261127000000, agora com o valor do aparelho
-- ---------------------------------------------------------------------

create or replace function public.tradein_public_get(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s       public.tradein_shares;
  e       public.tradein_evaluations;
  v_store text;
  v_round integer;
  v_open  boolean;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{24}$' then return null; end if;
  select * into s from public.tradein_shares where token = p_token;
  if s.evaluation_id is null then return null; end if;
  select * into e from public.tradein_evaluations where id = s.evaluation_id;
  select st.name into v_store from public.stores st where st.id = s.store_id;
  select ts.round_to into v_round from public.tradein_settings ts where ts.store_id = s.store_id;

  if s.opened_at is null then
    update public.tradein_shares set opened_at = now() where evaluation_id = s.evaluation_id;
  end if;

  v_open := s.expires_at > now() and e.status <> 'aceita';
  return jsonb_build_object(
    'store_name', coalesce(v_store, 'Loja'),
    'customer_first_name', nullif(split_part(btrim(coalesce(e.customer_name, '')), ' ', 1), ''),
    'brand', e.brand, 'model', e.model, 'storage', e.storage,
    'base_price', e.base_price,
    'answers', e.answers,
    'discount_total', e.discount_total,
    'offer', case when e.blocked then 0 else coalesce(e.agreed_value, e.offer_max) end,
    'agreed', e.agreed_value is not null,
    'blocked', e.blocked,
    'evaluated_at', e.created_at,
    'expires_at', s.expires_at,
    'status', case when e.status = 'aceita' then 'encerrada' when s.expires_at <= now() then 'vencida' else 'aberta' end,
    'round_to', coalesce(v_round, 10),
    'rules', case when v_open then coalesce((
        select jsonb_agg(jsonb_build_object('id', r.id, 'question', r.question, 'label', r.label,
                                            'kind', r.kind, 'amount', r.amount, 'position', r.position)
                         order by r.question, r.position)
          from public.tradein_effective_rules(s.store_id, e.model_id) r), '[]'::jsonb)
      else '[]'::jsonb end,
    'review', case when s.reviewed_at is null then null else jsonb_build_object(
        'answers', s.review_answers, 'discount_total', s.review_discount_total, 'offer', s.review_offer,
        'blocked', s.review_blocked, 'note', s.review_note, 'reviewed_at', s.reviewed_at) end,
    'reviews_left', 5 - s.review_count,
    'accepted_at', s.accepted_at,
    'accepted_value', s.accepted_value,
    'photo_count', s.photo_count,
    'photos_left', 4 - s.photo_count
  );
end;
$$;
revoke all on function public.tradein_public_get(text) from public;
grant execute on function public.tradein_public_get(text) to anon, authenticated, service_role;

create or replace function public.tradein_public_review(p_token text, p_rule_ids uuid[], p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.tradein_shares;
  e        public.tradein_evaluations;
  v_ids    uuid[] := coalesce((select array_agg(distinct x) from unnest(p_rule_ids) x where x is not null), '{}');
  v_found  integer;
  v_lines  jsonb;
  v_disc   numeric;
  v_block  boolean;
  v_offer  numeric;
  v_round  integer;
  v_note   text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
  v_miss   text;
begin
  s := public.tradein_share_open(p_token);
  if s.review_count >= 5 then
    raise exception 'Você já revisou 5 vezes. Fale com a loja.' using errcode = 'P0001';
  end if;
  select * into e from public.tradein_evaluations where id = s.evaluation_id;

  select count(*) into v_found from public.tradein_rules r
   where r.id = any(v_ids) and r.store_id = s.store_id and r.active;
  if v_found <> cardinality(v_ids) then
    raise exception 'A tabela da loja mudou. Recarregue a página.' using errcode = 'P0001';
  end if;
  -- perguntas de uma resposta só: no máximo uma, e todas respondidas
  if exists (select 1 from public.tradein_rules r where r.id = any(v_ids)
               and r.question not in ('pecas', 'acessorios')
             group by r.question having count(*) > 1) then
    raise exception 'Escolha só uma resposta por pergunta.' using errcode = 'P0001';
  end if;
  select string_agg(distinct q.question, ', ') into v_miss
    from public.tradein_rules q
   where q.store_id = s.store_id and q.active and q.question not in ('pecas', 'acessorios')
     and not exists (select 1 from public.tradein_rules r where r.id = any(v_ids) and r.question = q.question);
  if v_miss is not null then
    raise exception 'Responda todas as perguntas (falta: %).', v_miss using errcode = 'P0001';
  end if;

  -- mesmo cálculo do simulador (src/modules/troca/lib/calc.ts): % sobre o preço base, somando
  select coalesce(jsonb_agg(jsonb_build_object(
           'question', r.question, 'label', r.label, 'kind', r.kind, 'amount', r.amount,
           'value', case r.kind when 'pct' then round(e.base_price * r.amount / 100, 2)
                                when 'fixed' then round(r.amount, 2) else 0 end)
           order by array_position(array['conta','tela','bateria','carcaca','biometria','pecas','acessorios'], r.question), r.position),
         '[]'::jsonb),
         coalesce(sum(case r.kind when 'pct' then round(e.base_price * r.amount / 100, 2)
                                  when 'fixed' then round(r.amount, 2) else 0 end), 0),
         coalesce(bool_or(r.kind = 'block'), false)
    into v_lines, v_disc, v_block
    from public.tradein_effective_rules(s.store_id, e.model_id) r where r.id = any(v_ids);
  v_disc := least(e.base_price, v_disc);
  select coalesce(ts.round_to, 10) into v_round from public.tradein_settings ts where ts.store_id = s.store_id;
  v_round := coalesce(v_round, 10);
  v_offer := case when v_block or e.base_price - v_disc <= 0 then 0
                  else floor((e.base_price - v_disc) / v_round + 1e-9) * v_round end;

  update public.tradein_shares set
    review_answers = v_lines, review_discount_total = v_disc, review_offer = v_offer,
    review_blocked = v_block, review_note = v_note, review_count = review_count + 1,
    reviewed_at = now(), activity_at = now()
   where evaluation_id = s.evaluation_id
   returning * into s;

  perform public.tradein_share_task(s, 'revisao' || s.review_count,
    'Troca: ' || coalesce(nullif(e.customer_name, ''), 'cliente') || ' revisou a avaliação do ' || e.model || ' ' || e.storage,
    'Loja: ' || public.tradein_brl(case when e.blocked then 0 else coalesce(e.agreed_value, e.offer_max) end)
      || ' · Cliente: ' || public.tradein_brl(v_offer)
      || coalesce(E'\nRecado: ' || v_note, '')
      || E'\nVeja o que ele mudou em Troca › Histórico.');

  return public.tradein_public_get(p_token);
end;
$$;
revoke all on function public.tradein_public_review(text, uuid[], text) from public;
grant execute on function public.tradein_public_review(text, uuid[], text) to anon, authenticated, service_role;
