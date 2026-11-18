-- =====================================================================
-- Vigia do WhatsApp da loja ("zumbi": mostra open, envia, mas não recebe)
-- A Edge Function crm-watchdog checa a cada 15 min (8h–20h, America/Sao_Paulo)
-- e avisa o admin pelo próprio número, no máximo 1 vez a cada 6 h.
-- Só o servidor (chave de serviço) lê e grava aqui.
-- =====================================================================

-- 1. Última checagem e último aviso, por linha de whatsapp_config
create table if not exists public.whatsapp_watchdog (
  config_id uuid primary key references public.whatsapp_config(id) on delete cascade,
  last_alert_at timestamptz,
  last_inbound_at timestamptz,
  last_state text,
  checked_at timestamptz not null default now()
);
alter table public.whatsapp_watchdog enable row level security;
revoke all on public.whatsapp_watchdog from anon, authenticated;
grant all on public.whatsapp_watchdog to service_role;

-- 2. Celular (55 + DDD + número) do admin que recebe o aviso: de preferência um admin da loja
create or replace function public.whatsapp_watchdog_admin_phone(p_store_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.crm_staff_phone(r.user_id)
    from public.user_roles r
   where r.role::text = 'admin'
     and public.crm_staff_phone(r.user_id) is not null
   order by exists (select 1 from public.member_stores m where m.user_id = r.user_id and m.store_id = p_store_id) desc,
            r.user_id
   limit 1;
$$;
revoke all on function public.whatsapp_watchdog_admin_phone(uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_watchdog_admin_phone(uuid) to service_role;

-- 3. pg_cron: a cada 15 min das 8h às 19h45 de Brasília (11–22 UTC; Brasil sem horário de verão)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('crm-watchdog', '*/15 11-22 * * *', $job$
      select net.http_post(
        url := 'https://hzrqtolfbwnmmeliazmh.supabase.co/functions/v1/crm-watchdog',
        headers := jsonb_build_object('Content-Type', 'application/json',
                   'x-crm-internal', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')),
        body := '{"action":"check"}'::jsonb)
       where exists (select 1 from public.whatsapp_config where is_active)
         and exists (select 1 from vault.decrypted_secrets where name = 'crm_cron_secret');
    $job$);
  end if;
end $$;
