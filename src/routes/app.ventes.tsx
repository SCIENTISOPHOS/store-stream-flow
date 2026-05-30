import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMagasinStore } from "@/lib/magasin-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Receipt, Ban, Eye, User as UserIcon, Calendar, CreditCard, Package } from "lucide-react";
import { toast } from "sonner";

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

function VentesPage() {
  const { isAdmin } = useAuth();
  const { magasinId, magasinNom } = useMagasinStore();
  const qc = useQueryClient();
  const [detailVente, setDetailVente] = useState<Vente | null>(null);

  const { data: ventes, isLoading } = useQuery({
    queryKey: ["ventes", magasinId],
    enabled: !!magasinId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ventes")
        .select("id, numero, date_vente, mode_paiement, montant_total, montant_paye, montant_credit, credit_restant, statut, notes, clients(nom)")
        .eq("magasin_id", magasinId!)
        .order("date_vente", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as Vente[];
    },
  });

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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>100 dernières ventes</CardTitle>
        </CardHeader>
        <CardContent>
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
              {!isLoading && (!ventes || ventes.length === 0) && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-12">Aucune vente enregistrée</TableCell></TableRow>
              )}
              {ventes?.map((v) => (
                <TableRow
                  key={v.id}
                  className={`cursor-pointer hover:bg-muted/40 ${v.statut === "annulee" ? "opacity-50" : ""}`}
                  onClick={() => setDetailVente(v)}
                >
                  <TableCell className="tabular-nums text-muted-foreground">#{v.numero}</TableCell>
                  <TableCell className="text-sm">
                    {new Date(v.date_vente).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
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
        </CardContent>
      </Card>

      <VenteDetailDialog vente={detailVente} onClose={() => setDetailVente(null)} />
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
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
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

function VenteDetailDialog({ vente, onClose }: { vente: Vente | null; onClose: () => void }) {
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {vente && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="w-5 h-5" /> Vente #{vente.numero}
                <Badge variant={vente.statut === "annulee" ? "destructive" : "default"} className="ml-2">
                  {vente.statut === "annulee" ? "Annulée" : "Validée"}
                </Badge>
              </DialogTitle>
              <DialogDescription>Détails complets de la transaction</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoBlock icon={<Calendar className="w-4 h-4" />} label="Date & heure"
                value={new Date(vente.date_vente).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })} />
              <InfoBlock icon={<UserIcon className="w-4 h-4" />} label="Client" value={vente.clients?.nom ?? "—"} />
              <InfoBlock icon={<CreditCard className="w-4 h-4" />} label="Mode de paiement"
                value={<Badge variant="outline">{MODE_LABELS[vente.mode_paiement]}</Badge>} />
              <InfoBlock icon={<UserIcon className="w-4 h-4" />} label="Vendeur"
                value={
                  isLoading ? "Chargement..." : (
                    <span className="flex items-center gap-2">
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
                    Annulée le {new Date(details.full.annulee_le).toLocaleString("fr-FR")}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Fermer</Button>
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
