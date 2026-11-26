-- =====================================================================
-- Simulador de troca: link para o cliente ver a avaliação e refazer ele mesmo
--
-- Decisões do dono (26/11/2026):
--   - o link mostra o valor base na loja, cada desconto e o valor (base − descontos,
--     ou o valor combinado); a margem de negociação nunca aparece
--   - o cliente pode refazer as respostas (vira contraproposta, a avaliação da loja
--     não muda), mandar fotos e aceitar a proposta pelo link
--   - o link vale 3 dias
--   - a loja vê um selo no Histórico e ganha uma tarefa no CRM
--
-- tradein_shares: um link por avaliação. O cliente não tem login: tudo passa pelas
-- funções tradein_public_* (security definer), que só aceitam o código do link.
-- O valor do cliente é recalculado aqui no banco a partir das regras da loja.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------

create table if not exists public.tradein_shares (
  evaluation_id          uuid primary key references public.tradein_evaluations(id) on delete cascade,
  store_id               uuid not null references public.stores(id) on delete cascade,
  token                  text not null unique check (token ~ '^[A-Za-z0-9_-]{24}$'),
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  expires_at             timestamptz not null,
  opened_at              timestamptz,
  -- contraproposta do cliente (foto do cálculo no momento em que ele enviou)
  review_answers         jsonb check (review_answers is null or jsonb_typeof(review_answers) = 'array'),
  review_discount_total  numeric(12,2) check (review_discount_total >= 0),
  review_offer           numeric(12,2) check (review_offer >= 0),
  review_blocked         boolean,
  review_note            text check (review_note is null or length(review_note) <= 300),
  review_count           integer not null default 0 check (review_count between 0 and 5),
  reviewed_at            timestamptz,
  -- aceite pelo link (não fecha venda: o vendedor confirma no balcão)
  accepted_at            timestamptz,
  accepted_value         numeric(12,2) check (accepted_value >= 0),
  photo_count            integer not null default 0 check (photo_count between 0 and 4),
  photos_at              timestamptz,
  -- selo "novidade do cliente": activity_at > seen_at
  activity_at            timestamptz,
  seen_at                timestamptz
);
create index if not exists tradein_shares_store_activity on public.tradein_shares (store_id, activity_at desc);

alter table public.tradein_shares enable row level security;
revoke all on table public.tradein_shares from anon;
-- a loja só lê; criar, renovar e marcar como visto é pelas funções abaixo
revoke insert, update, delete on table public.tradein_shares from authenticated;
drop policy if exists tradein_shares_read on public.tradein_shares;
create policy tradein_shares_read on public.tradein_shares for select to authenticated
  using (public.app_store_access(store_id));

-- ---------------------------------------------------------------------
-- 2. Funções internas
-- ---------------------------------------------------------------------

-- 18 bytes aleatórios (gen_random_uuid) em base64 de URL = 24 caracteres
create or replace function public.tradein_new_token()
returns text
language sql volatile
set search_path = public
as $$
  select translate(encode(decode(
    replace(gen_random_uuid()::text, '-', '') || left(replace(gen_random_uuid()::text, '-', ''), 4),
    'hex'), 'base64'), '+/', '-_');
$$;
revoke all on function public.tradein_new_token() from public, anon, authenticated;

create or replace function public.tradein_brl(v numeric)
returns text
language sql immutable
set search_path = public
as $$
  select 'R$ ' || translate(to_char(coalesce(v, 0), 'FM999,999,990'), ',', '.');
$$;
revoke all on function public.tradein_brl(numeric) from public, anon, authenticated;

