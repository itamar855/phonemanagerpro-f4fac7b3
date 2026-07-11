-- Storage policies for comprovantes bucket

-- 1. Permite acesso público (leitura) aos comprovantes
CREATE POLICY "Public Access to comprovantes" ON storage.objects
    FOR SELECT USING (bucket_id = 'comprovantes');

-- 2. Permite que usuários autenticados (como vendedores) façam upload de comprovantes
CREATE POLICY "Authenticated can upload to comprovantes" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'comprovantes');

-- 3. Permite que usuários autenticados atualizem comprovantes se necessário (para upsert)
CREATE POLICY "Authenticated can update comprovantes" ON storage.objects
    FOR UPDATE TO authenticated WITH CHECK (bucket_id = 'comprovantes');
