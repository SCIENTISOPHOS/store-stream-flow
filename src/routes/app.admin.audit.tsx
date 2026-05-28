import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileClock, Lock, Download, Plus, Pencil, Trash2, User as UserIcon, Calendar } from "lucide-react";
import jsPDF from "jspdf";

export const Route = createFileRoute("/app/admin/audit")({
  component: AuditPage,
});

type ActionFilter = "ALL" | "INSERT" | "UPDATE" | "DELETE";
type CategoryFilter = "ALL" | "ventes" | "recouvrements" | "clients" | "produits" | "rebuts" | "conversions_emballage" | "magasins" | "user_roles" | "user_magasins";

interface AuditRow {
  id: string;
  created_at: string;
  user_email: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  magasin_id: string | null;
}

const TABLE_LABELS: Record<string, string> = {
  ventes: "Vente",
  vente_lignes: "Ligne de vente",
  recouvrements: "Recouvrement",
  recouvrement_allocations: "Imputation recouvrement",
  clients: "Client",
  produits: "Produit",
  rebuts: "Rebut",
  conversions_emballage: "Conversion d'emballage",
  magasins: "Magasin",
  user_roles: "Rôle utilisateur",
  user_magasins: "Affectation magasin",
  profiles: "Profil",
};

const ACTION_LABELS: Record<string, { label: string; verb: string }> = {
  INSERT: { label: "Création", verb: "a créé" },
  UPDATE: { label: "Modification", verb: "a modifié" },
  DELETE: { label: "Suppression", verb: "a supprimé" },
};

function describe(row: AuditRow): string {
  const action = ACTION_LABELS[row.action]?.verb ?? row.action.toLowerCase();
  const entity = TABLE_LABELS[row.table_name] ?? row.table_name;
  const who = row.user_email ?? "Système";
  const data = (row.after_data ?? row.before_data ?? {}) as Record<string, unknown>;

  // Try to extract a human-friendly identifier
  let label = "";
  if (row.table_name === "ventes") {
    const numero = data.numero ?? "";
    const total = data.montant_total ?? "";
    label = `vente #${numero}${total ? ` (${total} F)` : ""}`;
  } else if (row.table_name === "recouvrements") {
    const numero = data.numero ?? "";
    const montant = data.montant ?? "";
    const type = data.type ?? "paiement";
    label = `${type === "reduction" ? "réduction de dette" : "recouvrement"} #${numero}${montant ? ` (${montant} F)` : ""}`;
  } else if (row.table_name === "clients") {
    label = `le client « ${data.nom ?? "?"} »`;
  } else if (row.table_name === "produits") {
    label = `le produit « ${data.nom ?? "?"} »${data.reference ? ` (${data.reference})` : ""}`;
  } else if (row.table_name === "magasins") {
    label = `le magasin « ${data.nom ?? "?"} »`;
  } else if (row.table_name === "rebuts") {
    label = `un rebut de ${data.quantite ?? "?"}`;
  } else if (row.table_name === "conversions_emballage") {
    label = `une conversion d'emballage`;
  } else if (row.table_name === "user_roles") {
    label = `le rôle « ${data.role ?? "?"} »`;
  } else if (row.table_name === "user_magasins") {
    label = `une affectation utilisateur ↔ magasin`;
  } else {
    label = entity.toLowerCase();
  }

  // Highlight cancellations on ventes/recouvrements
  if (row.action === "UPDATE" && row.before_data && row.after_data) {
    const before = row.before_data as Record<string, unknown>;
    const after = row.after_data as Record<string, unknown>;
    if (before.statut !== after.statut && after.statut === "annulee") {
      return `${who} a annulé ${label}${after.motif_annulation ? ` — motif : ${after.motif_annulation}` : ""}`;
    }
  }

  return `${who} ${action} ${label}`;
}

function changedFields(row: AuditRow): { key: string; before: unknown; after: unknown }[] {
  if (row.action !== "UPDATE" || !row.before_data || !row.after_data) return [];
  const b = row.before_data as Record<string, unknown>;
  const a = row.after_data as Record<string, unknown>;
  const skip = new Set(["updated_at", "created_at"]);
  const out: { key: string; before: unknown; after: unknown }[] = [];
  for (const k of Object.keys(a)) {
    if (skip.has(k)) continue;
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
      out.push({ key: k, before: b[k], after: a[k] });
    }
  }
  return out.slice(0, 6);
}

