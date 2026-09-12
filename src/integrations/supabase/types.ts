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
      agent_preferences: {
        Row: {
          competitive_intelligence_enabled: boolean | null
          created_at: string | null
          id: string
          last_scan_at: string | null
          organization_id: string
          scan_frequency: string | null
          updated_at: string | null
        }
        Insert: {
          competitive_intelligence_enabled?: boolean | null
          created_at?: string | null
          id?: string
          last_scan_at?: string | null
          organization_id: string
          scan_frequency?: string | null
          updated_at?: string | null
        }
        Update: {
          competitive_intelligence_enabled?: boolean | null
          created_at?: string | null
          id?: string
          last_scan_at?: string | null
          organization_id?: string
          scan_frequency?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_suggestions_log: {
        Row: {
          accepted: boolean | null
          dismissed: boolean | null
          framework_id: string | null
          id: string
          organization_id: string | null
          responded_at: string | null
          shown_at: string | null
          suggestion_content: string
          suggestion_type: string
          trigger_context: Json | null
          user_id: string | null
        }
        Insert: {
          accepted?: boolean | null
          dismissed?: boolean | null
          framework_id?: string | null
          id?: string
          organization_id?: string | null
          responded_at?: string | null
          shown_at?: string | null
          suggestion_content: string
          suggestion_type: string
          trigger_context?: Json | null
          user_id?: string | null
        }
        Update: {
          accepted?: boolean | null
          dismissed?: boolean | null
          framework_id?: string | null
          id?: string
          organization_id?: string | null
          responded_at?: string | null
          shown_at?: string | null
          suggestion_content?: string
          suggestion_type?: string
          trigger_context?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_suggestions_log_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "librarian_frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_suggestions_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      best_bottles_image_reconciliations: {
        Row: {
          asset_role: string
          baseline_delta_px: number | null
          canvas_height_px: number | null
          canvas_width_px: number | null
          catalog_truth: Json | null
          catalog_truth_hash: string | null
          center_delta_pct: number | null
          center_x_pct: number | null
          created_at: string
          detected_baseline_y_px: number | null
          family: string | null
          fill_height_pct: number | null
          final_image_hash: string | null
          final_image_url: string | null
          framing_decision: string | null
          framing_qa: Json | null
          grace_sku: string | null
          image_id: string
          last_error: string | null
          lifecycle_state: string
          mask_controlled: boolean
          object_bounds: Json | null
          organization_id: string
          pre_transform_baseline_y_px: number | null
          pre_transform_object_bounds: Json | null
          prompt_hash: string | null
          prompt_version: string | null
          provider_model: string | null
          qa_completed_at: string | null
          qa_issues: string[]
          raw_image_url: string
          reconciled_at: string | null
          requires_pipeline_reconciliation: boolean
          rig_version: string | null
          rigged_at: string | null
          scale_factor: number | null
          shadow_owner: string
          shadow_qa: Json | null
          shadow_report_hash: string | null
          shadow_topology: Json | null
          shadow_topology_hash: string | null
          shift_x_px: number | null
          shift_y_px: number | null
          source_reference_hash: string | null
          source_reference_url: string | null
          target_baseline_y_px: number | null
          target_center_x_pct: number | null
          transform_control_bounds: Json | null
          updated_at: string
          website_sku: string | null
        }
        Insert: {
          asset_role?: string
          baseline_delta_px?: number | null
          canvas_height_px?: number | null
          canvas_width_px?: number | null
          catalog_truth?: Json | null
          catalog_truth_hash?: string | null
          center_delta_pct?: number | null
          center_x_pct?: number | null
          created_at?: string
          detected_baseline_y_px?: number | null
          family?: string | null
          fill_height_pct?: number | null
          final_image_hash?: string | null
          final_image_url?: string | null
          framing_decision?: string | null
          framing_qa?: Json | null
          grace_sku?: string | null
          image_id: string
          last_error?: string | null
          lifecycle_state?: string
          mask_controlled?: boolean
          object_bounds?: Json | null
          organization_id: string
          pre_transform_baseline_y_px?: number | null
          pre_transform_object_bounds?: Json | null
          prompt_hash?: string | null
          prompt_version?: string | null
          provider_model?: string | null
          qa_completed_at?: string | null
          qa_issues?: string[]
          raw_image_url: string
          reconciled_at?: string | null
          requires_pipeline_reconciliation?: boolean
          rig_version?: string | null
          rigged_at?: string | null
          scale_factor?: number | null
          shadow_owner?: string
          shadow_qa?: Json | null
          shadow_report_hash?: string | null
          shadow_topology?: Json | null
          shadow_topology_hash?: string | null
          shift_x_px?: number | null
          shift_y_px?: number | null
          source_reference_hash?: string | null
          source_reference_url?: string | null
          target_baseline_y_px?: number | null
          target_center_x_pct?: number | null
          transform_control_bounds?: Json | null
          updated_at?: string
          website_sku?: string | null
        }
        Update: {
          asset_role?: string
          baseline_delta_px?: number | null
          canvas_height_px?: number | null
          canvas_width_px?: number | null
          catalog_truth?: Json | null
          catalog_truth_hash?: string | null
          center_delta_pct?: number | null
          center_x_pct?: number | null
          created_at?: string
          detected_baseline_y_px?: number | null
          family?: string | null
          fill_height_pct?: number | null
          final_image_hash?: string | null
          final_image_url?: string | null
          framing_decision?: string | null
          framing_qa?: Json | null
          grace_sku?: string | null
          image_id?: string
          last_error?: string | null
          lifecycle_state?: string
          mask_controlled?: boolean
          object_bounds?: Json | null
          organization_id?: string
          pre_transform_baseline_y_px?: number | null
          pre_transform_object_bounds?: Json | null
          prompt_hash?: string | null
          prompt_version?: string | null
          provider_model?: string | null
          qa_completed_at?: string | null
          qa_issues?: string[]
          raw_image_url?: string
          reconciled_at?: string | null
          requires_pipeline_reconciliation?: boolean
          rig_version?: string | null
          rigged_at?: string | null
          scale_factor?: number | null
          shadow_owner?: string
          shadow_qa?: Json | null
          shadow_report_hash?: string | null
          shadow_topology?: Json | null
          shadow_topology_hash?: string | null
          shift_x_px?: number | null
          shift_y_px?: number | null
          source_reference_hash?: string | null
          source_reference_url?: string | null
          target_baseline_y_px?: number | null
          target_center_x_pct?: number | null
          transform_control_bounds?: Json | null
          updated_at?: string
          website_sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "best_bottles_image_reconciliations_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: true
            referencedRelation: "generated_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_bottles_image_reconciliations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      best_bottles_material_pilot_attempts: {
        Row: {
          actual_cost_usd: number | null
          asset_role: string
          attempt_ordinal: number
          automated_decision: string | null
          background_mutated: boolean
          canonical_truth: Json
          canonical_truth_hash: string
          code_version: string | null
          cost_currency: string
          created_at: string
          duration_ms: number | null
          endpoint_identifier: string
          error_message: string | null
          estimated_cost_usd: number
          failure_code: string | null
          failure_reasons: string[]
          failure_stage: string | null
          family: string
          final_image_hash: string | null
          final_image_url: string | null
          framing_qa: Json | null
          function_version: string | null
          gateway_provider: string
          grace_sku: string
          id: string
          job_key: string
          model_identifier: string
          native_bone_qa: Json | null
          organization_id: string
          price_card_version: string | null
          prompt_hash: string
          prompt_text: string
          prompt_version: string
          provider_completed_at: string | null
          provider_request_id: string | null
          provider_response_metadata: Json
          provider_started_at: string | null
          publish_eligible: boolean
          qa_completed_at: string | null
          queued_at: string
          raw_image_hash: string | null
          raw_image_url: string | null
          reference_manifest: Json
          renderer_id: string
          request_parameters: Json
          requested_height_px: number
          requested_width_px: number
          retry_of_attempt_id: string | null
          returned_height_px: number | null
          returned_mime_type: string | null
          returned_width_px: number | null
          run_id: string
          semantic_qa: Json | null
          shadow_qa: Json | null
          status: string
          transform_recipe: Json | null
          underlying_provider: string
          updated_at: string
          usage_evidence: Json
          website_sku: string
        }
        Insert: {
          actual_cost_usd?: number | null
          asset_role: string
          attempt_ordinal: number
          automated_decision?: string | null
          background_mutated?: boolean
          canonical_truth: Json
          canonical_truth_hash: string
          code_version?: string | null
          cost_currency?: string
          created_at?: string
          duration_ms?: number | null
          endpoint_identifier: string
          error_message?: string | null
          estimated_cost_usd?: number
          failure_code?: string | null
          failure_reasons?: string[]
          failure_stage?: string | null
          family: string
          final_image_hash?: string | null
          final_image_url?: string | null
          framing_qa?: Json | null
          function_version?: string | null
          gateway_provider: string
          grace_sku: string
          id?: string
          job_key: string
          model_identifier: string
          native_bone_qa?: Json | null
          organization_id: string
          price_card_version?: string | null
          prompt_hash: string
          prompt_text: string
          prompt_version: string
          provider_completed_at?: string | null
          provider_request_id?: string | null
          provider_response_metadata?: Json
          provider_started_at?: string | null
          publish_eligible?: boolean
          qa_completed_at?: string | null
          queued_at?: string
          raw_image_hash?: string | null
          raw_image_url?: string | null
          reference_manifest: Json
          renderer_id: string
          request_parameters?: Json
          requested_height_px: number
          requested_width_px: number
          retry_of_attempt_id?: string | null
          returned_height_px?: number | null
          returned_mime_type?: string | null
          returned_width_px?: number | null
          run_id: string
          semantic_qa?: Json | null
          shadow_qa?: Json | null
          status?: string
          transform_recipe?: Json | null
          underlying_provider: string
          updated_at?: string
          usage_evidence?: Json
          website_sku: string
        }
        Update: {
          actual_cost_usd?: number | null
          asset_role?: string
          attempt_ordinal?: number
          automated_decision?: string | null
          background_mutated?: boolean
          canonical_truth?: Json
          canonical_truth_hash?: string
          code_version?: string | null
          cost_currency?: string
          created_at?: string
          duration_ms?: number | null
          endpoint_identifier?: string
          error_message?: string | null
          estimated_cost_usd?: number
          failure_code?: string | null
          failure_reasons?: string[]
          failure_stage?: string | null
          family?: string
          final_image_hash?: string | null
          final_image_url?: string | null
          framing_qa?: Json | null
          function_version?: string | null
          gateway_provider?: string
          grace_sku?: string
          id?: string
          job_key?: string
          model_identifier?: string
          native_bone_qa?: Json | null
          organization_id?: string
          price_card_version?: string | null
          prompt_hash?: string
          prompt_text?: string
          prompt_version?: string
          provider_completed_at?: string | null
          provider_request_id?: string | null
          provider_response_metadata?: Json
          provider_started_at?: string | null
          publish_eligible?: boolean
          qa_completed_at?: string | null
          queued_at?: string
          raw_image_hash?: string | null
          raw_image_url?: string | null
          reference_manifest?: Json
          renderer_id?: string
          request_parameters?: Json
          requested_height_px?: number
          requested_width_px?: number
          retry_of_attempt_id?: string | null
          returned_height_px?: number | null
          returned_mime_type?: string | null
          returned_width_px?: number | null
          run_id?: string
          semantic_qa?: Json | null
          shadow_qa?: Json | null
          status?: string
          transform_recipe?: Json | null
          underlying_provider?: string
          updated_at?: string
          usage_evidence?: Json
          website_sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "best_bottles_material_pilot_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_bottles_material_pilot_attempts_retry_of_attempt_id_fkey"
            columns: ["retry_of_attempt_id"]
            isOneToOne: false
            referencedRelation: "best_bottles_material_pilot_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_bottles_material_pilot_attempts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "best_bottles_material_pilot_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      best_bottles_material_pilot_reviews: {
        Row: {
          attempt_id: string
          blinded: boolean
          checklist: Json
          created_at: string
          decision: string
          failure_reasons: string[]
          id: string
          organization_id: string
          review_duration_ms: number | null
          review_note: string | null
          reviewed_at: string
          reviewed_by: string
          run_id: string
          updated_at: string
        }
        Insert: {
          attempt_id: string
          blinded?: boolean
          checklist?: Json
          created_at?: string
          decision: string
          failure_reasons?: string[]
          id?: string
          organization_id: string
          review_duration_ms?: number | null
          review_note?: string | null
          reviewed_at?: string
          reviewed_by: string
          run_id: string
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          blinded?: boolean
          checklist?: Json
          created_at?: string
          decision?: string
          failure_reasons?: string[]
          id?: string
          organization_id?: string
          review_duration_ms?: number | null
          review_note?: string | null
          reviewed_at?: string
          reviewed_by?: string
          run_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "best_bottles_material_pilot_reviews_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "best_bottles_material_pilot_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_bottles_material_pilot_reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_bottles_material_pilot_reviews_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "best_bottles_material_pilot_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      best_bottles_material_pilot_runs: {
        Row: {
          canonical_truth_hash: string
          code_version: string | null
          cohort_manifest: Json
          cohort_version: string
          completed_at: string | null
          completed_attempts: number
          created_at: string
          created_by: string | null
          family: string
          id: string
          launched_attempts: number
          organization_id: string
          planned_attempts: number
          price_card: Json
          price_card_version: string | null
          prompt_hash: string
          prompt_version: string
          renderer_ids: string[]
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          canonical_truth_hash: string
          code_version?: string | null
          cohort_manifest: Json
          cohort_version: string
          completed_at?: string | null
          completed_attempts?: number
          created_at?: string
          created_by?: string | null
          family: string
          id?: string
          launched_attempts?: number
          organization_id: string
          planned_attempts: number
          price_card?: Json
          price_card_version?: string | null
          prompt_hash: string
          prompt_version: string
          renderer_ids: string[]
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          canonical_truth_hash?: string
          code_version?: string | null
          cohort_manifest?: Json
          cohort_version?: string
          completed_at?: string | null
          completed_attempts?: number
          created_at?: string
          created_by?: string | null
          family?: string
          id?: string
          launched_attempts?: number
          organization_id?: string
          planned_attempts?: number
          price_card?: Json
          price_card_version?: string | null
          prompt_hash?: string
          prompt_version?: string
          renderer_ids?: string[]
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "best_bottles_material_pilot_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      best_bottles_pipeline_groups: {
        Row: {
          all_legacy_skus: string | null
          applicator_types: string | null
          capacity_label: string | null
          capacity_ml: number | null
          category: string | null
          collection: string | null
          convex_id: string | null
          convex_slug: string | null
          created_at: string
          display_name: string
          family: string
          glass_color: string | null
          id: string
          legacy_has_hero_image: boolean | null
          legacy_hero_image_url: string | null
          madison_approved_at: string | null
          madison_approved_by: string | null
          madison_approved_image_id: string | null
          madison_consistency_set_id: string | null
          madison_convex_synced_at: string | null
          madison_last_error: string | null
          madison_notes: string | null
          madison_sanity_asset_id: string | null
          madison_sanity_synced_at: string | null
          madison_shopify_synced_at: string | null
          madison_status: string
          organization_id: string
          price_max_cents: number | null
          price_min_cents: number | null
          primary_grace_sku: string | null
          primary_website_sku: string | null
          product_url: string | null
          thread_size: string | null
          tracker_row_number: number | null
          updated_at: string
          variant_count: number | null
        }
        Insert: {
          all_legacy_skus?: string | null
          applicator_types?: string | null
          capacity_label?: string | null
          capacity_ml?: number | null
          category?: string | null
          collection?: string | null
          convex_id?: string | null
          convex_slug?: string | null
          created_at?: string
          display_name: string
          family: string
          glass_color?: string | null
          id?: string
          legacy_has_hero_image?: boolean | null
          legacy_hero_image_url?: string | null
          madison_approved_at?: string | null
          madison_approved_by?: string | null
          madison_approved_image_id?: string | null
          madison_consistency_set_id?: string | null
          madison_convex_synced_at?: string | null
          madison_last_error?: string | null
          madison_notes?: string | null
          madison_sanity_asset_id?: string | null
          madison_sanity_synced_at?: string | null
          madison_shopify_synced_at?: string | null
          madison_status?: string
          organization_id: string
          price_max_cents?: number | null
          price_min_cents?: number | null
          primary_grace_sku?: string | null
          primary_website_sku?: string | null
          product_url?: string | null
          thread_size?: string | null
          tracker_row_number?: number | null
          updated_at?: string
          variant_count?: number | null
        }
        Update: {
          all_legacy_skus?: string | null
          applicator_types?: string | null
          capacity_label?: string | null
          capacity_ml?: number | null
          category?: string | null
          collection?: string | null
          convex_id?: string | null
          convex_slug?: string | null
          created_at?: string
          display_name?: string
          family?: string
          glass_color?: string | null
          id?: string
          legacy_has_hero_image?: boolean | null
          legacy_hero_image_url?: string | null
          madison_approved_at?: string | null
          madison_approved_by?: string | null
          madison_approved_image_id?: string | null
          madison_consistency_set_id?: string | null
          madison_convex_synced_at?: string | null
          madison_last_error?: string | null
          madison_notes?: string | null
          madison_sanity_asset_id?: string | null
          madison_sanity_synced_at?: string | null
          madison_shopify_synced_at?: string | null
          madison_status?: string
          organization_id?: string
          price_max_cents?: number | null
          price_min_cents?: number | null
          primary_grace_sku?: string | null
          primary_website_sku?: string | null
          product_url?: string | null
          thread_size?: string | null
          tracker_row_number?: number | null
          updated_at?: string
          variant_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "best_bottles_pipeline_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      best_bottles_pipeline_sku_images: {
        Row: {
          convex_verification_error: string | null
          convex_verification_state: string
          convex_verified_at: string | null
          convex_verified_image_hash: string | null
          convex_verified_image_url: string | null
          created_at: string
          decision: string
          expected_image_url: string | null
          id: string
          image_id: string
          link_source: string
          linked_at: string
          linked_by: string | null
          organization_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shopify_verification_error: string | null
          shopify_verification_state: string
          shopify_verified_at: string | null
          shopify_verified_image_hash: string | null
          shopify_verified_image_url: string | null
          sku_job_id: string
          updated_at: string
        }
        Insert: {
          convex_verification_error?: string | null
          convex_verification_state?: string
          convex_verified_at?: string | null
          convex_verified_image_hash?: string | null
          convex_verified_image_url?: string | null
          created_at?: string
          decision?: string
          expected_image_url?: string | null
          id?: string
          image_id: string
          link_source?: string
          linked_at?: string
          linked_by?: string | null
          organization_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shopify_verification_error?: string | null
          shopify_verification_state?: string
          shopify_verified_at?: string | null
          shopify_verified_image_hash?: string | null
          shopify_verified_image_url?: string | null
          sku_job_id: string
          updated_at?: string
        }
        Update: {
          convex_verification_error?: string | null
          convex_verification_state?: string
          convex_verified_at?: string | null
          convex_verified_image_hash?: string | null
          convex_verified_image_url?: string | null
          created_at?: string
          decision?: string
          expected_image_url?: string | null
          id?: string
          image_id?: string
          link_source?: string
          linked_at?: string
          linked_by?: string | null
          organization_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shopify_verification_error?: string | null
          shopify_verification_state?: string
          shopify_verified_at?: string | null
          shopify_verified_image_hash?: string | null
          shopify_verified_image_url?: string | null
          sku_job_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "best_bottles_pipeline_sku_images_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "generated_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_bottles_pipeline_sku_images_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_bottles_pipeline_sku_images_sku_job_id_fkey"
            columns: ["sku_job_id"]
            isOneToOne: false
            referencedRelation: "best_bottles_pipeline_sku_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      best_bottles_pipeline_sku_jobs: {
        Row: {
          applicator: string | null
          approved_at: string | null
          approved_by: string | null
          approved_image_id: string | null
          approved_image_url: string | null
          best_reference_candidate_path: string | null
          canonical_color: string | null
          capacity_ml: number | null
          catalog_reference_pages: string | null
          category: string | null
          convex_synced_at: string | null
          coverage_status: string | null
          created_at: string
          expected_canonical_filename: string | null
          family: string
          generated_image_id: string | null
          generated_image_url: string | null
          grace_sku: string
          id: string
          last_error: string | null
          organization_id: string
          pipeline_group_id: string | null
          product_group_display_name: string | null
          product_group_slug: string
          product_id: string | null
          reference_imported_at: string | null
          reference_issue: string | null
          reference_source: string | null
          reference_source_path: string | null
          reference_source_url: string | null
          shopify_image_url: string | null
          shopify_media_id: string | null
          shopify_product_id: string | null
          shopify_pushed_at: string | null
          shopify_sku: string | null
          shopify_variant_id: string | null
          source_id: string | null
          status: string
          updated_at: string
          website_sku: string
        }
        Insert: {
          applicator?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_image_id?: string | null
          approved_image_url?: string | null
          best_reference_candidate_path?: string | null
          canonical_color?: string | null
          capacity_ml?: number | null
          catalog_reference_pages?: string | null
          category?: string | null
          convex_synced_at?: string | null
          coverage_status?: string | null
          created_at?: string
          expected_canonical_filename?: string | null
          family: string
          generated_image_id?: string | null
          generated_image_url?: string | null
          grace_sku: string
          id?: string
          last_error?: string | null
          organization_id: string
          pipeline_group_id?: string | null
          product_group_display_name?: string | null
          product_group_slug: string
          product_id?: string | null
          reference_imported_at?: string | null
          reference_issue?: string | null
          reference_source?: string | null
          reference_source_path?: string | null
          reference_source_url?: string | null
          shopify_image_url?: string | null
          shopify_media_id?: string | null
          shopify_product_id?: string | null
          shopify_pushed_at?: string | null
          shopify_sku?: string | null
          shopify_variant_id?: string | null
          source_id?: string | null
          status?: string
          updated_at?: string
          website_sku: string
        }
        Update: {
          applicator?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_image_id?: string | null
          approved_image_url?: string | null
          best_reference_candidate_path?: string | null
          canonical_color?: string | null
          capacity_ml?: number | null
          catalog_reference_pages?: string | null
          category?: string | null
          convex_synced_at?: string | null
          coverage_status?: string | null
          created_at?: string
          expected_canonical_filename?: string | null
          family?: string
          generated_image_id?: string | null
          generated_image_url?: string | null
          grace_sku?: string
          id?: string
          last_error?: string | null
          organization_id?: string
          pipeline_group_id?: string | null
          product_group_display_name?: string | null
          product_group_slug?: string
          product_id?: string | null
          reference_imported_at?: string | null
          reference_issue?: string | null
          reference_source?: string | null
          reference_source_path?: string | null
          reference_source_url?: string | null
          shopify_image_url?: string | null
          shopify_media_id?: string | null
          shopify_product_id?: string | null
          shopify_pushed_at?: string | null
          shopify_sku?: string | null
          shopify_variant_id?: string | null
          source_id?: string | null
          status?: string
          updated_at?: string
          website_sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "best_bottles_pipeline_sku_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_bottles_pipeline_sku_jobs_pipeline_group_id_fkey"
            columns: ["pipeline_group_id"]
            isOneToOne: false
            referencedRelation: "best_bottles_pipeline_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      best_bottles_shadow_review_exception_revocations: {
        Row: {
          created_at: string
          exception_id: string
          id: string
          organization_id: string
          reason: string
          revoked_by: string
        }
        Insert: {
          created_at?: string
          exception_id: string
          id?: string
          organization_id: string
          reason: string
          revoked_by: string
        }
        Update: {
          created_at?: string
          exception_id?: string
          id?: string
          organization_id?: string
          reason?: string
          revoked_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "best_bottles_shadow_review_exception_revoc_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_bottles_shadow_review_exception_revocati_exception_id_fkey"
            columns: ["exception_id"]
            isOneToOne: true
            referencedRelation: "best_bottles_shadow_review_exceptions"
            referencedColumns: ["id"]
          },
        ]
      }
      best_bottles_shadow_review_exceptions: {
        Row: {
          created_at: string
          expected_contacts: Json
          final_image_hash: string
          id: string
          image_id: string
          organization_id: string
          pipeline_sku_job_id: string
          policy_version: string
          prompt_hash: string
          reason: string
          reason_code: string
          reviewed_by: string
          shadow_contract: string
          shadow_report_hash: string
          shadow_topology_hash: string
          shadow_topology_kind: string
          source_reference_hash: string
        }
        Insert: {
          created_at?: string
          expected_contacts: Json
          final_image_hash: string
          id?: string
          image_id: string
          organization_id: string
          pipeline_sku_job_id: string
          policy_version: string
          prompt_hash: string
          reason: string
          reason_code: string
          reviewed_by: string
          shadow_contract: string
          shadow_report_hash: string
          shadow_topology_hash: string
          shadow_topology_kind: string
          source_reference_hash: string
        }
        Update: {
          created_at?: string
          expected_contacts?: Json
          final_image_hash?: string
          id?: string
          image_id?: string
          organization_id?: string
          pipeline_sku_job_id?: string
          policy_version?: string
          prompt_hash?: string
          reason?: string
          reason_code?: string
          reviewed_by?: string
          shadow_contract?: string
          shadow_report_hash?: string
          shadow_topology_hash?: string
          shadow_topology_kind?: string
          source_reference_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "best_bottles_shadow_review_exceptions_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "generated_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_bottles_shadow_review_exceptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_bottles_shadow_review_exceptions_pipeline_sku_job_id_fkey"
            columns: ["pipeline_sku_job_id"]
            isOneToOne: false
            referencedRelation: "best_bottles_pipeline_sku_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_collections: {
        Row: {
          color_theme: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          sort_order: number
          transparency_statement: string | null
          updated_at: string | null
        }
        Insert: {
          color_theme?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          sort_order?: number
          transparency_statement?: string | null
          updated_at?: string | null
        }
        Update: {
          color_theme?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
          transparency_statement?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_collections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_dna: {
        Row: {
          constraints: Json | null
          created_at: string | null
          essence: Json
          id: string
          org_id: string
          scan_metadata: Json | null
          scan_method: string
          updated_at: string | null
          visual: Json
        }
        Insert: {
          constraints?: Json | null
          created_at?: string | null
          essence?: Json
          id?: string
          org_id: string
          scan_metadata?: Json | null
          scan_method?: string
          updated_at?: string | null
          visual?: Json
        }
        Update: {
          constraints?: Json | null
          created_at?: string | null
          essence?: Json
          id?: string
          org_id?: string
          scan_metadata?: Json | null
          scan_method?: string
          updated_at?: string | null
          visual?: Json
        }
        Relationships: [
          {
            foreignKeyName: "brand_dna_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_documents: {
        Row: {
          content_preview: string | null
          created_at: string | null
          extracted_content: string | null
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string | null
          id: string
          organization_id: string
          processing_stage: string | null
          processing_status: string | null
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          content_preview?: string | null
          created_at?: string | null
          extracted_content?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          file_url?: string | null
          id?: string
          organization_id: string
          processing_stage?: string | null
          processing_status?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          content_preview?: string | null
          created_at?: string | null
          extracted_content?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string | null
          id?: string
          organization_id?: string
          processing_stage?: string | null
          processing_status?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_health: {
        Row: {
          completeness_score: number
          created_at: string
          gap_analysis: Json
          id: string
          last_analyzed_at: string
          organization_id: string
          recommendations: Json
          updated_at: string
        }
        Insert: {
          completeness_score?: number
          created_at?: string
          gap_analysis?: Json
          id?: string
          last_analyzed_at?: string
          organization_id: string
          recommendations?: Json
          updated_at?: string
        }
        Update: {
          completeness_score?: number
          created_at?: string
          gap_analysis?: Json
          id?: string
          last_analyzed_at?: string
          organization_id?: string
          recommendations?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_health_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_health_history: {
        Row: {
          analyzed_at: string
          completeness_score: number
          created_at: string
          gap_analysis: Json
          id: string
          organization_id: string
          recommendations: Json
          status: string | null
        }
        Insert: {
          analyzed_at?: string
          completeness_score: number
          created_at?: string
          gap_analysis?: Json
          id?: string
          organization_id: string
          recommendations?: Json
          status?: string | null
        }
        Update: {
          analyzed_at?: string
          completeness_score?: number
          created_at?: string
          gap_analysis?: Json
          id?: string
          organization_id?: string
          recommendations?: Json
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_health_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_knowledge: {
        Row: {
          content: Json
          created_at: string | null
          document_id: string | null
          id: string
          is_active: boolean | null
          knowledge_type: string
          organization_id: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          content?: Json
          created_at?: string | null
          document_id?: string | null
          id?: string
          is_active?: boolean | null
          knowledge_type: string
          organization_id: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          content?: Json
          created_at?: string | null
          document_id?: string | null
          id?: string
          is_active?: boolean | null
          knowledge_type?: string
          organization_id?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_knowledge_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "brand_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_knowledge_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_products: {
        Row: {
          copy_hints: Json | null
          created_at: string | null
          id: string
          images: string[] | null
          metadata: Json | null
          name: string
          org_id: string
          product_id: string
          specs: Json
          updated_at: string | null
        }
        Insert: {
          copy_hints?: Json | null
          created_at?: string | null
          id?: string
          images?: string[] | null
          metadata?: Json | null
          name: string
          org_id: string
          product_id: string
          specs?: Json
          updated_at?: string | null
        }
        Update: {
          copy_hints?: Json | null
          created_at?: string | null
          id?: string
          images?: string[] | null
          metadata?: Json | null
          name?: string
          org_id?: string
          product_id?: string
          specs?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_scans: {
        Row: {
          created_at: string | null
          domain: string
          domain_id: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          organization_id: string
          scan_data: Json
          scan_type: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          domain: string
          domain_id?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          scan_data?: Json
          scan_type?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          domain_id?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          scan_data?: Json
          scan_type?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_scans_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_scans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_visual_examples: {
        Row: {
          created_at: string | null
          id: string
          image_embedding: string | null
          image_url: string
          master_used: string | null
          metadata: Json | null
          org_id: string
          squad_used: string | null
          style_tags: string[] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_embedding?: string | null
          image_url: string
          master_used?: string | null
          metadata?: Json | null
          org_id: string
          squad_used?: string | null
          style_tags?: string[] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_embedding?: string | null
          image_url?: string
          master_used?: string | null
          metadata?: Json | null
          org_id?: string
          squad_used?: string | null
          style_tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_visual_examples_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_writing_examples: {
        Row: {
          channel: string | null
          content: string
          content_type: string | null
          created_at: string | null
          embedding: string | null
          id: string
          metadata: Json | null
          org_id: string
          source: string
          tone_tags: string[] | null
        }
        Insert: {
          channel?: string | null
          content: string
          content_type?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          org_id: string
          source: string
          tone_tags?: string[] | null
        }
        Update: {
          channel?: string | null
          content?: string
          content_type?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string
          source?: string
          tone_tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_writing_examples_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_type_config: {
        Row: {
          ai_context: Json
          business_type: Database["public"]["Enums"]["business_type"]
          created_at: string | null
          default_categories: Json
          description: string | null
          display_name: string
          enabled_sections: Json
          icon: string | null
          id: string
          is_active: boolean | null
          onboarding_config: Json
          product_fields: Json
          sort_order: number | null
          updated_at: string | null
          vocabulary: Json
        }
        Insert: {
          ai_context?: Json
          business_type: Database["public"]["Enums"]["business_type"]
          created_at?: string | null
          default_categories?: Json
          description?: string | null
          display_name: string
          enabled_sections?: Json
          icon?: string | null
          id?: string
          is_active?: boolean | null
          onboarding_config?: Json
          product_fields?: Json
          sort_order?: number | null
          updated_at?: string | null
          vocabulary?: Json
        }
        Update: {
          ai_context?: Json
          business_type?: Database["public"]["Enums"]["business_type"]
          created_at?: string | null
          default_categories?: Json
          description?: string | null
          display_name?: string
          enabled_sections?: Json
          icon?: string | null
          id?: string
          is_active?: boolean | null
          onboarding_config?: Json
          product_fields?: Json
          sort_order?: number | null
          updated_at?: string | null
          vocabulary?: Json
        }
        Relationships: []
      }
      calendar_notes: {
        Row: {
          created_at: string | null
          id: string
          note_content: string | null
          organization_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          note_content?: string | null
          organization_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          note_content?: string | null
          organization_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_schedule: {
        Row: {
          core_lexicon: string[] | null
          created_at: string | null
          created_by: string
          end_date: string
          id: string
          organization_id: string | null
          prompts_scheduled: string[] | null
          start_date: string
          updated_at: string | null
          week_number: number
        }
        Insert: {
          core_lexicon?: string[] | null
          created_at?: string | null
          created_by: string
          end_date: string
          id?: string
          organization_id?: string | null
          prompts_scheduled?: string[] | null
          start_date: string
          updated_at?: string | null
          week_number: number
        }
        Update: {
          core_lexicon?: string[] | null
          created_at?: string | null
          created_by?: string
          end_date?: string
          id?: string
          organization_id?: string | null
          prompts_scheduled?: string[] | null
          start_date?: string
          updated_at?: string | null
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "calendar_schedule_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_settings: {
        Row: {
          auto_suggest: boolean | null
          created_at: string | null
          id: string
          optimal_times: string[] | null
          organization_id: string | null
          platform: string
          timezone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_suggest?: boolean | null
          created_at?: string | null
          id?: string
          optimal_times?: string[] | null
          organization_id?: string | null
          platform: string
          timezone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_suggest?: boolean | null
          created_at?: string | null
          id?: string
          optimal_times?: string[] | null
          organization_id?: string | null
          platform?: string
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_tasks: {
        Row: {
          created_at: string | null
          due_date: string | null
          id: string
          is_completed: boolean
          organization_id: string | null
          task_text: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          organization_id?: string | null
          task_text: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          organization_id?: string | null
          task_text?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      competitive_insights: {
        Row: {
          competitor_name: string
          created_at: string | null
          discovered_at: string | null
          finding: string
          id: string
          insight_type: string
          is_read: boolean | null
          organization_id: string
          source_url: string | null
          updated_at: string | null
        }
        Insert: {
          competitor_name: string
          created_at?: string | null
          discovered_at?: string | null
          finding: string
          id?: string
          insight_type: string
          is_read?: boolean | null
          organization_id: string
          source_url?: string | null
          updated_at?: string | null
        }
        Update: {
          competitor_name?: string
          created_at?: string | null
          discovered_at?: string | null
          finding?: string
          id?: string
          insight_type?: string
          is_read?: boolean | null
          organization_id?: string
          source_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitive_insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_watchlist: {
        Row: {
          competitor_name: string
          competitor_url: string
          created_at: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          competitor_name: string
          competitor_url: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          competitor_name?: string
          competitor_url?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_watchlist_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      copywriter_techniques: {
        Row: {
          best_use_cases: string[] | null
          blending_notes: string | null
          copywriter_era: string
          copywriter_name: string
          core_philosophy: string
          created_at: string | null
          example_body_copy: string | null
          example_headlines: string[] | null
          id: string
          signature_techniques: Json
          updated_at: string | null
          writing_style_traits: string[] | null
        }
        Insert: {
          best_use_cases?: string[] | null
          blending_notes?: string | null
          copywriter_era: string
          copywriter_name: string
          core_philosophy: string
          created_at?: string | null
          example_body_copy?: string | null
          example_headlines?: string[] | null
          id?: string
          signature_techniques: Json
          updated_at?: string | null
          writing_style_traits?: string[] | null
        }
        Update: {
          best_use_cases?: string[] | null
          blending_notes?: string | null
          copywriter_era?: string
          copywriter_name?: string
          core_philosophy?: string
          created_at?: string | null
          example_body_copy?: string | null
          example_headlines?: string[] | null
          id?: string
          signature_techniques?: Json
          updated_at?: string | null
          writing_style_traits?: string[] | null
        }
        Relationships: []
      }
      copywriting_sequences: {
        Row: {
          content_format: string
          copywriter_name: string
          copywriter_role: string
          created_at: string | null
          framework_code: string | null
          id: string
          industry_type: string
          is_forbidden: boolean | null
          sequence_order: number
          updated_at: string | null
        }
        Insert: {
          content_format: string
          copywriter_name: string
          copywriter_role: string
          created_at?: string | null
          framework_code?: string | null
          id?: string
          industry_type: string
          is_forbidden?: boolean | null
          sequence_order: number
          updated_at?: string | null
        }
        Update: {
          content_format?: string
          copywriter_name?: string
          copywriter_role?: string
          created_at?: string | null
          framework_code?: string | null
          id?: string
          industry_type?: string
          is_forbidden?: boolean | null
          sequence_order?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      copywriting_style_mappings: {
        Row: {
          content_format: string
          created_at: string | null
          example_snippet: string | null
          id: string
          industry_type: string
          key_hooks: string[] | null
          persuasion_framework: string
          primary_copywriter: string
          secondary_copywriter: string | null
          updated_at: string | null
          urgency_level: string
          voice_spectrum: string
        }
        Insert: {
          content_format: string
          created_at?: string | null
          example_snippet?: string | null
          id?: string
          industry_type: string
          key_hooks?: string[] | null
          persuasion_framework: string
          primary_copywriter: string
          secondary_copywriter?: string | null
          updated_at?: string | null
          urgency_level: string
          voice_spectrum: string
        }
        Update: {
          content_format?: string
          created_at?: string | null
          example_snippet?: string | null
          id?: string
          industry_type?: string
          key_hooks?: string[] | null
          persuasion_framework?: string
          primary_copywriter?: string
          secondary_copywriter?: string | null
          updated_at?: string | null
          urgency_level?: string
          voice_spectrum?: string
        }
        Relationships: []
      }
      dam_activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          actor_type: string
          asset_id: string | null
          context: Json | null
          created_at: string | null
          folder_id: string | null
          id: string
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          actor_type?: string
          asset_id?: string | null
          context?: Json | null
          created_at?: string | null
          folder_id?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          actor_type?: string
          asset_id?: string | null
          context?: Json | null
          created_at?: string | null
          folder_id?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dam_activity_log_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "dam_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dam_activity_log_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "dam_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dam_activity_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dam_assets: {
        Row: {
          ai_analysis: Json | null
          archived_at: string | null
          campaigns: string[] | null
          categories: string[] | null
          created_at: string | null
          embedding: string | null
          file_extension: string | null
          file_size: number | null
          file_type: string
          file_url: string
          folder_id: string | null
          id: string
          is_favorite: boolean | null
          is_hero: boolean | null
          last_used_at: string | null
          last_used_in: Json | null
          linked_content_ids: string[] | null
          linked_content_types: string[] | null
          metadata: Json | null
          name: string
          organization_id: string
          parent_version_id: string | null
          preview_url: string | null
          search_text: string | null
          source_ref: Json | null
          source_type: string
          status: string | null
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
          uploaded_by: string | null
          usage_count: number | null
          version: number | null
        }
        Insert: {
          ai_analysis?: Json | null
          archived_at?: string | null
          campaigns?: string[] | null
          categories?: string[] | null
          created_at?: string | null
          embedding?: string | null
          file_extension?: string | null
          file_size?: number | null
          file_type: string
          file_url: string
          folder_id?: string | null
          id?: string
          is_favorite?: boolean | null
          is_hero?: boolean | null
          last_used_at?: string | null
          last_used_in?: Json | null
          linked_content_ids?: string[] | null
          linked_content_types?: string[] | null
          metadata?: Json | null
          name: string
          organization_id: string
          parent_version_id?: string | null
          preview_url?: string | null
          search_text?: string | null
          source_ref?: Json | null
          source_type?: string
          status?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          usage_count?: number | null
          version?: number | null
        }
        Update: {
          ai_analysis?: Json | null
          archived_at?: string | null
          campaigns?: string[] | null
          categories?: string[] | null
          created_at?: string | null
          embedding?: string | null
          file_extension?: string | null
          file_size?: number | null
          file_type?: string
          file_url?: string
          folder_id?: string | null
          id?: string
          is_favorite?: boolean | null
          is_hero?: boolean | null
          last_used_at?: string | null
          last_used_in?: Json | null
          linked_content_ids?: string[] | null
          linked_content_types?: string[] | null
          metadata?: Json | null
          name?: string
          organization_id?: string
          parent_version_id?: string | null
          preview_url?: string | null
          search_text?: string | null
          source_ref?: Json | null
          source_type?: string
          status?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          usage_count?: number | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dam_assets_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "dam_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dam_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dam_assets_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "dam_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      dam_folders: {
        Row: {
          agent_accessible: boolean | null
          agent_permissions: Json | null
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          folder_type: string
          icon: string | null
          id: string
          metadata: Json | null
          name: string
          organization_id: string
          parent_id: string | null
          slug: string | null
          smart_filter: Json | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          agent_accessible?: boolean | null
          agent_permissions?: Json | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          folder_type?: string
          icon?: string | null
          id?: string
          metadata?: Json | null
          name: string
          organization_id: string
          parent_id?: string | null
          slug?: string | null
          smart_filter?: Json | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_accessible?: boolean | null
          agent_permissions?: Json | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          folder_type?: string
          icon?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          organization_id?: string
          parent_id?: string | null
          slug?: string | null
          smart_filter?: Json | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dam_folders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dam_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "dam_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      derivative_assets: {
        Row: {
          approval_status: string | null
          archived_at: string | null
          asset_type: string
          brand_analysis: Json | null
          brand_consistency_score: number | null
          created_at: string | null
          created_by: string | null
          external_urls: Json | null
          generated_content: string | null
          id: string
          is_archived: boolean
          last_brand_check_at: string | null
          master_content_id: string | null
          organization_id: string
          platform_specs: Json | null
          publish_notes: string | null
          published_at: string | null
          published_to: Json | null
          quality_rating: number | null
        }
        Insert: {
          approval_status?: string | null
          archived_at?: string | null
          asset_type: string
          brand_analysis?: Json | null
          brand_consistency_score?: number | null
          created_at?: string | null
          created_by?: string | null
          external_urls?: Json | null
          generated_content?: string | null
          id?: string
          is_archived?: boolean
          last_brand_check_at?: string | null
          master_content_id?: string | null
          organization_id: string
          platform_specs?: Json | null
          publish_notes?: string | null
          published_at?: string | null
          published_to?: Json | null
          quality_rating?: number | null
        }
        Update: {
          approval_status?: string | null
          archived_at?: string | null
          asset_type?: string
          brand_analysis?: Json | null
          brand_consistency_score?: number | null
          created_at?: string | null
          created_by?: string | null
          external_urls?: Json | null
          generated_content?: string | null
          id?: string
          is_archived?: boolean
          last_brand_check_at?: string | null
          master_content_id?: string | null
          organization_id?: string
          platform_specs?: Json | null
          publish_notes?: string | null
          published_at?: string | null
          published_to?: Json | null
          quality_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "derivative_assets_master_content_id_fkey"
            columns: ["master_content_id"]
            isOneToOne: false
            referencedRelation: "master_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "derivative_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      design_systems: {
        Row: {
          created_at: string | null
          css_variables: string | null
          id: string
          org_id: string
          tailwind_config: Json | null
          tokens: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          css_variables?: string | null
          id?: string
          org_id: string
          tailwind_config?: Json | null
          tokens?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          css_variables?: string | null
          id?: string
          org_id?: string
          tailwind_config?: Json | null
          tokens?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_systems_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      domains: {
        Row: {
          created_at: string | null
          display_name: string | null
          domain: string
          id: string
          metadata: Json | null
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          domain: string
          id?: string
          metadata?: Json | null
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          domain?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domains_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      esp_connections: {
        Row: {
          connection_name: string | null
          created_at: string | null
          esp_type: string
          id: string
          is_active: boolean | null
          last_tested_at: string | null
          organization_id: string
          updated_at: string | null
          webhook_url: string
        }
        Insert: {
          connection_name?: string | null
          created_at?: string | null
          esp_type: string
          id?: string
          is_active?: boolean | null
          last_tested_at?: string | null
          organization_id: string
          updated_at?: string | null
          webhook_url: string
        }
        Update: {
          connection_name?: string | null
          created_at?: string | null
          esp_type?: string
          id?: string
          is_active?: boolean | null
          last_tested_at?: string | null
          organization_id?: string
          updated_at?: string | null
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "esp_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_content: {
        Row: {
          approved: boolean | null
          channel: string | null
          content: string | null
          content_type: string
          context_used: Json | null
          created_at: string | null
          feedback: string | null
          id: string
          image_url: string | null
          org_id: string
          performance: Json | null
          pipeline_duration_ms: number | null
          strategy_used: Json | null
          user_brief: string | null
        }
        Insert: {
          approved?: boolean | null
          channel?: string | null
          content?: string | null
          content_type: string
          context_used?: Json | null
          created_at?: string | null
          feedback?: string | null
          id?: string
          image_url?: string | null
          org_id: string
          performance?: Json | null
          pipeline_duration_ms?: number | null
          strategy_used?: Json | null
          user_brief?: string | null
        }
        Update: {
          approved?: boolean | null
          channel?: string | null
          content?: string | null
          content_type?: string
          context_used?: Json | null
          created_at?: string | null
          feedback?: string | null
          id?: string
          image_url?: string | null
          org_id?: string
          performance?: Json | null
          pipeline_duration_ms?: number | null
          strategy_used?: Json | null
          user_brief?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_content_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_images: {
        Row: {
          archived_at: string | null
          aspect_ratio: string
          brand_colors_used: string[] | null
          brand_context_used: Json | null
          brand_style_tags: string[] | null
          chain_depth: number | null
          consistency_set_id: string | null
          created_at: string | null
          description: string | null
          final_prompt: string
          generation_provider: string | null
          goal_type: string
          id: string
          image_generator: string | null
          image_order: number | null
          image_url: string
          is_archived: boolean | null
          is_chain_origin: boolean | null
          is_hero_image: boolean | null
          library_category: string | null
          library_tags: string[]
          media_type: string | null
          organization_id: string | null
          output_format: string | null
          parent_image_id: string | null
          reference_image_url: string | null
          reference_images: Json | null
          refinement_instruction: string | null
          saved_to_library: boolean | null
          selected_template: string | null
          session_id: string | null
          session_name: string | null
          set_position: number | null
          source_image_id: string | null
          updated_at: string | null
          user_id: string
          user_refinements: string | null
          variation_descriptor: string | null
          video_duration: number | null
          video_url: string | null
        }
        Insert: {
          archived_at?: string | null
          aspect_ratio: string
          brand_colors_used?: string[] | null
          brand_context_used?: Json | null
          brand_style_tags?: string[] | null
          chain_depth?: number | null
          consistency_set_id?: string | null
          created_at?: string | null
          description?: string | null
          final_prompt: string
          generation_provider?: string | null
          goal_type: string
          id?: string
          image_generator?: string | null
          image_order?: number | null
          image_url: string
          is_archived?: boolean | null
          is_chain_origin?: boolean | null
          is_hero_image?: boolean | null
          library_category?: string | null
          library_tags?: string[]
          media_type?: string | null
          organization_id?: string | null
          output_format?: string | null
          parent_image_id?: string | null
          reference_image_url?: string | null
          reference_images?: Json | null
          refinement_instruction?: string | null
          saved_to_library?: boolean | null
          selected_template?: string | null
          session_id?: string | null
          session_name?: string | null
          set_position?: number | null
          source_image_id?: string | null
          updated_at?: string | null
          user_id: string
          user_refinements?: string | null
          variation_descriptor?: string | null
          video_duration?: number | null
          video_url?: string | null
        }
        Update: {
          archived_at?: string | null
          aspect_ratio?: string
          brand_colors_used?: string[] | null
          brand_context_used?: Json | null
          brand_style_tags?: string[] | null
          chain_depth?: number | null
          consistency_set_id?: string | null
          created_at?: string | null
          description?: string | null
          final_prompt?: string
          generation_provider?: string | null
          goal_type?: string
          id?: string
          image_generator?: string | null
          image_order?: number | null
          image_url?: string
          is_archived?: boolean | null
          is_chain_origin?: boolean | null
          is_hero_image?: boolean | null
          library_category?: string | null
          library_tags?: string[]
          media_type?: string | null
          organization_id?: string | null
          output_format?: string | null
          parent_image_id?: string | null
          reference_image_url?: string | null
          reference_images?: Json | null
          refinement_instruction?: string | null
          saved_to_library?: boolean | null
          selected_template?: string | null
          session_id?: string | null
          session_name?: string | null
          set_position?: number | null
          source_image_id?: string | null
          updated_at?: string | null
          user_id?: string
          user_refinements?: string | null
          variation_descriptor?: string | null
          video_duration?: number | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_images_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_images_parent_image_id_fkey"
            columns: ["parent_image_id"]
            isOneToOne: false
            referencedRelation: "generated_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_images_source_image_id_fkey"
            columns: ["source_image_id"]
            isOneToOne: false
            referencedRelation: "generated_images"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_attempts: {
        Row: {
          attempt_number: number | null
          code_commit: string | null
          completed_at: string | null
          created_at: string
          endpoint: string | null
          error_message: string | null
          estimated_cost_usd: number | null
          generated_image_id: string | null
          grace_sku: string | null
          id: string
          lane: string
          latency_ms: number | null
          model: string | null
          organization_id: string | null
          output_url: string | null
          product_group_slug: string | null
          prompt_chars: number | null
          prompt_sha256: string | null
          provider: string
          reference_count: number
          reference_sha256s: Json | null
          reference_urls: Json | null
          request_params: Json | null
          request_resolution: string | null
          request_size: string | null
          revised_prompt: string | null
          seed: number | null
          session_id: string | null
          status: string
          user_id: string | null
          website_sku: string | null
        }
        Insert: {
          attempt_number?: number | null
          code_commit?: string | null
          completed_at?: string | null
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          generated_image_id?: string | null
          grace_sku?: string | null
          id?: string
          lane?: string
          latency_ms?: number | null
          model?: string | null
          organization_id?: string | null
          output_url?: string | null
          product_group_slug?: string | null
          prompt_chars?: number | null
          prompt_sha256?: string | null
          provider: string
          reference_count?: number
          reference_sha256s?: Json | null
          reference_urls?: Json | null
          request_params?: Json | null
          request_resolution?: string | null
          request_size?: string | null
          revised_prompt?: string | null
          seed?: number | null
          session_id?: string | null
          status?: string
          user_id?: string | null
          website_sku?: string | null
        }
        Update: {
          attempt_number?: number | null
          code_commit?: string | null
          completed_at?: string | null
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          generated_image_id?: string | null
          grace_sku?: string | null
          id?: string
          lane?: string
          latency_ms?: number | null
          model?: string | null
          organization_id?: string | null
          output_url?: string | null
          product_group_slug?: string | null
          prompt_chars?: number | null
          prompt_sha256?: string | null
          provider?: string
          reference_count?: number
          reference_sha256s?: Json | null
          reference_urls?: Json | null
          request_params?: Json | null
          request_resolution?: string | null
          request_size?: string | null
          revised_prompt?: string | null
          seed?: number | null
          session_id?: string | null
          status?: string
          user_id?: string | null
          website_sku?: string | null
        }
        Relationships: []
      }
      google_calendar_sync: {
        Row: {
          calendar_id: string | null
          created_at: string | null
          id: string
          last_sync_at: string | null
          sync_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          calendar_id?: string | null
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          sync_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          calendar_id?: string | null
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          sync_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      google_calendar_tokens: {
        Row: {
          access_token_iv: string | null
          created_at: string | null
          encrypted_access_token: string | null
          encrypted_refresh_token: string | null
          id: string
          refresh_token_iv: string | null
          token_expiry: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token_iv?: string | null
          created_at?: string | null
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          id?: string
          refresh_token_iv?: string | null
          token_expiry?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token_iv?: string | null
          created_at?: string | null
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          id?: string
          refresh_token_iv?: string | null
          token_expiry?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      google_calendar_vault_refs: {
        Row: {
          access_token_secret_id: string
          created_at: string | null
          id: string
          refresh_token_secret_id: string
          token_expiry: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token_secret_id: string
          created_at?: string | null
          id?: string
          refresh_token_secret_id: string
          token_expiry?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token_secret_id?: string
          created_at?: string | null
          id?: string
          refresh_token_secret_id?: string
          token_expiry?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ingredient_library: {
        Row: {
          ai_description: string | null
          benefits: string[] | null
          category: string | null
          comedogenic_rating: number | null
          common_names: string[] | null
          concerns: string[] | null
          contains_allergens: string[] | null
          created_at: string | null
          description: string | null
          ewg_score: number | null
          function: string[] | null
          hero_claim: string | null
          id: string
          inci_name: string | null
          irritation_potential: string | null
          is_allergen: boolean | null
          is_natural: boolean | null
          is_organic_available: boolean | null
          is_vegan: boolean | null
          metadata: Json | null
          name: string
          organization_id: string | null
          source: string | null
          story: string | null
          updated_at: string | null
        }
        Insert: {
          ai_description?: string | null
          benefits?: string[] | null
          category?: string | null
          comedogenic_rating?: number | null
          common_names?: string[] | null
          concerns?: string[] | null
          contains_allergens?: string[] | null
          created_at?: string | null
          description?: string | null
          ewg_score?: number | null
          function?: string[] | null
          hero_claim?: string | null
          id?: string
          inci_name?: string | null
          irritation_potential?: string | null
          is_allergen?: boolean | null
          is_natural?: boolean | null
          is_organic_available?: boolean | null
          is_vegan?: boolean | null
          metadata?: Json | null
          name: string
          organization_id?: string | null
          source?: string | null
          story?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_description?: string | null
          benefits?: string[] | null
          category?: string | null
          comedogenic_rating?: number | null
          common_names?: string[] | null
          concerns?: string[] | null
          contains_allergens?: string[] | null
          created_at?: string | null
          description?: string | null
          ewg_score?: number | null
          function?: string[] | null
          hero_claim?: string | null
          id?: string
          inci_name?: string | null
          irritation_potential?: string | null
          is_allergen?: boolean | null
          is_natural?: boolean | null
          is_organic_available?: boolean | null
          is_vegan?: boolean | null
          metadata?: Json | null
          name?: string
          organization_id?: string | null
          source?: string | null
          story?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_library_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          hosted_invoice_url: string | null
          id: string
          invoice_pdf_url: string | null
          organization_id: string
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          status: string
          stripe_charge_id: string | null
          stripe_invoice_id: string | null
          subscription_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf_url?: string | null
          organization_id: string
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status: string
          stripe_charge_id?: string | null
          stripe_invoice_id?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf_url?: string | null
          organization_id?: string
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_invoice_id?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      klaviyo_connections: {
        Row: {
          api_key_encrypted: string
          created_at: string
          id: string
          last_synced_at: string | null
          list_count: number | null
          organization_id: string
          sync_status: string | null
          updated_at: string
        }
        Insert: {
          api_key_encrypted: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          list_count?: number | null
          organization_id: string
          sync_status?: string | null
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          list_count?: number | null
          organization_id?: string
          sync_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "klaviyo_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      librarian_frameworks: {
        Row: {
          awareness_stage: string
          category: string
          channel: string
          created_at: string | null
          example_output: string | null
          framework_content: string
          id: string
          industries: string[]
          intent: string
          is_active: boolean | null
          is_featured: boolean | null
          madison_note: string
          masters: string[]
          short_description: string | null
          slug: string
          sort_letter: string
          title: string
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          awareness_stage: string
          category: string
          channel: string
          created_at?: string | null
          example_output?: string | null
          framework_content: string
          id?: string
          industries?: string[]
          intent: string
          is_active?: boolean | null
          is_featured?: boolean | null
          madison_note: string
          masters?: string[]
          short_description?: string | null
          slug: string
          sort_letter: string
          title: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          awareness_stage?: string
          category?: string
          channel?: string
          created_at?: string | null
          example_output?: string | null
          framework_content?: string
          id?: string
          industries?: string[]
          intent?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          madison_note?: string
          masters?: string[]
          short_description?: string | null
          slug?: string
          sort_letter?: string
          title?: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      librarian_usage_log: {
        Row: {
          action: string
          context: string | null
          created_at: string | null
          framework_id: string | null
          id: string
          organization_id: string | null
          search_query: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          context?: string | null
          created_at?: string | null
          framework_id?: string | null
          id?: string
          organization_id?: string | null
          search_query?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          context?: string | null
          created_at?: string | null
          framework_id?: string | null
          id?: string
          organization_id?: string | null
          search_query?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "librarian_usage_log_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "librarian_frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "librarian_usage_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_connections: {
        Row: {
          connected_at: string | null
          connection_type: string | null
          created_at: string | null
          encrypted_access_token: string
          encrypted_refresh_token: string | null
          id: string
          is_active: boolean | null
          last_post_at: string | null
          linkedin_email: string | null
          linkedin_org_id: string | null
          linkedin_org_logo_url: string | null
          linkedin_org_name: string | null
          linkedin_org_vanity_name: string | null
          linkedin_user_id: string
          linkedin_user_name: string | null
          organization_id: string
          profile_picture_url: string | null
          scopes: string[] | null
          token_expiry: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          connection_type?: string | null
          created_at?: string | null
          encrypted_access_token: string
          encrypted_refresh_token?: string | null
          id?: string
          is_active?: boolean | null
          last_post_at?: string | null
          linkedin_email?: string | null
          linkedin_org_id?: string | null
          linkedin_org_logo_url?: string | null
          linkedin_org_name?: string | null
          linkedin_org_vanity_name?: string | null
          linkedin_user_id: string
          linkedin_user_name?: string | null
          organization_id: string
          profile_picture_url?: string | null
          scopes?: string[] | null
          token_expiry: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          connected_at?: string | null
          connection_type?: string | null
          created_at?: string | null
          encrypted_access_token?: string
          encrypted_refresh_token?: string | null
          id?: string
          is_active?: boolean | null
          last_post_at?: string | null
          linkedin_email?: string | null
          linkedin_org_id?: string | null
          linkedin_org_logo_url?: string | null
          linkedin_org_name?: string | null
          linkedin_org_vanity_name?: string | null
          linkedin_user_id?: string
          linkedin_user_name?: string | null
          organization_id?: string
          profile_picture_url?: string | null
          scopes?: string[] | null
          token_expiry?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_oauth_states: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          organization_id: string
          redirect_url: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string
          id?: string
          organization_id: string
          redirect_url: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          organization_id?: string
          redirect_url?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_oauth_states_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_posts: {
        Row: {
          content_id: string | null
          content_table: string | null
          created_at: string | null
          error_message: string | null
          id: string
          linkedin_connection_id: string
          linkedin_post_id: string | null
          linkedin_post_urn: string | null
          media_urls: string[] | null
          organization_id: string
          post_text: string
          post_url: string | null
          published_at: string | null
          scheduled_for: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          content_id?: string | null
          content_table?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          linkedin_connection_id: string
          linkedin_post_id?: string | null
          linkedin_post_urn?: string | null
          media_urls?: string[] | null
          organization_id: string
          post_text: string
          post_url?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          content_id?: string | null
          content_table?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          linkedin_connection_id?: string
          linkedin_post_id?: string | null
          linkedin_post_urn?: string | null
          media_urls?: string[] | null
          organization_id?: string
          post_text?: string
          post_url?: string | null
          published_at?: string | null
          scheduled_for?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_posts_linkedin_connection_id_fkey"
            columns: ["linkedin_connection_id"]
            isOneToOne: false
            referencedRelation: "linkedin_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linkedin_posts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      madison_masters: {
        Row: {
          created_at: string | null
          example_output: string | null
          forbidden_language: string[] | null
          full_content: string
          id: string
          master_name: string
          metadata: Json | null
          squad: string
          summary: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          example_output?: string | null
          forbidden_language?: string[] | null
          full_content: string
          id?: string
          master_name: string
          metadata?: Json | null
          squad: string
          summary?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          example_output?: string | null
          forbidden_language?: string[] | null
          full_content?: string
          id?: string
          master_name?: string
          metadata?: Json | null
          squad?: string
          summary?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      madison_system_config: {
        Row: {
          created_at: string | null
          editorial_philosophy: string | null
          forbidden_phrases: string | null
          id: string
          persona: string | null
          quality_standards: string | null
          updated_at: string | null
          updated_by: string | null
          voice_spectrum: string | null
          writing_influences: string | null
        }
        Insert: {
          created_at?: string | null
          editorial_philosophy?: string | null
          forbidden_phrases?: string | null
          id?: string
          persona?: string | null
          quality_standards?: string | null
          updated_at?: string | null
          updated_by?: string | null
          voice_spectrum?: string | null
          writing_influences?: string | null
        }
        Update: {
          created_at?: string | null
          editorial_philosophy?: string | null
          forbidden_phrases?: string | null
          id?: string
          persona?: string | null
          quality_standards?: string | null
          updated_at?: string | null
          updated_by?: string | null
          voice_spectrum?: string | null
          writing_influences?: string | null
        }
        Relationships: []
      }
      madison_training_documents: {
        Row: {
          created_at: string | null
          extracted_content: string | null
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string
          id: string
          processing_status: string | null
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          extracted_content?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          file_url: string
          id?: string
          processing_status?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          extracted_content?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          id?: string
          processing_status?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      marketing_frameworks: {
        Row: {
          created_at: string | null
          description: string
          examples: Json
          framework_category: string
          framework_code: string
          framework_name: string
          id: string
          strengths: string[] | null
          structure_template: Json
          updated_at: string | null
          weaknesses: string[] | null
          when_to_use: string
        }
        Insert: {
          created_at?: string | null
          description: string
          examples: Json
          framework_category: string
          framework_code: string
          framework_name: string
          id?: string
          strengths?: string[] | null
          structure_template: Json
          updated_at?: string | null
          weaknesses?: string[] | null
          when_to_use: string
        }
        Update: {
          created_at?: string | null
          description?: string
          examples?: Json
          framework_category?: string
          framework_code?: string
          framework_name?: string
          id?: string
          strengths?: string[] | null
          structure_template?: Json
          updated_at?: string | null
          weaknesses?: string[] | null
          when_to_use?: string
        }
        Relationships: []
      }
      marketplace_listings: {
        Row: {
          archived_at: string | null
          created_at: string | null
          created_by: string | null
          external_id: string | null
          external_url: string | null
          id: string
          is_archived: boolean | null
          last_pushed_at: string | null
          last_synced_at: string | null
          organization_id: string
          platform: string
          platform_data: Json
          product_id: string | null
          push_error: string | null
          push_status: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          created_by?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          is_archived?: boolean | null
          last_pushed_at?: string | null
          last_synced_at?: string | null
          organization_id: string
          platform: string
          platform_data?: Json
          product_id?: string | null
          push_error?: string | null
          push_status?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          created_by?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          is_archived?: boolean | null
          last_pushed_at?: string | null
          last_synced_at?: string | null
          organization_id?: string
          platform?: string
          platform_data?: Json
          product_id?: string | null
          push_error?: string | null
          push_status?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      master_content: {
        Row: {
          archived_at: string | null
          brand_analysis: Json | null
          brand_consistency_score: number | null
          collection: string | null
          content_type: string
          created_at: string | null
          created_by: string | null
          external_urls: Json | null
          featured_image_url: string | null
          full_content: string
          id: string
          is_archived: boolean
          last_brand_check_at: string | null
          organization_id: string
          publish_notes: string | null
          published_at: string | null
          published_to: Json | null
          quality_rating: number | null
          status: string | null
          title: string
          updated_at: string | null
          word_count: number | null
        }
        Insert: {
          archived_at?: string | null
          brand_analysis?: Json | null
          brand_consistency_score?: number | null
          collection?: string | null
          content_type: string
          created_at?: string | null
          created_by?: string | null
          external_urls?: Json | null
          featured_image_url?: string | null
          full_content: string
          id?: string
          is_archived?: boolean
          last_brand_check_at?: string | null
          organization_id: string
          publish_notes?: string | null
          published_at?: string | null
          published_to?: Json | null
          quality_rating?: number | null
          status?: string | null
          title: string
          updated_at?: string | null
          word_count?: number | null
        }
        Update: {
          archived_at?: string | null
          brand_analysis?: Json | null
          brand_consistency_score?: number | null
          collection?: string | null
          content_type?: string
          created_at?: string | null
          created_by?: string | null
          external_urls?: Json | null
          featured_image_url?: string | null
          full_content?: string
          id?: string
          is_archived?: boolean
          last_brand_check_at?: string | null
          organization_id?: string
          publish_notes?: string | null
          published_at?: string | null
          published_to?: Json | null
          quality_rating?: number | null
          status?: string | null
          title?: string
          updated_at?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "master_content_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          email_sent: boolean | null
          email_sent_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string | null
          organization_id: string | null
          product_id: string | null
          read_at: string | null
          task_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string | null
          organization_id?: string | null
          product_id?: string | null
          read_at?: string | null
          task_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string | null
          organization_id?: string | null
          product_id?: string | null
          read_at?: string | null
          task_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "product_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["organization_role"]
          team_role: Database["public"]["Enums"]["team_role"] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["organization_role"]
          team_role?: Database["public"]["Enums"]["team_role"] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["organization_role"]
          team_role?: Database["public"]["Enums"]["team_role"] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          brand_config: Json | null
          business_model: string | null
          business_type: Database["public"]["Enums"]["business_type"] | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          industry_type: string | null
          is_deleted: boolean
          name: string
          settings: Json | null
          slug: string | null
          subscription_id: string | null
          target_audience_type: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          brand_config?: Json | null
          business_model?: string | null
          business_type?: Database["public"]["Enums"]["business_type"] | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          industry_type?: string | null
          is_deleted?: boolean
          name: string
          settings?: Json | null
          slug?: string | null
          subscription_id?: string | null
          target_audience_type?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          brand_config?: Json | null
          business_model?: string | null
          business_type?: Database["public"]["Enums"]["business_type"] | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          industry_type?: string | null
          is_deleted?: boolean
          name?: string
          settings?: Json | null
          slug?: string | null
          subscription_id?: string | null
          target_audience_type?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      outputs: {
        Row: {
          archived_at: string | null
          created_at: string | null
          created_by: string | null
          generated_content: string
          id: string
          image_urls: Json | null
          is_archived: boolean
          iteration_notes: string | null
          organization_id: string
          performance_metrics: Json | null
          prompt_id: string | null
          quality_rating: number | null
          usage_context: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          created_by?: string | null
          generated_content: string
          id?: string
          image_urls?: Json | null
          is_archived?: boolean
          iteration_notes?: string | null
          organization_id: string
          performance_metrics?: Json | null
          prompt_id?: string | null
          quality_rating?: number | null
          usage_context?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          created_by?: string | null
          generated_content?: string
          id?: string
          image_urls?: Json | null
          is_archived?: boolean
          iteration_notes?: string | null
          organization_id?: string
          performance_metrics?: Json | null
          prompt_id?: string | null
          quality_rating?: number | null
          usage_context?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outputs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outputs_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_doll_approved_assets: {
        Row: {
          applicator: string | null
          approved_at: string
          approved_by: string | null
          body_variant: string | null
          cap_color: string | null
          capacity_ml: number | null
          cohort_slug: string
          family: string
          glass_color: string | null
          id: string
          image_url: string
          library_image_id: string | null
          notes: string | null
          organization_id: string
          role: string
          source: string
          source_image_url: string | null
        }
        Insert: {
          applicator?: string | null
          approved_at?: string
          approved_by?: string | null
          body_variant?: string | null
          cap_color?: string | null
          capacity_ml?: number | null
          cohort_slug: string
          family: string
          glass_color?: string | null
          id?: string
          image_url: string
          library_image_id?: string | null
          notes?: string | null
          organization_id: string
          role: string
          source: string
          source_image_url?: string | null
        }
        Update: {
          applicator?: string | null
          approved_at?: string
          approved_by?: string | null
          body_variant?: string | null
          cap_color?: string | null
          capacity_ml?: number | null
          cohort_slug?: string
          family?: string
          glass_color?: string | null
          id?: string
          image_url?: string
          library_image_id?: string | null
          notes?: string | null
          organization_id?: string
          role?: string
          source?: string
          source_image_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_approved_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_doll_candidate_jobs: {
        Row: {
          assembly_context_ref: Json | null
          authoritative_mask_ref: Json
          candidate_component_version_id: string | null
          completed_at: string | null
          component_id: string
          created_at: string
          edit_mask_ref: Json
          error_message: string | null
          generation_attempt_id: string | null
          id: string
          initiated_by: string
          manual_output_ref: Json | null
          model: string
          organization_id: string
          output_metadata: Json
          output_ref: Json | null
          parent_component_version_id: string
          parent_sha256: string
          prompt: string
          prompt_sha256: string
          provider: string
          requirement_key: string
          selection_kind: string
          source_ref: Json
          status: string
          transform: Json
          updated_at: string
        }
        Insert: {
          assembly_context_ref?: Json | null
          authoritative_mask_ref: Json
          candidate_component_version_id?: string | null
          completed_at?: string | null
          component_id: string
          created_at?: string
          edit_mask_ref: Json
          error_message?: string | null
          generation_attempt_id?: string | null
          id?: string
          initiated_by: string
          manual_output_ref?: Json | null
          model: string
          organization_id: string
          output_metadata?: Json
          output_ref?: Json | null
          parent_component_version_id: string
          parent_sha256: string
          prompt: string
          prompt_sha256: string
          provider: string
          requirement_key: string
          selection_kind?: string
          source_ref: Json
          status?: string
          transform: Json
          updated_at?: string
        }
        Update: {
          assembly_context_ref?: Json | null
          authoritative_mask_ref?: Json
          candidate_component_version_id?: string | null
          completed_at?: string | null
          component_id?: string
          created_at?: string
          edit_mask_ref?: Json
          error_message?: string | null
          generation_attempt_id?: string | null
          id?: string
          initiated_by?: string
          manual_output_ref?: Json | null
          model?: string
          organization_id?: string
          output_metadata?: Json
          output_ref?: Json | null
          parent_component_version_id?: string
          parent_sha256?: string
          prompt?: string
          prompt_sha256?: string
          provider?: string
          requirement_key?: string
          selection_kind?: string
          source_ref?: Json
          status?: string
          transform?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_candidate_jobs_candidate_version_org_fk"
            columns: ["candidate_component_version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_component_versions"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "paper_doll_candidate_jobs_component_org_fk"
            columns: ["component_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_components"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "paper_doll_candidate_jobs_generation_attempt_id_fkey"
            columns: ["generation_attempt_id"]
            isOneToOne: false
            referencedRelation: "generation_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_doll_candidate_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_doll_candidate_jobs_parent_org_fk"
            columns: ["parent_component_version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_component_versions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      paper_doll_component_approvals: {
        Row: {
          approver_display_name: string
          approver_user_id: string
          candidate_component_version_id: string
          candidate_job_id: string | null
          created_at: string
          decision: string
          evidence_ids: string[]
          expected_candidate_sha256: string
          id: string
          organization_id: string
          resulting_approved_component_version_id: string | null
        }
        Insert: {
          approver_display_name: string
          approver_user_id: string
          candidate_component_version_id: string
          candidate_job_id?: string | null
          created_at?: string
          decision: string
          evidence_ids: string[]
          expected_candidate_sha256: string
          id?: string
          organization_id: string
          resulting_approved_component_version_id?: string | null
        }
        Update: {
          approver_display_name?: string
          approver_user_id?: string
          candidate_component_version_id?: string
          candidate_job_id?: string | null
          created_at?: string
          decision?: string
          evidence_ids?: string[]
          expected_candidate_sha256?: string
          id?: string
          organization_id?: string
          resulting_approved_component_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_component_approvals_candidate_org_fk"
            columns: ["candidate_component_version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_component_versions"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "paper_doll_component_approvals_job_org_fk"
            columns: ["candidate_job_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_candidate_jobs"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "paper_doll_component_approvals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_doll_component_approvals_result_org_fk"
            columns: [
              "resulting_approved_component_version_id",
              "organization_id",
            ]
            isOneToOne: false
            referencedRelation: "paper_doll_component_versions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      paper_doll_component_source_intakes: {
        Row: {
          component_version_id: string
          created_at: string
          family_key: string
          id: string
          intake_note: string
          organization_id: string
          original_filename: string
          registrar_display_name: string
          registrar_user_id: string
          variant_key: string
        }
        Insert: {
          component_version_id: string
          created_at?: string
          family_key: string
          id?: string
          intake_note: string
          organization_id: string
          original_filename: string
          registrar_display_name: string
          registrar_user_id: string
          variant_key: string
        }
        Update: {
          component_version_id?: string
          created_at?: string
          family_key?: string
          id?: string
          intake_note?: string
          organization_id?: string
          original_filename?: string
          registrar_display_name?: string
          registrar_user_id?: string
          variant_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_component_source_intakes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_doll_component_source_intakes_version_org_fk"
            columns: ["component_version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_component_versions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      paper_doll_component_versions: {
        Row: {
          alpha_bounds: Json
          approval_status: string
          byte_size: number
          component_id: string
          content_type: string
          created_at: string
          geometry_mask_path: string | null
          geometry_mask_sha256: string | null
          height_px: number
          id: string
          image_path: string
          image_sha256: string
          material_variant: string
          mount_axis_x_px: number
          organization_id: string
          parent_component_version_id: string | null
          provenance: Json
          seat_y_px: number
          storage_bucket: string
          updated_at: string
          version_key: string
          width_px: number
        }
        Insert: {
          alpha_bounds: Json
          approval_status: string
          byte_size: number
          component_id: string
          content_type: string
          created_at?: string
          geometry_mask_path?: string | null
          geometry_mask_sha256?: string | null
          height_px: number
          id?: string
          image_path: string
          image_sha256: string
          material_variant: string
          mount_axis_x_px: number
          organization_id: string
          parent_component_version_id?: string | null
          provenance?: Json
          seat_y_px: number
          storage_bucket: string
          updated_at?: string
          version_key: string
          width_px: number
        }
        Update: {
          alpha_bounds?: Json
          approval_status?: string
          byte_size?: number
          component_id?: string
          content_type?: string
          created_at?: string
          geometry_mask_path?: string | null
          geometry_mask_sha256?: string | null
          height_px?: number
          id?: string
          image_path?: string
          image_sha256?: string
          material_variant?: string
          mount_axis_x_px?: number
          organization_id?: string
          parent_component_version_id?: string | null
          provenance?: Json
          seat_y_px?: number
          storage_bucket?: string
          updated_at?: string
          version_key?: string
          width_px?: number
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_component_versions_component_org_fk"
            columns: ["component_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_components"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "paper_doll_component_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_doll_component_versions_parent_org_fk"
            columns: ["parent_component_version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_component_versions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      paper_doll_components: {
        Row: {
          component_key: string
          created_at: string
          display_name: string
          geometry_family_id: string
          id: string
          organization_id: string
          slot: string
          updated_at: string
        }
        Insert: {
          component_key: string
          created_at?: string
          display_name: string
          geometry_family_id: string
          id?: string
          organization_id: string
          slot: string
          updated_at?: string
        }
        Update: {
          component_key?: string
          created_at?: string
          display_name?: string
          geometry_family_id?: string
          id?: string
          organization_id?: string
          slot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_components_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_doll_family_release_assets: {
        Row: {
          component_version_id: string
          created_at: string
          id: string
          organization_id: string
          release_id: string
          slot: string
          variant_key: string
        }
        Insert: {
          component_version_id: string
          created_at?: string
          id?: string
          organization_id: string
          release_id: string
          slot: string
          variant_key: string
        }
        Update: {
          component_version_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          release_id?: string
          slot?: string
          variant_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_family_release_assets_component_version_org_fk"
            columns: ["component_version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_component_versions"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "paper_doll_family_release_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_doll_family_release_assets_release_org_fk"
            columns: ["release_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_family_releases"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      paper_doll_family_release_heads: {
        Row: {
          family_key: string
          organization_id: string
          release_cut_id: string | null
          release_id: string
          updated_at: string
        }
        Insert: {
          family_key: string
          organization_id: string
          release_cut_id?: string | null
          release_id: string
          updated_at?: string
        }
        Update: {
          family_key?: string
          organization_id?: string
          release_cut_id?: string | null
          release_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_family_release_heads_cut_org_fk"
            columns: ["release_cut_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_release_cuts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "paper_doll_family_release_heads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_doll_family_release_heads_release_org_fk"
            columns: ["release_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_family_releases"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      paper_doll_family_releases: {
        Row: {
          background_hex: string
          canvas_height_px: number
          canvas_width_px: number
          created_at: string
          family_key: string
          id: string
          manifest: Json
          manifest_sha256: string
          organization_id: string
          release_status: string
          release_version: string
          renderer_version: string
          source_git_commit: string
          updated_at: string
        }
        Insert: {
          background_hex: string
          canvas_height_px: number
          canvas_width_px: number
          created_at?: string
          family_key: string
          id?: string
          manifest: Json
          manifest_sha256: string
          organization_id: string
          release_status: string
          release_version: string
          renderer_version: string
          source_git_commit: string
          updated_at?: string
        }
        Update: {
          background_hex?: string
          canvas_height_px?: number
          canvas_width_px?: number
          created_at?: string
          family_key?: string
          id?: string
          manifest?: Json
          manifest_sha256?: string
          organization_id?: string
          release_status?: string
          release_version?: string
          renderer_version?: string
          source_git_commit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_family_releases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_doll_placement_approvals: {
        Row: {
          approval_note: string
          approver_display_name: string
          approver_user_id: string
          created_at: string
          id: string
          organization_id: string
          placement_version_id: string
          review_ids: string[]
        }
        Insert: {
          approval_note: string
          approver_display_name: string
          approver_user_id: string
          created_at?: string
          id?: string
          organization_id: string
          placement_version_id: string
          review_ids: string[]
        }
        Update: {
          approval_note?: string
          approver_display_name?: string
          approver_user_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          placement_version_id?: string
          review_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_placement_approvals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_doll_placement_approvals_placement_org_fk"
            columns: ["placement_version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_placement_versions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      paper_doll_placement_reviews: {
        Row: {
          body_component_version_id: string
          created_at: string
          gate_key: string
          id: string
          organization_id: string
          placement_version_id: string
          review_status: string
          reviewed_by: string
          reviewer_display_name: string
        }
        Insert: {
          body_component_version_id: string
          created_at?: string
          gate_key: string
          id?: string
          organization_id: string
          placement_version_id: string
          review_status: string
          reviewed_by: string
          reviewer_display_name: string
        }
        Update: {
          body_component_version_id?: string
          created_at?: string
          gate_key?: string
          id?: string
          organization_id?: string
          placement_version_id?: string
          review_status?: string
          reviewed_by?: string
          reviewer_display_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_placement_reviews_body_org_fk"
            columns: ["body_component_version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_component_versions"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "paper_doll_placement_reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_doll_placement_reviews_placement_org_fk"
            columns: ["placement_version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_placement_versions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      paper_doll_placement_versions: {
        Row: {
          authority_mask_sha256: string
          calibration_component_version_id: string
          canvas_height_px: number
          canvas_width_px: number
          contact_y_px: number
          created_at: string
          created_by: string
          family_key: string
          fitment_geometry_key: string
          id: string
          mount_axis_x_px: number
          organization_id: string
          translate_x_px: number
          translate_y_px: number
          uniform_scale: number
        }
        Insert: {
          authority_mask_sha256: string
          calibration_component_version_id: string
          canvas_height_px: number
          canvas_width_px: number
          contact_y_px: number
          created_at?: string
          created_by: string
          family_key: string
          fitment_geometry_key: string
          id?: string
          mount_axis_x_px: number
          organization_id: string
          translate_x_px: number
          translate_y_px: number
          uniform_scale: number
        }
        Update: {
          authority_mask_sha256?: string
          calibration_component_version_id?: string
          canvas_height_px?: number
          canvas_width_px?: number
          contact_y_px?: number
          created_at?: string
          created_by?: string
          family_key?: string
          fitment_geometry_key?: string
          id?: string
          mount_axis_x_px?: number
          organization_id?: string
          translate_x_px?: number
          translate_y_px?: number
          uniform_scale?: number
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_placement_versions_calibration_org_fk"
            columns: ["calibration_component_version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_component_versions"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "paper_doll_placement_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_doll_publication_approvals: {
        Row: {
          approval_note: string
          approver_display_name: string
          approver_user_id: string
          created_at: string
          expected_draft_sha256: string
          id: string
          organization_id: string
          publish_run_id: string
          release_cut_id: string
        }
        Insert: {
          approval_note: string
          approver_display_name: string
          approver_user_id: string
          created_at?: string
          expected_draft_sha256: string
          id?: string
          organization_id: string
          publish_run_id: string
          release_cut_id: string
        }
        Update: {
          approval_note?: string
          approver_display_name?: string
          approver_user_id?: string
          created_at?: string
          expected_draft_sha256?: string
          id?: string
          organization_id?: string
          publish_run_id?: string
          release_cut_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_publication_approvals_cut_org_fk"
            columns: ["release_cut_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_release_cuts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "paper_doll_publication_approvals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_doll_publication_approvals_run_org_fk"
            columns: ["publish_run_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_publish_runs"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      paper_doll_publish_runs: {
        Row: {
          attempt_sequence: number
          completed_at: string | null
          created_at: string
          destination: string
          error_message: string | null
          id: string
          organization_id: string
          publish_status: string
          release_cut_id: string | null
          release_id: string
          request_sha256: string | null
          result: Json
          sanity_document_id: string | null
          updated_at: string
        }
        Insert: {
          attempt_sequence?: number
          completed_at?: string | null
          created_at?: string
          destination: string
          error_message?: string | null
          id?: string
          organization_id: string
          publish_status: string
          release_cut_id?: string | null
          release_id: string
          request_sha256?: string | null
          result?: Json
          sanity_document_id?: string | null
          updated_at?: string
        }
        Update: {
          attempt_sequence?: number
          completed_at?: string | null
          created_at?: string
          destination?: string
          error_message?: string | null
          id?: string
          organization_id?: string
          publish_status?: string
          release_cut_id?: string | null
          release_id?: string
          request_sha256?: string | null
          result?: Json
          sanity_document_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_publish_runs_cut_org_fk"
            columns: ["release_cut_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_release_cuts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "paper_doll_publish_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_doll_publish_runs_release_org_fk"
            columns: ["release_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_family_releases"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      paper_doll_qa_results: {
        Row: {
          blocking: boolean
          calibrated_with: string[]
          component_version_id: string
          created_at: string
          gate_key: string
          gate_version: string
          id: string
          issues: string[]
          measurements: Json
          organization_id: string
          qa_status: string
        }
        Insert: {
          blocking: boolean
          calibrated_with: string[]
          component_version_id: string
          created_at?: string
          gate_key: string
          gate_version: string
          id?: string
          issues?: string[]
          measurements?: Json
          organization_id: string
          qa_status: string
        }
        Update: {
          blocking?: boolean
          calibrated_with?: string[]
          component_version_id?: string
          created_at?: string
          gate_key?: string
          gate_version?: string
          id?: string
          issues?: string[]
          measurements?: Json
          organization_id?: string
          qa_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_qa_results_component_version_org_fk"
            columns: ["component_version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_component_versions"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "paper_doll_qa_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_doll_release_cuts: {
        Row: {
          approval_note: string
          approver_display_name: string
          approver_user_id: string
          created_at: string
          family_key: string
          id: string
          manifest_sha256: string
          organization_id: string
          resulting_release_id: string
          selected_components: Json
          source_release_id: string
        }
        Insert: {
          approval_note: string
          approver_display_name: string
          approver_user_id: string
          created_at?: string
          family_key: string
          id?: string
          manifest_sha256: string
          organization_id: string
          resulting_release_id: string
          selected_components: Json
          source_release_id: string
        }
        Update: {
          approval_note?: string
          approver_display_name?: string
          approver_user_id?: string
          created_at?: string
          family_key?: string
          id?: string
          manifest_sha256?: string
          organization_id?: string
          resulting_release_id?: string
          selected_components?: Json
          source_release_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_release_cuts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_doll_release_cuts_result_org_fk"
            columns: ["resulting_release_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_family_releases"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "paper_doll_release_cuts_source_org_fk"
            columns: ["source_release_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_family_releases"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      paper_doll_release_sku_readiness: {
        Row: {
          created_at: string
          grace_sku: string
          id: string
          mapping_key: string
          missing_reasons: string[]
          organization_id: string
          readiness_status: string
          release_id: string
          website_sku: string
        }
        Insert: {
          created_at?: string
          grace_sku: string
          id?: string
          mapping_key: string
          missing_reasons?: string[]
          organization_id: string
          readiness_status: string
          release_id: string
          website_sku: string
        }
        Update: {
          created_at?: string
          grace_sku?: string
          id?: string
          mapping_key?: string
          missing_reasons?: string[]
          organization_id?: string
          readiness_status?: string
          release_id?: string
          website_sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_release_sku_readiness_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_doll_release_sku_readiness_release_org_fk"
            columns: ["release_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_family_releases"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      paper_doll_worker_heartbeats: {
        Row: {
          current_job_id: string | null
          error_message: string | null
          id: string
          last_seen_at: string
          organization_id: string
          worker_key: string
          worker_status: string
        }
        Insert: {
          current_job_id?: string | null
          error_message?: string | null
          id?: string
          last_seen_at?: string
          organization_id: string
          worker_key: string
          worker_status: string
        }
        Update: {
          current_job_id?: string | null
          error_message?: string | null
          id?: string
          last_seen_at?: string
          organization_id?: string
          worker_key?: string
          worker_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_doll_worker_heartbeats_job_org_fk"
            columns: ["current_job_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "paper_doll_candidate_jobs"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "paper_doll_worker_heartbeats_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last4: string | null
          created_at: string | null
          id: string
          is_default: boolean | null
          organization_id: string
          stripe_customer_id: string
          stripe_payment_method_id: string
          type: string
          updated_at: string | null
        }
        Insert: {
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          organization_id: string
          stripe_customer_id: string
          stripe_payment_method_id: string
          type: string
          updated_at?: string | null
        }
        Update: {
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          organization_id?: string
          stripe_customer_id?: string
          stripe_payment_method_id?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_activity: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          actor_id: string | null
          created_at: string | null
          description: string | null
          field_changed: string | null
          id: string
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          organization_id: string
          product_id: string | null
          task_id: string | null
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          actor_id?: string | null
          created_at?: string | null
          description?: string | null
          field_changed?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          organization_id: string
          product_id?: string | null
          task_id?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          actor_id?: string | null
          created_at?: string | null
          description?: string | null
          field_changed?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          organization_id?: string
          product_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_activity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_activity_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "product_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      product_certifications: {
        Row: {
          certificate_number: string | null
          certificate_url: string | null
          certification_type: string
          certifying_body: string | null
          created_at: string | null
          expiry_date: string | null
          id: string
          issued_date: string | null
          notes: string | null
          product_id: string
          show_on_label: boolean | null
          show_on_website: boolean | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          certificate_number?: string | null
          certificate_url?: string | null
          certification_type: string
          certifying_body?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          issued_date?: string | null
          notes?: string | null
          product_id: string
          show_on_label?: boolean | null
          show_on_website?: boolean | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          certificate_number?: string | null
          certificate_url?: string | null
          certification_type?: string
          certifying_body?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          issued_date?: string | null
          notes?: string | null
          product_id?: string
          show_on_label?: boolean | null
          show_on_website?: boolean | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_certifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_commerce: {
        Row: {
          amazon_asin: string | null
          available_date: string | null
          available_for_sale: boolean | null
          backorder_allowed: boolean | null
          cost_of_goods: number | null
          created_at: string | null
          currency: string | null
          discontinued_date: string | null
          etsy_listing_id: string | null
          id: string
          inventory_locations: Json | null
          last_sold_at: string | null
          low_stock_threshold: number | null
          metadata: Json | null
          msrp: number | null
          platform_data: Json | null
          product_id: string
          requires_hazmat: boolean | null
          retail_price: number | null
          shipping_class: string | null
          shopify_inventory_item_id: string | null
          shopify_product_id: string | null
          shopify_sync_enabled: boolean | null
          shopify_synced_at: string | null
          shopify_variant_id: string | null
          stock_quantity: number | null
          target_margin_percent: number | null
          total_revenue: number | null
          total_sold: number | null
          track_inventory: boolean | null
          updated_at: string | null
          weight_for_shipping: number | null
          weight_unit: string | null
          wholesale_price: number | null
          woocommerce_id: string | null
        }
        Insert: {
          amazon_asin?: string | null
          available_date?: string | null
          available_for_sale?: boolean | null
          backorder_allowed?: boolean | null
          cost_of_goods?: number | null
          created_at?: string | null
          currency?: string | null
          discontinued_date?: string | null
          etsy_listing_id?: string | null
          id?: string
          inventory_locations?: Json | null
          last_sold_at?: string | null
          low_stock_threshold?: number | null
          metadata?: Json | null
          msrp?: number | null
          platform_data?: Json | null
          product_id: string
          requires_hazmat?: boolean | null
          retail_price?: number | null
          shipping_class?: string | null
          shopify_inventory_item_id?: string | null
          shopify_product_id?: string | null
          shopify_sync_enabled?: boolean | null
          shopify_synced_at?: string | null
          shopify_variant_id?: string | null
          stock_quantity?: number | null
          target_margin_percent?: number | null
          total_revenue?: number | null
          total_sold?: number | null
          track_inventory?: boolean | null
          updated_at?: string | null
          weight_for_shipping?: number | null
          weight_unit?: string | null
          wholesale_price?: number | null
          woocommerce_id?: string | null
        }
        Update: {
          amazon_asin?: string | null
          available_date?: string | null
          available_for_sale?: boolean | null
          backorder_allowed?: boolean | null
          cost_of_goods?: number | null
          created_at?: string | null
          currency?: string | null
          discontinued_date?: string | null
          etsy_listing_id?: string | null
          id?: string
          inventory_locations?: Json | null
          last_sold_at?: string | null
          low_stock_threshold?: number | null
          metadata?: Json | null
          msrp?: number | null
          platform_data?: Json | null
          product_id?: string
          requires_hazmat?: boolean | null
          retail_price?: number | null
          shipping_class?: string | null
          shopify_inventory_item_id?: string | null
          shopify_product_id?: string | null
          shopify_sync_enabled?: boolean | null
          shopify_synced_at?: string | null
          shopify_variant_id?: string | null
          stock_quantity?: number | null
          target_margin_percent?: number | null
          total_revenue?: number | null
          total_sold?: number | null
          track_inventory?: boolean | null
          updated_at?: string | null
          weight_for_shipping?: number | null
          weight_unit?: string | null
          wholesale_price?: number | null
          woocommerce_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_commerce_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_formulations: {
        Row: {
          active_ingredients: Json | null
          approved_at: string | null
          approved_by: string | null
          base_carrier: string | null
          base_type: string | null
          batch_size_default: number | null
          batch_size_unit: string | null
          challenge_test_passed: boolean | null
          coa_template_url: string | null
          compliant_regions: string[] | null
          concentration_percent: number | null
          concentration_type: string | null
          cost_currency: string | null
          cost_per_unit: number | null
          created_at: string | null
          created_by: string | null
          equipment_needed: string[] | null
          formula_code: string | null
          formula_name: string | null
          formulation_type: string | null
          id: string
          longevity: string | null
          manufacturing_notes: string | null
          metadata: Json | null
          occasion_suitability: string[] | null
          ph_range_max: number | null
          ph_range_min: number | null
          ph_target: number | null
          preservative_system: string | null
          product_id: string
          regulatory_notes: string | null
          scent_family: string | null
          scent_profile: Json | null
          scent_style: string | null
          sds_url: string | null
          season_suitability: string[] | null
          shelf_life_months: number | null
          sillage: string | null
          skin_concerns: string[] | null
          skin_types: string[] | null
          spec_sheet_url: string | null
          stability_notes: string | null
          status: string | null
          total_percentage: number | null
          updated_at: string | null
          version: number | null
          viscosity_target: string | null
        }
        Insert: {
          active_ingredients?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          base_carrier?: string | null
          base_type?: string | null
          batch_size_default?: number | null
          batch_size_unit?: string | null
          challenge_test_passed?: boolean | null
          coa_template_url?: string | null
          compliant_regions?: string[] | null
          concentration_percent?: number | null
          concentration_type?: string | null
          cost_currency?: string | null
          cost_per_unit?: number | null
          created_at?: string | null
          created_by?: string | null
          equipment_needed?: string[] | null
          formula_code?: string | null
          formula_name?: string | null
          formulation_type?: string | null
          id?: string
          longevity?: string | null
          manufacturing_notes?: string | null
          metadata?: Json | null
          occasion_suitability?: string[] | null
          ph_range_max?: number | null
          ph_range_min?: number | null
          ph_target?: number | null
          preservative_system?: string | null
          product_id: string
          regulatory_notes?: string | null
          scent_family?: string | null
          scent_profile?: Json | null
          scent_style?: string | null
          sds_url?: string | null
          season_suitability?: string[] | null
          shelf_life_months?: number | null
          sillage?: string | null
          skin_concerns?: string[] | null
          skin_types?: string[] | null
          spec_sheet_url?: string | null
          stability_notes?: string | null
          status?: string | null
          total_percentage?: number | null
          updated_at?: string | null
          version?: number | null
          viscosity_target?: string | null
        }
        Update: {
          active_ingredients?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          base_carrier?: string | null
          base_type?: string | null
          batch_size_default?: number | null
          batch_size_unit?: string | null
          challenge_test_passed?: boolean | null
          coa_template_url?: string | null
          compliant_regions?: string[] | null
          concentration_percent?: number | null
          concentration_type?: string | null
          cost_currency?: string | null
          cost_per_unit?: number | null
          created_at?: string | null
          created_by?: string | null
          equipment_needed?: string[] | null
          formula_code?: string | null
          formula_name?: string | null
          formulation_type?: string | null
          id?: string
          longevity?: string | null
          manufacturing_notes?: string | null
          metadata?: Json | null
          occasion_suitability?: string[] | null
          ph_range_max?: number | null
          ph_range_min?: number | null
          ph_target?: number | null
          preservative_system?: string | null
          product_id?: string
          regulatory_notes?: string | null
          scent_family?: string | null
          scent_profile?: Json | null
          scent_style?: string | null
          sds_url?: string | null
          season_suitability?: string[] | null
          shelf_life_months?: number | null
          sillage?: string | null
          skin_concerns?: string[] | null
          skin_types?: string[] | null
          spec_sheet_url?: string | null
          stability_notes?: string | null
          status?: string | null
          total_percentage?: number | null
          updated_at?: string | null
          version?: number | null
          viscosity_target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_formulations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_hub_assets: {
        Row: {
          asset_id: string | null
          created_at: string | null
          created_by: string | null
          external_filename: string | null
          external_mime_type: string | null
          external_provider: string | null
          external_thumbnail_url: string | null
          external_url: string | null
          id: string
          is_primary: boolean | null
          label: string | null
          notes: string | null
          position: number | null
          product_id: string
          relationship_type: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string | null
          created_by?: string | null
          external_filename?: string | null
          external_mime_type?: string | null
          external_provider?: string | null
          external_thumbnail_url?: string | null
          external_url?: string | null
          id?: string
          is_primary?: boolean | null
          label?: string | null
          notes?: string | null
          position?: number | null
          product_id: string
          relationship_type: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string | null
          created_by?: string | null
          external_filename?: string | null
          external_mime_type?: string | null
          external_provider?: string | null
          external_thumbnail_url?: string | null
          external_url?: string | null
          id?: string
          is_primary?: boolean | null
          label?: string | null
          notes?: string | null
          position?: number | null
          product_id?: string
          relationship_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_hub_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "dam_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_hub_assets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_hub_content: {
        Row: {
          content_id: string | null
          content_published_at: string | null
          content_status: string | null
          content_title: string | null
          content_type: string
          created_at: string | null
          created_by: string | null
          engagement_score: number | null
          external_url: string | null
          id: string
          notes: string | null
          product_id: string
          relationship: string | null
          updated_at: string | null
          views: number | null
        }
        Insert: {
          content_id?: string | null
          content_published_at?: string | null
          content_status?: string | null
          content_title?: string | null
          content_type: string
          created_at?: string | null
          created_by?: string | null
          engagement_score?: number | null
          external_url?: string | null
          id?: string
          notes?: string | null
          product_id: string
          relationship?: string | null
          updated_at?: string | null
          views?: number | null
        }
        Update: {
          content_id?: string | null
          content_published_at?: string | null
          content_status?: string | null
          content_title?: string | null
          content_type?: string
          created_at?: string | null
          created_by?: string | null
          engagement_score?: number | null
          external_url?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          relationship?: string | null
          updated_at?: string | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_hub_content_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_hubs: {
        Row: {
          barcode: string | null
          brand_voice_notes: string | null
          category: string | null
          collections: string[] | null
          compare_at_price: number | null
          cost_per_unit: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          development_stage: string | null
          discontinued_at: string | null
          external_ids: Json | null
          gallery_external_urls: string[] | null
          gallery_image_ids: string[] | null
          hero_image_external_url: string | null
          hero_image_id: string | null
          id: string
          is_self_manufactured: boolean | null
          key_benefits: string[] | null
          key_differentiators: string[] | null
          launch_date: string | null
          long_description: string | null
          metadata: Json | null
          name: string
          options: Json | null
          organization_id: string
          parent_product_id: string | null
          price: number | null
          product_line: string | null
          product_type: string | null
          published_at: string | null
          seo_description: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          short_description: string | null
          sku: string | null
          slug: string | null
          sort_order: number | null
          status: string | null
          subcategory: string | null
          supplier_id: string | null
          tagline: string | null
          tags: string[] | null
          target_audience: string | null
          updated_at: string | null
          variants: Json | null
          video_ids: string[] | null
          visibility: string | null
        }
        Insert: {
          barcode?: string | null
          brand_voice_notes?: string | null
          category?: string | null
          collections?: string[] | null
          compare_at_price?: number | null
          cost_per_unit?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          development_stage?: string | null
          discontinued_at?: string | null
          external_ids?: Json | null
          gallery_external_urls?: string[] | null
          gallery_image_ids?: string[] | null
          hero_image_external_url?: string | null
          hero_image_id?: string | null
          id?: string
          is_self_manufactured?: boolean | null
          key_benefits?: string[] | null
          key_differentiators?: string[] | null
          launch_date?: string | null
          long_description?: string | null
          metadata?: Json | null
          name: string
          options?: Json | null
          organization_id: string
          parent_product_id?: string | null
          price?: number | null
          product_line?: string | null
          product_type?: string | null
          published_at?: string | null
          seo_description?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          short_description?: string | null
          sku?: string | null
          slug?: string | null
          sort_order?: number | null
          status?: string | null
          subcategory?: string | null
          supplier_id?: string | null
          tagline?: string | null
          tags?: string[] | null
          target_audience?: string | null
          updated_at?: string | null
          variants?: Json | null
          video_ids?: string[] | null
          visibility?: string | null
        }
        Update: {
          barcode?: string | null
          brand_voice_notes?: string | null
          category?: string | null
          collections?: string[] | null
          compare_at_price?: number | null
          cost_per_unit?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          development_stage?: string | null
          discontinued_at?: string | null
          external_ids?: Json | null
          gallery_external_urls?: string[] | null
          gallery_image_ids?: string[] | null
          hero_image_external_url?: string | null
          hero_image_id?: string | null
          id?: string
          is_self_manufactured?: boolean | null
          key_benefits?: string[] | null
          key_differentiators?: string[] | null
          launch_date?: string | null
          long_description?: string | null
          metadata?: Json | null
          name?: string
          options?: Json | null
          organization_id?: string
          parent_product_id?: string | null
          price?: number | null
          product_line?: string | null
          product_type?: string | null
          published_at?: string | null
          seo_description?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          short_description?: string | null
          sku?: string | null
          slug?: string | null
          sort_order?: number | null
          status?: string | null
          subcategory?: string | null
          supplier_id?: string | null
          tagline?: string | null
          tags?: string[] | null
          target_audience?: string | null
          updated_at?: string | null
          variants?: Json | null
          video_ids?: string[] | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_hubs_hero_image_id_fkey"
            columns: ["hero_image_id"]
            isOneToOne: false
            referencedRelation: "dam_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_hubs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_hubs_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "product_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_hubs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_ingredients: {
        Row: {
          concentration_display: string | null
          concentration_percent: number | null
          contains_allergens: string[] | null
          created_at: string | null
          highlight_in_copy: boolean | null
          id: string
          inci_name: string | null
          ingredient_id: string | null
          is_active: boolean | null
          is_hero_ingredient: boolean | null
          marketing_claim: string | null
          origin: string | null
          product_id: string
          requires_disclosure: boolean | null
          role_in_product: string | null
          sort_order: number
        }
        Insert: {
          concentration_display?: string | null
          concentration_percent?: number | null
          contains_allergens?: string[] | null
          created_at?: string | null
          highlight_in_copy?: boolean | null
          id?: string
          inci_name?: string | null
          ingredient_id?: string | null
          is_active?: boolean | null
          is_hero_ingredient?: boolean | null
          marketing_claim?: string | null
          origin?: string | null
          product_id: string
          requires_disclosure?: boolean | null
          role_in_product?: string | null
          sort_order?: number
        }
        Update: {
          concentration_display?: string | null
          concentration_percent?: number | null
          contains_allergens?: string[] | null
          created_at?: string | null
          highlight_in_copy?: boolean | null
          id?: string
          inci_name?: string | null
          ingredient_id?: string | null
          is_active?: boolean | null
          is_hero_ingredient?: boolean | null
          marketing_claim?: string | null
          origin?: string | null
          product_id?: string
          requires_disclosure?: boolean | null
          role_in_product?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_packaging: {
        Row: {
          box_dimensions: Json | null
          box_material: string | null
          box_required: boolean | null
          closure_material: string | null
          closure_type: string | null
          container_capacity: string | null
          container_color: string | null
          container_material: string | null
          container_type: string | null
          created_at: string | null
          gross_weight: number | null
          gross_weight_unit: string | null
          id: string
          is_recyclable: boolean | null
          is_refillable: boolean | null
          label_material: string | null
          label_type: string | null
          lead_time_days: number | null
          moq: number | null
          net_weight: number | null
          net_weight_unit: string | null
          notes: string | null
          post_consumer_recycled_percent: number | null
          product_id: string
          recycling_code: string | null
          supplier_name: string | null
          supplier_sku: string | null
          unit_cost: number | null
          updated_at: string | null
        }
        Insert: {
          box_dimensions?: Json | null
          box_material?: string | null
          box_required?: boolean | null
          closure_material?: string | null
          closure_type?: string | null
          container_capacity?: string | null
          container_color?: string | null
          container_material?: string | null
          container_type?: string | null
          created_at?: string | null
          gross_weight?: number | null
          gross_weight_unit?: string | null
          id?: string
          is_recyclable?: boolean | null
          is_refillable?: boolean | null
          label_material?: string | null
          label_type?: string | null
          lead_time_days?: number | null
          moq?: number | null
          net_weight?: number | null
          net_weight_unit?: string | null
          notes?: string | null
          post_consumer_recycled_percent?: number | null
          product_id: string
          recycling_code?: string | null
          supplier_name?: string | null
          supplier_sku?: string | null
          unit_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          box_dimensions?: Json | null
          box_material?: string | null
          box_required?: boolean | null
          closure_material?: string | null
          closure_type?: string | null
          container_capacity?: string | null
          container_color?: string | null
          container_material?: string | null
          container_type?: string | null
          created_at?: string | null
          gross_weight?: number | null
          gross_weight_unit?: string | null
          id?: string
          is_recyclable?: boolean | null
          is_refillable?: boolean | null
          label_material?: string | null
          label_type?: string | null
          lead_time_days?: number | null
          moq?: number | null
          net_weight?: number | null
          net_weight_unit?: string | null
          notes?: string | null
          post_consumer_recycled_percent?: number | null
          product_id?: string
          recycling_code?: string | null
          supplier_name?: string | null
          supplier_sku?: string | null
          unit_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_packaging_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sds: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          color: string | null
          created_at: string | null
          created_by: string | null
          external_url: string | null
          file_name: string | null
          file_url: string | null
          first_aid_eye: string | null
          first_aid_ingestion: string | null
          first_aid_inhalation: string | null
          first_aid_skin: string | null
          flash_point: string | null
          ghs_classification: string[] | null
          ghs_pictograms: string[] | null
          hazard_statements: string[] | null
          id: string
          odor: string | null
          ph: number | null
          physical_state: string | null
          precautionary_statements: string[] | null
          product_id: string
          reaches_compliant: boolean | null
          request_notes: string | null
          request_sent_at: string | null
          request_sent_to: string | null
          revision_date: string | null
          shelf_life_months: number | null
          signal_word: string | null
          source_type: string | null
          status: string | null
          storage_conditions: string | null
          supplier_id: string | null
          tsca_compliant: boolean | null
          updated_at: string | null
          version: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          external_url?: string | null
          file_name?: string | null
          file_url?: string | null
          first_aid_eye?: string | null
          first_aid_ingestion?: string | null
          first_aid_inhalation?: string | null
          first_aid_skin?: string | null
          flash_point?: string | null
          ghs_classification?: string[] | null
          ghs_pictograms?: string[] | null
          hazard_statements?: string[] | null
          id?: string
          odor?: string | null
          ph?: number | null
          physical_state?: string | null
          precautionary_statements?: string[] | null
          product_id: string
          reaches_compliant?: boolean | null
          request_notes?: string | null
          request_sent_at?: string | null
          request_sent_to?: string | null
          revision_date?: string | null
          shelf_life_months?: number | null
          signal_word?: string | null
          source_type?: string | null
          status?: string | null
          storage_conditions?: string | null
          supplier_id?: string | null
          tsca_compliant?: boolean | null
          updated_at?: string | null
          version?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          external_url?: string | null
          file_name?: string | null
          file_url?: string | null
          first_aid_eye?: string | null
          first_aid_ingestion?: string | null
          first_aid_inhalation?: string | null
          first_aid_skin?: string | null
          flash_point?: string | null
          ghs_classification?: string[] | null
          ghs_pictograms?: string[] | null
          hazard_statements?: string[] | null
          id?: string
          odor?: string | null
          ph?: number | null
          physical_state?: string | null
          precautionary_statements?: string[] | null
          product_id?: string
          reaches_compliant?: boolean | null
          request_notes?: string | null
          request_sent_at?: string | null
          request_sent_to?: string | null
          revision_date?: string | null
          shelf_life_months?: number | null
          signal_word?: string | null
          source_type?: string | null
          status?: string | null
          storage_conditions?: string | null
          supplier_id?: string | null
          tsca_compliant?: boolean | null
          updated_at?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_sds_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_sds_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_specifications: {
        Row: {
          application_area: string | null
          awards: string[] | null
          certifications: string[] | null
          claims: string[] | null
          closure_type: string | null
          color: string | null
          concentration: string | null
          container_material: string | null
          container_type: string | null
          country_of_origin: string | null
          created_at: string | null
          custom_specs: Json | null
          dimensions: Json | null
          expiry_info: string | null
          finish: string | null
          frequency: string | null
          how_to_use: string | null
          id: string
          ph_level: number | null
          product_id: string
          scent: string | null
          shelf_life: string | null
          texture: string | null
          updated_at: string | null
          volume: string | null
          warnings: string[] | null
          weight: number | null
          weight_unit: string | null
          when_to_use: string | null
        }
        Insert: {
          application_area?: string | null
          awards?: string[] | null
          certifications?: string[] | null
          claims?: string[] | null
          closure_type?: string | null
          color?: string | null
          concentration?: string | null
          container_material?: string | null
          container_type?: string | null
          country_of_origin?: string | null
          created_at?: string | null
          custom_specs?: Json | null
          dimensions?: Json | null
          expiry_info?: string | null
          finish?: string | null
          frequency?: string | null
          how_to_use?: string | null
          id?: string
          ph_level?: number | null
          product_id: string
          scent?: string | null
          shelf_life?: string | null
          texture?: string | null
          updated_at?: string | null
          volume?: string | null
          warnings?: string[] | null
          weight?: number | null
          weight_unit?: string | null
          when_to_use?: string | null
        }
        Update: {
          application_area?: string | null
          awards?: string[] | null
          certifications?: string[] | null
          claims?: string[] | null
          closure_type?: string | null
          color?: string | null
          concentration?: string | null
          container_material?: string | null
          container_type?: string | null
          country_of_origin?: string | null
          created_at?: string | null
          custom_specs?: Json | null
          dimensions?: Json | null
          expiry_info?: string | null
          finish?: string | null
          frequency?: string | null
          how_to_use?: string | null
          id?: string
          ph_level?: number | null
          product_id?: string
          scent?: string | null
          shelf_life?: string | null
          texture?: string | null
          updated_at?: string | null
          volume?: string | null
          warnings?: string[] | null
          weight?: number | null
          weight_unit?: string | null
          when_to_use?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_specifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stages: {
        Row: {
          color: string | null
          created_at: string | null
          default_assignee_role: Database["public"]["Enums"]["team_role"] | null
          description: string | null
          icon: string | null
          id: string
          is_default: boolean | null
          is_final: boolean | null
          name: string
          organization_id: string
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          default_assignee_role?:
            | Database["public"]["Enums"]["team_role"]
            | null
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          is_final?: boolean | null
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          default_assignee_role?:
            | Database["public"]["Enums"]["team_role"]
            | null
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          is_final?: boolean | null
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_stages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          completed_by: string | null
          context_notes: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          due_date_type: Database["public"]["Enums"]["due_date_type"] | null
          id: string
          organization_id: string
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          product_id: string | null
          section: string | null
          sort_order: number | null
          stage_id: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          context_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          due_date_type?: Database["public"]["Enums"]["due_date_type"] | null
          id?: string
          organization_id: string
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          product_id?: string | null
          section?: string | null
          sort_order?: number | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          context_notes?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          due_date_type?: Database["public"]["Enums"]["due_date_type"] | null
          id?: string
          organization_id?: string
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          product_id?: string | null
          section?: string | null
          sort_order?: number | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "product_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tasks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tasks_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "product_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          compare_at_price: number | null
          cost_per_unit: number | null
          created_at: string | null
          id: string
          image_id: string | null
          image_ids: string[] | null
          is_active: boolean | null
          is_default: boolean | null
          metadata: Json | null
          name: string
          option1_name: string | null
          option1_value: string | null
          option2_name: string | null
          option2_value: string | null
          option3_name: string | null
          option3_value: string | null
          position: number | null
          price: number | null
          product_id: string
          shopify_inventory_item_id: string | null
          shopify_variant_id: string | null
          sku: string | null
          stock_quantity: number | null
          track_inventory: boolean | null
          updated_at: string | null
          weight: number | null
          weight_unit: string | null
        }
        Insert: {
          barcode?: string | null
          compare_at_price?: number | null
          cost_per_unit?: number | null
          created_at?: string | null
          id?: string
          image_id?: string | null
          image_ids?: string[] | null
          is_active?: boolean | null
          is_default?: boolean | null
          metadata?: Json | null
          name: string
          option1_name?: string | null
          option1_value?: string | null
          option2_name?: string | null
          option2_value?: string | null
          option3_name?: string | null
          option3_value?: string | null
          position?: number | null
          price?: number | null
          product_id: string
          shopify_inventory_item_id?: string | null
          shopify_variant_id?: string | null
          sku?: string | null
          stock_quantity?: number | null
          track_inventory?: boolean | null
          updated_at?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Update: {
          barcode?: string | null
          compare_at_price?: number | null
          cost_per_unit?: number | null
          created_at?: string | null
          id?: string
          image_id?: string | null
          image_ids?: string[] | null
          is_active?: boolean | null
          is_default?: boolean | null
          metadata?: Json | null
          name?: string
          option1_name?: string | null
          option1_value?: string | null
          option2_name?: string | null
          option2_value?: string | null
          option3_name?: string | null
          option3_value?: string | null
          position?: number | null
          price?: number | null
          product_id?: string
          shopify_inventory_item_id?: string | null
          shopify_variant_id?: string | null
          sku?: string | null
          stock_quantity?: number | null
          track_inventory?: boolean | null
          updated_at?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "dam_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          current_onboarding_step: number | null
          email: string | null
          full_name: string | null
          has_scanned_website: boolean | null
          has_scheduled_call: boolean | null
          has_uploaded_docs: boolean | null
          id: string
          onboarding_status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_onboarding_step?: number | null
          email?: string | null
          full_name?: string | null
          has_scanned_website?: boolean | null
          has_scheduled_call?: boolean | null
          has_uploaded_docs?: boolean | null
          id: string
          onboarding_status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_onboarding_step?: number | null
          email?: string | null
          full_name?: string | null
          has_scanned_website?: boolean | null
          has_scheduled_call?: boolean | null
          has_uploaded_docs?: boolean | null
          id?: string
          onboarding_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      prompt_descriptors: {
        Row: {
          descriptor_key: string
          descriptor_text: string
          descriptor_type: Database["public"]["Enums"]["prompt_descriptor_type"]
          id: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          descriptor_key: string
          descriptor_text: string
          descriptor_type: Database["public"]["Enums"]["prompt_descriptor_type"]
          id?: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          descriptor_key?: string
          descriptor_text?: string
          descriptor_type?: Database["public"]["Enums"]["prompt_descriptor_type"]
          id?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_descriptors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          additional_context: Json | null
          archived_at: string | null
          audience: string | null
          auto_generated_name: string | null
          avg_quality_rating: number | null
          base_notes: string | null
          category: string | null
          collection: string
          content_id: string | null
          content_type: Database["public"]["Enums"]["content_type"]
          created_at: string | null
          created_by: string | null
          custom_instructions: string | null
          deliverable_format: string | null
          edit_percentage: number | null
          effectiveness_score: number | null
          generated_image_id: string | null
          goal: string | null
          id: string
          image_source: Database["public"]["Enums"]["image_source_type"] | null
          image_url: string | null
          is_archived: boolean
          is_auto_saved: boolean | null
          is_favorited: boolean | null
          is_template: boolean | null
          last_used_at: string | null
          meta_instructions: Json | null
          middle_notes: string | null
          on_brand_score: number | null
          organization_id: string
          parent_prompt_id: string | null
          product_id: string | null
          prompt_text: string
          scent_family: Database["public"]["Enums"]["scent_family"] | null
          style_overlay: string | null
          tags: string[] | null
          times_used: number | null
          title: string
          top_notes: string | null
          transparency_statement: string | null
          updated_at: string | null
          user_custom_name: string | null
          version: number | null
          was_multiplied: boolean | null
          was_scheduled: boolean | null
        }
        Insert: {
          additional_context?: Json | null
          archived_at?: string | null
          audience?: string | null
          auto_generated_name?: string | null
          avg_quality_rating?: number | null
          base_notes?: string | null
          category?: string | null
          collection: string
          content_id?: string | null
          content_type: Database["public"]["Enums"]["content_type"]
          created_at?: string | null
          created_by?: string | null
          custom_instructions?: string | null
          deliverable_format?: string | null
          edit_percentage?: number | null
          effectiveness_score?: number | null
          generated_image_id?: string | null
          goal?: string | null
          id?: string
          image_source?: Database["public"]["Enums"]["image_source_type"] | null
          image_url?: string | null
          is_archived?: boolean
          is_auto_saved?: boolean | null
          is_favorited?: boolean | null
          is_template?: boolean | null
          last_used_at?: string | null
          meta_instructions?: Json | null
          middle_notes?: string | null
          on_brand_score?: number | null
          organization_id: string
          parent_prompt_id?: string | null
          product_id?: string | null
          prompt_text: string
          scent_family?: Database["public"]["Enums"]["scent_family"] | null
          style_overlay?: string | null
          tags?: string[] | null
          times_used?: number | null
          title: string
          top_notes?: string | null
          transparency_statement?: string | null
          updated_at?: string | null
          user_custom_name?: string | null
          version?: number | null
          was_multiplied?: boolean | null
          was_scheduled?: boolean | null
        }
        Update: {
          additional_context?: Json | null
          archived_at?: string | null
          audience?: string | null
          auto_generated_name?: string | null
          avg_quality_rating?: number | null
          base_notes?: string | null
          category?: string | null
          collection?: string
          content_id?: string | null
          content_type?: Database["public"]["Enums"]["content_type"]
          created_at?: string | null
          created_by?: string | null
          custom_instructions?: string | null
          deliverable_format?: string | null
          edit_percentage?: number | null
          effectiveness_score?: number | null
          generated_image_id?: string | null
          goal?: string | null
          id?: string
          image_source?: Database["public"]["Enums"]["image_source_type"] | null
          image_url?: string | null
          is_archived?: boolean
          is_auto_saved?: boolean | null
          is_favorited?: boolean | null
          is_template?: boolean | null
          last_used_at?: string | null
          meta_instructions?: Json | null
          middle_notes?: string | null
          on_brand_score?: number | null
          organization_id?: string
          parent_prompt_id?: string | null
          product_id?: string | null
          prompt_text?: string
          scent_family?: Database["public"]["Enums"]["scent_family"] | null
          style_overlay?: string | null
          tags?: string[] | null
          times_used?: number | null
          title?: string
          top_notes?: string | null
          transparency_statement?: string | null
          updated_at?: string | null
          user_custom_name?: string | null
          version?: number | null
          was_multiplied?: boolean | null
          was_scheduled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "prompts_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "master_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompts_generated_image_id_fkey"
            columns: ["generated_image_id"]
            isOneToOne: false
            referencedRelation: "generated_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompts_parent_prompt_id_fkey"
            columns: ["parent_prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      publishing_history: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          error_message: string | null
          external_id: string | null
          external_url: string | null
          id: string
          metadata: Json | null
          organization_id: string
          platform: string
          published_at: string
          published_by: string
          status: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          platform: string
          published_at?: string
          published_by: string
          status?: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          external_url?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          platform?: string
          published_at?: string
          published_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "publishing_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      repurposing_rules: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          organization_id: string | null
          platform_constraints: Json | null
          source_type: string
          target_type: string
          transformation_prompt: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          platform_constraints?: Json | null
          source_type: string
          target_type: string
          transformation_prompt: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          platform_constraints?: Json | null
          source_type?: string
          target_type?: string
          transformation_prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "repurposing_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_capabilities: {
        Row: {
          created_at: string | null
          dashboard_widgets: string[] | null
          default_expanded_sections: string[] | null
          id: string
          priority_focus: string | null
          section_analytics: string | null
          section_compliance: string | null
          section_formulation: string | null
          section_info: string | null
          section_ingredients: string | null
          section_marketing: string | null
          section_media: string | null
          section_packaging: string | null
          team_role: Database["public"]["Enums"]["team_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dashboard_widgets?: string[] | null
          default_expanded_sections?: string[] | null
          id?: string
          priority_focus?: string | null
          section_analytics?: string | null
          section_compliance?: string | null
          section_formulation?: string | null
          section_info?: string | null
          section_ingredients?: string | null
          section_marketing?: string | null
          section_media?: string | null
          section_packaging?: string | null
          team_role: Database["public"]["Enums"]["team_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dashboard_widgets?: string[] | null
          default_expanded_sections?: string[] | null
          id?: string
          priority_focus?: string | null
          section_analytics?: string | null
          section_compliance?: string | null
          section_formulation?: string | null
          section_info?: string | null
          section_ingredients?: string | null
          section_marketing?: string | null
          section_media?: string | null
          section_packaging?: string | null
          team_role?: Database["public"]["Enums"]["team_role"]
          updated_at?: string | null
        }
        Relationships: []
      }
      sanity_connections: {
        Row: {
          api_version: string
          created_at: string
          dataset: string
          id: string
          is_active: boolean
          last_error: string | null
          last_schema_inspected_at: string | null
          last_schema_status: string | null
          organization_id: string
          project_id: string
          schema_profile: string
          studio_url: string | null
          updated_at: string
          write_token_secret_name: string
        }
        Insert: {
          api_version?: string
          created_at?: string
          dataset?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_schema_inspected_at?: string | null
          last_schema_status?: string | null
          organization_id: string
          project_id: string
          schema_profile?: string
          studio_url?: string | null
          updated_at?: string
          write_token_secret_name: string
        }
        Update: {
          api_version?: string
          created_at?: string
          dataset?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_schema_inspected_at?: string | null
          last_schema_status?: string | null
          organization_id?: string
          project_id?: string
          schema_profile?: string
          studio_url?: string | null
          updated_at?: string
          write_token_secret_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sanity_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sanity_destination_registry: {
        Row: {
          created_at: string
          description: string | null
          destination_key: string
          id: string
          is_active: boolean
          organization_id: string | null
          publish_mode: string
          required_metadata: Json
          requires_image: boolean
          sanity_document_type: string
          schema_profile: string
          selector_params: Json
          selector_query: string
          target_field_path: string
          target_list_query: string | null
          updated_at: string
          upsert_defaults: Json
          upsert_id_template: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          destination_key: string
          id?: string
          is_active?: boolean
          organization_id?: string | null
          publish_mode?: string
          required_metadata?: Json
          requires_image?: boolean
          sanity_document_type: string
          schema_profile?: string
          selector_params?: Json
          selector_query: string
          target_field_path: string
          target_list_query?: string | null
          updated_at?: string
          upsert_defaults?: Json
          upsert_id_template?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          destination_key?: string
          id?: string
          is_active?: boolean
          organization_id?: string | null
          publish_mode?: string
          required_metadata?: Json
          requires_image?: boolean
          sanity_document_type?: string
          schema_profile?: string
          selector_params?: Json
          selector_query?: string
          target_field_path?: string
          target_list_query?: string | null
          updated_at?: string
          upsert_defaults?: Json
          upsert_id_template?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sanity_destination_registry_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sanity_publish_log: {
        Row: {
          connection_id: string | null
          created_at: string
          destination_key: string | null
          error_message: string | null
          id: string
          metadata: Json
          operation: string
          organization_id: string
          published_by: string | null
          request_payload: Json
          response_payload: Json
          sanity_asset_id: string | null
          sanity_document_id: string | null
          sanity_document_type: string | null
          source_image_url: string | null
          status: string
          target_field_path: string | null
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          destination_key?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          operation: string
          organization_id: string
          published_by?: string | null
          request_payload?: Json
          response_payload?: Json
          sanity_asset_id?: string | null
          sanity_document_id?: string | null
          sanity_document_type?: string | null
          source_image_url?: string | null
          status: string
          target_field_path?: string | null
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          destination_key?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          operation?: string
          organization_id?: string
          published_by?: string | null
          request_payload?: Json
          response_payload?: Json
          sanity_asset_id?: string | null
          sanity_document_id?: string | null
          sanity_document_type?: string | null
          source_image_url?: string | null
          status?: string
          target_field_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sanity_publish_log_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "sanity_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sanity_publish_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sanity_schema_inspections: {
        Row: {
          connection_id: string | null
          created_at: string
          dataset: string | null
          destination_matches: Json
          error_message: string | null
          id: string
          inspected_by: string | null
          observed_document_types: Json
          organization_id: string
          project_id: string | null
          sampled_documents: Json
          status: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          dataset?: string | null
          destination_matches?: Json
          error_message?: string | null
          id?: string
          inspected_by?: string | null
          observed_document_types?: Json
          organization_id: string
          project_id?: string | null
          sampled_documents?: Json
          status: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          dataset?: string | null
          destination_matches?: Json
          error_message?: string | null
          id?: string
          inspected_by?: string | null
          observed_document_types?: Json
          organization_id?: string
          project_id?: string | null
          sampled_documents?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sanity_schema_inspections_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "sanity_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sanity_schema_inspections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scent_notes: {
        Row: {
          avoid_with: string[] | null
          character_tags: string[] | null
          common_forms: string[] | null
          created_at: string | null
          description: string | null
          id: string
          intensity: string | null
          is_active: boolean | null
          name: string
          name_variants: string[] | null
          natural_source: string | null
          note_type: string
          pairs_well_with: string[] | null
          scent_family: string
          subfamly: string | null
          usage_count: number | null
        }
        Insert: {
          avoid_with?: string[] | null
          character_tags?: string[] | null
          common_forms?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          intensity?: string | null
          is_active?: boolean | null
          name: string
          name_variants?: string[] | null
          natural_source?: string | null
          note_type: string
          pairs_well_with?: string[] | null
          scent_family: string
          subfamly?: string | null
          usage_count?: number | null
        }
        Update: {
          avoid_with?: string[] | null
          character_tags?: string[] | null
          common_forms?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          intensity?: string | null
          is_active?: boolean | null
          name?: string
          name_variants?: string[] | null
          natural_source?: string | null
          note_type?: string
          pairs_well_with?: string[] | null
          scent_family?: string
          subfamly?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      scheduled_content: {
        Row: {
          content_id: string | null
          content_type: string
          created_at: string | null
          derivative_id: string | null
          google_event_id: string | null
          id: string
          notes: string | null
          organization_id: string | null
          platform: string | null
          prompt_id: string | null
          scheduled_date: string
          scheduled_time: string | null
          status: string | null
          sync_status: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content_id?: string | null
          content_type: string
          created_at?: string | null
          derivative_id?: string | null
          google_event_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          platform?: string | null
          prompt_id?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          status?: string | null
          sync_status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content_id?: string | null
          content_type?: string
          created_at?: string | null
          derivative_id?: string | null
          google_event_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          platform?: string | null
          prompt_id?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          status?: string | null
          sync_status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_content_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "master_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_content_derivative_id_fkey"
            columns: ["derivative_id"]
            isOneToOne: false
            referencedRelation: "derivative_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_content_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_content_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      schwartz_templates: {
        Row: {
          created_at: string | null
          description: string | null
          example_headlines: string[] | null
          forbidden_approaches: string[] | null
          id: string
          key_principles: string[] | null
          metadata: Json | null
          opening_strategies: string[] | null
          stage: string
          template_content: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          example_headlines?: string[] | null
          forbidden_approaches?: string[] | null
          id?: string
          key_principles?: string[] | null
          metadata?: Json | null
          opening_strategies?: string[] | null
          stage: string
          template_content: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          example_headlines?: string[] | null
          forbidden_approaches?: string[] | null
          id?: string
          key_principles?: string[] | null
          metadata?: Json | null
          opening_strategies?: string[] | null
          stage?: string
          template_content?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sds_requests: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          message: string | null
          organization_id: string
          product_id: string | null
          received_at: string | null
          received_sds_id: string | null
          response_notes: string | null
          sent_at: string | null
          sent_to_email: string
          sent_to_name: string | null
          status: string | null
          subject: string | null
          supplier_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          message?: string | null
          organization_id: string
          product_id?: string | null
          received_at?: string | null
          received_sds_id?: string | null
          response_notes?: string | null
          sent_at?: string | null
          sent_to_email: string
          sent_to_name?: string | null
          status?: string | null
          subject?: string | null
          supplier_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          message?: string | null
          organization_id?: string
          product_id?: string | null
          received_at?: string | null
          received_sds_id?: string | null
          response_notes?: string | null
          sent_at?: string | null
          sent_to_email?: string
          sent_to_name?: string | null
          status?: string | null
          subject?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sds_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sds_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sds_requests_received_sds_id_fkey"
            columns: ["received_sds_id"]
            isOneToOne: false
            referencedRelation: "product_sds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sds_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_connections: {
        Row: {
          access_token_encrypted: string
          access_token_iv: string | null
          created_at: string | null
          id: string
          last_synced_at: string | null
          organization_id: string
          shop_domain: string
          sync_status: string | null
          updated_at: string | null
        }
        Insert: {
          access_token_encrypted: string
          access_token_iv?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          organization_id: string
          shop_domain: string
          sync_status?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token_encrypted?: string
          access_token_iv?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          organization_id?: string
          shop_domain?: string
          sync_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_publish_authorizations: {
        Row: {
          authorized_at: string
          authorized_by_user_id: string
          consumed_at: string | null
          consumed_by_user_id: string | null
          created_at: string
          expires_at: string
          generated_image_id: string
          grace_sku: string
          id: string
          organization_id: string
          pipeline_sku_job_id: string
          purpose: string
          website_sku: string
        }
        Insert: {
          authorized_at?: string
          authorized_by_user_id: string
          consumed_at?: string | null
          consumed_by_user_id?: string | null
          created_at?: string
          expires_at: string
          generated_image_id: string
          grace_sku: string
          id?: string
          organization_id: string
          pipeline_sku_job_id: string
          purpose: string
          website_sku: string
        }
        Update: {
          authorized_at?: string
          authorized_by_user_id?: string
          consumed_at?: string | null
          consumed_by_user_id?: string | null
          created_at?: string
          expires_at?: string
          generated_image_id?: string
          grace_sku?: string
          id?: string
          organization_id?: string
          pipeline_sku_job_id?: string
          purpose?: string
          website_sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopify_publish_authorizations_generated_image_id_fkey"
            columns: ["generated_image_id"]
            isOneToOne: false
            referencedRelation: "generated_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_publish_authorizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_publish_authorizations_pipeline_sku_job_id_fkey"
            columns: ["pipeline_sku_job_id"]
            isOneToOne: false
            referencedRelation: "best_bottles_pipeline_sku_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_publish_log: {
        Row: {
          id: string
          organization_id: string
          product_id: string | null
          published_at: string | null
          published_by: string | null
          published_content: Json
          shopify_product_id: string
        }
        Insert: {
          id?: string
          organization_id: string
          product_id?: string | null
          published_at?: string | null
          published_by?: string | null
          published_content?: Json
          shopify_product_id: string
        }
        Update: {
          id?: string
          organization_id?: string
          product_id?: string | null
          published_at?: string | null
          published_by?: string | null
          published_content?: Json
          shopify_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopify_publish_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shot_types: {
        Row: {
          created_at: string | null
          id: string
          label: string
          organization_id: string | null
          prompt: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          label: string
          organization_id?: string | null
          prompt: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          label?: string
          organization_id?: string | null
          prompt?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shot_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connections: {
        Row: {
          access_token_cipher: string
          account_type: string
          connected_at: string
          connected_by: string | null
          created_at: string
          external_account_avatar_url: string | null
          external_account_handle: string | null
          external_account_id: string
          external_account_name: string | null
          external_parent_id: string | null
          external_parent_name: string | null
          id: string
          last_published_at: string | null
          last_verified_at: string | null
          metadata: Json
          organization_id: string
          platform: string
          refresh_token_cipher: string | null
          refresh_token_expires_at: string | null
          scopes: string[]
          status: string
          status_detail: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_cipher: string
          account_type?: string
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          external_account_avatar_url?: string | null
          external_account_handle?: string | null
          external_account_id: string
          external_account_name?: string | null
          external_parent_id?: string | null
          external_parent_name?: string | null
          id?: string
          last_published_at?: string | null
          last_verified_at?: string | null
          metadata?: Json
          organization_id: string
          platform: string
          refresh_token_cipher?: string | null
          refresh_token_expires_at?: string | null
          scopes?: string[]
          status?: string
          status_detail?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_cipher?: string
          account_type?: string
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          external_account_avatar_url?: string | null
          external_account_handle?: string | null
          external_account_id?: string
          external_account_name?: string | null
          external_parent_id?: string | null
          external_parent_name?: string | null
          id?: string
          last_published_at?: string | null
          last_verified_at?: string | null
          metadata?: Json
          organization_id?: string
          platform?: string
          refresh_token_cipher?: string | null
          refresh_token_expires_at?: string | null
          scopes?: string[]
          status?: string
          status_detail?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_oauth_states: {
        Row: {
          code_verifier: string | null
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          platform: string
          redirect_url: string
          requested_scopes: string[]
          state: string
          user_id: string
        }
        Insert: {
          code_verifier?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          organization_id: string
          platform: string
          redirect_url: string
          requested_scopes?: string[]
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          platform?: string
          redirect_url?: string
          requested_scopes?: string[]
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_oauth_states_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          attempt_count: number
          caption: string
          connection_id: string | null
          created_at: string
          created_by: string | null
          derivative_asset_id: string | null
          error_code: string | null
          error_message: string | null
          external_post_id: string | null
          first_comment: string | null
          group_id: string
          id: string
          idempotency_key: string | null
          lease_expires_at: string | null
          link_url: string | null
          locked_by: string | null
          master_content_id: string | null
          max_attempts: number
          media: Json
          options: Json
          organization_id: string
          permalink: string | null
          platform: string
          publish_after: string | null
          published_at: string | null
          scheduled_content_id: string | null
          scheduled_for: string | null
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          caption?: string
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          derivative_asset_id?: string | null
          error_code?: string | null
          error_message?: string | null
          external_post_id?: string | null
          first_comment?: string | null
          group_id?: string
          id?: string
          idempotency_key?: string | null
          lease_expires_at?: string | null
          link_url?: string | null
          locked_by?: string | null
          master_content_id?: string | null
          max_attempts?: number
          media?: Json
          options?: Json
          organization_id: string
          permalink?: string | null
          platform: string
          publish_after?: string | null
          published_at?: string | null
          scheduled_content_id?: string | null
          scheduled_for?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          caption?: string
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          derivative_asset_id?: string | null
          error_code?: string | null
          error_message?: string | null
          external_post_id?: string | null
          first_comment?: string | null
          group_id?: string
          id?: string
          idempotency_key?: string | null
          lease_expires_at?: string | null
          link_url?: string | null
          locked_by?: string | null
          master_content_id?: string | null
          max_attempts?: number
          media?: Json
          options?: Json
          organization_id?: string
          permalink?: string | null
          platform?: string
          publish_after?: string | null
          published_at?: string | null
          scheduled_content_id?: string | null
          scheduled_for?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "social_connection_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_derivative_asset_id_fkey"
            columns: ["derivative_asset_id"]
            isOneToOne: false
            referencedRelation: "derivative_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_master_content_id_fkey"
            columns: ["master_content_id"]
            isOneToOne: false
            referencedRelation: "master_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_scheduled_content_id_fkey"
            columns: ["scheduled_content_id"]
            isOneToOne: false
            referencedRelation: "scheduled_content"
            referencedColumns: ["id"]
          },
        ]
      }
      social_publish_attempts: {
        Row: {
          attempt_number: number
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          http_status: number | null
          id: string
          organization_id: string
          outcome: string | null
          platform: string
          post_id: string
          request_summary: Json
          response_summary: Json
          started_at: string
        }
        Insert: {
          attempt_number: number
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          organization_id: string
          outcome?: string | null
          platform: string
          post_id: string
          request_summary?: Json
          response_summary?: Json
          started_at?: string
        }
        Update: {
          attempt_number?: number
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          organization_id?: string
          outcome?: string | null
          platform?: string
          post_id?: string
          request_summary?: Json
          response_summary?: Json
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_publish_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_publish_attempts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_addons: {
        Row: {
          created_at: string | null
          description: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          name: string
          price_monthly: number
          required_tier_slug: string | null
          slug: string
          sort_order: number | null
          stripe_price_id_monthly: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          price_monthly: number
          required_tier_slug?: string | null
          slug: string
          sort_order?: number | null
          stripe_price_id_monthly?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          price_monthly?: number
          required_tier_slug?: string | null
          slug?: string
          sort_order?: number | null
          stripe_price_id_monthly?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_addons_required_tier_slug_fkey"
            columns: ["required_tier_slug"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["slug"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string | null
          description: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          name: string
          price_monthly: number
          price_yearly: number | null
          slug: string
          sort_order: number | null
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          price_monthly?: number
          price_yearly?: number | null
          slug: string
          sort_order?: number | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          price_monthly?: number
          price_yearly?: number | null
          slug?: string
          sort_order?: number | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          organization_id: string
          plan_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id: string
          plan_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          account_number: string | null
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          company_type: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          has_sds_portal: boolean | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          organization_id: string
          payment_terms: string | null
          postal_code: string | null
          sds_portal_url: string | null
          state: string | null
          typical_response_days: number | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          account_number?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          company_type?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          has_sds_portal?: boolean | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          organization_id: string
          payment_terms?: string | null
          postal_code?: string | null
          sds_portal_url?: string | null
          state?: string | null
          typical_response_days?: number | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          account_number?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          company_type?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          has_sds_portal?: boolean | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          organization_id?: string
          payment_terms?: string | null
          postal_code?: string | null
          sds_portal_url?: string | null
          state?: string | null
          typical_response_days?: number | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          id: string
          mentions: string[] | null
          task_id: string
          updated_at: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          id?: string
          mentions?: string[] | null
          task_id: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          id?: string
          mentions?: string[] | null
          task_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "product_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["organization_role"]
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["organization_role"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["organization_role"]
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activities: {
        Row: {
          activity_type: string
          content_id: string | null
          content_type: string | null
          created_at: string | null
          duration_ms: number | null
          id: string
          metadata: Json | null
          organization_id: string | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          content_id?: string | null
          content_type?: string | null
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          content_id?: string | null
          content_type?: string | null
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activities_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "master_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      video_completions: {
        Row: {
          completed_at: string
          created_at: string
          id: string
          user_id: string
          video_id: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          id?: string
          user_id: string
          video_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          id?: string
          user_id?: string
          video_id?: string
        }
        Relationships: []
      }
      visual_masters: {
        Row: {
          composition_rules: Json | null
          created_at: string | null
          example_images: string[] | null
          forbidden_styles: string[] | null
          full_content: string
          id: string
          lighting_rules: Json | null
          master_name: string
          metadata: Json | null
          prompt_template: string | null
          squad: string
          summary: string | null
          updated_at: string | null
        }
        Insert: {
          composition_rules?: Json | null
          created_at?: string | null
          example_images?: string[] | null
          forbidden_styles?: string[] | null
          full_content: string
          id?: string
          lighting_rules?: Json | null
          master_name: string
          metadata?: Json | null
          prompt_template?: string | null
          squad: string
          summary?: string | null
          updated_at?: string | null
        }
        Update: {
          composition_rules?: Json | null
          created_at?: string | null
          example_images?: string[] | null
          forbidden_styles?: string[] | null
          full_content?: string
          id?: string
          lighting_rules?: Json | null
          master_name?: string
          metadata?: Json | null
          prompt_template?: string | null
          squad?: string
          summary?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      worksheet_uploads: {
        Row: {
          confidence_scores: Json | null
          created_at: string | null
          error_message: string | null
          extracted_data: Json | null
          file_name: string
          file_size: number
          file_url: string
          id: string
          organization_id: string
          processing_status: string | null
          updated_at: string | null
          uploaded_by: string
          used_at: string | null
        }
        Insert: {
          confidence_scores?: Json | null
          created_at?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          file_name: string
          file_size: number
          file_url: string
          id?: string
          organization_id: string
          processing_status?: string | null
          updated_at?: string | null
          uploaded_by: string
          used_at?: string | null
        }
        Update: {
          confidence_scores?: Json | null
          created_at?: string | null
          error_message?: string | null
          extracted_data?: Json | null
          file_name?: string
          file_size?: number
          file_url?: string
          id?: string
          organization_id?: string
          processing_status?: string | null
          updated_at?: string | null
          uploaded_by?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_uploads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      best_bottles_image_reconciliation_status: {
        Row: {
          all_assignments_approved: boolean | null
          all_convex_verified: boolean | null
          all_convex_writes_recorded: boolean | null
          all_pipeline_images_match: boolean | null
          all_shopify_verified: boolean | null
          all_shopify_writes_recorded: boolean | null
          any_assignment_approved: boolean | null
          any_destination_mismatch: boolean | null
          asset_role: string | null
          assignment_count: number | null
          assignments: Json | null
          baseline_delta_px: number | null
          canvas_height_px: number | null
          canvas_width_px: number | null
          catalog_truth: Json | null
          catalog_truth_hash: string | null
          center_delta_pct: number | null
          center_x_pct: number | null
          created_at: string | null
          detected_baseline_y_px: number | null
          family: string | null
          fill_height_pct: number | null
          final_image_url: string | null
          framing_decision: string | null
          framing_qa: Json | null
          grace_sku: string | null
          image_id: string | null
          is_reconciled: boolean | null
          last_error: string | null
          library_approved: boolean | null
          lifecycle_state: string | null
          mask_controlled: boolean | null
          object_bounds: Json | null
          organization_id: string | null
          pre_transform_baseline_y_px: number | null
          pre_transform_object_bounds: Json | null
          prompt_hash: string | null
          prompt_version: string | null
          provider_model: string | null
          qa_completed_at: string | null
          qa_issues: string[] | null
          raw_image_url: string | null
          reconciled_at: string | null
          reconciliation_status: string | null
          requires_pipeline_reconciliation: boolean | null
          rig_version: string | null
          rigged_at: string | null
          scale_factor: number | null
          shadow_owner: string | null
          shadow_qa: Json | null
          shadow_topology: Json | null
          shift_x_px: number | null
          shift_y_px: number | null
          source_reference_hash: string | null
          source_reference_url: string | null
          target_baseline_y_px: number | null
          target_center_x_pct: number | null
          transform_control_bounds: Json | null
          updated_at: string | null
          website_sku: string | null
        }
        Relationships: [
          {
            foreignKeyName: "best_bottles_image_reconciliations_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: true
            referencedRelation: "generated_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "best_bottles_image_reconciliations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connection_summaries: {
        Row: {
          account_type: string | null
          connected_at: string | null
          external_account_avatar_url: string | null
          external_account_handle: string | null
          external_account_id: string | null
          external_account_name: string | null
          external_parent_id: string | null
          external_parent_name: string | null
          id: string | null
          last_published_at: string | null
          last_verified_at: string | null
          metadata: Json | null
          organization_id: string | null
          platform: string | null
          scopes: string[] | null
          status: string | null
          status_detail: string | null
          token_expires_at: string | null
          token_expiring_soon: boolean | null
        }
        Insert: {
          account_type?: string | null
          connected_at?: string | null
          external_account_avatar_url?: string | null
          external_account_handle?: string | null
          external_account_id?: string | null
          external_account_name?: string | null
          external_parent_id?: string | null
          external_parent_name?: string | null
          id?: string | null
          last_published_at?: string | null
          last_verified_at?: string | null
          metadata?: Json | null
          organization_id?: string | null
          platform?: string | null
          scopes?: string[] | null
          status?: string | null
          status_detail?: string | null
          token_expires_at?: string | null
          token_expiring_soon?: never
        }
        Update: {
          account_type?: string | null
          connected_at?: string | null
          external_account_avatar_url?: string | null
          external_account_handle?: string | null
          external_account_id?: string | null
          external_account_name?: string | null
          external_parent_id?: string | null
          external_parent_name?: string | null
          id?: string | null
          last_published_at?: string | null
          last_verified_at?: string | null
          metadata?: Json | null
          organization_id?: string | null
          platform?: string | null
          scopes?: string[] | null
          status?: string | null
          status_detail?: string | null
          token_expires_at?: string | null
          token_expiring_soon?: never
        }
        Relationships: [
          {
            foreignKeyName: "social_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_pending_invitations_for_user: {
        Args: { _user_email: string; _user_id: string }
        Returns: {
          invitation_id: string
          organization_id: string
          role: string
        }[]
      }
      approve_best_bottles_reconciled_image: {
        Args: {
          p_image_id: string
          p_organization_id: string
          p_pipeline_sku_job_id: string
        }
        Returns: undefined
      }
      approve_paper_doll_candidate: {
        Args: {
          p_approved_ref?: Json
          p_approver_display_name: string
          p_approver_user_id: string
          p_candidate_component_version_id: string
          p_decision: string
          p_evidence_ids: string[]
          p_expected_candidate_sha256: string
          p_organization_id: string
        }
        Returns: Json
      }
      bb_has_role: {
        Args: { p_org_id: string; p_roles: string[]; p_user_id: string }
        Returns: boolean
      }
      best_bottles_assert_org_member: {
        Args: { p_organization_id: string }
        Returns: undefined
      }
      best_bottles_material_pilot_mark_attempt_completed: {
        Args: { target_run_id: string }
        Returns: number
      }
      best_bottles_material_pilot_mark_attempt_launched: {
        Args: { target_run_id: string }
        Returns: number
      }
      best_bottles_shadow_evidence_passes: {
        Args: {
          p_family: string
          p_prompt_version: string
          p_shadow_owner: string
          p_shadow_qa: Json
          p_shadow_topology: Json
        }
        Returns: boolean
      }
      best_bottles_shadow_review_exception_passes: {
        Args: {
          p_image_id: string
          p_organization_id: string
          p_pipeline_sku_job_id: string
        }
        Returns: boolean
      }
      claim_due_social_posts: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_worker?: string }
        Returns: {
          attempt_count: number
          caption: string
          connection_id: string | null
          created_at: string
          created_by: string | null
          derivative_asset_id: string | null
          error_code: string | null
          error_message: string | null
          external_post_id: string | null
          first_comment: string | null
          group_id: string
          id: string
          idempotency_key: string | null
          lease_expires_at: string | null
          link_url: string | null
          locked_by: string | null
          master_content_id: string | null
          max_attempts: number
          media: Json
          options: Json
          organization_id: string
          permalink: string | null
          platform: string
          publish_after: string | null
          published_at: string | null
          scheduled_content_id: string | null
          scheduled_for: string | null
          status: string
          timezone: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "social_posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_expired_linkedin_oauth_states: { Args: never; Returns: undefined }
      cleanup_expired_shopify_publish_authorizations: {
        Args: never
        Returns: number
      }
      cleanup_expired_social_oauth_states: { Args: never; Returns: number }
      cleanup_unsaved_image_sessions: { Args: never; Returns: number }
      create_default_dam_folders: {
        Args: { org_id: string; user_id?: string }
        Returns: undefined
      }
      cut_paper_doll_release:
        | {
            Args: {
              p_approval_note: string
              p_approver_display_name: string
              p_approver_user_id: string
              p_body_component_version_ids: string[]
              p_expected_current_release_id: string
              p_family_key: string
              p_manifest: Json
              p_organization_id: string
              p_release_version: string
              p_renderer_version: string
              p_selected_components: Json
              p_sku_readiness: Json
              p_source_git_commit: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_approval_note: string
              p_approver_display_name: string
              p_approver_user_id: string
              p_body_component_version_ids: string[]
              p_expected_current_release_id: string
              p_family_key: string
              p_manifest: Json
              p_organization_id: string
              p_release_version: string
              p_renderer_version: string
              p_sanity_public_document_id: string
              p_selected_components: Json
              p_sku_readiness: Json
              p_source_git_commit: string
            }
            Returns: Json
          }
      ensure_social_scheduler_secret: { Args: never; Returns: string }
      finalize_paper_doll_candidate_job: {
        Args: {
          p_job_id: string
          p_organization_id: string
          p_output_metadata: Json
          p_output_ref: Json
          p_qa_results: Json
          p_version: Json
        }
        Returns: string
      }
      get_brand_dna: {
        Args: { p_org_id: string }
        Returns: {
          constraints: Json
          essence: Json
          id: string
          org_id: string
          scan_metadata: Json
          scan_method: string
          visual: Json
        }[]
      }
      get_latest_scan: {
        Args: { p_domain: string; p_org_id: string }
        Returns: {
          created_at: string
          domain: string
          id: string
          organization_id: string
          scan_data: Json
          scan_type: string
          status: string
        }[]
      }
      get_master_by_name: {
        Args: { p_master_name: string }
        Returns: {
          example_output: string
          forbidden_language: string[]
          full_content: string
          id: string
          master_name: string
          metadata: Json
          squad: string
          summary: string
        }[]
      }
      get_masters_by_squad: {
        Args: { p_squad: string }
        Returns: {
          forbidden_language: string[]
          full_content: string
          id: string
          master_name: string
          squad: string
          summary: string
        }[]
      }
      get_org_business_type_config: { Args: { org_id: string }; Returns: Json }
      get_paper_doll_candidate_workbench: {
        Args: { p_family_key: string; p_organization_id: string }
        Returns: Json
      }
      get_paper_doll_family_placement: {
        Args: {
          p_authority_mask_sha256: string
          p_family_key: string
          p_fitment_geometry_key: string
          p_organization_id: string
        }
        Returns: Json
      }
      get_paper_doll_release_workbench: {
        Args: { p_family_key: string; p_organization_id: string }
        Returns: Json
      }
      get_product_hero_image_url: {
        Args: { p_product_id: string }
        Returns: string
      }
      get_schwartz_template: {
        Args: { p_stage: string }
        Returns: {
          description: string
          forbidden_approaches: string[]
          id: string
          key_principles: string[]
          opening_strategies: string[]
          stage: string
          template_content: string
        }[]
      }
      get_suggested_assignees: {
        Args: { _org_id: string; _section: string }
        Returns: {
          current_workload: number
          full_name: string
          relevance_score: number
          team_role: Database["public"]["Enums"]["team_role"]
          user_id: string
        }[]
      }
      get_team_member_profiles: {
        Args: { _org_id: string }
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      get_team_workload: {
        Args: { _org_id: string }
        Returns: {
          email: string
          full_name: string
          in_progress_tasks: number
          overdue_tasks: number
          pending_tasks: number
          team_role: Database["public"]["Enums"]["team_role"]
          user_id: string
        }[]
      }
      get_user_organization_ids: { Args: never; Returns: string[] }
      has_organization_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["organization_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_dam_asset_usage: {
        Args: { asset_id: string; used_in_data?: Json }
        Returns: undefined
      }
      increment_framework_usage: {
        Args: { framework_uuid: string }
        Returns: undefined
      }
      install_social_scheduler_cron: { Args: never; Returns: string }
      invoke_social_edge_function: {
        Args: { p_body?: Json; p_function: string }
        Returns: number
      }
      is_organization_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      link_best_bottles_generated_image: {
        Args: {
          p_image_id: string
          p_organization_id: string
          p_pipeline_sku_job_id: string
        }
        Returns: undefined
      }
      lock_paper_doll_shared_placement: {
        Args: {
          p_approval_note: string
          p_approver_display_name: string
          p_approver_user_id: string
          p_calibration_component_version_id: string
          p_canvas_height_px: number
          p_canvas_width_px: number
          p_compatible_body_component_version_ids: string[]
          p_expected_authority_mask_sha256: string
          p_family_key: string
          p_fitment_geometry_key: string
          p_organization_id: string
          p_translate_x_px: number
          p_translate_y_px: number
          p_uniform_scale: number
        }
        Returns: Json
      }
      match_visual_examples: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_org_id?: string
          query_embedding: string
        }
        Returns: {
          id: string
          image_url: string
          similarity: number
          squad_used: string
          style_tags: string[]
        }[]
      }
      match_writing_examples: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_org_id?: string
          query_embedding: string
        }
        Returns: {
          channel: string
          content: string
          content_type: string
          id: string
          similarity: number
          source: string
        }[]
      }
      merge_duplicate_products: { Args: never; Returns: undefined }
      merge_duplicate_products_by_name_safe: { Args: never; Returns: undefined }
      paper_doll_asset_ref_is_valid: {
        Args: { p_organization_id: string; p_reference: Json }
        Returns: boolean
      }
      record_best_bottles_destination_verification: {
        Args: {
          p_destination: string
          p_error?: string
          p_image_id: string
          p_organization_id: string
          p_pipeline_sku_job_id: string
          p_state: string
          p_verified_image_hash?: string
          p_verified_image_url?: string
        }
        Returns: undefined
      }
      register_paper_doll_approved_source: {
        Args: {
          p_component: Json
          p_organization_id: string
          p_qa_results: Json
          p_version: Json
        }
        Returns: Json
      }
      register_paper_doll_component_source: {
        Args: {
          p_component: Json
          p_family_key: string
          p_intake_note: string
          p_organization_id: string
          p_original_filename: string
          p_registrar_display_name: string
          p_registrar_user_id: string
          p_variant_key: string
          p_version: Json
        }
        Returns: Json
      }
      register_paper_doll_release_draft: {
        Args: {
          p_manifest: Json
          p_manifest_sha256: string
          p_organization_id: string
          p_renderer_version: string
          p_source_git_commit: string
        }
        Returns: Json
      }
      save_audit_draft: {
        Args: {
          p_brand_name: string
          p_grade: string
          p_health_score: number
          p_summary: string
        }
        Returns: Json
      }
      search_librarian_frameworks: {
        Args: {
          category_filter?: string
          channel_filter?: string
          intent_filter?: string
          limit_count?: number
          search_query: string
        }
        Returns: {
          awareness_stage: string
          category: string
          channel: string
          created_at: string | null
          example_output: string | null
          framework_content: string
          id: string
          industries: string[]
          intent: string
          is_active: boolean | null
          is_featured: boolean | null
          madison_note: string
          masters: string[]
          short_description: string | null
          slug: string
          sort_letter: string
          title: string
          updated_at: string | null
          usage_count: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "librarian_frameworks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      seed_default_stages: { Args: { _org_id: string }; Returns: undefined }
      social_vault_secret: { Args: { p_name: string }; Returns: string }
      verify_social_scheduler_secret: {
        Args: { p_secret: string }
        Returns: boolean
      }
    }
    Enums: {
      activity_type:
        | "created"
        | "updated"
        | "status_changed"
        | "assigned"
        | "commented"
        | "attachment_added"
        | "due_date_changed"
        | "completed"
        | "reopened"
      business_type:
        | "finished_goods"
        | "bottles_vessels"
        | "packaging_boxes"
        | "raw_materials"
      content_type: "product" | "email" | "social" | "visual" | "blog"
      due_date_type: "flexible" | "firm" | "blocker"
      formulation_type_enum: "Purity" | "Composed" | "Natural Resins & Incense"
      image_source_type: "generated" | "uploaded"
      notification_type:
        | "task_assigned"
        | "task_mentioned"
        | "task_due_soon"
        | "task_overdue"
        | "task_completed"
        | "task_commented"
        | "task_status_changed"
        | "product_updated"
        | "certification_expiring"
        | "sds_outdated"
      organization_role: "owner" | "admin" | "member"
      prompt_descriptor_type: "family" | "applicator" | "body_variant"
      scent_family: "warm" | "floral" | "fresh" | "woody"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status:
        | "pending"
        | "in_progress"
        | "review"
        | "blocked"
        | "completed"
        | "cancelled"
      team_role:
        | "founder"
        | "creative"
        | "compliance"
        | "marketing"
        | "operations"
        | "finance"
        | "general"
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
      activity_type: [
        "created",
        "updated",
        "status_changed",
        "assigned",
        "commented",
        "attachment_added",
        "due_date_changed",
        "completed",
        "reopened",
      ],
      business_type: [
        "finished_goods",
        "bottles_vessels",
        "packaging_boxes",
        "raw_materials",
      ],
      content_type: ["product", "email", "social", "visual", "blog"],
      due_date_type: ["flexible", "firm", "blocker"],
      formulation_type_enum: ["Purity", "Composed", "Natural Resins & Incense"],
      image_source_type: ["generated", "uploaded"],
      notification_type: [
        "task_assigned",
        "task_mentioned",
        "task_due_soon",
        "task_overdue",
        "task_completed",
        "task_commented",
        "task_status_changed",
        "product_updated",
        "certification_expiring",
        "sds_outdated",
      ],
      organization_role: ["owner", "admin", "member"],
      prompt_descriptor_type: ["family", "applicator", "body_variant"],
      scent_family: ["warm", "floral", "fresh", "woody"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: [
        "pending",
        "in_progress",
        "review",
        "blocked",
        "completed",
        "cancelled",
      ],
      team_role: [
        "founder",
        "creative",
        "compliance",
        "marketing",
        "operations",
        "finance",
        "general",
      ],
    },
  },
} as const
