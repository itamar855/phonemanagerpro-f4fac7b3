-- Drop the old "Admins can manage products" policy which relied on public.has_role
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;

-- Create an explicit policy for delete operations for admin and gerente
CREATE POLICY "Admins and gerentes can delete products" ON public.products
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'gerente')
    )
  );

-- Create a robust policy for all other operations for admin and gerente
CREATE POLICY "Admins and gerentes can manage products" ON public.products
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'gerente')
    )
  );
