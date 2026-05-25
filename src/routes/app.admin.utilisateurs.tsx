import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/utilisateurs")({
  component: UtilisateursPage,
});

interface UserRow {
  id: string;
  display_name: string;
  phone: string | null;
  created_at: string;
  roles: ("admin" | "user")[];
  magasin_ids: string[];
}

function UtilisateursPage() {
  const navigate = useNavigate();
  const { isAdmin, loading, user: currentUser } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/app" });
  }, [isAdmin, loading, navigate]);

  const { data: users } = useQuery({
    queryKey: ["all-users"],
    enabled: isAdmin,
    queryFn: async (): Promise<UserRow[]> => {
      const [profilesRes, rolesRes, magasinsRes] = await Promise.all([
        supabase.from("profiles").select("*").order("display_name"),
        supabase.from("user_roles").select("*"),
        supabase.from("user_magasins").select("*"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (magasinsRes.error) throw magasinsRes.error;

      return (profilesRes.data ?? []).map((p) => ({
        id: p.id,
        display_name: p.display_name,
        phone: p.phone,
        created_at: p.created_at,
        roles: (rolesRes.data ?? []).filter((r) => r.user_id === p.id).map((r) => r.role) as ("admin" | "user")[],
        magasin_ids: (magasinsRes.data ?? []).filter((m) => m.user_id === p.id).map((m) => m.magasin_id),
      }));
    },
  });

  const { data: magasins } = useQuery({
    queryKey: ["magasins-all"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("magasins").select("id, nom").eq("actif", true).order("nom");
      if (error) throw error;
      return data;
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "user" }) => {
      // remove existing roles, set new one (single primary role)
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rôle mis à jour");
      qc.invalidateQueries({ queryKey: ["all-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMagasin = useMutation({
    mutationFn: async ({ userId, magasinId, attach }: { userId: string; magasinId: string; attach: boolean }) => {
      if (attach) {
        const { error } = await supabase.from("user_magasins").insert({ user_id: userId, magasin_id: magasinId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_magasins").delete().eq("user_id", userId).eq("magasin_id", magasinId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all-users"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Utilisateurs</h1>
        <p className="text-muted-foreground mt-1">
          Attribution des rôles et rattachement aux magasins (RG-ROL-07)
        </p>
      </div>

      <div className="space-y-4">
        {users?.map((u) => {
          const isSelf = u.id === currentUser?.id;
          const primaryRole = u.roles.includes("admin") ? "admin" : "user";
          return (
            <Card key={u.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <UserIcon className="w-4 h-4" /> {u.display_name}
                      {isSelf && <Badge variant="outline" className="text-xs">Vous</Badge>}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {u.phone && <span>📞 {u.phone} · </span>}
                      Inscrit le {new Date(u.created_at).toLocaleDateString("fr-FR")}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-muted-foreground" />
                    <Select
                      value={primaryRole}
                      onValueChange={(v) => setRole.mutate({ userId: u.id, role: v as "admin" | "user" })}
                      disabled={isSelf}
                    >
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrateur</SelectItem>
                        <SelectItem value="user">Utilisateur</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Magasins rattachés {primaryRole === "admin" && "(admin = accès à tous)"}
                </div>
                <div className="flex flex-wrap gap-3">
                  {magasins?.map((m) => {
                    const attached = u.magasin_ids.includes(m.id);
                    return (
                      <label key={m.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 cursor-pointer hover:bg-accent">
                        <Checkbox
                          checked={attached}
                          onCheckedChange={(checked) =>
                            toggleMagasin.mutate({ userId: u.id, magasinId: m.id, attach: !!checked })
                          }
                        />
                        <span className="text-sm">{m.nom}</span>
                      </label>
                    );
                  })}
                  {magasins?.length === 0 && (
                    <p className="text-sm text-muted-foreground">Créez d'abord un magasin.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
