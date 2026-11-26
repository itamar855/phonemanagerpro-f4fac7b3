-- Num replay do zero, a 20260331000000 cria leads.assigned_to com uma FK para
-- auth.users que o Postgres chama de leads_assigned_to_fkey (em produção a coluna
-- já existia, então essa FK nunca foi criada lá). Tira antes de criar a certa.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;

ALTER TABLE public.leads 
ADD CONSTRAINT leads_assigned_to_fkey 
FOREIGN KEY (assigned_to) 
REFERENCES public.profiles(user_id)
ON DELETE SET NULL;