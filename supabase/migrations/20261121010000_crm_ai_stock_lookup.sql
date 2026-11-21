-- A IA do CRM consulta o estoque à venda (aparelhos e acessórios, preço de venda) para responder
-- preço e disponibilidade. Ligado por padrão; a gerência desliga por loja em Configurações → IA.
alter table public.crm_ai_settings
  add column if not exists stock_lookup boolean not null default true;
