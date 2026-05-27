
-- 1. Tighten clients SELECT policy
DROP POLICY IF EXISTS "Scoped view clients" ON public.clients;
CREATE POLICY "Scoped view clients"
ON public.clients
FOR SELECT
TO authenticated
USING (
  is_admin()
  OR is_passager_systeme = true
  OR (
    magasin_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_magasins um
      WHERE um.user_id = auth.uid() AND um.magasin_id = clients.magasin_id
    )
  )
);

-- 2. Block direct edits to clients' financial / status fields outside designated RPCs
CREATE OR REPLACE FUNCTION public.tg_clients_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rpc_bypass text;
BEGIN
  BEGIN
    v_rpc_bypass := current_setting('app.clients_rpc', true);
  EXCEPTION WHEN OTHERS THEN
    v_rpc_bypass := NULL;
  END;

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
    IF v_rpc_bypass IS DISTINCT FROM 'on' THEN
      IF OLD.dette_totale IS DISTINCT FROM NEW.dette_totale THEN
        RAISE EXCEPTION 'La dette totale ne peut être modifiée que via les fonctions de vente et de recouvrement';
      END IF;
      IF OLD.budget_max IS DISTINCT FROM NEW.budget_max AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Seul un administrateur peut modifier le budget maximum';
      END IF;
      IF OLD.statut IS DISTINCT FROM NEW.statut AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Seul un administrateur peut modifier le statut du client';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Patch RPCs to set the bypass flag around financial updates
