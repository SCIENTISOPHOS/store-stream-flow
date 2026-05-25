
# Plan : Système de gestion de stocks multi-magasins

Stack : **React + TanStack Start + Lovable Cloud** (Postgres, Auth, RLS, Storage). Les règles Django du DIRG sont adaptées :
- "Bloc transactionnel Django" → **fonctions Postgres `SECURITY DEFINER`** appelées via RPC (atomicité native, rollback automatique).
- Rôles `Utilisateur` / `Administrateur` → table `user_roles` + fonction `has_role()` + RLS (jamais de rôle sur `profiles`).
- Sélection du magasin de session → stockée côté client (Zustand) + vérifiée systématiquement côté serveur via RLS et server functions.
- Journal d'audit inviolable → table `audit_log` sans policy UPDATE/DELETE, écrite par triggers Postgres.

## Découpage en 6 tranches livrables

Je vous propose de livrer et valider **une tranche à la fois**. Chaque tranche est une app fonctionnelle de bout en bout.

### Tranche 1 — Fondations (auth, magasins, rôles, sélection de session)
- Activation Lovable Cloud
- Tables : `profiles`, `user_roles` (enum `admin`/`user`), `magasins`, `user_magasins` (rattachement)
- RLS + fonction `has_role()`
- Auth email/password + Google
- Page de login → écran de sélection du magasin → layout `_authenticated` avec garde
- Page admin : CRUD magasins (formulaires pré-remplis RG-STU-06)
- Journal d'audit (table + triggers de base)
- Couvre : §1 complet, §8 base, §9 base

### Tranche 2 — Clients et Produits
- Tables `clients` (centralisés, plafond global), `produits` (cloisonnés par magasin, conditionnement Sac/Demi-sac)
- CRUD avec règles de rôles (RG-CLI-06/07/09, RG-PROD-06/07/11)
- Statuts `En attente`/`Actif`/`Bloqué` clients, `Archivé` produits
- Suppression conditionnée à l'historique
- Alerte stock seuil + blocage seuil>0 sur Demi-sacs (RG-PROD-05)
- Couvre : §3, §4 (sauf découpe et pertes)

### Tranche 3 — Ventes, caisse, recouvrements
- Tables `ventes`, `lignes_vente`, `recouvrements`, `caisse_mouvements`
- RPC atomique `create_vente()` : décrémente stock, crédite caisse, met à jour dette client, contrôle plafond (RG-CLI-03/04), promesses de règlement
- Calculateur de monnaie (RG-VTE-02)
- Modes Cash / Crédit total / Mixte
- Recouvrement avec FIFO inter-magasins (RG-REC-01)
- Couvre : §5 (sauf annulations), §6 (sauf annulations)

### Tranche 4 — Opérations spéciales et annulations atomiques
- RPC `creer_demi()` (RG-PROD-09)
- Pertes "Sacs percés" workflow 2 étapes (RG-PROD-10)
- RPC `annuler_vente()` atomique → Bon d'avoir (RG-VTE-04)
- RPC `annuler_recouvrement()` atomique → réouverture FIFO (RG-REC-03)
- Toutes les RPC en `SECURITY DEFINER` avec `BEGIN/EXCEPTION WHEN OTHERS THEN RAISE` pour rollback complet

### Tranche 5 — Fournisseurs, suggestions, achats "En route"
- Tables `fournisseurs`, `commandes_achat`, `lignes_commande`, `frais_approche`, `paiements_fournisseur`
- Générateur de suggestions automatique (RG-FOUR-02)
- Workflow : Suggestion → Validée → En route → Réceptionnée (ventilation multi-magasins RG-FOUR-07)
- Calcul automatique du prix de revient (RG-FOUR-06)
- Dette fournisseur
- Couvre : §2

### Tranche 6 — PDF, statistiques, audit complet
- Génération PDF côté serveur (factures, reçus, bons d'avoir, états de stocks, rapports fournisseurs) avec entête du magasin de session
- Stockés dans Lovable Cloud Storage
- Dashboard admin : palmarès ventes, dettes critiques, alertes promesses, alertes stock seuil
- Visualisation du journal d'audit (admin, lecture seule)
- Couvre : §7, finition §9

## Stack technique par couche

| Couche | Choix |
|---|---|
| Routing | TanStack Router (`/login`, `/select-magasin`, `/_authenticated/...`) |
| Data fetching | TanStack Query + `createServerFn` + `requireSupabaseAuth` |
| Transactions atomiques | Fonctions Postgres `SECURITY DEFINER`, appelées via `supabase.rpc()` |
| State magasin de session | Zustand persistant + claim côté serveur via header custom vérifié à chaque RPC |
| UI | shadcn/ui + Tailwind, formulaires `react-hook-form` + `zod` |
| PDF | `@react-pdf/renderer` côté serveur dans une server function |
| Audit | Triggers Postgres `AFTER INSERT/UPDATE/DELETE` sur tables sensibles |

## Points de vigilance

1. **Magasin de session** : ne PEUT PAS être seulement côté client. Chaque RPC reçoit un `p_magasin_id` et vérifie via `has_role + appartenance user_magasins` que l'utilisateur y a droit.
2. **Inviolabilité audit (RG-AUD-03)** : aucune policy `UPDATE`/`DELETE` sur `audit_log`, même pour l'admin. Le rôle `service_role` lui-même ne devrait pas y écrire en dehors des triggers.
3. **Suppressions conditionnées** : implémentées dans des RPC qui vérifient l'historique avant `DELETE`, jamais en `delete()` direct côté client.
4. **FIFO inter-magasins** : la dette client est globale ; le FIFO solde les factures les plus anciennes tous magasins confondus.
5. **Client passager** : profil unique, ID fixe, jamais modifiable, plafond strictement 0.

## Ce que je vous demande maintenant

Confirmez :
1. **On démarre par la Tranche 1** (fondations) ? Je l'implémente directement après votre OK.
2. **Méthodes d'auth** : email/password + Google (défaut Lovable) — ou seulement email/password ?
3. **Profil utilisateur** : on stocke un nom d'affichage + (optionnel) téléphone, en plus de l'email ? Nécessaire pour les logs d'audit lisibles.
4. **Devise** : XAF (FCFA) vu les villes citées (Douala, Yaoundé, Bafoussam, Garoua) ?
5. **Direction visuelle** : je propose un style **sobre/pro** (palette `Slate & Steel` ou `Navy Trust`, typo `outfit-figtree`) adapté à un outil métier dense. OK ou vous voulez voir des options visuelles ?

Dès vos réponses, je lance la Tranche 1.
