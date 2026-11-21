-- =====================================================================
-- WhatsApp que se corrige sozinho (Fase 1 de estabilidade, 21/11/2026)
-- O vigia (crm-watchdog) passa a rodar a cada 15 min o dia todo e, por instância:
--  * confere o webhook na Evolution e corrige se estiver errado;
--  * lê as mensagens recentes e reenvia ao CRM (replay) as que faltam;
--  * acompanha a última conversa DIRETA recebida (não só grupos);
--  * manda um teste da outra loja quando fica 1 h sem conversa direta no expediente.
-- Só o servidor grava aqui; a gerência lê o resumo por crm_whatsapp_health().
-- =====================================================================

-- 1. Mais campos na saúde por instância
alter table public.whatsapp_watchdog
  add column if not exists last_direct_inbound_at timestamptz,
  add column if not exists last_group_inbound_at timestamptz,
  add column if not exists scanned_at timestamptz,
  add column if not exists webhook_ok boolean,
  add column if not exists webhook_issue text,
  add column if not exists webhook_checked_at timestamptz,
  add column if not exists webhook_fixed_at timestamptz,
  add column if not exists evo_errors integer not null default 0,
  add column if not exists last_error text,
  add column if not exists last_error_at timestamptz,
  add column if not exists last_sync_at timestamptz,
  add column if not exists last_sync_saved integer,
  add column if not exists probe_external_id text,
  add column if not exists probe_sent_at timestamptz,
  add column if not exists probe_from_config uuid,
  add column if not exists probe_ok_at timestamptz,
  add column if not exists owner_number text,
  add column if not exists last_alert_kind text;

-- 2. Registro dos reenvios (não tenta de novo o que já foi tratado)
create table if not exists public.whatsapp_sync_log (
  config_id   uuid not null references public.whatsapp_config(id) on delete cascade,
  external_id text not null,
  result      text not null,
  retry       boolean not null default false,
  attempts    integer not null default 1,
  message_at  timestamptz,
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  primary key (config_id, external_id)
);
create index if not exists whatsapp_sync_log_last_at on public.whatsapp_sync_log (last_at);
alter table public.whatsapp_sync_log enable row level security;
revoke all on public.whatsapp_sync_log from anon, authenticated;
grant all on public.whatsapp_sync_log to service_role;

-- 3. Número de uma loja como contato IGNORADO na outra (o teste entre lojas não vira lead)
create or replace function public.whatsapp_ensure_store_contact(p_store_id uuid, p_phone text, p_label text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.crm_contacts (store_id, name, phone, phone_key, origin_channel, ignored, ignored_reason)
  select p_store_id, 'WhatsApp da outra loja (' || p_label || ')', p_phone, public.crm_phone_key(p_phone), 'manual', true, 'outra loja'
   where p_phone is not null and length(regexp_replace(p_phone, '\D', '', 'g')) >= 10
     and not exists (select 1 from public.crm_contacts c
                      where c.store_id = p_store_id and c.phone_key = public.crm_phone_key(p_phone));
$$;
revoke all on function public.whatsapp_ensure_store_contact(uuid, text, text) from public, anon, authenticated;
grant execute on function public.whatsapp_ensure_store_contact(uuid, text, text) to service_role;

-- 4. Resumo para a tela (gerência): sem chave, sem segredo, sem número completo
create or replace function public.crm_whatsapp_health()
returns table (
  config_id uuid, store_id uuid, store_name text, instance_name text,
  state text, checked_at timestamptz,
  last_inbound_at timestamptz, last_direct_inbound_at timestamptz,
  webhook_ok boolean, webhook_issue text, webhook_fixed_at timestamptz,
  evo_errors integer, last_error text, last_error_at timestamptz,
  last_sync_at timestamptz, synced_24h bigint, lid_pending bigint,
  probe_sent_at timestamptz, probe_ok_at timestamptz,
  last_alert_at timestamptz, last_alert_kind text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.store_id, s.name, c.instance_name,
         w.last_state, w.checked_at,
         w.last_inbound_at, w.last_direct_inbound_at,
         w.webhook_ok, w.webhook_issue, w.webhook_fixed_at,
         coalesce(w.evo_errors, 0), w.last_error, w.last_error_at,
         w.last_sync_at,
         (select count(*) from public.whatsapp_sync_log l
           where l.config_id = c.id and l.result = 'gravada' and l.first_at > now() - interval '24 hours'),
         (select count(*) from public.crm_lid_pending p where p.store_id = c.store_id and p.resolved_at is null),
         w.probe_sent_at, w.probe_ok_at,
         w.last_alert_at, w.last_alert_kind
    from public.whatsapp_config c
    join public.stores s on s.id = c.store_id
    left join public.whatsapp_watchdog w on w.config_id = c.id
   where c.is_active
     and public.crm_is_manager()
     and public.crm_can_access(auth.uid(), c.store_id)
   order by s.name;
$$;
revoke all on function public.crm_whatsapp_health() from public, anon;
grant execute on function public.crm_whatsapp_health() to authenticated, service_role;

-- 5. Vigia o dia todo (a sincronização também vale de noite; avisos continuam só no expediente)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('crm-watchdog', '*/15 * * * *', $job$
      select net.http_post(
        url := 'https://hzrqtolfbwnmmeliazmh.supabase.co/functions/v1/crm-watchdog',
        headers := jsonb_build_object('Content-Type', 'application/json',
                   'x-crm-internal', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')),
        body := '{"action":"check"}'::jsonb,
        timeout_milliseconds := 300000)
       where exists (select 1 from public.whatsapp_config where is_active)
         and exists (select 1 from vault.decrypted_secrets where name = 'crm_cron_secret');
    $job$);
  end if;
end $$;
