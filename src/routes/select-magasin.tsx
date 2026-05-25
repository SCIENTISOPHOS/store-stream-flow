import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMagasinStore } from "@/lib/magasin-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Store, LogOut, MapPin, Phone } from "lucide-react";

export const Route = createFileRoute("/select-magasin")({
  component: SelectMagasinPage,
});

function SelectMagasinPage() {
  const navigate = useNavigate();
  const { user, isAdmin, loading, signOut } = useAuth();
  const setMagasin = useMagasinStore((s) => s.setMagasin);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const { data: magasins, isLoading } = useQuery({
    queryKey: ["available-magasins", user?.id, isAdmin],
    enabled: !!user,
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from("magasins")
          .select("*")
          .eq("actif", true)
          .order("nom");
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("user_magasins")
          .select("magasin:magasins(*)")
          .eq("user_id", user!.id);
        if (error) throw error;
        return (data ?? [])
          .map((r) => r.magasin)
          .filter((m): m is NonNullable<typeof m> => !!m && m.actif);
      }
    },
  });

  const pick = (id: string, nom: string) => {
    setMagasin(id, nom);
    navigate({ to: "/app" });
  };

  return (
    <main className="min-h-screen px-4 py-12" style={{ background: "var(--gradient-surface)" }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Sélection du magasin</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Choisissez le magasin pour votre session de travail
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { signOut(); navigate({ to: "/login" }); }}>
            <LogOut className="w-4 h-4 mr-2" /> Déconnexion
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !magasins || magasins.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Store className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">Aucun magasin disponible</h3>
              <p className="text-sm text-muted-foreground">
                {isAdmin
                  ? "Créez votre premier magasin pour démarrer."
                  : "Votre administrateur doit vous attribuer un magasin."}
              </p>
              {isAdmin && (
                <Button className="mt-6" onClick={() => navigate({ to: "/app/admin/magasins" })}>
                  Gérer les magasins
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {magasins.map((m) => (
              <Card
                key={m.id}
                className="cursor-pointer hover:shadow-[var(--shadow-elegant)] transition-shadow group"
                onClick={() => pick(m.id, m.nom)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center group-hover:bg-primary transition-colors" style={{ background: "var(--accent)" }}>
                      <Store className="w-5 h-5 text-accent-foreground group-hover:text-primary-foreground transition-colors" />
                    </div>
                  </div>
                  <CardTitle className="mt-3 text-lg">{m.nom}</CardTitle>
                  <CardDescription className="space-y-1">
                    {m.ville && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <MapPin className="w-3 h-3" /> {m.ville}
                      </div>
                    )}
                    {m.telephone && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <Phone className="w-3 h-3" /> {m.telephone}
                      </div>
                    )}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
