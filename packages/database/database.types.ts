/**
 * Supabase `Database` type for the `public` schema.
 *
 * GENERATED from packages/database/supabase/migrations by scripts/db/gen-types.sh. Do not edit by
 * hand: change a migration, then regenerate. scripts/db/test.sh fails when this
 * file is out of date. Format matches `supabase gen types typescript`
 * (postgrest-js v2), minus the runtime `Constants` export (this file is types-only).
 */
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
    PostgrestVersion: "12"
  }
  public: {
    Tables: {
      appointment_events: {
        Row: {
          actor: Database["public"]["Enums"]["actor_type"]
          actor_id: string | null
          appointment_id: string
          business_id: string
          created_at: string
          id: string
          occurred_at: string
          payload: Json
          type: Database["public"]["Enums"]["appointment_event_type"]
        }
        Insert: {
          actor: Database["public"]["Enums"]["actor_type"]
          actor_id?: string | null
          appointment_id: string
          business_id: string
          created_at?: string
          id?: string
          occurred_at?: string
          payload?: Json
          type: Database["public"]["Enums"]["appointment_event_type"]
        }
        Update: {
          actor?: Database["public"]["Enums"]["actor_type"]
          actor_id?: string | null
          appointment_id?: string
          business_id?: string
          created_at?: string
          id?: string
          occurred_at?: string
          payload?: Json
          type?: Database["public"]["Enums"]["appointment_event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "appointment_events_appointment_id_fkey"
            columns: ["business_id", "appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "appointment_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          blocked: unknown
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          client_confirmed_at: string | null
          client_confirmed_via: string | null
          client_notify_after: string | null
          voided_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          ends_at: string
          id: string
          idempotency_key: string | null
          notes: string | null
          price_cents: number
          service_id: string
          slot: unknown
          source: Database["public"]["Enums"]["appointment_source"]
          staff_id: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          blocked: unknown
          business_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          checked_in_at?: string | null
          client_confirmed_at: string | null
          client_confirmed_via: string | null
          client_notify_after: string | null
          voided_at: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          duration_minutes: number
          ends_at?: never
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          price_cents: number
          service_id: string
          slot: unknown
          source: Database["public"]["Enums"]["appointment_source"]
          staff_id: string
          starts_at?: never
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          blocked?: unknown
          business_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          checked_in_at?: string | null
          client_confirmed_at?: string | null
          client_confirmed_via?: string | null
          client_notify_after?: string | null
          voided_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          ends_at?: never
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          price_cents?: number
          service_id?: string
          slot?: unknown
          source?: Database["public"]["Enums"]["appointment_source"]
          staff_id?: string
          starts_at?: never
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["business_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["business_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "appointments_staff_id_fkey"
            columns: ["business_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      attendance_checks: {
        Row: {
          answered_at: string | null
          answered_by: string | null
          appointment_id: string
          audience: string
          business_id: string
          created_at: string
          escalated_at: string | null
          id: string
          notified_at: string | null
          outcome: string | null
          recipient_user_id: string | null
          status: string
        }
        Insert: {
          answered_at?: string | null
          answered_by?: string | null
          appointment_id: string
          audience: string
          business_id: string
          created_at?: string
          escalated_at?: string | null
          id?: string
          notified_at?: string | null
          outcome?: string | null
          recipient_user_id?: string | null
          status?: string
        }
        Update: {
          answered_at?: string | null
          answered_by?: string | null
          appointment_id?: string
          audience?: string
          business_id?: string
          created_at?: string
          escalated_at?: string | null
          id?: string
          notified_at?: string | null
          outcome?: string | null
          recipient_user_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_checks_appointment_fkey"
            columns: ["business_id", "appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "attendance_checks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_checks_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_pushes: {
        Row: {
          business_id: string
          check_ids: string[]
          id: string
          kind: string
          local_date: string
          sent_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          check_ids?: string[]
          id?: string
          kind: string
          local_date: string
          sent_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          check_ids?: string[]
          id?: string
          kind?: string
          local_date?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_pushes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: Database["public"]["Enums"]["actor_type"]
          actor_id: string | null
          business_id: string | null
          created_at: string
          diff: Json | null
          entity: string
          entity_id: string | null
          id: number
          occurred_at: string
          request_id: string | null
        }
        Insert: {
          action: string
          actor?: Database["public"]["Enums"]["actor_type"]
          actor_id?: string | null
          business_id?: string | null
          created_at?: string
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
          occurred_at?: string
          request_id?: string | null
        }
        Update: {
          action?: string
          actor?: Database["public"]["Enums"]["actor_type"]
          actor_id?: string | null
          business_id?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
          occurred_at?: string
          request_id?: string | null
        }
        Relationships: []
      }
      availability_overrides: {
        Row: {
          business_id: string
          created_at: string
          date: string
          end_time: string | null
          id: string
          is_closed: boolean
          reason: string | null
          staff_id: string
          start_time: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          date: string
          end_time?: string | null
          id?: string
          is_closed?: boolean
          reason?: string | null
          staff_id: string
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          date?: string
          end_time?: string | null
          id?: string
          is_closed?: boolean
          reason?: string | null
          staff_id?: string
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_overrides_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_overrides_staff_id_fkey"
            columns: ["business_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          business_id: string
          created_at: string
          end_time: string
          id: string
          staff_id: string
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          business_id: string
          created_at?: string
          end_time: string
          id?: string
          staff_id: string
          start_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          business_id?: string
          created_at?: string
          end_time?: string
          id?: string
          staff_id?: string
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_rules_staff_id_fkey"
            columns: ["business_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      booking_attempts: {
        Row: {
          appointment_id: string | null
          business_id: string
          channel: Database["public"]["Enums"]["booking_channel"]
          client_id: string | null
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          error_code: string | null
          id: string
          outcome: Database["public"]["Enums"]["attempt_outcome"]
          session_key: string | null
          started_at: string
          step_count: number
          steps: Json
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          business_id: string
          channel: Database["public"]["Enums"]["booking_channel"]
          client_id?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          outcome?: Database["public"]["Enums"]["attempt_outcome"]
          session_key?: string | null
          started_at?: string
          step_count?: number
          steps?: Json
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          business_id?: string
          channel?: Database["public"]["Enums"]["booking_channel"]
          client_id?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          outcome?: Database["public"]["Enums"]["attempt_outcome"]
          session_key?: string | null
          started_at?: string
          step_count?: number
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_attempts_appointment_id_fkey"
            columns: ["business_id", "appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "booking_attempts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_attempts_client_id_fkey"
            columns: ["business_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "booking_attempts_conversation_id_fkey"
            columns: ["business_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      business_hours: {
        Row: {
          business_id: string
          closes_at: string
          created_at: string
          id: string
          opens_at: string
          updated_at: string
          weekday: number
        }
        Insert: {
          business_id: string
          closes_at: string
          created_at?: string
          id?: string
          opens_at: string
          updated_at?: string
          weekday: number
        }
        Update: {
          business_id?: string
          closes_at?: string
          created_at?: string
          id?: string
          opens_at?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_special_days: {
        Row: {
          business_id: string
          created_at: string
          date: string
          end_time: string | null
          id: string
          is_closed: boolean
          kind: Database["public"]["Enums"]["special_day_kind"]
          name: string
          start_time: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          date: string
          end_time?: string | null
          id?: string
          is_closed?: boolean
          kind: Database["public"]["Enums"]["special_day_kind"]
          name: string
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          date?: string
          end_time?: string | null
          id?: string
          is_closed?: boolean
          kind?: Database["public"]["Enums"]["special_day_kind"]
          name?: string
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_special_days_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          attendance_mode: string
          booking_rules: Json
          clerk_org_id: string
          created_at: string
          currency: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          nerova_account_id: string | null
          onboarded_at: string | null
          phone: string | null
          plan: Database["public"]["Enums"]["plan_key"]
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          attendance_mode?: string
          booking_rules?: Json
          clerk_org_id: string
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          nerova_account_id?: string | null
          onboarded_at?: string | null
          phone?: string | null
          plan?: Database["public"]["Enums"]["plan_key"]
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          attendance_mode?: string
          booking_rules?: Json
          clerk_org_id?: string
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          nerova_account_id?: string | null
          onboarded_at?: string | null
          phone?: string | null
          plan?: Database["public"]["Enums"]["plan_key"]
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_notes: {
        Row: {
          body: string
          business_id: string
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          updated_at: string
        }
        Insert: {
          body: string
          business_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          updated_at?: string
        }
        Update: {
          body?: string
          business_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["business_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      clients: {
        Row: {
          business_id: string
          created_at: string
          email: string | null
          first_seen_at: string
          id: string
          is_blocked: boolean
          last_seen_at: string | null
          name: string | null
          notes: string | null
          phone_e164: string
          tags: string[]
          updated_at: string
          whatsapp_opt_in: boolean
        }
        Insert: {
          business_id: string
          created_at?: string
          email?: string | null
          first_seen_at?: string
          id?: string
          is_blocked?: boolean
          last_seen_at?: string | null
          name?: string | null
          notes?: string | null
          phone_e164: string
          tags?: string[]
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string | null
          first_seen_at?: string
          id?: string
          is_blocked?: boolean
          last_seen_at?: string | null
          name?: string | null
          notes?: string | null
          phone_e164?: string
          tags?: string[]
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          business_id: string
          client_id: string
          context: Json
          created_at: string
          id: string
          invalid_input_count: number
          last_inbound_at: string | null
          last_message_at: string | null
          state: string
          updated_at: string
          version: number
          window_expires_at: string | null
        }
        Insert: {
          business_id: string
          client_id: string
          context?: Json
          created_at?: string
          id?: string
          invalid_input_count?: number
          last_inbound_at?: string | null
          last_message_at?: string | null
          state?: string
          updated_at?: string
          version?: number
          window_expires_at?: string | null
        }
        Update: {
          business_id?: string
          client_id?: string
          context?: Json
          created_at?: string
          id?: string
          invalid_input_count?: number
          last_inbound_at?: string | null
          last_message_at?: string | null
          state?: string
          updated_at?: string
          version?: number
          window_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["business_id", "client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      device_push_tokens: {
        Row: {
          business_id: string
          created_at: string
          id: string
          platform: string | null
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          platform?: string | null
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          platform?: string | null
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_push_tokens_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      escalations: {
        Row: {
          assigned_user_id: string | null
          business_id: string
          client_id: string
          conversation_id: string
          created_at: string
          id: string
          note: string | null
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["escalation_status"]
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          business_id: string
          client_id: string
          conversation_id: string
          created_at?: string
          id?: string
          note?: string | null
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["escalation_status"]
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          business_id?: string
          client_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          note?: string | null
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["escalation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_client_id_fkey"
            columns: ["business_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "escalations_conversation_id_fkey"
            columns: ["business_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          business_id: string | null
          created_at: string
          endpoint: string
          expires_at: string
          key: string
          request_hash: string
          response: Json | null
          status_code: number | null
          updated_at: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          endpoint: string
          expires_at?: string
          key: string
          request_hash: string
          response?: Json | null
          status_code?: number | null
          updated_at?: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          endpoint?: string
          expires_at?: string
          key?: string
          request_hash?: string
          response?: Json | null
          status_code?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          business_id: string
          category: string | null
          components: Json | null
          created_at: string
          id: string
          language: string
          meta_template_id: string | null
          name: string
          rejection_reason: string | null
          status: Database["public"]["Enums"]["template_status"]
          updated_at: string
          whatsapp_account_id: string
        }
        Insert: {
          business_id: string
          category?: string | null
          components?: Json | null
          created_at?: string
          id?: string
          language?: string
          meta_template_id?: string | null
          name: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["template_status"]
          updated_at?: string
          whatsapp_account_id: string
        }
        Update: {
          business_id?: string
          category?: string | null
          components?: Json | null
          created_at?: string
          id?: string
          language?: string
          meta_template_id?: string | null
          name?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["template_status"]
          updated_at?: string
          whatsapp_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_whatsapp_account_id_fkey"
            columns: ["business_id", "whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      messages: {
        Row: {
          body: Json
          business_id: string
          conversation_id: string
          created_at: string
          delivered_at: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          error: Json | null
          id: string
          read_at: string | null
          sent_at: string | null
          sent_by: string | null
          status: Database["public"]["Enums"]["message_status"]
          type: Database["public"]["Enums"]["message_type"]
          updated_at: string
          wa_message_id: string | null
        }
        Insert: {
          body: Json
          business_id: string
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          error?: Json | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status: Database["public"]["Enums"]["message_status"]
          type: Database["public"]["Enums"]["message_type"]
          updated_at?: string
          wa_message_id?: string | null
        }
        Update: {
          body?: Json
          business_id?: string
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: Database["public"]["Enums"]["message_direction"]
          error?: Json | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          type?: Database["public"]["Enums"]["message_type"]
          updated_at?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["business_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      plan_features: {
        Row: {
          feature: string
          monthly_limit: number | null
          plan: Database["public"]["Enums"]["plan_key"]
        }
        Insert: {
          feature: string
          monthly_limit?: number | null
          plan: Database["public"]["Enums"]["plan_key"]
        }
        Update: {
          feature?: string
          monthly_limit?: number | null
          plan?: Database["public"]["Enums"]["plan_key"]
        }
        Relationships: []
      }
      product_update_views: {
        Row: {
          update_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          update_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          update_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_update_views_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "product_updates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_update_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_updates: {
        Row: {
          action: Json | null
          body: string
          created_at: string
          demo: string | null
          id: string
          released_at: string
          status: string
          tags: Json
          title: string
          tone: string
        }
        Insert: {
          action?: Json | null
          body: string
          created_at?: string
          demo?: string | null
          id: string
          released_at: string
          status?: string
          tags?: Json
          title: string
          tone?: string
        }
        Update: {
          action?: Json | null
          body?: string
          created_at?: string
          demo?: string | null
          id?: string
          released_at?: string
          status?: string
          tags?: Json
          title?: string
          tone?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          business_id: string
          category: string | null
          created_at: string
          deposit_cents: number
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          price_cents: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_id: string
          category?: string | null
          created_at?: string
          deposit_cents?: number
          description?: string | null
          duration_minutes: number
          id?: string
          is_active?: boolean
          name: string
          price_cents?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          category?: string | null
          created_at?: string
          deposit_cents?: number
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          accepts_bookings: boolean
          business_id: string
          color: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          photo_url: string | null
          sort_order: number
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepts_bookings?: boolean
          business_id: string
          color?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          photo_url?: string | null
          sort_order?: number
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepts_bookings?: boolean
          business_id?: string
          color?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          photo_url?: string | null
          sort_order?: number
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_breaks: {
        Row: {
          business_id: string
          created_at: string
          end_time: string
          id: string
          label: string
          staff_id: string
          start_time: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          business_id: string
          created_at?: string
          end_time: string
          id?: string
          label?: string
          staff_id: string
          start_time: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          business_id?: string
          created_at?: string
          end_time?: string
          id?: string
          label?: string
          staff_id?: string
          start_time?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "staff_breaks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_breaks_staff_id_fkey"
            columns: ["business_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      staff_services: {
        Row: {
          business_id: string
          created_at: string
          service_id: string
          staff_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          service_id: string
          staff_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          service_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_service_id_fkey"
            columns: ["business_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "staff_services_staff_id_fkey"
            columns: ["business_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      staff_time_off: {
        Row: {
          business_id: string
          created_at: string
          end_time: string | null
          ends_on: string
          id: string
          note: string | null
          reason: Database["public"]["Enums"]["time_off_reason"]
          staff_id: string
          start_time: string | null
          starts_on: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          end_time?: string | null
          ends_on: string
          id?: string
          note?: string | null
          reason?: Database["public"]["Enums"]["time_off_reason"]
          staff_id: string
          start_time?: string | null
          starts_on: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          end_time?: string | null
          ends_on?: string
          id?: string
          note?: string | null
          reason?: Database["public"]["Enums"]["time_off_reason"]
          staff_id?: string
          start_time?: string | null
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_time_off_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_off_staff_id_fkey"
            columns: ["business_id", "staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      stories: {
        Row: {
          business_id: string
          cards: Json
          expires_at: string
          generated_at: string
          id: string
          kind: string
          period_key: string
          tone: string
        }
        Insert: {
          business_id: string
          cards: Json
          expires_at: string
          generated_at?: string
          id?: string
          kind: string
          period_key: string
          tone: string
        }
        Update: {
          business_id?: string
          cards?: Json
          expires_at?: string
          generated_at?: string
          id?: string
          kind?: string
          period_key?: string
          tone?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      story_events: {
        Row: {
          at: string
          business_id: string
          card_index: number
          event: string
          id: string
          story_id: string | null
          story_kind: string
          user_id: string
        }
        Insert: {
          at?: string
          business_id: string
          card_index?: number
          event: string
          id?: string
          story_id?: string | null
          story_kind: string
          user_id: string
        }
        Update: {
          at?: string
          business_id?: string
          card_index?: number
          event?: string
          id?: string
          story_id?: string | null
          story_kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_events_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          last_card_index: number
          story_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          last_card_index?: number
          story_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          last_card_index?: number
          story_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          business_id: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          role: Database["public"]["Enums"]["member_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          business_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          business_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_device_tokens: {
        Row: {
          business_id: string
          created_at: string
          device_label: string
          id: string
          last_used_at: string | null
          revoked_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          device_label?: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          device_label?: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_device_tokens_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          event_key: string
          id: string
          payload: Json
          processed_at: string | null
          received_at: string
          source: string
          updated_at: string
          whatsapp_account_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          event_key: string
          id?: string
          payload: Json
          processed_at?: string | null
          received_at?: string
          source: string
          updated_at?: string
          whatsapp_account_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          event_key?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          source?: string
          updated_at?: string
          whatsapp_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_whatsapp_account_id_fkey"
            columns: ["whatsapp_account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_accounts: {
        Row: {
          access_token_ciphertext: string | null
          business_id: string
          created_at: string
          display_phone: string | null
          flow_ids: Json
          id: string
          last_error: string | null
          last_health_check_at: string | null
          messaging_limit: string | null
          phone_number_id: string
          quality_rating: string | null
          status: Database["public"]["Enums"]["wa_account_status"]
          token_expires_at: string | null
          updated_at: string
          verified_name: string | null
          waba_id: string
        }
        Insert: {
          access_token_ciphertext?: string | null
          business_id: string
          created_at?: string
          display_phone?: string | null
          flow_ids?: Json
          id?: string
          last_error?: string | null
          last_health_check_at?: string | null
          messaging_limit?: string | null
          phone_number_id: string
          quality_rating?: string | null
          status?: Database["public"]["Enums"]["wa_account_status"]
          token_expires_at?: string | null
          updated_at?: string
          verified_name?: string | null
          waba_id: string
        }
        Update: {
          access_token_ciphertext?: string | null
          business_id?: string
          created_at?: string
          display_phone?: string | null
          flow_ids?: Json
          id?: string
          last_error?: string | null
          last_health_check_at?: string | null
          messaging_limit?: string | null
          phone_number_id?: string
          quality_rating?: string | null
          status?: Database["public"]["Enums"]["wa_account_status"]
          token_expires_at?: string | null
          updated_at?: string
          verified_name?: string | null
          waba_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      attendance_due_appointments: {
        Args: {
          p_ended_after: string
          p_ended_before: string
          p_limit: number
        }
        Returns: {
          appointment_id: string
          business_id: string
          checked_in_at: string
          client_name: string
          ends_at: string
          service_name: string
          staff_user_id: string
          starts_at: string
        }[]
      }
      business_features: {
        Args: {
          p_business_id?: string
        }
        Returns: {
          feature: string
          monthly_limit: number
          plan: Database["public"]["Enums"]["plan_key"]
        }[]
      }
      cancel_appointment: {
        Args: {
          p_actor: Database["public"]["Enums"]["actor_type"]
          p_actor_id: string
          p_appointment_id: string
          p_reason?: string
        }
        Returns: {
          blocked: unknown
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          client_confirmed_at: string | null
          client_confirmed_via: string | null
          client_notify_after: string | null
          voided_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          ends_at: string
          id: string
          idempotency_key: string | null
          notes: string | null
          price_cents: number
          service_id: string
          slot: unknown
          source: Database["public"]["Enums"]["appointment_source"]
          staff_id: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_due_client_notifications: {
        Args: {
          p_limit?: number
          p_now: string
        }
        Returns: {
          appointment_id: string
          business_id: string
          client_id: string
          status: Database["public"]["Enums"]["appointment_status"]
          voided: boolean
        }[]
      }
      void_appointment: {
        Args: {
          p_actor: Database["public"]["Enums"]["actor_type"]
          p_actor_id: string
          p_appointment_id: string
        }
        Returns: {
          blocked: unknown
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          client_confirmed_at: string | null
          client_confirmed_via: string | null
          client_notify_after: string | null
          voided_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          ends_at: string
          id: string
          idempotency_key: string | null
          notes: string | null
          price_cents: number
          service_id: string
          slot: unknown
          source: Database["public"]["Enums"]["appointment_source"]
          staff_id: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_in_appointment: {
        Args: {
          p_actor_id: string
          p_appointment_id: string
        }
        Returns: {
          blocked: unknown
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          client_confirmed_at: string | null
          client_confirmed_via: string | null
          client_notify_after: string | null
          voided_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          ends_at: string
          id: string
          idempotency_key: string | null
          notes: string | null
          price_cents: number
          service_id: string
          slot: unknown
          source: Database["public"]["Enums"]["appointment_source"]
          staff_id: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_due_reminders: {
        Args: {
          p_limit?: number
          p_now: string
        }
        Returns: {
          appointment_id: string
          business_id: string
          client_id: string
          offset_minutes: number
          starts_at: string
        }[]
      }
      complete_onboarding: {
        Args: {
          p_business_id: string
          p_hours: Json
          p_owner_name: string
          p_services: Json
          p_team: Json
          p_user_id: string
        }
        Returns: boolean
      }
      completed_jobs_in_month: {
        Args: {
          p_business_id: string
          p_month: string
          p_now?: string
        }
        Returns: number
      }
      confirm_appointment_by_client: {
        Args: {
          p_actor: Database["public"]["Enums"]["actor_type"]
          p_actor_id: string
          p_appointment_id: string
          p_business_id: string
          p_confirmed_at: string
          p_idempotency_key: string
          p_via: string
        }
        Returns: {
          blocked: unknown
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          client_confirmed_at: string | null
          client_confirmed_via: string | null
          client_notify_after: string | null
          voided_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          ends_at: string
          id: string
          idempotency_key: string | null
          notes: string | null
          price_cents: number
          service_id: string
          slot: unknown
          source: Database["public"]["Enums"]["appointment_source"]
          staff_id: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_appointment: {
        Args: {
          p_actor: Database["public"]["Enums"]["actor_type"]
          p_actor_id: string
          p_business_id: string
          p_client_id: string
          p_idempotency_key: string
          p_notes?: string
          p_service_id: string
          p_source: Database["public"]["Enums"]["appointment_source"]
          p_staff_id: string
          p_starts_at: string
        }
        Returns: {
          blocked: unknown
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          client_confirmed_at: string | null
          client_confirmed_via: string | null
          client_notify_after: string | null
          voided_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          ends_at: string
          id: string
          idempotency_key: string | null
          notes: string | null
          price_cents: number
          service_id: string
          slot: unknown
          source: Database["public"]["Enums"]["appointment_source"]
          staff_id: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dashboard_summary: {
        Args: {
          p_date: string
        }
        Returns: Json
      }
      month_report: {
        Args: {
          p_business_id: string
          p_month: string
          p_now?: string
        }
        Returns: Json
      }
      record_audit_event: {
        Args: {
          p_action: string
          p_actor_id: string
          p_business_id: string
          p_diff?: Json
          p_entity: string
          p_entity_id: string
          p_request_id?: string
        }
        Returns: undefined
      }
      replace_business_hours: {
        Args: {
          p_business_id: string
          p_rows: Json
        }
        Returns: {
          business_id: string
          closes_at: string
          created_at: string
          id: string
          opens_at: string
          updated_at: string
          weekday: number
        }[]
        SetofOptions: {
          from: "*"
          to: "business_hours"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      replace_staff_availability: {
        Args: {
          p_rows: Json
          p_staff_id: string
        }
        Returns: {
          business_id: string
          created_at: string
          end_time: string
          id: string
          staff_id: string
          start_time: string
          updated_at: string
          weekday: number
        }[]
        SetofOptions: {
          from: "*"
          to: "availability_rules"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      replace_staff_breaks: {
        Args: {
          p_rows: Json
          p_staff_id: string
        }
        Returns: {
          business_id: string
          created_at: string
          end_time: string
          id: string
          label: string
          staff_id: string
          start_time: string
          updated_at: string
          weekdays: number[]
        }[]
        SetofOptions: {
          from: "*"
          to: "staff_breaks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      replace_staff_services: {
        Args: {
          p_service_ids: string[]
          p_staff_id: string
        }
        Returns: {
          business_id: string
          created_at: string
          service_id: string
          staff_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "staff_services"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reschedule_appointment: {
        Args: {
          p_actor: Database["public"]["Enums"]["actor_type"]
          p_actor_id: string
          p_appointment_id: string
          p_staff_id?: string
          p_starts_at: string
        }
        Returns: {
          blocked: unknown
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          client_confirmed_at: string | null
          client_confirmed_via: string | null
          client_notify_after: string | null
          voided_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          ends_at: string
          id: string
          idempotency_key: string | null
          notes: string | null
          price_cents: number
          service_id: string
          slot: unknown
          source: Database["public"]["Enums"]["appointment_source"]
          staff_id: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_appointment_status: {
        Args: {
          p_actor: Database["public"]["Enums"]["actor_type"]
          p_actor_id: string
          p_appointment_id: string
          p_status: Database["public"]["Enums"]["appointment_status"]
        }
        Returns: {
          blocked: unknown
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          client_confirmed_at: string | null
          client_confirmed_via: string | null
          client_notify_after: string | null
          voided_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number
          ends_at: string
          id: string
          idempotency_key: string | null
          notes: string | null
          price_cents: number
          service_id: string
          slot: unknown
          source: Database["public"]["Enums"]["appointment_source"]
          staff_id: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_request_context: {
        Args: {
          p_actor_id: string
          p_request_id: string
        }
        Returns: undefined
      }
      upsert_client_by_phone: {
        Args: {
          p_business_id: string
          p_name?: string
          p_phone_e164: string
        }
        Returns: {
          business_id: string
          created_at: string
          email: string | null
          first_seen_at: string
          id: string
          is_blocked: boolean
          last_seen_at: string | null
          name: string | null
          notes: string | null
          phone_e164: string
          tags: string[]
          updated_at: string
          whatsapp_opt_in: boolean
        }
        SetofOptions: {
          from: "*"
          to: "clients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      actor_type: "customer" | "staff" | "system" | "nerova"
      appointment_event_type: "created" | "voided" | "rescheduled" | "cancelled" | "completed" | "no_show" | "checked_in" | "reminder_sent" | "confirmation_sent" | "notes_updated" | "client_confirmed"
      appointment_source: "whatsapp" | "app" | "web" | "nerova"
      appointment_status: "confirmed" | "cancelled" | "completed" | "no_show"
      attempt_outcome: "in_progress" | "completed" | "abandoned" | "failed"
      booking_channel: "whatsapp" | "web" | "app"
      escalation_status: "open" | "resolved"
      member_role: "owner" | "staff"
      message_direction: "in" | "out"
      message_status: "received" | "queued" | "sent" | "delivered" | "read" | "failed"
      message_type: "text" | "interactive" | "flow" | "template" | "button" | "reaction" | "media" | "unknown"
      plan_key: "free" | "starter" | "growth" | "pro"
      special_day_kind: "public_holiday" | "closure" | "special_hours"
      template_status: "draft" | "submitted" | "approved" | "rejected" | "paused" | "disabled"
      time_off_reason: "leave" | "sick" | "training" | "other"
      wa_account_status: "pending" | "live" | "needs_reauth" | "disconnected" | "paused"
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
