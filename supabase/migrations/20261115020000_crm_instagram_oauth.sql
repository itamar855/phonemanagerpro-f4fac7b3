-- =====================================================================
-- CRM — login oficial do Instagram (OAuth "Business Login for Instagram")
-- Estados temporários do fluxo de autorização: só o servidor lê e grava.
-- =====================================================================

create table if not exists public.crm_oauth_states (
  state       text primary key,
  store_id    uuid not null references public.stores(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  provider    text not null default 'instagram',
  return_to   text not null,
  created_at  timestamptz not null default now()
);
create index if not exists crm_oauth_states_created on public.crm_oauth_states (created_at);
alter table public.crm_oauth_states enable row level security;
revoke all on table public.crm_oauth_states from anon, authenticated;
