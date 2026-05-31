import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMagasinStore } from "@/lib/magasin-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Receipt, Ban, Eye, User as UserIcon, Calendar, CreditCard, Package, Search, FileDown, X } from "lucide-react";
import { toast } from "sonner";
import {
  createPdf, pdfInfoTable, pdfDataTable, pdfSectionTitle,
  fmtMoney, fmtDateTime, fmtDateLong, fmtNumber, logAuditEvent,
} from "@/lib/pdf-utils";

export const Route = createFileRoute("/app/ventes")({
  component: VentesPage,
});

interface Vente {
  id: string;
  numero: number;
  date_vente: string;
  mode_paiement: "comptant" | "credit" | "mixte";
  montant_total: number;
  montant_paye: number;
  montant_credit: number;
  credit_restant: number;
  statut: "validee" | "annulee";
  notes: string | null;
  clients: { nom: string } | null;
}

const MODE_LABELS: Record<Vente["mode_paiement"], string> = {
  comptant: "Comptant",
  credit: "Crédit",
  mixte: "Mixte",
};

type ModeFilter = "tous" | Vente["mode_paiement"];
type StatutFilter = "tous" | Vente["statut"];

function VentesPage() {
  const { isAdmin } = useAuth();
  const { magasinId, magasinNom } = useMagasinStore();
  const qc = useQueryClient();
  const [detailVente, setDetailVente] = useState<Vente | null>(null);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("tous");
  const [statutFilter, setStatutFilter] = useState<StatutFilter>("tous");

  const { data: ventes, isLoading } = useQuery({
    queryKey: ["ventes", magasinId],
    enabled: !!magasinId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ventes")
        .select("id, numero, date_vente, mode_paiement, montant_total, montant_paye, montant_credit, credit_restant, statut, notes, clients(nom)")
        .eq("magasin_id", magasinId!)
        .order("date_vente", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as Vente[];
    },
  });

  const filtered = useMemo(() => {
    if (!ventes) return [];
    const s = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const to = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
    return ventes.filter((v) => {
      if (modeFilter !== "tous" && v.mode_paiement !== modeFilter) return false;
      if (statutFilter !== "tous" && v.statut !== statutFilter) return false;
      const ts = new Date(v.date_vente).getTime();
      if (from && ts < from) return false;
      if (to && ts > to) return false;
      if (s) {
        const haystack = `${v.numero} ${v.clients?.nom ?? ""}`.toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      return true;
    });
  }, [ventes, search, dateFrom, dateTo, modeFilter, statutFilter]);

  const resetFilters = () => {
    setSearch(""); setDateFrom(""); setDateTo(""); setModeFilter("tous"); setStatutFilter("tous");
  };
  const hasFilters = search || dateFrom || dateTo || modeFilter !== "tous" || statutFilter !== "tous";

  return (
    <div className="p-4 md:p-8 w-full max-w-7xl min-w-0">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Receipt className="w-7 h-7" /> Ventes
        </h1>
        <p className="text-muted-foreground mt-1">
          Historique du magasin <span className="text-foreground font-medium">{magasinNom}</span>
        </p>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="N° de vente ou nom du client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:col-span-2">
            <div>
              <Label className="text-xs text-muted-foreground">Du</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Au</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={modeFilter} onValueChange={(v) => setModeFilter(v as ModeFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous modes</SelectItem>
                <SelectItem value="comptant">Comptant</SelectItem>
                <SelectItem value="credit">Crédit</SelectItem>
                <SelectItem value="mixte">Mixte</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statutFilter} onValueChange={(v) => setStatutFilter(v as StatutFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous statuts</SelectItem>
                <SelectItem value="validee">Validées</SelectItem>
                <SelectItem value="annulee">Annulées</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 lg:col-span-5 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{filtered.length} / {ventes?.length ?? 0} vente(s)</span>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <X className="w-3.5 h-3.5 mr-1" /> Réinitialiser les filtres
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Résultats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">N°</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Payé</TableHead>
                  <TableHead className="text-right">Crédit restant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Chargement...</TableCell></TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                    {ventes?.length ? "Aucun résultat pour ces filtres" : "Aucune vente enregistrée"}
                  </TableCell></TableRow>
                )}
                {filtered.map((v) => (
                  <TableRow
                    key={v.id}
                    className={`cursor-pointer hover:bg-muted/40 ${v.statut === "annulee" ? "opacity-50" : ""}`}
                    onClick={() => setDetailVente(v)}
                  >
                    <TableCell className="tabular-nums text-muted-foreground">#{v.numero}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {fmtDateTime(v.date_vente)}
                    </TableCell>
                    <TableCell className="font-medium">{v.clients?.nom ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{MODE_LABELS[v.mode_paiement]}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmt(v.montant_total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(v.montant_paye)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${Number(v.credit_restant) > 0 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
                      {fmt(v.credit_restant)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={v.statut === "annulee" ? "destructive" : "default"}>
                        {v.statut === "annulee" ? "Annulée" : "Validée"}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setDetailVente(v)} title="Voir les détails">
                          <Eye className="w-4 h-4" />
                        </Button>
                        {isAdmin && v.statut === "validee" && (
                          <CancelVenteDialog vente={v} onDone={() => {
                            qc.invalidateQueries({ queryKey: ["ventes", magasinId] });
                            qc.invalidateQueries({ queryKey: ["produits"] });
                            qc.invalidateQueries({ queryKey: ["clients"] });
                          }} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <VenteDetailDialog vente={detailVente} magasinNom={magasinNom} magasinId={magasinId} onClose={() => setDetailVente(null)} />
    </div>
  );
}

function CancelVenteDialog({ vente, onDone }: { vente: Vente; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [motif, setMotif] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("cancel_vente", { p_vente_id: vente.id, p_motif: motif });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Vente #${vente.numero} annulée`);
      setOpen(false); setMotif(""); onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" title="Annuler la vente">
          <Ban className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Annuler la vente #{vente.numero}</DialogTitle>
          <DialogDescription>
            Le stock sera restauré et la dette client recalculée. Action tracée dans le journal d'audit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Motif (obligatoire)</Label>
          <Textarea rows={3} value={motif} onChange={(e) => setMotif(e.target.value)}
            placeholder="Raison de l'annulation..." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Retour</Button>
          <Button variant="destructive" disabled={motif.trim().length < 3 || m.isPending}
            onClick={() => m.mutate()}>
            {m.isPending ? "Annulation..." : "Confirmer l'annulation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(Number(n) || 0)) + " F";
}

interface VenteLigne {
  id: string;
  quantite: number;
  prix_unitaire: number;
  montant_ligne: number;
  produits: { nom: string; reference: string | null; type_emballage: string } | null;
}

function VenteDetailDialog({
  vente, magasinNom, magasinId, onClose,
}: {
  vente: Vente | null;
  magasinNom: string | null;
  magasinId: string | null;
  onClose: () => void;
}) {
  const open = !!vente;

  const { data: details, isLoading } = useQuery({
    queryKey: ["vente-detail", vente?.id],
    enabled: !!vente?.id,
    queryFn: async () => {
      const [{ data: full, error: e1 }, { data: lignes, error: e2 }] = await Promise.all([
        supabase
          .from("ventes")
          .select("vendeur_id, annulee_par, annulee_le, motif_annulation, remise, montant_credit, notes")
          .eq("id", vente!.id)
          .single(),
        supabase
          .from("vente_lignes")
          .select("id, quantite, prix_unitaire, montant_ligne, produits(nom, reference, type_emballage)")
          .eq("vente_id", vente!.id),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      let vendeurName: string | null = null;
      let vendeurIsAdmin = false;
      if (full?.vendeur_id) {
        const [{ data: prof }, { data: roles }] = await Promise.all([
          supabase.from("profiles").select("display_name").eq("id", full.vendeur_id).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", full.vendeur_id),
        ]);
        vendeurName = prof?.display_name ?? null;
        vendeurIsAdmin = (roles ?? []).some((r) => r.role === "admin");
      }

      return {
        full,
        lignes: (lignes ?? []) as unknown as VenteLigne[],
        vendeurName,
        vendeurIsAdmin,
      };
    },
  });

  const exportPdf = async () => {
    if (!vente || !details) return;
    const { doc, cursorY } = createPdf(`Vente n°${vente.numero}`, magasinNom ?? undefined);
    let y = cursorY;

    y = pdfSectionTitle(doc, y, "Informations générales");
    y = pdfInfoTable(doc, y, [
      ["Numéro", `#${vente.numero}`],
      ["Date & heure", fmtDateLong(vente.date_vente)],
      ["Client", vente.clients?.nom ?? "—"],
      ["Mode de paiement", MODE_LABELS[vente.mode_paiement]],
      ["Vendeur", `${details.vendeurName ?? "Inconnu"} (${details.vendeurIsAdmin ? "Administrateur" : "Utilisateur"})`],
      ["Statut", vente.statut === "annulee" ? "Annulée" : "Validée"],
    ]);

    y = pdfSectionTitle(doc, y + 2, "Montants");
    y = pdfInfoTable(doc, y, [
      ["Montant total", fmtMoney(vente.montant_total)],
      ["Montant payé", fmtMoney(vente.montant_paye)],
      ["Crédit restant", fmtMoney(vente.credit_restant)],
    ]);

    y = pdfSectionTitle(doc, y + 2, `Produits (${details.lignes.length})`);
    const body = details.lignes.map((l) => [
      l.produits?.nom ?? "—",
      l.produits?.reference ?? "—",
      fmtNumber(l.quantite),
      fmtMoney(l.prix_unitaire),
      fmtMoney(l.montant_ligne),
    ]);
    y = pdfDataTable(
      doc,
      y + 2,
      ["Produit", "Réf.", "Qté", "P.U.", "Montant"],
      body,
      {
        columnStyles: {
          2: { halign: "right", cellWidth: 18 },
          3: { halign: "right", cellWidth: 32 },
          4: { halign: "right", cellWidth: 36 },
        },
      },
    );

    if (vente.notes) {
      y = pdfSectionTitle(doc, y + 2, "Notes");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(vente.notes, 180);
      doc.text(lines, 14, y + 2);
      y += 2 + lines.length * 5;
    }

    if (vente.statut === "annulee" && details.full?.motif_annulation) {
      y = pdfSectionTitle(doc, y + 4, "Annulation");
      y = pdfInfoTable(doc, y, [
        ["Motif", details.full.motif_annulation],
        ["Annulée le", details.full.annulee_le ? fmtDateLong(details.full.annulee_le) : "—"],
      ]);
    }

    doc.save(`vente-${vente.numero}.pdf`);

    await logAuditEvent({
      action: "EXPORT_PDF",
      table_name: "ventes",
      record_id: vente.id,
      magasin_id: magasinId,
      details: `Export PDF de la vente #${vente.numero} (${vente.clients?.nom ?? "client inconnu"}, ${fmtMoney(vente.montant_total)})`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {vente && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <Receipt className="w-5 h-5" /> Vente #{vente.numero}
                <Badge variant={vente.statut === "annulee" ? "destructive" : "default"} className="ml-2">
                  {vente.statut === "annulee" ? "Annulée" : "Validée"}
                </Badge>
              </DialogTitle>
              <DialogDescription>Détails complets de la transaction</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <InfoBlock icon={<Calendar className="w-4 h-4" />} label="Date & heure"
                value={fmtDateLong(vente.date_vente)} />
              <InfoBlock icon={<UserIcon className="w-4 h-4" />} label="Client" value={vente.clients?.nom ?? "—"} />
              <InfoBlock icon={<CreditCard className="w-4 h-4" />} label="Mode de paiement"
                value={<Badge variant="outline">{MODE_LABELS[vente.mode_paiement]}</Badge>} />
              <InfoBlock icon={<UserIcon className="w-4 h-4" />} label="Vendeur"
                value={
                  isLoading ? "Chargement..." : (
                    <span className="flex items-center gap-2 flex-wrap">
                      {details?.vendeurName || "Utilisateur inconnu"}
                      <Badge variant={details?.vendeurIsAdmin ? "default" : "secondary"} className="text-[10px]">
                        {details?.vendeurIsAdmin ? "Administrateur" : "Utilisateur"}
                      </Badge>
                    </span>
                  )
                } />
            </div>

            <div className="rounded-md border bg-muted/20 p-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Total</div>
                <div className="font-semibold tabular-nums">{fmt(vente.montant_total)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Payé</div>
                <div className="tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">{fmt(vente.montant_paye)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Crédit restant</div>
                <div className={`tabular-nums font-medium ${Number(vente.credit_restant) > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{fmt(vente.credit_restant)}</div>
              </div>
            </div>

            <div>
              <div className="font-medium mb-2 text-sm flex items-center gap-2">
                <Package className="w-4 h-4" /> Produits ({(details?.lignes ?? []).length})
              </div>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead>Réf.</TableHead>
                      <TableHead className="text-right">Qté</TableHead>
                      <TableHead className="text-right">PU</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Chargement...</TableCell></TableRow>}
                    {!isLoading && (details?.lignes ?? []).length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Aucune ligne</TableCell></TableRow>
                    )}
                    {(details?.lignes ?? []).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.produits?.nom ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{l.produits?.reference ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(l.quantite)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(Number(l.prix_unitaire))}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(Number(l.montant_ligne))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {vente.notes && (
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notes</div>
                {vente.notes}
              </div>
            )}

            {vente.statut === "annulee" && details?.full?.motif_annulation && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-destructive mb-1">Motif d'annulation</div>
                {details.full.motif_annulation}
                {details.full.annulee_le && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Annulée le {fmtDateLong(details.full.annulee_le)}
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={onClose}>Fermer</Button>
              <Button onClick={exportPdf} disabled={isLoading || !details} className="gap-2">
                <FileDown className="w-4 h-4" /> Exporter en PDF
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoBlock({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">{icon} {label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
