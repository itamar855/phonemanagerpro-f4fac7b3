-- =====================================================================
-- CRM — Fase 4: agente de IA (atende, qualifica e passa para o humano)
-- * Configuração ampliada (tom, modelo, limite de turnos, canais)
-- * crm_ai_suggestions: respostas em modo rascunho, aprovadas por pessoas
-- * Conversa nova nasce com a IA quando o agente está ligado
-- * crm_pick_assignee: próximo do rodízio (usado também pela IA)
-- * crm_ai_handoff: cria o negócio + tarefa e devolve a conversa ao humano
-- =====================================================================

alter table public.crm_ai_settings add column if not exists persona           text;
alter table public.crm_ai_settings add column if not exists model             text;
alter table public.crm_ai_settings add column if not exists max_turns         integer not null default 8;
alter table public.crm_ai_settings add column if not exists enabled_channels  text[] not null default '{whatsapp}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_ai_settings_max_turns_check') then
    alter table public.crm_ai_settings add constraint crm_ai_settings_max_turns_check check (max_turns between 1 and 30);
  end if;
end $$;

insert into public.crm_ai_settings (store_id) select id from public.stores on conflict do nothing;

-- ---------------------------------------------------------------------
-- Sugestões (modo rascunho)
-- ---------------------------------------------------------------------
create table if not exists public.crm_ai_suggestions (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  conversation_id  uuid not null references public.crm_conversations(id) on delete cascade,
  run_id           uuid references public.crm_ai_runs(id) on delete set null,
  kind             text not null default 'reply' check (kind in ('reply', 'handoff')),
  body             text not null,
  status           text not null default 'pending' check (status in ('pending', 'sent', 'discarded')),
  decided_by       uuid references auth.users(id) on delete set null,
  decided_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists crm_ai_suggestions_conv on public.crm_ai_suggestions (conversation_id, status, created_at desc);

alter table public.crm_ai_suggestions enable row level security;
revoke all on table public.crm_ai_suggestions from anon;
drop policy if exists crm_ai_suggestions_member_select on public.crm_ai_suggestions;
drop policy if exists crm_ai_suggestions_member_discard on public.crm_ai_suggestions;
create policy crm_ai_suggestions_member_select on public.crm_ai_suggestions
  for select to authenticated using (public.crm_is_member(store_id));
-- pelo app só se descarta; enviar passa pelo servidor (crm-send)
create policy crm_ai_suggestions_member_discard on public.crm_ai_suggestions
  for update to authenticated
  using (public.crm_is_member(store_id) and status = 'pending')
  with check (public.crm_is_member(store_id) and status = 'discarded' and decided_by = (select auth.uid()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crm_ai_suggestions') then
    alter publication supabase_realtime add table public.crm_ai_suggestions;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Rodízio reutilizável
-- ---------------------------------------------------------------------
create or replace function public.crm_pick_assignee(p_store_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_members uuid[];
  v_cursor  integer;
begin
  select array(
           select u.m from unnest(s.round_robin_members) with ordinality as u(m, i)
           where exists (select 1 from public.member_stores ms where ms.store_id = s.store_id and ms.user_id = u.m)
           order by u.i)
    into v_members
  from public.crm_automation_settings s
  where s.store_id = p_store_id and s.round_robin;

  if coalesce(cardinality(v_members), 0) = 0 then
    return null;
  end if;

  update public.crm_automation_settings
     set round_robin_cursor = round_robin_cursor + 1
   where store_id = p_store_id
  returning round_robin_cursor - 1 into v_cursor;

  return v_members[(v_cursor % cardinality(v_members)) + 1];
end;
$$;
revoke all on function public.crm_pick_assignee(uuid) from public, anon, authenticated;
grant execute on function public.crm_pick_assignee(uuid) to service_role;

-- Conversa nova: rodízio + IA quando o agente está ligado para o canal
create or replace function public.crm_conversations_round_robin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ignored boolean;
begin
  if new.status = 'resolved' then
    return new;
  end if;
  select ignored into v_ignored from public.crm_contacts where id = new.contact_id;
  if coalesce(v_ignored, false) then
    return new;
  end if;

  if exists (select 1 from public.crm_ai_settings a
             where a.store_id = new.store_id and a.mode <> 'off' and new.channel = any (a.enabled_channels)) then
    new.handler := 'ai';
  end if;

  if new.assigned_to is null then
    new.assigned_to := public.crm_pick_assignee(new.store_id);
  end if;
  return new;
end;
$$;
revoke all on function public.crm_conversations_round_robin() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Passagem para o humano
-- ---------------------------------------------------------------------
create or replace function public.crm_ai_handoff(
  p_conversation_id uuid,
  p_title           text,
  p_summary         text,
  p_score           text    default null,
  p_interest        text    default null,
  p_reason          text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv     public.crm_conversations%rowtype;
  v_contact  public.crm_contacts%rowtype;
  v_pipe     uuid;
  v_stage    uuid;
  v_owner    uuid;
  v_deal     uuid;
  v_kind     text := case when p_interest = 'repair' then 'service' else 'sales' end;
begin
  select * into v_conv from public.crm_conversations where id = p_conversation_id for update;
  if v_conv.id is null then raise exception 'Conversa não encontrada.'; end if;
  select * into v_contact from public.crm_contacts where id = v_conv.contact_id;

  v_owner := coalesce(v_conv.assigned_to, public.crm_pick_assignee(v_conv.store_id));

  -- negócio aberto já existente do contato: atualiza em vez de duplicar
  select d.id into v_deal from public.crm_deals d
   where d.contact_id = v_contact.id and d.status = 'open'
   order by d.created_at desc limit 1;

  if v_deal is null then
    select p.id into v_pipe from public.crm_pipelines p
     where p.store_id = v_conv.store_id and p.kind = v_kind and not p.archived
     order by p.is_default desc, p.position limit 1;
    if v_pipe is null then
      select p.id into v_pipe from public.crm_pipelines p
       where p.store_id = v_conv.store_id and not p.archived order by p.is_default desc, p.position limit 1;
    end if;
    select s.id into v_stage from public.crm_stages s
     where s.pipeline_id = v_pipe and s.kind = 'open' and not s.hidden
     order by s.position limit 1;

    insert into public.crm_deals (store_id, pipeline_id, stage_id, contact_id, title, interest, owner_id,
                                  origin_channel, ai_summary, ai_score)
    values (v_conv.store_id, v_pipe, v_stage, v_contact.id,
            coalesce(nullif(btrim(p_title), ''), v_contact.name),
            case when p_interest in ('device', 'repair', 'accessory', 'other') then p_interest end,
            v_owner, v_contact.origin_channel, p_summary,
            case when p_score in ('hot', 'warm', 'cold') then p_score end)
    returning id into v_deal;
  else
    update public.crm_deals set
      ai_summary = p_summary,
      ai_score   = coalesce(case when p_score in ('hot', 'warm', 'cold') then p_score end, ai_score),
      owner_id   = coalesce(owner_id, v_owner)
    where id = v_deal;
  end if;

  update public.crm_conversations set
    handler = 'human',
    assigned_to = coalesce(assigned_to, v_owner),
    status = case when status = 'resolved' then 'open' else status end
  where id = v_conv.id;

  insert into public.crm_tasks (store_id, title, notes, kind, due_at, assigned_to, contact_id, deal_id, conversation_id, source, dedupe_key)
  values (v_conv.store_id, 'Assumir atendimento: ' || v_contact.name, p_summary, 'reply', now(), v_owner,
          v_contact.id, v_deal, v_conv.id, 'ai', 'ai_handoff:' || v_conv.id || ':' || floor(extract(epoch from now()))::bigint)
  on conflict (store_id, dedupe_key) where dedupe_key is not null do nothing;

  insert into public.crm_activities (store_id, contact_id, deal_id, conversation_id, actor_kind, type, payload)
  values (v_conv.store_id, v_contact.id, v_deal, v_conv.id, 'ai', 'ai_handoff',
          jsonb_build_object('reason', p_reason, 'score', p_score, 'summary', p_summary));

  return jsonb_build_object('deal_id', v_deal, 'owner_id', v_owner);
end;
$$;
revoke all on function public.crm_ai_handoff(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.crm_ai_handoff(uuid, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------
-- Ligar/desligar a IA numa conversa (qualquer membro da loja)
-- ---------------------------------------------------------------------
create or replace function public.crm_set_conversation_handler(p_conversation_id uuid, p_handler text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_store uuid;
begin
  if p_handler not in ('ai', 'human') then raise exception 'Valor inválido.'; end if;
  select store_id into v_store from public.crm_conversations where id = p_conversation_id;
  if v_store is null or not public.crm_is_member(v_store) then raise exception 'Sem acesso a esta conversa.'; end if;
  update public.crm_conversations set handler = p_handler where id = p_conversation_id;
  if p_handler = 'human' then
    update public.crm_ai_suggestions set status = 'discarded', decided_by = (select auth.uid()), decided_at = now()
     where conversation_id = p_conversation_id and status = 'pending';
  end if;
  insert into public.crm_activities (store_id, conversation_id, contact_id, actor_kind, actor_id, type, payload)
  select v_store, c.id, c.contact_id, 'user', (select auth.uid()), 'ai_' || case when p_handler = 'ai' then 'enabled' else 'disabled' end, '{}'
  from public.crm_conversations c where c.id = p_conversation_id;
end;
$$;
revoke all on function public.crm_set_conversation_handler(uuid, text) from public, anon;
grant execute on function public.crm_set_conversation_handler(uuid, text) to authenticated, service_role;