-- Tarefa no CRM para o vendedor que avaliou. Nunca derruba a ação do cliente.
create or replace function public.tradein_share_task(p_share public.tradein_shares, p_event text, p_title text, p_notes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eval    public.tradein_evaluations;
  v_contact uuid;
begin
  select * into v_eval from public.tradein_evaluations where id = p_share.evaluation_id;
  if v_eval.customer_phone is not null then
    select c.id into v_contact from public.crm_contacts c
     where c.store_id = v_eval.store_id and c.phone_key = public.crm_phone_key(v_eval.customer_phone)
     limit 1;
  end if;
  insert into public.crm_tasks (store_id, title, notes, kind, due_at, assigned_to, contact_id, source, dedupe_key)
  values (p_share.store_id, left(p_title, 200), p_notes, 'follow_up', now(), v_eval.created_by, v_contact,
          'automation', 'tradein:' || p_share.evaluation_id || ':' || p_event)
  on conflict (store_id, dedupe_key) where dedupe_key is not null do nothing;
exception when others then
  raise warning 'tradein_share_task: %', sqlerrm;
end;
$$;
revoke all on function public.tradein_share_task(public.tradein_shares, text, text, text) from public, anon, authenticated;

-- Link aberto para o cliente mexer: existe, não venceu e a troca não foi fechada (recusada continua aberta:
-- é o cliente que não acreditou e quer refazer)
create or replace function public.tradein_share_open(p_token text)
returns public.tradein_shares
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.tradein_shares;
begin
  select s.* into v from public.tradein_shares s
    join public.tradein_evaluations e on e.id = s.evaluation_id
   where s.token = p_token and s.expires_at > now() and e.status <> 'aceita'
   for update of s;
  if v.evaluation_id is null then
    raise exception 'Essa avaliação venceu ou já foi encerrada. Fale com a loja.' using errcode = 'P0001';
  end if;
  return v;
end;
$$;
revoke all on function public.tradein_share_open(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Funções da loja (precisam de login e acesso à loja)
-- ---------------------------------------------------------------------

-- Cria o link (ou renova por mais 3 dias, mantendo o mesmo código)
create or replace function public.tradein_share_create(p_evaluation_id uuid)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_store uuid;
begin
  select e.store_id into v_store from public.tradein_evaluations e where e.id = p_evaluation_id;
  if v_store is null or not public.app_store_access(v_store) then
    raise exception 'Avaliação não encontrada.' using errcode = 'P0001';
  end if;
  return query
  insert into public.tradein_shares as s (evaluation_id, store_id, token, created_by, expires_at)
  values (p_evaluation_id, v_store, public.tradein_new_token(), auth.uid(), now() + interval '3 days')
  on conflict (evaluation_id) do update set expires_at = now() + interval '3 days'
  returning s.token, s.expires_at;
end;
$$;
revoke all on function public.tradein_share_create(uuid) from public, anon;
grant execute on function public.tradein_share_create(uuid) to authenticated, service_role;

create or replace function public.tradein_share_mark_seen(p_evaluation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tradein_shares s set seen_at = now()
   where s.evaluation_id = p_evaluation_id and public.app_store_access(s.store_id);
end;
$$;
revoke all on function public.tradein_share_mark_seen(uuid) from public, anon;
grant execute on function public.tradein_share_mark_seen(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Funções públicas (cliente sem login, só com o código do link)
-- ---------------------------------------------------------------------

-- O que o cliente vê. Sem telefone, e-mail, IMEI, observação interna nem margem.
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
          from public.tradein_rules r where r.store_id = s.store_id and r.active), '[]'::jsonb)
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

-- Contraproposta: o cliente manda os ids das respostas; o banco confere e recalcula.
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
    from public.tradein_rules r where r.id = any(v_ids);
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

-- Aceite da proposta da loja pelo link
create or replace function public.tradein_public_accept(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s       public.tradein_shares;
  e       public.tradein_evaluations;
  v_value numeric;
begin
  s := public.tradein_share_open(p_token);
  select * into e from public.tradein_evaluations where id = s.evaluation_id;
  if e.blocked then
    raise exception 'Com a conta ainda vinculada não dá para aceitar. Fale com a loja.' using errcode = 'P0001';
  end if;
  if s.accepted_at is null then
    v_value := coalesce(e.agreed_value, e.offer_max);
    update public.tradein_shares set accepted_at = now(), accepted_value = v_value, activity_at = now()
     where evaluation_id = s.evaluation_id
     returning * into s;
    perform public.tradein_share_task(s, 'aceite',
      'Troca: ' || coalesce(nullif(e.customer_name, ''), 'cliente') || ' aceitou ' || public.tradein_brl(v_value)
        || ' no ' || e.model || ' ' || e.storage,
      E'O cliente aceitou a proposta pelo link. Chame para fechar a venda.\nVeja em Troca › Histórico.');
  end if;
  return public.tradein_public_get(p_token);
end;
$$;
revoke all on function public.tradein_public_accept(text) from public;
grant execute on function public.tradein_public_accept(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Fotos do cliente (bucket privado tradein-photos, pasta = código do link)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tradein-photos', 'tradein-photos', false, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- pode subir: link aberto, nome <código>/<uuid>.<ext> e menos de 4 fotos na pasta
create or replace function public.tradein_photo_can_upload(p_name text)
returns boolean
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_token text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if p_name !~ '^[A-Za-z0-9_-]{24}/[0-9a-f-]{36}\.(webp|jpg|jpeg|png)$' then return false; end if;
  if not exists (select 1 from public.tradein_shares s join public.tradein_evaluations e on e.id = s.evaluation_id
                  where s.token = v_token and s.expires_at > now() and e.status <> 'aceita') then
    return false;
  end if;
  return (select count(*) from storage.objects o
           where o.bucket_id = 'tradein-photos' and o.name like v_token || '/%') < 4;
end;
$$;
revoke all on function public.tradein_photo_can_upload(text) from public;
grant execute on function public.tradein_photo_can_upload(text) to anon, authenticated, service_role;

-- pode ver: o cliente com o link ainda valendo, ou quem tem acesso à loja
create or replace function public.tradein_photo_can_read(p_name text)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tradein_shares s
     where s.token = split_part(coalesce(p_name, ''), '/', 1)
       and (s.expires_at > now() or public.app_store_access(s.store_id)));
$$;
revoke all on function public.tradein_photo_can_read(text) from public;
grant execute on function public.tradein_photo_can_read(text) to anon, authenticated, service_role;

drop policy if exists tradein_photos_insert on storage.objects;
create policy tradein_photos_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'tradein-photos' and public.tradein_photo_can_upload(name));
drop policy if exists tradein_photos_read on storage.objects;
create policy tradein_photos_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'tradein-photos' and public.tradein_photo_can_read(name));
-- sem update/delete: foto enviada não é trocada pelo link

-- depois de subir, o cliente avisa; o banco reconta as fotos da pasta
create or replace function public.tradein_public_photos_sent(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s       public.tradein_shares;
  e       public.tradein_evaluations;
  v_count integer;
begin
  s := public.tradein_share_open(p_token);
  select least(4, count(*)) into v_count from storage.objects o
   where o.bucket_id = 'tradein-photos' and o.name like s.token || '/%';
  if v_count > s.photo_count then
    update public.tradein_shares set photo_count = v_count, photos_at = now(), activity_at = now()
     where evaluation_id = s.evaluation_id
     returning * into s;
    select * into e from public.tradein_evaluations where id = s.evaluation_id;
    perform public.tradein_share_task(s, 'fotos' || v_count,
      'Troca: ' || coalesce(nullif(e.customer_name, ''), 'cliente') || ' mandou fotos do ' || e.model || ' ' || e.storage,
      v_count || E' foto(s) no link da avaliação.\nVeja em Troca › Histórico.');
  end if;
  return public.tradein_public_get(p_token);
end;
$$;
revoke all on function public.tradein_public_photos_sent(text) from public;
grant execute on function public.tradein_public_photos_sent(text) to anon, authenticated, service_role;
