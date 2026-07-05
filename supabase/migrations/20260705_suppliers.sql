-- ============================================================
-- Tabela: suppliers (Fornecedores)
-- Controla fornecedores, pagamentos e créditos
-- ============================================================

create table if not exists public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid references public.stores(id) on delete cascade,
  name            text not null,
  document        text,           -- CNPJ ou CPF
  phone           text,
  email           text,
  category        text,           -- categoria do que fornece: peças, acessórios, etc.
  notes           text,
  credit_balance  numeric(12,2) not null default 0.00,  -- positivo = crédito do fornecedor conosco; negativo = devemos ao fornecedor
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Habilitar RLS
alter table public.suppliers enable row level security;

-- Policy: todos autenticados da loja podem ler
create policy "suppliers_select" on public.suppliers
  for select using (auth.uid() is not null);

-- Policy: apenas quem criou ou admin pode inserir/atualizar
create policy "suppliers_insert" on public.suppliers
  for insert with check (auth.uid() is not null);

create policy "suppliers_update" on public.suppliers
  for update using (auth.uid() is not null);

create policy "suppliers_delete" on public.suppliers
  for delete using (auth.uid() is not null);

-- Índice para busca por loja
create index if not exists suppliers_store_id_idx on public.suppliers(store_id);
create index if not exists suppliers_name_idx on public.suppliers(name);

-- Trigger para atualizar updated_at
create or replace function update_suppliers_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at
  before update on public.suppliers
  for each row execute function update_suppliers_updated_at();
