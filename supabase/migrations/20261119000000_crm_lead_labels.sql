-- Etiquetas do lead: tipo (Assistência / Venda), etiquetas prontas com cor (a IA aplica) e
-- só a gerência edita a lista. "Cliente" vem de crm_contacts.customer_id; o vendedor, de assigned_to.

alter table public.crm_contacts add column if not exists lead_kind text;
alter table public.crm_contacts drop constraint if exists crm_contacts_lead_kind_check;
alter table public.crm_contacts add constraint crm_contacts_lead_kind_check check (lead_kind in ('assistencia', 'venda'));
alter table public.crm_contacts add column if not exists ai_tagged_at timestamptz;

-- ---- negócio criado marca o tipo do lead pelo funil (Assistência = conserto; Vendas = compra) ----
create or replace function public.crm_deals_mark_lead_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.crm_contacts c
     set lead_kind = case p.kind when 'service' then 'assistencia' else 'venda' end
    from public.crm_pipelines p
   where p.id = new.pipeline_id and c.id = new.contact_id
     and c.lead_kind is distinct from (case p.kind when 'service' then 'assistencia' else 'venda' end);
  return null;
end;
$$;
revoke all on function public.crm_deals_mark_lead_kind() from public, anon, authenticated;
drop trigger if exists crm_deals_mark_lead_kind on public.crm_deals;
create trigger crm_deals_mark_lead_kind after insert on public.crm_deals
  for each row execute function public.crm_deals_mark_lead_kind();

-- contatos que já têm negócio: o mais recente decide
update public.crm_contacts c
   set lead_kind = x.kind
  from (select distinct on (d.contact_id) d.contact_id,
               case p.kind when 'service' then 'assistencia' else 'venda' end as kind
          from public.crm_deals d join public.crm_pipelines p on p.id = d.pipeline_id
         order by d.contact_id, (d.status = 'open') desc, d.created_at desc) x
 where c.id = x.contact_id and c.lead_kind is null;

-- ---- etiquetas prontas ----
create or replace function public.crm_seed_tags(p_store_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.crm_tags (store_id, name, color)
  select p_store_id, t.name, t.color
    from (values
      ('Quente', 'red'), ('Morno', 'amber'), ('Frio', 'blue'),
      ('Conserto de tela', 'orange'), ('Bateria', 'lime'), ('Não liga', 'rose'),
      ('Quer iPhone', 'slate'), ('Quer Android', 'emerald'), ('Acessório', 'violet'), ('Troca/usado', 'cyan'),
      ('Orçamento enviado', 'indigo'), ('Pós-venda', 'pink')
    ) as t(name, color)
  on conflict do nothing;
$$;
revoke all on function public.crm_seed_tags(uuid) from public, anon, authenticated;
grant execute on function public.crm_seed_tags(uuid) to service_role;

select public.crm_seed_tags(id) from public.stores;

-- loja nova: funis + automações + etiquetas
create or replace function public.crm_stores_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crm_seed_store(new.id);
  insert into public.crm_automation_settings (store_id) values (new.id) on conflict do nothing;
  perform public.crm_seed_tags(new.id);
  return null;
end;
$$;
revoke all on function public.crm_stores_after_insert() from public, anon, authenticated;

-- ---- a lista de etiquetas é configuração: só a gerência cria, altera ou apaga ----
drop policy if exists crm_tags_member_insert on public.crm_tags;
drop policy if exists crm_tags_member_update on public.crm_tags;
drop policy if exists crm_tags_member_delete on public.crm_tags;
create policy crm_tags_member_insert on public.crm_tags for insert to authenticated
  with check (public.crm_is_member(store_id) and public.crm_is_manager());
create policy crm_tags_member_update on public.crm_tags for update to authenticated
  using (public.crm_is_member(store_id) and public.crm_is_manager())
  with check (public.crm_is_member(store_id) and public.crm_is_manager());
create policy crm_tags_member_delete on public.crm_tags for delete to authenticated
  using (public.crm_is_member(store_id) and public.crm_is_manager());
