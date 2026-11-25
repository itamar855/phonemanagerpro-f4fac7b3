-- =====================================================================
-- Simulador de troca (trade-in) — módulo separado (src/modules/troca)
--
-- tradein_settings    margem de negociação e arredondamento, por loja
-- tradein_models      tabela de preço base (aparelho perfeito) por modelo e capacidade, por loja
-- tradein_rules       descontos por estado (tela, bateria, carcaça...), por loja
-- tradein_evaluations histórico das avaliações feitas no balcão
--
-- Decisões do dono (25/11/2026): valor = base − descontos; faixa vai do valor até X% abaixo;
-- admin/gerente/dono cuidam da tabela, vendedor só simula; avaliação fica salva com o cliente;
-- "Usar na venda" leva o aparelho para a Nova Venda, que continua dando a entrada no estoque.
-- RLS por loja com app_store_access (admin vê tudo; os demais só as lojas de member_stores).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Funções
-- ---------------------------------------------------------------------

create or replace function public.tradein_is_manager()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role::text in ('admin', 'gerente', 'dono')
  );
$$;
revoke all on function public.tradein_is_manager() from public, anon;
grant execute on function public.tradein_is_manager() to authenticated, service_role;

create or replace function public.tradein_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------

create table if not exists public.tradein_settings (
  store_id         uuid primary key references public.stores(id) on delete cascade,
  negotiation_pct  numeric(5,2) not null default 10 check (negotiation_pct between 0 and 50),
  round_to         integer not null default 10 check (round_to in (1, 5, 10, 50, 100)),
  updated_at       timestamptz not null default now()
);

