-- Best Bottles: make shadow QA advisory in the approval gate.
--
-- Policy (Jordan, 2026-07-18/19): shadow QA is ADVISORY, never blocking. The
-- client rig stopped producing `shadow_qa` reports on 2026-07-19
-- (finalizeRigShadow returns shadowQa: null for model-owned shadows), and
-- `isBestBottlesCylinderApprovalEvidenceReady` returns true. The database
-- gate from 20260712001000 was never updated, so it kept demanding a passing
-- `shadow_qa` contract for Cylinder — a report nothing writes anymore. Net
-- effect: every Cylinder approval through approve_best_bottles_reconciled_image
-- has failed since July with "not linked ... strict or reviewed shadow
-- evidence", including catalog-hero replacement from the Image Library.
--
-- This aligns the database with the declared policy. What still gates
-- approval (unchanged, enforced by approve_best_bottles_reconciled_image):
--   * exact SKU identity (catalog_truth graceSku / eligibleGraceSkus = job SKU)
--   * identityStatus = ready, no identity blockers, website truth ready
--   * heightWithoutCap + diameter present (scale-card truth)
--   * framing_decision = pass, zero qa_issues, baseline detected + target
--   * requires_pipeline_reconciliation = TRUE, lifecycle qa-passed/review
--   * for hero replacement: background-qa:pass + canvas-hex:#F5F3EF tags
--
-- Shadow lineage is still asserted structurally for Cylinder (reference-locked
-- v6.1 prompt, model-owned shadow, topology recorded); only the numeric
-- shadow-contact report is no longer required. A recorded *failing* report is
-- treated as advisory too, matching the client: humans judge the shadow in the
-- image itself and retake later if needed.

CREATE OR REPLACE FUNCTION public.best_bottles_shadow_evidence_passes(
  p_family TEXT,
  p_prompt_version TEXT,
  p_shadow_owner TEXT,
  p_shadow_topology JSONB,
  p_shadow_qa JSONB
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(COALESCE(p_family, '')) IN ('cylinder', 'tall cylinder') THEN
      COALESCE(p_prompt_version = 'best-bottles-reference-locked-v6.1', FALSE)
      AND COALESCE(p_shadow_owner = 'model', FALSE)
      AND p_shadow_topology IS NOT NULL
    ELSE
      COALESCE(p_shadow_owner IN ('rig', 'model'), FALSE)
  END;
$$;

COMMENT ON FUNCTION public.best_bottles_shadow_evidence_passes(TEXT, TEXT, TEXT, JSONB, JSONB) IS
  'Shadow lineage check for Best Bottles approval. Shadow QA is advisory (policy 2026-07-18); the numeric contact report is no longer required. Identity, geometry, and framing gates live in approve_best_bottles_reconciled_image.';
