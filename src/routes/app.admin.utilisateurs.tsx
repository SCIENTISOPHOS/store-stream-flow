import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
} from "@/lib/admin-users.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, User as UserIcon, Plus, Pencil, Trash2 } from "lucide-react";
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

  const createFn = useServerFn(adminCreateUser);
  const updateFn = useServerFn(adminUpdateUser);
  const deleteFn = useServerFn(adminDeleteUser);

  const createUser = useMutation({
    mutationFn: (input: { email: string; password: string; display_name: string; phone: string; role: "admin" | "user" }) =>
      createFn({ data: { ...input, phone: input.phone || null } }),
    onSuccess: () => {
      toast.success("Utilisateur créé");
      qc.invalidateQueries({ queryKey: ["all-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateUser = useMutation({
    mutationFn: (input: { user_id: string; display_name: string; phone: string; email?: string; password?: string }) =>
      updateFn({
        data: {
          user_id: input.user_id,
          display_name: input.display_name,
          phone: input.phone || null,
          ...(input.email ? { email: input.email } : {}),
          ...(input.password ? { password: input.password } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Utilisateur mis à jour");
      qc.invalidateQueries({ queryKey: ["all-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: (user_id: string) => deleteFn({ data: { user_id } }),
    onSuccess: () => {
      toast.success("Utilisateur supprimé");
      qc.invalidateQueries({ queryKey: ["all-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Utilisateurs</h1>
          <p className="text-muted-foreground mt-1">
            Création, édition, suppression et rattachement aux magasins (RG-ROL-07)
          </p>
        </div>
        <CreateUserDialog onSubmit={(v) => createUser.mutate(v)} pending={createUser.isPending} />
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
                  <div className="flex items-center gap-2 flex-wrap">
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
                    <EditUserDialog
                      user={u}
                      onSubmit={(v) => updateUser.mutate({ user_id: u.id, ...v })}
                      pending={updateUser.isPending}
                    />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon" disabled={isSelf} title="Supprimer">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer {u.display_name} ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Cette action est définitive. Toutes les données liées à ce compte resteront, mais l'utilisateur ne pourra plus se connecter.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteUser.mutate(u.id)}>
                            Supprimer
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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

function CreateUserDialog({
  onSubmit, pending,
}: {
  onSubmit: (v: { email: string; password: string; display_name: string; phone: string; role: "admin" | "user" }) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");

  const submit = () => {
    if (!email || !password || !displayName) {
      toast.error("Email, mot de passe et nom sont requis");
      return;
    }
    if (password.length < 8) {
      toast.error("Mot de passe : 8 caractères minimum");
      return;
    }
    onSubmit({ email, password, display_name: displayName, phone, role });
    setOpen(false);
    setEmail(""); setPassword(""); setDisplayName(""); setPhone(""); setRole("user");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-2" />Nouvel utilisateur</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer un utilisateur</DialogTitle>
          <DialogDescription>Le compte est activé immédiatement (email confirmé).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nom affiché *</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} />
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
          </div>
          <div>
            <Label>Mot de passe * (min. 8)</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
          </div>
          <div>
            <Label>Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "admin" | "user")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Utilisateur</SelectItem>
                <SelectItem value="admin">Administrateur</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={submit} disabled={pending}>Créer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user, onSubmit, pending,
}: {
  user: UserRow;
  onSubmit: (v: { display_name: string; phone: string; email?: string; password?: string }) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(user.display_name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) {
      setDisplayName(user.display_name);
      setPhone(user.phone ?? "");
      setEmail("");
      setPassword("");
    }
  }, [open, user]);

  const submit = () => {
    if (!displayName.trim()) {
      toast.error("Nom requis");
      return;
    }
    if (password && password.length < 8) {
      toast.error("Mot de passe : 8 caractères minimum");
      return;
    }
    onSubmit({
      display_name: displayName,
      phone,
      ...(email ? { email } : {}),
      ...(password ? { password } : {}),
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Modifier"><Pencil className="w-4 h-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier {user.display_name}</DialogTitle>
          <DialogDescription>Laissez vides les champs email / mot de passe pour ne pas les changer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nom affiché</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} />
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
          </div>
          <div>
            <Label>Nouvel email (optionnel)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
          </div>
          <div>
            <Label>Nouveau mot de passe (optionnel)</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={submit} disabled={pending}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
