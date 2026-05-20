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
      apollo_limits: {
        Row: {
          credit_limit: number
          id: string
          name: string
          updated_at: string
          usage: number
        }
        Insert: {
          credit_limit?: number
          id?: string
          name: string
          updated_at?: string
          usage?: number
        }
        Update: {
          credit_limit?: number
          id?: string
          name?: string
          updated_at?: string
          usage?: number
        }
        Relationships: []
      }
      bd_leads: {
        Row: {
          company_name: string | null
          created_at: string
          id: number
          linkedin_url: string | null
          status: Database["public"]["Enums"]["bd_leads_status"] | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          id?: number
          linkedin_url?: string | null
          status?: Database["public"]["Enums"]["bd_leads_status"] | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          id?: number
          linkedin_url?: string | null
          status?: Database["public"]["Enums"]["bd_leads_status"] | null
        }
        Relationships: []
      }
      company_apollo_cache: {
        Row: {
          apollo_organization_id: string
          cache_key: string
          company_name: string
          expires_at: string
          location_region: string | null
          primary_domain: string | null
          resolved_at: string
        }
        Insert: {
          apollo_organization_id: string
          cache_key: string
          company_name: string
          expires_at: string
          location_region?: string | null
          primary_domain?: string | null
          resolved_at?: string
        }
        Update: {
          apollo_organization_id?: string
          cache_key?: string
          company_name?: string
          expires_at?: string
          location_region?: string | null
          primary_domain?: string | null
          resolved_at?: string
        }
        Relationships: []
      }
      company_apollo_search_miss: {
        Row: {
          cache_key: string
          expires_at: string
          reason: string
          recorded_at: string
        }
        Insert: {
          cache_key: string
          expires_at: string
          reason?: string
          recorded_at?: string
        }
        Update: {
          cache_key?: string
          expires_at?: string
          reason?: string
          recorded_at?: string
        }
        Relationships: []
      }
      dashboard_banner: {
        Row: {
          ends_at: string | null
          id: number
          message: string
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          ends_at?: string | null
          id?: number
          message?: string
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          ends_at?: string | null
          id?: number
          message?: string
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_events: {
        Row: {
          error_message: string | null
          id: string
          payload: Json | null
          profile_id: string | null
          provider_message_id: string | null
          sent_at: string
          status: Database["public"]["Enums"]["email_event_status"]
          subject: string | null
          template_key: string | null
          type: Database["public"]["Enums"]["email_event_type"]
        }
        Insert: {
          error_message?: string | null
          id?: string
          payload?: Json | null
          profile_id?: string | null
          provider_message_id?: string | null
          sent_at?: string
          status: Database["public"]["Enums"]["email_event_status"]
          subject?: string | null
          template_key?: string | null
          type: Database["public"]["Enums"]["email_event_type"]
        }
        Update: {
          error_message?: string | null
          id?: string
          payload?: Json | null
          profile_id?: string | null
          provider_message_id?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["email_event_status"]
          subject?: string | null
          template_key?: string | null
          type?: Database["public"]["Enums"]["email_event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "email_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          company_name: string | null
          created_at: string
          id: number
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          id?: number
        }
        Update: {
          company_name?: string | null
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      freemium_settings: {
        Row: {
          id: number
          max_job_searches: number
          max_premium_insights: number
          max_resume_advice: number
          updated_at: string
        }
        Insert: {
          id?: number
          max_job_searches?: number
          max_premium_insights?: number
          max_resume_advice?: number
          updated_at?: string
        }
        Update: {
          id?: number
          max_job_searches?: number
          max_premium_insights?: number
          max_resume_advice?: number
          updated_at?: string
        }
        Relationships: []
      }
      freemium_usage: {
        Row: {
          created_at: string
          job_searches_used: number
          premium_insights_used: number
          profile_id: string
          resume_advice_used: number
          selected_tier_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          job_searches_used?: number
          premium_insights_used?: number
          profile_id: string
          resume_advice_used?: number
          selected_tier_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          job_searches_used?: number
          premium_insights_used?: number
          profile_id?: string
          resume_advice_used?: number
          selected_tier_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "freemium_usage_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_hiring_contacts: {
        Row: {
          company_summary: Json | null
          completed_at: string | null
          contacts: Json | null
          created_at: string
          error_code: string | null
          id: string
          job_match_id: string
          org_disambiguation_options: Json | null
          profile_id: string
          status: Database["public"]["Enums"]["job_hiring_contacts_status"]
          updated_at: string
        }
        Insert: {
          company_summary?: Json | null
          completed_at?: string | null
          contacts?: Json | null
          created_at?: string
          error_code?: string | null
          id?: string
          job_match_id: string
          org_disambiguation_options?: Json | null
          profile_id: string
          status?: Database["public"]["Enums"]["job_hiring_contacts_status"]
          updated_at?: string
        }
        Update: {
          company_summary?: Json | null
          completed_at?: string | null
          contacts?: Json | null
          created_at?: string
          error_code?: string | null
          id?: string
          job_match_id?: string
          org_disambiguation_options?: Json | null
          profile_id?: string
          status?: Database["public"]["Enums"]["job_hiring_contacts_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_hiring_contacts_job_match_id_fkey"
            columns: ["job_match_id"]
            isOneToOne: false
            referencedRelation: "job_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_hiring_contacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_hopper_live: {
        Row: {
          ai_job_briefing: string
          apply_link: string | null
          company_name: string
          created_at: string | null
          description: string | null
          employee_count: number | null
          employment_types: string[] | null
          id: string
          is_remote: boolean
          job_title: string
          location: string | null
          pay_max: number | null
          pay_min: number | null
          pay_type: Database["public"]["Enums"]["pay_type"] | null
          posted_date: string | null
          role_category: Database["public"]["Enums"]["role_category"]
          schedules: string[] | null
          sponsorship_likelihood: Database["public"]["Enums"]["sponsorship_likelihood"]
          subscription_tier: string
        }
        Insert: {
          ai_job_briefing: string
          apply_link?: string | null
          company_name: string
          created_at?: string | null
          description?: string | null
          employee_count?: number | null
          employment_types?: string[] | null
          id?: string
          is_remote?: boolean
          job_title: string
          location?: string | null
          pay_max?: number | null
          pay_min?: number | null
          pay_type?: Database["public"]["Enums"]["pay_type"] | null
          posted_date?: string | null
          role_category: Database["public"]["Enums"]["role_category"]
          schedules?: string[] | null
          sponsorship_likelihood?: Database["public"]["Enums"]["sponsorship_likelihood"]
          subscription_tier: string
        }
        Update: {
          ai_job_briefing?: string
          apply_link?: string | null
          company_name?: string
          created_at?: string | null
          description?: string | null
          employee_count?: number | null
          employment_types?: string[] | null
          id?: string
          is_remote?: boolean
          job_title?: string
          location?: string | null
          pay_max?: number | null
          pay_min?: number | null
          pay_type?: Database["public"]["Enums"]["pay_type"] | null
          posted_date?: string | null
          role_category?: Database["public"]["Enums"]["role_category"]
          schedules?: string[] | null
          sponsorship_likelihood?: Database["public"]["Enums"]["sponsorship_likelihood"]
          subscription_tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_hopper_live_subscription_tier_fkey"
            columns: ["subscription_tier"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["key"]
          },
        ]
      }
      job_matches: {
        Row: {
          created_at: string
          id: string
          job_id: string
          profile_id: string
          score: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          profile_id: string
          score?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          profile_id?: string
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_matches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_hopper_live"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_matches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_processor_flags: {
        Row: {
          apollo_credits_exhausted: boolean
          id: number
          updated_at: string
        }
        Insert: {
          apollo_credits_exhausted?: boolean
          id: number
          updated_at?: string
        }
        Update: {
          apollo_credits_exhausted?: boolean
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      job_processor_runs: {
        Row: {
          counts: Json
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          options: Json
          started_at: string | null
          status: Database["public"]["Enums"]["job_processor_run_status"]
          updated_at: string
        }
        Insert: {
          counts?: Json
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          options?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_processor_run_status"]
          updated_at?: string
        }
        Update: {
          counts?: Json
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          options?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_processor_run_status"]
          updated_at?: string
        }
        Relationships: []
      }
      matching_algorithm_config: {
        Row: {
          active: boolean
          created_at: string
          id: string
          keyword_current_industry_weight: number
          keyword_current_job_title_weight: number
          loc_distance_0_10_weight: number
          loc_distance_10_25_weight: number
          loc_distance_25_50_weight: number
          loc_distance_50_100_weight: number
          loc_distance_beyond_100_weight: number
          loc_other_location_penalty: number
          loc_relocation_allowed_weight: number
          loc_remote_preferred_weight: number
          loc_same_metro_weight: number
          loc_same_state_weight: number
          loc_within_radius_bonus_weight: number
          name: string
          pay_below_range_penalty: number
          pay_inside_range_weight: number
          pay_missing_salary_weight: number
          pay_near_range_weight: number
          recency_base_weight: number
          recency_max_age_days: number
          recency_per_day_decay: number
          threshold_min_total_score: number
          threshold_no_keyword_match_penalty: number
          threshold_over_pay_tolerance_pct: number
          threshold_under_pay_tolerance_pct: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          keyword_current_industry_weight: number
          keyword_current_job_title_weight: number
          loc_distance_0_10_weight: number
          loc_distance_10_25_weight: number
          loc_distance_25_50_weight: number
          loc_distance_50_100_weight: number
          loc_distance_beyond_100_weight: number
          loc_other_location_penalty: number
          loc_relocation_allowed_weight: number
          loc_remote_preferred_weight: number
          loc_same_metro_weight: number
          loc_same_state_weight: number
          loc_within_radius_bonus_weight: number
          name: string
          pay_below_range_penalty: number
          pay_inside_range_weight: number
          pay_missing_salary_weight: number
          pay_near_range_weight: number
          recency_base_weight: number
          recency_max_age_days: number
          recency_per_day_decay: number
          threshold_min_total_score: number
          threshold_no_keyword_match_penalty: number
          threshold_over_pay_tolerance_pct: number
          threshold_under_pay_tolerance_pct: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          keyword_current_industry_weight?: number
          keyword_current_job_title_weight?: number
          loc_distance_0_10_weight?: number
          loc_distance_10_25_weight?: number
          loc_distance_25_50_weight?: number
          loc_distance_50_100_weight?: number
          loc_distance_beyond_100_weight?: number
          loc_other_location_penalty?: number
          loc_relocation_allowed_weight?: number
          loc_remote_preferred_weight?: number
          loc_same_metro_weight?: number
          loc_same_state_weight?: number
          loc_within_radius_bonus_weight?: number
          name?: string
          pay_below_range_penalty?: number
          pay_inside_range_weight?: number
          pay_missing_salary_weight?: number
          pay_near_range_weight?: number
          recency_base_weight?: number
          recency_max_age_days?: number
          recency_per_day_decay?: number
          threshold_min_total_score?: number
          threshold_no_keyword_match_penalty?: number
          threshold_over_pay_tolerance_pct?: number
          threshold_under_pay_tolerance_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          created_at: string
          email_unsubscribed_at: string | null
          id: string
          job_match_email_enabled: boolean
          job_match_email_frequency: Database["public"]["Enums"]["job_match_email_frequency"]
          last_job_match_email_sent_at: string | null
          profile_id: string
          subscription_updates_email_enabled: boolean
          system_announcements_email_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_unsubscribed_at?: string | null
          id?: string
          job_match_email_enabled?: boolean
          job_match_email_frequency?: Database["public"]["Enums"]["job_match_email_frequency"]
          last_job_match_email_sent_at?: string | null
          profile_id: string
          subscription_updates_email_enabled?: boolean
          system_announcements_email_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_unsubscribed_at?: string | null
          id?: string
          job_match_email_enabled?: boolean
          job_match_email_frequency?: Database["public"]["Enums"]["job_match_email_frequency"]
          last_job_match_email_sent_at?: string | null
          profile_id?: string
          subscription_updates_email_enabled?: boolean
          system_announcements_email_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          available_for_purchase: boolean
          category: Database["public"]["Enums"]["product_category"]
          description: string
          display_name: string
          id: string
          key: string
          price_cents: number
          stripe_product_id: string | null
        }
        Insert: {
          available_for_purchase?: boolean
          category: Database["public"]["Enums"]["product_category"]
          description?: string
          display_name: string
          id?: string
          key: string
          price_cents: number
          stripe_product_id?: string | null
        }
        Update: {
          available_for_purchase?: boolean
          category?: Database["public"]["Enums"]["product_category"]
          description?: string
          display_name?: string
          id?: string
          key?: string
          price_cents?: number
          stripe_product_id?: string | null
        }
        Relationships: []
      }
      profile_roles: {
        Row: {
          created_at: string
          profile_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
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
          location_radius_miles: number | null
          onboarding_completed: boolean | null
          open_to_relocation: boolean | null
          open_to_remote: boolean | null
          phone_number: string | null
          preferred_locations: string[] | null
          requires_us_sponsorship: boolean | null
          resume_bucket_key: string | null
          stripe_customer_id: string | null
          target_job_title: string | null
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
          location_radius_miles?: number | null
          onboarding_completed?: boolean | null
          open_to_relocation?: boolean | null
          open_to_remote?: boolean | null
          phone_number?: string | null
          preferred_locations?: string[] | null
          requires_us_sponsorship?: boolean | null
          resume_bucket_key?: string | null
          stripe_customer_id?: string | null
          target_job_title?: string | null
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
          location_radius_miles?: number | null
          onboarding_completed?: boolean | null
          open_to_relocation?: boolean | null
          open_to_remote?: boolean | null
          phone_number?: string | null
          preferred_locations?: string[] | null
          requires_us_sponsorship?: boolean | null
          resume_bucket_key?: string | null
          stripe_customer_id?: string | null
          target_job_title?: string | null
          target_role_categories?: string[] | null
          updated_at?: string | null
          years_of_experience?: number | null
        }
        Relationships: []
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
      resume_products: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          improvements_text: string | null
          job_match_id: string | null
          product_id: string
          profile_id: string
          status: Database["public"]["Enums"]["resume_product_status"]
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          improvements_text?: string | null
          job_match_id?: string | null
          product_id: string
          profile_id: string
          status?: Database["public"]["Enums"]["resume_product_status"]
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          improvements_text?: string | null
          job_match_id?: string | null
          product_id?: string
          profile_id?: string
          status?: Database["public"]["Enums"]["resume_product_status"]
        }
        Relationships: [
          {
            foreignKeyName: "resume_products_job_match_id_fkey"
            columns: ["job_match_id"]
            isOneToOne: false
            referencedRelation: "job_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_products_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      saved_jobs: {
        Row: {
          created_at: string
          id: string
          match_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jobs_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "job_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_jobs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          function_name: string
          id: string
          payload: Json
          run_at: string
          started_at: string | null
          status: Database["public"]["Enums"]["scheduled_job_status"]
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          function_name: string
          id?: string
          payload?: Json
          run_at: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["scheduled_job_status"]
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          function_name?: string
          id?: string
          payload?: Json
          run_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["scheduled_job_status"]
        }
        Relationships: []
      }
      scraper_raw_jobs: {
        Row: {
          apply_link: string | null
          company_name: string
          date_scraped: string
          description: string | null
          employment_types: string[] | null
          id: string
          is_remote: boolean
          job_title: string
          location: string | null
          pay_max: number | null
          pay_min: number | null
          pay_type: Database["public"]["Enums"]["pay_type"] | null
          posted_date: string | null
          schedules: string[] | null
          status: Database["public"]["Enums"]["scraper_raw_job_status"]
        }
        Insert: {
          apply_link?: string | null
          company_name: string
          date_scraped?: string
          description?: string | null
          employment_types?: string[] | null
          id?: string
          is_remote?: boolean
          job_title: string
          location?: string | null
          pay_max?: number | null
          pay_min?: number | null
          pay_type?: Database["public"]["Enums"]["pay_type"] | null
          posted_date?: string | null
          schedules?: string[] | null
          status?: Database["public"]["Enums"]["scraper_raw_job_status"]
        }
        Update: {
          apply_link?: string | null
          company_name?: string
          date_scraped?: string
          description?: string | null
          employment_types?: string[] | null
          id?: string
          is_remote?: boolean
          job_title?: string
          location?: string | null
          pay_max?: number | null
          pay_min?: number | null
          pay_type?: Database["public"]["Enums"]["pay_type"] | null
          posted_date?: string | null
          schedules?: string[] | null
          status?: Database["public"]["Enums"]["scraper_raw_job_status"]
        }
        Relationships: []
      }
      scraper_search_terms: {
        Row: {
          id: number
          search_term: string
        }
        Insert: {
          id?: number
          search_term?: string
        }
        Update: {
          id?: number
          search_term?: string
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
      subscription_product: {
        Row: {
          id: string
          product_id: string
          stripe_subscription_item_id: string | null
          subscription_id: string
        }
        Insert: {
          id?: string
          product_id: string
          stripe_subscription_item_id?: string | null
          subscription_id: string
        }
        Update: {
          id?: string
          product_id?: string
          stripe_subscription_item_id?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_product_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_product_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          current_period_ends_at: string | null
          id: string
          profile_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id: string
        }
        Insert: {
          current_period_ends_at?: string | null
          id?: string
          profile_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id: string
        }
        Update: {
          current_period_ends_at?: string | null
          id?: string
          profile_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_announcements: {
        Row: {
          created_at: string
          created_by: string | null
          email_body_html: string
          email_subject: string
          id: string
          published_at: string | null
          slug: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email_body_html: string
          email_subject: string
          id?: string
          published_at?: string | null
          slug: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email_body_html?: string
          email_subject?: string
          id?: string
          published_at?: string | null
          slug?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_phone_available: { Args: { phone_input: string }; Returns: boolean }
      claim_premium_insights_for_addon: {
        Args: { p_job_match_id: string; p_profile_id: string }
        Returns: {
          err: string
          hiring_contact_id: string
          ok: boolean
        }[]
      }
      claim_scraper_raw_jobs: {
        Args: { p_limit: number }
        Returns: {
          apply_link: string | null
          company_name: string
          date_scraped: string
          description: string | null
          employment_types: string[] | null
          id: string
          is_remote: boolean
          job_title: string
          location: string | null
          pay_max: number | null
          pay_min: number | null
          pay_type: Database["public"]["Enums"]["pay_type"] | null
          posted_date: string | null
          schedules: string[] | null
          status: Database["public"]["Enums"]["scraper_raw_job_status"]
        }[]
        SetofOptions: {
          from: "*"
          to: "scraper_raw_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clean_scraper_raw_jobs_n8n_parity: { Args: never; Returns: Json }
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
      current_user_has_role: { Args: { role_name: string }; Returns: boolean }
      enable_premium_addon: {
        Args: { addon_type: string; user_id: string }
        Returns: boolean
      }
      redeem_freemium_premium_insights: {
        Args: { p_job_match_id: string; p_profile_id: string }
        Returns: {
          err: string
          hiring_contact_id: string
          max_premium_insights: number
          ok: boolean
          premium_insights_used: number
        }[]
      }
      redeem_freemium_resume_advice: {
        Args: {
          p_job_match_id: string
          p_product_id: string
          p_profile_id: string
        }
        Returns: {
          err: string
          max_resume_advice: number
          ok: boolean
          resume_advice_used: number
          resume_product_id: string
        }[]
      }
      refund_apollo_credits: {
        Args: { p_amount: number; p_name: string }
        Returns: undefined
      }
      refund_freemium_premium_insights: {
        Args: { p_hiring_contact_id: string; p_profile_id: string }
        Returns: undefined
      }
      reset_apollo_limits_usage: { Args: never; Returns: undefined }
      try_consume_apollo_credits: {
        Args: { p_amount: number; p_name: string }
        Returns: {
          credit_limit: number
          ok: boolean
          usage_after: number
        }[]
      }
      try_consume_freemium_job_search: {
        Args: { p_profile_id: string }
        Returns: {
          job_searches_used: number
          max_job_searches: number
          success: boolean
        }[]
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
      email_event_status: "sent" | "failed"
      email_event_type:
        | "job_match_digest"
        | "subscription_update"
        | "system_announcement"
      job_hiring_contacts_status:
        | "pending"
        | "complete"
        | "failed"
        | "cancelled"
      job_match_email_frequency: "immediate" | "daily" | "weekly"
      job_processor_run_status: "queued" | "running" | "completed" | "failed"
      pay_type: "hour" | "year" | "month" | "week" | "day"
      product_category:
        | "base_plan"
        | "subscription_addon"
        | "one_time_addon"
        | "one_time_item"
      product_type: "subscription" | "payment"
      resume_product_status: "pending" | "complete" | "cancelled"
      role_category:
        | "operations"
        | "maintenance"
        | "engineering"
        | "management"
        | "executive"
        | "other"
      scheduled_job_status: "pending" | "running" | "completed" | "failed"
      scraper_raw_job_status: "pending" | "processed" | "processing"
      sponsorship_likelihood: "Low" | "Medium" | "High" | "N/A"
      subscription_status: "trial" | "active" | "canceled"
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
      email_event_status: ["sent", "failed"],
      email_event_type: [
        "job_match_digest",
        "subscription_update",
        "system_announcement",
      ],
      job_hiring_contacts_status: [
        "pending",
        "complete",
        "failed",
        "cancelled",
      ],
      job_match_email_frequency: ["immediate", "daily", "weekly"],
      job_processor_run_status: ["queued", "running", "completed", "failed"],
      pay_type: ["hour", "year", "month", "week", "day"],
      product_category: [
        "base_plan",
        "subscription_addon",
        "one_time_addon",
        "one_time_item",
      ],
      product_type: ["subscription", "payment"],
      resume_product_status: ["pending", "complete", "cancelled"],
      role_category: [
        "operations",
        "maintenance",
        "engineering",
        "management",
        "executive",
        "other",
      ],
      scheduled_job_status: ["pending", "running", "completed", "failed"],
      scraper_raw_job_status: ["pending", "processed", "processing"],
      sponsorship_likelihood: ["Low", "Medium", "High", "N/A"],
      subscription_status: ["trial", "active", "canceled"],
    },
  },
} as const
