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
      company_settings: {
        Row: {
          address_city: string | null
          address_street: string | null
          address_zip: string | null
          background_image_url: string | null
          background_storage_path: string | null
          bank_bic: string | null
          bank_iban: string | null
          bank_name: string | null
          company_name: string | null
          created_at: string
          email: string | null
          id: string
          invoice_counter: number
          kind: Database["public"]["Enums"]["company_kind"]
          logo_url: string | null
          phone: string | null
          tax_number: string | null
          updated_at: string
          vat_id: string | null
          website: string | null
        }
        Insert: {
          address_city?: string | null
          address_street?: string | null
          address_zip?: string | null
          background_image_url?: string | null
          background_storage_path?: string | null
          bank_bic?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invoice_counter?: number
          kind?: Database["public"]["Enums"]["company_kind"]
          logo_url?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
          vat_id?: string | null
          website?: string | null
        }
        Update: {
          address_city?: string | null
          address_street?: string | null
          address_zip?: string | null
          background_image_url?: string | null
          background_storage_path?: string | null
          bank_bic?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invoice_counter?: number
          kind?: Database["public"]["Enums"]["company_kind"]
          logo_url?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
          vat_id?: string | null
          website?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          buyer_address: string | null
          buyer_id_number: string | null
          buyer_name: string | null
          created_at: string
          created_by: string | null
          data: Json | null
          document_number: string | null
          id: string
          total_amount: number | null
          type: Database["public"]["Enums"]["document_type"]
          vehicle_id: string | null
        }
        Insert: {
          buyer_address?: string | null
          buyer_id_number?: string | null
          buyer_name?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json | null
          document_number?: string | null
          id?: string
          total_amount?: number | null
          type: Database["public"]["Enums"]["document_type"]
          vehicle_id?: string | null
        }
        Update: {
          buyer_address?: string | null
          buyer_id_number?: string | null
          buyer_name?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json | null
          document_number?: string | null
          id?: string
          total_amount?: number | null
          type?: Database["public"]["Enums"]["document_type"]
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      external_invoices: {
        Row: {
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_name: string | null
          data: Json
          document_number: string | null
          id: string
          invoice_date: string
          storage_path: string | null
          total_amount: number | null
          type: Database["public"]["Enums"]["external_invoice_type"]
          updated_at: string
          url: string | null
          vehicle: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_name?: string | null
          data?: Json
          document_number?: string | null
          id?: string
          invoice_date?: string
          storage_path?: string | null
          total_amount?: number | null
          type: Database["public"]["Enums"]["external_invoice_type"]
          updated_at?: string
          url?: string | null
          vehicle?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_name?: string | null
          data?: Json
          document_number?: string | null
          id?: string
          invoice_date?: string
          storage_path?: string | null
          total_amount?: number | null
          type?: Database["public"]["Enums"]["external_invoice_type"]
          updated_at?: string
          url?: string | null
          vehicle?: Json
        }
        Relationships: []
      }
      motorhome_doc_records: {
        Row: {
          buyer_address: string | null
          buyer_id_number: string | null
          buyer_name: string | null
          created_at: string
          created_by: string | null
          data: Json | null
          document_number: string | null
          id: string
          motorhome_id: string | null
          total_amount: number | null
          type: Database["public"]["Enums"]["motorhome_doc_type"]
        }
        Insert: {
          buyer_address?: string | null
          buyer_id_number?: string | null
          buyer_name?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json | null
          document_number?: string | null
          id?: string
          motorhome_id?: string | null
          total_amount?: number | null
          type: Database["public"]["Enums"]["motorhome_doc_type"]
        }
        Update: {
          buyer_address?: string | null
          buyer_id_number?: string | null
          buyer_name?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json | null
          document_number?: string | null
          id?: string
          motorhome_id?: string | null
          total_amount?: number | null
          type?: Database["public"]["Enums"]["motorhome_doc_type"]
        }
        Relationships: [
          {
            foreignKeyName: "motorhome_doc_records_motorhome_id_fkey"
            columns: ["motorhome_id"]
            isOneToOne: false
            referencedRelation: "motorhomes"
            referencedColumns: ["id"]
          },
        ]
      }
      motorhome_documents: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          motorhome_id: string
          name: string
          page_count: number
          storage_path: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          motorhome_id: string
          name: string
          page_count?: number
          storage_path: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          motorhome_id?: string
          name?: string
          page_count?: number
          storage_path?: string
          url?: string
        }
        Relationships: []
      }
      motorhome_images: {
        Row: {
          created_at: string
          id: string
          motorhome_id: string
          position: number
          storage_path: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          motorhome_id: string
          position?: number
          storage_path: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          motorhome_id?: string
          position?: number
          storage_path?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "motorhome_images_motorhome_id_fkey"
            columns: ["motorhome_id"]
            isOneToOne: false
            referencedRelation: "motorhomes"
            referencedColumns: ["id"]
          },
        ]
      }
      motorhomes: {
        Row: {
          body_type: Database["public"]["Enums"]["motorhome_body_type"] | null
          brand: string
          color: string | null
          created_at: string
          created_by: string | null
          displacement_cc: number | null
          features: string[]
          first_registration: string | null
          fuel: Database["public"]["Enums"]["fuel_type"] | null
          gross_weight_kg: number | null
          height_mm: number | null
          id: string
          length_mm: number | null
          license_plate: string | null
          main_image_url: string | null
          mileage: number | null
          model: string
          notes: string | null
          power_hp: number | null
          power_kw: number | null
          price: number | null
          purchase_price: number | null
          sale_price: number | null
          sitting_places: number | null
          sleeping_places: number | null
          status: Database["public"]["Enums"]["vehicle_status"]
          tech_details: Json | null
          tech_details_updated_at: string | null
          transmission: Database["public"]["Enums"]["transmission_type"] | null
          updated_at: string
          vin: string | null
          width_mm: number | null
          year: number | null
        }
        Insert: {
          body_type?: Database["public"]["Enums"]["motorhome_body_type"] | null
          brand: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          displacement_cc?: number | null
          features?: string[]
          first_registration?: string | null
          fuel?: Database["public"]["Enums"]["fuel_type"] | null
          gross_weight_kg?: number | null
          height_mm?: number | null
          id?: string
          length_mm?: number | null
          license_plate?: string | null
          main_image_url?: string | null
          mileage?: number | null
          model: string
          notes?: string | null
          power_hp?: number | null
          power_kw?: number | null
          price?: number | null
          purchase_price?: number | null
          sale_price?: number | null
          sitting_places?: number | null
          sleeping_places?: number | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          tech_details?: Json | null
          tech_details_updated_at?: string | null
          transmission?: Database["public"]["Enums"]["transmission_type"] | null
          updated_at?: string
          vin?: string | null
          width_mm?: number | null
          year?: number | null
        }
        Update: {
          body_type?: Database["public"]["Enums"]["motorhome_body_type"] | null
          brand?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          displacement_cc?: number | null
          features?: string[]
          first_registration?: string | null
          fuel?: Database["public"]["Enums"]["fuel_type"] | null
          gross_weight_kg?: number | null
          height_mm?: number | null
          id?: string
          length_mm?: number | null
          license_plate?: string | null
          main_image_url?: string | null
          mileage?: number | null
          model?: string
          notes?: string | null
          power_hp?: number | null
          power_kw?: number | null
          price?: number | null
          purchase_price?: number | null
          sale_price?: number | null
          sitting_places?: number | null
          sleeping_places?: number | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          tech_details?: Json | null
          tech_details_updated_at?: string | null
          transmission?: Database["public"]["Enums"]["transmission_type"] | null
          updated_at?: string
          vin?: string | null
          width_mm?: number | null
          year?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
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
      vehicle_documents: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          page_count: number
          storage_path: string
          url: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          page_count?: number
          storage_path: string
          url: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          page_count?: number
          storage_path?: string
          url?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      vehicle_images: {
        Row: {
          created_at: string
          id: string
          position: number
          storage_path: string
          url: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          storage_path: string
          url: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          storage_path?: string
          url?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_images_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          brand: string
          color: string | null
          created_at: string
          created_by: string | null
          displacement_cc: number | null
          doors: number | null
          features: string[]
          first_registration: string | null
          fuel: Database["public"]["Enums"]["fuel_type"] | null
          id: string
          main_image_url: string | null
          mileage: number | null
          model: string
          notes: string | null
          power_hp: number | null
          power_kw: number | null
          price: number | null
          purchase_price: number | null
          seats: number | null
          status: Database["public"]["Enums"]["vehicle_status"]
          tech_details: Json | null
          tech_details_updated_at: string | null
          transmission: Database["public"]["Enums"]["transmission_type"] | null
          updated_at: string
          vin: string | null
          year: number | null
        }
        Insert: {
          brand: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          displacement_cc?: number | null
          doors?: number | null
          features?: string[]
          first_registration?: string | null
          fuel?: Database["public"]["Enums"]["fuel_type"] | null
          id?: string
          main_image_url?: string | null
          mileage?: number | null
          model: string
          notes?: string | null
          power_hp?: number | null
          power_kw?: number | null
          price?: number | null
          purchase_price?: number | null
          seats?: number | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          tech_details?: Json | null
          tech_details_updated_at?: string | null
          transmission?: Database["public"]["Enums"]["transmission_type"] | null
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          brand?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          displacement_cc?: number | null
          doors?: number | null
          features?: string[]
          first_registration?: string | null
          fuel?: Database["public"]["Enums"]["fuel_type"] | null
          id?: string
          main_image_url?: string | null
          mileage?: number | null
          model?: string
          notes?: string | null
          power_hp?: number | null
          power_kw?: number | null
          price?: number | null
          purchase_price?: number | null
          seats?: number | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          tech_details?: Json | null
          tech_details_updated_at?: string | null
          transmission?: Database["public"]["Enums"]["transmission_type"] | null
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "mitarbeiter"
      company_kind: "auto" | "wohnmobil"
      document_type: "preisschild" | "kaufvertrag" | "rechnung"
      external_invoice_type:
        | "werkstattrechnung"
        | "dichtigkeitspruefung"
        | "freie_rechnung"
        | "kommissionsverkauf"
      fuel_type:
        | "benzin"
        | "diesel"
        | "elektro"
        | "hybrid"
        | "lpg"
        | "cng"
        | "wasserstoff"
      motorhome_body_type:
        | "alkoven"
        | "teilintegriert"
        | "vollintegriert"
        | "kastenwagen"
      motorhome_doc_type:
        | "dichtigkeitspruefung"
        | "verkaufsschild"
        | "finanzierungsangebot"
        | "werkstattrechnung"
        | "verkaufsrechnung"
        | "verbindliche_bestellung"
        | "angebot"
      transmission_type: "manuell" | "automatik" | "halbautomatik"
      vehicle_status: "verfuegbar" | "reserviert" | "verkauft"
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
      app_role: ["admin", "mitarbeiter"],
      company_kind: ["auto", "wohnmobil"],
      document_type: ["preisschild", "kaufvertrag", "rechnung"],
      external_invoice_type: [
        "werkstattrechnung",
        "dichtigkeitspruefung",
        "freie_rechnung",
        "kommissionsverkauf",
      ],
      fuel_type: [
        "benzin",
        "diesel",
        "elektro",
        "hybrid",
        "lpg",
        "cng",
        "wasserstoff",
      ],
      motorhome_body_type: [
        "alkoven",
        "teilintegriert",
        "vollintegriert",
        "kastenwagen",
      ],
      motorhome_doc_type: [
        "dichtigkeitspruefung",
        "verkaufsschild",
        "finanzierungsangebot",
        "werkstattrechnung",
        "verkaufsrechnung",
        "verbindliche_bestellung",
        "angebot",
      ],
      transmission_type: ["manuell", "automatik", "halbautomatik"],
      vehicle_status: ["verfuegbar", "reserviert", "verkauft"],
    },
  },
} as const