function ActionIcon({ action }: { action: string }) {
  if (action === "INSERT") return <Plus className="w-4 h-4 text-emerald-600" />;
  if (action === "DELETE") return <Trash2 className="w-4 h-4 text-destructive" />;
  return <Pencil className="w-4 h-4 text-amber-600" />;
}

function AuditPage() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();
  const [actionFilter, setActionFilter] = useState<ActionFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/app" });
  }, [isAdmin, loading, navigate]);

  const { data: logs } = useQuery({
    queryKey: ["audit-log"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as AuditRow[];
    },
  });

  const filtered = useMemo(() => {
    return (logs ?? []).filter((l) => {
      if (actionFilter !== "ALL" && l.action !== actionFilter) return false;
      if (categoryFilter !== "ALL" && l.table_name !== categoryFilter) return false;
      return true;
    });
  }, [logs, actionFilter, categoryFilter]);

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const margin = 36;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = margin;

    doc.setFontSize(16);
    doc.text("Journal d'audit", margin, y);
    y += 18;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(
      `Exporté le ${new Date().toLocaleString("fr-FR")} — ${filtered.length} entrée(s) — Type: ${actionFilter} — Catégorie: ${categoryFilter}`,
      margin, y
    );
    y += 16;
    doc.setTextColor(0);

    filtered.forEach((l) => {
      if (y > pageHeight - margin - 30) { doc.addPage(); y = margin; }
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(new Date(l.created_at).toLocaleString("fr-FR"), margin, y);
      y += 11;
      doc.setFontSize(10);
      doc.setTextColor(0);
      const text = doc.splitTextToSize(describe(l), pageWidth - margin * 2);
      text.forEach((line: string) => {
        if (y > pageHeight - margin) { doc.addPage(); y = margin; }
        doc.text(line, margin, y); y += 12;
      });
      y += 6;
    });

    doc.save(`journal-audit-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const fmtVal = (v: unknown): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
    return String(v).slice(0, 80);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileClock className="w-7 h-7" /> Journal d'audit
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
            <Lock className="w-3.5 h-3.5" /> Qui a fait quoi, et quand. Lecture seule, inviolable.
          </p>
        </div>
        <Button onClick={exportPdf} disabled={filtered.length === 0}>
          <Download className="w-4 h-4 mr-2" /> Exporter en PDF
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Type d'événement</label>
            <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as ActionFilter)}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les événements</SelectItem>
                <SelectItem value="INSERT">Créations</SelectItem>
                <SelectItem value="UPDATE">Modifications</SelectItem>
                <SelectItem value="DELETE">Suppressions</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Catégorie</label>
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes les catégories</SelectItem>
                <SelectItem value="ventes">Ventes</SelectItem>
                <SelectItem value="recouvrements">Recouvrements</SelectItem>
                <SelectItem value="clients">Clients</SelectItem>
                <SelectItem value="produits">Produits</SelectItem>
                <SelectItem value="rebuts">Rebuts</SelectItem>
                <SelectItem value="conversions_emballage">Conversions</SelectItem>
                <SelectItem value="magasins">Magasins</SelectItem>
                <SelectItem value="user_roles">Rôles utilisateurs</SelectItem>
                <SelectItem value="user_magasins">Affectations magasins</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            {filtered.length} / {logs?.length ?? 0} événement(s)
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historique des actions</CardTitle>
          <CardDescription>Toutes les opérations sensibles sont enregistrées automatiquement.</CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucun événement.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((l) => {
                const changes = changedFields(l);
                return (
                  <div key={l.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5"><ActionIcon action={l.action} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-relaxed">{describe(l)}</p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(l.created_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}
                          </span>
                          <span className="flex items-center gap-1">
                            <UserIcon className="w-3 h-3" />
                            {l.user_email ?? "Système"}
                          </span>
                          <Badge variant="outline" className="text-[10px] h-5">
                            {TABLE_LABELS[l.table_name] ?? l.table_name}
                          </Badge>
                        </div>
                        {changes.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-dashed space-y-1">
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Modifications</p>
                            {changes.map((c) => (
                              <div key={c.key} className="text-xs flex flex-wrap items-baseline gap-2">
                                <span className="font-medium text-foreground">{c.key}:</span>
                                <span className="text-muted-foreground line-through">{fmtVal(c.before)}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="text-foreground">{fmtVal(c.after)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
