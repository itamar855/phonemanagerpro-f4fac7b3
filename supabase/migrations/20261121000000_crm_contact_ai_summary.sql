-- Memória do cliente: resumo escrito pela IA a cada conversa (o que quer, aparelho, valores já passados,
-- o que ficou combinado). Mostrado no painel do contato e usado pela IA nas próximas respostas.
alter table public.crm_contacts
  add column if not exists ai_summary text,
  add column if not exists ai_summary_at timestamptz;
