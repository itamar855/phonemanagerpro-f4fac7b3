-- Quem fica responsável pelo atendimento fica com o lead no funil (21/11/2026).
-- Antes, escolher o responsável na conversa (à mão, pela fila ou pelo rodízio) só mudava a conversa:
-- o negócio continuava sem dono — ou nem existia — e o lead não aparecia em "Meus" no Funil.
--
-- Agora, sempre que a conversa ganha um responsável:
--  * negócios abertos do contato passam para essa pessoa;
--  * se o contato não tem negócio aberto, nasce um na primeira etapa do funil certo
--    (Assistência para conserto, Vendas para o resto), marcado como automático.
-- Contato ignorado e fornecedor ficam de fora.
-- Quando o tipo do lead é descoberto depois (IA ou equipe), o negócio automático que ainda
-- está parado na primeira etapa muda para o funil certo; se for fornecedor, sai do funil.

alter table public.crm_deals add column if not exists auto_created boolean not null default false;

-- Primeira etapa visível de um funil (onde o lead novo entra)
create or replace function public.crm_entry_stage(p_pipeline_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id from public.crm_stages s
   where s.pipeline_id = p_pipeline_id and s.kind = 'open' and not s.hidden
   order by s.position limit 1;
$$;
revoke all on function public.crm_entry_stage(uuid) from public, anon, authenticated;
grant execute on function public.crm_entry_stage(uuid) to service_role;

-- Funil da loja para o tipo do lead (Assistência = service; o resto, Vendas)
create or replace function public.crm_pipeline_for_kind(p_store_id uuid, p_lead_kind text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.crm_pipelines p
   where p.store_id = p_store_id and not p.archived
   order by (p.kind = case p_lead_kind when 'assistencia' then 'service' else 'sales' end) desc,
            p.is_default desc, p.position
   limit 1;
$$;
revoke all on function public.crm_pipeline_for_kind(uuid, text) from public, anon, authenticated;
grant execute on function public.crm_pipeline_for_kind(uuid, text) to service_role;

-- Garante o lead no funil de quem é o responsável pela conversa
create or replace function public.crm_owner_to_funnel(p_conversation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv    public.crm_conversations%rowtype;
  v_contact public.crm_contacts%rowtype;
  v_prev    text := coalesce(current_setting('crm.system_assign', true), '');
  v_pipe    uuid;
  v_stage   uuid;
  v_deal    uuid;
begin
  select * into v_conv from public.crm_conversations where id = p_conversation_id;
  if v_conv.id is null or v_conv.assigned_to is null then return null; end if;
  select * into v_contact from public.crm_contacts where id = v_conv.contact_id;
  if v_contact.id is null or v_contact.ignored or v_contact.lead_kind is not distinct from 'fornecedor' then
    return null;
  end if;

  if exists (select 1 from public.crm_deals d where d.contact_id = v_contact.id and d.status = 'open') then
    -- o responsável já passou pela regra de quem pode pegar/transferir (crm_guard_owner_change na conversa)
    perform set_config('crm.system_assign', 'on', true);
    update public.crm_deals set owner_id = v_conv.assigned_to
     where contact_id = v_contact.id and status = 'open' and owner_id is distinct from v_conv.assigned_to;
    perform set_config('crm.system_assign', v_prev, true);
    select d.id into v_deal from public.crm_deals d
     where d.contact_id = v_contact.id and d.status = 'open' order by d.created_at desc limit 1;
    return v_deal;
  end if;

  v_pipe := public.crm_pipeline_for_kind(v_conv.store_id, v_contact.lead_kind);
  v_stage := public.crm_entry_stage(v_pipe);
  if v_stage is null then return null; end if;

  insert into public.crm_deals (store_id, pipeline_id, stage_id, contact_id, title, interest, owner_id, origin_channel, auto_created)
  select v_conv.store_id, v_pipe, v_stage, v_contact.id,
         coalesce(nullif(btrim(v_contact.name), ''), 'Lead'),
         case when p.kind = 'service' then 'repair' end,
         v_conv.assigned_to, v_contact.origin_channel, true
    from public.crm_pipelines p where p.id = v_pipe
  returning id into v_deal;
  return v_deal;
end;
$$;
revoke all on function public.crm_owner_to_funnel(uuid) from public, anon, authenticated;
grant execute on function public.crm_owner_to_funnel(uuid) to service_role;

create or replace function public.crm_conversations_owner_to_funnel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is null or new.status = 'resolved' then return null; end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then return null; end if;
  perform public.crm_owner_to_funnel(new.id);
  return null;
end;
$$;
revoke all on function public.crm_conversations_owner_to_funnel() from public, anon, authenticated;
drop trigger if exists crm_conversations_owner_to_funnel on public.crm_conversations;
create trigger crm_conversations_owner_to_funnel after insert or update of assigned_to on public.crm_conversations
  for each row execute function public.crm_conversations_owner_to_funnel();

-- Negócio automático criado sem saber o tipo não marca "Venda": deixa a IA/equipe descobrir
create or replace function public.crm_deals_mark_lead_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auto_created then return null; end if;
  update public.crm_contacts c
     set lead_kind = case p.kind when 'service' then 'assistencia' else 'venda' end
    from public.crm_pipelines p
   where p.id = new.pipeline_id and c.id = new.contact_id
     and c.lead_kind is distinct from (case p.kind when 'service' then 'assistencia' else 'venda' end);
  return null;
end;
$$;
revoke all on function public.crm_deals_mark_lead_kind() from public, anon, authenticated;

-- Tipo do lead descoberto depois: negócio automático parado na primeira etapa vai para o funil certo
create or replace function public.crm_contacts_kind_to_funnel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_pipe  uuid;
  v_stage uuid;
  v_want  text;
begin
  if new.lead_kind is not distinct from old.lead_kind or new.lead_kind is null then return null; end if;
  for r in
    select d.id, d.pipeline_id, p.kind
      from public.crm_deals d join public.crm_pipelines p on p.id = d.pipeline_id
     where d.contact_id = new.id and d.auto_created and d.status = 'open' and d.value = 0
       and d.stage_id = public.crm_entry_stage(d.pipeline_id)
  loop
    if new.lead_kind = 'fornecedor' then
      delete from public.crm_deals where id = r.id;
      continue;
    end if;
    v_want := case new.lead_kind when 'assistencia' then 'service' else 'sales' end;
    if r.kind = v_want then continue; end if;
    v_pipe := public.crm_pipeline_for_kind(new.store_id, new.lead_kind);
    v_stage := public.crm_entry_stage(v_pipe);
    if v_pipe is null or v_stage is null or v_pipe = r.pipeline_id then continue; end if;
    update public.crm_deals
       set pipeline_id = v_pipe, stage_id = v_stage,
           interest = case when new.lead_kind = 'assistencia' then 'repair' else nullif(interest, 'repair') end
     where id = r.id;
  end loop;
  return null;
end;
$$;
revoke all on function public.crm_contacts_kind_to_funnel() from public, anon, authenticated;
drop trigger if exists crm_contacts_kind_to_funnel on public.crm_contacts;
create trigger crm_contacts_kind_to_funnel after update of lead_kind on public.crm_contacts
  for each row execute function public.crm_contacts_kind_to_funnel();

-- Atendimentos em andamento que já têm responsável entram no funil agora
select public.crm_owner_to_funnel(v.id)
  from public.crm_conversations v
  join public.crm_contacts c on c.id = v.contact_id
 where v.status <> 'resolved' and v.assigned_to is not null
   and not c.ignored and c.lead_kind is distinct from 'fornecedor';
