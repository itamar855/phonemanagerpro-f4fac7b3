-- =====================================================================
-- CRM — o agente aprende com o tempo
-- * crm_ai_examples: biblioteca de perguntas/respostas e fatos da loja
--   (das conversas antigas, das correções da equipe ou manuais)
-- * crm_ai_learning_jobs: leitura das conversas antigas (progresso)
-- * Sugestões guardam a versão final e se foram editadas (métricas)
-- * crm_ai_similar_examples: exemplos parecidos com a mensagem (pg_trgm)
-- =====================================================================

create table if not exists public.crm_ai_examples (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id) on delete cascade,
  kind              text not null default 'qa' check (kind in ('qa', 'fact')),
  topic             text,
  question          text,
  answer            text not null,
  source            text not null default 'manual' check (source in ('history', 'correction', 'manual')),
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  has_price         boolean generated always as (answer ~* 'r\$\s*\d') stored,
  conversation_ref  text,
  uses              integer not null default 0,
  decided_by        uuid references auth.users(id) on delete set null,
  decided_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists crm_ai_examples_store on public.crm_ai_examples (store_id, kind, status, created_at desc);
create index if not exists crm_ai_examples_q_trgm on public.crm_ai_examples using gin (question extensions.gin_trgm_ops);

alter table public.crm_ai_examples enable row level security;
revoke all on table public.crm_ai_examples from anon;
drop policy if exists crm_ai_examples_member_select on public.crm_ai_examples;
drop policy if exists crm_ai_examples_manager_write on public.crm_ai_examples;
create policy crm_ai_examples_member_select on public.crm_ai_examples
  for select to authenticated using (public.crm_is_member(store_id));
create policy crm_ai_examples_manager_write on public.crm_ai_examples
  for all to authenticated
  using (public.crm_is_member(store_id) and public.crm_is_manager())
  with check (public.crm_is_member(store_id) and public.crm_is_manager());

create table if not exists public.crm_ai_learning_jobs (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  status           text not null default 'running' check (status in ('running', 'done', 'failed', 'cancelled')),
  months           integer not null default 4 check (months between 1 and 12),
  chats            jsonb not null default '[]',
  cursor           integer not null default 0,
  total            integer not null default 0,
  processed        integer not null default 0,
  skipped          integer not null default 0,
  examples         integer not null default 0,
  facts            integer not null default 0,
  knowledge_draft  text,
  error            text,
  started_by       uuid references auth.users(id) on delete set null,
  heartbeat_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create index if not exists crm_ai_learning_jobs_store on public.crm_ai_learning_jobs (store_id, created_at desc);

alter table public.crm_ai_learning_jobs enable row level security;
revoke all on table public.crm_ai_learning_jobs from anon;
drop policy if exists crm_ai_learning_jobs_member_select on public.crm_ai_learning_jobs;
create policy crm_ai_learning_jobs_member_select on public.crm_ai_learning_jobs
  for select to authenticated using (public.crm_is_member(store_id));

alter table public.crm_ai_suggestions add column if not exists final_body text;
alter table public.crm_ai_suggestions add column if not exists edited     boolean;

-- Insere exemplo/fato sem duplicar (texto muito parecido já existente é ignorado)
create or replace function public.crm_ai_add_example(
  p_store_id uuid, p_kind text, p_topic text, p_question text, p_answer text,
  p_source text, p_status text default 'pending', p_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if coalesce(btrim(p_answer), '') = '' then return null; end if;
  if exists (
    select 1 from public.crm_ai_examples e
    where e.store_id = p_store_id and e.kind = p_kind and e.status <> 'rejected'
      and (case when p_kind = 'qa'
                then similarity(lower(coalesce(e.question, '')), lower(coalesce(p_question, ''))) > 0.5
                     and similarity(lower(e.answer), lower(p_answer)) > 0.4
                else similarity(lower(e.answer), lower(p_answer)) > 0.6 end)
  ) then
    return null;
  end if;
  insert into public.crm_ai_examples (store_id, kind, topic, question, answer, source, status, conversation_ref)
  values (p_store_id, p_kind, nullif(btrim(p_topic), ''), nullif(btrim(p_question), ''), btrim(p_answer), p_source, p_status, p_ref)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.crm_ai_add_example(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.crm_ai_add_example(uuid, text, text, text, text, text, text, text) to service_role;

-- Exemplos aprovados mais parecidos com a mensagem do cliente
create or replace function public.crm_ai_similar_examples(p_store_id uuid, p_text text, p_limit integer default 5)
returns table (id uuid, question text, answer text, has_price boolean, score real)
language sql stable
security definer
set search_path = public, extensions
as $$
  select e.id, e.question, e.answer, e.has_price,
         greatest(similarity(e.question, p_text), word_similarity(e.question, p_text)) as score
  from public.crm_ai_examples e
  where e.store_id = p_store_id and e.kind = 'qa' and e.status = 'approved' and e.question is not null
    and greatest(similarity(e.question, p_text), word_similarity(e.question, p_text)) > 0.2
  order by score desc, e.source = 'correction' desc, e.created_at desc
  limit greatest(1, least(p_limit, 10));
$$;
revoke all on function public.crm_ai_similar_examples(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.crm_ai_similar_examples(uuid, text, integer) to service_role;

-- Como a equipe está usando as sugestões (security invoker: RLS da loja)
create or replace function public.crm_ai_stats(p_store_id uuid, p_days integer default 30)
returns jsonb
language sql stable security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'sent_as_is', count(*) filter (where s.status = 'sent' and not coalesce(s.edited, false)),
    'sent_edited', count(*) filter (where s.status = 'sent' and s.edited),
    'discarded', count(*) filter (where s.status = 'discarded' and s.decided_by is not null),
    'pending', count(*) filter (where s.status = 'pending'),
    'handoffs', (select count(*) from public.crm_activities a where a.type = 'ai_handoff'
                   and (p_store_id is null or a.store_id = p_store_id) and a.created_at > now() - make_interval(days => p_days)),
    'handoff_won', (select count(distinct d.id) from public.crm_activities a join public.crm_deals d on d.id = a.deal_id
                     where a.type = 'ai_handoff' and d.status = 'won'
                       and (p_store_id is null or a.store_id = p_store_id) and a.created_at > now() - make_interval(days => p_days)),
    'library', (select count(*) from public.crm_ai_examples e where e.status = 'approved' and (p_store_id is null or e.store_id = p_store_id)),
    'to_review', (select count(*) from public.crm_ai_examples e where e.status = 'pending' and (p_store_id is null or e.store_id = p_store_id))
  )
  from public.crm_ai_suggestions s
  where (p_store_id is null or s.store_id = p_store_id) and s.created_at > now() - make_interval(days => p_days);
$$;
revoke all on function public.crm_ai_stats(uuid, integer) from public, anon;
grant execute on function public.crm_ai_stats(uuid, integer) to authenticated, service_role;
