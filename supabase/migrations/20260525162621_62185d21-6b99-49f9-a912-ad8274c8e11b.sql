-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE public.mode_paiement AS ENUM ('comptant', 'credit', 'mixte');
CREATE TYPE public.statut_transaction AS ENUM ('validee', 'annulee');

-- ============================================
-- TABLE: ventes
-- ============================================
CREATE TABLE public.ventes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  magasin_id UUID NOT NULL REFERENCES public.magasins(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  numero BIGINT NOT NULL,
  date_vente TIMESTAMPTZ NOT NULL DEFAULT now(),
  mode_paiement public.mode_paiement NOT NULL,
  montant_total NUMERIC(14,2) NOT NULL CHECK (montant_total >= 0),
  montant_paye NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (montant_paye >= 0),
  montant_credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (montant_credit >= 0),
  credit_restant NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_restant >= 0),
  statut public.statut_transaction NOT NULL DEFAULT 'validee',
  annulee_le TIMESTAMPTZ,
  annulee_par UUID,
  motif_annulation TEXT,
  vendeur_id UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ventes_total CHECK (montant_paye + montant_credit = montant_total),
  CONSTRAINT chk_ventes_credit_restant CHECK (credit_restant <= montant_credit),
  CONSTRAINT uq_ventes_numero_magasin UNIQUE (magasin_id, numero)
);

CREATE INDEX idx_ventes_magasin ON public.ventes(magasin_id);
CREATE INDEX idx_ventes_client ON public.ventes(client_id);
CREATE INDEX idx_ventes_date ON public.ventes(date_vente DESC);
CREATE INDEX idx_ventes_credit_restant ON public.ventes(client_id, date_vente)
  WHERE statut = 'validee' AND credit_restant > 0;

ALTER TABLE public.ventes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view ventes in their magasins"
  ON public.ventes FOR SELECT TO authenticated
  USING (public.user_can_access_magasin(auth.uid(), magasin_id));

-- INSERT/UPDATE/DELETE bloqués : tout passe par les RPC SECURITY DEFINER

-- ============================================
-- TABLE: vente_lignes
-- ============================================
CREATE TABLE public.vente_lignes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vente_id UUID NOT NULL REFERENCES public.ventes(id) ON DELETE CASCADE,
  produit_id UUID NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite NUMERIC(14,3) NOT NULL CHECK (quantite > 0),
  prix_unitaire NUMERIC(14,2) NOT NULL CHECK (prix_unitaire >= 0),
  montant_ligne NUMERIC(14,2) NOT NULL CHECK (montant_ligne >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vente_lignes_vente ON public.vente_lignes(vente_id);
CREATE INDEX idx_vente_lignes_produit ON public.vente_lignes(produit_id);

ALTER TABLE public.vente_lignes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view vente_lignes via vente"
  ON public.vente_lignes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ventes v
    WHERE v.id = vente_id AND public.user_can_access_magasin(auth.uid(), v.magasin_id)
  ));

-- ============================================
-- TABLE: recouvrements
-- ============================================
CREATE TABLE public.recouvrements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  magasin_id UUID NOT NULL REFERENCES public.magasins(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  numero BIGINT NOT NULL,
  date_recouvrement TIMESTAMPTZ NOT NULL DEFAULT now(),
  montant NUMERIC(14,2) NOT NULL CHECK (montant > 0),
  statut public.statut_transaction NOT NULL DEFAULT 'validee',
  annule_le TIMESTAMPTZ,
  annule_par UUID,
  motif_annulation TEXT,
  vendeur_id UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_recouvrements_numero_magasin UNIQUE (magasin_id, numero)
);

CREATE INDEX idx_recouvrements_client ON public.recouvrements(client_id);
CREATE INDEX idx_recouvrements_magasin ON public.recouvrements(magasin_id);
CREATE INDEX idx_recouvrements_date ON public.recouvrements(date_recouvrement DESC);

ALTER TABLE public.recouvrements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view recouvrements in their magasins"
  ON public.recouvrements FOR SELECT TO authenticated
  USING (public.user_can_access_magasin(auth.uid(), magasin_id));

-- ============================================
-- TABLE: recouvrement_allocations (FIFO inter-magasins)
-- ============================================
CREATE TABLE public.recouvrement_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recouvrement_id UUID NOT NULL REFERENCES public.recouvrements(id) ON DELETE CASCADE,
  vente_id UUID NOT NULL REFERENCES public.ventes(id) ON DELETE RESTRICT,
  montant_alloue NUMERIC(14,2) NOT NULL CHECK (montant_alloue > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alloc_recouvrement ON public.recouvrement_allocations(recouvrement_id);
CREATE INDEX idx_alloc_vente ON public.recouvrement_allocations(vente_id);

ALTER TABLE public.recouvrement_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view allocations via recouvrement"
  ON public.recouvrement_allocations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.recouvrements r
    WHERE r.id = recouvrement_id AND public.user_can_access_magasin(auth.uid(), r.magasin_id)
  ));

-- ============================================
-- AUDIT TRIGGERS
-- ============================================
CREATE TRIGGER tg_ventes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.ventes
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit();

CREATE TRIGGER tg_recouvrements_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.recouvrements
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit();

