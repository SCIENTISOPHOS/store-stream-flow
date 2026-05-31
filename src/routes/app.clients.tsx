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
import { Switch } from "@/components/ui/switch";
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
import { Plus, Pencil, Trash2, Users, Search, ShieldAlert, Lock, Globe, FileDown, Eye } from "lucide-react";
import { toast } from "sonner";
import { createPdf, pdfInfoTable, pdfDataTable, pdfSectionTitle, fmtMoney, fmtDateTime, logAuditEvent } from "@/lib/pdf-utils";

export const Route = createFileRoute("/app/clients")({
  component: ClientsPage,
});

type ClientType = "particulier" | "professionnel" | "passager";
type EntityStatut = "actif" | "bloque" | "archive";

interface Magasin { id: string; nom: string }

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
  magasin_id: string | null;
  allow_cross_magasin: boolean;
  created_at: string;
}

const STATUT_LABELS: Record<EntityStatut, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  actif: { label: "Actif", variant: "default" },
  bloque: { label: "Bloqué", variant: "destructive" },
  archive: { label: "Archivé", variant: "secondary" },
};

function ClientsPage() {
  const { isAdmin } = useAuth();
  const { magasinId } = useMagasinStore();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Client | null>(null);
  const [open, setOpen] = useState(false);
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState<"tous" | EntityStatut>("tous");

  const { data: magasins } = useQuery({
    queryKey: ["magasins-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("magasins").select("id, nom").order("nom");
      if (error) throw error;
      return data as Magasin[];
    },
  });

  const magasinNomById = useMemo(() => {
    const m = new Map<string, string>();
    (magasins ?? []).forEach((mg) => m.set(mg.id, mg.nom));
    return m;
  }, [magasins]);

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
        const patch: Record<string, unknown> = {
          nom: c.nom,
          telephone: c.telephone,
          ville: c.ville,
          type: c.type,
          statut: c.statut,
          budget_max: c.budget_max,
          notes: c.notes,
        };
        if (isAdmin) {
          patch.magasin_id = c.magasin_id ?? null;
          patch.allow_cross_magasin = c.allow_cross_magasin ?? false;
        }
        const { error } = await supabase.from("clients").update(patch as never).eq("id", c.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const insert: Record<string, unknown> = {
          nom: c.nom,
          telephone: c.telephone,
          ville: c.ville,
          type: c.type ?? "particulier",
          statut: c.statut ?? "actif",
          budget_max: c.budget_max ?? 0,
          notes: c.notes,
          created_by: u.user?.id,
          magasin_id: isAdmin ? (c.magasin_id ?? null) : magasinId,
          allow_cross_magasin: isAdmin ? (c.allow_cross_magasin ?? false) : false,
        };
        const { error } = await supabase.from("clients").insert(insert as never);
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
    <div className="p-4 md:p-8 w-full max-w-7xl min-w-0">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Fichier rattaché par magasin · partage inter-magasin réservé à l'administrateur
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Nouveau client</Button>
          </DialogTrigger>
          <ClientDialog
            editing={editing}
            isAdmin={isAdmin}
            currentMagasinId={magasinId}
            magasins={magasins ?? []}
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
              <TableHead>Magasin</TableHead>
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
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Chargement...</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12">
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
                <TableRow
                  key={c.id}
                  className={`cursor-pointer hover:bg-muted/40 ${c.statut === "archive" ? "opacity-60" : ""}`}
                  onClick={() => setDetailClient(c)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {c.is_passager_systeme && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                      {c.nom}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{c.type}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.is_passager_systeme ? (
                      <span className="text-muted-foreground">— partagé —</span>
                    ) : c.magasin_id ? (
                      <div className="flex items-center gap-1.5">
                        <span>{magasinNomById.get(c.magasin_id) ?? "?"}</span>
                        {c.allow_cross_magasin && (
                          <Globe className="w-3 h-3 text-primary" aria-label="Inter-magasins autorisé" />
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">non rattaché</span>
                    )}
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
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="icon" variant="ghost"
                        onClick={() => setDetailClient(c)}
                        title="Voir les détails"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
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

      <ClientDetailDialog
        client={detailClient}
        magasinNomById={magasinNomById}
        onClose={() => setDetailClient(null)}
      />
    </div>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " F";
}

function ClientDialog({
  editing, isAdmin, currentMagasinId, magasins, onSubmit, submitting,
}: {
  editing: Client | null;
  isAdmin: boolean;
  currentMagasinId: string | null;
  magasins: Magasin[];
  onSubmit: (c: Partial<Client> & { nom: string }) => void;
  submitting: boolean;
}) {
  const [nom, setNom] = useState(editing?.nom ?? "");
  const [telephone, setTelephone] = useState(editing?.telephone ?? "");
  const [ville, setVille] = useState(editing?.ville ?? "");
  const [type, setType] = useState<ClientType>(editing?.type ?? "particulier");
  const [statut, setStatut] = useState<EntityStatut>(editing?.statut ?? "actif");
  const [budgetMax, setBudgetMax] = useState<string>(editing?.budget_max?.toString() ?? "0");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [magasinId, setMagasinId] = useState<string>(editing?.magasin_id ?? currentMagasinId ?? "");
  const [allowCross, setAllowCross] = useState<boolean>(editing?.allow_cross_magasin ?? false);

  useEffect(() => {
    setNom(editing?.nom ?? "");
    setTelephone(editing?.telephone ?? "");
    setVille(editing?.ville ?? "");
    setType(editing?.type ?? "particulier");
    setStatut(editing?.statut ?? "actif");
    setBudgetMax(editing?.budget_max?.toString() ?? "0");
    setNotes(editing?.notes ?? "");
    setMagasinId(editing?.magasin_id ?? currentMagasinId ?? "");
    setAllowCross(editing?.allow_cross_magasin ?? false);
  }, [editing, currentMagasinId]);

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
      magasin_id: magasinId || null,
      allow_cross_magasin: allowCross,
    });
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{editing ? "Modifier le client" : "Nouveau client"}</DialogTitle>
        <DialogDescription>
          Chaque client est rattaché à un magasin. L'administrateur peut autoriser les achats inter-magasins.
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

        <div className="space-y-2">
          <Label htmlFor="magasin">Magasin de rattachement</Label>
          <Select value={magasinId} onValueChange={setMagasinId} disabled={!isAdmin}>
            <SelectTrigger id="magasin"><SelectValue placeholder="Choisir un magasin" /></SelectTrigger>
            <SelectContent>
              {magasins.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isAdmin && (
            <p className="text-xs text-muted-foreground">
              Le client sera rattaché à votre magasin de session. Seul un administrateur peut le déplacer.
            </p>
          )}
        </div>

        {isAdmin && (
          <p className="text-xs text-muted-foreground">
            Un client est rattaché à un seul magasin et ne peut acheter que dans celui-ci.
          </p>
        )}

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

interface ClientVente {
  id: string;
  numero: number;
  date_vente: string;
  mode_paiement: "comptant" | "credit" | "credit_total" | "mixte";
  montant_total: number;
  montant_paye: number;
  credit_restant: number;
  statut: string;
}

function ClientDetailDialog({
  client, magasinNomById, onClose,
}: {
  client: Client | null;
  magasinNomById: Map<string, string>;
  onClose: () => void;
}) {
  const open = !!client;
  const { data: ventes, isLoading } = useQuery({
    queryKey: ["client-ventes", client?.id],
    enabled: !!client?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ventes")
        .select("id, numero, date_vente, mode_paiement, montant_total, montant_paye, credit_restant, statut")
        .eq("client_id", client!.id)
        .order("date_vente", { ascending: false });
      if (error) throw error;
      return data as unknown as ClientVente[];
    },
  });

  const totalAchats = (ventes ?? []).filter((v) => v.statut === "validee").reduce((s, v) => s + Number(v.montant_total), 0);

  const exportPdf = async () => {
    if (!client) return;
    const { doc, cursorY } = createPdf("Fiche client", client.nom);
    let y = cursorY;

    y = pdfSectionTitle(doc, y, "Informations");
    y = pdfInfoTable(doc, y, [
      ["Nom", client.nom],
      ["Type", client.type],
      ["Statut", client.statut],
      ["Téléphone", client.telephone || "—"],
      ["Ville", client.ville || "—"],
      ["Magasin", client.magasin_id ? (magasinNomById.get(client.magasin_id) ?? "—") : "—"],
      ["Budget max", fmtMoney(client.budget_max)],
      ["Dette totale", fmtMoney(client.dette_totale)],
      ["Créé le", fmtDateTime(client.created_at)],
    ]);

    if (client.notes) {
      y = pdfSectionTitle(doc, y + 2, "Notes");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(client.notes, 180);
      doc.text(lines, 14, y + 2);
      y += 2 + lines.length * 5;
    }

    y = pdfSectionTitle(doc, y + 4, `Historique des achats (${(ventes ?? []).length})`);
    const body = (ventes ?? []).map((v) => [
      `#${v.numero}`,
      fmtDateTime(v.date_vente),
      v.mode_paiement,
      fmtMoney(v.montant_total),
      fmtMoney(v.montant_paye),
      fmtMoney(v.credit_restant),
      v.statut,
    ]);
    y = pdfDataTable(
      doc,
      y + 2,
      ["N°", "Date", "Mode", "Total", "Payé", "Reste", "Statut"],
      body,
      {
        columnStyles: {
          0: { halign: "right", cellWidth: 16 },
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
        },
      },
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text(`Total des achats validés : ${fmtMoney(totalAchats)}`, 14, y + 4);

    const safe = client.nom.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    doc.save(`fiche-client-${safe}.pdf`);

    await logAuditEvent({
      action: "EXPORT_PDF",
      table_name: "clients",
      record_id: client.id,
      magasin_id: client.magasin_id,
      details: `Export PDF de la fiche client « ${client.nom} » (${(ventes ?? []).length} achat${(ventes ?? []).length > 1 ? "s" : ""})`,
    });
  };


  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {client && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" /> {client.nom}
              </DialogTitle>
              <DialogDescription>
                Fiche client et historique des achats
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <Info label="Type" value={<Badge variant="outline" className="capitalize">{client.type}</Badge>} />
              <Info label="Statut" value={<Badge variant={STATUT_LABELS[client.statut].variant}>{STATUT_LABELS[client.statut].label}</Badge>} />
              <Info label="Téléphone" value={client.telephone || "—"} />
              <Info label="Ville" value={client.ville || "—"} />
              <Info label="Magasin" value={client.magasin_id ? (magasinNomById.get(client.magasin_id) ?? "—") : "—"} />
              <Info label="Créé le" value={new Date(client.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} />
              <Info label="Budget max" value={<span className="tabular-nums">{fmt(Number(client.budget_max) || 0)}</span>} />
              <Info label="Dette actuelle" value={<span className={`tabular-nums ${Number(client.dette_totale) > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}`}>{fmt(Number(client.dette_totale) || 0)}</span>} />
              <Info label="Total achats validés" value={<span className="tabular-nums font-semibold">{fmt(totalAchats)}</span>} />
            </div>

            {client.notes && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notes</div>
                {client.notes}
              </div>
            )}

            <div>
              <div className="font-medium mb-2 text-sm">Historique des achats ({(ventes ?? []).length})</div>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">N°</TableHead>
                      <TableHead>Date & heure</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Payé</TableHead>
                      <TableHead className="text-right">Reste</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Chargement...</TableCell></TableRow>}
                    {!isLoading && (ventes ?? []).length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Aucun achat enregistré</TableCell></TableRow>
                    )}
                    {(ventes ?? []).map((v) => (
                      <TableRow key={v.id} className={v.statut === "annulee" ? "opacity-50" : ""}>
                        <TableCell className="tabular-nums text-muted-foreground">#{v.numero}</TableCell>
                        <TableCell className="text-xs">{new Date(v.date_vente).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{v.mode_paiement}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(Number(v.montant_total))}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(Number(v.montant_paye))}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(Number(v.credit_restant))}</TableCell>
                        <TableCell><Badge variant={v.statut === "annulee" ? "destructive" : "default"}>{v.statut}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Fermer</Button>
              <Button onClick={exportPdf} className="gap-2"><FileDown className="w-4 h-4" /> Exporter en PDF</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate">{value}</div>
    </div>
  );
}
