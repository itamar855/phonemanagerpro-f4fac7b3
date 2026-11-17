-- Fase 7 (final): apaga as tabelas do CRM antigo, com autorização expressa do dono em 17/11/2026.
-- Os dados já foram migrados para crm_contacts / crm_messages (20261114200100_crm_import_legacy_leads.sql)
-- e uma cópia em JSON ficou com o dono (backup-leads-antigos-2026-11-17).
-- Nenhuma FK, view, trigger ou cron depende delas; o webhook parou de gravar nelas no PR #28.
begin;

drop table if exists public.lead_responses;
drop table if exists public.lead_messages;
drop table if exists public.leads;

commit;
