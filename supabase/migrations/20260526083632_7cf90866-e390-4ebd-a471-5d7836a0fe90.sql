
-- 1. Add columns to clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS magasin_id UUID REFERENCES public.magasins(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allow_cross_magasin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clients_magasin_id ON public.clients(magasin_id);

-- 2. Update tg_audit to capture magasin_id when present
CREATE OR REPLACE FUNCTION public.tg_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_email TEXT;
  v_new JSONB := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END;
  v_old JSONB := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
  v_record_id TEXT;
  v_magasin UUID;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = v_user;

  v_record_id := COALESCE(
    v_new->>'id',
    v_old->>'id',
    NULLIF(concat_ws(':', v_new->>'user_id', v_new->>'magasin_id'), ':'),
    NULLIF(concat_ws(':', v_old->>'user_id', v_old->>'magasin_id'), ':')
  );

  v_magasin := NULLIF(COALESCE(v_new->>'magasin_id', v_old->>'magasin_id'), '')::uuid;

  INSERT INTO public.audit_log (user_id, user_email, action, table_name, record_id, before_data, after_data, magasin_id)
  VALUES (v_user, v_email, TG_OP, TG_TABLE_NAME, v_record_id, v_old, v_new, v_magasin);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3. Audit log: strict cloisonnement par magasin
DROP POLICY IF EXISTS "Admins can view audit log" ON public.audit_log;

CREATE POLICY "Scoped admins view audit log"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    is_admin() AND (
      magasin_id IS NULL
      OR user_can_access_magasin(auth.uid(), magasin_id)
    )
  );

-- 4. Clients: scoped view by magasin
DROP POLICY IF EXISTS "Scoped view clients" ON public.clients;

CREATE POLICY "Scoped view clients"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR is_passager_systeme = true
    OR allow_cross_magasin = true
    OR magasin_id IS NULL
    OR (EXISTS (
      SELECT 1 FROM public.user_magasins um
      WHERE um.user_id = auth.uid() AND um.magasin_id = clients.magasin_id
    ))
  );

-- Only admins can flip allow_cross_magasin or change magasin_id (enforced via trigger)
CREATE OR REPLACE FUNCTION public.tg_clients_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.allow_cross_magasin = true AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Seul un administrateur peut autoriser les achats inter-magasins';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.allow_cross_magasin IS DISTINCT FROM NEW.allow_cross_magasin
        OR OLD.magasin_id IS DISTINCT FROM NEW.magasin_id)
       AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Seul un administrateur peut modifier le rattachement magasin ou l''autorisation inter-magasins';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_clients_admin_fields ON public.clients;
CREATE TRIGGER tg_clients_admin_fields
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_clients_admin_fields();

