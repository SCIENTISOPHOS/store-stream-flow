CREATE OR REPLACE FUNCTION public.create_vente(
  p_magasin_id uuid,
  p_client_id uuid,
  p_mode public.mode_paiement,
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

  IF p_mode = 'comptant'::public.mode_paiement THEN
    v_paye := v_total;
    v_credit := 0;
  ELSIF p_mode = 'credit'::public.mode_paiement THEN
    v_paye := 0;
    v_credit := v_total;
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

REVOKE EXECUTE ON FUNCTION public.create_vente(uuid,uuid,public.mode_paiement,numeric,jsonb,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_vente(uuid,uuid,public.mode_paiement,numeric,jsonb,text,numeric) TO authenticated;