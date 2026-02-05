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
      ai_trade_cycles: {
        Row: {
          additional_investments: Json | null
          chance_number: number | null
          created_at: string
          current_profit: number
          cycle_type: number
          end_date: string
          id: string
          investment_amount: number
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_investments?: Json | null
          chance_number?: number | null
          created_at?: string
          current_profit?: number
          cycle_type: number
          end_date: string
          id?: string
          investment_amount: number
          start_date?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          additional_investments?: Json | null
          chance_number?: number | null
          created_at?: string
          current_profit?: number
          cycle_type?: number
          end_date?: string
          id?: string
          investment_amount?: number
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_type: string
          admin_id: string
          created_at: string
          details: Json
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string
          user_agent: string | null
        }
        Insert: {
          action_type: string
          admin_id: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type: string
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          admin_id?: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      deposits: {
        Row: {
          admin_wallet_address: string
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          rejection_reason: string | null
          status: Database["public"]["Enums"]["deposit_status"]
          transaction_hash: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_wallet_address: string
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          transaction_hash?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_wallet_address?: string
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          transaction_hash?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposits_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profile_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      investments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invested_at: string
          matures_at: string
          profit: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invested_at?: string
          matures_at?: string
          profit?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invested_at?: string
          matures_at?: string
          profit?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          cycle_wallet_balance: number
          direct_earnings_balance: number
          email: string
          has_password: boolean | null
          id: string
          password_failed_attempts: number | null
          password_hash: string | null
          password_locked_until: string | null
          referral_balance: number | null
          referral_code: string
          referred_by_code: string | null
          telegram_first_name: string | null
          telegram_id: number | null
          telegram_last_name: string | null
          telegram_photo_url: string | null
          telegram_username: string | null
          total_deposits: number
          total_direct_earnings: number
          total_investment: number | null
          total_profit: number | null
          total_referral_earnings: number | null
          total_withdrawals: number
          updated_at: string | null
          wallet_balance: number
        }
        Insert: {
          created_at?: string | null
          cycle_wallet_balance?: number
          direct_earnings_balance?: number
          email: string
          has_password?: boolean | null
          id: string
          password_failed_attempts?: number | null
          password_hash?: string | null
          password_locked_until?: string | null
          referral_balance?: number | null
          referral_code: string
          referred_by_code?: string | null
          telegram_first_name?: string | null
          telegram_id?: number | null
          telegram_last_name?: string | null
          telegram_photo_url?: string | null
          telegram_username?: string | null
          total_deposits?: number
          total_direct_earnings?: number
          total_investment?: number | null
          total_profit?: number | null
          total_referral_earnings?: number | null
          total_withdrawals?: number
          updated_at?: string | null
          wallet_balance?: number
        }
        Update: {
          created_at?: string | null
          cycle_wallet_balance?: number
          direct_earnings_balance?: number
          email?: string
          has_password?: boolean | null
          id?: string
          password_failed_attempts?: number | null
          password_hash?: string | null
          password_locked_until?: string | null
          referral_balance?: number | null
          referral_code?: string
          referred_by_code?: string | null
          telegram_first_name?: string | null
          telegram_id?: number | null
          telegram_last_name?: string | null
          telegram_photo_url?: string | null
          telegram_username?: string | null
          total_deposits?: number
          total_direct_earnings?: number
          total_investment?: number | null
          total_profit?: number | null
          total_referral_earnings?: number | null
          total_withdrawals?: number
          updated_at?: string | null
          wallet_balance?: number
        }
        Relationships: []
      }
      referral_earnings_history: {
        Row: {
          amount: number
          commission_percent: number
          created_at: string
          id: string
          referral_level: number
          referred_id: string
          referrer_id: string
          source_amount: number
          source_type: string
        }
        Insert: {
          amount: number
          commission_percent: number
          created_at?: string
          id?: string
          referral_level: number
          referred_id: string
          referrer_id: string
          source_amount: number
          source_type: string
        }
        Update: {
          amount?: number
          commission_percent?: number
          created_at?: string
          id?: string
          referral_level?: number
          referred_id?: string
          referrer_id?: string
          source_amount?: number
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_earnings_history_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_earnings_history_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "user_profile_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_earnings_history_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_earnings_history_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "user_profile_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string | null
          id: string
          level: number
          referred_id: string
          referrer_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          level: number
          referred_id: string
          referrer_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          level?: number
          referred_id?: string
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "user_profile_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "user_profile_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          created_at: string
          details: Json
          email: string | null
          event_type: string
          id: string
          ip_address: string | null
          severity: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          email?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          email?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      system_config: {
        Row: {
          created_at: string | null
          description: string | null
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_trade_progress: {
        Row: {
          active_chance: number | null
          chance_1_status: string | null
          chance_2_status: string | null
          completed_cycles: number[]
          created_at: string
          id: string
          is_penalty_mode: boolean
          last_50_percent_check: string | null
          penalty_chance: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_chance?: number | null
          chance_1_status?: string | null
          chance_2_status?: string | null
          completed_cycles?: number[]
          created_at?: string
          id?: string
          is_penalty_mode?: boolean
          last_50_percent_check?: string | null
          penalty_chance?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_chance?: number | null
          chance_1_status?: string | null
          chance_2_status?: string | null
          completed_cycles?: number[]
          created_at?: string
          id?: string
          is_penalty_mode?: boolean
          last_50_percent_check?: string | null
          penalty_chance?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_transfers: {
        Row: {
          amount: number
          created_at: string
          from_wallet: string
          id: string
          to_wallet: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          from_wallet: string
          id?: string
          to_wallet: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          from_wallet?: string
          id?: string
          to_wallet?: string
          user_id?: string
        }
        Relationships: []
      }
      whale_pnl_history: {
        Row: {
          created_at: string
          id: string
          position_count: number
          snapshot_time: string
          total_pnl: number
          total_position_value: number
          wallet_address: string
        }
        Insert: {
          created_at?: string
          id?: string
          position_count?: number
          snapshot_time?: string
          total_pnl?: number
          total_position_value?: number
          wallet_address: string
        }
        Update: {
          created_at?: string
          id?: string
          position_count?: number
          snapshot_time?: string
          total_pnl?: number
          total_position_value?: number
          wallet_address?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          amount: number
          created_at: string
          id: string
          processed_at: string | null
          processed_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
          transaction_hash: string | null
          updated_at: string
          user_id: string
          wallet_address: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          transaction_hash?: string | null
          updated_at?: string
          user_id: string
          wallet_address: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          transaction_hash?: string | null
          updated_at?: string
          user_id?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "user_profile_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_safe"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      user_profile_safe: {
        Row: {
          created_at: string | null
          cycle_wallet_balance: number | null
          email: string | null
          has_password: boolean | null
          id: string | null
          referral_balance: number | null
          referral_code: string | null
          referred_by_code: string | null
          telegram_first_name: string | null
          telegram_id: number | null
          telegram_last_name: string | null
          telegram_photo_url: string | null
          telegram_username: string | null
          total_deposits: number | null
          total_investment: number | null
          total_profit: number | null
          total_referral_earnings: number | null
          total_withdrawals: number | null
          updated_at: string | null
          wallet_balance: number | null
        }
        Insert: {
          created_at?: string | null
          cycle_wallet_balance?: number | null
          email?: string | null
          has_password?: boolean | null
          id?: string | null
          referral_balance?: number | null
          referral_code?: string | null
          referred_by_code?: string | null
          telegram_first_name?: string | null
          telegram_id?: number | null
          telegram_last_name?: string | null
          telegram_photo_url?: string | null
          telegram_username?: string | null
          total_deposits?: number | null
          total_investment?: number | null
          total_profit?: number | null
          total_referral_earnings?: number | null
          total_withdrawals?: number | null
          updated_at?: string | null
          wallet_balance?: number | null
        }
        Update: {
          created_at?: string | null
          cycle_wallet_balance?: number | null
          email?: string | null
          has_password?: boolean | null
          id?: string | null
          referral_balance?: number | null
          referral_code?: string | null
          referred_by_code?: string | null
          telegram_first_name?: string | null
          telegram_id?: number | null
          telegram_last_name?: string | null
          telegram_photo_url?: string | null
          telegram_username?: string | null
          total_deposits?: number | null
          total_investment?: number | null
          total_profit?: number | null
          total_referral_earnings?: number | null
          total_withdrawals?: number | null
          updated_at?: string | null
          wallet_balance?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_investment_to_cycle: {
        Args: { p_amount: number; p_cycle_id: string }
        Returns: Json
      }
      add_manual_deposit: {
        Args: {
          admin_notes?: string
          deposit_amount: number
          target_user_id: string
        }
        Returns: undefined
      }
      add_team_income_to_cycle: {
        Args: { p_amount: number; p_cycle_id: string }
        Returns: Json
      }
      approve_deposit: { Args: { deposit_id: string }; Returns: undefined }
      approve_withdrawal: {
        Args: { withdrawal_id: string }
        Returns: undefined
      }
      can_start_cycle: {
        Args: { p_cycle_type: number; p_user_id: string }
        Returns: boolean
      }
      check_suspicious_activity: {
        Args: { p_email?: string; p_ip_address: string }
        Returns: Json
      }
      complete_current_chance: { Args: never; Returns: Json }
      complete_matured_investments: { Args: never; Returns: undefined }
      complete_trade_cycles: { Args: never; Returns: undefined }
      complete_user_matured_cycles: { Args: never; Returns: Json }
      create_referral_chain: {
        Args: { new_user_id: string; referrer_code: string }
        Returns: undefined
      }
      deactivate_chance: { Args: { p_chance_number: number }; Returns: Json }
      delete_user_account: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      distribute_deposit_commissions: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      generate_referral_code: { Args: never; Returns: string }
      get_admin_cycle_stats: { Args: never; Returns: Json }
      get_chance_status: { Args: { p_user_id: string }; Returns: Json }
      get_cycle_duration: { Args: { cycle_type: number }; Returns: number }
      get_cycle_time_unit: { Args: never; Returns: string }
      get_direct_depositors_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_my_downline: {
        Args: never
        Returns: {
          created_at: string
          email: string
          level: number
          referral_id: string
          referred_by_code: string
          referred_id: string
          referrer_id: string
          telegram_first_name: string
          telegram_last_name: string
          telegram_username: string
          total_deposits: number
          total_profit: number
          wallet_balance: number
        }[]
      }
      get_referrer_names_by_codes: {
        Args: { p_codes: string[] }
        Returns: {
          display_name: string
          referral_code: string
        }[]
      }
      get_security_stats: { Args: never; Returns: Json }
      get_unlocked_referral_levels: {
        Args: { p_user_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_admin_action: {
        Args: {
          p_action_type: string
          p_details?: Json
          p_target_id: string
          p_target_type: string
        }
        Returns: string
      }
      log_security_event: {
        Args: {
          p_details?: Json
          p_email?: string
          p_event_type: string
          p_ip_address?: string
          p_severity?: string
          p_user_agent?: string
          p_user_id?: string
        }
        Returns: string
      }
      mark_withdrawal_paid: {
        Args: { withdrawal_id: string }
        Returns: undefined
      }
      reject_deposit: {
        Args: { deposit_id: string; reason: string }
        Returns: undefined
      }
      reject_withdrawal: {
        Args: { reason: string; withdrawal_id: string }
        Returns: undefined
      }
      reset_user_data: { Args: { p_target_user_id: string }; Returns: Json }
      start_trade_cycle:
        | { Args: { p_amount: number; p_cycle_type: number }; Returns: string }
        | {
            Args: {
              p_amount: number
              p_chance_number?: number
              p_cycle_type: number
            }
            Returns: string
          }
      transfer_direct_earnings_to_cycle_wallet: {
        Args: { p_amount: number }
        Returns: Json
      }
      transfer_direct_earnings_to_main_wallet: {
        Args: { p_amount: number }
        Returns: Json
      }
      transfer_team_income_to_cycle_wallet: {
        Args: { p_amount: number }
        Returns: Json
      }
      transfer_team_income_to_main_wallet: {
        Args: { p_amount: number }
        Returns: Json
      }
      transfer_to_cycle_wallet: { Args: { p_amount: number }; Returns: Json }
      transfer_to_main_wallet: { Args: { p_amount: number }; Returns: Json }
      verify_referral_code: { Args: { code: string }; Returns: boolean }
      withdraw_early_from_cycle: { Args: { p_cycle_id: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user"
      deposit_status: "pending" | "approved" | "rejected"
      withdrawal_status: "pending" | "approved" | "rejected" | "paid"
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
      deposit_status: ["pending", "approved", "rejected"],
      withdrawal_status: ["pending", "approved", "rejected", "paid"],
    },
  },
} as const
