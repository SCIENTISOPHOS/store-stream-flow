import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useMagasinStore } from "@/lib/magasin-store";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Shield, User as UserIcon, Store, Package, Users, Wallet, TrendingUp, AlertTriangle, ShoppingCart,
  Download, Palette,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

const fmtFC = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " FC";
const fmtNum = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);

type Periode = 7 | 30 | 90;

const PRESET_COLORS = [
  { name: "Indigo", value: "#4f46e5" },
  { name: "Émeraude", value: "#10b981" },
  { name: "Ambre", value: "#f59e0b" },
  { name: "Rose", value: "#ec4899" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Rouge", value: "#ef4444" },
  { name: "Slate", value: "#475569" },
];

function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { magasinId, magasinNom } = useMagasinStore();

  const [periode, setPeriode] = useState<Periode>(() => {
    const v = Number(localStorage.getItem("dash-periode"));
    return (v === 7 || v === 90 ? v : 30) as Periode;
  });
  useEffect(() => { localStorage.setItem("dash-periode", String(periode)); }, [periode]);

  const [accent, setAccent] = useState<string>(() => localStorage.getItem("dash-accent") || "#4f46e5");
  useEffect(() => { localStorage.setItem("dash-accent", accent); }, [accent]);

  const accentSoft = useMemo(() => accent + "33", [accent]); // ~20% alpha

  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  // Produits du magasin
  const { data: produits } = useQuery({
    queryKey: ["dash-produits", magasinId],
    enabled: !!magasinId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produits")
        .select("id, nom, type_emballage, stock_actuel, stock_seuil_alerte, prix_vente_unitaire, statut, fournisseur_id, fournisseurs(nom)")
        .eq("magasin_id", magasinId!)
        .eq("statut", "actif");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Ventes filtrées par période
  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - (periode - 1));
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [periode]);

  const { data: ventes } = useQuery({
    queryKey: ["dash-ventes", magasinId, since],
    enabled: !!magasinId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ventes")
        .select("id, date_vente, montant_total, mode_paiement, statut")
        .eq("magasin_id", magasinId!)
        .eq("statut", "validee")
        .gte("date_vente", since)
        .order("date_vente", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clientsAgg } = useQuery({
    queryKey: ["dash-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, dette_totale, is_passager_systeme, statut");
      if (error) throw error;
      return data ?? [];
    },
  });

  const stockTotal = (produits ?? []).reduce((s, p) => s + Number(p.stock_actuel), 0);
  const stockValeur = (produits ?? []).reduce(
    (s, p) => s + Number(p.stock_actuel) * Number(p.prix_vente_unitaire), 0
  );
  const alertes = (produits ?? []).filter(
    (p) => Number(p.stock_actuel) <= Number(p.stock_seuil_alerte)
  ).length;
  const nbClients = (clientsAgg ?? []).filter((c) => !c.is_passager_systeme).length;
  const detteTotale = (clientsAgg ?? []).reduce((s, c) => s + Number(c.dette_totale), 0);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const caJour = (ventes ?? []).filter((v) => new Date(v.date_vente) >= today)
    .reduce((s, v) => s + Number(v.montant_total), 0);
  const caPeriode = (ventes ?? []).reduce((s, v) => s + Number(v.montant_total), 0);

  // Série journalière
  const serieJours = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = periode - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const k = d.toISOString().slice(0, 10);
      map.set(k, 0);
    }
    (ventes ?? []).forEach((v) => {
      const k = new Date(v.date_vente).toISOString().slice(0, 10);
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + Number(v.montant_total));
    });
    return Array.from(map.entries()).map(([k, v]) => ({
      jour: k.slice(5),
      ca: v,
    }));
  }, [ventes, periode]);

  const modes = useMemo(() => {
    const acc: Record<string, number> = { comptant: 0, credit: 0, mixte: 0 };
    (ventes ?? []).forEach((v) => {
      acc[v.mode_paiement] = (acc[v.mode_paiement] ?? 0) + Number(v.montant_total);
    });
    return [
      { name: "Comptant", value: acc.comptant, key: "comptant" },
      { name: "Crédit", value: acc.credit, key: "credit" },
      { name: "Mixte", value: acc.mixte, key: "mixte" },
    ].filter((x) => x.value > 0);
  }, [ventes]);

  const topProduits = useMemo(() => {
    return [...(produits ?? [])]
      .map((p) => ({
        nom: p.nom.length > 16 ? p.nom.slice(0, 16) + "…" : p.nom,
        valeur: Number(p.stock_actuel) * Number(p.prix_vente_unitaire),
        stock: Number(p.stock_actuel),
      }))
      .sort((a, b) => b.valeur - a.valeur)
      .slice(0, 8);
  }, [produits]);

  // Palette dérivée de l'accent
  const pieColors = [accent, "#f59e0b", "#94a3b8"];

  const exportPdf = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW - 20;
      const imgH = (canvas.height * imgW) / canvas.width;
      let heightLeft = imgH;
      let position = 10;
      pdf.addImage(img, "PNG", 10, position, imgW, imgH);
      heightLeft -= pageH - 20;
      while (heightLeft > 0) {
        pdf.addPage();
        position = 10 - (imgH - heightLeft);
        pdf.addImage(img, "PNG", 10, position, imgW, imgH);
        heightLeft -= pageH - 20;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      pdf.save(`tableau-de-bord-${magasinNom?.replace(/\s+/g, "-") ?? "magasin"}-${stamp}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="p-4 md:p-8 max-w-7xl space-y-6"
      style={{ ["--dash-accent" as any]: accent, ["--dash-accent-soft" as any]: accentSoft }}
    >
      {/* Header + controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="text-muted-foreground mt-1">
            Bienvenue, vous travaillez actuellement sur{" "}
            <span className="font-semibold text-foreground">{magasinNom}</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={String(periode)}
            onValueChange={(v) => v && setPeriode(Number(v) as Periode)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="7">7 j</ToggleGroupItem>
            <ToggleGroupItem value="30">30 j</ToggleGroupItem>
            <ToggleGroupItem value="90">90 j</ToggleGroupItem>
          </ToggleGroup>

          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2">
                <span
                  className="inline-block w-3.5 h-3.5 rounded-full border"
                  style={{ background: accent }}
                />
                <Palette className="w-4 h-4" />
                Couleur
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <p className="text-xs font-medium mb-2 text-muted-foreground">Couleur d'accentuation</p>
              <div className="grid grid-cols-4 gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setAccent(c.value)}
                    className="h-9 rounded-md border transition-transform hover:scale-105 relative"
                    style={{ background: c.value, outline: accent === c.value ? "2px solid hsl(var(--ring))" : "none", outlineOffset: 2 }}
                    title={c.name}
                  />
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Label htmlFor="custom-color" className="text-xs">Personnalisée</Label>
                <input
                  id="custom-color"
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-8 w-12 rounded border cursor-pointer"
                />
                <span className="text-xs font-mono text-muted-foreground">{accent}</span>
              </div>
            </PopoverContent>
          </Popover>

          <Button size="sm" onClick={exportPdf} disabled={exporting} className="gap-2">
            <Download className="w-4 h-4" />
            {exporting ? "Export…" : "Exporter PDF"}
          </Button>
        </div>
      </div>

      <div ref={reportRef} className="space-y-6 bg-background">
        {/* Identité contextuelle */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card style={{ borderLeft: `3px solid ${accent}` }}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>Magasin actif</CardDescription>
                <Store className="w-4 h-4" style={{ color: accent }} />
              </div>
              <CardTitle className="text-xl">{magasinNom}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>Utilisateur</CardDescription>
                <UserIcon className="w-4 h-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-base font-medium truncate">{user?.email}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>Rôle</CardDescription>
                <Shield className="w-4 h-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-base">
                <Badge variant={isAdmin ? "default" : "secondary"}>
                  {isAdmin ? "Administrateur" : "Utilisateur"}
                </Badge>
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* KPIs cliquables */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <KpiLink to="/app/ventes" search={{ periode }} icon={<TrendingUp className="w-4 h-4" />} label="CA du jour" value={fmtFC(caJour)} accent={accent} />
          <KpiLink to="/app/ventes" search={{ periode }} icon={<TrendingUp className="w-4 h-4" />} label={`CA ${periode} j`} value={fmtFC(caPeriode)} accent={accent} />
          <KpiLink to="/app/produits" icon={<Package className="w-4 h-4" />} label="Valeur stock" value={fmtFC(stockValeur)} accent={accent} />
          <KpiLink to="/app/produits" icon={<Package className="w-4 h-4" />} label="Unités en stock" value={fmtNum(stockTotal)} accent={accent} />
          <KpiLink to="/app/clients" icon={<Users className="w-4 h-4" />} label="Clients" value={fmtNum(nbClients)} accent={accent} />
          <KpiLink to="/app/recouvrements" search={{ periode }} icon={<Wallet className="w-4 h-4" />} label="Dette totale" value={fmtFC(detteTotale)} accent={accent} />
        </div>

        {/* Alertes de stock */}
        {alertes > 0 ? (
          <Card className="border-destructive/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <CardTitle className="text-base text-destructive">
                  {alertes} produit(s) en alerte de stock
                </CardTitle>
              </div>
              <CardDescription>Stock actuel inférieur ou égal au seuil d&apos;alerte</CardDescription>
            </CardHeader>
            <CardContent>
              <AlertesWidget produits={produits ?? []} magasinId={magasinId!} />
            </CardContent>
          </Card>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-green-600/20 bg-green-600/5 px-3 py-2 text-sm">
            <Package className="w-4 h-4 text-green-600" />
            <span className="text-green-700">Aucun produit sous le seuil d&apos;alerte.</span>
          </div>
        )}

        {/* Charts */}
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Chiffre d'affaires — {periode} derniers jours</CardTitle>
              <CardDescription>Ventes validées du magasin</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serieJours} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="caGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={accent} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="jour" tick={{ fontSize: 11 }} interval={periode > 30 ? 6 : "preserveStartEnd"} />
                    <YAxis tick={{ fontSize: 11 }} width={56} />
                    <Tooltip
                      formatter={(v: number) => fmtFC(v)}
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="ca" stroke={accent} fill="url(#caGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Modes de paiement</CardTitle>
              <CardDescription>{periode} derniers jours</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[260px]">
                {modes.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    Aucune vente sur la période
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={modes} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                        {modes.map((_, i) => (
                          <Cell key={i} fill={pieColors[i % pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => fmtFC(v)}
                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top produits par valeur de stock</CardTitle>
            <CardDescription>Stock × prix de vente unitaire</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {topProduits.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Aucun produit en stock
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProduits} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="nom" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} width={70} />
                    <Tooltip
                      formatter={(v: number, key) => key === "valeur" ? fmtFC(v) : fmtNum(v)}
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                    />
                    <Bar dataKey="valeur" fill={accent} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiLink({
  to, search, icon, label, value, accent,
}: {
  to: string;
  search?: Record<string, unknown>;
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <Link to={to} search={search as any} className="block group">
      <Card
        className="transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer h-full"
        style={{ borderTop: `3px solid ${accent}` }}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between" style={{ color: accent }}>
            <CardDescription className="group-hover:text-foreground transition-colors">{label}</CardDescription>
            {icon}
          </div>
          <CardTitle className="text-lg tabular-nums">{value}</CardTitle>
        </CardHeader>
      </Card>
    </Link>
  );
}

function AlertesWidget({ produits, magasinId }: { produits: any[]; magasinId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [qte, setQte] = useState("1");

  const produitsAlerte = produits
    .filter((p) => Number(p.stock_actuel) <= Number(p.stock_seuil_alerte))
    .sort((a, b) => Number(a.stock_actuel) - Number(b.stock_actuel));

  const creerCommande = useMutation({
    mutationFn: async () => {
      if (!selected?.fournisseur_id) throw new Error("Aucun fournisseur défini");
      const { error } = await supabase.from("commandes_fournisseur").insert({
        fournisseur_id: selected.fournisseur_id,
        magasin_id: magasinId,
        produit_id: selected.id,
        quantite_demandee: Number(qte),
        statut: "brouillon",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dash-produits", magasinId] });
      setOpen(false);
      setSelected(null);
    },
  });

  const openCommande = (p: any) => {
    setSelected(p);
    const sugg = Math.max(1, Math.ceil(Number(p.stock_seuil_alerte) * 2 - Number(p.stock_actuel)));
    setQte(String(sugg));
    setOpen(true);
  };

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produit</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Seuil</TableHead>
              <TableHead>Fournisseur</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {produitsAlerte.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nom}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">{p.type_emballage}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums text-destructive font-medium">
                  {fmtNum(Number(p.stock_actuel))}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {fmtNum(Number(p.stock_seuil_alerte))}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.fournisseurs?.nom ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!p.fournisseur_id}
                    onClick={() => openCommande(p)}
                  >
                    <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                    Commander
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle commande fournisseur</DialogTitle>
            <DialogDescription>
              Produit : <span className="font-semibold text-foreground">{selected?.nom}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fournisseur</Label>
                <p className="text-sm text-muted-foreground mt-1">{selected?.fournisseurs?.nom ?? "—"}</p>
              </div>
              <div>
                <Label>Stock actuel</Label>
                <p className="text-sm text-destructive font-medium mt-1">{fmtNum(Number(selected?.stock_actuel ?? 0))}</p>
              </div>
            </div>
            <div>
              <Label htmlFor="qte">Quantité à commander</Label>
              <Input
                id="qte"
                type="number"
                min={1}
                value={qte}
                onChange={(e) => setQte(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button
              onClick={() => creerCommande.mutate()}
              disabled={creerCommande.isPending}
            >
              {creerCommande.isPending ? "Création…" : "Créer commande"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
