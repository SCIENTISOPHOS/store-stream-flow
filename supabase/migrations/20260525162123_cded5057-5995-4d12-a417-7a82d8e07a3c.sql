-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE public.client_type AS ENUM ('particulier', 'professionnel', 'passager');
CREATE TYPE public.entity_statut AS ENUM ('actif', 'bloque', 'archive');
CREATE TYPE public.type_emballage AS ENUM ('sac', 'demi_sac', 'unite');

-- ============================================
-- TABLE: clients (centralisée — partagée entre tous les magasins)
-- ============================================
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  telephone TEXT,
  ville TEXT,
  type public.client_type NOT NULL DEFAULT 'particulier',
  statut public.entity_statut NOT NULL DEFAULT 'actif',
  budget_max NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (budget_max >= 0),
  dette_totale NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (dette_totale >= 0),
  notes TEXT,
  is_passager_systeme BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_clients_passager_unique
  ON public.clients (is_passager_systeme)
  WHERE is_passager_systeme = true;

CREATE INDEX idx_clients_statut ON public.clients(statut);
CREATE INDEX idx_clients_nom ON public.clients(lower(nom));

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view clients"
  ON public.clients FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert clients"
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND is_passager_systeme = false);

CREATE POLICY "Authenticated update clients (non passager)"
  ON public.clients FOR UPDATE TO authenticated
  USING (is_passager_systeme = false)
  WITH CHECK (is_passager_systeme = false);

CREATE POLICY "Admins delete clients (non passager)"
  ON public.clients FOR DELETE TO authenticated
  USING (public.is_admin() AND is_passager_systeme = false);

-- Trigger updated_at
CREATE TRIGGER tg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Trigger audit
CREATE TRIGGER tg_clients_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit();

-- Protection client Passager : empêche modif du flag/budget
CREATE OR REPLACE FUNCTION public.tg_protect_passager()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.is_passager_systeme = true THEN
    IF NEW.is_passager_systeme = false THEN
      RAISE EXCEPTION 'Impossible de retirer le statut système du client Passager';
    END IF;
    IF NEW.budget_max <> 0 THEN
      RAISE EXCEPTION 'Le client Passager doit toujours avoir un budget de 0';
    END IF;
    IF NEW.type <> 'passager' THEN
      RAISE EXCEPTION 'Le type du client Passager ne peut pas être modifié';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_clients_protect_passager
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_passager();

-- Insertion du client Passager (système, bypass policies via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.seed_passager()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.clients (nom, type, statut, budget_max, is_passager_systeme, notes)
  VALUES ('Client Passager', 'passager', 'actif', 0, true, 'Client système pour ventes au comptoir sans identification')
  ON CONFLICT DO NOTHING;
END;
$$;

SELECT public.seed_passager();

-- ============================================
-- TABLE: produits (cloisonnée par magasin)
-- ============================================
CREATE TABLE public.produits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  magasin_id UUID NOT NULL REFERENCES public.magasins(id) ON DELETE RESTRICT,
  nom TEXT NOT NULL,
  reference TEXT,
  type_emballage public.type_emballage NOT NULL DEFAULT 'unite',
  prix_achat_unitaire NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (prix_achat_unitaire >= 0),
  prix_vente_unitaire NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (prix_vente_unitaire >= 0),
  stock_actuel NUMERIC(14,3) NOT NULL DEFAULT 0,
  stock_seuil_alerte NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (stock_seuil_alerte >= 0),
  statut public.entity_statut NOT NULL DEFAULT 'actif',
  produit_parent_id UUID REFERENCES public.produits(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_produits_magasin ON public.produits(magasin_id);
CREATE INDEX idx_produits_statut ON public.produits(statut);
CREATE INDEX idx_produits_parent ON public.produits(produit_parent_id);
CREATE UNIQUE INDEX idx_produits_ref_magasin
  ON public.produits(magasin_id, lower(reference))
  WHERE reference IS NOT NULL;

ALTER TABLE public.produits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view produits in their magasins"
  ON public.produits FOR SELECT TO authenticated
  USING (public.user_can_access_magasin(auth.uid(), magasin_id));

CREATE POLICY "Users insert produits in their magasins"
  ON public.produits FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_magasin(auth.uid(), magasin_id));

CREATE POLICY "Users update produits in their magasins"
  ON public.produits FOR UPDATE TO authenticated
  USING (public.user_can_access_magasin(auth.uid(), magasin_id))
  WITH CHECK (public.user_can_access_magasin(auth.uid(), magasin_id));

CREATE POLICY "Admins delete produits"
  ON public.produits FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE TRIGGER tg_produits_updated_at
  BEFORE UPDATE ON public.produits
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER tg_produits_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.produits
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit();
