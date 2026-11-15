-- CRM — transcrição dos áudios (a IA "ouve" lendo o texto; a equipe também vê).
alter table public.crm_messages add column if not exists transcript        text;
alter table public.crm_messages add column if not exists transcript_status text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_messages_transcript_status_check') then
    alter table public.crm_messages add constraint crm_messages_transcript_status_check
      check (transcript_status is null or transcript_status in ('done', 'failed', 'empty'));
  end if;
end $$;