CREATE OR REPLACE FUNCTION public.create_vente(
  p_magasin_id uuid,
  p_client_id uuid,
  p_mode mode_paiement,
  p_montant_paye numeric,
  p_lignes jsonb,
  p_notes text DEFAULT NULL::text,
  p_remise numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_vente_id UUID;
  v_numero BIGINT;
  v_client RECORD;
  v_ligne JSONB;
  v_prod RECORD;
  v_qty NUMERIC;
  v_prix NUMERIC;
  v_sous_total NUMERIC(14,2) := 0;
  v_total NUMERIC(14,2);
  v_credit NUMERIC(14,2) := 0;
  v_paye NUMERIC(14,2) := COALESCE(p_montant_paye, 0);
  v_remise NUMERIC(14,2) := COALESCE(p_remise, 0);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.user_can_access_magasin(v_uid, p_magasin_id) THEN
    RAISE EXCEPTION 'Accès refusé à ce magasin';
  END IF;
  IF v_remise > 0 AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur peut accorder une remise';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  IF NOT v_client.is_passager_systeme
     AND v_client.magasin_id IS DISTINCT FROM p_magasin_id THEN
    RAISE EXCEPTION 'Ce client appartient à un autre magasin';
  END IF;

  IF p_lignes IS NULL OR jsonb_array_length(p_lignes) = 0 THEN
    RAISE EXCEPTION 'Aucune ligne de vente';
  END IF;

  SELECT COALESCE(MAX(numero),0)+1 INTO v_numero FROM public.ventes WHERE magasin_id = p_magasin_id;

  INSERT INTO public.ventes (magasin_id, client_id, numero, mode_paiement, vendeur_id, notes, montant_total, montant_paye, montant_credit, credit_restant, remise)
  VALUES (p_magasin_id, p_client_id, v_numero, p_mode, v_uid, p_notes, 0, 0, 0, 0, v_remise)
  RETURNING id INTO v_vente_id;

  FOR v_ligne IN SELECT * FROM jsonb_array_elements(p_lignes) LOOP
    v_qty := (v_ligne->>'quantite')::numeric;
    SELECT * INTO v_prod FROM public.produits WHERE id = (v_ligne->>'produit_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produit introuvable'; END IF;
    IF v_prod.magasin_id <> p_magasin_id THEN RAISE EXCEPTION 'Produit hors magasin'; END IF;
    IF v_prod.stock_actuel < v_qty THEN RAISE EXCEPTION 'Stock insuffisant pour %', v_prod.nom; END IF;
    v_prix := COALESCE((v_ligne->>'prix_unitaire')::numeric, v_prod.prix_vente_unitaire);

    INSERT INTO public.vente_lignes (vente_id, produit_id, quantite, prix_unitaire, montant_ligne)
    VALUES (v_vente_id, v_prod.id, v_qty, v_prix, v_qty * v_prix);

    UPDATE public.produits SET stock_actuel = stock_actuel - v_qty WHERE id = v_prod.id;
    v_sous_total := v_sous_total + (v_qty * v_prix);
  END LOOP;

  IF v_remise > v_sous_total THEN
    RAISE EXCEPTION 'Remise supérieure au sous-total';
  END IF;
  v_total := v_sous_total - v_remise;

  IF p_mode = 'comptant' THEN
    v_paye := v_total; v_credit := 0;
  ELSIF p_mode = 'credit_total' THEN
    v_paye := 0; v_credit := v_total;
  ELSE
    IF v_paye > v_total THEN v_paye := v_total; END IF;
    v_credit := v_total - v_paye;
  END IF;

  UPDATE public.ventes
    SET montant_total = v_total, montant_paye = v_paye, montant_credit = v_credit, credit_restant = v_credit
   WHERE id = v_vente_id;

  IF v_credit > 0 AND NOT v_client.is_passager_systeme THEN
    PERFORM set_config('app.clients_rpc','on', true);
    UPDATE public.clients SET dette_totale = dette_totale + v_credit WHERE id = p_client_id;
    PERFORM set_config('app.clients_rpc','off', true);
  END IF;

  RETURN v_vente_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_recouvrement(
  p_magasin_id uuid,
  p_client_id uuid,
  p_montant numeric,
  p_notes text DEFAULT NULL::text,
  p_type text DEFAULT 'paiement'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_rec_id UUID;
  v_numero BIGINT;
  v_reste NUMERIC(14,2);
  v_client RECORD;
  v_vente RECORD;
  v_alloc NUMERIC(14,2);
  v_type TEXT := COALESCE(p_type,'paiement');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.user_can_access_magasin(v_uid, p_magasin_id) THEN
    RAISE EXCEPTION 'Accès refusé à ce magasin';
  END IF;
  IF p_montant IS NULL OR p_montant <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF v_type NOT IN ('paiement','reduction') THEN RAISE EXCEPTION 'Type invalide'; END IF;
  IF v_type = 'reduction' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur peut accorder une réduction de dette';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  IF v_client.is_passager_systeme THEN RAISE EXCEPTION 'Le client Passager n''a pas de dette à recouvrer'; END IF;
  IF p_montant > v_client.dette_totale THEN
    RAISE EXCEPTION 'Montant (%) supérieur à la dette totale (%)', p_montant, v_client.dette_totale;
  END IF;

  SELECT COALESCE(MAX(numero),0)+1 INTO v_numero FROM public.recouvrements WHERE magasin_id = p_magasin_id;

  INSERT INTO public.recouvrements (magasin_id, client_id, numero, montant, vendeur_id, notes, type)
  VALUES (p_magasin_id, p_client_id, v_numero, p_montant, v_uid, p_notes, v_type)
  RETURNING id INTO v_rec_id;

  v_reste := p_montant;
  FOR v_vente IN
    SELECT id, credit_restant FROM public.ventes
    WHERE client_id = p_client_id AND statut = 'validee' AND credit_restant > 0
    ORDER BY date_vente ASC
  LOOP
    EXIT WHEN v_reste <= 0;
    v_alloc := LEAST(v_reste, v_vente.credit_restant);
    INSERT INTO public.recouvrement_allocations (recouvrement_id, vente_id, montant_alloue)
    VALUES (v_rec_id, v_vente.id, v_alloc);
    UPDATE public.ventes SET credit_restant = credit_restant - v_alloc WHERE id = v_vente.id;
    v_reste := v_reste - v_alloc;
  END LOOP;

  PERFORM set_config('app.clients_rpc','on', true);
  UPDATE public.clients SET dette_totale = dette_totale - p_montant WHERE id = p_client_id;
  PERFORM set_config('app.clients_rpc','off', true);

  RETURN v_rec_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_vente(p_vente_id uuid, p_motif text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_vente RECORD;
  v_ligne RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Seul un administrateur peut annuler une vente'; END IF;

  SELECT * INTO v_vente FROM public.ventes WHERE id = p_vente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vente introuvable'; END IF;
  IF v_vente.statut = 'annulee' THEN RAISE EXCEPTION 'Vente déjà annulée'; END IF;

  FOR v_ligne IN SELECT produit_id, quantite FROM public.vente_lignes WHERE vente_id = p_vente_id LOOP
    UPDATE public.produits SET stock_actuel = stock_actuel + v_ligne.quantite WHERE id = v_ligne.produit_id;
  END LOOP;

  IF v_vente.credit_restant > 0 THEN
    PERFORM set_config('app.clients_rpc','on', true);
    UPDATE public.clients SET dette_totale = dette_totale - v_vente.credit_restant WHERE id = v_vente.client_id;
    PERFORM set_config('app.clients_rpc','off', true);
  END IF;

  UPDATE public.ventes SET statut='annulee', motif_annulation=p_motif, annulee_par=v_uid, annulee_le=now(), credit_restant=0
   WHERE id = p_vente_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_recouvrement(p_recouvrement_id uuid, p_motif text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_rec RECORD;
  v_alloc RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Seul un administrateur peut annuler un recouvrement'; END IF;

  SELECT * INTO v_rec FROM public.recouvrements WHERE id = p_recouvrement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recouvrement introuvable'; END IF;
  IF v_rec.statut = 'annulee' THEN RAISE EXCEPTION 'Déjà annulé'; END IF;

  FOR v_alloc IN SELECT vente_id, montant_alloue FROM public.recouvrement_allocations WHERE recouvrement_id = p_recouvrement_id LOOP
    UPDATE public.ventes SET credit_restant = credit_restant + v_alloc.montant_alloue WHERE id = v_alloc.vente_id;
  END LOOP;

  PERFORM set_config('app.clients_rpc','on', true);
  UPDATE public.clients SET dette_totale = dette_totale + v_rec.montant WHERE id = v_rec.client_id;
  PERFORM set_config('app.clients_rpc','off', true);

  UPDATE public.recouvrements SET statut='annulee', motif_annulation=p_motif, annule_par=v_uid, annule_le=now()
   WHERE id = p_recouvrement_id;
END;
$function$;

-- 4. Revoke anon / public EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.create_vente(uuid,uuid,mode_paiement,numeric,jsonb,text,numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_vente(uuid,uuid,mode_paiement,numeric,jsonb,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_recouvrement(uuid,uuid,numeric,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_recouvrement(uuid,uuid,numeric,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_vente(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_recouvrement(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.convert_sac_to_demi(uuid,uuid,uuid,numeric,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.declare_sac_perce(uuid,uuid,uuid,numeric,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_rebut(uuid,uuid,numeric,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_can_access_magasin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_clients_admin_fields() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_produits_auto_reference() FROM PUBLIC, anon;