create table if not exists public.tradein_models (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  brand       text not null check (length(btrim(brand)) between 1 and 40),
  model       text not null check (length(btrim(model)) between 1 and 80),
  storage     text not null default '' check (length(storage) <= 20),
  base_price  numeric(12,2) not null check (base_price >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists tradein_models_uq
  on public.tradein_models (store_id, lower(btrim(brand)), lower(btrim(model)), lower(btrim(storage)));

create table if not exists public.tradein_rules (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  question    text not null check (question in ('tela', 'bateria', 'carcaca', 'biometria', 'conta', 'pecas', 'acessorios')),
  label       text not null check (length(btrim(label)) between 1 and 80),
  kind        text not null check (kind in ('pct', 'fixed', 'block')),  -- % do valor base, R$ fixo ou "não compra"
  amount      numeric(12,2) not null default 0 check (amount >= 0 and (kind <> 'pct' or amount <= 100)),
  position    integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists tradein_rules_store_idx on public.tradein_rules (store_id, question, position);

create table if not exists public.tradein_evaluations (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id) on delete cascade,
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  customer_name   text check (length(customer_name) <= 120),
  customer_phone  text check (length(customer_phone) <= 30),
  model_id        uuid references public.tradein_models(id) on delete set null,
  brand           text not null check (length(btrim(brand)) between 1 and 40),
  model           text not null check (length(btrim(model)) between 1 and 80),
  storage         text not null default '' check (length(storage) <= 20),
  imei            text check (length(imei) <= 20),
  base_price      numeric(12,2) not null check (base_price >= 0),
  answers         jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  discount_total  numeric(12,2) not null default 0 check (discount_total >= 0),
  offer_min       numeric(12,2) not null check (offer_min >= 0),
  offer_max       numeric(12,2) not null,
  blocked         boolean not null default false,
  status          text not null default 'simulada' check (status in ('simulada', 'aceita', 'recusada')),
  agreed_value    numeric(12,2) check (agreed_value >= 0),
  notes           text check (length(notes) <= 500),
  sale_id         uuid references public.sales(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint tradein_evaluations_range check (offer_max >= offer_min),
  constraint tradein_evaluations_blocked_not_accepted check (not (blocked and status = 'aceita')),
  constraint tradein_evaluations_agreed_only_accepted check (agreed_value is null or status = 'aceita')
);
create index if not exists tradein_evaluations_store_created on public.tradein_evaluations (store_id, created_at desc);
create index if not exists tradein_evaluations_sale_idx on public.tradein_evaluations (sale_id) where sale_id is not null;
create index if not exists tradein_evaluations_model_idx on public.tradein_evaluations (model_id) where model_id is not null;
create index if not exists tradein_evaluations_created_by_idx on public.tradein_evaluations (created_by);

drop trigger if exists tradein_settings_touch on public.tradein_settings;
create trigger tradein_settings_touch before update on public.tradein_settings
  for each row execute function public.tradein_touch_updated_at();
drop trigger if exists tradein_models_touch on public.tradein_models;
create trigger tradein_models_touch before update on public.tradein_models
  for each row execute function public.tradein_touch_updated_at();
drop trigger if exists tradein_rules_touch on public.tradein_rules;
create trigger tradein_rules_touch before update on public.tradein_rules
  for each row execute function public.tradein_touch_updated_at();

-- A avaliação é uma foto do momento: quem criou, a loja e o cálculo não mudam depois.
-- Para reavaliar, faz uma nova. Só status, valor fechado, cliente, IMEI, obs. e venda podem mudar.
create or replace function public.tradein_evaluations_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.created_by := (select auth.uid());
    end if;
    new.created_at := now();
  else
    new.store_id       := old.store_id;
    new.created_by     := old.created_by;
    new.created_at     := old.created_at;
    -- só pode virar null (modelo apagado da tabela: on delete set null)
    new.model_id       := case when new.model_id is null then null else old.model_id end;
    new.brand          := old.brand;
    new.model          := old.model;
    new.storage        := old.storage;
    new.base_price     := old.base_price;
    new.answers        := old.answers;
    new.discount_total := old.discount_total;
    new.offer_min      := old.offer_min;
    new.offer_max      := old.offer_max;
    new.blocked        := old.blocked;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists tradein_evaluations_guard on public.tradein_evaluations;
create trigger tradein_evaluations_guard before insert or update on public.tradein_evaluations
  for each row execute function public.tradein_evaluations_guard();

-- ---------------------------------------------------------------------
-- 3. Descontos padrão (sugestões; o gerente ajusta os valores na tela "Tabela")
-- ---------------------------------------------------------------------

create or replace function public.tradein_seed_store(p_store_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_store_id is null then
    return;
  end if;
  insert into public.tradein_settings (store_id) values (p_store_id) on conflict (store_id) do nothing;
  if exists (select 1 from public.tradein_rules where store_id = p_store_id) then
    return;
  end if;
  insert into public.tradein_rules (store_id, question, label, kind, amount, position) values
    (p_store_id, 'tela',       'Perfeita, sem riscos',                       'pct',    0, 1),
    (p_store_id, 'tela',       'Riscos leves',                               'pct',    5, 2),
    (p_store_id, 'tela',       'Trincada ou quebrada',                       'pct',   25, 3),
    (p_store_id, 'tela',       'Manchas, linhas ou toque falhando',          'pct',   30, 4),
    (p_store_id, 'bateria',    '90% ou mais',                                'pct',    0, 1),
    (p_store_id, 'bateria',    '85% a 89%',                                  'pct',    5, 2),
    (p_store_id, 'bateria',    '80% a 84%',                                  'pct',   10, 3),
    (p_store_id, 'bateria',    'Abaixo de 80% ou "Manutenção"',              'pct',   15, 4),
    (p_store_id, 'bateria',    'Não dá para ver a saúde',                    'pct',    5, 5),
    (p_store_id, 'carcaca',    'Perfeita',                                   'pct',    0, 1),
    (p_store_id, 'carcaca',    'Marcas leves de uso',                        'pct',    5, 2),
    (p_store_id, 'carcaca',    'Amassada, trincada ou vidro de trás quebrado', 'pct', 20, 3),
    (p_store_id, 'biometria',  'Face ID / digital funcionando',              'pct',    0, 1),
    (p_store_id, 'biometria',  'Não funciona',                               'pct',   30, 2),
    (p_store_id, 'conta',      'Desvinculada (iCloud / Google fora)',        'pct',    0, 1),
    (p_store_id, 'conta',      'Ainda vinculada ou bloqueada',               'block',  0, 2),
    (p_store_id, 'pecas',      'Tela trocada',                               'pct',   10, 1),
    (p_store_id, 'pecas',      'Bateria trocada (aviso de peça)',            'pct',    5, 2),
    (p_store_id, 'pecas',      'Câmera trocada',                             'pct',   10, 3),
    (p_store_id, 'pecas',      'Outra peça trocada ou já foi aberto',        'pct',    5, 4),
    (p_store_id, 'acessorios', 'Sem a caixa',                                'fixed', 30, 1),
    (p_store_id, 'acessorios', 'Sem o cabo',                                 'fixed', 20, 2);
end;
$$;
revoke all on function public.tradein_seed_store(uuid) from public, anon, authenticated;
grant execute on function public.tradein_seed_store(uuid) to service_role;

-- loja nova já nasce com os descontos padrão
create or replace function public.tradein_on_store_created()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.tradein_seed_store(new.id);
  return new;
end;
$$;
drop trigger if exists tradein_store_seed on public.stores;
create trigger tradein_store_seed after insert on public.stores
  for each row execute function public.tradein_on_store_created();

select public.tradein_seed_store(id) from public.stores;

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------

alter table public.tradein_settings    enable row level security;
alter table public.tradein_models      enable row level security;
alter table public.tradein_rules       enable row level security;
alter table public.tradein_evaluations enable row level security;

revoke all on table public.tradein_settings, public.tradein_models, public.tradein_rules, public.tradein_evaluations from anon;

-- tabela de preço e descontos: a loja lê; admin/gerente/dono da loja alteram
do $$
declare t text;
begin
  foreach t in array array['tradein_settings', 'tradein_models', 'tradein_rules']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_manager_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.app_store_access(store_id))',
                   t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated '
                   'using (public.app_store_access(store_id) and public.tradein_is_manager()) '
                   'with check (public.app_store_access(store_id) and public.tradein_is_manager())',
                   t || '_manager_write', t);
  end loop;
end $$;

-- avaliações: a loja inteira vê e atualiza (outro vendedor pode fechar a venda); apagar só gerente
drop policy if exists tradein_evaluations_read on public.tradein_evaluations;
drop policy if exists tradein_evaluations_insert on public.tradein_evaluations;
drop policy if exists tradein_evaluations_update on public.tradein_evaluations;
drop policy if exists tradein_evaluations_delete on public.tradein_evaluations;
create policy tradein_evaluations_read on public.tradein_evaluations for select to authenticated
  using (public.app_store_access(store_id));
create policy tradein_evaluations_insert on public.tradein_evaluations for insert to authenticated
  with check (public.app_store_access(store_id));
create policy tradein_evaluations_update on public.tradein_evaluations for update to authenticated
  using (public.app_store_access(store_id)) with check (public.app_store_access(store_id));
create policy tradein_evaluations_delete on public.tradein_evaluations for delete to authenticated
  using (public.app_store_access(store_id) and public.tradein_is_manager());
