
-- 1. VENTES : champ remise
ALTER TABLE public.ventes
  ADD COLUMN IF NOT EXISTS remise NUMERIC(14,2) NOT NULL DEFAULT 0;

-- 2. RECOUVREMENTS : type (paiement vs réduction)
ALTER TABLE public.recouvrements
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'paiement';

DO $$ BEGIN
  ALTER TABLE public.recouvrements
    ADD CONSTRAINT recouvrements_type_chk CHECK (type IN ('paiement','reduction'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. PRODUITS : référence auto si non saisie
CREATE SEQUENCE IF NOT EXISTS public.produits_ref_seq;

CREATE OR REPLACE FUNCTION public.tg_produits_auto_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reference IS NULL OR length(trim(NEW.reference)) = 0 THEN
    NEW.reference := 'PRD-' || lpad(nextval('public.produits_ref_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS produits_auto_reference ON public.produits;
CREATE TRIGGER produits_auto_reference
  BEFORE INSERT ON public.produits
  FOR EACH ROW EXECUTE FUNCTION public.tg_produits_auto_reference();

-- avancer la séquence au-dessus du max actuel
SELECT setval('public.produits_ref_seq',
  GREATEST(
    COALESCE((SELECT MAX(NULLIF(regexp_replace(reference, '\D','','g'),''))::bigint FROM public.produits WHERE reference ~ '^PRD-\d+$'), 0),
    1
  ), true);

-- 4. CLIENTS : strict — pas d'achat inter-magasin sauf passager
-- (on garde la colonne allow_cross_magasin pour compat mais elle est ignorée)

-- 5. CREATE_VENTE : ajout de la remise, blocage cross-magasin strict
CREATE OR REPLACE FUNCTION public.create_vente(
  p_magasin_id uuid,
  p_client_id uuid,
  p_mode mode_paiement,
  p_montant_paye numeric,
  p_lignes jsonb,
  p_notes text DEFAULT NULL,
  p_remise numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_vente_id UUID;
  v_numero BIGINT;
  v_sous_total NUMERIC(14,2) := 0;
  v_total NUMERIC(14,2) := 0;
  v_remise NUMERIC(14,2) := COALESCE(p_remise, 0);
  v_credit NUMERIC(14,2);
  v_client RECORD;
  v_ligne JSONB;
  v_produit RECORD;
  v_qte NUMERIC(14,3);
  v_pu NUMERIC(14,2);
  v_montant NUMERIC(14,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.user_can_access_magasin(v_uid, p_magasin_id) THEN
    RAISE EXCEPTION 'Accès refusé à ce magasin';
  END IF;
  IF p_lignes IS NULL OR jsonb_array_length(p_lignes) = 0 THEN
    RAISE EXCEPTION 'Vente vide';
  END IF;
  IF p_montant_paye < 0 THEN
    RAISE EXCEPTION 'Montant payé invalide';
  END IF;
  IF v_remise < 0 THEN
    RAISE EXCEPTION 'Remise invalide';
  END IF;
  IF v_remise > 0 AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur peut accorder une remise';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  IF v_client.statut <> 'actif' THEN
    RAISE EXCEPTION 'Client % (statut: %)', v_client.nom, v_client.statut;
  END IF;

  -- Strict : seul le client Passager peut être servi partout
  IF v_client.is_passager_systeme = false
     AND v_client.magasin_id IS NOT NULL
     AND v_client.magasin_id <> p_magasin_id THEN
    RAISE EXCEPTION 'Ce client est rattaché à un autre magasin et ne peut acheter qu''à son magasin d''origine.';
  END IF;

  FOR v_ligne IN SELECT * FROM jsonb_array_elements(p_lignes) LOOP
    v_qte := (v_ligne->>'quantite')::numeric;
    v_pu  := (v_ligne->>'prix_unitaire')::numeric;
    IF v_qte IS NULL OR v_qte <= 0 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;

    SELECT * INTO v_produit FROM public.produits
      WHERE id = (v_ligne->>'produit_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produit introuvable'; END IF;
    IF v_produit.magasin_id <> p_magasin_id THEN
      RAISE EXCEPTION 'Produit % n''appartient pas au magasin', v_produit.nom;
    END IF;
    IF v_produit.statut <> 'actif' THEN
      RAISE EXCEPTION 'Produit % indisponible', v_produit.nom;
    END IF;
    IF v_produit.stock_actuel < v_qte THEN
      RAISE EXCEPTION 'Stock insuffisant pour % (dispo: %, demandé: %)',
        v_produit.nom, v_produit.stock_actuel, v_qte;
    END IF;
    IF v_pu IS NULL OR v_pu < 0 THEN v_pu := v_produit.prix_vente_unitaire; END IF;

    v_montant := round(v_qte * v_pu, 2);
    v_sous_total := v_sous_total + v_montant;

    UPDATE public.produits SET stock_actuel = stock_actuel - v_qte WHERE id = v_produit.id;
  END LOOP;

  IF v_remise > v_sous_total THEN
    RAISE EXCEPTION 'Remise (%) supérieure au sous-total (%)', v_remise, v_sous_total;
  END IF;
  v_total := v_sous_total - v_remise;

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
      RAISE EXCEPTION 'Budget dépassé (dette: %, crédit: %, plafond: %)',
        v_client.dette_totale, v_credit, v_client.budget_max;
    END IF;
  END IF;

  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero
    FROM public.ventes WHERE magasin_id = p_magasin_id;

  INSERT INTO public.ventes (
    magasin_id, client_id, numero, mode_paiement,
    montant_total, montant_paye, montant_credit, credit_restant,
    vendeur_id, notes, remise
  ) VALUES (
    p_magasin_id, p_client_id, v_numero, p_mode,
    v_total, LEAST(p_montant_paye, v_total), v_credit, v_credit,
    v_uid, p_notes, v_remise
  ) RETURNING id INTO v_vente_id;

  FOR v_ligne IN SELECT * FROM jsonb_array_elements(p_lignes) LOOP
    v_qte := (v_ligne->>'quantite')::numeric;
    v_pu  := (v_ligne->>'prix_unitaire')::numeric;
    SELECT prix_vente_unitaire INTO v_produit.prix_vente_unitaire
      FROM public.produits WHERE id = (v_ligne->>'produit_id')::uuid;
    IF v_pu IS NULL OR v_pu < 0 THEN v_pu := v_produit.prix_vente_unitaire; END IF;
    INSERT INTO public.vente_lignes (vente_id, produit_id, quantite, prix_unitaire, montant_ligne)
    VALUES (v_vente_id, (v_ligne->>'produit_id')::uuid, v_qte, v_pu, round(v_qte * v_pu, 2));
  END LOOP;

  IF v_credit > 0 THEN
    UPDATE public.clients SET dette_totale = dette_totale + v_credit WHERE id = p_client_id;
  END IF;

  RETURN v_vente_id;
END;
$$;

-- 6. CREATE_RECOUVREMENT : ajout p_type
CREATE OR REPLACE FUNCTION public.create_recouvrement(
  p_magasin_id uuid,
  p_client_id uuid,
  p_montant numeric,
  p_notes text DEFAULT NULL,
  p_type text DEFAULT 'paiement'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rec_id UUID;
  v_numero BIGINT;
  v_reste NUMERIC(14,2);
  v_client RECORD;
  v_vente RECORD;
  v_alloc NUMERIC(14,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.user_can_access_magasin(v_uid, p_magasin_id) THEN
    RAISE EXCEPTION 'Accès refusé à ce magasin';
  END IF;
  IF p_montant IS NULL OR p_montant <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF p_type NOT IN ('paiement','reduction') THEN
    RAISE EXCEPTION 'Type invalide';
  END IF;
  IF p_type = 'reduction' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur peut accorder une réduction de dette';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  IF v_client.is_passager_systeme THEN
    RAISE EXCEPTION 'Le client Passager n''a pas de dette';
  END IF;
  IF p_montant > v_client.dette_totale THEN
    RAISE EXCEPTION 'Montant (%) supérieur à la dette (%)', p_montant, v_client.dette_totale;
  END IF;

  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero
    FROM public.recouvrements WHERE magasin_id = p_magasin_id;

  INSERT INTO public.recouvrements (magasin_id, client_id, numero, montant, vendeur_id, notes, type)
  VALUES (p_magasin_id, p_client_id, v_numero, p_montant, v_uid, p_notes, p_type)
  RETURNING id INTO v_rec_id;

  v_reste := p_montant;
  FOR v_vente IN
    SELECT id, credit_restant FROM public.ventes
    WHERE client_id = p_client_id AND statut = 'validee' AND credit_restant > 0
    ORDER BY date_vente ASC, created_at ASC FOR UPDATE
  LOOP
    EXIT WHEN v_reste <= 0;
    v_alloc := LEAST(v_reste, v_vente.credit_restant);
    INSERT INTO public.recouvrement_allocations (recouvrement_id, vente_id, montant_alloue)
    VALUES (v_rec_id, v_vente.id, v_alloc);
    UPDATE public.ventes SET credit_restant = credit_restant - v_alloc WHERE id = v_vente.id;
    v_reste := v_reste - v_alloc;
  END LOOP;

  IF v_reste > 0 THEN
    RAISE EXCEPTION 'Incohérence : reste % non imputable', v_reste;
  END IF;

  UPDATE public.clients SET dette_totale = dette_totale - p_montant WHERE id = p_client_id;

  RETURN v_rec_id;
END;
$$;
