-- O valor 'dono' do enum app_role foi criado à mão em produção e nunca entrou
-- numa migration. As migrations seguintes (a partir de enterprise_phase5) já
-- comparam role com 'dono', então um replay do zero (Supabase Preview, banco
-- local) quebrava com "invalid input value for enum app_role".
--
-- IF NOT EXISTS: em produção o valor já existe (ordem: admin, gerente,
-- vendedor, tecnico, dono), então isto não muda nada lá. Fica num arquivo
-- próprio porque um valor novo de enum não pode ser usado na mesma transação.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dono';