-- 5. create_vente: enforce cross-magasin rule (non-admin cannot use client from another magasin unless allow_cross_magasin)
CREATE OR REPLACE FUNCTION public.create_vente(p_magasin_id uuid, p_client_id uuid, p_mode mode_paiement, p_montant_paye numeric, p_lignes jsonb, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_vente_id UUID;
  v_numero BIGINT;
  v_total NUMERIC(14,2) := 0;
  v_credit NUMERIC(14,2);
  v_client RECORD;
  v_ligne JSONB;
  v_produit RECORD;
  v_qte NUMERIC(14,3);
  v_pu NUMERIC(14,2);
  v_montant NUMERIC(14,2);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF NOT public.user_can_access_magasin(v_uid, p_magasin_id) THEN
    RAISE EXCEPTION 'Accès refusé à ce magasin';
  END IF;

  IF p_lignes IS NULL OR jsonb_array_length(p_lignes) = 0 THEN
    RAISE EXCEPTION 'Vente vide';
  END IF;

  IF p_montant_paye < 0 THEN
    RAISE EXCEPTION 'Montant payé invalide';
  END IF;

  SELECT * INTO v_client FROM public.clients
    WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client introuvable';
  END IF;
  IF v_client.statut <> 'actif' THEN
    RAISE EXCEPTION 'Client % (statut: %)', v_client.nom, v_client.statut;
  END IF;

  -- Cross-magasin enforcement
  IF v_client.is_passager_systeme = false
     AND v_client.magasin_id IS NOT NULL
     AND v_client.magasin_id <> p_magasin_id
     AND v_client.allow_cross_magasin = false
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Ce client est rattaché à un autre magasin. Demandez à un administrateur d''autoriser les achats inter-magasins.';
  END IF;

  FOR v_ligne IN SELECT * FROM jsonb_array_elements(p_lignes)
  LOOP
    v_qte := (v_ligne->>'quantite')::numeric;
    v_pu := (v_ligne->>'prix_unitaire')::numeric;

    IF v_qte IS NULL OR v_qte <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide dans la vente';
    END IF;

    SELECT * INTO v_produit FROM public.produits
      WHERE id = (v_ligne->>'produit_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produit introuvable';
    END IF;
    IF v_produit.magasin_id <> p_magasin_id THEN
      RAISE EXCEPTION 'Produit % n''appartient pas au magasin', v_produit.nom;
    END IF;
    IF v_produit.statut <> 'actif' THEN
      RAISE EXCEPTION 'Produit % indisponible (statut: %)', v_produit.nom, v_produit.statut;
    END IF;
    IF v_produit.stock_actuel < v_qte THEN
      RAISE EXCEPTION 'Stock insuffisant pour % (disponible: %, demandé: %)',
        v_produit.nom, v_produit.stock_actuel, v_qte;
    END IF;
    IF v_pu IS NULL OR v_pu < 0 THEN
      v_pu := v_produit.prix_vente_unitaire;
    END IF;

    v_montant := round(v_qte * v_pu, 2);
    v_total := v_total + v_montant;

    UPDATE public.produits
      SET stock_actuel = stock_actuel - v_qte
      WHERE id = v_produit.id;
  END LOOP;

  IF p_mode = 'comptant' THEN
    IF p_montant_paye < v_total THEN
      RAISE EXCEPTION 'Paiement comptant insuffisant (total: %, payé: %)', v_total, p_montant_paye;
    END IF;
    v_credit := 0;
  ELSIF p_mode = 'credit' THEN
    v_credit := v_total;
    IF p_montant_paye <> 0 THEN
      RAISE EXCEPTION 'Vente à crédit : aucun paiement ne doit être saisi';
    END IF;
  ELSE
    IF p_montant_paye <= 0 OR p_montant_paye >= v_total THEN
      RAISE EXCEPTION 'Paiement mixte : montant payé doit être > 0 et < total';
    END IF;
    v_credit := v_total - p_montant_paye;
  END IF;

  IF v_credit > 0 THEN
    IF v_client.is_passager_systeme THEN
      RAISE EXCEPTION 'Le client Passager ne peut pas avoir de crédit';
    END IF;
    IF v_client.dette_totale + v_credit > v_client.budget_max THEN
      RAISE EXCEPTION 'Budget dépassé (dette actuelle: %, nouveau crédit: %, plafond: %)',
        v_client.dette_totale, v_credit, v_client.budget_max;
    END IF;
  END IF;

  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero
    FROM public.ventes WHERE magasin_id = p_magasin_id;

  INSERT INTO public.ventes (
    magasin_id, client_id, numero, mode_paiement,
    montant_total, montant_paye, montant_credit, credit_restant,
    vendeur_id, notes
  ) VALUES (
    p_magasin_id, p_client_id, v_numero, p_mode,
    v_total, LEAST(p_montant_paye, v_total), v_credit, v_credit,
    v_uid, p_notes
  ) RETURNING id INTO v_vente_id;

  FOR v_ligne IN SELECT * FROM jsonb_array_elements(p_lignes)
  LOOP
    v_qte := (v_ligne->>'quantite')::numeric;
    v_pu := (v_ligne->>'prix_unitaire')::numeric;
    SELECT prix_vente_unitaire INTO v_produit.prix_vente_unitaire FROM public.produits
      WHERE id = (v_ligne->>'produit_id')::uuid;
    IF v_pu IS NULL OR v_pu < 0 THEN v_pu := v_produit.prix_vente_unitaire; END IF;

    INSERT INTO public.vente_lignes (vente_id, produit_id, quantite, prix_unitaire, montant_ligne)
    VALUES (v_vente_id, (v_ligne->>'produit_id')::uuid, v_qte, v_pu, round(v_qte * v_pu, 2));
  END LOOP;

  IF v_credit > 0 THEN
    UPDATE public.clients
      SET dette_totale = dette_totale + v_credit
      WHERE id = p_client_id;
  END IF;

  RETURN v_vente_id;
END;
$function$;
