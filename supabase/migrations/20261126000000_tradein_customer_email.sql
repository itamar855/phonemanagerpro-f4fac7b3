-- Simulador de troca: e-mail do cliente na avaliação (pedido do dono, 25/11/2026).
-- Nome e WhatsApp agora são pedidos no começo; e-mail e observação, no fim. Coluna nova, opcional.
alter table public.tradein_evaluations
  add column if not exists customer_email text;

alter table public.tradein_evaluations
  drop constraint if exists tradein_evaluations_customer_email_check;
alter table public.tradein_evaluations
  add constraint tradein_evaluations_customer_email_check
  check (customer_email is null or (length(customer_email) <= 160 and customer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
