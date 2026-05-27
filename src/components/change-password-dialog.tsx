import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";

export function ChangePasswordDialog({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (pw.length < 8) { toast.error("Au moins 8 caractères"); return; }
    if (pw !== pw2) { toast.error("Les mots de passe ne correspondent pas"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success("Mot de passe modifié");
      setOpen(false); setPw(""); setPw2("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm hover:bg-[var(--sidebar-accent)] transition-colors"
          title="Modifier mon mot de passe"
        >
          <KeyRound className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Mot de passe</span>}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier mon mot de passe</DialogTitle>
          <DialogDescription>Au moins 8 caractères.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="np">Nouveau mot de passe</Label>
            <Input id="np" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="np2">Confirmer</Label>
            <Input id="np2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Mettre à jour
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
