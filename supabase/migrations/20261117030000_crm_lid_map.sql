-- =====================================================================
-- Contatos ocultos do WhatsApp (@lid)
-- Depois de ler um QR Code novo (ou com a migração do WhatsApp para LID) a Evolution
-- manda mensagens como "<id>@lid" sem o número (remoteJidAlt/senderPn vazios).
-- 1. crm_lid_map guarda o par lid → telefone sempre que ele aparece.
-- 2. crm_lid_pending guarda a mensagem que não deu para resolver; o webhook a
--    reprocessa quando o par aparecer.
-- Só o servidor (service_role) lê e grava.
-- =====================================================================

create table if not exists public.crm_lid_map (
  store_id   uuid not null references public.stores(id) on delete cascade,
  lid        text not null,                 -- "123456789@lid"
  phone      text not null,                 -- 55 + DDD + número (só dígitos)
  source     text not null default 'message'
             check (source in ('message', 'evolution', 'name')),
  updated_at timestamptz not null default now(),
  primary key (store_id, lid)
);
alter table public.crm_lid_map enable row level security;
revoke all on public.crm_lid_map from anon, authenticated;
grant all on public.crm_lid_map to service_role;

create table if not exists public.crm_lid_pending (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  lid            text not null,
  external_id    text,                      -- id da mensagem no WhatsApp
  from_me        boolean not null default false,
  push_name      text,
  payload        jsonb not null,            -- evento da Evolution sem o base64 da mídia
  received_at    timestamptz not null default now(),
  attempts       int not null default 0,
  last_error     text,
  resolved_at    timestamptz,
  resolved_phone text
);
create unique index if not exists crm_lid_pending_store_external_uq
  on public.crm_lid_pending (store_id, external_id) where external_id is not null;
create index if not exists crm_lid_pending_open
  on public.crm_lid_pending (store_id, lid, received_at) where resolved_at is null;
alter table public.crm_lid_pending enable row level security;
revoke all on public.crm_lid_pending from anon, authenticated;
grant all on public.crm_lid_pending to service_role;

-- Guarda o par. Um palpite pelo nome ('name') nunca troca um par que veio do WhatsApp/Evolution.
-- Devolve quantas mensagens desse lid ainda esperam o número.
create or replace function public.crm_lid_remember(p_store_id uuid, p_lid text, p_phone text, p_source text default 'message')
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_pending int;
begin
  if p_store_id is null or coalesce(p_lid, '') not like '%@lid' or length(v_phone) not between 8 and 15 then
    return 0;
  end if;
  insert into public.crm_lid_map as m (store_id, lid, phone, source, updated_at)
  values (p_store_id, p_lid, v_phone, coalesce(p_source, 'message'), now())
  on conflict (store_id, lid) do update
     set phone = excluded.phone, source = excluded.source, updated_at = now()
   where (m.source = 'name' or excluded.source <> 'name')
     and (m.phone <> excluded.phone or m.source <> excluded.source or m.updated_at < now() - interval '1 day');

  select count(*) into v_pending
    from public.crm_lid_pending
   where store_id = p_store_id and lid = p_lid and resolved_at is null;
  return v_pending;
end $$;

revoke all on function public.crm_lid_remember(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.crm_lid_remember(uuid, text, text, text) to service_role;
