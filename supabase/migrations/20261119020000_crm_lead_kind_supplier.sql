-- Fornecedor como tipo do lead (ao lado de Assistência e Venda) e etiqueta nova com cor criada
-- por quem atende (no painel do contato). Alterar ou apagar etiquetas da lista continua só da gerência.

alter table public.crm_contacts drop constraint if exists crm_contacts_lead_kind_check;
alter table public.crm_contacts add constraint crm_contacts_lead_kind_check
  check (lead_kind in ('assistencia', 'venda', 'fornecedor'));

drop policy if exists crm_tags_member_insert on public.crm_tags;
create policy crm_tags_member_insert on public.crm_tags for insert to authenticated
  with check (public.crm_is_member(store_id));
