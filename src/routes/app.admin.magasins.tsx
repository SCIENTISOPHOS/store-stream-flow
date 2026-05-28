import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Store, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/magasins")({
  component: MagasinsPage,
});

interface Magasin {
  id: string;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  actif: boolean;
}

function MagasinsPage() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Magasin | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/app" });
  }, [isAdmin, loading, navigate]);

  const { data: magasins } = useQuery({
    queryKey: ["magasins"],
    queryFn: async () => {
      const { data, error } = await supabase.from("magasins").select("*").order("nom");
      if (error) throw error;
      return data as Magasin[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (m: Partial<Magasin> & { nom: string }) => {
      if (m.id) {
        const { error } = await supabase.from("magasins").update({
          nom: m.nom, telephone: m.telephone, adresse: m.adresse, ville: m.ville, actif: m.actif,
        }).eq("id", m.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("magasins").insert({
          nom: m.nom, telephone: m.telephone, adresse: m.adresse, ville: m.ville,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Magasin enregistré");
      qc.invalidateQueries({ queryKey: ["magasins"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("magasins").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Magasin supprimé");
      qc.invalidateQueries({ queryKey: ["magasins"] });
    },
    onError: (e: Error) => toast.error("Suppression bloquée : " + e.message),
  });

  const openCreate = () => { setEditing(null); setOpen(true); };
  const openEdit = (m: Magasin) => { setEditing(m); setOpen(true); };

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Magasins</h1>
          <p className="text-muted-foreground mt-1">Configuration des établissements du réseau</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Nouveau magasin</Button>
          </DialogTrigger>
          <MagasinDialog
            editing={editing}
            onSubmit={(data) => upsert.mutate(data)}
            submitting={upsert.isPending}
          />
        </Dialog>
      </div>

      {!magasins || magasins.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Store className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-1">Aucun magasin</h3>
            <p className="text-sm text-muted-foreground mb-6">Créez votre premier magasin pour démarrer.</p>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Créer un magasin</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {magasins.map((m) => (
            <Card key={m.id} className={!m.actif ? "opacity-60" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Store className="w-4 h-4" /> {m.nom}
                      {!m.actif && <span className="text-xs font-normal text-muted-foreground">(Inactif)</span>}
                    </CardTitle>
                    <CardDescription className="mt-1 space-y-0.5 text-xs">
                      {m.ville && <div>📍 {m.ville}{m.adresse ? ` — ${m.adresse}` : ""}</div>}
                      {m.telephone && <div>📞 {m.telephone}</div>}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(m)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 text-destructive" />
                            Supprimer ce magasin ?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            La suppression sera bloquée si des données sont rattachées à ce magasin
                            (produits, ventes, utilisateurs). Dans ce cas, désactivez-le plutôt.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => remove.mutate(m.id)}
                          >
                            Supprimer
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MagasinDialog({
  editing, onSubmit, submitting,
}: { editing: Magasin | null; onSubmit: (m: Partial<Magasin> & { nom: string }) => void; submitting: boolean }) {
  // RG-STU-06 : formulaire pré-rempli avec les valeurs actuelles
  const [nom, setNom] = useState(editing?.nom ?? "");
  const [telephone, setTelephone] = useState(editing?.telephone ?? "");
  const [adresse, setAdresse] = useState(editing?.adresse ?? "");
  const [ville, setVille] = useState(editing?.ville ?? "");
  const [actif, setActif] = useState(editing?.actif ?? true);

  useEffect(() => {
    setNom(editing?.nom ?? "");
    setTelephone(editing?.telephone ?? "");
    setAdresse(editing?.adresse ?? "");
    setVille(editing?.ville ?? "");
    setActif(editing?.actif ?? true);
  }, [editing]);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ id: editing?.id, nom, telephone: telephone || null, adresse: adresse || null, ville: ville || null, actif });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? "Modifier le magasin" : "Nouveau magasin"}</DialogTitle>
        <DialogDescription>
          Ces informations apparaîtront sur les reçus et rapports PDF générés depuis ce magasin.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handle} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nom">Nom *</Label>
          <Input id="nom" required value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="ville">Ville</Label>
            <Input id="ville" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Douala, Yaoundé..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telephone">Téléphone</Label>
            <Input id="telephone" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="adresse">Adresse</Label>
          <Input id="adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
        </div>
        {editing && (
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="actif" className="font-medium">Magasin actif</Label>
              <p className="text-xs text-muted-foreground">Les magasins inactifs ne sont pas sélectionnables</p>
            </div>
            <Switch id="actif" checked={actif} onCheckedChange={setActif} />
          </div>
        )}
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Enregistrement..." : editing ? "Mettre à jour" : "Créer"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
