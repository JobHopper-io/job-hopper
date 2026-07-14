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
          core_daily_resume_advice: number
          id: number
          max_job_searches: number
          max_premium_insights: number
          max_resume_advice: number
          premium_daily_resume_advice: number
          updated_at: string
        }
        Insert: {
          core_daily_resume_advice?: number
          id?: number
          max_job_searches?: number
          max_premium_insights?: number
          max_resume_advice?: number
          premium_daily_resume_advice?: number
          updated_at?: string
        }
        Update: {
          core_daily_resume_advice?: number
          id?: number
          max_job_searches?: number
          max_premium_insights?: number
          max_resume_advice?: number
          premium_daily_resume_advice?: number
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
      job_applications: {
        Row: {
          applied_at: string | null
          created_at: string
          id: string
          match_id: string
          notes: string | null
          profile_id: string
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          id?: string
          match_id: string
          notes?: string | null
          profile_id: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          id?: string
          match_id?: string
          notes?: string | null
          profile_id?: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "job_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_demand_signal: {
        Row: {
          current_count: number | null
          growth_rate: number | null
          last_calculated: string | null
          location_slug: string
          prior_count: number | null
          rank: number | null
          role_slug: string
        }
        Insert: {
          current_count?: number | null
          growth_rate?: number | null
          last_calculated?: string | null
          location_slug: string
          prior_count?: number | null
          rank?: number | null
          role_slug: string
        }
        Update: {
          current_count?: number | null
          growth_rate?: number | null
          last_calculated?: string | null
          location_slug?: string
          prior_count?: number | null
          rank?: number | null
          role_slug?: string
        }
        Relationships: []
      }
      job_demand_weekly_counts: {
        Row: {
          job_count: number | null
          location_slug: string
          role_slug: string
          week_start: string
        }
        Insert: {
          job_count?: number | null
          location_slug: string
          role_slug: string
          week_start: string
        }
        Update: {
          job_count?: number | null
          location_slug?: string
          role_slug?: string
          week_start?: string
        }
        Relationships: []
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
      match_synonyms: {
        Row: {
          aliases: string[]
          canonical: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          canonical: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          canonical?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      matching_algorithm_config: {
        Row: {
          active: boolean
          archived: boolean
          cat_weight_filter_matches: number
          cat_weight_location: number
          cat_weight_pay: number
          cat_weight_phrase: number
          cat_weight_recency: number
          created_at: string
          id: string
          loc_band_beyond_100: number
          loc_band_d0_10: number
          loc_band_d10_25: number
          loc_band_d25_50: number
          loc_band_d50_100: number
          loc_relocation_gate_enabled: boolean
          loc_remote_as_perfect: boolean
          loc_same_metro_quality: number
          loc_same_state_quality: number
          name: string
          pay_above_range_quality: number
          pay_hard_floor_enabled: boolean
          pay_hard_floor_fraction: number
          pay_missing_salary_quality: number
          pay_near_range_quality: number
          pay_over_tolerance_fraction: number
          pay_under_tolerance_fraction: number
          phrase_gate_require_primary_or_industry: boolean
          phrase_surface_weight_briefing: number
          phrase_surface_weight_description: number
          phrase_surface_weight_title: number
          phrase_tier_factor_industry: number
          phrase_tier_factor_primary: number
          phrase_tier_factor_secondary: number
          recency_max_age_days: number
          threshold_min_total_score: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived?: boolean
          cat_weight_filter_matches?: number
          cat_weight_location: number
          cat_weight_pay: number
          cat_weight_phrase: number
          cat_weight_recency: number
          created_at?: string
          id?: string
          loc_band_beyond_100: number
          loc_band_d0_10: number
          loc_band_d10_25: number
          loc_band_d25_50: number
          loc_band_d50_100: number
          loc_relocation_gate_enabled: boolean
          loc_remote_as_perfect: boolean
          loc_same_metro_quality: number
          loc_same_state_quality: number
          name: string
          pay_above_range_quality: number
          pay_hard_floor_enabled: boolean
          pay_hard_floor_fraction: number
          pay_missing_salary_quality: number
          pay_near_range_quality: number
          pay_over_tolerance_fraction: number
          pay_under_tolerance_fraction: number
          phrase_gate_require_primary_or_industry: boolean
          phrase_surface_weight_briefing: number
          phrase_surface_weight_description: number
          phrase_surface_weight_title: number
          phrase_tier_factor_industry: number
          phrase_tier_factor_primary: number
          phrase_tier_factor_secondary: number
          recency_max_age_days: number
          threshold_min_total_score: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived?: boolean
          cat_weight_filter_matches?: number
          cat_weight_location?: number
          cat_weight_pay?: number
          cat_weight_phrase?: number
          cat_weight_recency?: number
          created_at?: string
          id?: string
          loc_band_beyond_100?: number
          loc_band_d0_10?: number
          loc_band_d10_25?: number
          loc_band_d25_50?: number
          loc_band_d50_100?: number
          loc_relocation_gate_enabled?: boolean
          loc_remote_as_perfect?: boolean
          loc_same_metro_quality?: number
          loc_same_state_quality?: number
          name?: string
          pay_above_range_quality?: number
          pay_hard_floor_enabled?: boolean
          pay_hard_floor_fraction?: number
          pay_missing_salary_quality?: number
          pay_near_range_quality?: number
          pay_over_tolerance_fraction?: number
          pay_under_tolerance_fraction?: number
          phrase_gate_require_primary_or_industry?: boolean
          phrase_surface_weight_briefing?: number
          phrase_surface_weight_description?: number
          phrase_surface_weight_title?: number
          phrase_tier_factor_industry?: number
          phrase_tier_factor_primary?: number
          phrase_tier_factor_secondary?: number
          recency_max_age_days?: number
          threshold_min_total_score?: number
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
      premium_waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          profile_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          profile_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "premium_waitlist_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
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
          career_level: Database["public"]["Enums"]["career_level"] | null
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
          career_level?: Database["public"]["Enums"]["career_level"] | null
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
          career_level?: Database["public"]["Enums"]["career_level"] | null
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
      resume_advice_daily_usage: {
        Row: {
          count: number
          profile_id: string
          usage_date: string
        }
        Insert: {
          count?: number
          profile_id: string
          usage_date: string
        }
        Update: {
          count?: number
          profile_id?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "resume_advice_daily_usage_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_products: {
        Row: {
          completed_at: string | null
          created_at: string
          daily_usage_date: string | null
          error_message: string | null
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
          daily_usage_date?: string | null
          error_message?: string | null
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
          daily_usage_date?: string | null
          error_message?: string | null
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
      seo_pages: {
        Row: {
          h1: string | null
          indexed: boolean | null
          intro_copy: string | null
          job_count: number | null
          last_generated: string | null
          meta_description: string | null
          page_data: Json | null
          page_type: string
          sample_listings: Json | null
          url_path: string
        }
        Insert: {
          h1?: string | null
          indexed?: boolean | null
          intro_copy?: string | null
          job_count?: number | null
          last_generated?: string | null
          meta_description?: string | null
          page_data?: Json | null
          page_type?: string
          sample_listings?: Json | null
          url_path: string
        }
        Update: {
          h1?: string | null
          indexed?: boolean | null
          intro_copy?: string | null
          job_count?: number | null
          last_generated?: string | null
          meta_description?: string | null
          page_data?: Json | null
          page_type?: string
          sample_listings?: Json | null
          url_path?: string
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
      sponsorship_heuristic_scores: {
        Row: {
          company_name: string
          employee_count: number | null
          heuristic_label: string | null
          heuristic_score: number | null
          last_calculated: string | null
        }
        Insert: {
          company_name: string
          employee_count?: number | null
          heuristic_label?: string | null
          heuristic_score?: number | null
          last_calculated?: string | null
        }
        Update: {
          company_name?: string
          employee_count?: number | null
          heuristic_label?: string | null
          heuristic_score?: number | null
          last_calculated?: string | null
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          id: string
          outcome: string
          received_at: string
          type: string
        }
        Insert: {
          id: string
          outcome: string
          received_at?: string
          type: string
        }
        Update: {
          id?: string
          outcome?: string
          received_at?: string
          type?: string
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
      subscription_reconciliation_audit: {
        Row: {
          id: string
          new_period_ends_at: string | null
          new_status: string | null
          note: string | null
          old_period_ends_at: string | null
          old_status: string | null
          reconciled_at: string
          source: string
          stripe_subscription_id: string
          subscription_id: string | null
        }
        Insert: {
          id?: string
          new_period_ends_at?: string | null
          new_status?: string | null
          note?: string | null
          old_period_ends_at?: string | null
          old_status?: string | null
          reconciled_at?: string
          source: string
          stripe_subscription_id: string
          subscription_id?: string | null
        }
        Update: {
          id?: string
          new_period_ends_at?: string | null
          new_status?: string | null
          note?: string | null
          old_period_ends_at?: string | null
          old_status?: string | null
          reconciled_at?: string
          source?: string
          stripe_subscription_id?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_reconciliation_audit_subscription_id_fkey"
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
      redeem_daily_resume_advice: {
        Args: {
          p_daily_limit: number
          p_job_match_id: string
          p_product_id: string
          p_profile_id: string
        }
        Returns: {
          daily_limit: number
          daily_used: number
          err: string
          ok: boolean
          resume_product_id: string
        }[]
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
      refund_daily_resume_advice: {
        Args: { p_resume_product_id: string }
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
      application_status:
        | "saved"
        | "applied"
        | "interviewing"
        | "rejected"
        | "ghosted"
      bd_leads_status:
        | "New"
        | "Ready to Process"
        | "Processed"
        | "NOT FOUND"
        | "Ready for AI Personalization"
        | "Invalid Email"
      career_level: "entry_mid" | "senior_management" | "director_vp_c_level"
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
      resume_product_status: "pending" | "complete" | "cancelled" | "failed"
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
      application_status: [
        "saved",
        "applied",
        "interviewing",
        "rejected",
        "ghosted",
      ],
      bd_leads_status: [
        "New",
        "Ready to Process",
        "Processed",
        "NOT FOUND",
        "Ready for AI Personalization",
        "Invalid Email",
      ],
      career_level: ["entry_mid", "senior_management", "director_vp_c_level"],
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
      resume_product_status: ["pending", "complete", "cancelled", "failed"],
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
