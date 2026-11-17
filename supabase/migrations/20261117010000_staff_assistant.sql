-- =====================================================================
-- Assistente da equipe no WhatsApp da loja (relatório do dia + venda de acessórios no PDV)
-- Tudo aqui é chamado só pelo servidor (Edge Function com a chave de serviço).
-- A venda reproduz exatamente o PDV da tela (useCartManager + createPendingCashEntry):
-- baixa estoque, grava transactions (income/acessorio) e lança no caixa aberto
-- (dinheiro confirmado; Pix/cartão pendentes até anexar o comprovante).
-- =====================================================================

-- 1. Conversa em andamento (escolha de item, confirmação). Expira na aplicação (15 min).
create table if not exists public.staff_assistant_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  last_message_id text,
  updated_at timestamptz not null default now()
);
alter table public.staff_assistant_sessions enable row level security;
revoke all on public.staff_assistant_sessions from anon, authenticated;

-- 2. Texto sem acento e minúsculo (busca no estoque)
create or replace function public.staff_norm(p text)
returns text language sql immutable as $$
  select lower(translate(coalesce(p, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ’''',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC  '))
$$;

-- 3. Quem da equipe é dono deste celular, e em qual loja ele opera por este número
create or replace function public.staff_lookup(p_phone text, p_store uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_key text := public.crm_phone_key(p_phone);
  v_row record;
  v_store uuid;
begin
  if v_key is null then return null; end if;
  select p.user_id, p.display_name, r.role::text as role, coalesce(r.permissions, '{}'::jsonb) as permissions, p.store_id
    into v_row
    from public.profiles p
    join public.user_roles r on r.user_id = p.user_id
   where p.phone is not null and public.crm_phone_key(p.phone) = v_key
   order by (r.role::text = 'admin') desc, p.created_at
   limit 1;
  if not found then return null; end if;

  -- loja: a do número, se ele for de lá; senão a 1ª loja dele; admin opera na loja do número
  if v_row.role = 'admin' or exists (select 1 from public.member_stores m where m.user_id = v_row.user_id and m.store_id = p_store) then
    v_store := p_store;
  else
    select m.store_id into v_store from public.member_stores m where m.user_id = v_row.user_id order by m.created_at limit 1;
  end if;
  if v_store is null then return null; end if;

  return jsonb_build_object(
    'user_id', v_row.user_id, 'name', v_row.display_name, 'role', v_row.role,
    'permissions', v_row.permissions, 'store_id', v_store,
    'store_name', (select s.name from public.stores s where s.id = v_store)
  );
end $$;

-- 4. Acessórios com estoque mais parecidos com o texto
create or replace function public.staff_find_accessories(p_store uuid, p_text text, p_limit int default 5)
returns table (id uuid, name text, brand text, category text, sale_price numeric, quantity int, score real)
language sql stable security definer set search_path = public, extensions as $$
  select a.id, a.name, a.brand, a.category, a.sale_price, a.quantity::int,
         greatest(
           extensions.word_similarity(public.staff_norm(p_text), public.staff_norm(concat_ws(' ', a.name, a.brand, a.category, a.description))),
           extensions.similarity(public.staff_norm(p_text), public.staff_norm(concat_ws(' ', a.name, a.brand)))
         )::real as score
    from public.accessories a
   where a.store_id = p_store and coalesce(a.quantity, 0) > 0
   order by score desc, a.quantity desc
   limit greatest(1, least(coalesce(p_limit, 5), 10))
$$;

-- 5. Lança a venda do PDV (atômico)
-- p_items:    [{"id": uuid, "qty": int}]           (preço sempre o do estoque)
-- p_payments: {"dinheiro": n, "cartao": n, "pix": n} (soma = total depois do desconto)
create or replace function public.pdv_register_sale(
  p_store uuid, p_user uuid, p_items jsonb, p_payments jsonb,
  p_discount numeric default 0, p_customer text default null, p_source_message text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_acc record;
  v_qty int;
  v_cart jsonb := '[]'::jsonb;
  v_names text[] := '{}';
  v_subtotal numeric := 0;
  v_discount numeric := round(greatest(coalesce(p_discount, 0), 0), 2);
  v_total numeric;
  v_cash numeric := round(coalesce((p_payments->>'dinheiro')::numeric, 0), 2);
  v_card numeric := round(coalesce((p_payments->>'cartao')::numeric, 0), 2);
  v_pix numeric := round(coalesce((p_payments->>'pix')::numeric, 0), 2);
  v_register record;
  v_desc text;
  v_meta jsonb;
  v_tx uuid;
  v_first_tx uuid;
  v_methods int;
  v_customer text := nullif(btrim(coalesce(p_customer, '')), '');
  fmt_brl text;
begin
  if p_store is null or p_user is null then raise exception 'Loja ou usuário ausente.'; end if;
  if not (
    exists (select 1 from public.user_roles r where r.user_id = p_user and r.role::text = 'admin')
    or exists (select 1 from public.member_stores m where m.user_id = p_user and m.store_id = p_store)
  ) then
    raise exception 'Usuário sem acesso a esta loja.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nenhum item na venda.';
  end if;
  if v_cash < 0 or v_card < 0 or v_pix < 0 then raise exception 'Valor de pagamento inválido.'; end if;

  -- caixa aberto: o do vendedor; senão qualquer um da loja (igual à tela)
  select c.id, c.store_id into v_register from public.cash_registers c
   where c.status = 'open' and c.opened_by = p_user and c.store_id = p_store limit 1;
  if not found then
    select c.id, c.store_id into v_register from public.cash_registers c
     where c.status = 'open' and c.store_id = p_store order by c.opened_at desc limit 1;
  end if;
  if not found then
    raise exception 'Nenhum caixa aberto na loja. Abra o caixa no sistema antes de lançar a venda.';
  end if;

  -- itens: bloqueia a linha, confere estoque e preço
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty <= 0 then raise exception 'Quantidade inválida.'; end if;
    select a.id, a.name, a.quantity, a.sale_price into v_acc
      from public.accessories a
     where a.id = (v_item->>'id')::uuid and a.store_id = p_store
     for update;
    if not found then raise exception 'Item não encontrado no estoque desta loja.'; end if;
    if coalesce(v_acc.sale_price, 0) <= 0 then
      raise exception 'O item "%" está sem preço de venda no estoque.', v_acc.name;
    end if;
    if coalesce(v_acc.quantity, 0) < v_qty then
      raise exception 'Estoque insuficiente para "%". Disponível: %, pedido: %.', v_acc.name, coalesce(v_acc.quantity, 0), v_qty;
    end if;
    update public.accessories set quantity = greatest(0, coalesce(quantity, 0) - v_qty) where id = v_acc.id;
    v_subtotal := v_subtotal + v_qty * v_acc.sale_price;
    v_cart := v_cart || jsonb_build_object('id', v_acc.id, 'qty', v_qty, 'price', v_acc.sale_price);
    v_names := v_names || (v_qty || 'x ' || v_acc.name);
  end loop;

  if v_discount >= v_subtotal then raise exception 'Desconto maior que o valor da venda.'; end if;
  v_total := round(v_subtotal - v_discount, 2);
  if abs((v_cash + v_card + v_pix) - v_total) > 0.009 then
    raise exception 'Pagamento (R$ %) não fecha com o total da venda (R$ %).', v_cash + v_card + v_pix, v_total;
  end if;

  fmt_brl := 'R$ ' || replace(to_char(v_discount, 'FM9999999990.00'), '.', ',');
  v_desc := 'PDV: ' || array_to_string(v_names, ', ')
         || case when v_discount > 0 then ' (Desc: ' || fmt_brl || ')' else '' end
         || case when v_customer is not null then ' → ' || v_customer else '' end;
  v_meta := jsonb_build_object('cart', v_cart, 'subtotal', v_subtotal, 'discount', v_discount,
                               'discount_type', 'fixed', 'source', 'whatsapp', 'source_message', p_source_message);
  v_methods := (v_cash > 0)::int + (v_card > 0)::int + (v_pix > 0)::int;

  if v_methods > 1 then
    insert into public.transactions (type, category, amount, description, store_id, created_by, metadata)
    values ('income', 'acessorio', v_total,
            v_desc || ' [MISTO:{"dinheiro":' || (v_cash::float8)::text || ',"pix":' || (v_pix::float8)::text || ',"cartao_credito":' || (v_card::float8)::text || '}]',
            p_store, p_user, v_meta)
    returning id into v_tx;
    v_first_tx := v_tx;
    if v_cash > 0 then
      insert into public.cash_entries (cash_register_id, store_id, type, amount, description, payment_method, receipt_url, confirmed, created_by, reference_id)
      values (v_register.id, v_register.store_id, 'entrada', v_cash, v_desc || ' (Parte em Dinheiro)', 'dinheiro', null, true, p_user, v_tx);
    end if;
    if v_card > 0 then
      insert into public.cash_entries (cash_register_id, store_id, type, amount, description, payment_method, receipt_url, confirmed, created_by, reference_id)
      values (v_register.id, v_register.store_id, 'entrada', v_card, v_desc || ' (Parte em Cartão)', 'cartao_credito', null, false, p_user, v_tx);
    end if;
    if v_pix > 0 then
      insert into public.cash_entries (cash_register_id, store_id, type, amount, description, payment_method, receipt_url, confirmed, created_by, reference_id)
      values (v_register.id, v_register.store_id, 'entrada', v_pix, v_desc || ' (Parte em PIX)', 'pix', null, false, p_user, v_tx);
    end if;
  else
    if v_cash > 0 then
      insert into public.transactions (type, category, amount, description, store_id, created_by, metadata)
      values ('income', 'acessorio', v_cash, v_desc || ' [Dinheiro]', p_store, p_user, v_meta) returning id into v_tx;
      insert into public.cash_entries (cash_register_id, store_id, type, amount, description, payment_method, receipt_url, confirmed, created_by, reference_id)
      values (v_register.id, v_register.store_id, 'entrada', v_cash, v_desc, 'dinheiro', null, true, p_user, v_tx);
    elsif v_card > 0 then
      insert into public.transactions (type, category, amount, description, store_id, created_by, metadata)
      values ('income', 'acessorio', v_card, v_desc || ' [Cartão]', p_store, p_user, v_meta) returning id into v_tx;
      insert into public.cash_entries (cash_register_id, store_id, type, amount, description, payment_method, receipt_url, confirmed, created_by, reference_id)
      values (v_register.id, v_register.store_id, 'entrada', v_card, v_desc, 'cartao_credito', null, false, p_user, v_tx);
    elsif v_pix > 0 then
      insert into public.transactions (type, category, amount, description, store_id, created_by, metadata)
      values ('income', 'acessorio', v_pix, v_desc || ' [PIX]', p_store, p_user, v_meta) returning id into v_tx;
      insert into public.cash_entries (cash_register_id, store_id, type, amount, description, payment_method, receipt_url, confirmed, created_by, reference_id)
      values (v_register.id, v_register.store_id, 'entrada', v_pix, v_desc, 'pix', null, false, p_user, v_tx);
    else
      raise exception 'Informe a forma de pagamento.';
    end if;
    v_first_tx := v_tx;
  end if;

  insert into public.audit_logs (user_id, store_id, action, entity_type, entity_id, before_state, after_state)
  values (p_user, p_store, 'CREATE_PDV_SALE', 'transactions', v_first_tx, null,
          jsonb_build_object('description', v_desc, 'total', v_total, 'cart', v_cart,
                             'payments', jsonb_build_object('dinheiro', v_cash, 'cartao', v_card, 'pix', v_pix),
                             '_meta', jsonb_build_object('source', 'whatsapp', 'message_id', p_source_message)));

  return jsonb_build_object(
    'transaction_id', v_first_tx, 'register_id', v_register.id, 'description', v_desc,
    'subtotal', v_subtotal, 'discount', v_discount, 'total', v_total,
    'pending', (select coalesce(jsonb_agg(m), '[]'::jsonb) from unnest(array[
                  case when v_card > 0 then 'cartão' end, case when v_pix > 0 then 'Pix' end]) m where m is not null)
  );
end $$;

-- 6. Relatório do dia (para quem fecha o caixa). Sem custo nem lucro.
-- p_all = false: vendas PDV só do próprio usuário; true (admin): da loja inteira.
create or replace function public.staff_day_report(p_store uuid, p_user uuid, p_all boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  v_start timestamptz := (v_day::timestamp at time zone 'America/Sao_Paulo');
  v_end timestamptz := ((v_day + 1)::timestamp at time zone 'America/Sao_Paulo');
  v_register record;
  v_sales jsonb;
  v_os jsonb;
  v_pending jsonb;
begin
  select c.id, c.opened_at, p.display_name as opened_by_name into v_register
    from public.cash_registers c left join public.profiles p on p.user_id = c.opened_by
   where c.store_id = p_store and c.status = 'open' order by c.opened_at desc limit 1;

  -- vendas PDV do dia (pelo lançamento no caixa: é o que entra no fechamento)
  select jsonb_build_object(
           'count', count(distinct coalesce(e.reference_id::text, e.id::text)),
           'total', coalesce(sum(e.amount), 0),
           'by_method', coalesce((select jsonb_object_agg(x.payment_method, x.s) from (
                select e2.payment_method, sum(e2.amount) s from public.cash_entries e2
                 where e2.store_id = p_store and e2.type = 'entrada' and e2.description like 'PDV:%'
                   and e2.created_at >= v_start and e2.created_at < v_end
                   and (p_all or e2.created_by = p_user)
                 group by 1) x), '{}'::jsonb))
    into v_sales
    from public.cash_entries e
   where e.store_id = p_store and e.type = 'entrada' and e.description like 'PDV:%'
     and e.created_at >= v_start and e.created_at < v_end
     and (p_all or e.created_by = p_user);

  -- OS recebidas na loja hoje (todas: quem fecha o caixa precisa ver)
  select jsonb_build_object(
           'count', count(distinct coalesce(e.reference_id::text, e.id::text)),
           'total', coalesce(sum(e.amount), 0),
           'by_method', coalesce((select jsonb_object_agg(x.payment_method, x.s) from (
                select e2.payment_method, sum(e2.amount) s from public.cash_entries e2
                 where e2.store_id = p_store and e2.type = 'entrada' and e2.description like 'OS #%'
                   and e2.created_at >= v_start and e2.created_at < v_end
                 group by 1) x), '{}'::jsonb))
    into v_os
    from public.cash_entries e
   where e.store_id = p_store and e.type = 'entrada' and e.description like 'OS #%'
     and e.created_at >= v_start and e.created_at < v_end;

  -- sem comprovante: no caixa aberto (ou de hoje, se não houver caixa aberto)
  select jsonb_build_object(
           'count', count(*), 'total', coalesce(sum(e.amount), 0),
           'items', coalesce(jsonb_agg(jsonb_build_object('description', left(e.description, 80), 'amount', e.amount, 'method', e.payment_method)
                                       order by e.created_at) filter (where e.id is not null), '[]'::jsonb))
    into v_pending
    from public.cash_entries e
   where e.store_id = p_store and e.type = 'entrada' and e.confirmed = false
     and (case when v_register.id is not null then e.cash_register_id = v_register.id
               else e.created_at >= v_start and e.created_at < v_end end);

  return jsonb_build_object(
    'day', v_day, 'all', p_all,
    'register', case when v_register.id is null then null
                     else jsonb_build_object('opened_at', v_register.opened_at, 'opened_by', v_register.opened_by_name) end,
    'sales', v_sales, 'os', v_os, 'pending', v_pending
  );
end $$;

revoke all on function public.staff_lookup(text, uuid) from public, anon, authenticated;
revoke all on function public.staff_find_accessories(uuid, text, int) from public, anon, authenticated;
revoke all on function public.pdv_register_sale(uuid, uuid, jsonb, jsonb, numeric, text, text) from public, anon, authenticated;
revoke all on function public.staff_day_report(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.staff_lookup(text, uuid) to service_role;
grant execute on function public.staff_find_accessories(uuid, text, int) to service_role;
grant execute on function public.pdv_register_sale(uuid, uuid, jsonb, jsonb, numeric, text, text) to service_role;
grant execute on function public.staff_day_report(uuid, uuid, boolean) to service_role;
