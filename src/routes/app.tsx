import { createFileRoute, Outlet, useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMagasinStore } from "@/lib/magasin-store";
import { Button } from "@/components/ui/button";
import {
  Package,
  Store,
  LayoutDashboard,
  LogOut,
  Repeat,
  Shield,
  FileClock,
  Users,
  Boxes,
  ShoppingCart,
  Receipt,
  HandCoins,
} from "lucide-react";
import { Loader2 } from "lucide-react";



export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, isAdmin, signOut } = useAuth();
  const { magasinId, magasinNom, clear } = useMagasinStore();

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    if (!magasinId) { navigate({ to: "/select-magasin" }); return; }
  }, [user, loading, magasinId, navigate]);

  if (loading || !user || !magasinId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const navItems = [
    { to: "/app", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
    { to: "/app/caisse", label: "Caisse", icon: ShoppingCart },
    { to: "/app/ventes", label: "Ventes", icon: Receipt },
    { to: "/app/recouvrements", label: "Recouvrements", icon: HandCoins },
    { to: "/app/clients", label: "Clients", icon: Users },
    { to: "/app/produits", label: "Produits", icon: Boxes },
  ];


  const adminItems = [
    { to: "/app/admin/magasins", label: "Magasins", icon: Store },
    { to: "/app/admin/utilisateurs", label: "Utilisateurs", icon: Shield },
    { to: "/app/admin/audit", label: "Journal d'audit", icon: FileClock },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 flex flex-col" style={{ background: "var(--sidebar)", color: "var(--sidebar-foreground)" }}>
        <div className="px-6 py-5 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
              <Package className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-bold tracking-tight">StockFlow</div>
              <div className="text-[10px] uppercase tracking-wider opacity-60">Multi-magasins</div>
            </div>
          </div>
        </div>

        <div className="px-3 py-3 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="rounded-md px-3 py-2.5" style={{ background: "var(--sidebar-accent)" }}>
            <div className="text-[10px] uppercase tracking-wider opacity-60 mb-0.5">Magasin de session</div>
            <div className="font-semibold text-sm truncate">{magasinNom}</div>
            <button
              className="text-xs opacity-70 hover:opacity-100 mt-1 inline-flex items-center gap-1"
              onClick={() => { clear(); navigate({ to: "/select-magasin" }); }}
            >
              <Repeat className="w-3 h-3" /> Changer
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((it) => (
            <SideLink key={it.to} to={it.to} icon={it.icon} label={it.label} active={location.pathname === it.to} />
          ))}

          {isAdmin && (
            <>
              <div className="px-3 pt-5 pb-2 text-[10px] uppercase tracking-wider opacity-50">
                Administration
              </div>
              {adminItems.map((it) => (
                <SideLink key={it.to} to={it.to} icon={it.icon} label={it.label} active={location.pathname.startsWith(it.to)} />
              ))}
            </>
          )}
        </nav>

        <div className="p-3 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="px-3 py-2 text-xs opacity-70 truncate">{user.email}</div>
          <button
            onClick={() => { signOut(); navigate({ to: "/login" }); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-[var(--sidebar-accent)] transition-colors"
          >
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

function SideLink({ to, icon: Icon, label, active }: { to: string; icon: typeof Package; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors"
      style={{
        background: active ? "var(--sidebar-primary)" : "transparent",
        color: active ? "var(--sidebar-primary-foreground)" : "inherit",
      }}
    >
      <Icon className="w-4 h-4" /> {label}
    </Link>
  );
}
