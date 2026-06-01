ALTER TABLE public.clients DISABLE TRIGGER USER;
INSERT INTO public.clients (nom, type, statut, is_passager_systeme, allow_cross_magasin, budget_max, dette_totale)
SELECT 'Passager', 'particulier', 'actif', true, true, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.clients WHERE is_passager_systeme = true);
ALTER TABLE public.clients ENABLE TRIGGER USER;