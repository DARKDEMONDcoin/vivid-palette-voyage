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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_mailboxes: {
        Row: {
          agent_id: string
          connection_id: string
          workspace_id: string
        }
        Insert: {
          agent_id: string
          connection_id: string
          workspace_id: string
        }
        Update: {
          agent_id?: string
          connection_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_mailboxes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_mailboxes_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "app_user_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_mailboxes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          avatar_path: string | null
          bio: string | null
          created_at: string
          created_by: string
          daily_send_cap: number
          icp_company_sizes: string[]
          icp_industries: string[]
          icp_seniorities: string[]
          icp_titles: string[]
          id: string
          mailbox_email: string | null
          mailbox_last_tested_at: string | null
          mailbox_provider: string | null
          mailbox_status: string
          min_delay_seconds: number
          name: string
          organization_id: string
          send_days: number[]
          send_end_hour: number
          send_start_hour: number
          send_timezone: string
          signature: string | null
          status: string
          target_markets: string[]
          tone: string
          updated_at: string
          warmup_enabled: boolean
          warmup_increment: number
          warmup_start_cap: number
          workspace_id: string
        }
        Insert: {
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          created_by?: string
          daily_send_cap?: number
          icp_company_sizes?: string[]
          icp_industries?: string[]
          icp_seniorities?: string[]
          icp_titles?: string[]
          id?: string
          mailbox_email?: string | null
          mailbox_last_tested_at?: string | null
          mailbox_provider?: string | null
          mailbox_status?: string
          min_delay_seconds?: number
          name: string
          organization_id: string
          send_days?: number[]
          send_end_hour?: number
          send_start_hour?: number
          send_timezone?: string
          signature?: string | null
          status?: string
          target_markets?: string[]
          tone?: string
          updated_at?: string
          warmup_enabled?: boolean
          warmup_increment?: number
          warmup_start_cap?: number
          workspace_id: string
        }
        Update: {
          avatar_path?: string | null
          bio?: string | null
          created_at?: string
          created_by?: string
          daily_send_cap?: number
          icp_company_sizes?: string[]
          icp_industries?: string[]
          icp_seniorities?: string[]
          icp_titles?: string[]
          id?: string
          mailbox_email?: string | null
          mailbox_last_tested_at?: string | null
          mailbox_provider?: string | null
          mailbox_status?: string
          min_delay_seconds?: number
          name?: string
          organization_id?: string
          send_days?: number[]
          send_end_hour?: number
          send_start_hour?: number
          send_timezone?: string
          signature?: string | null
          status?: string
          target_markets?: string[]
          tone?: string
          updated_at?: string
          warmup_enabled?: boolean
          warmup_increment?: number
          warmup_start_cap?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          email: string
          id: string
          reconnect_required: boolean
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          email: string
          id?: string
          reconnect_required?: boolean
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          email?: string
          id?: string
          reconnect_required?: boolean
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_user_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          details: Json
          entity: string
          entity_id: string | null
          id: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          details?: Json
          entity: string
          entity_id?: string | null
          id?: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          details?: Json
          entity?: string
          entity_id?: string | null
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_leads: {
        Row: {
          campaign_id: string
          created_at: string
          decision: string
          decision_overridden: boolean
          id: string
          lead_id: string
          qualify_error: string | null
          reasoning: string | null
          research: Json | null
          research_error: string | null
          research_status: string
          score: number | null
          signals: Json
          status: string
          workspace_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          decision?: string
          decision_overridden?: boolean
          id?: string
          lead_id: string
          qualify_error?: string | null
          reasoning?: string | null
          research?: Json | null
          research_error?: string | null
          research_status?: string
          score?: number | null
          signals?: Json
          status?: string
          workspace_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          decision?: string
          decision_overridden?: boolean
          id?: string
          lead_id?: string
          qualify_error?: string | null
          reasoning?: string | null
          research?: Json | null
          research_error?: string | null
          research_status?: string
          score?: number | null
          signals?: Json
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_steps: {
        Row: {
          campaign_id: string
          channel: string
          created_at: string
          delay_days: number
          id: string
          instructions: string | null
          linkedin_action: string | null
          step_order: number
          workspace_id: string
        }
        Insert: {
          campaign_id: string
          channel: string
          created_at?: string
          delay_days?: number
          id?: string
          instructions?: string | null
          linkedin_action?: string | null
          step_order: number
          workspace_id: string
        }
        Update: {
          campaign_id?: string
          channel?: string
          created_at?: string
          delay_days?: number
          id?: string
          instructions?: string | null
          linkedin_action?: string | null
          step_order?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_steps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ab_testing: boolean
          agent_id: string
          created_at: string
          created_by: string
          id: string
          language: string
          name: string
          organization_id: string
          qualification_threshold: number
          qualification_weights: Json
          source_config: Json
          source_type: string | null
          status: string
          updated_at: string
          wizard_step: number
          workspace_id: string
        }
        Insert: {
          ab_testing?: boolean
          agent_id: string
          created_at?: string
          created_by?: string
          id?: string
          language?: string
          name: string
          organization_id: string
          qualification_threshold?: number
          qualification_weights?: Json
          source_config?: Json
          source_type?: string | null
          status?: string
          updated_at?: string
          wizard_step?: number
          workspace_id: string
        }
        Update: {
          ab_testing?: boolean
          agent_id?: string
          created_at?: string
          created_by?: string
          id?: string
          language?: string
          name?: string
          organization_id?: string
          qualification_threshold?: number
          qualification_weights?: Json
          source_config?: Json
          source_type?: string | null
          status?: string
          updated_at?: string
          wizard_step?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_credit_packages: {
        Row: {
          bonus_credits: number
          created_at: string
          credits: number
          display_order: number
          id: string
          is_active: boolean
          is_popular: boolean
          name: string
          price_usd: number
          updated_at: string
        }
        Insert: {
          bonus_credits?: number
          created_at?: string
          credits: number
          display_order?: number
          id?: string
          is_active?: boolean
          is_popular?: boolean
          name: string
          price_usd: number
          updated_at?: string
        }
        Update: {
          bonus_credits?: number
          created_at?: string
          credits?: number
          display_order?: number
          id?: string
          is_active?: boolean
          is_popular?: boolean
          name?: string
          price_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      ct_credit_rates: {
        Row: {
          credits_per_word: number
          description: string | null
          id: string
          label: string
          updated_at: string
          workflow_type: string
        }
        Insert: {
          credits_per_word: number
          description?: string | null
          id?: string
          label: string
          updated_at?: string
          workflow_type: string
        }
        Update: {
          credits_per_word?: number
          description?: string | null
          id?: string
          label?: string
          updated_at?: string
          workflow_type?: string
        }
        Relationships: []
      }
      ct_credit_transactions: {
        Row: {
          amount: number
          breakdown_json: Json | null
          created_at: string
          description: string | null
          id: string
          organization_id: string
          related_project_id: string | null
          stripe_payment_intent_id: string | null
          type: string
        }
        Insert: {
          amount: number
          breakdown_json?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          organization_id: string
          related_project_id?: string | null
          stripe_payment_intent_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          breakdown_json?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string
          related_project_id?: string | null
          stripe_payment_intent_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_credit_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "ct_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_credit_transactions_related_project_id_fkey"
            columns: ["related_project_id"]
            isOneToOne: false
            referencedRelation: "ct_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_documents: {
        Row: {
          created_at: string
          detected_doc_type: string | null
          detected_language: string | null
          file_type: string
          id: string
          layout_html: string | null
          original_file_url: string
          original_filename: string
          processing_status: string
          project_id: string
          structured_data: Json | null
          translated_file_url: string | null
          word_count: number
        }
        Insert: {
          created_at?: string
          detected_doc_type?: string | null
          detected_language?: string | null
          file_type: string
          id?: string
          layout_html?: string | null
          original_file_url: string
          original_filename: string
          processing_status?: string
          project_id: string
          structured_data?: Json | null
          translated_file_url?: string | null
          word_count?: number
        }
        Update: {
          created_at?: string
          detected_doc_type?: string | null
          detected_language?: string | null
          file_type?: string
          id?: string
          layout_html?: string | null
          original_file_url?: string
          original_filename?: string
          processing_status?: string
          project_id?: string
          structured_data?: Json | null
          translated_file_url?: string | null
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "ct_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ct_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_in_app_notifications: {
        Row: {
          body: string
          created_at: string
          event_key: string
          id: string
          is_read: boolean
          link: string | null
          priority: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          event_key: string
          id?: string
          is_read?: boolean
          link?: string | null
          priority?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          event_key?: string
          id?: string
          is_read?: boolean
          link?: string | null
          priority?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      ct_jobs: {
        Row: {
          accepted_at: string | null
          audit_report_url: string | null
          breakdown_json: Json | null
          business_share: number | null
          completed_at: string | null
          created_at: string
          exclusive_until: string | null
          id: string
          linguist_id: string | null
          linguist_source: string
          payout_amount: number | null
          project_id: string
          source_language: string
          status: string
          target_language: string
          word_count: number
        }
        Insert: {
          accepted_at?: string | null
          audit_report_url?: string | null
          breakdown_json?: Json | null
          business_share?: number | null
          completed_at?: string | null
          created_at?: string
          exclusive_until?: string | null
          id?: string
          linguist_id?: string | null
          linguist_source?: string
          payout_amount?: number | null
          project_id: string
          source_language: string
          status?: string
          target_language: string
          word_count?: number
        }
        Update: {
          accepted_at?: string | null
          audit_report_url?: string | null
          breakdown_json?: Json | null
          business_share?: number | null
          completed_at?: string | null
          created_at?: string
          exclusive_until?: string | null
          id?: string
          linguist_id?: string | null
          linguist_source?: string
          payout_amount?: number | null
          project_id?: string
          source_language?: string
          status?: string
          target_language?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "ct_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "ct_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_organizations: {
        Row: {
          company_bio: string | null
          created_at: string
          credit_balance: number
          credits_reset_at: string | null
          id: string
          industry: string | null
          name: string
          plan: string
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          company_bio?: string | null
          created_at?: string
          credit_balance?: number
          credits_reset_at?: string | null
          id?: string
          industry?: string | null
          name: string
          plan?: string
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          company_bio?: string | null
          created_at?: string
          credit_balance?: number
          credits_reset_at?: string | null
          id?: string
          industry?: string | null
          name?: string
          plan?: string
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      ct_page_meta: {
        Row: {
          canonical: string | null
          description: string | null
          locale: string
          no_index: boolean
          og_description: string | null
          og_image: string | null
          og_title: string | null
          page_key: string
          title: string | null
          updated_at: string
        }
        Insert: {
          canonical?: string | null
          description?: string | null
          locale?: string
          no_index?: boolean
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          page_key: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          canonical?: string | null
          description?: string | null
          locale?: string
          no_index?: boolean
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          page_key?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ct_plan_config: {
        Row: {
          created_at: string
          credits_per_cycle: number
          cta_href: string
          cta_text: string
          description: string | null
          description_ar: string | null
          display_order: number
          features: string[]
          features_ar: string[]
          id: string
          is_active: boolean
          is_popular: boolean
          limits_json: Json | null
          name: string
          name_ar: string | null
          period: string
          price: number
          slug: string
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits_per_cycle?: number
          cta_href?: string
          cta_text?: string
          description?: string | null
          description_ar?: string | null
          display_order?: number
          features?: string[]
          features_ar?: string[]
          id?: string
          is_active?: boolean
          is_popular?: boolean
          limits_json?: Json | null
          name: string
          name_ar?: string | null
          period?: string
          price?: number
          slug: string
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits_per_cycle?: number
          cta_href?: string
          cta_text?: string
          description?: string | null
          description_ar?: string | null
          display_order?: number
          features?: string[]
          features_ar?: string[]
          id?: string
          is_active?: boolean
          is_popular?: boolean
          limits_json?: Json | null
          name?: string
          name_ar?: string | null
          period?: string
          price?: number
          slug?: string
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ct_plan_features: {
        Row: {
          enabled: boolean
          feature: string
          id: string
          plan_slug: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          feature: string
          id?: string
          plan_slug: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          feature?: string
          id?: string
          plan_slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      ct_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          name: string | null
          organization_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          name?: string | null
          organization_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          name?: string | null
          organization_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "ct_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_projects: {
        Row: {
          attached_glossary_ids: string[]
          attached_style_guide_ids: string[]
          attached_tm_ids: string[]
          client_id: string
          created_at: string
          due_date: string | null
          id: string
          name: string
          notes: string | null
          ocr_confidence_warning: boolean
          organization_id: string
          source_language: string
          status: string
          target_languages: string[]
          total_word_count: number
          updated_at: string
          workflow_type: string
        }
        Insert: {
          attached_glossary_ids?: string[]
          attached_style_guide_ids?: string[]
          attached_tm_ids?: string[]
          client_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          name: string
          notes?: string | null
          ocr_confidence_warning?: boolean
          organization_id: string
          source_language: string
          status?: string
          target_languages?: string[]
          total_word_count?: number
          updated_at?: string
          workflow_type?: string
        }
        Update: {
          attached_glossary_ids?: string[]
          attached_style_guide_ids?: string[]
          attached_tm_ids?: string[]
          client_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          ocr_confidence_warning?: boolean
          organization_id?: string
          source_language?: string
          status?: string
          target_languages?: string[]
          total_word_count?: number
          updated_at?: string
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "ct_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_resource_articles: {
        Row: {
          audiences: string[]
          author_id: string | null
          body: string
          category_id: string | null
          content_type: string
          created_at: string
          excerpt: string | null
          featured: boolean
          icon: string | null
          id: string
          meta_description: string | null
          related_ids: string[]
          seo_title: string | null
          slug: string
          sort_order: number
          status: string
          subtitle: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          audiences?: string[]
          author_id?: string | null
          body?: string
          category_id?: string | null
          content_type?: string
          created_at?: string
          excerpt?: string | null
          featured?: boolean
          icon?: string | null
          id?: string
          meta_description?: string | null
          related_ids?: string[]
          seo_title?: string | null
          slug: string
          sort_order?: number
          status?: string
          subtitle?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          audiences?: string[]
          author_id?: string | null
          body?: string
          category_id?: string | null
          content_type?: string
          created_at?: string
          excerpt?: string | null
          featured?: boolean
          icon?: string | null
          id?: string
          meta_description?: string | null
          related_ids?: string[]
          seo_title?: string | null
          slug?: string
          sort_order?: number
          status?: string
          subtitle?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_resource_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ct_resource_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_resource_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_visible: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_visible?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_visible?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      ct_resource_faq_items: {
        Row: {
          answer: string
          audiences: string[]
          category_id: string | null
          created_at: string
          featured: boolean
          id: string
          question: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          answer: string
          audiences?: string[]
          category_id?: string | null
          created_at?: string
          featured?: boolean
          id?: string
          question: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          answer?: string
          audiences?: string[]
          category_id?: string | null
          created_at?: string
          featured?: boolean
          id?: string
          question?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_resource_faq_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ct_resource_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_site_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      ct_user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["ct_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["ct_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["ct_role"]
          user_id?: string
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          doc_type: string
          document_id: string
          embedding: string
          id: string
          organization_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          doc_type: string
          document_id: string
          embedding: string
          id?: string
          organization_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          doc_type?: string
          document_id?: string
          embedding?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          chunk_count: number
          created_at: string
          doc_type: string
          error: string | null
          file_name: string
          id: string
          indexed_at: string | null
          mime_type: string | null
          organization_id: string
          size_bytes: number
          status: string
          storage_path: string
          uploaded_by: string
          workspace_id: string
        }
        Insert: {
          chunk_count?: number
          created_at?: string
          doc_type: string
          error?: string | null
          file_name: string
          id?: string
          indexed_at?: string | null
          mime_type?: string | null
          organization_id: string
          size_bytes?: number
          status?: string
          storage_path: string
          uploaded_by?: string
          workspace_id: string
        }
        Update: {
          chunk_count?: number
          created_at?: string
          doc_type?: string
          error?: string | null
          file_name?: string
          id?: string
          indexed_at?: string | null
          mime_type?: string | null
          organization_id?: string
          size_bytes?: number
          status?: string
          storage_path?: string
          uploaded_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_secrets: {
        Row: {
          integration_id: string
          secret: string
          updated_at: string
        }
        Insert: {
          integration_id: string
          secret: string
          updated_at?: string
        }
        Update: {
          integration_id?: string
          secret?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_secrets_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          id: string
          last_error: string | null
          last_tested_at: string | null
          provider: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          config?: Json
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          provider: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          config?: Json
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          apollo_id: string | null
          city: string | null
          company: string | null
          company_domain: string | null
          company_size: string | null
          country: string | null
          created_at: string
          created_by: string
          email: string | null
          extra: Json
          first_name: string | null
          id: string
          industry: string | null
          language: string | null
          last_name: string | null
          linkedin_url: string | null
          phone: string | null
          seniority: string | null
          source: string
          title: string | null
          website: string | null
          workspace_id: string
        }
        Insert: {
          apollo_id?: string | null
          city?: string | null
          company?: string | null
          company_domain?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          extra?: Json
          first_name?: string | null
          id?: string
          industry?: string | null
          language?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          phone?: string | null
          seniority?: string | null
          source?: string
          title?: string | null
          website?: string | null
          workspace_id: string
        }
        Update: {
          apollo_id?: string | null
          city?: string | null
          company?: string | null
          company_domain?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          extra?: Json
          first_name?: string | null
          id?: string
          industry?: string | null
          language?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          phone?: string | null
          seniority?: string | null
          source?: string
          title?: string | null
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_actions: {
        Row: {
          action: string
          content: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          lead_id: string
          message_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          action: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          lead_id: string
          message_id?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          action?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          lead_id?: string
          message_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: []
      }
      mailbox_oauth_attempts: {
        Row: {
          agent_id: string
          connector_id: string
          expires_at: string
          id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          agent_id: string
          connector_id: string
          expires_at?: string
          id?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          agent_id?: string
          connector_id?: string
          expires_at?: string
          id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailbox_oauth_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailbox_oauth_attempts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string
          campaign_id: string
          campaign_lead_id: string
          channel: string
          created_at: string
          error: string | null
          id: string
          linkedin_action: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          step_id: string
          step_order: number
          subject: string | null
          variant: string
          workspace_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body: string
          campaign_id: string
          campaign_lead_id: string
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          linkedin_action?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          step_id: string
          step_order: number
          subject?: string | null
          variant?: string
          workspace_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          campaign_id?: string
          campaign_lead_id?: string
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          linkedin_action?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          step_id?: string
          step_order?: number
          subject?: string | null
          variant?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_campaign_lead_id_fkey"
            columns: ["campaign_lead_id"]
            isOneToOne: false
            referencedRelation: "campaign_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "campaign_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          approvals_waiting: boolean
          campaign_finished: boolean
          email_enabled: boolean
          mailbox_error: boolean
          sql_found: boolean
          user_id: string
          workspace_id: string
        }
        Insert: {
          approvals_waiting?: boolean
          campaign_finished?: boolean
          email_enabled?: boolean
          mailbox_error?: boolean
          sql_found?: boolean
          user_id: string
          workspace_id: string
        }
        Update: {
          approvals_waiting?: boolean
          campaign_finished?: boolean
          email_enabled?: boolean
          mailbox_error?: boolean
          sql_found?: boolean
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_access: {
        Row: {
          created_at: string
          granted_by: string
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          industry: string | null
          languages: string[]
          logo_path: string | null
          name: string
          signature: string | null
          summary: Json | null
          summary_approved_at: string | null
          summary_approved_by: string | null
          summary_status: string
          website: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          industry?: string | null
          languages?: string[]
          logo_path?: string | null
          name: string
          signature?: string | null
          summary?: Json | null
          summary_approved_at?: string | null
          summary_approved_by?: string | null
          summary_status?: string
          website?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          industry?: string | null
          languages?: string[]
          logo_path?: string | null
          name?: string
          signature?: string | null
          summary?: Json | null
          summary_approved_at?: string | null
          summary_approved_by?: string | null
          summary_status?: string
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      replies: {
        Row: {
          body: string
          campaign_id: string
          campaign_lead_id: string
          channel: string
          classification: string | null
          created_at: string
          created_by: string | null
          crm_error: string | null
          freshsales_id: string | null
          handled: boolean
          id: string
          is_sql: boolean
          summary: string | null
          workspace_id: string
        }
        Insert: {
          body: string
          campaign_id: string
          campaign_lead_id: string
          channel?: string
          classification?: string | null
          created_at?: string
          created_by?: string | null
          crm_error?: string | null
          freshsales_id?: string | null
          handled?: boolean
          id?: string
          is_sql?: boolean
          summary?: string | null
          workspace_id: string
        }
        Update: {
          body?: string
          campaign_id?: string
          campaign_lead_id?: string
          channel?: string
          classification?: string | null
          created_at?: string
          created_by?: string | null
          crm_error?: string | null
          freshsales_id?: string | null
          handled?: boolean
          id?: string
          is_sql?: boolean
          summary?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replies_campaign_lead_id_fkey"
            columns: ["campaign_lead_id"]
            isOneToOne: false
            referencedRelation: "campaign_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      suppression_list: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          organization_id: string | null
          reason: string | null
          value: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          organization_id?: string | null
          reason?: string | null
          value: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          organization_id?: string | null
          reason?: string | null
          value?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppression_list_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppression_list_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          events: string[]
          id: string
          last_error: string | null
          last_sent_at: string | null
          last_status: number | null
          secret: string
          url: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          events?: string[]
          id?: string
          last_error?: string | null
          last_sent_at?: string | null
          last_status?: number | null
          secret: string
          url: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          events?: string[]
          id?: string
          last_error?: string | null
          last_sent_at?: string | null
          last_status?: number | null
          secret?: string
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["app_role"]
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["app_role"]
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["app_role"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          active: boolean
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          cooldown_days: number
          created_at: string
          created_by: string
          id: string
          is_demo: boolean
          name: string
          outreach_paused: boolean
        }
        Insert: {
          cooldown_days?: number
          created_at?: string
          created_by: string
          id?: string
          is_demo?: boolean
          name: string
          outreach_paused?: boolean
        }
        Update: {
          cooldown_days?: number
          created_at?: string
          created_by?: string
          id?: string
          is_demo?: boolean
          name?: string
          outreach_paused?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_campaign: { Args: { _c: string }; Returns: boolean }
      can_access_org: { Args: { _org: string }; Returns: boolean }
      can_edit_campaign: { Args: { _c: string }; Returns: boolean }
      can_edit_org: { Args: { _org: string }; Returns: boolean }
      create_workspace: { Args: { _name: string }; Returns: string }
      ct_has_role: {
        Args: {
          _role: Database["public"]["Enums"]["ct_role"]
          _user_id: string
        }
        Returns: boolean
      }
      ct_user_org: { Args: { _uid: string }; Returns: string }
      has_ws_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"]; _ws: string }
        Returns: boolean
      }
      is_member: { Args: { _ws: string }; Returns: boolean }
      match_org_chunks: {
        Args: { _org: string; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          doc_type: string
          document_id: string
          id: string
          similarity: number
        }[]
      }
      notify_ws: {
        Args: { _kind: string; _link: string; _title: string; _ws: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "super_admin" | "standard" | "viewer"
      ct_role: "CLIENT" | "LINGUIST" | "ADMIN"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["super_admin", "standard", "viewer"],
      ct_role: ["CLIENT", "LINGUIST", "ADMIN"],
    },
  },
} as const
