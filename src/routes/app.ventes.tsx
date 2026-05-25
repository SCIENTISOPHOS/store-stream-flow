import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMagasinStore } from "@/lib/magasin-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Receipt } from "lucide-react";

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
  const { magasinId, magasinNom } = useMagasinStore();

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
    <div className="p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Chargement...</TableCell></TableRow>
              )}
              {!isLoading && (!ventes || ventes.length === 0) && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">Aucune vente enregistrée</TableCell></TableRow>
              )}
              {ventes?.map((v) => (
                <TableRow key={v.id} className={v.statut === "annulee" ? "opacity-50" : ""}>
                  <TableCell className="tabular-nums text-muted-foreground">#{v.numero}</TableCell>
                  <TableCell className="text-sm">
                    {new Date(v.date_vente).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  </TableCell>
                  <TableCell className="font-medium">{v.clients?.nom ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{MODE_LABELS[v.mode_paiement]}</Badge>
                  </TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(Number(n) || 0)) + " F";
}
