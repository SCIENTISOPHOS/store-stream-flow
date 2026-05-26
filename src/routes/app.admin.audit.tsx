import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileClock, Lock, Download } from "lucide-react";
import jsPDF from "jspdf";

export const Route = createFileRoute("/app/admin/audit")({
  component: AuditPage,
});

type ActionType = "ALL" | "INSERT" | "UPDATE" | "DELETE";

function AuditPage() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();
  const [actionFilter, setActionFilter] = useState<ActionType>("ALL");
  const [tableFilter, setTableFilter] = useState<string>("ALL");

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
      return data;
    },
  });

  const tableOptions = useMemo(() => {
    const s = new Set<string>();
    (logs ?? []).forEach((l) => l.table_name && s.add(l.table_name));
    return Array.from(s).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    return (logs ?? []).filter((l) => {
      if (actionFilter !== "ALL" && l.action !== actionFilter) return false;
      if (tableFilter !== "ALL" && l.table_name !== tableFilter) return false;
      return true;
    });
  }, [logs, actionFilter, tableFilter]);

  const actionVariant = (a: string) =>
    a === "INSERT" ? "default" : a === "DELETE" ? "destructive" : "secondary";

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const margin = 32;
    let y = margin;

    doc.setFontSize(16);
    doc.text("Journal d'audit", margin, y);
    y += 18;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(
      `Exporté le ${new Date().toLocaleString("fr-FR")} — ${filtered.length} entrée(s)` +
        ` — Action: ${actionFilter} — Table: ${tableFilter}`,
      margin,
      y
    );
    y += 18;

    doc.setTextColor(0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const cols = [
      { label: "Date", x: margin, w: 130 },
      { label: "Action", x: margin + 130, w: 60 },
      { label: "Table", x: margin + 190, w: 130 },
      { label: "Utilisateur", x: margin + 320, w: 200 },
      { label: "Record", x: margin + 520, w: 240 },
    ];
    cols.forEach((c) => doc.text(c.label, c.x, y));
    y += 4;
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + 760, y);
    y += 12;
    doc.setFont("helvetica", "normal");

    const pageHeight = doc.internal.pageSize.getHeight();
    filtered.forEach((l) => {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      const row = [
        new Date(l.created_at).toLocaleString("fr-FR"),
        l.action,
        l.table_name,
        l.user_email ?? "système",
        l.record_id ?? "",
      ];
      row.forEach((txt, i) => {
        const c = cols[i];
        const t = doc.splitTextToSize(String(txt), c.w - 4)[0] ?? "";
        doc.text(t, c.x, y);
      });
      y += 14;
    });

    doc.save(`audit-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileClock className="w-7 h-7" /> Journal d'audit
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Lecture seule — inviolable (RG-AUD-03)
          </p>
        </div>
        <Button onClick={exportPdf} disabled={filtered.length === 0}>
          <Download className="w-4 h-4 mr-2" /> Exporter en PDF
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Type d'action</label>
            <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as ActionType)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes</SelectItem>
                <SelectItem value="INSERT">Création (INSERT)</SelectItem>
                <SelectItem value="UPDATE">Modification (UPDATE)</SelectItem>
                <SelectItem value="DELETE">Suppression (DELETE)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Table</label>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes les tables</SelectItem>
                {tableOptions.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            {filtered.length} / {logs?.length ?? 0} entrée(s)
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Opérations</CardTitle>
          <CardDescription>Toutes les actions sensibles sont enregistrées en temps réel</CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucune entrée correspondante.</p>
          ) : (
            <div className="space-y-1 font-mono text-xs">
              {filtered.map((l) => (
                <div key={l.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                  <span className="text-muted-foreground shrink-0 w-40">
                    {new Date(l.created_at).toLocaleString("fr-FR")}
                  </span>
                  <Badge variant={actionVariant(l.action)} className="shrink-0 w-16 justify-center text-[10px]">
                    {l.action}
                  </Badge>
                  <span className="shrink-0 w-32 truncate text-foreground">{l.table_name}</span>
                  <span className="shrink-0 w-48 truncate text-muted-foreground">
                    {l.user_email ?? "système"}
                  </span>
                  <span className="text-muted-foreground truncate flex-1">
                    {l.record_id ? `id:${l.record_id.slice(0, 16)}…` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
