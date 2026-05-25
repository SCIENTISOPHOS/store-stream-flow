import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Users, Search, ShieldAlert, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/clients")({
  component: ClientsPage,
});

type ClientType = "particulier" | "professionnel" | "passager";
type EntityStatut = "actif" | "bloque" | "archive";

interface Client {
  id: string;
  nom: string;
  telephone: string | null;
  ville: string | null;
  type: ClientType;
  statut: EntityStatut;
  budget_max: number;
  dette_totale: number;
  notes: string | null;
  is_passager_systeme: boolean;
  created_at: string;
}

const STATUT_LABELS: Record<EntityStatut, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  actif: { label: "Actif", variant: "default" },
  bloque: { label: "Bloqué", variant: "destructive" },
  archive: { label: "Archivé", variant: "secondary" },
};

function ClientsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Client | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState<"tous" | EntityStatut>("tous");

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("is_passager_systeme", { ascending: false })
        .order("nom");
      if (error) throw error;
      return data as Client[];
    },
  });

  const filtered = useMemo(() => {
    if (!clients) return [];
    const s = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (filterStatut !== "tous" && c.statut !== filterStatut) return false;
      if (!s) return true;
      return (
        c.nom.toLowerCase().includes(s) ||
        (c.telephone?.toLowerCase().includes(s) ?? false) ||
        (c.ville?.toLowerCase().includes(s) ?? false)
      );
    });
  }, [clients, search, filterStatut]);

  const upsert = useMutation({
    mutationFn: async (c: Partial<Client> & { nom: string }) => {
      if (c.id) {
        const { error } = await supabase.from("clients").update({
          nom: c.nom,
          telephone: c.telephone,
          ville: c.ville,
          type: c.type,
          statut: c.statut,
          budget_max: c.budget_max,
          notes: c.notes,
        }).eq("id", c.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("clients").insert({
          nom: c.nom,
          telephone: c.telephone,
          ville: c.ville,
          type: c.type ?? "particulier",
          statut: c.statut ?? "actif",
          budget_max: c.budget_max ?? 0,
          notes: c.notes,
          created_by: u.user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Client enregistré");
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client supprimé");
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) =>
      toast.error("Suppression bloquée : " + e.message + " — utilisez le statut Archivé."),
  });

  const openCreate = () => { setEditing(null); setOpen(true); };
  const openEdit = (c: Client) => { setEditing(c); setOpen(true); };

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-1">
            Fichier centralisé, partagé entre tous les magasins
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Nouveau client</Button>
          </DialogTrigger>
          <ClientDialog
            editing={editing}
            onSubmit={(data) => upsert.mutate(data)}
            submitting={upsert.isPending}
          />
        </Dialog>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, téléphone, ville..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterStatut} onValueChange={(v) => setFilterStatut(v as typeof filterStatut)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Tous statuts</SelectItem>
              <SelectItem value="actif">Actifs</SelectItem>
              <SelectItem value="bloque">Bloqués</SelectItem>
              <SelectItem value="archive">Archivés</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground ml-auto">
            {filtered.length} client{filtered.length > 1 ? "s" : ""}
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead className="text-right">Budget max</TableHead>
              <TableHead className="text-right">Dette</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Chargement...</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <Users className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Aucun client trouvé</p>
                </TableCell>
              </TableRow>
            )}
            {filtered.map((c) => {
              const dette = Number(c.dette_totale) || 0;
              const budget = Number(c.budget_max) || 0;
              const overBudget = dette > budget && budget > 0;
              return (
                <TableRow key={c.id} className={c.statut === "archive" ? "opacity-60" : ""}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {c.is_passager_systeme && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                      {c.nom}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{c.type}</Badge>
                  </TableCell>
                  <TableCell>{c.telephone || "—"}</TableCell>
                  <TableCell>{c.ville || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(budget)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${overBudget ? "text-destructive font-semibold" : ""}`}>
                    {fmt(dette)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUT_LABELS[c.statut].variant}>{STATUT_LABELS[c.statut].label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="icon" variant="ghost"
                        onClick={() => openEdit(c)}
                        disabled={c.is_passager_systeme}
                        title={c.is_passager_systeme ? "Client système — non modifiable" : "Modifier"}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {isAdmin && !c.is_passager_systeme && (
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
                                Supprimer {c.nom} ?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                La suppression sera <strong>refusée</strong> si ce client a un historique
                                (ventes, recouvrements). Préférez le statut <strong>Archivé</strong>.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuler</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => remove.mutate(c.id)}
                              >
                                Supprimer
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " F";
}

function ClientDialog({
  editing, onSubmit, submitting,
}: {
  editing: Client | null;
  onSubmit: (c: Partial<Client> & { nom: string }) => void;
  submitting: boolean;
}) {
  // RG-STU-06 : formulaire pré-rempli
  const [nom, setNom] = useState(editing?.nom ?? "");
  const [telephone, setTelephone] = useState(editing?.telephone ?? "");
  const [ville, setVille] = useState(editing?.ville ?? "");
  const [type, setType] = useState<ClientType>(editing?.type ?? "particulier");
  const [statut, setStatut] = useState<EntityStatut>(editing?.statut ?? "actif");
  const [budgetMax, setBudgetMax] = useState<string>(editing?.budget_max?.toString() ?? "0");
  const [notes, setNotes] = useState(editing?.notes ?? "");

  useEffect(() => {
    setNom(editing?.nom ?? "");
    setTelephone(editing?.telephone ?? "");
    setVille(editing?.ville ?? "");
    setType(editing?.type ?? "particulier");
    setStatut(editing?.statut ?? "actif");
    setBudgetMax(editing?.budget_max?.toString() ?? "0");
    setNotes(editing?.notes ?? "");
  }, [editing]);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: editing?.id,
      nom,
      telephone: telephone || null,
      ville: ville || null,
      type,
      statut,
      budget_max: Number(budgetMax) || 0,
      notes: notes || null,
    });
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{editing ? "Modifier le client" : "Nouveau client"}</DialogTitle>
        <DialogDescription>
          Les clients sont partagés entre tous les magasins du réseau.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handle} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nom">Nom *</Label>
          <Input id="nom" required value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ClientType)}>
              <SelectTrigger id="type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="particulier">Particulier</SelectItem>
                <SelectItem value="professionnel">Professionnel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="statut">Statut</Label>
            <Select value={statut} onValueChange={(v) => setStatut(v as EntityStatut)}>
              <SelectTrigger id="statut"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="actif">Actif</SelectItem>
                <SelectItem value="bloque">Bloqué</SelectItem>
                <SelectItem value="archive">Archivé</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="tel">Téléphone</Label>
            <Input id="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ville">Ville</Label>
            <Input id="ville" value={ville} onChange={(e) => setVille(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="budget">Budget max (FCFA)</Label>
          <Input
            id="budget" type="number" min="0" step="100"
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Plafond de dette autorisé pour ce client. 0 = pas de crédit.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={submitting || !nom.trim()}>
            {submitting ? "Enregistrement..." : editing ? "Mettre à jour" : "Créer"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
