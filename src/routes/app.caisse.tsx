import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMagasinStore } from "@/lib/magasin-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus, Minus, Trash2, ShoppingCart, Check, ChevronsUpDown, Receipt, AlertCircle, Percent,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/caisse")({
  component: CaissePage,
});

type ModePaiement = "comptant" | "credit" | "mixte";

interface Produit {
  id: string;
  nom: string;
  reference: string | null;
  prix_vente_unitaire: number;
  stock_actuel: number;
  statut: string;
}
interface Client {
  id: string;
  nom: string;
  type: string;
  statut: string;
  budget_max: number;
  dette_totale: number;
  is_passager_systeme: boolean;
}
interface Ligne {
  produit_id: string;
  nom: string;
  quantite: number;
  prix_unitaire: number;
  stock_disponible: number;
}

function CaissePage() {
  const { isAdmin } = useAuth();
  const { magasinId, magasinNom } = useMagasinStore();
  const qc = useQueryClient();

  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [mode, setMode] = useState<ModePaiement>("comptant");
  const [montantPaye, setMontantPaye] = useState<string>("");
  const [remise, setRemise] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [openProdPicker, setOpenProdPicker] = useState(false);

  const { data: produits } = useQuery({
    queryKey: ["produits-actifs", magasinId],
    enabled: !!magasinId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produits")
        .select("id, nom, reference, prix_vente_unitaire, stock_actuel, statut")
        .eq("magasin_id", magasinId!)
        .eq("statut", "actif")
        .order("nom");
      if (error) throw error;
      return data as Produit[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-caisse"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, nom, type, statut, budget_max, dette_totale, is_passager_systeme")
        .eq("statut", "actif")
        .order("is_passager_systeme", { ascending: false })
        .order("nom");
      if (error) throw error;
      return data as Client[];
    },
  });

  // Auto-sélection du Passager au montage
  useEffect(() => {
    if (!clientId && clients) {
      const p = clients.find((c) => c.is_passager_systeme);
      if (p) setClientId(p.id);
    }
  }, [clients, clientId]);

  const sousTotal = useMemo(
    () => lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0),
    [lignes],
  );
  const remiseNum = Math.max(0, Math.min(Number(remise || 0), sousTotal));
  const total = Math.max(0, sousTotal - remiseNum);

  const client = clients?.find((c) => c.id === clientId);
  const credit = mode === "comptant" ? 0 : mode === "credit" ? total : Math.max(0, total - Number(montantPaye || 0));

  const ajouterProduit = (p: Produit) => {
    if (p.stock_actuel <= 0) { toast.error("Stock épuisé"); return; }
    setLignes((prev) => {
      const ex = prev.find((l) => l.produit_id === p.id);
      if (ex) {
        if (ex.quantite + 1 > p.stock_actuel) { toast.error("Quantité > stock"); return prev; }
        return prev.map((l) => l.produit_id === p.id ? { ...l, quantite: l.quantite + 1 } : l);
      }
      return [...prev, {
        produit_id: p.id,
        nom: p.nom,
        quantite: 1,
        prix_unitaire: Number(p.prix_vente_unitaire),
        stock_disponible: Number(p.stock_actuel),
      }];
    });
    setOpenProdPicker(false);
  };

  const updateQte = (id: string, qte: number) => {
    setLignes((prev) => prev.map((l) => {
      if (l.produit_id !== id) return l;
      const q = Math.max(1, Math.min(qte, l.stock_disponible));
      return { ...l, quantite: q };
    }));
  };
  const updatePrix = (id: string, pu: number) => {
    setLignes((prev) => prev.map((l) => l.produit_id === id ? { ...l, prix_unitaire: Math.max(0, pu) } : l));
  };
  const removeLigne = (id: string) => setLignes((prev) => prev.filter((l) => l.produit_id !== id));

  const reset = () => {
    setLignes([]); setMode("comptant"); setMontantPaye(""); setRemise(""); setNotes("");
    const p = clients?.find((c) => c.is_passager_systeme);
    setClientId(p?.id ?? "");
  };

  const valider = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Sélectionnez un client");
      if (lignes.length === 0) throw new Error("Aucun produit dans la vente");

      const paye = mode === "comptant" ? total
        : mode === "credit" ? 0
        : Number(montantPaye || 0);

      const { data, error } = await supabase.rpc("create_vente", {
        p_magasin_id: magasinId!,
        p_client_id: clientId,
        p_mode: mode,
        p_montant_paye: paye,
        p_lignes: lignes.map((l) => ({
          produit_id: l.produit_id,
          quantite: l.quantite,
          prix_unitaire: l.prix_unitaire,
        })),
        p_notes: notes || undefined,
        p_remise: remiseNum || 0,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Vente enregistrée");
      reset();
      qc.invalidateQueries({ queryKey: ["produits-actifs", magasinId] });
      qc.invalidateQueries({ queryKey: ["produits", magasinId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients-caisse"] });
      qc.invalidateQueries({ queryKey: ["ventes", magasinId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Validations live
  const canValidate = useMemo(() => {
    if (!clientId || lignes.length === 0) return false;
    if (mode === "comptant") return total >= 0;
    if (mode === "credit") {
      if (!client || client.is_passager_systeme) return false;
      return client.dette_totale + total <= client.budget_max;
    }
    // mixte
    const p = Number(montantPaye || 0);
    if (p <= 0 || p >= total) return false;
    if (!client || client.is_passager_systeme) return false;
    return client.dette_totale + (total - p) <= client.budget_max;
  }, [clientId, lignes, mode, montantPaye, total, client]);

  return (
    <div className="p-4 md:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-7 h-7" /> Caisse
          </h1>
          <p className="text-muted-foreground mt-1">
            Nouvelle vente — <span className="text-foreground font-medium">{magasinNom}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Panier */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>Panier</CardTitle>
              <Popover open={openProdPicker} onOpenChange={setOpenProdPicker}>
                <PopoverTrigger asChild>
                  <Button size="sm"><Plus className="w-4 h-4 mr-1.5" /> Ajouter produit</Button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Rechercher un produit..." />
                    <CommandList>
                      <CommandEmpty>Aucun produit</CommandEmpty>
                      <CommandGroup>
                        {(produits ?? []).map((p) => (
                          <CommandItem
                            key={p.id}
                            value={`${p.nom} ${p.reference ?? ""}`}
                            onSelect={() => ajouterProduit(p)}
                            disabled={p.stock_actuel <= 0}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{p.nom}</div>
                              <div className="text-xs text-muted-foreground">
                                {fmt(p.prix_vente_unitaire)} · Stock: {p.stock_actuel}
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </CardHeader>
          <CardContent>
            {lignes.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Panier vide — ajoutez un produit pour commencer</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lignes.map((l) => (
                  <div key={l.produit_id} className="flex items-center gap-3 p-3 rounded-md border bg-card">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{l.nom}</div>
                      <div className="text-xs text-muted-foreground">Stock dispo : {l.stock_disponible}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateQte(l.produit_id, l.quantite - 1)}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <Input
                        type="number" min="1" max={l.stock_disponible}
                        value={l.quantite}
                        onChange={(e) => updateQte(l.produit_id, Number(e.target.value) || 1)}
                        className="w-16 h-8 text-center tabular-nums"
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateQte(l.produit_id, l.quantite + 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="text-muted-foreground">×</span>
                      <Input
                        type="number" min="0" step="50"
                        value={l.prix_unitaire}
                        onChange={(e) => updatePrix(l.produit_id, Number(e.target.value) || 0)}
                        className="w-24 h-8 text-right tabular-nums"
                      />
                    </div>
                    <div className="w-28 text-right font-medium tabular-nums">
                      {fmt(l.quantite * l.prix_unitaire)}
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeLigne(l.produit_id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Récap & paiement */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Encaissement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Client */}
            <div className="space-y-1.5">
              <Label>Client</Label>
              <ClientPicker
                clients={clients ?? []}
                value={clientId}
                onChange={setClientId}
              />
              {client && !client.is_passager_systeme && (
                <div className="text-xs text-muted-foreground pt-1">
                  Dette actuelle : <span className="tabular-nums">{fmt(client.dette_totale)}</span> /
                  Plafond : <span className="tabular-nums">{fmt(client.budget_max)}</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Remise (admin uniquement) */}
            {isAdmin && (
              <div className="space-y-1.5">
                <Label htmlFor="remise" className="flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5" /> Réduction (FCFA)
                </Label>
                <Input
                  id="remise" type="number" min="0" max={sousTotal} step="100"
                  value={remise}
                  onChange={(e) => setRemise(e.target.value)}
                  placeholder="0"
                />
                {remiseNum > 0 && (
                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <span className="text-muted-foreground">Sous-total</span>
                    <span className="tabular-nums line-through text-muted-foreground">{fmt(sousTotal)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Total */}
            <div className="flex items-center justify-between text-lg">
              <span className="text-muted-foreground">Total à payer</span>
              <span className="font-bold tabular-nums">{fmt(total)}</span>
            </div>

            {/* Mode paiement */}
            <div className="space-y-1.5">
              <Label>Mode de paiement</Label>
              <Select value={mode} onValueChange={(v) => { setMode(v as ModePaiement); setMontantPaye(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="comptant">Comptant</SelectItem>
                  <SelectItem value="credit" disabled={!client || client.is_passager_systeme}>
                    Crédit{client?.is_passager_systeme ? " (non dispo pour Passager)" : ""}
                  </SelectItem>
                  <SelectItem value="mixte" disabled={!client || client.is_passager_systeme}>
                    Mixte (avance + crédit)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === "comptant" && total > 0 && (
              <div className="rounded-md border bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm text-emerald-900 dark:text-emerald-200">
                Le client doit régler <strong className="tabular-nums">{fmt(total)}</strong> intégralement.
              </div>
            )}

            {/* Mixte : avance */}
            {mode === "mixte" && (
              <div className="space-y-1.5">
                <Label htmlFor="avance">Avance payée</Label>
                <Input
                  id="avance" type="number" min="0" step="100"
                  value={montantPaye}
                  onChange={(e) => setMontantPaye(e.target.value)}
                />
                <div className="flex items-center justify-between text-sm pt-1">
                  <span className="text-muted-foreground">Reste à crédit</span>
                  <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                    {fmt(credit)}
                  </span>
                </div>
              </div>
            )}

            {/* Crédit : reste à crédit = total */}
            {mode === "credit" && total > 0 && (
              <div className="rounded-md border bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-medium">
                  <AlertCircle className="w-4 h-4" /> Vente à crédit
                </div>
                <div className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                  Le montant total ({fmt(total)}) sera ajouté à la dette de {client?.nom}.
                </div>
              </div>
            )}

            {/* Budget dépassé */}
            {credit > 0 && client && !client.is_passager_systeme && client.dette_totale + credit > client.budget_max && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                Plafond de crédit dépassé : {fmt(client.dette_totale + credit)} &gt; {fmt(client.budget_max)}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optionnel)</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={reset} disabled={lignes.length === 0}>
                Réinitialiser
              </Button>
              <Button
                className="flex-1"
                onClick={() => valider.mutate()}
                disabled={!canValidate || valider.isPending}
              >
                <Receipt className="w-4 h-4 mr-1.5" />
                {valider.isPending ? "Validation..." : "Valider"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ClientPicker({
  clients, value, onChange,
}: { clients: Client[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = clients.find((c) => c.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">
            {selected ? selected.nom : "Choisir un client..."}
            {selected?.is_passager_systeme && (
              <Badge variant="secondary" className="ml-2 text-[10px]">système</Badge>
            )}
          </span>
          <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Rechercher..." />
          <CommandList>
            <CommandEmpty>Aucun client</CommandEmpty>
            <CommandGroup>
              {clients.map((c) => (
                <CommandItem
                  key={c.id} value={`${c.nom} ${c.type}`}
                  onSelect={() => { onChange(c.id); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{c.nom}</div>
                    {!c.is_passager_systeme && (
                      <div className="text-xs text-muted-foreground">
                        Dette : {fmt(c.dette_totale)} / {fmt(c.budget_max)}
                      </div>
                    )}
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
