
-- ============ TABLES ============

CREATE TABLE public.rebuts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  magasin_id UUID NOT NULL,
  produit_id UUID NOT NULL,
  quantite NUMERIC(14,3) NOT NULL CHECK (quantite > 0),
  motif TEXT NOT NULL,
  cree_par UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rebuts_magasin ON public.rebuts(magasin_id, created_at DESC);
CREATE INDEX idx_rebuts_produit ON public.rebuts(produit_id);

CREATE TYPE public.type_conversion AS ENUM ('sac_vers_demi', 'sac_perce');

CREATE TABLE public.conversions_emballage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  magasin_id UUID NOT NULL,
  type_conversion public.type_conversion NOT NULL,
  produit_sac_id UUID NOT NULL,
  produit_demi_id UUID NOT NULL,
  quantite_sacs NUMERIC(14,3) NOT NULL CHECK (quantite_sacs > 0),
  quantite_demi_produite NUMERIC(14,3) NOT NULL CHECK (quantite_demi_produite >= 0),
  quantite_perdue NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantite_perdue >= 0),
  rebut_id UUID,
  cree_par UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversions_magasin ON public.conversions_emballage(magasin_id, created_at DESC);

ALTER TABLE public.rebuts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversions_emballage ENABLE ROW LEVEL SECURITY;

-- ============ RLS ============

CREATE POLICY "Users view rebuts in their magasins"
  ON public.rebuts FOR SELECT TO authenticated
  USING (public.user_can_access_magasin(auth.uid(), magasin_id));

CREATE POLICY "Users view conversions in their magasins"
  ON public.conversions_emballage FOR SELECT TO authenticated
  USING (public.user_can_access_magasin(auth.uid(), magasin_id));

-- Pas d'INSERT/UPDATE/DELETE direct : tout passe par les RPCs

-- ============ AUDIT ============

CREATE TRIGGER tg_audit_rebuts AFTER INSERT OR UPDATE OR DELETE
  ON public.rebuts FOR EACH ROW EXECUTE FUNCTION public.tg_audit();

CREATE TRIGGER tg_audit_conversions AFTER INSERT OR UPDATE OR DELETE
  ON public.conversions_emballage FOR EACH ROW EXECUTE FUNCTION public.tg_audit();

-- ============ RPC : cancel_vente ============

