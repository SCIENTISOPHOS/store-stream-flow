import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Mode = "light" | "dark";

interface ThemeCtx {
  mode: Mode;
  hue: number; // 0-360
  setMode: (m: Mode) => void;
  setHue: (h: number) => void;
  toggleMode: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const LS_MODE = "stockflow-theme-mode";
const LS_HUE = "stockflow-theme-hue";

function applyTheme(mode: Mode, hue: number) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  // Override accent CSS vars to follow chosen hue
  const isDark = mode === "dark";
  root.style.setProperty("--primary", `oklch(${isDark ? 0.65 : 0.45} 0.14 ${hue})`);
  root.style.setProperty("--primary-glow", `oklch(${isDark ? 0.78 : 0.6} 0.13 ${hue})`);
  root.style.setProperty("--ring", `oklch(${isDark ? 0.65 : 0.5} 0.14 ${hue})`);
  root.style.setProperty("--sidebar-primary", `oklch(${isDark ? 0.6 : 0.55} 0.14 ${hue})`);
  root.style.setProperty(
    "--sidebar",
    isDark ? `oklch(0.18 0.04 ${hue})` : `oklch(0.22 0.06 ${hue})`
  );
  root.style.setProperty(
    "--sidebar-accent",
    isDark ? `oklch(0.25 0.05 ${hue})` : `oklch(0.3 0.07 ${hue})`
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>("light");
  const [hue, setHueState] = useState<number>(250);

  useEffect(() => {
    const m = (localStorage.getItem(LS_MODE) as Mode | null) ?? "light";
    const h = Number(localStorage.getItem(LS_HUE) ?? 250);
    setModeState(m);
    setHueState(Number.isFinite(h) ? h : 250);
    applyTheme(m, Number.isFinite(h) ? h : 250);
  }, []);

  const setMode = (m: Mode) => {
    setModeState(m);
    localStorage.setItem(LS_MODE, m);
    applyTheme(m, hue);
  };
  const setHue = (h: number) => {
    setHueState(h);
    localStorage.setItem(LS_HUE, String(h));
    applyTheme(mode, h);
  };
  const toggleMode = () => setMode(mode === "dark" ? "light" : "dark");

  return (
    <Ctx.Provider value={{ mode, hue, setMode, setHue, toggleMode }}>{children}</Ctx.Provider>
  );
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used inside ThemeProvider");
  return c;
}
