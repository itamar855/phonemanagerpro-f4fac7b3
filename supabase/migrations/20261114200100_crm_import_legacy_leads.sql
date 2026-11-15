-- =====================================================================
-- CRM — Fase 1: importação dos leads antigos
-- leads → crm_contacts (sem duplicata por telefone), lead_messages → crm_messages.
-- Conversas antigas entram como "resolvidas"; nenhum negócio é criado.
-- Grupos de WhatsApp que viraram "lead" no passado não são importados.
-- Nada nas tabelas antigas é alterado ou apagado. Pode rodar mais de uma vez.
-- =====================================================================

do $$
declare
  v_contacts  integer;
  v_convs     integer;
  v_msgs      integer;
  v_groups    integer;
  v_linked    integer;
begin
  if exists (select 1 from public.crm_contacts where legacy_lead_ids <> '{}') then
    raise notice 'Leads antigos já importados — nada a fazer.';
    return;
  end if;

  create temporary table _crm_src on commit drop as
  select
    l.*,
    public.crm_normalize_phone(l.phone) as pnorm,
    public.crm_phone_key(l.phone)       as pkey,
    regexp_replace(coalesce(l.phone, ''), '\D', '', 'g') as pdigits,
    -- grupo antigo: "numero-timestamp" ou id longo (>= 14 dígitos) que não é telefone
    coalesce(public.crm_normalize_phone(l.phone) is null
      and (coalesce(l.phone, '') like '%-%' or length(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g')) >= 14), false) as is_group
  from public.leads l
  where l.store_id is not null;

  select count(*) into v_groups from _crm_src where is_group;

  -- 1. Contatos: um por (loja, telefone) / (loja, instagram) / lead avulso
  insert into public.crm_contacts (
    store_id, name, phone, phone_key, email, instagram_user_id, instagram_username, avatar_url,
    origin_channel, notes, legacy_lead_ids, created_at
  )
  select
    g.store_id,
    coalesce(
      (array_agg(nullif(btrim(g.name), '') order by (g.name in ('Lead WhatsApp', 'Lead Instagram')), g.created_at)
        filter (where nullif(btrim(g.name), '') is not null))[1],
      'Contato'),
    case when max(g.pnorm) is not null
         then '55' || (array_agg(g.pnorm order by length(g.pnorm) desc) filter (where g.pnorm is not null))[1] end,
    max(g.pkey),
    max(g.email),
    max(g.instagram_user_id),
    max(g.instagram_username),
    max(g.avatar_url),
    (array_agg(case g.source
                 when 'whatsapp'  then 'whatsapp'
                 when 'instagram' then 'instagram'
                 when 'os_vendas' then 'os_vendas'
                 else 'import' end order by g.created_at))[1],
    nullif(string_agg(distinct nullif(btrim(g.notes), ''), E'\n'), ''),
    array_agg(g.id order by g.created_at),
    min(g.created_at)
  from (
    select s.*,
           coalesce('p:' || s.pkey, 'i:' || s.instagram_user_id, 'l:' || s.id::text) as grp
    from _crm_src s
    where not s.is_group
  ) g
  group by g.store_id, g.grp;
  get diagnostics v_contacts = row_count;

  -- 2. Vínculo com o cadastro de clientes (prefere a mesma loja)
  update public.crm_contacts c set customer_id = (
    select cu.id from public.customers cu
     where public.crm_phone_key(cu.phone) = c.phone_key
     order by (cu.store_id = c.store_id) desc, cu.created_at
     limit 1)
  where c.phone_key is not null and c.customer_id is null and c.legacy_lead_ids <> '{}';
  select count(*) into v_linked from public.crm_contacts where customer_id is not null and legacy_lead_ids <> '{}';

  -- 3. Conversas (só de quem tem mensagem), todas resolvidas
  insert into public.crm_conversations (
    store_id, contact_id, channel, external_thread_id, status, unread_count,
    last_message_at, last_message_preview, last_message_direction, last_inbound_at, created_at
  )
  select
    c.store_id,
    c.id,
    case when c.phone_key is null and c.instagram_user_id is not null then 'instagram' else 'whatsapp' end,
    case when c.phone_key is null and c.instagram_user_id is not null then c.instagram_user_id
         else (select s.pdigits || '@s.whatsapp.net' from _crm_src s
                where s.id = any(c.legacy_lead_ids) and s.source = 'whatsapp' and s.pnorm is not null
                order by s.created_at limit 1) end,
    'resolved',
    0,
    max(m.created_at),
    left((array_agg(coalesce(nullif(btrim(m.content), ''), '[' || coalesce(m.message_type, 'text') || ']') order by m.created_at desc))[1], 160),
    (array_agg(case when m.sender in ('vendedor', 'me') then 'out' else 'in' end order by m.created_at desc))[1],
    max(m.created_at) filter (where m.sender not in ('vendedor', 'me')),
    min(m.created_at)
  from public.crm_contacts c
  join public.lead_messages m on m.lead_id = any(c.legacy_lead_ids)
  where c.legacy_lead_ids <> '{}'
  group by c.id, c.store_id, c.phone_key, c.instagram_user_id, c.legacy_lead_ids
  on conflict (contact_id, channel) do nothing;
  get diagnostics v_convs = row_count;

  -- 4. Mensagens
  insert into public.crm_messages (
    store_id, conversation_id, contact_id, direction, sender_kind, sender_user_id,
    kind, body, media_url, status, created_at, legacy_lead_message_id
  )
  select
    cv.store_id,
    cv.id,
    c.id,
    case when m.sender in ('vendedor', 'me') then 'out' else 'in' end,
    case when m.sender in ('vendedor', 'me') then 'user' else 'contact' end,
    (select u.id from auth.users u where u.id = m.sender_user_id),
    case when m.message_type in ('image', 'audio') then m.message_type else 'text' end,
    m.content,
    m.media_url,
    case when m.sender in ('vendedor', 'me') then 'sent' else 'received' end,
    coalesce(m.created_at, now()),
    m.id
  from public.lead_messages m
  join public.crm_contacts c on m.lead_id = any(c.legacy_lead_ids)
  join public.crm_conversations cv on cv.contact_id = c.id
  on conflict (legacy_lead_message_id) do nothing;
  get diagnostics v_msgs = row_count;

  raise notice 'CRM importado: % contatos (% ligados a clientes), % conversas, % mensagens; % grupos ignorados.',
    v_contacts, v_linked, v_convs, v_msgs, v_groups;
end $$;
