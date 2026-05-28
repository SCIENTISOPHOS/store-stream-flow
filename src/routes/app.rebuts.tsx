import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMagasinStore } from "@/lib/magasin-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/rebuts")({
  component: RebutsPage,
});

interface Produit {
  id: string;
  nom: string;
  stock_actuel: number;
  type_emballage: string;
}

interface Rebut {
  id: string;
  created_at: string;
  quantite: number;
  motif: string;
  notes: string | null;
  produit_id: string;
}

function RebutsPage() {
  const { isAdmin } = useAuth();
  const { magasinId, magasinNom } = useMagasinStore();
  const qc = useQueryClient();

  const [produitId, setProduitId] = useState("");
  const [qte, setQte] = useState("");
  const [motif, setMotif] = useState("");
  const [notes, setNotes] = useState("");

  const { data: produits } = useQuery({
    queryKey: ["produits-rebut", magasinId],
    enabled: !!magasinId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produits")
        .select("id, nom, stock_actuel, type_emballage")
        .eq("magasin_id", magasinId!)
        .eq("statut", "actif")
        .gt("stock_actuel", 0)
        .order("nom");
      if (error) throw error;
      return data as Produit[];
    },
  });

  const { data: rebuts } = useQuery({
    queryKey: ["rebuts", magasinId],
    enabled: !!magasinId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rebuts")
        .select("id, created_at, quantite, motif, notes, produit_id")
        .eq("magasin_id", magasinId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Rebut[];
    },
  });

  const produit = produits?.find((p) => p.id === produitId);
  const qteNum = Number(qte || 0);
  const insuffisant = produit && qteNum > Number(produit.stock_actuel);

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_rebut", {
        p_magasin_id: magasinId!,
        p_produit_id: produitId,
        p_quantite: qteNum,
        p_motif: motif,
        p_notes: notes || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rebut enregistré");
      setProduitId(""); setQte(""); setMotif(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["rebuts", magasinId] });
      qc.invalidateQueries({ queryKey: ["produits-rebut", magasinId] });
      qc.invalidateQueries({ queryKey: ["produits"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Trash2 className="w-7 h-7" /> Rebuts
        </h1>
        <p className="text-muted-foreground mt-1">
          Pertes sèches — magasin <span className="text-foreground font-medium">{magasinNom}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle>Nouveau rebut</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!isAdmin && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                Seul un administrateur peut valider un rebut.
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Produit</Label>
              <Select value={produitId} onValueChange={setProduitId} disabled={!isAdmin}>
                <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>
                  {(produits ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nom} — stock {Number(p.stock_actuel)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantité</Label>
              <Input type="number" min="0" step="0.001" value={qte}
                onChange={(e) => setQte(e.target.value)} disabled={!isAdmin || !produitId} />
              {insuffisant && <p className="text-xs text-destructive">Stock insuffisant</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Motif</Label>
              <Input value={motif} onChange={(e) => setMotif(e.target.value)}
                placeholder="Périmé, abîmé, ..." disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optionnel)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!isAdmin} />
            </div>
            <Button
              variant="destructive"
              disabled={!isAdmin || !produitId || qteNum <= 0 || motif.trim().length < 3 || !!insuffisant || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Enregistrement..." : "Valider le rebut"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle>Historique</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {!rebuts || rebuts.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">Aucun rebut</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead>Motif</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rebuts.map((r) => {
                    const nom = produits?.find((p) => p.id === r.produit_id)?.nom ?? "—";
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">{new Date(r.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                        <TableCell className="font-medium">{nom}</TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">{Number(r.quantite)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.motif}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
