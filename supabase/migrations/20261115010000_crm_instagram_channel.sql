-- =====================================================================
-- CRM — canal Instagram (API do Instagram com login do Instagram)
-- e fechamento das configurações de canal para o navegador.
-- =====================================================================

-- Segredos dos canais (token do Instagram, chave secreta do app...): só o servidor lê.
create table if not exists public.crm_channel_secrets (
  store_id    uuid not null references public.stores(id) on delete cascade,
  channel     text not null check (channel in ('whatsapp', 'instagram')),
  secrets     jsonb not null default '{}',
  updated_at  timestamptz not null default now(),
  primary key (store_id, channel)
);
alter table public.crm_channel_secrets enable row level security;
revoke all on table public.crm_channel_secrets from anon, authenticated;

-- Dados não secretos da conta do Instagram conectada
alter table public.instagram_config add column if not exists ig_user_id text;
alter table public.instagram_config add column if not exists ig_username text;
alter table public.instagram_config add column if not exists token_expires_at timestamptz;
alter table public.instagram_config add column if not exists webhook_subscribed_at timestamptz;
create unique index if not exists instagram_config_ig_user_uq on public.instagram_config (ig_user_id) where ig_user_id is not null;
create unique index if not exists instagram_config_store_uq on public.instagram_config (store_id);

-- Configurações de canal: o navegador não lê nem grava mais (passa pela função crm-channel).
-- Antes: qualquer usuário logado lia whatsapp_config, inclusive a chave da Evolution.
drop policy if exists "Authenticated can view whatsapp_config" on public.whatsapp_config;
drop policy if exists "Admins can manage whatsapp_config" on public.whatsapp_config;
drop policy if exists "Admins and Managers can manage instagram config" on public.instagram_config;
alter table public.whatsapp_config enable row level security;
alter table public.instagram_config enable row level security;
revoke all on table public.whatsapp_config from anon, authenticated;
revoke all on table public.instagram_config from anon, authenticated;
