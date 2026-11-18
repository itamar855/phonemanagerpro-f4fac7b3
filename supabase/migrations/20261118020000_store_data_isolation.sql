-- Isolamento por loja (vendas, caixa, contas, OS) e fim da leitura sem login.
--
-- Antes: políticas antigas e repetidas com `using (true)` / `auth.role() = 'authenticated'` deixavam
-- qualquer usuário logado ler e alterar dados de todas as lojas, e algumas (role public) deixavam até
-- visitante sem login ler audit_logs e cash_registers com a chave pública do site.
--
-- Como: em vez de reescrever dezenas de políticas (e arriscar tirar algo que a tela usa), cada tabela
-- ganha uma política RESTRITIVA, que o Postgres soma (AND) às permissivas existentes:
-- quem pode fazer o quê continua igual, mas só dentro das lojas da pessoa. Admin vê e altera tudo.
-- Decisões do dono (18/11/2026): estoque (aparelhos/acessórios) e clientes são consultáveis nas duas
-- lojas; alterar continua só na própria loja. Lançamento sem loja (finanças pessoais) é só do admin.
-- Funções security definer (PDV pelo WhatsApp, relatórios, triggers) são do dono das tabelas e não
-- passam pela RLS: continuam funcionando.

create or replace function public.app_store_access(p_store_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select (select auth.uid()) is not null and (
    exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role::text = 'admin')
    or (p_store_id is not null and exists (
      select 1 from public.member_stores where user_id = (select auth.uid()) and store_id = p_store_id))
  );
$$;
revoke all on function public.app_store_access(uuid) from public, anon;
grant execute on function public.app_store_access(uuid) to authenticated, service_role;

-- ---- Ler e alterar só na própria loja ----
do $$
declare t text;
begin
  foreach t in array array['sales', 'transactions', 'cash_entries', 'cash_registers', 'cash_closures',
                           'store_bank_accounts', 'product_repairs']
  loop
    execute format('drop policy if exists store_isolation on public.%I', t);
    execute format('create policy store_isolation on public.%I as restrictive for all to public '
                   'using (public.app_store_access(store_id)) with check (public.app_store_access(store_id))', t);
  end loop;
end $$;

-- itens da OS seguem a loja da OS
drop policy if exists store_isolation on public.product_repair_items;
create policy store_isolation on public.product_repair_items as restrictive for all to public
  using (exists (select 1 from public.product_repairs r where r.id = repair_id and public.app_store_access(r.store_id)))
  with check (exists (select 1 from public.product_repairs r where r.id = repair_id and public.app_store_access(r.store_id)));

-- ---- Estoque e clientes: consulta nas duas lojas (com login); alterar só na própria ----
do $$
declare t text;
begin
  foreach t in array array['accessories', 'products', 'customers']
  loop
    execute format('drop policy if exists store_isolation_read on public.%I', t);
    execute format('drop policy if exists store_isolation_insert on public.%I', t);
    execute format('drop policy if exists store_isolation_update on public.%I', t);
    execute format('drop policy if exists store_isolation_delete on public.%I', t);
    execute format('create policy store_isolation_read on public.%I as restrictive for select to public '
                   'using ((select auth.uid()) is not null)', t);
  end loop;
end $$;

-- aparelhos e acessórios: sempre têm loja
create policy store_isolation_insert on public.accessories as restrictive for insert to public with check (public.app_store_access(store_id));
create policy store_isolation_update on public.accessories as restrictive for update to public using (public.app_store_access(store_id)) with check (public.app_store_access(store_id));
create policy store_isolation_delete on public.accessories as restrictive for delete to public using (public.app_store_access(store_id));
create policy store_isolation_insert on public.products as restrictive for insert to public with check (public.app_store_access(store_id));
create policy store_isolation_update on public.products as restrictive for update to public using (public.app_store_access(store_id)) with check (public.app_store_access(store_id));
create policy store_isolation_delete on public.products as restrictive for delete to public using (public.app_store_access(store_id));
-- clientes: há cadastros sem loja (compartilhados); quem já podia mexer neles continua podendo
create policy store_isolation_insert on public.customers as restrictive for insert to public
  with check ((select auth.uid()) is not null and (store_id is null or public.app_store_access(store_id)));
create policy store_isolation_update on public.customers as restrictive for update to public
  using ((select auth.uid()) is not null and (store_id is null or public.app_store_access(store_id)))
  with check ((select auth.uid()) is not null and (store_id is null or public.app_store_access(store_id)));
create policy store_isolation_delete on public.customers as restrictive for delete to public
  using ((select auth.uid()) is not null and (store_id is null or public.app_store_access(store_id)));

-- ---- Auditoria: cada um vê a da sua loja; o admin vê tudo; ninguém sem login ----
drop policy if exists store_isolation_read on public.audit_logs;
create policy store_isolation_read on public.audit_logs as restrictive for select to public
  using (public.app_store_access(store_id));

-- ---- Log de webhooks do Instagram: o servidor usa a service_role (que ignora RLS) ----
-- a política "Service role full access" valia para role public: visitante podia ler e gravar
drop policy if exists "Service role full access" on public.instagram_webhooks_logs;
