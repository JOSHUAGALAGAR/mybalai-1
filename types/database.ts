/**
 * Hand-written subset of the MyBalai Supabase schema.
 *
 * Covers only the tables the current build touches (auth provisioning +
 * the Properties module). Regenerate a complete version later with:
 *   npx supabase gen types typescript --project-id bufheqqxgankkzbetkty > types/database.ts
 * (requires a Supabase access token: `npx supabase login`).
 *
 * `Relationships` is intentionally left empty on every table — this codebase
 * uses flat queries only, never PostgREST embedded resources, so relationship
 * metadata is not needed for type inference.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type Timestamps = {
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      roles: {
        Row: {
          role_id: number
          role_code: string
          role_name: string
          description: string | null
          created_at: string
        }
        Insert: {
          role_id?: number
          role_code: string
          role_name: string
          description?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['roles']['Insert']>
        Relationships: []
      }
      user_accounts: {
        Row: {
          legacy_user_id: number
          auth_user_id: string | null
          email: string | null
          username: string | null
          full_name: string | null
          phone: string | null
          address: string | null
          avatar_url: string | null
          id_verified_at: string | null
          is_active: boolean
          last_login_at: string | null
        } & Timestamps
        Insert: {
          legacy_user_id?: number
          auth_user_id?: string | null
          email?: string | null
          username?: string | null
          full_name?: string | null
          phone?: string | null
          address?: string | null
          avatar_url?: string | null
          id_verified_at?: string | null
          is_active?: boolean
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['user_accounts']['Insert']>
        Relationships: []
      }
      identity_verifications: {
        Row: {
          verification_id: number
          user_id: number
          id_type: string
          front_path: string
          back_path: string
          status: string
          reject_reason: string | null
          submitted_at: string
          reviewed_by: number | null
          reviewed_at: string | null
        }
        Insert: {
          verification_id?: number
          user_id: number
          id_type: string
          front_path: string
          back_path: string
          status?: string
          reject_reason?: string | null
          submitted_at?: string
          reviewed_by?: number | null
          reviewed_at?: string | null
        }
        Update: Partial<
          Database['public']['Tables']['identity_verifications']['Insert']
        >
        Relationships: []
      }
      user_roles: {
        Row: {
          legacy_user_id: number
          role_id: number
          assigned_by: number | null
          assigned_at: string
        }
        Insert: {
          legacy_user_id: number
          role_id: number
          assigned_by?: number | null
          assigned_at?: string
        }
        Update: Partial<Database['public']['Tables']['user_roles']['Insert']>
        Relationships: []
      }
      caretaker_property_assignments: {
        Row: {
          assignment_id: number
          caretaker_id: number
          property_id: number
          assigned_by: number | null
          assigned_at: string
          unassigned_at: string | null
          is_active: boolean
        }
        Insert: {
          assignment_id?: number
          caretaker_id: number
          property_id: number
          assigned_by?: number | null
          assigned_at?: string
          unassigned_at?: string | null
          is_active?: boolean
        }
        Update: Partial<
          Database['public']['Tables']['caretaker_property_assignments']['Insert']
        >
        Relationships: []
      }
      tenant_profiles: {
        Row: {
          legacy_user_id: number
          occupation: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          notes: string | null
        } & Timestamps
        Insert: {
          legacy_user_id: number
          occupation?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['tenant_profiles']['Insert']
        >
        Relationships: []
      }
      landlord_profiles: {
        Row: {
          legacy_user_id: number
          business_name: string | null
          contact_number: string | null
          notes: string | null
        } & Timestamps
        Insert: {
          legacy_user_id: number
          business_name?: string | null
          contact_number?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['landlord_profiles']['Insert']
        >
        Relationships: []
      }
      caretaker_profiles: {
        Row: {
          legacy_user_id: number
          assigned_area: string | null
          notes: string | null
        } & Timestamps
        Insert: {
          legacy_user_id: number
          assigned_area?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['caretaker_profiles']['Insert']
        >
        Relationships: []
      }
      property_types: {
        Row: {
          property_type_id: number
          type_name: string
          description: string | null
          created_at: string
        }
        Insert: {
          property_type_id?: number
          type_name: string
          description?: string | null
          created_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['property_types']['Insert']
        >
        Relationships: []
      }
      property_statuses: {
        Row: {
          property_status_id: number
          status_code: string
          status_name: string
          description: string | null
          created_at: string
        }
        Insert: {
          property_status_id?: number
          status_code: string
          status_name: string
          description?: string | null
          created_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['property_statuses']['Insert']
        >
        Relationships: []
      }
      properties: {
        Row: {
          property_id: number
          property_name: string
          address: string
          latitude: number | null
          longitude: number | null
          google_place_id: string | null
          property_owner: number | null
          property_type_id: number | null
          status_id: number | null
          monthly_payment_rule: string | null
          booking_policy: string | null
          description: string | null
          house_rules: string | null
          contact_number: string | null
          property_image: string | null
          require_advance: boolean
          require_deposit: boolean
          payment_deadline_minutes: number
          is_verified: boolean
          is_featured: boolean
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          property_id?: number
          property_name: string
          address: string
          latitude?: number | null
          longitude?: number | null
          google_place_id?: string | null
          property_owner?: number | null
          property_type_id?: number | null
          status_id?: number | null
          monthly_payment_rule?: string | null
          booking_policy?: string | null
          description?: string | null
          house_rules?: string | null
          contact_number?: string | null
          property_image?: string | null
          require_advance?: boolean
          require_deposit?: boolean
          payment_deadline_minutes?: number
          is_verified?: boolean
          is_featured?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['properties']['Insert']>
        Relationships: []
      }
      property_images: {
        Row: {
          property_image_id: number
          property_id: number
          storage_path: string
          original_filename: string | null
          mime_type: string | null
          file_size: number | null
          is_cover: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          property_image_id?: number
          property_id: number
          storage_path: string
          original_filename?: string | null
          mime_type?: string | null
          file_size?: number | null
          is_cover?: boolean
          sort_order?: number
          created_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['property_images']['Insert']
        >
        Relationships: []
      }
      room_images: {
        Row: {
          room_image_id: number
          room_id: number
          storage_path: string
          original_filename: string | null
          mime_type: string | null
          file_size: number | null
          is_cover: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          room_image_id?: number
          room_id: number
          storage_path: string
          original_filename?: string | null
          mime_type?: string | null
          file_size?: number | null
          is_cover?: boolean
          sort_order?: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['room_images']['Insert']>
        Relationships: []
      }
      amenity_categories: {
        Row: {
          amenity_category_id: number
          category_name: string
          created_at: string
        }
        Insert: {
          amenity_category_id?: number
          category_name: string
          created_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['amenity_categories']['Insert']
        >
        Relationships: []
      }
      amenities: {
        Row: {
          amenity_id: number
          amenity_category_id: number | null
          amenity_name: string
          description: string | null
          icon: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          amenity_id?: number
          amenity_category_id?: number | null
          amenity_name: string
          description?: string | null
          icon?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['amenities']['Insert']>
        Relationships: []
      }
      property_amenities: {
        Row: {
          property_id: number
          amenity_id: number
          created_at: string
        }
        Insert: {
          property_id: number
          amenity_id: number
          created_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['property_amenities']['Insert']
        >
        Relationships: []
      }
      room_types: {
        Row: {
          room_type_id: number
          room_type_name: string
          description: string | null
          max_occupants: number | null
          created_at: string
        }
        Insert: {
          room_type_id?: number
          room_type_name: string
          description?: string | null
          max_occupants?: number | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['room_types']['Insert']>
        Relationships: []
      }
      room_statuses: {
        Row: {
          room_status_id: number
          status_code: string
          status_name: string
          description: string | null
          created_at: string
        }
        Insert: {
          room_status_id?: number
          status_code: string
          status_name: string
          description?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['room_statuses']['Insert']>
        Relationships: []
      }
      rooms: {
        Row: {
          room_id: number
          property_id: number
          room_type_id: number | null
          status_id: number | null
          room_number: string | null
          room_name: string | null
          description: string | null
          floor: string | null
          area_sqm: number | null
          max_occupants: number
          room_image: string | null
          require_advance: boolean
          require_deposit: boolean
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          room_id?: number
          property_id: number
          room_type_id?: number | null
          status_id?: number | null
          room_number?: string | null
          room_name?: string | null
          description?: string | null
          floor?: string | null
          area_sqm?: number | null
          max_occupants?: number
          room_image?: string | null
          require_advance?: boolean
          require_deposit?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['rooms']['Insert']>
        Relationships: []
      }
      bed_statuses: {
        Row: {
          bed_status_id: number
          status_code: string
          status_name: string
          description: string | null
          created_at: string
        }
        Insert: {
          bed_status_id?: number
          status_code: string
          status_name: string
          description?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['bed_statuses']['Insert']>
        Relationships: []
      }
      beds: {
        Row: {
          bed_id: number
          room_id: number
          bed_number: string
          status_id: number | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          bed_id?: number
          room_id: number
          bed_number: string
          status_id?: number | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['beds']['Insert']>
        Relationships: []
      }
      rental_rates: {
        Row: {
          rate_id: number
          property_id: number
          room_id: number
          period: string
          price: number
          valid_from: string
          valid_until: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          rate_id?: number
          property_id: number
          room_id: number
          period: string
          price?: number
          valid_from: string
          valid_until?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['rental_rates']['Insert']>
        Relationships: []
      }
      property_ratings: {
        Row: {
          rating_id: number
          property_id: number
          user_id: number
          rating: number
          review: string | null
          landlord_response: string | null
          landlord_response_by: number | null
          landlord_response_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          rating_id?: number
          property_id: number
          user_id: number
          rating: number
          review?: string | null
          landlord_response?: string | null
          landlord_response_by?: number | null
          landlord_response_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['property_ratings']['Insert']
        >
        Relationships: []
      }
      booking_extensions: {
        Row: {
          extension_id: number
          booking_id: number
          previous_check_out_date: string
          extended_check_out_date: string
          amount: number
          payment_id: number | null
          created_by: number | null
          status: string
          tenant_message: string | null
          decided_by: number | null
          decided_role: string | null
          manager_response: string | null
          decided_at: string | null
          created_at: string
        }
        Insert: {
          extension_id?: number
          booking_id: number
          previous_check_out_date: string
          extended_check_out_date: string
          amount?: number
          payment_id?: number | null
          created_by?: number | null
          status?: string
          tenant_message?: string | null
          decided_by?: number | null
          decided_role?: string | null
          manager_response?: string | null
          decided_at?: string | null
          created_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['booking_extensions']['Insert']
        >
        Relationships: []
      }
      booking_statuses: {
        Row: {
          booking_status_id: number
          status_code: string
          status_name: string
          description: string | null
          is_final: boolean
          is_inventory_blocking: boolean
          created_at: string
        }
        Insert: {
          booking_status_id?: number
          status_code: string
          status_name: string
          description?: string | null
          is_final?: boolean
          is_inventory_blocking?: boolean
          created_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['booking_statuses']['Insert']
        >
        Relationships: []
      }
      bookings: {
        Row: {
          booking_id: number
          booking_status_id: number | null
          user_id: number
          property_id: number
          rate_id: number | null
          room_id: number
          bed_id: number | null
          check_in_date: string
          check_out_date: string
          status_updated_by: number | null
          status_updated_role: string | null
          booking_message: string | null
          landlord_response: string | null
          landlord_response_by: number | null
          landlord_response_role: string | null
          landlord_response_updated_at: string | null
          submission_date: string
          total_amount: number
          currency: string
          advance_amount: number
          deposit_amount: number
          payment_due_at: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          booking_id?: number
          booking_status_id?: number | null
          user_id: number
          property_id: number
          rate_id?: number | null
          room_id: number
          bed_id?: number | null
          check_in_date: string
          check_out_date: string
          status_updated_by?: number | null
          status_updated_role?: string | null
          booking_message?: string | null
          landlord_response?: string | null
          landlord_response_by?: number | null
          landlord_response_role?: string | null
          landlord_response_updated_at?: string | null
          submission_date?: string
          total_amount?: number
          currency?: string
          advance_amount?: number
          deposit_amount?: number
          payment_due_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>
        Relationships: []
      }
      booking_beds: {
        Row: {
          booking_bed_id: number
          booking_id: number
          bed_id: number
          created_at: string
        }
        Insert: {
          booking_bed_id?: number
          booking_id: number
          bed_id: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['booking_beds']['Insert']>
        Relationships: []
      }
      booking_rate_snapshots: {
        Row: {
          booking_rate_snapshot_id: number
          booking_id: number
          rate_id: number | null
          period: string
          price: number
          valid_from: string | null
          valid_until: string | null
          created_at: string
        }
        Insert: {
          booking_rate_snapshot_id?: number
          booking_id: number
          rate_id?: number | null
          period: string
          price: number
          valid_from?: string | null
          valid_until?: string | null
          created_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['booking_rate_snapshots']['Insert']
        >
        Relationships: []
      }
      booking_status_history: {
        Row: {
          booking_status_history_id: number
          booking_id: number
          from_status_id: number | null
          to_status_id: number
          changed_by: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          booking_status_history_id?: number
          booking_id: number
          from_status_id?: number | null
          to_status_id: number
          changed_by?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['booking_status_history']['Insert']
        >
        Relationships: []
      }
      notifications: {
        Row: {
          notification_id: number
          user_id: number
          notification_type: string
          title: string
          message: string
          reference_type: string | null
          reference_id: number | null
          is_read: boolean
          read_at: string | null
          created_at: string
        }
        Insert: {
          notification_id?: number
          user_id: number
          notification_type: string
          title: string
          message: string
          reference_type?: string | null
          reference_id?: number | null
          is_read?: boolean
          read_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>
        Relationships: []
      }
      payment_methods: {
        Row: {
          payment_method_id: number
          method_code: string
          method_name: string
          description: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          payment_method_id?: number
          method_code: string
          method_name: string
          description?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['payment_methods']['Insert']
        >
        Relationships: []
      }
      payment_statuses: {
        Row: {
          payment_status_id: number
          status_code: string
          status_name: string
          description: string | null
          is_final: boolean
          created_at: string
        }
        Insert: {
          payment_status_id?: number
          status_code: string
          status_name: string
          description?: string | null
          is_final?: boolean
          created_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['payment_statuses']['Insert']
        >
        Relationships: []
      }
      payments: {
        Row: {
          payment_id: number
          payment_status_id: number | null
          booking_id: number | null
          user_id: number
          created_by_id: number | null
          created_by_role: string | null
          amount: number
          payment_method_id: number | null
          reference_number: string | null
          receipt_filename: string | null
          notes: string | null
          paid_at: string | null
          currency: string
          expires_at: string | null
          paymongo_session_id: string | null
          paymongo_payment_id: string | null
          paid_channel: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          payment_id?: number
          payment_status_id?: number | null
          booking_id?: number | null
          user_id: number
          created_by_id?: number | null
          created_by_role?: string | null
          amount?: number
          payment_method_id?: number | null
          reference_number?: string | null
          receipt_filename?: string | null
          notes?: string | null
          paid_at?: string | null
          currency?: string
          expires_at?: string | null
          paymongo_session_id?: string | null
          paymongo_payment_id?: string | null
          paid_channel?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
        Relationships: []
      }
      payment_status_history: {
        Row: {
          payment_status_history_id: number
          payment_id: number
          status: string
          status_actor_id: number | null
          status_actor_role: string | null
          created_at: string
        }
        Insert: {
          payment_status_history_id?: number
          payment_id: number
          status: string
          status_actor_id?: number | null
          status_actor_role?: string | null
          created_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['payment_status_history']['Insert']
        >
        Relationships: []
      }
      payment_receipts: {
        Row: {
          payment_receipt_id: number
          payment_id: number
          storage_path: string
          original_filename: string | null
          mime_type: string | null
          file_size: number | null
          uploaded_by: number | null
          uploaded_at: string
        }
        Insert: {
          payment_receipt_id?: number
          payment_id: number
          storage_path: string
          original_filename?: string | null
          mime_type?: string | null
          file_size?: number | null
          uploaded_by?: number | null
          uploaded_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['payment_receipts']['Insert']
        >
        Relationships: []
      }
      payment_notes: {
        Row: {
          payment_note_id: number
          payment_id: number
          author_id: number
          author_role: string
          note: string
          created_at: string
        }
        Insert: {
          payment_note_id?: number
          payment_id: number
          author_id: number
          author_role: string
          note: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['payment_notes']['Insert']>
        Relationships: []
      }
      payment_note_replies: {
        Row: {
          reply_id: number
          payment_id: number
          author_id: number
          author_role: string
          reply: string
          created_at: string
        }
        Insert: {
          reply_id?: number
          payment_id: number
          author_id: number
          author_role: string
          reply: string
          created_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['payment_note_replies']['Insert']
        >
        Relationships: []
      }
      chat_messages: {
        Row: {
          message_id: number
          sender_id: number
          receiver_id: number
          property_id: number | null
          message: string
          image_filename: string | null
          storage_path: string | null
          reply_to_message_id: number | null
          is_edited: boolean
          edited_at: string | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          message_id?: number
          sender_id: number
          receiver_id: number
          property_id?: number | null
          message: string
          image_filename?: string | null
          storage_path?: string | null
          reply_to_message_id?: number | null
          is_edited?: boolean
          edited_at?: string | null
          is_read?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['chat_messages']['Insert']>
        Relationships: []
      }
      property_inquiries: {
        Row: {
          inquiry_id: number
          property_id: number
          tenant_id: number
          landlord_id: number
          subject: string
          message: string
          response: string | null
          responder_id: number | null
          responder_role: string | null
          responded_at: string | null
          status: string
          landlord_read_at: string | null
          caretaker_read_at: string | null
          tenant_read_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          inquiry_id?: number
          property_id: number
          tenant_id: number
          landlord_id: number
          subject: string
          message: string
          response?: string | null
          responder_id?: number | null
          responder_role?: string | null
          responded_at?: string | null
          status?: string
          landlord_read_at?: string | null
          caretaker_read_at?: string | null
          tenant_read_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['property_inquiries']['Insert']
        >
        Relationships: []
      }
      subscription_plans: {
        Row: {
          plan_id: number
          code: string
          name: string
          description: string | null
          max_properties: number
          max_rooms_per_property: number
          max_beds_per_room: number
          max_caretakers: number
          price: number
          billing_interval_days: number
          is_active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          plan_id?: number
          code: string
          name: string
          description?: string | null
          max_properties?: number
          max_rooms_per_property?: number
          max_beds_per_room?: number
          max_caretakers?: number
          price?: number
          billing_interval_days?: number
          is_active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['subscription_plans']['Insert']
        >
        Relationships: []
      }
      subscription_orders: {
        Row: {
          order_id: number
          landlord_id: number
          plan_id: number
          amount: number
          currency: string
          interval_days: number
          status: string
          paymongo_session_id: string | null
          paymongo_payment_id: string | null
          paid_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          order_id?: number
          landlord_id: number
          plan_id: number
          amount?: number
          currency?: string
          interval_days?: number
          status?: string
          paymongo_session_id?: string | null
          paymongo_payment_id?: string | null
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['subscription_orders']['Insert']
        >
        Relationships: []
      }
      paymongo_events: {
        Row: {
          event_id: string
          event_type: string | null
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type?: string | null
          processed_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['paymongo_events']['Insert']
        >
        Relationships: []
      }
      landlord_subscriptions: {
        Row: {
          subscription_id: number
          landlord_id: number
          plan_id: number
          status: string
          starts_at: string
          ends_at: string | null
          assigned_by: number | null
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          subscription_id?: number
          landlord_id: number
          plan_id: number
          status?: string
          starts_at?: string
          ends_at?: string | null
          assigned_by?: number | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<
          Database['public']['Tables']['landlord_subscriptions']['Insert']
        >
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: {
      current_legacy_user_id: {
        Args: Record<string, never>
        Returns: number
      }
      create_booking: {
        Args: {
          p_user: number
          p_property: number
          p_room: number
          p_bed: number
          p_rate: number | null
          p_check_in: string
          p_check_out: string
          p_message: string | null
          p_total: number
          p_period: string
          p_price: number
          p_rate_valid_from: string | null
          p_rate_valid_until: string | null
          p_advance?: number
          p_deposit?: number
        }
        Returns: number
      }
      set_booking_status: {
        Args: {
          p_booking: number
          p_actor: number
          p_actor_role: string
          p_to_code: string
          p_response: string | null
        }
        Returns: string
      }
      create_payment: {
        Args: {
          p_user: number
          p_created_by: number
          p_created_by_role: string
          p_booking: number | null
          p_amount: number
          p_method: number | null
          p_reference: string | null
          p_paid_at: string | null
          p_note: string | null
        }
        Returns: number
      }
      set_payment_status: {
        Args: {
          p_payment: number
          p_actor: number
          p_actor_role: string
          p_to_code: string
          p_note: string | null
        }
        Returns: string
      }
      create_booking_extension: {
        Args: {
          p_booking: number
          p_requested_by: number
          p_new_check_out: string
          p_amount: number
          p_message: string | null
        }
        Returns: number
      }
      set_booking_extension_status: {
        Args: {
          p_extension: number
          p_actor: number
          p_actor_role: string
          p_to_code: string
          p_response: string | null
        }
        Returns: string
      }
      settle_booking_payment: {
        Args: { p_payment: number; p_paymongo_payment_id: string | null }
        Returns: string
      }
      fail_booking_payment: {
        Args: { p_payment: number; p_reason: string | null }
        Returns: string
      }
      expire_overdue_bookings: {
        Args: { p_booking?: number | null }
        Returns: number
      }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
