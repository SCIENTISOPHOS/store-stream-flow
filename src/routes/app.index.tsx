import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useMagasinStore } from "@/lib/magasin-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, User as UserIcon, Store, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { magasinNom } = useMagasinStore();

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="text-muted-foreground mt-1">
          Bienvenue, vous travaillez actuellement sur <span className="font-semibold text-foreground">{magasinNom}</span>.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Magasin actif</CardDescription>
              <Store className="w-4 h-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-xl">{magasinNom}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Utilisateur</CardDescription>
              <UserIcon className="w-4 h-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-base font-medium truncate">{user?.email}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Rôle</CardDescription>
              <Shield className="w-4 h-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-base">
              <Badge variant={isAdmin ? "default" : "secondary"}>
                {isAdmin ? "Administrateur" : "Utilisateur"}
              </Badge>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tranche 1 livrée</CardTitle>
          <CardDescription>Fondations du système opérationnelles</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {[
            "Authentification email/mot de passe + Google",
            "Cloisonnement par magasin de session (RG-STU-01/02)",
            "Rôles Administrateur / Utilisateur (RG-ROL-01 à 10)",
            "CRUD magasins exclusif Admin avec formulaires pré-remplis (RG-STU-05/06)",
            "Journal d'audit inviolable (RG-AUD-01/02/03)",
            "Sécurité RLS sur toutes les tables, fonction has_role anti-récursive",
          ].map((t) => (
            <div key={t} className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
              <span>{t}</span>
            </div>
          ))}
          <div className="pt-4 mt-4 border-t text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Prochaine étape : Tranche 2</p>
            <p>Clients (centralisés, plafond global) et Produits (cloisonnés par magasin, Sac/Demi-sac).</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
