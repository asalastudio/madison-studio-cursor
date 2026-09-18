import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(currentDir, "generate-family-batch.ts"), "utf8");

describe("family batch production cutover source contract", () => {
  it("loads sealed role-aware authority, applies canonical geometry, and verifies actual bytes", () => {
    assert.match(source, /best-bottles-cylinder-sidecar-promotion\.json/);
    assert.match(source, /buildCylinderCanonicalRosterAuthority\(artifact, rosterBytes\)/);
    assert.match(source, /buildCylinderRoleAwareReadinessIndex\(artifact, roster\)/);
    assert.match(source, /applyRoleAwareCanonicalCylinderGeometry\(snapshotProduct, canonicalReadiness\)/);
    assert.match(source, /verifyCylinderImmutableReferenceBytesForPreset\(/);
    assert.match(source, /resolvedReferenceHash = verified\.sha256/);
    assert.match(source, /verifiedReference = verified/);
    assert.match(source, /const generationReferenceUrl = target\.verifiedReference\?\.dataUrl \?\? referenceUrl/);
    assert.match(source, /invokeWithCylinderVerifiedReference\(/);
    assert.match(source, /preverified: target\.verifiedReference/);
    assert.match(source, /url: generationReferenceUrl/);
    assert.match(source, /sourceReference: referenceUrl/);
  });

  it("persists raw and rig reconciliation evidence and links the exact SKU job", () => {
    assert.match(source, /buildBestBottlesRawReconciliationPayload\(/);
    assert.match(source, /buildBestBottlesRigReconciliationPayload\(/);
    assert.match(source, /best_bottles_image_reconciliations/);
    assert.match(source, /link_best_bottles_generated_image/);
    assert.match(source, /pipelineSkuJobId: job\.id/);
    const generateOnce = source.slice(source.indexOf("async function generateOnce"));
    assert.ok(
      generateOnce.indexOf("buildBestBottlesRigReconciliationPayload(")
        < generateOnce.indexOf('rpc("link_best_bottles_generated_image"'),
      "final rig reconciliation must be persisted before the image is linked to its SKU job",
    );
  });

  it("persists shoulder detector evidence and leaves shoulder misses blocking", () => {
    assert.match(source, /preTransformShoulderYPx: rigged\.preTransformShoulderYPx/);
    assert.match(source, /detectedShoulderYPx: rigged\.detectedShoulderYPx/);
    assert.match(source, /targetShoulderYPx: rigged\.targetShoulderYPx/);
    assert.match(source, /shoulderDeltaPct: rigged\.shoulderDeltaPct/);
    assert.match(source, /shoulderConfidence: rigged\.shoulderConfidence/);
    assert.doesNotMatch(
      source,
      /blockingQaIssues[\s\S]{0,300}shoulder landmark/i,
      "Cylinder shoulder-landmark failures must reach the retry/reject path",
    );
  });

  it("routes shadow-only misses to review instead of throwing a systemic generation failure", () => {
    assert.doesNotMatch(source, /V6\.1 shadow QA did not pass/);
    assert.match(source, /shadowReviewPending/);
    assert.match(source, /"review-pending"/);
  });

  it("requires role-aware Cylinder authority and propagates its topology without breaking other families", () => {
    assert.match(source, /resolveCylinderImmutableReferenceForPreset\(canonicalReadiness, preset\.id\)/);
    assert.match(source, /sidecarAuthority = verified\.authority/);
    assert.match(source, /componentTopology = target\.sidecarAuthority\?\.componentTopology/);
    assert.match(source, /capState = target\.sidecarAuthority\?\.capState/);
    assert.match(source, /component-topology:\$\{componentTopology\}/);
    assert.match(source, /: job\.best_reference_candidate_path\?\.trim\(\) \?\? ""/);
    assert.match(source, /if \(isCylinderCloseoutFamily && !sidecarAuthority\)/);
  });

  it("instructs standard Cylinder references to preserve the reviewed right-side cap", () => {
    assert.match(source, /exact fitment or applicator attached, plus exactly one matching cap or overcap detached on camera-right/);
    assert.doesNotMatch(
      source,
      /Render exactly one finished product and only components physically attached in this Product Reference; do not add any detached cap/,
    );
  });

  it("does not attach an empty glass style-reference URL", () => {
    assert.match(source, /visualTargetReference\.imageUrl\s*\?/);
    assert.match(source, /\.filter\(\(reference\).*Boolean\(reference\)/s);
  });

  it("does not promote baked-in white-background glass rails to product identity", () => {
    assert.match(source, /promptPreflight\.sku\.body_material === "clear_glass"/);
    assert.match(source, /Baked-in white-background edge rails are source-lighting artifacts/i);
    assert.match(source, /preserve the silhouette boundary and physical wall thickness/i);
    assert.match(source, /never copy a dark rail, black stripe, or drawn sidewall outline/i);
  });

  it("can resume an exact raw image without another model call", () => {
    assert.match(source, /--resume-raw-image-id/);
    assert.match(source, /source_reference_hash.*target\.referenceHash/s);
    assert.match(source, /prompt_hash.*generationIdentity\.promptHash/s);
    assert.match(source, /grace_sku.*target\.sku/s);
    assert.match(source, /\["rigging", "failed", "review-pending"\]/);
  });
});
