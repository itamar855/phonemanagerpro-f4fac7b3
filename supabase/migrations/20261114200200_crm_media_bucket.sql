-- =====================================================================
-- CRM — bucket privado de mídia (fotos, áudios, documentos das conversas)
-- Caminho: <store_id>/<qualquer coisa>. Só membros da loja leem e enviam.
-- O bucket antigo chat_media (público) não é alterado.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crm_media', 'crm_media', false, 16777216, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/aac',
  'video/mp4', 'application/pdf'
])
on conflict (id) do nothing;

-- Loja dona do arquivo, pelo 1º segmento do caminho (sem cast que possa falhar)
create or replace function public.crm_storage_is_member(p_name text)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare v text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if v !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  return public.crm_is_member(v::uuid);
end;
$$;

drop policy if exists crm_media_member_select on storage.objects;
drop policy if exists crm_media_member_insert on storage.objects;
drop policy if exists crm_media_member_delete on storage.objects;

create policy crm_media_member_select on storage.objects for select to authenticated
  using (bucket_id = 'crm_media' and public.crm_storage_is_member(name));

create policy crm_media_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'crm_media' and public.crm_storage_is_member(name));

create policy crm_media_member_delete on storage.objects for delete to authenticated
  using (bucket_id = 'crm_media' and owner = (select auth.uid()) and public.crm_storage_is_member(name));
