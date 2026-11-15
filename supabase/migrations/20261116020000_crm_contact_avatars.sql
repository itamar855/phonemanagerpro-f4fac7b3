-- CRM — foto de perfil do WhatsApp nos contatos.
-- avatar_url guarda o link do WhatsApp (expira); avatar_checked_at evita
-- consultar a Evolution a cada mensagem de quem não tem foto.
alter table public.crm_contacts add column if not exists avatar_checked_at timestamptz;
