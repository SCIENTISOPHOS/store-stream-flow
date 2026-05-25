-- SELECT: restreindre aux admins ou utilisateurs rattachés à un magasin
DROP POLICY IF EXISTS "Authenticated view clients" ON public.clients;

CREATE POLICY "Scoped view clients"
  ON public.clients FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_magasins
      WHERE user_id = auth.uid()
    )
  );

-- UPDATE: réserver aux admins. Les RPC SECURITY DEFINER continuent de fonctionner.
DROP POLICY IF EXISTS "Authenticated update clients (non passager)" ON public.clients;

CREATE POLICY "Admins update clients (non passager)"
  ON public.clients FOR UPDATE
  TO authenticated
  USING (public.is_admin() AND is_passager_systeme = false)
  WITH CHECK (public.is_admin() AND is_passager_systeme = false);

-- INSERT: réserver aux admins ou utilisateurs rattachés à un magasin
DROP POLICY IF EXISTS "Authenticated insert clients" ON public.clients;

CREATE POLICY "Scoped insert clients"
  ON public.clients FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND is_passager_systeme = false
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.user_magasins
        WHERE user_id = auth.uid()
      )
    )
  );