CREATE OR REPLACE FUNCTION public.cancel_vente(
  p_vente_id UUID,
  p_motif TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_vente RECORD;
  v_ligne RECORD;
  v_remb NUMERIC(14,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur peut annuler une vente';
  END IF;
  IF p_motif IS NULL OR length(trim(p_motif)) < 3 THEN
    RAISE EXCEPTION 'Motif d''annulation requis (min 3 caractères)';
  END IF;

  SELECT * INTO v_vente FROM public.ventes WHERE id = p_vente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vente introuvable'; END IF;
  IF v_vente.statut = 'annulee' THEN
    RAISE EXCEPTION 'Vente déjà annulée';
  END IF;

  -- Restaurer le stock
  FOR v_ligne IN
    SELECT produit_id, quantite FROM public.vente_lignes WHERE vente_id = p_vente_id
  LOOP
    UPDATE public.produits
      SET stock_actuel = stock_actuel + v_ligne.quantite
      WHERE id = v_ligne.produit_id;
  END LOOP;

  -- Rembourser la dette : la part déjà imputée (montant_credit - credit_restant) est retournée au client
  -- On retire de la dette ce qui reste imputable (credit_restant)
  IF v_vente.credit_restant > 0 THEN
    UPDATE public.clients
      SET dette_totale = GREATEST(0, dette_totale - v_vente.credit_restant)
      WHERE id = v_vente.client_id;
  END IF;

  -- Marquer la vente annulée
  UPDATE public.ventes
    SET statut = 'annulee',
        annulee_le = now(),
        annulee_par = v_uid,
        motif_annulation = p_motif,
        credit_restant = 0
    WHERE id = p_vente_id;
END;
$$;

-- ============ RPC : cancel_recouvrement ============

CREATE OR REPLACE FUNCTION public.cancel_recouvrement(
  p_recouvrement_id UUID,
  p_motif TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rec RECORD;
  v_alloc RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur peut annuler un recouvrement';
  END IF;
  IF p_motif IS NULL OR length(trim(p_motif)) < 3 THEN
    RAISE EXCEPTION 'Motif d''annulation requis (min 3 caractères)';
  END IF;

  SELECT * INTO v_rec FROM public.recouvrements WHERE id = p_recouvrement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recouvrement introuvable'; END IF;
  IF v_rec.statut = 'annulee' THEN
    RAISE EXCEPTION 'Recouvrement déjà annulé';
  END IF;

  -- Restaurer credit_restant sur chaque vente imputée
  FOR v_alloc IN
    SELECT vente_id, montant_alloue
    FROM public.recouvrement_allocations
    WHERE recouvrement_id = p_recouvrement_id
  LOOP
    UPDATE public.ventes
      SET credit_restant = credit_restant + v_alloc.montant_alloue
      WHERE id = v_alloc.vente_id AND statut = 'validee';
  END LOOP;

  -- Restaurer la dette client
  UPDATE public.clients
    SET dette_totale = dette_totale + v_rec.montant
    WHERE id = v_rec.client_id;

  UPDATE public.recouvrements
    SET statut = 'annulee',
        annule_le = now(),
        annule_par = v_uid,
        motif_annulation = p_motif
    WHERE id = p_recouvrement_id;
END;
$$;

-- ============ RPC : convert_sac_to_demi ============

CREATE OR REPLACE FUNCTION public.convert_sac_to_demi(
  p_magasin_id UUID,
  p_produit_sac_id UUID,
  p_produit_demi_id UUID,
  p_quantite_sacs NUMERIC,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_sac RECORD;
  v_demi RECORD;
  v_conv_id UUID;
  v_qte_demi NUMERIC(14,3);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.user_can_access_magasin(v_uid, p_magasin_id) THEN
    RAISE EXCEPTION 'Accès refusé à ce magasin';
  END IF;
  IF p_quantite_sacs IS NULL OR p_quantite_sacs <= 0 THEN
    RAISE EXCEPTION 'Quantité de sacs invalide';
  END IF;

  SELECT * INTO v_sac FROM public.produits WHERE id = p_produit_sac_id FOR UPDATE;
  IF NOT FOUND OR v_sac.magasin_id <> p_magasin_id THEN
    RAISE EXCEPTION 'Produit sac introuvable dans ce magasin';
  END IF;
  IF v_sac.type_emballage <> 'sac' THEN
    RAISE EXCEPTION 'Le produit source doit être de type sac';
  END IF;
  IF v_sac.stock_actuel < p_quantite_sacs THEN
    RAISE EXCEPTION 'Stock sacs insuffisant (dispo: %, demandé: %)', v_sac.stock_actuel, p_quantite_sacs;
  END IF;

  SELECT * INTO v_demi FROM public.produits WHERE id = p_produit_demi_id FOR UPDATE;
  IF NOT FOUND OR v_demi.magasin_id <> p_magasin_id THEN
    RAISE EXCEPTION 'Produit demi-sac introuvable dans ce magasin';
  END IF;
  IF v_demi.type_emballage <> 'demi_sac' THEN
    RAISE EXCEPTION 'Le produit cible doit être de type demi_sac';
  END IF;

  v_qte_demi := p_quantite_sacs * 2;

  UPDATE public.produits SET stock_actuel = stock_actuel - p_quantite_sacs WHERE id = p_produit_sac_id;
  UPDATE public.produits SET stock_actuel = stock_actuel + v_qte_demi WHERE id = p_produit_demi_id;

  INSERT INTO public.conversions_emballage
    (magasin_id, type_conversion, produit_sac_id, produit_demi_id, quantite_sacs, quantite_demi_produite, cree_par, notes)
  VALUES
    (p_magasin_id, 'sac_vers_demi', p_produit_sac_id, p_produit_demi_id, p_quantite_sacs, v_qte_demi, v_uid, p_notes)
  RETURNING id INTO v_conv_id;

  RETURN v_conv_id;
END;
$$;

-- ============ RPC : declare_sac_perce ============

CREATE OR REPLACE FUNCTION public.declare_sac_perce(
  p_magasin_id UUID,
  p_produit_sac_id UUID,
  p_produit_demi_id UUID,
  p_quantite_demi_recuperable NUMERIC,
  p_motif TEXT,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_sac RECORD;
  v_demi RECORD;
  v_conv_id UUID;
  v_rebut_id UUID;
  v_perte NUMERIC(14,3);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.user_can_access_magasin(v_uid, p_magasin_id) THEN
    RAISE EXCEPTION 'Accès refusé à ce magasin';
  END IF;
  IF p_quantite_demi_recuperable IS NULL OR p_quantite_demi_recuperable < 0 OR p_quantite_demi_recuperable > 2 THEN
    RAISE EXCEPTION 'Quantité demi-sacs récupérable doit être entre 0 et 2';
  END IF;
  IF p_motif IS NULL OR length(trim(p_motif)) < 3 THEN
    RAISE EXCEPTION 'Motif requis (min 3 caractères)';
  END IF;

  SELECT * INTO v_sac FROM public.produits WHERE id = p_produit_sac_id FOR UPDATE;
  IF NOT FOUND OR v_sac.magasin_id <> p_magasin_id OR v_sac.type_emballage <> 'sac' THEN
    RAISE EXCEPTION 'Produit sac invalide';
  END IF;
  IF v_sac.stock_actuel < 1 THEN
    RAISE EXCEPTION 'Stock sacs insuffisant';
  END IF;

  SELECT * INTO v_demi FROM public.produits WHERE id = p_produit_demi_id FOR UPDATE;
  IF NOT FOUND OR v_demi.magasin_id <> p_magasin_id OR v_demi.type_emballage <> 'demi_sac' THEN
    RAISE EXCEPTION 'Produit demi-sac invalide';
  END IF;

  v_perte := 2 - p_quantite_demi_recuperable; -- en équivalent demi-sacs

  -- Retirer 1 sac
  UPDATE public.produits SET stock_actuel = stock_actuel - 1 WHERE id = p_produit_sac_id;
  -- Ajouter demi-sacs récupérables
  IF p_quantite_demi_recuperable > 0 THEN
    UPDATE public.produits SET stock_actuel = stock_actuel + p_quantite_demi_recuperable WHERE id = p_produit_demi_id;
  END IF;

  -- Créer un rebut sur le demi-sac perdu
  IF v_perte > 0 THEN
    INSERT INTO public.rebuts (magasin_id, produit_id, quantite, motif, cree_par, notes)
    VALUES (p_magasin_id, p_produit_demi_id, v_perte, 'Sac percé : ' || p_motif, v_uid, p_notes)
    RETURNING id INTO v_rebut_id;
  END IF;

  INSERT INTO public.conversions_emballage
    (magasin_id, type_conversion, produit_sac_id, produit_demi_id, quantite_sacs, quantite_demi_produite, quantite_perdue, rebut_id, cree_par, notes)
  VALUES
    (p_magasin_id, 'sac_perce', p_produit_sac_id, p_produit_demi_id, 1, p_quantite_demi_recuperable, v_perte, v_rebut_id, v_uid, p_notes)
  RETURNING id INTO v_conv_id;

  RETURN v_conv_id;
END;
$$;

-- ============ RPC : create_rebut ============

CREATE OR REPLACE FUNCTION public.create_rebut(
  p_magasin_id UUID,
  p_produit_id UUID,
  p_quantite NUMERIC,
  p_motif TEXT,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_produit RECORD;
  v_rebut_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur peut valider un rebut';
  END IF;
  IF NOT public.user_can_access_magasin(v_uid, p_magasin_id) THEN
    RAISE EXCEPTION 'Accès refusé à ce magasin';
  END IF;
  IF p_quantite IS NULL OR p_quantite <= 0 THEN
    RAISE EXCEPTION 'Quantité invalide';
  END IF;
  IF p_motif IS NULL OR length(trim(p_motif)) < 3 THEN
    RAISE EXCEPTION 'Motif requis (min 3 caractères)';
  END IF;

  SELECT * INTO v_produit FROM public.produits WHERE id = p_produit_id FOR UPDATE;
  IF NOT FOUND OR v_produit.magasin_id <> p_magasin_id THEN
    RAISE EXCEPTION 'Produit introuvable dans ce magasin';
  END IF;
  IF v_produit.stock_actuel < p_quantite THEN
    RAISE EXCEPTION 'Stock insuffisant (dispo: %)', v_produit.stock_actuel;
  END IF;

  UPDATE public.produits SET stock_actuel = stock_actuel - p_quantite WHERE id = p_produit_id;

  INSERT INTO public.rebuts (magasin_id, produit_id, quantite, motif, cree_par, notes)
  VALUES (p_magasin_id, p_produit_id, p_quantite, p_motif, v_uid, p_notes)
  RETURNING id INTO v_rebut_id;

  RETURN v_rebut_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_vente(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_recouvrement(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.convert_sac_to_demi(UUID, UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.declare_sac_perce(UUID, UUID, UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_rebut(UUID, UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cancel_vente(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_recouvrement(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_sac_to_demi(UUID, UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.declare_sac_perce(UUID, UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_rebut(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;
