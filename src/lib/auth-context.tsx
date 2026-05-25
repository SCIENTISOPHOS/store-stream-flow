import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

type Role = "admin" | "user" | null;

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // Defer to avoid deadlock
        setTimeout(() => {
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", sess.user.id)
            .order("role")
            .then(({ data }) => {
              const roles = data?.map((r) => r.role) ?? [];
              setRole(roles.includes("admin") ? "admin" : roles.includes("user") ? "user" : null);
            });
        }, 0);
      } else {
        setRole(null);
      }
      qc.invalidateQueries();
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", sess.user.id)
          .then(({ data }) => {
            const roles = data?.map((r) => r.role) ?? [];
            setRole(roles.includes("admin") ? "admin" : roles.includes("user") ? "user" : null);
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [qc]);

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("stockflow-magasin");
  };

  return (
    <Ctx.Provider value={{ user, session, role, isAdmin: role === "admin", loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
