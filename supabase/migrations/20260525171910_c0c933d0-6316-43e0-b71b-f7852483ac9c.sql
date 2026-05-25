-- Créer la table fournisseurs
CREATE TABLE public.fournisseurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  telephone text,
  email text,
  ville text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Trigger updated_at sur fournisseurs
CREATE TRIGGER update_fournisseurs_updated_at
BEFORE UPDATE ON public.fournisseurs
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();

-- RLS fournisseurs
ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view fournisseurs"
ON public.fournisseurs FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Admins insert fournisseurs"
ON public.fournisseurs FOR INSERT
TO authenticated WITH CHECK (is_admin());

CREATE POLICY "Admins update fournisseurs"
ON public.fournisseurs FOR UPDATE
TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admins delete fournisseurs"
ON public.fournisseurs FOR DELETE
TO authenticated USING (is_admin());

-- Ajouter fournisseur_id sur produits
ALTER TABLE public.produits ADD COLUMN fournisseur_id uuid REFERENCES public.fournisseurs(id) ON DELETE SET NULL;

-- Créer la table commandes_fournisseur
CREATE TABLE public.commandes_fournisseur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fournisseur_id uuid NOT NULL REFERENCES public.fournisseurs(id) ON DELETE RESTRICT,
  magasin_id uuid NOT NULL REFERENCES public.magasins(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite_demandee numeric NOT NULL DEFAULT 1,
  statut text NOT NULL DEFAULT 'brouillon',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chk_commande_statut CHECK (statut IN ('brouillon','envoyee','recue','annulee')),
  CONSTRAINT chk_commande_qte_positive CHECK (quantite_demandee > 0)
);

-- Trigger updated_at sur commandes_fournisseur
CREATE TRIGGER update_commandes_fournisseur_updated_at
BEFORE UPDATE ON public.commandes_fournisseur
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();

-- RLS commandes_fournisseur
ALTER TABLE public.commandes_fournisseur ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view commandes in their magasins"
ON public.commandes_fournisseur FOR SELECT
TO authenticated
USING (user_can_access_magasin(auth.uid(), magasin_id));

CREATE POLICY "Users insert commandes in their magasins"
ON public.commandes_fournisseur FOR INSERT
TO authenticated
WITH CHECK (user_can_access_magasin(auth.uid(), magasin_id));

CREATE POLICY "Users update commandes in their magasins"
ON public.commandes_fournisseur FOR UPDATE
TO authenticated
USING (user_can_access_magasin(auth.uid(), magasin_id))
WITH CHECK (user_can_access_magasin(auth.uid(), magasin_id));

CREATE POLICY "Admins delete commandes"
ON public.commandes_fournisseur FOR DELETE
TO authenticated USING (is_admin());
