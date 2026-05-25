import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileClock, Lock } from "lucide-react";

export const Route = createFileRoute("/app/admin/audit")({
  component: AuditPage,
});

function AuditPage() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();

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
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const actionVariant = (a: string) =>
    a === "INSERT" ? "default" : a === "DELETE" ? "destructive" : "secondary";

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <FileClock className="w-7 h-7" /> Journal d'audit
        </h1>
        <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> Lecture seule — inviolable (RG-AUD-03)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>200 dernières opérations</CardTitle>
          <CardDescription>Toutes les actions sensibles sont enregistrées en temps réel</CardDescription>
        </CardHeader>
        <CardContent>
          {!logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucune entrée pour l'instant.</p>
          ) : (
            <div className="space-y-1 font-mono text-xs">
              {logs.map((l) => (
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
                    {l.record_id ? `id:${l.record_id.slice(0, 8)}…` : ""}
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
