import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MagasinState {
  magasinId: string | null;
  magasinNom: string | null;
  setMagasin: (id: string, nom: string) => void;
  clear: () => void;
}

export const useMagasinStore = create<MagasinState>()(
  persist(
    (set) => ({
      magasinId: null,
      magasinNom: null,
      setMagasin: (id, nom) => set({ magasinId: id, magasinNom: nom }),
      clear: () => set({ magasinId: null, magasinNom: null }),
    }),
    { name: "stockflow-magasin" }
  )
);
