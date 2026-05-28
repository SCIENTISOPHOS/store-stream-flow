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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Repeat, AlertTriangle, PackageOpen } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/conversions")({
  component: ConversionsPage,
});

interface Produit {
  id: string;
  nom: string;
  type_emballage: "sac" | "demi_sac" | "unite";
  stock_actuel: number;
  statut: string;
  prix_vente_unitaire: number;
  prix_achat_unitaire: number;
  produit_parent_id: string | null;
}

interface Conversion {
  id: string;
  created_at: string;
  type_conversion: "sac_vers_demi" | "sac_perce";
  quantite_sacs: number;
  quantite_demi_produite: number;
  quantite_perdue: number;
  notes: string | null;
  produit_sac: { nom: string } | null;
  produit_demi: { nom: string } | null;
}

function ConversionsPage() {
  const { magasinId, magasinNom } = useMagasinStore();
  const qc = useQueryClient();

  const { data: produits } = useQuery({
    queryKey: ["produits-conv", magasinId],
    enabled: !!magasinId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produits")
        .select("id, nom, type_emballage, stock_actuel, statut, prix_vente_unitaire, prix_achat_unitaire, produit_parent_id")
        .eq("magasin_id", magasinId!)
        .eq("statut", "actif")
        .order("nom");
      if (error) throw error;
      return data as Produit[];
    },
  });

  const sacs = useMemo(() => (produits ?? []).filter((p) => p.type_emballage === "sac"), [produits]);
  const demis = useMemo(() => (produits ?? []).filter((p) => p.type_emballage === "demi_sac"), [produits]);

  const { data: conversions } = useQuery({
    queryKey: ["conversions", magasinId],
    enabled: !!magasinId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversions_emballage")
        .select("id, created_at, type_conversion, quantite_sacs, quantite_demi_produite, quantite_perdue, notes, produit_sac:produits!conversions_emballage_produit_sac_id_fkey(nom), produit_demi:produits!conversions_emballage_produit_demi_id_fkey(nom)")
        .eq("magasin_id", magasinId!)
        .order("created_at", { ascending: false })
        .limit(50);
      // FK names may differ; fallback without joins
      if (error) {
        const fb = await supabase
          .from("conversions_emballage")
          .select("id, created_at, type_conversion, quantite_sacs, quantite_demi_produite, quantite_perdue, notes, produit_sac_id, produit_demi_id")
          .eq("magasin_id", magasinId!)
          .order("created_at", { ascending: false })
          .limit(50);
        if (fb.error) throw fb.error;
        return (fb.data ?? []).map((r: any) => ({
          ...r,
          produit_sac: produits?.find((p) => p.id === r.produit_sac_id) ?? null,
          produit_demi: produits?.find((p) => p.id === r.produit_demi_id) ?? null,
        })) as unknown as Conversion[];
      }
      return data as unknown as Conversion[];
    },
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Repeat className="w-7 h-7" /> Conversions d'emballage
        </h1>
        <p className="text-muted-foreground mt-1">
          Sac → Demi-sacs / Sacs percés — magasin <span className="text-foreground font-medium">{magasinNom}</span>
        </p>
      </div>

      <Tabs defaultValue="conv" className="space-y-6">
        <TabsList>
          <TabsTrigger value="conv"><Repeat className="w-4 h-4 mr-1.5" /> Sac → Demi-sacs</TabsTrigger>
          <TabsTrigger value="perce"><AlertTriangle className="w-4 h-4 mr-1.5" /> Sac percé</TabsTrigger>
        </TabsList>

        <TabsContent value="conv">
          <ConversionForm sacs={sacs} demis={demis} magasinId={magasinId!} onDone={() => {
            qc.invalidateQueries({ queryKey: ["produits"] });
            qc.invalidateQueries({ queryKey: ["produits-conv", magasinId] });
            qc.invalidateQueries({ queryKey: ["conversions", magasinId] });
          }} />
        </TabsContent>

        <TabsContent value="perce">
          <SacPerceForm sacs={sacs} demis={demis} magasinId={magasinId!} onDone={() => {
            qc.invalidateQueries({ queryKey: ["produits"] });
            qc.invalidateQueries({ queryKey: ["produits-conv", magasinId] });
            qc.invalidateQueries({ queryKey: ["conversions", magasinId] });
            qc.invalidateQueries({ queryKey: ["rebuts", magasinId] });
          }} />
        </TabsContent>
      </Tabs>

      <Card className="mt-6">
        <CardHeader className="pb-3"><CardTitle>Historique des conversions</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {!conversions || conversions.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">Aucune conversion</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Sac source</TableHead>
                  <TableHead>Demi-sac cible</TableHead>
                  <TableHead className="text-right">Sacs</TableHead>
                  <TableHead className="text-right">Demi produits</TableHead>
                  <TableHead className="text-right">Perdu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">{new Date(c.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                    <TableCell>
                      <Badge variant={c.type_conversion === "sac_perce" ? "destructive" : "default"}>
                        {c.type_conversion === "sac_perce" ? "Sac percé" : "Découpe"}
                      </Badge>
                    </TableCell>
                    <TableCell>{c.produit_sac?.nom ?? "—"}</TableCell>
                    <TableCell>{c.produit_demi?.nom ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(c.quantite_sacs)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(c.quantite_demi_produite)}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {Number(c.quantite_perdue) > 0 ? Number(c.quantite_perdue) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConversionForm({ sacs, demis, magasinId, onDone }: {
  sacs: Produit[]; demis: Produit[]; magasinId: string; onDone: () => void;
}) {
  const [sacId, setSacId] = useState("");
  const [qte, setQte] = useState("");
  const [notes, setNotes] = useState("");
  const sac = sacs.find((s) => s.id === sacId);
  const qteNum = Number(qte || 0);
  const insuffisant = sac && qteNum > Number(sac.stock_actuel);

  // Cherche un demi-sac existant lié à ce sac (par parent ou par nom "<sac> DEMI")
  const findExistingDemi = (s: Produit): Produit | undefined => {
    const expectedNom = `${s.nom} DEMI`.toLowerCase();
    return demis.find(
      (d) => d.produit_parent_id === s.id || d.nom.toLowerCase() === expectedNom,
    );
  };

  const existingDemi = sac ? findExistingDemi(sac) : undefined;
  const prixDemiPreview = sac ? Number(sac.prix_vente_unitaire) / 2 + 500 : 0;

  const m = useMutation({
    mutationFn: async () => {
      if (!sacId || qteNum <= 0) throw new Error("Champs requis");
      if (!sac) throw new Error("Sac introuvable");

      // 1) Trouver ou créer le produit demi-sac
      let demiId = existingDemi?.id;
      if (!demiId) {
        const nomDemi = `${sac.nom} DEMI`;
        const prixVente = Number(sac.prix_vente_unitaire) / 2 + 500;
        const prixAchat = Number(sac.prix_achat_unitaire) / 2;
        const { data: created, error: insErr } = await supabase
          .from("produits")
          .insert({
            magasin_id: magasinId,
            nom: nomDemi,
            type_emballage: "demi_sac",
            prix_vente_unitaire: prixVente,
            prix_achat_unitaire: prixAchat,
            stock_actuel: 0,
            stock_seuil_alerte: 0,
            produit_parent_id: sac.id,
            statut: "actif",
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        demiId = created.id;
      }

      // 2) Conversion via RPC
      const { error } = await supabase.rpc("convert_sac_to_demi", {
        p_magasin_id: magasinId,
        p_produit_sac_id: sacId,
        p_produit_demi_id: demiId!,
        p_quantite_sacs: qteNum,
        p_notes: notes || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Converti : ${qteNum} sac(s) → ${qteNum * 2} demi-sac(s)`);
      setSacId(""); setQte(""); setNotes("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle>Découper un Sac en 2 Demi-sacs</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Produit Sac (source)</Label>
          <Select value={sacId} onValueChange={setSacId}>
            <SelectTrigger><SelectValue placeholder="Choisir un sac..." /></SelectTrigger>
            <SelectContent>
              {sacs.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.nom} — stock {Number(s.stock_actuel)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {sac && (
          <div className="rounded-md bg-muted/50 border p-3 text-xs space-y-1">
            <div className="font-medium text-foreground">Demi-sac cible</div>
            {existingDemi ? (
              <div>
                Existant : <span className="font-medium text-foreground">{existingDemi.nom}</span>
                {" "}— stock actuel {Number(existingDemi.stock_actuel)}
              </div>
            ) : (
              <div>
                Sera créé automatiquement : <span className="font-medium text-foreground">{sac.nom} DEMI</span>
                {" "}— prix vente <span className="font-medium text-foreground">{prixDemiPreview.toLocaleString("fr-FR")}</span>
                {" "}(prix sac ÷ 2 + 500)
              </div>
            )}
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Nombre de sacs à découper</Label>
          <Input type="number" min="1" step="1" value={qte} onChange={(e) => setQte(e.target.value)} />
          {insuffisant && <p className="text-xs text-destructive">Stock insuffisant</p>}
          {sac && qteNum > 0 && !insuffisant && (
            <p className="text-xs text-muted-foreground">
              Produira <span className="font-medium text-foreground">{qteNum * 2}</span> demi-sac(s)
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Notes (optionnel)</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button
          disabled={!sacId || qteNum <= 0 || !!insuffisant || m.isPending}
          onClick={() => m.mutate()}
        >
          {m.isPending ? "Conversion..." : "Valider la conversion"}
        </Button>
      </CardContent>
    </Card>
  );
}


function SacPerceForm({ sacs, demis, magasinId, onDone }: {
  sacs: Produit[]; demis: Produit[]; magasinId: string; onDone: () => void;
}) {
  const [sacId, setSacId] = useState("");
  const [demiId, setDemiId] = useState("");
  const [recup, setRecup] = useState("1");
  const [motif, setMotif] = useState("");
  const [notes, setNotes] = useState("");
  const recupNum = Number(recup);

  const m = useMutation({
    mutationFn: async () => {
      if (!sacId || !demiId) throw new Error("Sélectionnez les produits");
      if (motif.trim().length < 3) throw new Error("Motif requis (3 caractères min)");
      const { error } = await supabase.rpc("declare_sac_perce", {
        p_magasin_id: magasinId,
        p_produit_sac_id: sacId,
        p_produit_demi_id: demiId,
        p_quantite_demi_recuperable: recupNum,
        p_motif: motif,
        p_notes: notes || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sac percé déclaré");
      setSacId(""); setDemiId(""); setRecup("1"); setMotif(""); setNotes("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle>Déclarer un sac percé</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3 text-xs text-amber-900 dark:text-amber-200">
          Retire 1 sac du stock, ajoute les demi-sacs récupérables et enregistre la perte en rebut.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Produit Sac (perforé)</Label>
            <Select value={sacId} onValueChange={setSacId}>
              <SelectTrigger><SelectValue placeholder="Choisir un sac..." /></SelectTrigger>
              <SelectContent>
                {sacs.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nom} — stock {Number(s.stock_actuel)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Produit Demi-sac correspondant</Label>
            <Select value={demiId} onValueChange={setDemiId}>
              <SelectTrigger><SelectValue placeholder="Choisir un demi-sac..." /></SelectTrigger>
              <SelectContent>
                {demis.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Demi-sacs récupérables (0, 1 ou 2)</Label>
          <Select value={recup} onValueChange={setRecup}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0 — tout est perdu</SelectItem>
              <SelectItem value="1">1 — moitié récupérée</SelectItem>
              <SelectItem value="2">2 — tout récupéré</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Perte : <span className="font-medium text-destructive">{2 - recupNum}</span> demi-sac(s)
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Motif de la perte</Label>
          <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Sac déchiré au transport..." />
        </div>
        <div className="space-y-1.5">
          <Label>Notes (optionnel)</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button
          variant="destructive"
          disabled={!sacId || !demiId || motif.trim().length < 3 || m.isPending}
          onClick={() => m.mutate()}
        >
          <PackageOpen className="w-4 h-4 mr-1.5" />
          {m.isPending ? "Enregistrement..." : "Déclarer le sac percé"}
        </Button>
      </CardContent>
    </Card>
  );
}
