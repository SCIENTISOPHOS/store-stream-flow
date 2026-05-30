import { createFileRoute, Outlet, useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMagasinStore } from "@/lib/magasin-store";
import { ThemeSettings } from "@/components/theme-settings";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
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
  Trash2,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

const SIDEBAR_STORAGE_KEY = "stockflow-sidebar-collapsed";

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, isAdmin, signOut } = useAuth();
  const { magasinId, magasinNom, clear } = useMagasinStore();
  const isMobile = useIsMobile();
  const isAdminRoute = location.pathname.startsWith("/app/admin");
  const canAccessCurrentRoute = Boolean(magasinId) || (isAdmin && isAdminRoute);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
    }
  }, [collapsed]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    if (!canAccessCurrentRoute) { navigate({ to: "/select-magasin" }); return; }
    if (!isAdmin && location.pathname === "/app") {
      navigate({ to: "/app/caisse" });
    }
  }, [user, loading, canAccessCurrentRoute, navigate, isAdmin, location.pathname]);

  if (loading || !user || !canAccessCurrentRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const navItems = [
    ...(isAdmin ? [{ to: "/app", label: "Tableau de bord", icon: LayoutDashboard, exact: true }] : []),
    { to: "/app/caisse", label: "Caisse", icon: ShoppingCart },
    { to: "/app/ventes", label: "Ventes", icon: Receipt },
    { to: "/app/recouvrements", label: "Recouvrements", icon: HandCoins },
    { to: "/app/clients", label: "Clients", icon: Users },
    { to: "/app/produits", label: "Produits", icon: Boxes },
    { to: "/app/conversions", label: "Conversions", icon: Repeat },
    { to: "/app/rebuts", label: "Rebuts", icon: Trash2 },
  ];

  const adminItems = [
    { to: "/app/admin/magasins", label: "Magasins", icon: Store },
    { to: "/app/admin/utilisateurs", label: "Utilisateurs", icon: Shield },
    { to: "/app/admin/audit", label: "Journal d'audit", icon: FileClock },
  ];

  // On mobile: drawer is always full-width when open, hidden when closed
  // On desktop: respects collapsed state
  const showLabels = isMobile ? true : !collapsed;
  const desktopWidth = collapsed ? "4.25rem" : "16rem";

  const sidebarContent = (
    <>
      <div className="px-3 py-4 border-b flex items-center gap-2.5" style={{ borderColor: "var(--sidebar-border)" }}>
        <div className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
          <Package className="w-5 h-5 text-primary-foreground" />
        </div>
        {showLabels && (
          <div className="flex-1 overflow-hidden">
            <div className="font-bold tracking-tight truncate">Aicha Shop</div>
            <div className="text-[10px] uppercase tracking-wider opacity-60 truncate">Multi-magasins</div>
          </div>
        )}
        {isMobile ? (
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1 rounded hover:bg-[var(--sidebar-accent)] transition-colors"
            aria-label="Fermer le menu"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="p-1 rounded hover:bg-[var(--sidebar-accent)] transition-colors"
            aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
            title={collapsed ? "Déplier le menu" : "Replier le menu"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>

      {showLabels && (
        <div className="px-3 py-3 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
          <div className="rounded-md px-3 py-2.5" style={{ background: "var(--sidebar-accent)" }}>
            <div className="text-[10px] uppercase tracking-wider opacity-60 mb-0.5">Magasin de session</div>
            <div className="font-semibold text-sm truncate">{magasinNom ?? "Aucun magasin sélectionné"}</div>
            <button
              className="text-xs opacity-70 hover:opacity-100 mt-1 inline-flex items-center gap-1"
              onClick={() => { clear(); navigate({ to: "/select-magasin" }); }}
            >
              <Repeat className="w-3 h-3" /> Changer
            </button>
          </div>
        </div>
      )}

      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {navItems.map((it) => (
          <SideLink key={it.to} to={it.to} icon={it.icon} label={it.label} active={location.pathname === it.to} collapsed={!showLabels} />
        ))}

        {isAdmin && (
          <>
            {showLabels ? (
              <div className="px-3 pt-5 pb-2 text-[10px] uppercase tracking-wider opacity-50">
                Administration
              </div>
            ) : (
              <div className="h-3" />
            )}
            {adminItems.map((it) => (
              <SideLink key={it.to} to={it.to} icon={it.icon} label={it.label} active={location.pathname.startsWith(it.to)} collapsed={!showLabels} />
            ))}
          </>
        )}
      </nav>

      <div className="p-2 border-t space-y-1" style={{ borderColor: "var(--sidebar-border)" }}>
        {showLabels && <ThemeSettings />}
        <ChangePasswordDialog collapsed={!showLabels} />
        {showLabels && <div className="px-3 py-2 text-xs opacity-70 truncate">{user.email}</div>}
        <button
          onClick={() => { signOut(); navigate({ to: "/login" }); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm hover:bg-[var(--sidebar-accent)] transition-colors"
          style={{ justifyContent: showLabels ? "flex-start" : "center" }}
          title="Déconnexion"
        >
          <LogOut className="w-4 h-4 shrink-0" /> {showLabels && <span>Déconnexion</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      {!isMobile && (
        <aside
          className="shrink-0 flex flex-col transition-[width] duration-200 ease-in-out"
          style={{ width: desktopWidth, background: "var(--sidebar)", color: "var(--sidebar-foreground)" }}
        >
          {sidebarContent}
        </aside>
      )}

      {/* Mobile drawer */}
      {isMobile && mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 flex flex-col w-[16rem] shadow-xl"
            style={{ background: "var(--sidebar)", color: "var(--sidebar-foreground)" }}
          >
            {sidebarContent}
          </aside>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        {isMobile && (
          <header
            className="sticky top-0 z-30 flex items-center gap-3 px-3 py-2.5 border-b"
            style={{ background: "var(--sidebar)", color: "var(--sidebar-foreground)", borderColor: "var(--sidebar-border)" }}
          >
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded hover:bg-[var(--sidebar-accent)] transition-colors"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: "var(--gradient-primary)" }}>
              <Package className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate leading-tight">Aicha Shop</div>
              <div className="text-[10px] opacity-70 truncate">{magasinNom ?? "—"}</div>
            </div>
          </header>
        )}

        <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SideLink({
  to, icon: Icon, label, active, collapsed,
}: { to: string; icon: typeof Package; label: string; active: boolean; collapsed: boolean }) {
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors"
      style={{
        background: active ? "var(--sidebar-primary)" : "transparent",
        color: active ? "var(--sidebar-primary-foreground)" : "inherit",
        justifyContent: collapsed ? "center" : "flex-start",
      }}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
