create table if not exists public.error_logs (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    store_id uuid references public.stores(id) on delete cascade not null,
    module text not null,
    message text not null,
    severity text not null,
    details jsonb
);

alter table public.error_logs enable row level security;

create policy "Users can view error logs for their store"
    on public.error_logs
    for select
    using (
        store_id = (select auth.jwt() ->> 'app_metadata' ->> 'store_id')::uuid
    );

create policy "Users can insert error logs for their store"
    on public.error_logs
    for insert
    with check (
        store_id = (select auth.jwt() ->> 'app_metadata' ->> 'store_id')::uuid
    );

create policy "Users can delete error logs for their store"
    on public.error_logs
    for delete
    using (
        store_id = (select auth.jwt() ->> 'app_metadata' ->> 'store_id')::uuid
    );
