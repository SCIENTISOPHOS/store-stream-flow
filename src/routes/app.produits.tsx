import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMagasinStore } from "@/lib/magasin-store";
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
import { Plus, Pencil, Trash2, Package, Search, ShieldAlert, AlertTriangle, PackagePlus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/produits")({
  component: ProduitsPage,
});

type TypeEmballage = "sac" | "demi_sac" | "unite";
type EntityStatut = "actif" | "bloque" | "archive";

interface Produit {
  id: string;
  magasin_id: string;
  nom: string;
  reference: string | null;
  type_emballage: TypeEmballage;
  prix_achat_unitaire: number;
  prix_vente_unitaire: number;
  stock_actuel: number;
  stock_seuil_alerte: number;
  statut: EntityStatut;
  produit_parent_id: string | null;
  notes: string | null;
}

const STATUT_LABELS: Record<EntityStatut, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  actif: { label: "Actif", variant: "default" },
  bloque: { label: "Bloqué", variant: "destructive" },
  archive: { label: "Archivé", variant: "secondary" },
};

const EMBALLAGE_LABELS: Record<TypeEmballage, string> = {
  sac: "Sac",
  demi_sac: "Demi-sac",
  unite: "Unité",
};

function ProduitsPage() {
  const { isAdmin } = useAuth();
  const { magasinId, magasinNom } = useMagasinStore();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Produit | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState<"tous" | EntityStatut>("tous");
  const [filterEmballage, setFilterEmballage] = useState<"tous" | TypeEmballage>("tous");

  const { data: produits, isLoading } = useQuery({
    queryKey: ["produits", magasinId],
    enabled: !!magasinId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produits")
        .select("*")
        .eq("magasin_id", magasinId!)
        .order("nom");
      if (error) throw error;
      return data as Produit[];
    },
  });

  const filtered = useMemo(() => {
    if (!produits) return [];
    const s = search.trim().toLowerCase();
    return produits.filter((p) => {
      if (filterStatut !== "tous" && p.statut !== filterStatut) return false;
      if (filterEmballage !== "tous" && p.type_emballage !== filterEmballage) return false;
      if (!s) return true;
      return (
        p.nom.toLowerCase().includes(s) ||
        (p.reference?.toLowerCase().includes(s) ?? false)
      );
    });
  }, [produits, search, filterStatut, filterEmballage]);

  const alertes = useMemo(
    () => (produits ?? []).filter((p) => p.statut === "actif" && Number(p.stock_actuel) <= Number(p.stock_seuil_alerte)),
    [produits],
  );

  const upsert = useMutation({
    mutationFn: async (p: Partial<Produit> & { nom: string }) => {
      if (p.id) {
        const { error } = await supabase.from("produits").update({
          nom: p.nom,
          reference: p.reference,
          type_emballage: p.type_emballage,
          prix_achat_unitaire: p.prix_achat_unitaire,
          prix_vente_unitaire: p.prix_vente_unitaire,
          stock_seuil_alerte: p.stock_seuil_alerte,
          statut: p.statut,
          notes: p.notes,
          // stock_actuel n'est PAS modifiable directement — passe par les flux (ventes, réceptions, rebuts)
        }).eq("id", p.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("produits").insert({
          magasin_id: magasinId!,
          nom: p.nom,
          reference: p.reference,
          type_emballage: p.type_emballage ?? "unite",
          prix_achat_unitaire: p.prix_achat_unitaire ?? 0,
          prix_vente_unitaire: p.prix_vente_unitaire ?? 0,
          stock_actuel: p.stock_actuel ?? 0,
          stock_seuil_alerte: p.stock_seuil_alerte ?? 0,
          statut: p.statut ?? "actif",
          notes: p.notes,
          created_by: u.user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Produit enregistré");
      qc.invalidateQueries({ queryKey: ["produits", magasinId] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("produits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produit supprimé");
      qc.invalidateQueries({ queryKey: ["produits", magasinId] });
    },
    onError: (e: Error) =>
      toast.error("Suppression bloquée : " + e.message + " — utilisez le statut Archivé."),
  });

  const openCreate = () => { setEditing(null); setOpen(true); };
  const openEdit = (p: Produit) => { setEditing(p); setOpen(true); };

  return (
    <div className="p-4 md:p-8 w-full max-w-7xl min-w-0">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Produits</h1>
          <p className="text-muted-foreground mt-1">
            Stock cloisonné à <span className="font-medium text-foreground">{magasinNom}</span>
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Nouveau produit</Button>
          </DialogTrigger>
          <ProduitDialog
            editing={editing}
            onSubmit={(data) => upsert.mutate(data)}
            submitting={upsert.isPending}
          />
        </Dialog>
      </div>

      {alertes.length > 0 && (
        <Card className="mb-4 border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold text-amber-900 dark:text-amber-100">
                {alertes.length} produit{alertes.length > 1 ? "s" : ""} en alerte de stock
              </div>
              <div className="text-amber-800 dark:text-amber-200 mt-0.5">
                {alertes.slice(0, 5).map((p) => p.nom).join(", ")}
                {alertes.length > 5 && ` et ${alertes.length - 5} autre${alertes.length - 5 > 1 ? "s" : ""}`}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou référence..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterEmballage} onValueChange={(v) => setFilterEmballage(v as typeof filterEmballage)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Tous emballages</SelectItem>
              <SelectItem value="sac">Sac</SelectItem>
              <SelectItem value="demi_sac">Demi-sac</SelectItem>
              <SelectItem value="unite">Unité</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatut} onValueChange={(v) => setFilterStatut(v as typeof filterStatut)}>
            <SelectTrigger className="w-[150px]">
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
            {filtered.length} produit{filtered.length > 1 ? "s" : ""}
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Réf.</TableHead>
              <TableHead>Emballage</TableHead>
              <TableHead className="text-right">Prix vente</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Seuil</TableHead>
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
                  <Package className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Aucun produit dans ce magasin</p>
                </TableCell>
              </TableRow>
            )}
            {filtered.map((p) => {
              const stock = Number(p.stock_actuel);
              const seuil = Number(p.stock_seuil_alerte);
              const enAlerte = p.statut === "actif" && stock <= seuil;
              return (
                <TableRow key={p.id} className={p.statut === "archive" ? "opacity-60" : ""}>
                  <TableCell className="font-medium">{p.nom}</TableCell>
                  <TableCell className="text-muted-foreground">{p.reference || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{EMBALLAGE_LABELS[p.type_emballage]}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(Number(p.prix_vente_unitaire))}</TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${enAlerte ? "text-amber-600 dark:text-amber-400" : ""}`}>
                    {stock}
                    {enAlerte && <AlertTriangle className="w-3.5 h-3.5 inline ml-1 -mt-0.5" />}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{seuil}</TableCell>
                  <TableCell>
                    <Badge variant={STATUT_LABELS[p.statut].variant}>{STATUT_LABELS[p.statut].label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {isAdmin && (
                        <RestockDialog produit={p} onDone={() => qc.invalidateQueries({ queryKey: ["produits", magasinId] })} />
                      )}
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)} title="Modifier">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {isAdmin && (
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
                                Supprimer {p.nom} ?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                La suppression sera <strong>refusée</strong> si ce produit a un historique
                                (ventes, mouvements de stock). Préférez le statut <strong>Archivé</strong>.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuler</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => remove.mutate(p.id)}
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

function ProduitDialog({
  editing, onSubmit, submitting,
}: {
  editing: Produit | null;
  onSubmit: (p: Partial<Produit> & { nom: string }) => void;
  submitting: boolean;
}) {
  const [nom, setNom] = useState(editing?.nom ?? "");
  const [reference, setReference] = useState(editing?.reference ?? "");
  const [typeEmballage, setTypeEmballage] = useState<TypeEmballage>(editing?.type_emballage ?? "sac");
  const [prixAchat, setPrixAchat] = useState<string>(editing?.prix_achat_unitaire?.toString() ?? "0");
  const [prixVente, setPrixVente] = useState<string>(editing?.prix_vente_unitaire?.toString() ?? "0");
  const [stockInitial, setStockInitial] = useState<string>(editing?.stock_actuel?.toString() ?? "0");
  const [seuil, setSeuil] = useState<string>(editing?.stock_seuil_alerte?.toString() ?? "0");
  const [statut, setStatut] = useState<EntityStatut>(editing?.statut ?? "actif");
  const [notes, setNotes] = useState(editing?.notes ?? "");

  useEffect(() => {
    setNom(editing?.nom ?? "");
    setReference(editing?.reference ?? "");
    setTypeEmballage(editing?.type_emballage ?? "sac");
    setPrixAchat(editing?.prix_achat_unitaire?.toString() ?? "0");
    setPrixVente(editing?.prix_vente_unitaire?.toString() ?? "0");
    setStockInitial(editing?.stock_actuel?.toString() ?? "0");
    setSeuil(editing?.stock_seuil_alerte?.toString() ?? "0");
    setStatut(editing?.statut ?? "actif");
    setNotes(editing?.notes ?? "");
  }, [editing]);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: editing?.id,
      nom,
      reference: reference || null,
      type_emballage: typeEmballage,
      prix_achat_unitaire: Number(prixAchat) || 0,
      prix_vente_unitaire: Number(prixVente) || 0,
      stock_actuel: editing ? undefined : Number(stockInitial) || 0,
      stock_seuil_alerte: Number(seuil) || 0,
      statut,
      notes: notes || null,
    });
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{editing ? "Modifier le produit" : "Nouveau produit"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Le stock actuel ne se modifie pas ici — il évolue via les ventes, réceptions et rebuts."
            : "Saisissez un stock initial — il évoluera ensuite uniquement par les flux."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handle} className="space-y-4">
        <div className="grid grid-cols-[1fr_140px] gap-3">
          <div className="space-y-2">
            <Label htmlFor="nom">Nom *</Label>
            <Input id="nom" required value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ref">Référence</Label>
            <Input
              id="ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={editing ? "" : "Auto (PRD-00001)"}
              disabled={!!editing}
            />
            {!editing && (
              <p className="text-xs text-muted-foreground">Laisser vide pour génération automatique.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="emb">Emballage</Label>
            <Select value={typeEmballage} onValueChange={(v) => setTypeEmballage(v as TypeEmballage)}>
              <SelectTrigger id="emb"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sac">Sac</SelectItem>
                <SelectItem value="demi_sac">Demi-sac</SelectItem>
                <SelectItem value="unite">Unité</SelectItem>
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
            <Label htmlFor="pa">Prix d'achat (FCFA)</Label>
            <Input id="pa" type="number" min="0" step="50" value={prixAchat} onChange={(e) => setPrixAchat(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pv">Prix de vente (FCFA) *</Label>
            <Input id="pv" type="number" min="0" step="50" required value={prixVente} onChange={(e) => setPrixVente(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {!editing && (
            <div className="space-y-2">
              <Label htmlFor="stock">Stock initial</Label>
              <Input id="stock" type="number" min="0" step="1" value={stockInitial} onChange={(e) => setStockInitial(e.target.value)} />
            </div>
          )}
          <div className="space-y-2 col-span-1">
            <Label htmlFor="seuil">Seuil d'alerte</Label>
            <Input id="seuil" type="number" min="0" step="1" value={seuil} onChange={(e) => setSeuil(e.target.value)} />
            <p className="text-xs text-muted-foreground">Alerte si stock ≤ seuil</p>
          </div>
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

function RestockDialog({ produit, onDone }: { produit: Produit; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const q = Number(qty);
      if (!q || q <= 0) throw new Error("Quantité invalide");
      const { error } = await supabase
        .from("produits")
        .update({ stock_actuel: Number(produit.stock_actuel) + q, notes: notes || produit.notes })
        .eq("id", produit.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Stock approvisionné : +${qty} ${EMBALLAGE_LABELS[produit.type_emballage]}`);
      setOpen(false); setQty(""); setNotes(""); onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="text-emerald-600 hover:text-emerald-700" title="Approvisionner">
          <PackagePlus className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Approvisionner — {produit.nom}</DialogTitle>
          <DialogDescription>
            Stock actuel : <strong>{Number(produit.stock_actuel)}</strong> {EMBALLAGE_LABELS[produit.type_emballage]}.
            Saisissez la quantité reçue à ajouter au stock.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="qty">Quantité reçue *</Label>
            <Input id="qty" type="number" min="0" step="1" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rn">Notes (facultatif)</Label>
            <Textarea id="rn" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="N° bon de livraison, fournisseur..." />
          </div>
          {qty && Number(qty) > 0 && (
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-3 text-sm">
              Nouveau stock : <strong>{Number(produit.stock_actuel) + Number(qty)}</strong> {EMBALLAGE_LABELS[produit.type_emballage]}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !qty || Number(qty) <= 0}>
            {m.isPending ? "Enregistrement..." : "Confirmer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