-- ============================================
-- RPC: create_vente (atomique)
-- p_lignes: jsonb array of { produit_id: uuid, quantite: number, prix_unitaire: number }
-- ============================================
CREATE OR REPLACE FUNCTION public.create_vente(
  p_magasin_id UUID,
  p_client_id UUID,
  p_mode public.mode_paiement,
  p_montant_paye NUMERIC,
  p_lignes JSONB,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Verrouille le client pour éviter race sur dette
  SELECT * INTO v_client FROM public.clients
    WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client introuvable';
  END IF;
  IF v_client.statut <> 'actif' THEN
    RAISE EXCEPTION 'Client % (statut: %)', v_client.nom, v_client.statut;
  END IF;

  -- Calcule total + décrémente stock + crée lignes
  FOR v_ligne IN SELECT * FROM jsonb_array_elements(p_lignes)
  LOOP
    v_qte := (v_ligne->>'quantite')::numeric;
    v_pu := (v_ligne->>'prix_unitaire')::numeric;

    IF v_qte IS NULL OR v_qte <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide dans la vente';
    END IF;

    -- Verrouille le produit
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

  -- Validation mode paiement
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
  ELSE -- mixte
    IF p_montant_paye <= 0 OR p_montant_paye >= v_total THEN
      RAISE EXCEPTION 'Paiement mixte : montant payé doit être > 0 et < total';
    END IF;
    v_credit := v_total - p_montant_paye;
  END IF;

  -- Vérif budget client (crédit ou mixte)
  IF v_credit > 0 THEN
    IF v_client.is_passager_systeme THEN
      RAISE EXCEPTION 'Le client Passager ne peut pas avoir de crédit';
    END IF;
    IF v_client.dette_totale + v_credit > v_client.budget_max THEN
      RAISE EXCEPTION 'Budget dépassé (dette actuelle: %, nouveau crédit: %, plafond: %)',
        v_client.dette_totale, v_credit, v_client.budget_max;
    END IF;
  END IF;

  -- Numéro séquentiel par magasin
  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero
    FROM public.ventes WHERE magasin_id = p_magasin_id;

  -- Insertion vente
  INSERT INTO public.ventes (
    magasin_id, client_id, numero, mode_paiement,
    montant_total, montant_paye, montant_credit, credit_restant,
    vendeur_id, notes
  ) VALUES (
    p_magasin_id, p_client_id, v_numero, p_mode,
    v_total, LEAST(p_montant_paye, v_total), v_credit, v_credit,
    v_uid, p_notes
  ) RETURNING id INTO v_vente_id;

  -- Insertion lignes
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

  -- Maj dette client
  IF v_credit > 0 THEN
    UPDATE public.clients
      SET dette_totale = dette_totale + v_credit
      WHERE id = p_client_id;
  END IF;

  RETURN v_vente_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_vente(UUID, UUID, public.mode_paiement, NUMERIC, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_vente(UUID, UUID, public.mode_paiement, NUMERIC, JSONB, TEXT) TO authenticated;

-- ============================================
-- RPC: create_recouvrement (FIFO inter-magasins)
-- ============================================
CREATE OR REPLACE FUNCTION public.create_recouvrement(
  p_magasin_id UUID,
  p_client_id UUID,
  p_montant NUMERIC,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_can_access_magasin(v_uid, p_magasin_id) THEN
    RAISE EXCEPTION 'Accès refusé à ce magasin';
  END IF;
  IF p_montant IS NULL OR p_montant <= 0 THEN
    RAISE EXCEPTION 'Montant invalide';
  END IF;

  SELECT * INTO v_client FROM public.clients
    WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  IF v_client.is_passager_systeme THEN
    RAISE EXCEPTION 'Le client Passager n''a pas de dette à recouvrer';
  END IF;
  IF p_montant > v_client.dette_totale THEN
    RAISE EXCEPTION 'Montant (%) supérieur à la dette totale (%)', p_montant, v_client.dette_totale;
  END IF;

  -- Numéro séquentiel par magasin
  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero
    FROM public.recouvrements WHERE magasin_id = p_magasin_id;

  INSERT INTO public.recouvrements (magasin_id, client_id, numero, montant, vendeur_id, notes)
  VALUES (p_magasin_id, p_client_id, v_numero, p_montant, v_uid, p_notes)
  RETURNING id INTO v_rec_id;

  -- FIFO : imputation aux ventes validées avec crédit restant, toutes magasins confondus
  v_reste := p_montant;
  FOR v_vente IN
    SELECT id, credit_restant
    FROM public.ventes
    WHERE client_id = p_client_id
      AND statut = 'validee'
      AND credit_restant > 0
    ORDER BY date_vente ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_reste <= 0;
    v_alloc := LEAST(v_reste, v_vente.credit_restant);

    INSERT INTO public.recouvrement_allocations (recouvrement_id, vente_id, montant_alloue)
    VALUES (v_rec_id, v_vente.id, v_alloc);

    UPDATE public.ventes
      SET credit_restant = credit_restant - v_alloc
      WHERE id = v_vente.id;

    v_reste := v_reste - v_alloc;
  END LOOP;

  IF v_reste > 0 THEN
    RAISE EXCEPTION 'Incohérence : reste % non imputable (dette client désynchronisée)', v_reste;
  END IF;

  -- Maj dette client
  UPDATE public.clients
    SET dette_totale = dette_totale - p_montant
    WHERE id = p_client_id;

  RETURN v_rec_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_recouvrement(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_recouvrement(UUID, UUID, NUMERIC, TEXT) TO authenticated;
