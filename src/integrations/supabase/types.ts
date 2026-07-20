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
          category: string | null
          cost_price: number | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          min_quantity: number
          name: string
          quantity: number
          sale_price: number | null
          sku: string | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category?: string | null
          cost_price?: number | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          min_quantity?: number
          name: string
          quantity?: number
          sale_price?: number | null
          sku?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          min_quantity?: number
          name?: string
          quantity?: number
          sale_price?: number | null
          sku?: string | null
          store_id?: string | null
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
          entity_type: string | null
          id: string
          store_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          store_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          store_id?: string | null
          user_id?: string
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
      auto_replies: {
        Row: {
          channel: string
          created_at: string
          id: string
          is_active: boolean
          response_content: string
          store_id: string | null
          trigger_keywords: Json | null
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          response_content: string
          store_id?: string | null
          trigger_keywords?: Json | null
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          response_content?: string
          store_id?: string | null
          trigger_keywords?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_replies_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          account_type: string | null
          agency: string | null
          bank_name: string
          created_at: string
          credit_fee_percent: number | null
          credit_settlement_days: number | null
          debit_fee_percent: number | null
          debit_settlement_days: number | null
          holder_document: string | null
          holder_name: string | null
          id: string
          is_primary: boolean | null
          notes: string | null
          owner_type: string | null
          pix_fee_percent: number | null
          pix_key: string | null
          pix_key_type: string | null
          pix_settlement_days: number | null
          store_id: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string | null
          agency?: string | null
          bank_name: string
          created_at?: string
          credit_fee_percent?: number | null
          credit_settlement_days?: number | null
          debit_fee_percent?: number | null
          debit_settlement_days?: number | null
          holder_document?: string | null
          holder_name?: string | null
          id?: string
          is_primary?: boolean | null
          notes?: string | null
          owner_type?: string | null
          pix_fee_percent?: number | null
          pix_key?: string | null
          pix_key_type?: string | null
          pix_settlement_days?: number | null
          store_id: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: string | null
          agency?: string | null
          bank_name?: string
          created_at?: string
          credit_fee_percent?: number | null
          credit_settlement_days?: number | null
          debit_fee_percent?: number | null
          debit_settlement_days?: number | null
          holder_document?: string | null
          holder_name?: string | null
          id?: string
          is_primary?: boolean | null
          notes?: string | null
          owner_type?: string | null
          pix_fee_percent?: number | null
          pix_key?: string | null
          pix_key_type?: string | null
          pix_settlement_days?: number | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string
          customer_name: string | null
          description: string
          due_date: string
          id: string
          notes: string | null
          paid_date: string | null
          status: string
          store_id: string | null
          supplier_name: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          created_by: string
          customer_name?: string | null
          description: string
          due_date: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          status?: string
          store_id?: string | null
          supplier_name?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string
          customer_name?: string | null
          description?: string
          due_date?: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          status?: string
          store_id?: string | null
          supplier_name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_store_id_fkey"
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
          confirmed: boolean | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          payment_method: string | null
          receipt_url: string | null
          reference_id: string | null
          reference_key: string | null
          register_id: string
          type: string
        }
        Insert: {
          amount?: number
          confirmed?: boolean | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          payment_method?: string | null
          receipt_url?: string | null
          reference_id?: string | null
          reference_key?: string | null
          register_id: string
          type: string
        }
        Update: {
          amount?: number
          confirmed?: boolean | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          payment_method?: string | null
          receipt_url?: string | null
          reference_id?: string | null
          reference_key?: string | null
          register_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_entries_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
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
          created_at: string
          difference: number | null
          difference_reason: string | null
          expected_amount: number | null
          id: string
          opened_at: string
          opened_by: string
          opening_amount: number | null
          opening_receipt_url: string | null
          status: string | null
          store_id: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          closing_note?: string | null
          closing_receipt_url?: string | null
          created_at?: string
          difference?: number | null
          difference_reason?: string | null
          expected_amount?: number | null
          id?: string
          opened_at?: string
          opened_by: string
          opening_amount?: number | null
          opening_receipt_url?: string | null
          status?: string | null
          store_id?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          closing_note?: string | null
          closing_receipt_url?: string | null
          created_at?: string
          difference?: number | null
          difference_reason?: string | null
          expected_amount?: number | null
          id?: string
          opened_at?: string
          opened_by?: string
          opening_amount?: number | null
          opening_receipt_url?: string | null
          status?: string | null
          store_id?: string | null
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
      channel_configs: {
        Row: {
          access_token: string | null
          api_key: string | null
          api_url: string | null
          channel: string
          created_at: string
          id: string
          instance_name: string | null
          is_active: boolean
          page_id: string | null
          provider: string
          store_id: string | null
          updated_at: string
          verify_token: string | null
        }
        Insert: {
          access_token?: string | null
          api_key?: string | null
          api_url?: string | null
          channel: string
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean
          page_id?: string | null
          provider: string
          store_id?: string | null
          updated_at?: string
          verify_token?: string | null
        }
        Update: {
          access_token?: string | null
          api_key?: string | null
          api_url?: string | null
          channel?: string
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean
          page_id?: string | null
          provider?: string
          store_id?: string | null
          updated_at?: string
          verify_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_configs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_media: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string | null
          file_size: number | null
          id: string
          lead_id: string | null
          media_type: string
          media_url: string
          message_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          lead_id?: string | null
          media_type?: string
          media_url: string
          message_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          lead_id?: string | null
          media_type?: string
          media_url?: string
          message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_media_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_media_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "lead_messages"
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
      duplicate_prevention_logs: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          reference_key: string
          store_id: string | null
          target_table: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          reference_key: string
          store_id?: string | null
          target_table: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          reference_key?: string
          store_id?: string | null
          target_table?: string
        }
        Relationships: []
      }
      fixed_expenses: {
        Row: {
          active: boolean
          amount: number
          category: string | null
          created_at: string
          created_by: string
          description: string
          due_day: number
          id: string
          is_pf: boolean
          store_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number
          category?: string | null
          created_at?: string
          created_by: string
          description: string
          due_day?: number
          id?: string
          is_pf?: boolean
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string
          description?: string
          due_day?: number
          id?: string
          is_pf?: boolean
          store_id?: string | null
          updated_at?: string
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
          instagram_business_account_id: string | null
          is_active: boolean | null
          page_access_token: string | null
          page_id: string | null
          store_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          instagram_business_account_id?: string | null
          is_active?: boolean | null
          page_access_token?: string | null
          page_id?: string | null
          store_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          instagram_business_account_id?: string | null
          is_active?: boolean | null
          page_access_token?: string | null
          page_id?: string | null
          store_id?: string | null
          updated_at?: string | null
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
      lead_messages: {
        Row: {
          channel: string | null
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          media_url: string | null
          message_type: string | null
          sender_type: string | null
        }
        Insert: {
          channel?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          media_url?: string | null
          message_type?: string | null
          sender_type?: string | null
        }
        Update: {
          channel?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          media_url?: string | null
          message_type?: string | null
          sender_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_responses: {
        Row: {
          channel: string | null
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          response_type: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          channel?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          response_type?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          channel?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          response_type?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_responses_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          avatar_url: string | null
          created_at: string
          created_by: string
          email: string | null
          has_unread: boolean | null
          id: string
          instagram_user_id: string | null
          instagram_username: string | null
          last_message_at: string | null
          name: string
          notes: string | null
          phone: string | null
          source: string | null
          status: string | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          has_unread?: boolean | null
          id?: string
          instagram_user_id?: string | null
          instagram_username?: string | null
          last_message_at?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          has_unread?: boolean | null
          id?: string
          instagram_user_id?: string | null
          instagram_username?: string | null
          last_message_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leads_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      member_stores: {
        Row: {
          created_at: string
          id: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          store_id?: string
          user_id?: string
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
      product_history: {
        Row: {
          action: string
          created_at: string
          created_by: string
          id: string
          justification: string | null
          new_cost: number | null
          new_values: Json | null
          notes: string | null
          old_cost: number | null
          old_values: Json | null
          product_id: string
        }
        Insert: {
          action: string
          created_at?: string
          created_by: string
          id?: string
          justification?: string | null
          new_cost?: number | null
          new_values?: Json | null
          notes?: string | null
          old_cost?: number | null
          old_values?: Json | null
          product_id: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string
          id?: string
          justification?: string | null
          new_cost?: number | null
          new_values?: Json | null
          notes?: string | null
          old_cost?: number | null
          old_values?: Json | null
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
      product_repairs: {
        Row: {
          created_at: string
          created_by: string
          description: string
          id: string
          part_cost: number
          part_name: string | null
          product_id: string
          receipt_url: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description: string
          id?: string
          part_cost?: number
          part_name?: string | null
          product_id: string
          receipt_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          part_cost?: number
          part_name?: string | null
          product_id?: string
          receipt_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_repairs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
          id: string
          imei: string | null
          model: string
          name: string
          notes: string | null
          defects: string[] | null
          product_type: string | null
          sale_price: number | null
          serial_number: string | null
          status: string
          store_id: string
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
          id?: string
          imei?: string | null
          model: string
          name: string
          notes?: string | null
          defects?: string[] | null
          product_type?: string | null
          sale_price?: number | null
          serial_number?: string | null
          status?: string
          store_id: string
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
          id?: string
          imei?: string | null
          model?: string
          name?: string
          notes?: string | null
          defects?: string[] | null
          product_type?: string | null
          sale_price?: number | null
          serial_number?: string | null
          status?: string
          store_id?: string
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
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
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
          customer_cpf: string | null
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
          customer_cpf?: string | null
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
          customer_cpf?: string | null
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
      service_order_costs: {
        Row: {
          amount: number
          cost_type: string
          created_at: string
          created_by: string
          description: string
          id: string
          receipt_url: string | null
          service_order_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          cost_type?: string
          created_at?: string
          created_by: string
          description: string
          id?: string
          receipt_url?: string | null
          service_order_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          cost_type?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          receipt_url?: string | null
          service_order_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_costs_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
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
          approval_notes: string | null
          approval_status: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          credit_amount: number | null
          damage_reported: boolean | null
          destination_product_id: string | null
          destination_type: string
          id: string
          justification: string | null
          product_id: string
          quantity: number
          receipt_url: string | null
          return_date: string | null
          return_status: string | null
          service_order_id: string | null
          source_type: string
          status: string
          supplier_cost: number | null
          supplier_id: string | null
          supplier_name: string | null
          unit_cost: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          approval_notes?: string | null
          approval_status?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          credit_amount?: number | null
          damage_reported?: boolean | null
          destination_product_id?: string | null
          destination_type?: string
          id?: string
          justification?: string | null
          product_id: string
          quantity?: number
          receipt_url?: string | null
          return_date?: string | null
          return_status?: string | null
          service_order_id?: string | null
          source_type?: string
          status?: string
          supplier_cost?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          unit_cost?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          approval_notes?: string | null
          approval_status?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          credit_amount?: number | null
          damage_reported?: boolean | null
          destination_product_id?: string | null
          destination_type?: string
          id?: string
          justification?: string | null
          product_id?: string
          quantity?: number
          receipt_url?: string | null
          return_date?: string | null
          return_status?: string | null
          service_order_id?: string | null
          source_type?: string
          status?: string
          supplier_cost?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          unit_cost?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_items_destination_product_id_fkey"
            columns: ["destination_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
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
          created_by: string
          description: string | null
          id: string
          photo_type: string
          photo_url: string
          service_order_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          photo_type?: string
          photo_url: string
          service_order_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          photo_type?: string
          photo_url?: string
          service_order_id?: string
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
          device_model: string
          device_password: string | null
          device_is_off: boolean | null
          entry_checklist: Json | null
          estimated_completion: string | null
          estimated_price: number | null
          final_price: number | null
          id: string
          internal_notes: string | null
          order_number: number
          reported_defect: string
          requested_service: string
          signature_data: string | null
          status: string
          store_id: string | null
          technician_id: string | null
          terms_accepted: boolean | null
          terms_text: string | null
          updated_at: string
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
          device_model: string
          device_password?: string | null
          device_is_off?: boolean | null
          entry_checklist?: Json | null
          estimated_completion?: string | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          internal_notes?: string | null
          order_number?: number
          reported_defect: string
          requested_service: string
          signature_data?: string | null
          status?: string
          store_id?: string | null
          technician_id?: string | null
          terms_accepted?: boolean | null
          terms_text?: string | null
          updated_at?: string
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
          device_model?: string
          device_password?: string | null
          device_is_off?: boolean | null
          entry_checklist?: Json | null
          estimated_completion?: string | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          internal_notes?: string | null
          order_number?: number
          reported_defect?: string
          requested_service?: string
          signature_data?: string | null
          status?: string
          store_id?: string | null
          technician_id?: string | null
          terms_accepted?: boolean | null
          terms_text?: string | null
          updated_at?: string
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
      stock_transfers: {
        Row: {
          created_at: string
          created_by: string
          from_store_id: string
          id: string
          notes: string | null
          product_id: string
          to_store_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          from_store_id: string
          id?: string
          notes?: string | null
          product_id: string
          to_store_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          from_store_id?: string
          id?: string
          notes?: string | null
          product_id?: string
          to_store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_store_id_fkey"
            columns: ["from_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_store_id_fkey"
            columns: ["to_store_id"]
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
          email: string | null
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
          email?: string | null
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
          email?: string | null
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
          created_at: string
          created_by: string
          document: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          store_id?: string | null
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
          net_amount: number | null
          product_id: string | null
          receipt_url: string | null
          reconciled: boolean | null
          metadata: Json | null
          reference_key: string | null
          source_account_id: string | null
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
          net_amount?: number | null
          product_id?: string | null
          receipt_url?: string | null
          reconciled?: boolean | null
          metadata?: Json | null
          reference_key?: string | null
          source_account_id?: string | null
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
          net_amount?: number | null
          product_id?: string | null
          receipt_url?: string | null
          reconciled?: boolean | null
          metadata?: Json | null
          reference_key?: string | null
          source_account_id?: string | null
          store_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "transactions_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
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
          commission_on_sales: boolean
          commission_on_services: boolean
          commission_sales_percent: number
          commission_services_percent: number
          id: string
          permissions: Json | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          commission_on_sales?: boolean
          commission_on_services?: boolean
          commission_sales_percent?: number
          commission_services_percent?: number
          id?: string
          permissions?: Json | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          commission_on_sales?: boolean
          commission_on_services?: boolean
          commission_sales_percent?: number
          commission_services_percent?: number
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
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          event_type?: string
          id?: string
          is_active?: boolean
          store_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          is_active?: boolean
          store_id?: string
          updated_at?: string
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
          api_key: string | null
          api_url: string | null
          created_at: string
          id: string
          instance_name: string | null
          is_active: boolean
          store_id: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          api_url?: string | null
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean
          store_id: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          api_url?: string | null
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean
          store_id?: string
          updated_at?: string
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
    }
    Views: {
      store_bank_accounts: {
        Row: {
          account_number: string | null
          account_type: string | null
          agency: string | null
          bank_name: string | null
          created_at: string | null
          credit_fee_percent: number | null
          credit_settlement_days: number | null
          debit_fee_percent: number | null
          debit_settlement_days: number | null
          holder_document: string | null
          holder_name: string | null
          id: string | null
          is_primary: boolean | null
          is_cashbox: boolean | null
          notes: string | null
          owner_type: string | null
          pix_fee_percent: number | null
          pix_key: string | null
          pix_key_type: string | null
          pix_settlement_days: number | null
          store_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_number?: string | null
          account_type?: string | null
          agency?: string | null
          bank_name?: string | null
          created_at?: string | null
          credit_fee_percent?: number | null
          credit_settlement_days?: number | null
          debit_fee_percent?: number | null
          debit_settlement_days?: number | null
          holder_document?: string | null
          holder_name?: string | null
          id?: string | null
          is_primary?: boolean | null
          is_cashbox?: boolean | null
          notes?: string | null
          owner_type?: string | null
          pix_fee_percent?: number | null
          pix_key?: string | null
          pix_key_type?: string | null
          pix_settlement_days?: number | null
          store_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_number?: string | null
          account_type?: string | null
          agency?: string | null
          bank_name?: string | null
          created_at?: string | null
          credit_fee_percent?: number | null
          credit_settlement_days?: number | null
          debit_fee_percent?: number | null
          debit_settlement_days?: number | null
          holder_document?: string | null
          holder_name?: string | null
          id?: string | null
          is_primary?: boolean | null
          is_cashbox?: boolean | null
          notes?: string | null
          owner_type?: string | null
          pix_fee_percent?: number | null
          pix_key?: string | null
          pix_key_type?: string | null
          pix_settlement_days?: number | null
          store_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
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
      app_role: "admin" | "gerente" | "vendedor"
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
      app_role: ["admin", "gerente", "vendedor"],
    },
  },
} as const
