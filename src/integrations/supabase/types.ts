export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          details: string | null
          id: string
          magasin_id: string | null
          record_id: string | null
          table_name: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          details?: string | null
          id?: string
          magasin_id?: string | null
          record_id?: string | null
          table_name: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          details?: string | null
          id?: string
          magasin_id?: string | null
          record_id?: string | null
          table_name?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          allow_cross_magasin: boolean
          budget_max: number
          created_at: string
          created_by: string | null
          dette_totale: number
          id: string
          is_passager_systeme: boolean
          magasin_id: string | null
          nom: string
          notes: string | null
          statut: Database["public"]["Enums"]["entity_statut"]
          telephone: string | null
          type: Database["public"]["Enums"]["client_type"]
          updated_at: string
          ville: string | null
        }
        Insert: {
          allow_cross_magasin?: boolean
          budget_max?: number
          created_at?: string
          created_by?: string | null
          dette_totale?: number
          id?: string
          is_passager_systeme?: boolean
          magasin_id?: string | null
          nom: string
          notes?: string | null
          statut?: Database["public"]["Enums"]["entity_statut"]
          telephone?: string | null
          type?: Database["public"]["Enums"]["client_type"]
          updated_at?: string
          ville?: string | null
        }
        Update: {
          allow_cross_magasin?: boolean
          budget_max?: number
          created_at?: string
          created_by?: string | null
          dette_totale?: number
          id?: string
          is_passager_systeme?: boolean
          magasin_id?: string | null
          nom?: string
          notes?: string | null
          statut?: Database["public"]["Enums"]["entity_statut"]
          telephone?: string | null
          type?: Database["public"]["Enums"]["client_type"]
          updated_at?: string
          ville?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_magasin_id_fkey"
            columns: ["magasin_id"]
            isOneToOne: false
            referencedRelation: "magasins"
            referencedColumns: ["id"]
          },
        ]
      }
      commandes_fournisseur: {
        Row: {
          created_at: string
          created_by: string | null
          fournisseur_id: string
          id: string
          magasin_id: string
          notes: string | null
          produit_id: string
          quantite_demandee: number
          statut: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fournisseur_id: string
          id?: string
          magasin_id: string
          notes?: string | null
          produit_id: string
          quantite_demandee?: number
          statut?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fournisseur_id?: string
          id?: string
          magasin_id?: string
          notes?: string | null
          produit_id?: string
          quantite_demandee?: number
          statut?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commandes_fournisseur_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_fournisseur_magasin_id_fkey"
            columns: ["magasin_id"]
            isOneToOne: false
            referencedRelation: "magasins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_fournisseur_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      conversions_emballage: {
        Row: {
          created_at: string
          cree_par: string
          id: string
          magasin_id: string
          notes: string | null
          produit_demi_id: string
          produit_sac_id: string
          quantite_demi_produite: number
          quantite_perdue: number
          quantite_sacs: number
          rebut_id: string | null
          type_conversion: Database["public"]["Enums"]["type_conversion"]
        }
        Insert: {
          created_at?: string
          cree_par: string
          id?: string
          magasin_id: string
          notes?: string | null
          produit_demi_id: string
          produit_sac_id: string
          quantite_demi_produite: number
          quantite_perdue?: number
          quantite_sacs: number
          rebut_id?: string | null
          type_conversion: Database["public"]["Enums"]["type_conversion"]
        }
        Update: {
          created_at?: string
          cree_par?: string
          id?: string
          magasin_id?: string
          notes?: string | null
          produit_demi_id?: string
          produit_sac_id?: string
          quantite_demi_produite?: number
          quantite_perdue?: number
          quantite_sacs?: number
          rebut_id?: string | null
          type_conversion?: Database["public"]["Enums"]["type_conversion"]
        }
        Relationships: []
      }
      fournisseurs: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nom: string
          notes: string | null
          telephone: string | null
          updated_at: string
          ville: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nom: string
          notes?: string | null
          telephone?: string | null
          updated_at?: string
          ville?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nom?: string
          notes?: string | null
          telephone?: string | null
          updated_at?: string
          ville?: string | null
        }
        Relationships: []
      }
      magasins: {
        Row: {
          actif: boolean
          adresse: string | null
          created_at: string
          id: string
          nom: string
          telephone: string | null
          updated_at: string
          ville: string | null
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          created_at?: string
          id?: string
          nom: string
          telephone?: string | null
          updated_at?: string
          ville?: string | null
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          created_at?: string
          id?: string
          nom?: string
          telephone?: string | null
          updated_at?: string
          ville?: string | null
        }
        Relationships: []
      }
      produits: {
        Row: {
          created_at: string
          created_by: string | null
          fournisseur_id: string | null
          id: string
          magasin_id: string
          nom: string
          notes: string | null
          prix_achat_unitaire: number
          prix_vente_unitaire: number
          produit_parent_id: string | null
          reference: string | null
          statut: Database["public"]["Enums"]["entity_statut"]
          stock_actuel: number
          stock_seuil_alerte: number
          type_emballage: Database["public"]["Enums"]["type_emballage"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fournisseur_id?: string | null
          id?: string
          magasin_id: string
          nom: string
          notes?: string | null
          prix_achat_unitaire?: number
          prix_vente_unitaire?: number
          produit_parent_id?: string | null
          reference?: string | null
          statut?: Database["public"]["Enums"]["entity_statut"]
          stock_actuel?: number
          stock_seuil_alerte?: number
          type_emballage?: Database["public"]["Enums"]["type_emballage"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fournisseur_id?: string | null
          id?: string
          magasin_id?: string
          nom?: string
          notes?: string | null
          prix_achat_unitaire?: number
          prix_vente_unitaire?: number
          produit_parent_id?: string | null
          reference?: string | null
          statut?: Database["public"]["Enums"]["entity_statut"]
          stock_actuel?: number
          stock_seuil_alerte?: number
          type_emballage?: Database["public"]["Enums"]["type_emballage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produits_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produits_magasin_id_fkey"
            columns: ["magasin_id"]
            isOneToOne: false
            referencedRelation: "magasins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produits_produit_parent_id_fkey"
            columns: ["produit_parent_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rebuts: {
        Row: {
          created_at: string
          cree_par: string
          id: string
          magasin_id: string
          motif: string
          notes: string | null
          produit_id: string
          quantite: number
        }
        Insert: {
          created_at?: string
          cree_par: string
          id?: string
          magasin_id: string
          motif: string
          notes?: string | null
          produit_id: string
          quantite: number
        }
        Update: {
          created_at?: string
          cree_par?: string
          id?: string
          magasin_id?: string
          motif?: string
          notes?: string | null
          produit_id?: string
          quantite?: number
        }
        Relationships: []
      }
      recouvrement_allocations: {
        Row: {
          created_at: string
          id: string
          montant_alloue: number
          recouvrement_id: string
          vente_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          montant_alloue: number
          recouvrement_id: string
          vente_id: string
        }
        Update: {
          created_at?: string
          id?: string
          montant_alloue?: number
          recouvrement_id?: string
          vente_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recouvrement_allocations_recouvrement_id_fkey"
            columns: ["recouvrement_id"]
            isOneToOne: false
            referencedRelation: "recouvrements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recouvrement_allocations_vente_id_fkey"
            columns: ["vente_id"]
            isOneToOne: false
            referencedRelation: "ventes"
            referencedColumns: ["id"]
          },
        ]
      }
      recouvrements: {
        Row: {
          annule_le: string | null
          annule_par: string | null
          client_id: string
          created_at: string
          date_recouvrement: string
          id: string
          magasin_id: string
          montant: number
          motif_annulation: string | null
          notes: string | null
          numero: number
          statut: Database["public"]["Enums"]["statut_transaction"]
          vendeur_id: string
        }
        Insert: {
          annule_le?: string | null
          annule_par?: string | null
          client_id: string
          created_at?: string
          date_recouvrement?: string
          id?: string
          magasin_id: string
          montant: number
          motif_annulation?: string | null
          notes?: string | null
          numero: number
          statut?: Database["public"]["Enums"]["statut_transaction"]
          vendeur_id: string
        }
        Update: {
          annule_le?: string | null
          annule_par?: string | null
          client_id?: string
          created_at?: string
          date_recouvrement?: string
          id?: string
          magasin_id?: string
          montant?: number
          motif_annulation?: string | null
          notes?: string | null
          numero?: number
          statut?: Database["public"]["Enums"]["statut_transaction"]
          vendeur_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recouvrements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recouvrements_magasin_id_fkey"
            columns: ["magasin_id"]
            isOneToOne: false
            referencedRelation: "magasins"
            referencedColumns: ["id"]
          },
        ]
      }
      user_magasins: {
        Row: {
          created_at: string
          magasin_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          magasin_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          magasin_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_magasins_magasin_id_fkey"
            columns: ["magasin_id"]
            isOneToOne: false
            referencedRelation: "magasins"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vente_lignes: {
        Row: {
          created_at: string
          id: string
          montant_ligne: number
          prix_unitaire: number
          produit_id: string
          quantite: number
          vente_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          montant_ligne: number
          prix_unitaire: number
          produit_id: string
          quantite: number
          vente_id: string
        }
        Update: {
          created_at?: string
          id?: string
          montant_ligne?: number
          prix_unitaire?: number
          produit_id?: string
          quantite?: number
          vente_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vente_lignes_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vente_lignes_vente_id_fkey"
            columns: ["vente_id"]
            isOneToOne: false
            referencedRelation: "ventes"
            referencedColumns: ["id"]
          },
        ]
      }
      ventes: {
        Row: {
          annulee_le: string | null
          annulee_par: string | null
          client_id: string
          created_at: string
          credit_restant: number
          date_vente: string
          id: string
          magasin_id: string
          mode_paiement: Database["public"]["Enums"]["mode_paiement"]
          montant_credit: number
          montant_paye: number
          montant_total: number
          motif_annulation: string | null
          notes: string | null
          numero: number
          statut: Database["public"]["Enums"]["statut_transaction"]
          vendeur_id: string
        }
        Insert: {
          annulee_le?: string | null
          annulee_par?: string | null
          client_id: string
          created_at?: string
          credit_restant?: number
          date_vente?: string
          id?: string
          magasin_id: string
          mode_paiement: Database["public"]["Enums"]["mode_paiement"]
          montant_credit?: number
          montant_paye?: number
          montant_total: number
          motif_annulation?: string | null
          notes?: string | null
          numero: number
          statut?: Database["public"]["Enums"]["statut_transaction"]
          vendeur_id: string
        }
        Update: {
          annulee_le?: string | null
          annulee_par?: string | null
          client_id?: string
          created_at?: string
          credit_restant?: number
          date_vente?: string
          id?: string
          magasin_id?: string
          mode_paiement?: Database["public"]["Enums"]["mode_paiement"]
          montant_credit?: number
          montant_paye?: number
          montant_total?: number
          motif_annulation?: string | null
          notes?: string | null
          numero?: number
          statut?: Database["public"]["Enums"]["statut_transaction"]
          vendeur_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventes_magasin_id_fkey"
            columns: ["magasin_id"]
            isOneToOne: false
            referencedRelation: "magasins"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_recouvrement: {
        Args: { p_motif: string; p_recouvrement_id: string }
        Returns: undefined
      }
      cancel_vente: {
        Args: { p_motif: string; p_vente_id: string }
        Returns: undefined
      }
      convert_sac_to_demi: {
        Args: {
          p_magasin_id: string
          p_notes?: string
          p_produit_demi_id: string
          p_produit_sac_id: string
          p_quantite_sacs: number
        }
        Returns: string
      }
      create_rebut: {
        Args: {
          p_magasin_id: string
          p_motif: string
          p_notes?: string
          p_produit_id: string
          p_quantite: number
        }
        Returns: string
      }
      create_recouvrement: {
        Args: {
          p_client_id: string
          p_magasin_id: string
          p_montant: number
          p_notes?: string
        }
        Returns: string
      }
      create_vente: {
        Args: {
          p_client_id: string
          p_lignes: Json
          p_magasin_id: string
          p_mode: Database["public"]["Enums"]["mode_paiement"]
          p_montant_paye: number
          p_notes?: string
        }
        Returns: string
      }
      declare_sac_perce: {
        Args: {
          p_magasin_id: string
          p_motif: string
          p_notes?: string
          p_produit_demi_id: string
          p_produit_sac_id: string
          p_quantite_demi_recuperable: number
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      user_can_access_magasin: {
        Args: { _magasin_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      client_type: "particulier" | "professionnel" | "passager"
      entity_statut: "actif" | "bloque" | "archive"
      mode_paiement: "comptant" | "credit" | "mixte"
      statut_transaction: "validee" | "annulee"
      type_conversion: "sac_vers_demi" | "sac_perce"
      type_emballage: "sac" | "demi_sac" | "unite"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      client_type: ["particulier", "professionnel", "passager"],
      entity_statut: ["actif", "bloque", "archive"],
      mode_paiement: ["comptant", "credit", "mixte"],
      statut_transaction: ["validee", "annulee"],
      type_conversion: ["sac_vers_demi", "sac_perce"],
      type_emballage: ["sac", "demi_sac", "unite"],
    },
  },
} as const
