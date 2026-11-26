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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      accessories: {
        Row: {
          brand: string | null
          category: string
          cost_price: number
          created_at: string
          created_by: string
          description: string | null
          id: string
          min_quantity: number
          name: string
          quantity: number
          sale_price: number | null
          store_id: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category?: string
          cost_price?: number
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          min_quantity?: number
          name: string
          quantity?: number
          sale_price?: number | null
          store_id: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category?: string
          cost_price?: number
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          min_quantity?: number
          name?: string
          quantity?: number
          sale_price?: number | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accessories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          store_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          store_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          store_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_closures: {
        Row: {
          cash_register_id: string
          closed_at: string
          created_at: string
          difference: number
          id: string
          notes: string | null
          opened_at: string
          reported_cash: number
          status: string
          store_id: string
          system_cash: number
          user_id: string
        }
        Insert: {
          cash_register_id: string
          closed_at?: string
          created_at?: string
          difference: number
          id?: string
          notes?: string | null
          opened_at: string
          reported_cash: number
          status?: string
          store_id: string
          system_cash: number
          user_id: string
        }
        Update: {
          cash_register_id?: string
          closed_at?: string
          created_at?: string
          difference?: number
          id?: string
          notes?: string | null
          opened_at?: string
          reported_cash?: number
          status?: string
          store_id?: string
          system_cash?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_closures_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closures_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_entries: {
        Row: {
          amount: number
          cash_register_id: string
          confirmed: boolean | null
          created_at: string
          created_by: string
          description: string
          id: string
          payment_method: string | null
          receipt_required: boolean
          receipt_url: string | null
          reference_id: string | null
          reference_type: string | null
          store_id: string
          supplier_order_receipt_url: string | null
          type: string
        }
        Insert: {
          amount: number
          cash_register_id: string
          confirmed?: boolean | null
          created_at?: string
          created_by: string
          description: string
          id?: string
          payment_method?: string | null
          receipt_required?: boolean
          receipt_url?: string | null
          reference_id?: string | null
          reference_type?: string | null
          store_id: string
          supplier_order_receipt_url?: string | null
          type: string
        }
        Update: {
          amount?: number
          cash_register_id?: string
          confirmed?: boolean | null
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          payment_method?: string | null
          receipt_required?: boolean
          receipt_url?: string | null
          reference_id?: string | null
          reference_type?: string | null
          store_id?: string
          supplier_order_receipt_url?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_entries_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_amount: number | null
          closing_note: string | null
          closing_receipt_url: string | null
          difference: number | null
          difference_reason: string | null
          expected_amount: number | null
          id: string
          opened_at: string
          opened_by: string
          opening_amount: number
          opening_note: string | null
          opening_receipt_url: string | null
          status: string
          store_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          closing_note?: string | null
          closing_receipt_url?: string | null
          difference?: number | null
          difference_reason?: string | null
          expected_amount?: number | null
          id?: string
          opened_at?: string
          opened_by: string
          opening_amount?: number
          opening_note?: string | null
          opening_receipt_url?: string | null
          status?: string
          store_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          closing_note?: string | null
          closing_receipt_url?: string | null
          difference?: number | null
          difference_reason?: string | null
          expected_amount?: number | null
          id?: string
          opened_at?: string
          opened_by?: string
          opening_amount?: number
          opening_note?: string | null
          opening_receipt_url?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_settlement_items: {
        Row: {
          commission_amount: number
          commission_percent: number
          cost_amount: number | null
          created_at: string
          gross_amount: number
          id: string
          item_type: string
          profit_amount: number | null
          sale_id: string | null
          service_order_id: string | null
          settlement_id: string
        }
        Insert: {
          commission_amount: number
          commission_percent: number
          cost_amount?: number | null
          created_at?: string
          gross_amount: number
          id?: string
          item_type: string
          profit_amount?: number | null
          sale_id?: string | null
          service_order_id?: string | null
          settlement_id: string
        }
        Update: {
          commission_amount?: number
          commission_percent?: number
          cost_amount?: number | null
          created_at?: string
          gross_amount?: number
          id?: string
          item_type?: string
          profit_amount?: number | null
          sale_id?: string | null
          service_order_id?: string | null
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_settlement_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlement_items_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "commission_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_settlements: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_items_snapshot: Json | null
          cash_entry_id: string | null
          cash_register_id: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          paid_at: string
          payment_method: string
          period_end: string
          period_start: string
          receipt_url: string | null
          source_account_id: string | null
          source_type: string
          status: string
          store_id: string
          total_amount: number
          total_sales_commission: number
          total_service_commission: number
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_items_snapshot?: Json | null
          cash_entry_id?: string | null
          cash_register_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_method: string
          period_end: string
          period_start: string
          receipt_url?: string | null
          source_account_id?: string | null
          source_type: string
          status?: string
          store_id: string
          total_amount: number
          total_sales_commission?: number
          total_service_commission?: number
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_items_snapshot?: Json | null
          cash_entry_id?: string | null
          cash_register_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_method?: string
          period_end?: string
          period_start?: string
          receipt_url?: string | null
          source_account_id?: string | null
          source_type?: string
          status?: string
          store_id?: string
          total_amount?: number
          total_sales_commission?: number
          total_service_commission?: number
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_settlements_cash_entry_id_fkey"
            columns: ["cash_entry_id"]
            isOneToOne: false
            referencedRelation: "cash_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlements_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlements_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "store_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          actor_id: string | null
          actor_kind: string
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          deal_id: string | null
          id: string
          payload: Json
          store_id: string
          type: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          payload?: Json
          store_id: string
          type: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          payload?: Json
          store_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "crm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_ad_codes: {
        Row: {
          active: boolean
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string
          code: string
          created_at: string
          created_by: string | null
          id: string
          level: string
          store_id: string
        }
        Insert: {
          active?: boolean
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name: string
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          level?: string
          store_id: string
        }
        Update: {
          active?: boolean
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          level?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_ad_codes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_ad_insights: {
        Row: {
          ad_id: string
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          clicks: number
          conversations: number
          date: string
          impressions: number
          spend: number
          store_id: string
          updated_at: string
        }
        Insert: {
          ad_id: string
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          clicks?: number
          conversations?: number
          date: string
          impressions?: number
          spend?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          ad_id?: string
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          clicks?: number
          conversations?: number
          date?: string
          impressions?: number
          spend?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_ad_insights_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_ai_examples: {
        Row: {
          answer: string
          conversation_ref: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          has_price: boolean | null
          id: string
          kind: string
          question: string | null
          source: string
          status: string
          store_id: string
          topic: string | null
          uses: number
        }
        Insert: {
          answer: string
          conversation_ref?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          has_price?: boolean | null
          id?: string
          kind?: string
          question?: string | null
          source?: string
          status?: string
          store_id: string
          topic?: string | null
          uses?: number
        }
        Update: {
          answer?: string
          conversation_ref?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          has_price?: boolean | null
          id?: string
          kind?: string
          question?: string | null
          source?: string
          status?: string
          store_id?: string
          topic?: string | null
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_ai_examples_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_ai_learning_jobs: {
        Row: {
          chats: Json
          created_at: string
          cursor: number
          error: string | null
          examples: number
          facts: number
          finished_at: string | null
          heartbeat_at: string
          id: string
          knowledge_draft: string | null
          months: number
          processed: number
          skipped: number
          started_by: string | null
          status: string
          store_id: string
          total: number
        }
        Insert: {
          chats?: Json
          created_at?: string
          cursor?: number
          error?: string | null
          examples?: number
          facts?: number
          finished_at?: string | null
          heartbeat_at?: string
          id?: string
          knowledge_draft?: string | null
          months?: number
          processed?: number
          skipped?: number
          started_by?: string | null
          status?: string
          store_id: string
          total?: number
        }
        Update: {
          chats?: Json
          created_at?: string
          cursor?: number
          error?: string | null
          examples?: number
          facts?: number
          finished_at?: string | null
          heartbeat_at?: string
          id?: string
          knowledge_draft?: string | null
          months?: number
          processed?: number
          skipped?: number
          started_by?: string | null
          status?: string
          store_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_ai_learning_jobs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_ai_runs: {
        Row: {
          conversation_id: string | null
          created_at: string
          decision: string | null
          error: string | null
          id: string
          input: Json | null
          latency_ms: number | null
          model: string | null
          output: Json | null
          store_id: string
          trigger_message_id: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          decision?: string | null
          error?: string | null
          id?: string
          input?: Json | null
          latency_ms?: number | null
          model?: string | null
          output?: Json | null
          store_id: string
          trigger_message_id?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          decision?: string | null
          error?: string | null
          id?: string
          input?: Json | null
          latency_ms?: number | null
          model?: string | null
          output?: Json | null
          store_id?: string
          trigger_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_ai_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "crm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_ai_runs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_ai_runs_trigger_message_id_fkey"
            columns: ["trigger_message_id"]
            isOneToOne: false
            referencedRelation: "crm_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_ai_settings: {
        Row: {
          business_hours: Json | null
          collect_fields: Json
          enabled_channels: string[]
          handoff_message: string | null
          knowledge: string | null
          max_replies_per_day: number
          max_turns: number
          mode: string
          model: string | null
          persona: string | null
          stock_lookup: boolean
          store_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_hours?: Json | null
          collect_fields?: Json
          enabled_channels?: string[]
          handoff_message?: string | null
          knowledge?: string | null
          max_replies_per_day?: number
          max_turns?: number
          mode?: string
          model?: string | null
          persona?: string | null
          stock_lookup?: boolean
          store_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_hours?: Json | null
          collect_fields?: Json
          enabled_channels?: string[]
          handoff_message?: string | null
          knowledge?: string | null
          max_replies_per_day?: number
          max_turns?: number
          mode?: string
          model?: string | null
          persona?: string | null
          stock_lookup?: boolean
          store_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_ai_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_ai_suggestions: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          edited: boolean | null
          final_body: string | null
          id: string
          kind: string
          run_id: string | null
          status: string
          store_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          edited?: boolean | null
          final_body?: string | null
          id?: string
          kind?: string
          run_id?: string | null
          status?: string
          store_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          edited?: boolean | null
          final_body?: string | null
          id?: string
          kind?: string
          run_id?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_ai_suggestions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "crm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_ai_suggestions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "crm_ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_ai_suggestions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_attributions: {
        Row: {
          ad_code: string | null
          ad_id: string | null
          ad_source_id: string | null
          ad_source_url: string | null
          ad_title: string | null
          adset_id: string | null
          campaign_id: string | null
          click_id: string | null
          contact_id: string
          created_at: string
          ctwa_clid: string | null
          entry_app: string | null
          entry_point: string | null
          fbc: string | null
          id: string
          ip: string | null
          kind: string
          store_id: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          ad_code?: string | null
          ad_id?: string | null
          ad_source_id?: string | null
          ad_source_url?: string | null
          ad_title?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          click_id?: string | null
          contact_id: string
          created_at?: string
          ctwa_clid?: string | null
          entry_app?: string | null
          entry_point?: string | null
          fbc?: string | null
          id?: string
          ip?: string | null
          kind: string
          store_id: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          ad_code?: string | null
          ad_id?: string | null
          ad_source_id?: string | null
          ad_source_url?: string | null
          ad_title?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          click_id?: string | null
          contact_id?: string
          created_at?: string
          ctwa_clid?: string | null
          entry_app?: string | null
          entry_point?: string | null
          fbc?: string | null
          id?: string
          ip?: string | null
          kind?: string
          store_id?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_attributions_click_id_fkey"
            columns: ["click_id"]
            isOneToOne: false
            referencedRelation: "crm_track_clicks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_attributions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_attributions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_automation_settings: {
        Row: {
          dispatch_enabled: boolean
          dispatch_minutes: number
          dispatch_owner_id: string | null
          ig_first_message: string
          ig_followup_hours: number
          os_ready: boolean
          os_sync: boolean
          review_after_days: number | null
          round_robin: boolean
          round_robin_cursor: number
          round_robin_members: string[]
          service_cursor: number
          service_members: string[]
          stale_deals: boolean
          store_id: string
          unanswered_minutes: number | null
          updated_at: string
          updated_by: string | null
          warranty_alert_days: number | null
        }
        Insert: {
          dispatch_enabled?: boolean
          dispatch_minutes?: number
          dispatch_owner_id?: string | null
          ig_first_message?: string
          ig_followup_hours?: number
          os_ready?: boolean
          os_sync?: boolean
          review_after_days?: number | null
          round_robin?: boolean
          round_robin_cursor?: number
          round_robin_members?: string[]
          service_cursor?: number
          service_members?: string[]
          stale_deals?: boolean
          store_id: string
          unanswered_minutes?: number | null
          updated_at?: string
          updated_by?: string | null
          warranty_alert_days?: number | null
        }
        Update: {
          dispatch_enabled?: boolean
          dispatch_minutes?: number
          dispatch_owner_id?: string | null
          ig_first_message?: string
          ig_followup_hours?: number
          os_ready?: boolean
          os_sync?: boolean
          review_after_days?: number | null
          round_robin?: boolean
          round_robin_cursor?: number
          round_robin_members?: string[]
          service_cursor?: number
          service_members?: string[]
          stale_deals?: boolean
          store_id?: string
          unanswered_minutes?: number | null
          updated_at?: string
          updated_by?: string | null
          warranty_alert_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_automation_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_campaign_spend: {
        Row: {
          amount: number
          campaign: string
          created_at: string
          created_by: string | null
          id: string
          period_end: string
          period_start: string
          store_id: string
        }
        Insert: {
          amount: number
          campaign: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_end: string
          period_start: string
          store_id: string
        }
        Update: {
          amount?: number
          campaign?: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_end?: string
          period_start?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_campaign_spend_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_channel_secrets: {
        Row: {
          channel: string
          secrets: Json
          store_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          secrets?: Json
          store_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          secrets?: Json
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_channel_secrets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          ai_summary: string | null
          ai_summary_at: string | null
          ai_tagged_at: string | null
          attribution_id: string | null
          avatar_checked_at: string | null
          avatar_url: string | null
          created_at: string
          customer_id: string | null
          email: string | null
          handoff_code: string | null
          id: string
          ignored: boolean
          ignored_reason: string | null
          instagram_user_id: string | null
          instagram_username: string | null
          lead_kind: string | null
          legacy_lead_ids: string[]
          name: string
          notes: string | null
          origin_channel: string
          owner_id: string | null
          phone: string | null
          phone_key: string | null
          store_id: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          ai_summary_at?: string | null
          ai_tagged_at?: string | null
          attribution_id?: string | null
          avatar_checked_at?: string | null
          avatar_url?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          handoff_code?: string | null
          id?: string
          ignored?: boolean
          ignored_reason?: string | null
          instagram_user_id?: string | null
          instagram_username?: string | null
          lead_kind?: string | null
          legacy_lead_ids?: string[]
          name?: string
          notes?: string | null
          origin_channel?: string
          owner_id?: string | null
          phone?: string | null
          phone_key?: string | null
          store_id: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          ai_summary_at?: string | null
          ai_tagged_at?: string | null
          attribution_id?: string | null
          avatar_checked_at?: string | null
          avatar_url?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          handoff_code?: string | null
          id?: string
          ignored?: boolean
          ignored_reason?: string | null
          instagram_user_id?: string | null
          instagram_username?: string | null
          lead_kind?: string | null
          legacy_lead_ids?: string[]
          name?: string
          notes?: string | null
          origin_channel?: string
          owner_id?: string | null
          phone?: string | null
          phone_key?: string | null
          store_id?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "crm_attributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_conversations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          ai_paused_until: string | null
          assigned_to: string | null
          channel: string
          contact_id: string
          created_at: string
          external_thread_id: string | null
          first_response_at: string | null
          handler: string
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_direction: string | null
          last_message_preview: string | null
          push_notified_at: string | null
          status: string
          store_id: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          ai_paused_until?: string | null
          assigned_to?: string | null
          channel: string
          contact_id: string
          created_at?: string
          external_thread_id?: string | null
          first_response_at?: string | null
          handler?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_preview?: string | null
          push_notified_at?: string | null
          status?: string
          store_id: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          ai_paused_until?: string | null
          assigned_to?: string | null
          channel?: string
          contact_id?: string
          created_at?: string
          external_thread_id?: string | null
          first_response_at?: string | null
          handler?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_preview?: string | null
          push_notified_at?: string | null
          status?: string
          store_id?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_conversations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deals: {
        Row: {
          ai_score: string | null
          ai_summary: string | null
          auto_created: boolean
          contact_id: string
          created_at: string
          created_by: string | null
          expected_close_date: string | null
          handoff_completed_at: string | null
          handoff_sent_at: string | null
          id: string
          interest: string | null
          lost_at: string | null
          lost_reason: string | null
          origin_channel: string | null
          owner_id: string | null
          pipeline_id: string
          position: number
          sale_id: string | null
          service_order_id: string | null
          stage_entered_at: string
          stage_id: string
          status: string
          store_id: string
          title: string
          updated_at: string
          value: number
          won_at: string | null
        }
        Insert: {
          ai_score?: string | null
          ai_summary?: string | null
          auto_created?: boolean
          contact_id: string
          created_at?: string
          created_by?: string | null
          expected_close_date?: string | null
          handoff_completed_at?: string | null
          handoff_sent_at?: string | null
          id?: string
          interest?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          origin_channel?: string | null
          owner_id?: string | null
          pipeline_id: string
          position?: number
          sale_id?: string | null
          service_order_id?: string | null
          stage_entered_at?: string
          stage_id: string
          status?: string
          store_id: string
          title: string
          updated_at?: string
          value?: number
          won_at?: string | null
        }
        Update: {
          ai_score?: string | null
          ai_summary?: string | null
          auto_created?: boolean
          contact_id?: string
          created_at?: string
          created_by?: string | null
          expected_close_date?: string | null
          handoff_completed_at?: string | null
          handoff_sent_at?: string | null
          id?: string
          interest?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          origin_channel?: string | null
          owner_id?: string | null
          pipeline_id?: string
          position?: number
          sale_id?: string | null
          service_order_id?: string | null
          stage_entered_at?: string
          stage_id?: string
          status?: string
          store_id?: string
          title?: string
          updated_at?: string
          value?: number
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_dispatches: {
        Row: {
          conversation_id: string
          created_at: string
          cycle_id: string
          decided_at: string | null
          expires_at: string | null
          id: string
          notified_at: string | null
          notify_error: string | null
          notify_status: string | null
          offered_at: string | null
          queue: string | null
          status: string
          store_id: string
          user_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          cycle_id: string
          decided_at?: string | null
          expires_at?: string | null
          id?: string
          notified_at?: string | null
          notify_error?: string | null
          notify_status?: string | null
          offered_at?: string | null
          queue?: string | null
          status?: string
          store_id: string
          user_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          cycle_id?: string
          decided_at?: string | null
          expires_at?: string | null
          id?: string
          notified_at?: string | null
          notify_error?: string | null
          notify_status?: string | null
          offered_at?: string | null
          queue?: string | null
          status?: string
          store_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_dispatches_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "crm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_dispatches_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lid_map: {
        Row: {
          lid: string
          phone: string
          source: string
          store_id: string
          updated_at: string
        }
        Insert: {
          lid: string
          phone: string
          source?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          lid?: string
          phone?: string
          source?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_lid_map_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lid_pending: {
        Row: {
          attempts: number
          external_id: string | null
          from_me: boolean
          id: string
          last_error: string | null
          lid: string
          payload: Json
          push_name: string | null
          received_at: string
          resolved_at: string | null
          resolved_phone: string | null
          store_id: string
        }
        Insert: {
          attempts?: number
          external_id?: string | null
          from_me?: boolean
          id?: string
          last_error?: string | null
          lid: string
          payload: Json
          push_name?: string | null
          received_at?: string
          resolved_at?: string | null
          resolved_phone?: string | null
          store_id: string
        }
        Update: {
          attempts?: number
          external_id?: string | null
          from_me?: boolean
          id?: string
          last_error?: string | null
          lid?: string
          payload?: Json
          push_name?: string | null
          received_at?: string
          resolved_at?: string | null
          resolved_phone?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_lid_pending_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_messages: {
        Row: {
          body: string | null
          contact_id: string
          conversation_id: string
          created_at: string
          direction: string
          error: string | null
          external_id: string | null
          id: string
          inserted_at: string
          kind: string
          legacy_lead_message_id: string | null
          media_mime: string | null
          media_path: string | null
          media_url: string | null
          sender_kind: string
          sender_user_id: string | null
          status: string
          store_id: string
          transcript: string | null
          transcript_status: string | null
        }
        Insert: {
          body?: string | null
          contact_id: string
          conversation_id: string
          created_at?: string
          direction: string
          error?: string | null
          external_id?: string | null
          id?: string
          inserted_at?: string
          kind?: string
          legacy_lead_message_id?: string | null
          media_mime?: string | null
          media_path?: string | null
          media_url?: string | null
          sender_kind: string
          sender_user_id?: string | null
          status?: string
          store_id: string
          transcript?: string | null
          transcript_status?: string | null
        }
        Update: {
          body?: string | null
          contact_id?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          error?: string | null
          external_id?: string | null
          id?: string
          inserted_at?: string
          kind?: string
          legacy_lead_message_id?: string | null
          media_mime?: string | null
          media_path?: string | null
          media_url?: string | null
          sender_kind?: string
          sender_user_id?: string | null
          status?: string
          store_id?: string
          transcript?: string | null
          transcript_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "crm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_messages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_meta_events: {
        Row: {
          attempts: number
          attribution_id: string | null
          contact_id: string | null
          created_at: string
          deal_id: string | null
          error: string | null
          event_id: string
          event_name: string
          event_time: string
          format: string | null
          id: string
          next_attempt_at: string
          response: Json | null
          sent_at: string | null
          status: string
          store_id: string
          value: number | null
        }
        Insert: {
          attempts?: number
          attribution_id?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          error?: string | null
          event_id: string
          event_name: string
          event_time?: string
          format?: string | null
          id?: string
          next_attempt_at?: string
          response?: Json | null
          sent_at?: string | null
          status?: string
          store_id: string
          value?: number | null
        }
        Update: {
          attempts?: number
          attribution_id?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          error?: string | null
          event_id?: string
          event_name?: string
          event_time?: string
          format?: string | null
          id?: string
          next_attempt_at?: string
          response?: Json | null
          sent_at?: string | null
          status?: string
          store_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_meta_events_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "crm_attributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_meta_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_meta_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_meta_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_oauth_states: {
        Row: {
          created_at: string
          provider: string
          return_to: string
          state: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          provider?: string
          return_to: string
          state: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          provider?: string
          return_to?: string
          state?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_oauth_states_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipelines: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          is_default: boolean
          kind: string
          name: string
          position: number
          store_id: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          kind?: string
          name: string
          position?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          position?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipelines_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_ok_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_ok_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_ok_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      crm_quick_replies: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          shortcut: string
          store_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          shortcut: string
          store_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          shortcut?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_quick_replies_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_stages: {
        Row: {
          code: string | null
          color: string | null
          created_at: string
          hidden: boolean
          id: string
          kind: string
          name: string
          pipeline_id: string
          position: number
          sla_hours: number | null
          store_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          color?: string | null
          created_at?: string
          hidden?: boolean
          id?: string
          kind?: string
          name: string
          pipeline_id: string
          position?: number
          sla_hours?: number | null
          store_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          color?: string | null
          created_at?: string
          hidden?: boolean
          id?: string
          kind?: string
          name?: string
          pipeline_id?: string
          position?: number
          sla_hours?: number | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_stages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          store_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          store_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tags_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          assigned_to: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          dedupe_key: string | null
          done_at: string | null
          due_at: string | null
          id: string
          kind: string
          notes: string | null
          source: string
          store_id: string
          suggested_message: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          dedupe_key?: string | null
          done_at?: string | null
          due_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          source?: string
          store_id: string
          suggested_message?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          dedupe_key?: string | null
          done_at?: string | null
          due_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          source?: string
          store_id?: string
          suggested_message?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "crm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_track_clicks: {
        Row: {
          ad_id: string | null
          adset_id: string | null
          campaign_id: string | null
          code: string
          contact_id: string | null
          created_at: string
          fbc: string | null
          fbclid: string | null
          id: string
          ip: string | null
          link_id: string | null
          matched_at: string | null
          referer: string | null
          store_id: string
          user_agent: string | null
          utm: Json
        }
        Insert: {
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          code: string
          contact_id?: string | null
          created_at?: string
          fbc?: string | null
          fbclid?: string | null
          id?: string
          ip?: string | null
          link_id?: string | null
          matched_at?: string | null
          referer?: string | null
          store_id: string
          user_agent?: string | null
          utm?: Json
        }
        Update: {
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          code?: string
          contact_id?: string | null
          created_at?: string
          fbc?: string | null
          fbclid?: string | null
          id?: string
          ip?: string | null
          link_id?: string | null
          matched_at?: string | null
          referer?: string | null
          store_id?: string
          user_agent?: string | null
          utm?: Json
        }
        Relationships: [
          {
            foreignKeyName: "crm_track_clicks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_track_clicks_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "crm_track_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_track_clicks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_track_links: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          message: string
          name: string
          slug: string
          store_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          name: string
          slug: string
          store_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          name?: string
          slug?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_track_links_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tracking_settings: {
        Row: {
          ad_account_id: string | null
          dataset_id: string | null
          enabled: boolean
          insights_error: string | null
          insights_synced_at: string | null
          messaging_dataset_id: string | null
          only_attributed: boolean
          page_id: string | null
          qualified_event_name: string
          qualified_stage_codes: string[]
          send_lead: boolean
          send_purchase: boolean
          send_qualified: boolean
          store_id: string
          test_event_code: string | null
          updated_at: string
          updated_by: string | null
          waba_id: string | null
          whatsapp_number: string | null
        }
        Insert: {
          ad_account_id?: string | null
          dataset_id?: string | null
          enabled?: boolean
          insights_error?: string | null
          insights_synced_at?: string | null
          messaging_dataset_id?: string | null
          only_attributed?: boolean
          page_id?: string | null
          qualified_event_name?: string
          qualified_stage_codes?: string[]
          send_lead?: boolean
          send_purchase?: boolean
          send_qualified?: boolean
          store_id: string
          test_event_code?: string | null
          updated_at?: string
          updated_by?: string | null
          waba_id?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          ad_account_id?: string | null
          dataset_id?: string | null
          enabled?: boolean
          insights_error?: string | null
          insights_synced_at?: string | null
          messaging_dataset_id?: string | null
          only_attributed?: boolean
          page_id?: string | null
          qualified_event_name?: string
          qualified_stage_codes?: string[]
          send_lead?: boolean
          send_purchase?: boolean
          send_qualified?: boolean
          store_id?: string
          test_event_code?: string | null
          updated_at?: string
          updated_by?: string | null
          waba_id?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_tracking_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          birth_date: string | null
          cpf: string | null
          created_at: string
          created_by: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_expenses: {
        Row: {
          active: boolean | null
          amount: number
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string
          due_day: number | null
          id: string
          is_pf: boolean | null
          store_id: string | null
        }
        Insert: {
          active?: boolean | null
          amount: number
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description: string
          due_day?: number | null
          id?: string
          is_pf?: boolean | null
          store_id?: string | null
        }
        Update: {
          active?: boolean | null
          amount?: number
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          due_day?: number | null
          id?: string
          is_pf?: boolean | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_config: {
        Row: {
          created_at: string | null
          id: string
          ig_user_id: string | null
          ig_username: string | null
          instagram_business_account_id: string | null
          is_active: boolean | null
          page_access_token: string | null
          page_id: string | null
          store_id: string | null
          token_expires_at: string | null
          updated_at: string | null
          webhook_subscribed_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ig_user_id?: string | null
          ig_username?: string | null
          instagram_business_account_id?: string | null
          is_active?: boolean | null
          page_access_token?: string | null
          page_id?: string | null
          store_id?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          webhook_subscribed_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ig_user_id?: string | null
          ig_username?: string | null
          instagram_business_account_id?: string | null
          is_active?: boolean | null
          page_access_token?: string | null
          page_id?: string | null
          store_id?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          webhook_subscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_config_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_webhooks_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          payload: Json | null
          processed: boolean | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          processed?: boolean | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          processed?: boolean | null
        }
        Relationships: []
      }
      member_stores: {
        Row: {
          created_at: string | null
          id: string
          store_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          store_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          store_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_stores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      phonemanagerpro: {
        Row: {
          "--- STORES ---": string | null
        }
        Insert: {
          "--- STORES ---"?: string | null
        }
        Update: {
          "--- STORES ---"?: string | null
        }
        Relationships: []
      }
      product_history: {
        Row: {
          action: string
          created_at: string
          created_by: string
          id: string
          new_cost: number | null
          notes: string | null
          old_cost: number | null
          product_id: string
        }
        Insert: {
          action: string
          created_at?: string
          created_by: string
          id?: string
          new_cost?: number | null
          notes?: string | null
          old_cost?: number | null
          product_id: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string
          id?: string
          new_cost?: number | null
          notes?: string | null
          old_cost?: number | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_repair_items: {
        Row: {
          created_at: string
          id: string
          part_name: string
          part_product_id: string | null
          payment_voucher: string | null
          quantity: number
          repair_id: string
          supplier_id: string | null
          supplier_name: string | null
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          part_name: string
          part_product_id?: string | null
          payment_voucher?: string | null
          quantity?: number
          repair_id: string
          supplier_id?: string | null
          supplier_name?: string | null
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          part_name?: string
          part_product_id?: string | null
          payment_voucher?: string | null
          quantity?: number
          repair_id?: string
          supplier_id?: string | null
          supplier_name?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_repair_items_part_product_id_fkey"
            columns: ["part_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_repair_items_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "product_repairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_repair_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_repairs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          product_id: string
          repair_types: string[]
          status: string
          store_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          product_id: string
          repair_types: string[]
          status?: string
          store_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          product_id?: string
          repair_types?: string[]
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_repairs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_repairs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          battery_percentage: number | null
          brand: string
          capacity: string | null
          color: string | null
          condition: string | null
          cost_price: number
          created_at: string
          created_by: string
          defects: string[] | null
          device_payment_voucher: string | null
          id: string
          imei: string | null
          model: string
          name: string
          notes: string | null
          original_cost_price: number | null
          parts_payment_voucher: string | null
          product_type: string | null
          sale_price: number | null
          serial_number: string | null
          status: string
          store_id: string
          supplier_id: string | null
          supplier_name: string | null
          updated_at: string
        }
        Insert: {
          battery_percentage?: number | null
          brand: string
          capacity?: string | null
          color?: string | null
          condition?: string | null
          cost_price: number
          created_at?: string
          created_by: string
          defects?: string[] | null
          device_payment_voucher?: string | null
          id?: string
          imei?: string | null
          model: string
          name: string
          notes?: string | null
          original_cost_price?: number | null
          parts_payment_voucher?: string | null
          product_type?: string | null
          sale_price?: number | null
          serial_number?: string | null
          status?: string
          store_id: string
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Update: {
          battery_percentage?: number | null
          brand?: string
          capacity?: string | null
          color?: string | null
          condition?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string
          defects?: string[] | null
          device_payment_voucher?: string | null
          id?: string
          imei?: string | null
          model?: string
          name?: string
          notes?: string | null
          original_cost_price?: number | null
          parts_payment_voucher?: string | null
          product_type?: string | null
          sale_price?: number | null
          serial_number?: string | null
          status?: string
          store_id?: string
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          permissions: Json | null
          phone: string | null
          store_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          permissions?: Json | null
          phone?: string | null
          store_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          permissions?: Json | null
          phone?: string | null
          store_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          commission_percent: number | null
          commission_value: number | null
          created_at: string
          created_by: string
          customer_address: string | null
          customer_birth: string | null
          customer_cpf: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number | null
          has_trade_in: boolean
          id: string
          installments: number | null
          notes: string | null
          payment_card: number
          payment_cash: number
          payment_pix: number
          product_id: string
          sale_price: number
          seller_id: string | null
          store_id: string
          trade_in_device_brand: string | null
          trade_in_device_imei: string | null
          trade_in_device_model: string | null
          trade_in_device_name: string | null
          trade_in_product_id: string | null
          trade_in_value: number | null
          warranty_days: number | null
        }
        Insert: {
          commission_percent?: number | null
          commission_value?: number | null
          created_at?: string
          created_by: string
          customer_address?: string | null
          customer_birth?: string | null
          customer_cpf?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number | null
          has_trade_in?: boolean
          id?: string
          installments?: number | null
          notes?: string | null
          payment_card?: number
          payment_cash?: number
          payment_pix?: number
          product_id: string
          sale_price: number
          seller_id?: string | null
          store_id: string
          trade_in_device_brand?: string | null
          trade_in_device_imei?: string | null
          trade_in_device_model?: string | null
          trade_in_device_name?: string | null
          trade_in_product_id?: string | null
          trade_in_value?: number | null
          warranty_days?: number | null
        }
        Update: {
          commission_percent?: number | null
          commission_value?: number | null
          created_at?: string
          created_by?: string
          customer_address?: string | null
          customer_birth?: string | null
          customer_cpf?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number | null
          has_trade_in?: boolean
          id?: string
          installments?: number | null
          notes?: string | null
          payment_card?: number
          payment_cash?: number
          payment_pix?: number
          product_id?: string
          sale_price?: number
          seller_id?: string | null
          store_id?: string
          trade_in_device_brand?: string | null
          trade_in_device_imei?: string | null
          trade_in_device_model?: string | null
          trade_in_device_name?: string | null
          trade_in_product_id?: string | null
          trade_in_value?: number | null
          warranty_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_trade_in_product_id_fkey"
            columns: ["trade_in_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_history: {
        Row: {
          created_at: string
          created_by: string
          id: string
          new_status: string
          notes: string | null
          old_status: string | null
          service_order_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          new_status: string
          notes?: string | null
          old_status?: string | null
          service_order_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
          service_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_history_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          receipt_url: string | null
          service_order_id: string
          supplier_id: string | null
          supplier_name: string | null
          supplier_order_receipt_url: string | null
          unit_cost: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          receipt_url?: string | null
          service_order_id: string
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_order_receipt_url?: string | null
          unit_cost: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          receipt_url?: string | null
          service_order_id?: string
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_order_receipt_url?: string | null
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_photos: {
        Row: {
          created_at: string
          id: string
          photo_url: string
          service_order_id: string
          stage: string
        }
        Insert: {
          created_at?: string
          id?: string
          photo_url: string
          service_order_id: string
          stage: string
        }
        Update: {
          created_at?: string
          id?: string
          photo_url?: string
          service_order_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_photos_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          customer_cpf: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          delivered_at: string | null
          device_accessories: string | null
          device_brand: string
          device_color: string | null
          device_condition: string | null
          device_imei: string | null
          device_is_off: boolean | null
          device_model: string
          device_password: string | null
          discount_amount: number
          entry_checklist: Json | null
          entry_signature: string | null
          estimated_completion: string | null
          estimated_price: number | null
          exit_checklist: Json | null
          exit_signature: string | null
          final_price: number | null
          id: string
          internal_notes: string | null
          order_number: number
          payment_card: number | null
          payment_cash: number | null
          payment_method: string | null
          payment_notes: string | null
          payment_other: number | null
          payment_pix: number | null
          receipt_url: string | null
          reported_defect: string
          requested_service: string
          service_performed: string | null
          services_performed: Json
          signature_data: string | null
          status: string
          store_id: string
          technician: string | null
          technician_id: string | null
          terms_accepted: boolean | null
          terms_text: string | null
          updated_at: string
          warranty_end_date: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          customer_cpf?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          delivered_at?: string | null
          device_accessories?: string | null
          device_brand: string
          device_color?: string | null
          device_condition?: string | null
          device_imei?: string | null
          device_is_off?: boolean | null
          device_model: string
          device_password?: string | null
          discount_amount?: number
          entry_checklist?: Json | null
          entry_signature?: string | null
          estimated_completion?: string | null
          estimated_price?: number | null
          exit_checklist?: Json | null
          exit_signature?: string | null
          final_price?: number | null
          id?: string
          internal_notes?: string | null
          order_number?: number
          payment_card?: number | null
          payment_cash?: number | null
          payment_method?: string | null
          payment_notes?: string | null
          payment_other?: number | null
          payment_pix?: number | null
          receipt_url?: string | null
          reported_defect: string
          requested_service: string
          service_performed?: string | null
          services_performed?: Json
          signature_data?: string | null
          status?: string
          store_id: string
          technician?: string | null
          technician_id?: string | null
          terms_accepted?: boolean | null
          terms_text?: string | null
          updated_at?: string
          warranty_end_date?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          customer_cpf?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivered_at?: string | null
          device_accessories?: string | null
          device_brand?: string
          device_color?: string | null
          device_condition?: string | null
          device_imei?: string | null
          device_is_off?: boolean | null
          device_model?: string
          device_password?: string | null
          discount_amount?: number
          entry_checklist?: Json | null
          entry_signature?: string | null
          estimated_completion?: string | null
          estimated_price?: number | null
          exit_checklist?: Json | null
          exit_signature?: string | null
          final_price?: number | null
          id?: string
          internal_notes?: string | null
          order_number?: number
          payment_card?: number | null
          payment_cash?: number | null
          payment_method?: string | null
          payment_notes?: string | null
          payment_other?: number | null
          payment_pix?: number | null
          receipt_url?: string | null
          reported_defect?: string
          requested_service?: string
          service_performed?: string | null
          services_performed?: Json
          signature_data?: string | null
          status?: string
          store_id?: string
          technician?: string | null
          technician_id?: string | null
          terms_accepted?: boolean | null
          terms_text?: string | null
          updated_at?: string
          warranty_end_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_assistant_sessions: {
        Row: {
          last_message_id: string | null
          state: Json
          store_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          last_message_id?: string | null
          state?: Json
          store_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          last_message_id?: string | null
          state?: Json
          store_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_assistant_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_bank_accounts: {
        Row: {
          account_number: string | null
          account_type: string
          agency: string | null
          bank_name: string
          created_at: string
          credit_fee_percent: number | null
          credit_settlement_days: number | null
          debit_fee_percent: number | null
          debit_settlement_days: number | null
          holder_cpf_cnpj: string | null
          holder_name: string | null
          id: string
          is_cashbox: boolean | null
          is_primary: boolean | null
          owner_type: string | null
          pix_fee_percent: number | null
          pix_key: string | null
          pix_settlement_days: number | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string
          agency?: string | null
          bank_name: string
          created_at?: string
          credit_fee_percent?: number | null
          credit_settlement_days?: number | null
          debit_fee_percent?: number | null
          debit_settlement_days?: number | null
          holder_cpf_cnpj?: string | null
          holder_name?: string | null
          id?: string
          is_cashbox?: boolean | null
          is_primary?: boolean | null
          owner_type?: string | null
          pix_fee_percent?: number | null
          pix_key?: string | null
          pix_settlement_days?: number | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: string
          agency?: string | null
          bank_name?: string
          created_at?: string
          credit_fee_percent?: number | null
          credit_settlement_days?: number | null
          debit_fee_percent?: number | null
          debit_settlement_days?: number | null
          holder_cpf_cnpj?: string | null
          holder_name?: string | null
          id?: string
          is_cashbox?: boolean | null
          is_primary?: boolean | null
          owner_type?: string | null
          pix_fee_percent?: number | null
          pix_key?: string | null
          pix_settlement_days?: number | null
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_bank_accounts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          cnpj: string | null
          created_at: string
          id: string
          instagram: string | null
          logo_url: string | null
          name: string
          pdf_footer: string | null
          phone: string | null
          status: string
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          cnpj?: string | null
          created_at?: string
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name: string
          pdf_footer?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          cnpj?: string | null
          created_at?: string
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name?: string
          pdf_footer?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          credit_balance: number
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          credit_balance?: number
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          credit_balance?: number
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      tradein_evaluations: {
        Row: {
          agreed_value: number | null
          answers: Json
          base_price: number
          blocked: boolean
          brand: string
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          discount_total: number
          id: string
          imei: string | null
          model: string
          model_id: string | null
          notes: string | null
          offer_max: number
          offer_min: number
          sale_id: string | null
          status: string
          storage: string
          store_id: string
          updated_at: string
        }
        Insert: {
          agreed_value?: number | null
          answers?: Json
          base_price: number
          blocked?: boolean
          brand: string
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_total?: number
          id?: string
          imei?: string | null
          model: string
          model_id?: string | null
          notes?: string | null
          offer_max: number
          offer_min: number
          sale_id?: string | null
          status?: string
          storage?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          agreed_value?: number | null
          answers?: Json
          base_price?: number
          blocked?: boolean
          brand?: string
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_total?: number
          id?: string
          imei?: string | null
          model?: string
          model_id?: string | null
          notes?: string | null
          offer_max?: number
          offer_min?: number
          sale_id?: string | null
          status?: string
          storage?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tradein_evaluations_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "tradein_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tradein_evaluations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tradein_evaluations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      tradein_model_rules: {
        Row: {
          amount: number
          kind: string
          model_id: string
          rule_id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          kind?: string
          model_id: string
          rule_id: string
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          kind?: string
          model_id?: string
          rule_id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tradein_model_rules_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "tradein_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tradein_model_rules_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "tradein_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tradein_model_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      tradein_models: {
        Row: {
          active: boolean
          base_price: number
          brand: string
          created_at: string
          id: string
          model: string
          storage: string
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_price: number
          brand: string
          created_at?: string
          id?: string
          model: string
          storage?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_price?: number
          brand?: string
          created_at?: string
          id?: string
          model?: string
          storage?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tradein_models_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      tradein_rules: {
        Row: {
          active: boolean
          amount: number
          created_at: string
          id: string
          kind: string
          label: string
          position: number
          question: string
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number
          created_at?: string
          id?: string
          kind: string
          label: string
          position?: number
          question: string
          store_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          created_at?: string
          id?: string
          kind?: string
          label?: string
          position?: number
          question?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tradein_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      tradein_settings: {
        Row: {
          negotiation_pct: number
          round_to: number
          store_id: string
          updated_at: string
        }
        Insert: {
          negotiation_pct?: number
          round_to?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          negotiation_pct?: number
          round_to?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tradein_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      tradein_shares: {
        Row: {
          accepted_at: string | null
          accepted_value: number | null
          activity_at: string | null
          created_at: string
          created_by: string | null
          evaluation_id: string
          expires_at: string
          opened_at: string | null
          photo_count: number
          photos_at: string | null
          review_answers: Json | null
          review_blocked: boolean | null
          review_count: number
          review_discount_total: number | null
          review_note: string | null
          review_offer: number | null
          reviewed_at: string | null
          seen_at: string | null
          store_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_value?: number | null
          activity_at?: string | null
          created_at?: string
          created_by?: string | null
          evaluation_id: string
          expires_at: string
          opened_at?: string | null
          photo_count?: number
          photos_at?: string | null
          review_answers?: Json | null
          review_blocked?: boolean | null
          review_count?: number
          review_discount_total?: number | null
          review_note?: string | null
          review_offer?: number | null
          reviewed_at?: string | null
          seen_at?: string | null
          store_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_value?: number | null
          activity_at?: string | null
          created_at?: string
          created_by?: string | null
          evaluation_id?: string
          expires_at?: string
          opened_at?: string | null
          photo_count?: number
          photos_at?: string | null
          review_answers?: Json | null
          review_blocked?: boolean | null
          review_count?: number
          review_discount_total?: number | null
          review_note?: string | null
          review_offer?: number | null
          reviewed_at?: string | null
          seen_at?: string | null
          store_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tradein_shares_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: true
            referencedRelation: "tradein_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tradein_shares_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string
          description: string | null
          destination_account_id: string | null
          expected_settlement_date: string | null
          id: string
          metadata: Json | null
          net_amount: number | null
          product_id: string | null
          receipt_url: string | null
          reconciled: boolean | null
          sale_id: string | null
          source_account_id: string | null
          status: string | null
          store_id: string | null
          type: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          destination_account_id?: string | null
          expected_settlement_date?: string | null
          id?: string
          metadata?: Json | null
          net_amount?: number | null
          product_id?: string | null
          receipt_url?: string | null
          reconciled?: boolean | null
          sale_id?: string | null
          source_account_id?: string | null
          status?: string | null
          store_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          destination_account_id?: string | null
          expected_settlement_date?: string | null
          id?: string
          metadata?: Json | null
          net_amount?: number | null
          product_id?: string | null
          receipt_url?: string | null
          reconciled?: boolean | null
          sale_id?: string | null
          source_account_id?: string | null
          status?: string | null
          store_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "store_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "store_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          commission_on_sales: boolean | null
          commission_on_services: boolean | null
          commission_repair_percent: number | null
          commission_sales_percent: number | null
          commission_services_percent: number | null
          id: string
          permissions: Json | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          commission_on_sales?: boolean | null
          commission_on_services?: boolean | null
          commission_repair_percent?: number | null
          commission_sales_percent?: number | null
          commission_services_percent?: number | null
          id?: string
          permissions?: Json | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          commission_on_sales?: boolean | null
          commission_on_services?: boolean | null
          commission_repair_percent?: number | null
          commission_sales_percent?: number | null
          commission_services_percent?: number | null
          id?: string
          permissions?: Json | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhooks: {
        Row: {
          created_at: string
          event_type: string
          id: string
          is_active: boolean
          store_id: string
          url: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          is_active?: boolean
          store_id: string
          url: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          is_active?: boolean
          store_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_config: {
        Row: {
          api_key: string
          api_url: string
          created_at: string | null
          id: string
          instance_name: string
          is_active: boolean | null
          store_id: string | null
          updated_at: string | null
        }
        Insert: {
          api_key: string
          api_url: string
          created_at?: string | null
          id?: string
          instance_name: string
          is_active?: boolean | null
          store_id?: string | null
          updated_at?: string | null
        }
        Update: {
          api_key?: string
          api_url?: string
          created_at?: string | null
          id?: string
          instance_name?: string
          is_active?: boolean | null
          store_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_config_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sync_log: {
        Row: {
          attempts: number
          config_id: string
          external_id: string
          first_at: string
          last_at: string
          message_at: string | null
          result: string
          retry: boolean
        }
        Insert: {
          attempts?: number
          config_id: string
          external_id: string
          first_at?: string
          last_at?: string
          message_at?: string | null
          result: string
          retry?: boolean
        }
        Update: {
          attempts?: number
          config_id?: string
          external_id?: string
          first_at?: string
          last_at?: string
          message_at?: string | null
          result?: string
          retry?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sync_log_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_config"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_watchdog: {
        Row: {
          checked_at: string
          config_id: string
          evo_errors: number
          last_alert_at: string | null
          last_alert_kind: string | null
          last_direct_inbound_at: string | null
          last_error: string | null
          last_error_at: string | null
          last_group_inbound_at: string | null
          last_inbound_at: string | null
          last_state: string | null
          last_sync_at: string | null
          last_sync_saved: number | null
          owner_number: string | null
          probe_external_id: string | null
          probe_from_config: string | null
          probe_ok_at: string | null
          probe_sent_at: string | null
          scanned_at: string | null
          webhook_checked_at: string | null
          webhook_fixed_at: string | null
          webhook_issue: string | null
          webhook_ok: boolean | null
        }
        Insert: {
          checked_at?: string
          config_id: string
          evo_errors?: number
          last_alert_at?: string | null
          last_alert_kind?: string | null
          last_direct_inbound_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_group_inbound_at?: string | null
          last_inbound_at?: string | null
          last_state?: string | null
          last_sync_at?: string | null
          last_sync_saved?: number | null
          owner_number?: string | null
          probe_external_id?: string | null
          probe_from_config?: string | null
          probe_ok_at?: string | null
          probe_sent_at?: string | null
          scanned_at?: string | null
          webhook_checked_at?: string | null
          webhook_fixed_at?: string | null
          webhook_issue?: string | null
          webhook_ok?: boolean | null
        }
        Update: {
          checked_at?: string
          config_id?: string
          evo_errors?: number
          last_alert_at?: string | null
          last_alert_kind?: string | null
          last_direct_inbound_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_group_inbound_at?: string | null
          last_inbound_at?: string | null
          last_state?: string | null
          last_sync_at?: string | null
          last_sync_saved?: number | null
          owner_number?: string | null
          probe_external_id?: string | null
          probe_from_config?: string | null
          probe_ok_at?: string | null
          probe_sent_at?: string | null
          scanned_at?: string | null
          webhook_checked_at?: string | null
          webhook_fixed_at?: string | null
          webhook_issue?: string | null
          webhook_ok?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_watchdog_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_config"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_service_order_custom_part: {
        Args: {
          p_brand: string
          p_cost_price: number
          p_model: string
          p_name: string
          p_receipt_url?: string
          p_sale_price: number
          p_service_order_id: string
          p_supplier_id?: string
          p_supplier_name?: string
          p_supplier_order_receipt_url?: string
        }
        Returns: Json
      }
      app_store_access: { Args: { p_store_id: string }; Returns: boolean }
      can_access_comprovante: {
        Args: { p_file_path: string }
        Returns: boolean
      }
      cancel_commission_settlement: {
        Args: {
          p_reason: string
          p_refund_to_open_register?: boolean
          p_settlement_id: string
        }
        Returns: Json
      }
      cancel_sale: {
        Args: { p_reason?: string; p_sale_id: string }
        Returns: Json
      }
      cancel_service_order: {
        Args: { p_reason?: string; p_service_order_id: string }
        Returns: Json
      }
      crm_ads_report: {
        Args: {
          p_from: string
          p_kind?: string
          p_store_id: string
          p_to: string
        }
        Returns: {
          ad_id: string
          ad_name: string
          adset_id: string
          adset_name: string
          campaign_id: string
          campaign_name: string
          clicks: number
          conversations: number
          impressions: number
          leads: number
          qualified: number
          replied: number
          revenue: number
          spend: number
          won: number
        }[]
      }
      crm_ai_add_example: {
        Args: {
          p_answer: string
          p_kind: string
          p_question: string
          p_ref?: string
          p_source: string
          p_status?: string
          p_store_id: string
          p_topic: string
        }
        Returns: string
      }
      crm_ai_handoff: {
        Args: {
          p_conversation_id: string
          p_interest?: string
          p_reason?: string
          p_score?: string
          p_summary: string
          p_title: string
        }
        Returns: Json
      }
      crm_ai_similar_examples: {
        Args: { p_limit?: number; p_store_id: string; p_text: string }
        Returns: {
          answer: string
          has_price: boolean
          id: string
          question: string
          score: number
        }[]
      }
      crm_ai_stats: {
        Args: { p_days?: number; p_store_id: string }
        Returns: Json
      }
      crm_campaign_spend_report: {
        Args: { p_from: string; p_store_id: string; p_to: string }
        Returns: {
          campaign: string
          spend: number
        }[]
      }
      crm_can_access: {
        Args: { p_store_id: string; p_user: string }
        Returns: boolean
      }
      crm_create_instagram_lead: {
        Args: {
          p_ad?: string
          p_ad_code?: string
          p_adset?: string
          p_campaign?: string
          p_interest?: string
          p_name?: string
          p_owner_id?: string
          p_phone: string
          p_source?: string
          p_store_id: string
          p_subject?: string
          p_username?: string
        }
        Returns: Json
      }
      crm_deal_link_candidates: {
        Args: { p_deal_id: string }
        Returns: {
          amount: number
          happened_at: string
          id: string
          kind: string
          label: string
        }[]
      }
      crm_dispatch_accept: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      crm_dispatch_assign: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: undefined
      }
      crm_dispatch_claim_notifications: {
        Args: { p_limit?: number }
        Returns: Json
      }
      crm_dispatch_is_service: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      crm_dispatch_mark_accepted: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: undefined
      }
      crm_dispatch_next: {
        Args: {
          p_cursor: number
          p_cycle_id: string
          p_members: string[]
          p_store_id: string
        }
        Returns: {
          step: number
          user_id: string
        }[]
      }
      crm_dispatch_notified: {
        Args: { p_error?: string; p_id: string; p_ok: boolean }
        Returns: undefined
      }
      crm_dispatch_offer: {
        Args: { p_conversation_id: string; p_cycle_id: string }
        Returns: string
      }
      crm_dispatch_owner: { Args: { p_store_id: string }; Returns: string }
      crm_dispatch_start: {
        Args: { p_conversation_id: string }
        Returns: string
      }
      crm_dispatch_tick: { Args: never; Returns: Json }
      crm_ensure_handoff_code: {
        Args: { p_contact_id: string }
        Returns: string
      }
      crm_entry_stage: { Args: { p_pipeline_id: string }; Returns: string }
      crm_ig_manual_report: {
        Args: { p_from: string; p_store_id: string; p_to: string }
        Returns: Json
      }
      crm_inbox_counts: { Args: { p_store_id?: string }; Returns: Json }
      crm_ingest_message: {
        Args: {
          p_avatar_url?: string
          p_body?: string
          p_channel: string
          p_create_contact?: boolean
          p_created_at?: string
          p_direction: string
          p_external_id?: string
          p_external_thread_id?: string
          p_instagram_user_id?: string
          p_instagram_username?: string
          p_kind?: string
          p_media_mime?: string
          p_media_path?: string
          p_media_url?: string
          p_name?: string
          p_phone?: string
          p_sender_kind: string
          p_sender_user_id?: string
          p_status?: string
          p_store_id: string
        }
        Returns: Json
      }
      crm_is_manager: { Args: never; Returns: boolean }
      crm_is_member: { Args: { p_store_id: string }; Returns: boolean }
      crm_is_tecnico: { Args: never; Returns: boolean }
      crm_lid_remember: {
        Args: {
          p_lid: string
          p_phone: string
          p_source?: string
          p_store_id: string
        }
        Returns: number
      }
      crm_merge_contacts: {
        Args: { p_drop: string; p_keep: string }
        Returns: string
      }
      crm_meta_backfill: {
        Args: { p_days?: number; p_store_id: string }
        Returns: Json
      }
      crm_meta_enqueue: {
        Args: {
          p_attribution_id?: string
          p_contact_id: string
          p_deal_id: string
          p_event_time?: string
          p_kind: string
          p_value?: number
        }
        Returns: string
      }
      crm_normalize_phone: { Args: { p: string }; Returns: string }
      crm_owner_to_funnel: {
        Args: { p_conversation_id: string }
        Returns: string
      }
      crm_phone_key: { Args: { p: string }; Returns: string }
      crm_pick_assignee: { Args: { p_store_id: string }; Returns: string }
      crm_pipeline_for_kind: {
        Args: { p_lead_kind: string; p_store_id: string }
        Returns: string
      }
      crm_pipeline_summary: {
        Args: { p_owner_id?: string; p_pipeline_id: string }
        Returns: {
          deals: number
          stage_id: string
          total: number
        }[]
      }
      crm_push_claim: { Args: { p_conversation_id: string }; Returns: boolean }
      crm_push_recipients: {
        Args: { p_conversation_id: string }
        Returns: {
          auth: string
          endpoint: string
          p256dh: string
          subscription_id: string
          user_id: string
        }[]
      }
      crm_report: {
        Args: {
          p_from: string
          p_pipeline_kind?: string
          p_store_id: string
          p_to: string
        }
        Returns: Json
      }
      crm_run_automations: { Args: { p_now?: string }; Returns: Json }
      crm_seed_store: { Args: { p_store_id: string }; Returns: undefined }
      crm_seed_tags: { Args: { p_store_id: string }; Returns: undefined }
      crm_set_conversation_handler: {
        Args: { p_conversation_id: string; p_handler: string }
        Returns: undefined
      }
      crm_staff_phone: { Args: { p_user_id: string }; Returns: string }
      crm_storage_is_member: { Args: { p_name: string }; Returns: boolean }
      crm_store_open: {
        Args: { p_at?: string; p_store_id: string }
        Returns: boolean
      }
      crm_sync_service_orders: { Args: { p_now?: string }; Returns: Json }
      crm_task_counts: { Args: { p_store_id?: string }; Returns: Json }
      crm_team: {
        Args: { p_store_id?: string }
        Returns: {
          display_name: string
          role: string
          user_id: string
        }[]
      }
      crm_team_phones: {
        Args: { p_store_id: string }
        Returns: {
          has_phone: boolean
          user_id: string
        }[]
      }
      crm_track_attach: {
        Args: {
          p_code: string
          p_contact_id: string
          p_is_new?: boolean
          p_native?: Json
        }
        Returns: Json
      }
      crm_tracking_health: { Args: { p_store_id: string }; Returns: Json }
      crm_tracking_report: {
        Args: {
          p_from: string
          p_kind?: string
          p_store_id: string
          p_to: string
        }
        Returns: {
          ad: string
          adset: string
          campaign: string
          contacts: number
          qualified: number
          replied: number
          revenue: number
          source: string
          won: number
        }[]
      }
      crm_turn_blocker: {
        Args: { p_conversation_id: string; p_user: string }
        Returns: string
      }
      crm_update_message_status: {
        Args: { p_external_id: string; p_status: string; p_store_id: string }
        Returns: number
      }
      crm_user_name: { Args: { p_user: string }; Returns: string }
      crm_whatsapp_health: {
        Args: never
        Returns: {
          checked_at: string
          config_id: string
          evo_errors: number
          instance_name: string
          last_alert_at: string
          last_alert_kind: string
          last_direct_inbound_at: string
          last_error: string
          last_error_at: string
          last_inbound_at: string
          last_sync_at: string
          lid_pending: number
          probe_ok_at: string
          probe_sent_at: string
          state: string
          store_id: string
          store_name: string
          synced_24h: number
          webhook_fixed_at: string
          webhook_issue: string
          webhook_ok: boolean
        }[]
      }
      get_my_role: { Args: never; Returns: string }
      get_public_os_extras: { Args: { p_order_id: string }; Returns: Json }
      get_public_os_full_data: {
        Args: { p_order_id: string }
        Returns: {
          created_at: string
          customer_name: string
          customer_phone: string
          device_brand: string
          device_color: string
          device_model: string
          estimated_completion: string
          estimated_price: number
          final_price: number
          id: string
          order_number: number
          reported_defect: string
          requested_service: string
          status: string
          store_address: string
          store_cnpj: string
          store_id: string
          store_name: string
          store_phone: string
          warranty_end_date: string
        }[]
      }
      get_public_service_order: {
        Args: { p_order_id: string }
        Returns: {
          created_at: string
          device_brand: string
          device_model: string
          estimated_completion: string
          order_number: number
          requested_service: string
          status: string
          store_name: string
        }[]
      }
      get_public_service_order_photos: {
        Args: { p_order_id: string }
        Returns: {
          created_at: string
          id: string
          photo_url: string
          stage: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_device_as_sold: {
        Args: { p_product_id: string; p_sale_price: number }
        Returns: Json
      }
      pdv_register_sale: {
        Args: {
          p_customer?: string
          p_discount?: number
          p_items: Json
          p_payments: Json
          p_source_message?: string
          p_store: string
          p_user: string
        }
        Returns: Json
      }
      settle_commissions: { Args: { p_payload: Json }; Returns: Json }
      staff_day_report: {
        Args: { p_all?: boolean; p_store: string; p_user: string }
        Returns: Json
      }
      staff_find_accessories: {
        Args: { p_limit?: number; p_store: string; p_text: string }
        Returns: {
          brand: string
          category: string
          id: string
          name: string
          quantity: number
          sale_price: number
          score: number
        }[]
      }
      staff_lookup: {
        Args: { p_phone: string; p_store: string }
        Returns: Json
      }
      staff_norm: { Args: { p: string }; Returns: string }
      tradein_brl: { Args: { v: number }; Returns: string }
      tradein_effective_rules: {
        Args: { p_model_id: string; p_store_id: string }
        Returns: {
          amount: number
          id: string
          kind: string
          label: string
          position: number
          question: string
        }[]
      }
      tradein_is_manager: { Args: never; Returns: boolean }
      tradein_new_token: { Args: never; Returns: string }
      tradein_photo_can_read: { Args: { p_name: string }; Returns: boolean }
      tradein_photo_can_upload: { Args: { p_name: string }; Returns: boolean }
      tradein_public_accept: { Args: { p_token: string }; Returns: Json }
      tradein_public_get: { Args: { p_token: string }; Returns: Json }
      tradein_public_photos_sent: { Args: { p_token: string }; Returns: Json }
      tradein_public_review: {
        Args: { p_note?: string; p_rule_ids: string[]; p_token: string }
        Returns: Json
      }
      tradein_seed_store: { Args: { p_store_id: string }; Returns: undefined }
      tradein_share_create: {
        Args: { p_evaluation_id: string }
        Returns: {
          expires_at: string
          token: string
        }[]
      }
      tradein_share_mark_seen: {
        Args: { p_evaluation_id: string }
        Returns: undefined
      }
      tradein_share_open: {
        Args: { p_token: string }
        Returns: {
          accepted_at: string | null
          accepted_value: number | null
          activity_at: string | null
          created_at: string
          created_by: string | null
          evaluation_id: string
          expires_at: string
          opened_at: string | null
          photo_count: number
          photos_at: string | null
          review_answers: Json | null
          review_blocked: boolean | null
          review_count: number
          review_discount_total: number | null
          review_note: string | null
          review_offer: number | null
          reviewed_at: string | null
          seen_at: string | null
          store_id: string
          token: string
        }
        SetofOptions: {
          from: "*"
          to: "tradein_shares"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tradein_share_task: {
        Args: {
          p_event: string
          p_notes: string
          p_share: Database["public"]["Tables"]["tradein_shares"]["Row"]
          p_title: string
        }
        Returns: undefined
      }
      whatsapp_ensure_store_contact: {
        Args: { p_label: string; p_phone: string; p_store_id: string }
        Returns: undefined
      }
      whatsapp_watchdog_admin_phone: {
        Args: { p_store_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "gerente" | "vendedor" | "tecnico" | "dono"
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
      app_role: ["admin", "gerente", "vendedor", "tecnico", "dono"],
    },
  },
} as const
