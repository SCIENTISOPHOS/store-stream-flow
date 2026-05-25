import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMagasinStore } from "@/lib/magasin-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  HandCoins, Check, ChevronsUpDown, AlertCircle, Ban,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/app/recouvrements")({
  component: RecouvrementsPage,
});

interface Client {
  id: string;
  nom: string;
  dette_totale: number;
  budget_max: number;
  is_passager_systeme: boolean;
  statut: string;
}

interface Recouvrement {
  id: string;
  numero: number;
  date_recouvrement: string;
  montant: number;
  statut: string;
  notes: string | null;
  client_id: string;
  clients: { nom: string } | null;
  magasins: { nom: string } | null;
}

function RecouvrementsPage() {
  const { isAdmin } = useAuth();
  const { magasinId, magasinNom } = useMagasinStore();
  const qc = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [montant, setMontant] = useState("");
  const [notes, setNotes] = useState("");
  const [montant, setMontant] = useState("");
  const [notes, setNotes] = useState("");

  const { data: clients } = useQuery({
    queryKey: ["clients-recouvrement"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, nom, dette_totale, budget_max, is_passager_systeme, statut")
        .gt("dette_totale", 0)
        .eq("is_passager_systeme", false)
        .order("dette_totale", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });

  const { data: recouvrements } = useQuery({
    queryKey: ["recouvrements-recents", magasinId],
    enabled: !!magasinId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recouvrements")
        .select("id, numero, date_recouvrement, montant, statut, notes, client_id, clients(nom), magasins(nom)")
        .order("date_recouvrement", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as unknown as Recouvrement[];
    },
  });

  const client = clients?.find((c) => c.id === clientId);
  const montantNum = Number(montant || 0);
  const tropEleve = client && montantNum > Number(client.dette_totale);

  const valider = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Sélectionnez un client");
      if (montantNum <= 0) throw new Error("Montant invalide");

      const { data, error } = await supabase.rpc("create_recouvrement", {
        p_magasin_id: magasinId!,
        p_client_id: clientId,
        p_montant: montantNum,
        p_notes: notes || undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Recouvrement enregistré");
      setClientId(""); setMontant(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients-recouvrement"] });
      qc.invalidateQueries({ queryKey: ["recouvrements-recents", magasinId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalDettes = useMemo(
    () => (clients ?? []).reduce((s, c) => s + Number(c.dette_totale), 0),
    [clients],
  );

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <HandCoins className="w-7 h-7" /> Recouvrements
          </h1>
          <p className="text-muted-foreground mt-1">
            Encaissement des dettes — imputation FIFO toutes-magasins
            ({magasinNom} : magasin de l'encaisse)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        {/* Form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Nouvel encaissement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Client débiteur</Label>
              <ClientDettePicker
                clients={clients ?? []}
                value={clientId}
                onChange={(id) => { setClientId(id); setMontant(""); }}
              />
              {client && (
                <div className="rounded-md border p-3 mt-2 bg-muted/30">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Dette totale</span>
                    <span className="font-semibold tabular-nums">{fmt(client.dette_totale)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m">Montant encaissé (FCFA)</Label>
              <Input
                id="m" type="number" min="0" step="100"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                disabled={!clientId}
              />
              {tropEleve && (
                <div className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="w-3.5 h-3.5" /> Supérieur à la dette
                </div>
              )}
              {client && montantNum > 0 && !tropEleve && (
                <div className="text-xs text-muted-foreground">
                  Dette après : <span className="tabular-nums font-medium">{fmt(Number(client.dette_totale) - montantNum)}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optionnel)</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3 text-xs text-blue-900 dark:text-blue-200">
              Le montant sera imputé en priorité aux ventes à crédit <strong>les plus anciennes</strong>,
              quel que soit le magasin où elles ont été faites.
            </div>

            <Button
              className="w-full"
              onClick={() => valider.mutate()}
              disabled={!clientId || montantNum <= 0 || !!tropEleve || valider.isPending}
            >
              {valider.isPending ? "Enregistrement..." : "Enregistrer le recouvrement"}
            </Button>
          </CardContent>
        </Card>

        {/* Historique + dettes en cours */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>Clients débiteurs</CardTitle>
                <div className="text-sm text-muted-foreground">
                  Total : <span className="font-semibold tabular-nums text-foreground">{fmt(totalDettes)}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!clients || clients.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">Aucune dette en cours</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Dette</TableHead>
                      <TableHead className="text-right">Plafond</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.nom}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmt(c.dette_totale)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(c.budget_max)}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => setClientId(c.id)}>
                            Encaisser
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Recouvrements récents</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {!recouvrements || recouvrements.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">Aucun recouvrement</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">N°</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Magasin</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recouvrements.map((r) => (
                      <TableRow key={r.id} className={r.statut === "annulee" ? "opacity-50" : ""}>
                        <TableCell className="tabular-nums text-muted-foreground">#{r.numero}</TableCell>
                        <TableCell className="text-sm">{new Date(r.date_recouvrement).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                        <TableCell className="font-medium">{r.clients?.nom ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.magasins?.nom ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(r.montant)}</TableCell>
                        <TableCell>
                          <Badge variant={r.statut === "annulee" ? "destructive" : "default"}>
                            {r.statut === "annulee" ? "Annulé" : "Validé"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ClientDettePicker({
  clients, value, onChange,
}: { clients: Client[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = clients.find((c) => c.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">{selected ? selected.nom : "Choisir un client..."}</span>
          <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Rechercher..." />
          <CommandList>
            <CommandEmpty>Aucun client avec dette</CommandEmpty>
            <CommandGroup>
              {clients.map((c) => (
                <CommandItem
                  key={c.id} value={c.nom}
                  onSelect={() => { onChange(c.id); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{c.nom}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">Dette : {fmt(c.dette_totale)}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(Number(n) || 0)) + " F";
}
