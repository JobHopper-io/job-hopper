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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      bd_leads: {
        Row: {
          "Apify Actor": string | null
          "Apify Employee Count": string | null
          "apollo data": Json | null
          "Apollo Employee Count": string | null
          "Apply Link": string | null
          "Company Name": string | null
          created_at: string
          Description: string | null
          Extras: string | null
          id: number
          "Job Highlights": string | null
          "Job Title": string | null
          Location: string | null
          "Meta Data": string | null
          "Reason for Apollo": string | null
          status: Database["public"]["Enums"]["bd_leads_status"] | null
        }
        Insert: {
          "Apify Actor"?: string | null
          "Apify Employee Count"?: string | null
          "apollo data"?: Json | null
          "Apollo Employee Count"?: string | null
          "Apply Link"?: string | null
          "Company Name"?: string | null
          created_at?: string
          Description?: string | null
          Extras?: string | null
          id?: number
          "Job Highlights"?: string | null
          "Job Title"?: string | null
          Location?: string | null
          "Meta Data"?: string | null
          "Reason for Apollo"?: string | null
          status?: Database["public"]["Enums"]["bd_leads_status"] | null
        }
        Update: {
          "Apify Actor"?: string | null
          "Apify Employee Count"?: string | null
          "apollo data"?: Json | null
          "Apollo Employee Count"?: string | null
          "Apply Link"?: string | null
          "Company Name"?: string | null
          created_at?: string
          Description?: string | null
          Extras?: string | null
          id?: number
          "Job Highlights"?: string | null
          "Job Title"?: string | null
          Location?: string | null
          "Meta Data"?: string | null
          "Reason for Apollo"?: string | null
          status?: Database["public"]["Enums"]["bd_leads_status"] | null
        }
        Relationships: []
      }
      enriched_lead: {
        Row: {
          address: string | null
          apollo_metadata: Json | null
          description: string | null
          email: string | null
          emails: string | null
          first_name: string | null
          headline: string | null
          icypeas_meta_data: Json | null
          id: number
          job_post_row_id: number | null
          last_company_address: string | null
          last_company_description: string | null
          last_company_industry: string | null
          last_company_name: string | null
          last_company_size: string | null
          last_company_url: string | null
          last_company_website: string | null
          last_job_description: string | null
          last_job_start_date: string | null
          last_job_title: string | null
          last_name: string | null
          profile_url: string | null
          status: string | null
        }
        Insert: {
          address?: string | null
          apollo_metadata?: Json | null
          description?: string | null
          email?: string | null
          emails?: string | null
          first_name?: string | null
          headline?: string | null
          icypeas_meta_data?: Json | null
          id?: number
          job_post_row_id?: number | null
          last_company_address?: string | null
          last_company_description?: string | null
          last_company_industry?: string | null
          last_company_name?: string | null
          last_company_size?: string | null
          last_company_url?: string | null
          last_company_website?: string | null
          last_job_description?: string | null
          last_job_start_date?: string | null
          last_job_title?: string | null
          last_name?: string | null
          profile_url?: string | null
          status?: string | null
        }
        Update: {
          address?: string | null
          apollo_metadata?: Json | null
          description?: string | null
          email?: string | null
          emails?: string | null
          first_name?: string | null
          headline?: string | null
          icypeas_meta_data?: Json | null
          id?: number
          job_post_row_id?: number | null
          last_company_address?: string | null
          last_company_description?: string | null
          last_company_industry?: string | null
          last_company_name?: string | null
          last_company_size?: string | null
          last_company_url?: string | null
          last_company_website?: string | null
          last_job_description?: string | null
          last_job_start_date?: string | null
          last_job_title?: string | null
          last_name?: string | null
          profile_url?: string | null
          status?: string | null
        }
        Relationships: []
      }
      exclusion_lists: {
        Row: {
          "Apify Actor": string | null
          "Apify Employee Count": string | null
          "apollo data": Json | null
          "Apollo Employee Count": string | null
          "Apply Link": string | null
          "Company Name": string | null
          created_at: string
          Description: string | null
          Extras: string | null
          id: number
          "Job Highlights": string | null
          "Job Title": string | null
          Location: string | null
          "Meta Data": string | null
          "Reason for Apollo": string | null
          "reason for reject": string | null
        }
        Insert: {
          "Apify Actor"?: string | null
          "Apify Employee Count"?: string | null
          "apollo data"?: Json | null
          "Apollo Employee Count"?: string | null
          "Apply Link"?: string | null
          "Company Name"?: string | null
          created_at?: string
          Description?: string | null
          Extras?: string | null
          id?: number
          "Job Highlights"?: string | null
          "Job Title"?: string | null
          Location?: string | null
          "Meta Data"?: string | null
          "Reason for Apollo"?: string | null
          "reason for reject"?: string | null
        }
        Update: {
          "Apify Actor"?: string | null
          "Apify Employee Count"?: string | null
          "apollo data"?: Json | null
          "Apollo Employee Count"?: string | null
          "Apply Link"?: string | null
          "Company Name"?: string | null
          created_at?: string
          Description?: string | null
          Extras?: string | null
          id?: number
          "Job Highlights"?: string | null
          "Job Title"?: string | null
          Location?: string | null
          "Meta Data"?: string | null
          "Reason for Apollo"?: string | null
          "reason for reject"?: string | null
        }
        Relationships: []
      }
      job_hopper_live: {
        Row: {
          "Apify Actor": string | null
          "Apify Employee Count": string | null
          "apollo data": Json | null
          "Apollo Employee Count": string | null
          "Apply Link": string | null
          "Company Name": string | null
          created_at: string
          Description: string | null
          Extras: string | null
          id: number
          "Job Highlights": string | null
          "Job Title": string | null
          Location: string | null
          "Meta Data": string | null
        }
        Insert: {
          "Apify Actor"?: string | null
          "Apify Employee Count"?: string | null
          "apollo data"?: Json | null
          "Apollo Employee Count"?: string | null
          "Apply Link"?: string | null
          "Company Name"?: string | null
          created_at?: string
          Description?: string | null
          Extras?: string | null
          id?: number
          "Job Highlights"?: string | null
          "Job Title"?: string | null
          Location?: string | null
          "Meta Data"?: string | null
        }
        Update: {
          "Apify Actor"?: string | null
          "Apify Employee Count"?: string | null
          "apollo data"?: Json | null
          "Apollo Employee Count"?: string | null
          "Apply Link"?: string | null
          "Company Name"?: string | null
          created_at?: string
          Description?: string | null
          Extras?: string | null
          id?: number
          "Job Highlights"?: string | null
          "Job Title"?: string | null
          Location?: string | null
          "Meta Data"?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          interview_prep_enabled: boolean | null
          premium_insights_enabled: boolean | null
          resume_upgrade_purchased: boolean | null
          stripe_current_period_end: string | null
          stripe_current_period_start: string | null
          stripe_customer_id: string | null
          stripe_plan_id: string | null
          stripe_plan_name: string | null
          stripe_subscription_id: string | null
          stripe_subscription_status: string | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          subscription_tier:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          interview_prep_enabled?: boolean | null
          premium_insights_enabled?: boolean | null
          resume_upgrade_purchased?: boolean | null
          stripe_current_period_end?: string | null
          stripe_current_period_start?: string | null
          stripe_customer_id?: string | null
          stripe_plan_id?: string | null
          stripe_plan_name?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          subscription_tier?:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          interview_prep_enabled?: boolean | null
          premium_insights_enabled?: boolean | null
          resume_upgrade_purchased?: boolean | null
          stripe_current_period_end?: string | null
          stripe_current_period_start?: string | null
          stripe_customer_id?: string | null
          stripe_plan_id?: string | null
          stripe_plan_name?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          subscription_tier?:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          current_industry: string | null
          current_job_title: string | null
          desired_salary_max: number | null
          desired_salary_min: number | null
          email: string
          first_name: string
          id: string
          last_name: string
          onboarding_completed: boolean | null
          open_to_relocation: boolean | null
          open_to_remote: boolean | null
          organization_id: string | null
          phone_number: string | null
          preferred_locations: string[] | null
          resume_bucket_key: string | null
          target_role_categories: string[] | null
          updated_at: string | null
          years_of_experience: number | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          current_industry?: string | null
          current_job_title?: string | null
          desired_salary_max?: number | null
          desired_salary_min?: number | null
          email: string
          first_name: string
          id?: string
          last_name: string
          onboarding_completed?: boolean | null
          open_to_relocation?: boolean | null
          open_to_remote?: boolean | null
          organization_id?: string | null
          phone_number?: string | null
          preferred_locations?: string[] | null
          resume_bucket_key?: string | null
          target_role_categories?: string[] | null
          updated_at?: string | null
          years_of_experience?: number | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          current_industry?: string | null
          current_job_title?: string | null
          desired_salary_max?: number | null
          desired_salary_min?: number | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          onboarding_completed?: boolean | null
          open_to_relocation?: boolean | null
          open_to_remote?: boolean | null
          organization_id?: string | null
          phone_number?: string | null
          preferred_locations?: string[] | null
          resume_bucket_key?: string | null
          target_role_categories?: string[] | null
          updated_at?: string | null
          years_of_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_jobs: {
        Row: {
          "Apify Actor": string | null
          "Apify Employee Count": string | null
          "apollo data": Json | null
          "Apollo Employee Count": string | null
          "Apply Link": string | null
          "Company Name": string | null
          created_at: string
          Description: string | null
          Extras: string | null
          id: number
          Industry: string | null
          "Job Highlights": string | null
          "Job Title": string | null
          Location: string | null
          "Meta Data": string | null
          "Reason for Apollo": string | null
        }
        Insert: {
          "Apify Actor"?: string | null
          "Apify Employee Count"?: string | null
          "apollo data"?: Json | null
          "Apollo Employee Count"?: string | null
          "Apply Link"?: string | null
          "Company Name"?: string | null
          created_at?: string
          Description?: string | null
          Extras?: string | null
          id?: number
          Industry?: string | null
          "Job Highlights"?: string | null
          "Job Title"?: string | null
          Location?: string | null
          "Meta Data"?: string | null
          "Reason for Apollo"?: string | null
        }
        Update: {
          "Apify Actor"?: string | null
          "Apify Employee Count"?: string | null
          "apollo data"?: Json | null
          "Apollo Employee Count"?: string | null
          "Apply Link"?: string | null
          "Company Name"?: string | null
          created_at?: string
          Description?: string | null
          Extras?: string | null
          id?: number
          Industry?: string | null
          "Job Highlights"?: string | null
          "Job Title"?: string | null
          Location?: string | null
          "Meta Data"?: string | null
          "Reason for Apollo"?: string | null
        }
        Relationships: []
      }
      sic_codes: {
        Row: {
          csv_industry_code: string | null
          ewb_industry_code: string | null
          industry_title: string | null
        }
        Insert: {
          csv_industry_code?: string | null
          ewb_industry_code?: string | null
          industry_title?: string | null
        }
        Update: {
          csv_industry_code?: string | null
          ewb_industry_code?: string | null
          industry_title?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_subscription_for_user: {
        Args: {
          tier: Database["public"]["Enums"]["subscription_tier"]
          trial_days?: number
          user_id: string
        }
        Returns: string
      }
      create_user_profile: {
        Args: {
          first_name: string
          last_name: string
          phone_number?: string
          user_email: string
          user_id: string
        }
        Returns: Json
      }
      create_user_profile_and_organization: {
        Args: {
          booking_link?: string
          first_name: string
          last_name: string
          org_domain?: string
          org_name?: string
          user_email: string
          user_id: string
        }
        Returns: Json
      }
      enable_premium_addon: {
        Args: { addon_type: string; user_id: string }
        Returns: boolean
      }
      update_subscription_tier: {
        Args: {
          new_tier: Database["public"]["Enums"]["subscription_tier"]
          user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      bd_leads_status:
        | "New"
        | "Ready to Process"
        | "Processed"
        | "NOT FOUND"
        | "Ready for AI Personalization"
        | "Invalid Email"
      subscription_status: "trial" | "active" | "cancelled" | "expired"
      subscription_tier:
        | "entry_mid"
        | "senior_management"
        | "director_vp_c_level"
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
      bd_leads_status: [
        "New",
        "Ready to Process",
        "Processed",
        "NOT FOUND",
        "Ready for AI Personalization",
        "Invalid Email",
      ],
      subscription_status: ["trial", "active", "cancelled", "expired"],
      subscription_tier: [
        "entry_mid",
        "senior_management",
        "director_vp_c_level",
      ],
    },
  },
} as const
