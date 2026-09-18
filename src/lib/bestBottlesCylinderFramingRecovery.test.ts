import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import type { FramingQaReport } from "./product-image/framingQa";
import type { ShadowQaReport } from "./product-image/shadowQa";
import { analyzeDetachedSidecarLaneFloor } from "./product-image/detachedSidecarLaneQa";
import {
  buildCylinderFramingRecoveryPlan,
  isAllowedCylinderFramingRecoveryResourceUrl,
  parseCylinderFramingRecoveryArgs,
  validateCylinderFramingRecoveryPass,
  type CylinderFramingRecoveryPlannerInput,
} from "./bestBottlesCylinderFramingRecovery";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const SHA_D = "d".repeat(64);
const SHA_E = "e".repeat(64);
const SHA_F = "f".repeat(64);

function framingQa(status: "pass" | "fail" = "fail"): FramingQaReport {
  return {
    status,
    failures: status === "pass" ? [] : ["Product fill height is outside target range."],
    warnings: [],
    primaryBounds: { top: 700, bottom: 2081, left: 850, right: 1230 },
    measurements: {
      fillHeightPct: status === "pass" ? 60 : 77,
      glassHeightPct: null,
      baselineYPx: status === "pass" ? 2081 : 1940,
      targetBaselineYPx: 2082,
      baselineDeltaPx: status === "pass" ? -1 : -142,
      centerXPct: 50,
      targetCenterXPct: 50,
      centerDeltaPct: 0,
      primaryAspectRatio: null,
      expectedPrimaryAspectRatio: null,
      aspectRatioDriftPct: null,
    },
    target: {
      family: "cylinder",
      profileId: "cylinder-standard",
      relativeScaleZoneId: "small-cylinder",
      fillHeightPct: 61,
      fillHeightRangePct: { min: 59, max: 63 },
      glassHeightPct: null,
      glassHeightRangePct: null,
      baselinePct: 9,
      primaryObjectCenterXPct: 50,
    },
  };
}

function shadowQa(status: "pass" | "fail" = "pass"): ShadowQaReport {
  return {
    status,
    failures: status === "pass" ? [] : ["Multiple connected shadow components detected (3)."],
    warnings: [],
    measurements: {
      contactGapPx: 0,
      contactCoreDensity: 0.5,
      rightExtensionPx: 10,
      rightExtensionRatio: 0.25,
      leftExtensionPx: 0,
      verticalDepthPx: 20,
      componentCount: status === "pass" ? 1 : 3,
      shadowPixelCount: 100,
    },
    target: {
      maxContactGapPx: 2,
      rightExtensionRatio: { min: 0.2, max: 0.3 },
      contract: "contact-back-right-v1",
    },
  };
}

function syntheticDetachedPixels(input: {
  sidecar?: { top: number; bottom: number };
} = {}): Uint8ClampedArray {
  const width = 120;
  const height = 160;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = 245;
    pixels[index + 1] = 243;
    pixels[index + 2] = 239;
    pixels[index + 3] = 255;
  }
  const paint = (left: number, right: number, top: number, bottom: number) => {
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const index = (y * width + x) * 4;
        pixels[index] = 40;
        pixels[index + 1] = 40;
        pixels[index + 2] = 40;
      }
    }
  };
  paint(35, 65, 20, 140);
  if (input.sidecar) paint(82, 101, input.sidecar.top, input.sidecar.bottom);
  return pixels;
}

function analyzeSyntheticDetached(input: {
  sidecar?: { top: number; bottom: number };
  groupRight?: number;
}) {
  return analyzeDetachedSidecarLaneFloor({
    pixels: syntheticDetachedPixels({ sidecar: input.sidecar }),
    width: 120,
    height: 160,
    background: { r: 245, g: 243, b: 239 },
    primaryBounds: { top: 20, bottom: 140, left: 35, right: 65 },
    groupBounds: {
      top: 20,
      bottom: 140,
      left: 35,
      right: input.groupRight ?? (input.sidecar ? 101 : 65),
    },
    primaryBaselineYPx: 140,
    sharedGroupBaselineYPx: 140,
    baselineTolerancePx: 4,
  });
}

describe("detached sidecar-lane floor evidence", () => {
  it("rejects a primary-only foreground with no distinct right-lane sidecar", () => {
    const result = analyzeSyntheticDetached({});
    assert.equal(result.status, "fail");
    assert.equal(result.sidecarPresent, false);
    assert.match(result.failures.join(" "), /right sidecar lane|distinct sidecar/i);
  });

  it("rejects a distinct right-lane sidecar floating above the shared floor", () => {
    const result = analyzeSyntheticDetached({ sidecar: { top: 70, bottom: 110 } });
    assert.equal(result.sidecarPresent, true);
    assert.equal(result.sidecarLowestContactRowYPx, 110);
    assert.match(result.failures.join(" "), /shared floor/i);
  });

  it("accepts a distinct right-lane sidecar whose lowest row shares the primary floor", () => {
    const result = analyzeSyntheticDetached({ sidecar: { top: 95, bottom: 140 } });
    assert.equal(result.status, "pass");
    assert.equal(result.sidecarPresent, true);
    assert.equal(result.sidecarLowestContactRowYPx, 140);
    assert.equal(result.sidecarPrimaryBaselineDeltaPx, 0);
    assert.equal(result.sidecarGroupBaselineDeltaPx, 0);
    assert.equal(result.capBoundingBoxUsed, false);
    assert.equal(result.capCenterlineRequired, false);
  });
});

function plannerInput(overrides: Partial<CylinderFramingRecoveryPlannerInput> = {}): CylinderFramingRecoveryPlannerInput {
  const canonicalGeometrySha256 = createHash("sha256").update(JSON.stringify({
    canon_bodyHeightMm: "53.0",
    canon_heightWithCapMm: "72.0",
    canon_secondAxisMm: "17.0",
    canon_widthAxisMm: "17.0",
  })).digest("hex");
  const job = {
    workflowVersion: "best-bottles-cylinder-dual-role-runner-v1",
    jobId: "GBCYLBLU5SPRYBLKSH|GBCYLBLU5MLSPRSBLK|preserve-cap-off-sidecar-reference",
    jobType: "preserve-cap-off-sidecar-reference",
    canonicalIdentityKey: "GBCYLBLU5SPRYBLKSH|GBCYLBLU5MLSPRSBLK",
    websiteSku: "GBCylBlu5SpryBlkSh",
    graceSku: "GB-CYL-BLU-5ML-SPR-SBLK",
    role: "pdp-cap-off-sidecar",
    route: "approved-detached-dual-role",
    evidenceLane: "approved-recovery",
    sourceLocator: "tmp/source.png",
    planSha256: SHA_A,
    sourceSha256: SHA_B,
    referenceSha256: SHA_C,
    canonicalProductTruthFileSha256: SHA_D,
    canonicalProductTruthRecordSha256: SHA_E,
    prompt: "sealed prompt",
    promptSha256: SHA_F,
    deterministicOperation: null,
    deterministicOperationSha256: null,
    canonicalGeometrySha256,
    outputRelativePath: "outputs/cobalt-sidecar.png",
    status: "queued-local-execution",
    reviewStatus: "review-pending",
    warnings: [],
  } as const;
  const prior = {
    ...job,
    status: "failed-framing",
    reviewStatus: "framing-rejected",
    error: "framing failed",
    outputSha256: SHA_C,
    outputDimensions: { width: 2080, height: 2288 },
    opaque: true,
    framingQa: framingQa("fail"),
  } as const;
  const plan = {
    version: "best-bottles-cylinder-dual-role-remediation-v2",
    sha256: SHA_A,
    rows: [{
      canonicalIdentityKey: job.canonicalIdentityKey,
      websiteSku: job.websiteSku,
      graceSku: job.graceSku,
      canonicalFamily: "Cylinder",
      route: job.route,
      canonical: {
        websiteSku: job.websiteSku,
        graceSku: job.graceSku,
        family: "Cylinder",
        productGroupSlug: "cylinder-5ml-cobalt-blue-13-415-finemist",
        capacityMl: "5",
        canon_bodyHeightMm: "53.0",
        canon_widthAxisMm: "17.0",
        canon_secondAxisMm: "17.0",
        canon_heightWithCapMm: "72.0",
      },
      evidence: {},
      roleJobs: [{
        jobId: job.jobId,
        jobType: job.jobType,
        targetRole: job.role,
        sourceEvidenceLane: job.evidenceLane,
        reviewStatus: "sealed-input-review-pending",
      }],
      blockers: [],
    }],
  } as never;
  return {
    mode: "plan-only",
    runDirectory: "tmp/recovery/runs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/execute-1",
    allowlist: [job.jobId],
    count: 1,
    actualPlanFileSha256: SHA_F,
    actualCanonicalTruthFileSha256: SHA_D,
    compileArtifact: {
      workflowVersion: "best-bottles-cylinder-dual-role-runner-v1",
      mode: "execute-local-only",
      planSha256: SHA_A,
      canonicalProductTruthFileSha256: SHA_D,
      selectedJobCount: 1,
      jobs: [job],
      externalWriteCount: 0,
      planFileSha256: SHA_F,
    },
    resultArtifact: {
      planFileSha256: SHA_F,
      planSha256: SHA_A,
      canonicalProductTruthFileSha256: SHA_D,
      results: [prior],
    },
    sealedPlan: plan,
    rawOutputSha256ByRelativePath: { [job.outputRelativePath]: SHA_C },
    ...overrides,
  };
}

describe("Cylinder framing recovery argument contract", () => {
  it("permits only local Vite and in-memory resources", () => {
    assert.equal(isAllowedCylinderFramingRecoveryResourceUrl("http://127.0.0.1:8080/src/main.tsx"), true);
    assert.equal(isAllowedCylinderFramingRecoveryResourceUrl("data:image/png;base64,AAAA"), true);
    assert.equal(isAllowedCylinderFramingRecoveryResourceUrl("https://api.openai.com/v1/images"), false);
    assert.equal(isAllowedCylinderFramingRecoveryResourceUrl("https://example.supabase.co/rest/v1/images"), false);
  });

  it("defaults to plan-only and requires an explicit bounded allowlist", () => {
    const options = parseCylinderFramingRecoveryArgs([
      "--run-dir", "tmp/run",
      "--allowlist", "WEBA|GRACEA|job-a",
      "--count", "1",
    ]);
    assert.equal(options.mode, "plan-only");
    assert.deepEqual(options.allowlist, ["WEBA|GRACEA|job-a"]);
    assert.equal(options.count, 1);
  });

  it("rejects missing, zero, or over-eight bounded counts", () => {
    assert.throws(() => parseCylinderFramingRecoveryArgs([
      "--run-dir", "tmp/run", "--allowlist", "A",
    ]), /bounded --count/i);
    assert.throws(() => parseCylinderFramingRecoveryArgs([
      "--run-dir", "tmp/run", "--allowlist", "A", "--count", "0",
    ]), /positive integer/i);
    assert.throws(() => parseCylinderFramingRecoveryArgs([
      "--run-dir", "tmp/run", "--allowlist", "A", "--count", "9",
    ]), /capped at 8/i);
  });
});

describe("Cylinder framing recovery planner", () => {
  it("selects only hash-continuous failed-framing jobs and keeps raw output immutable", () => {
    const plan = buildCylinderFramingRecoveryPlan(plannerInput());
    assert.equal(plan.jobs.length, 1);
    assert.equal(plan.jobs[0].rawOutputRelativePath, "outputs/cobalt-sidecar.png");
    assert.equal(plan.jobs[0].rawOutputSha256, SHA_C);
    assert.equal(plan.jobs[0].topology, "detached");
    assert.equal(plan.jobs[0].normalizer.capState, "detached");
    assert.equal(plan.jobs[0].normalizer.heightWithoutCap, "53.0");
    assert.equal(plan.jobs[0].normalizer.heightWithCap, "72.0");
    assert.match(plan.jobs[0].passOutputRelativePaths[0], /^normalized\/framing-recovery-v3\//);
    assert.notEqual(plan.jobs[0].passOutputRelativePaths[0], plan.jobs[0].rawOutputRelativePath);
    assert.equal(plan.externalWriteCount, 0);
    assert.equal(plan.maxPasses, 2);
  });

  it("rejects anything other than failed-framing", () => {
    const input = plannerInput();
    input.resultArtifact.results[0].status = "rendered-review-pending" as never;
    assert.throws(() => buildCylinderFramingRecoveryPlan(input), /failed-framing/i);
  });

  it("rejects stale resume metadata and changed raw bytes", () => {
    const stale = plannerInput();
    stale.resultArtifact.results[0].promptSha256 = SHA_A;
    assert.throws(() => buildCylinderFramingRecoveryPlan(stale), /promptSha256/i);

    const changed = plannerInput({
      rawOutputSha256ByRelativePath: { "outputs/cobalt-sidecar.png": SHA_A },
    });
    assert.throws(() => buildCylinderFramingRecoveryPlan(changed), /raw output sha/i);
  });

  it("rejects a forged job absent from the exact sealed roleJobs", () => {
    const input = plannerInput();
    const forgedId = `${input.compileArtifact.jobs[0].canonicalIdentityKey}|forged-role-job`;
    input.compileArtifact.jobs[0].jobId = forgedId;
    input.resultArtifact.results[0].jobId = forgedId;
    input.allowlist = [forgedId];
    assert.throws(() => buildCylinderFramingRecoveryPlan(input), /sealed role job/i);
  });

  it("rejects cap-on sealed authority mutated into a sidecar role even when compile and result agree", () => {
    const input = plannerInput();
    const sealedRole = input.sealedPlan.rows[0].roleJobs[0];
    sealedRole.jobType = "assemble-cap-on-reference";
    sealedRole.targetRole = "identity-cap-on";
    assert.throws(() => buildCylinderFramingRecoveryPlan(input), /jobType|targetRole/i);
  });

  it("does not permit identity allowlists to exceed the explicit count", () => {
    const input = plannerInput({ count: 1 });
    input.allowlist = [
      input.compileArtifact.jobs[0].jobId,
      input.compileArtifact.jobs[0].canonicalIdentityKey,
    ];
    assert.throws(() => buildCylinderFramingRecoveryPlan(input), /allowlist.*count/i);
  });
});

describe("Cylinder framing recovery pass acceptance", () => {
  it("accepts only opaque 2080x2288 framing passes as local review-pending", () => {
    const job = buildCylinderFramingRecoveryPlan(plannerInput()).jobs[0];
    const result = validateCylinderFramingRecoveryPass({
      job,
      passNumber: 2,
      inputSha256: SHA_A,
      outputSha256: SHA_B,
      width: 2080,
      height: 2288,
      opaque: true,
      normalization: {
        scale: 1,
        shiftXPx: 0,
        shiftYPx: 1,
        detectedBaselineYPx: 2081,
        targetBaselineYPx: 2082,
        framingQa: framingQa("pass"),
        framingDecision: "pass",
        qaIssues: [],
        objectBounds: { top: 706, bottom: 2081, left: 650, right: 1550 },
        detachedSidecarLaneFloorQa: analyzeSyntheticDetached({ sidecar: { top: 95, bottom: 140 } }),
        shadowOwner: "model",
        shadowQa: shadowQa("pass"),
      },
    });
    assert.equal(result.status, "normalized-review-pending");
    assert.equal(result.reviewStatus, "review-pending");
    assert.equal(result.promotionStatus, "not-promoted");
    assert.equal(result.externalWriteCount, 0);
  });

  it("keeps failed geometry locally rejected", () => {
    const job = buildCylinderFramingRecoveryPlan(plannerInput()).jobs[0];
    const result = validateCylinderFramingRecoveryPass({
      job,
      passNumber: 1,
      inputSha256: job.rawOutputSha256,
      outputSha256: SHA_B,
      width: 2080,
      height: 2288,
      opaque: true,
      normalization: {
        scale: 0.8,
        shiftXPx: 0,
        shiftYPx: 100,
        detectedBaselineYPx: 1940,
        targetBaselineYPx: 2082,
        framingQa: framingQa("fail"),
        framingDecision: "normalize",
        qaIssues: ["framing"],
        objectBounds: { top: 700, bottom: 1940, left: 650, right: 1550 },
        shadowOwner: "model",
        shadowQa: shadowQa("pass"),
      },
    });
    assert.equal(result.status, "normalized-rejected");
    assert.equal(result.reviewStatus, "framing-rejected");
    assert.equal(result.promotionStatus, "not-promoted");
  });

  it("rejects detached framing without a complete-group shared-baseline invariant", () => {
    const job = buildCylinderFramingRecoveryPlan(plannerInput()).jobs[0];
    const base = {
      job,
      passNumber: 2 as const,
      inputSha256: SHA_A,
      outputSha256: SHA_B,
      width: 2080,
      height: 2288,
      opaque: true,
      normalization: {
        scale: 1,
        shiftXPx: 0,
        shiftYPx: 1,
        detectedBaselineYPx: 2081,
        targetBaselineYPx: 2082,
        framingQa: framingQa("pass"),
        framingDecision: "pass" as const,
        qaIssues: [],
        objectBounds: null,
        shadowOwner: "model" as const,
        shadowQa: shadowQa("pass"),
      },
    };
    const missing = validateCylinderFramingRecoveryPass(base);
    assert.equal(missing.status, "normalized-rejected");
    assert.match(missing.failures.join(" "), /complete group bounds/i);

    const offFloor = validateCylinderFramingRecoveryPass({
      ...base,
      normalization: {
        ...base.normalization,
        objectBounds: { top: 706, bottom: 2040, left: 650, right: 1550 },
      },
    });
    assert.equal(offFloor.status, "normalized-rejected");
    assert.match(offFloor.failures.join(" "), /shared baseline/i);
  });

  it("requires non-waivable detached sidecar-lane presence and shared-floor contact evidence", () => {
    const job = buildCylinderFramingRecoveryPlan(plannerInput()).jobs[0];
    const base = {
      job,
      passNumber: 2 as const,
      inputSha256: SHA_A,
      outputSha256: SHA_B,
      width: 2080,
      height: 2288,
      opaque: true,
      normalization: {
        scale: 1,
        shiftXPx: 0,
        shiftYPx: 1,
        detectedBaselineYPx: 2081,
        targetBaselineYPx: 2082,
        framingQa: framingQa("pass"),
        framingDecision: "pass" as const,
        qaIssues: [],
        objectBounds: { top: 706, bottom: 2081, left: 650, right: 1550 },
        shadowOwner: "model" as const,
        shadowQa: shadowQa("fail"),
      },
    };

    const missing = validateCylinderFramingRecoveryPass(base);
    assert.equal(missing.status, "normalized-rejected");
    assert.match(missing.failures.join(" "), /sidecar-lane.*required|sidecar lane.*required/i);

    const floating = validateCylinderFramingRecoveryPass({
      ...base,
      normalization: {
        ...base.normalization,
        detachedSidecarLaneFloorQa: analyzeSyntheticDetached({ sidecar: { top: 70, bottom: 110 } }),
      },
    });
    assert.equal(floating.status, "normalized-rejected");
    assert.match(floating.failures.join(" "), /shared floor/i);

    const valid = validateCylinderFramingRecoveryPass({
      ...base,
      normalization: {
        ...base.normalization,
        detachedSidecarLaneFloorQa: analyzeSyntheticDetached({ sidecar: { top: 95, bottom: 140 } }),
      },
    });
    assert.equal(valid.status, "normalized-shadow-review-required");
    assert.deepEqual(valid.failures, []);
  });

  it("retains framing-pass shadow failures in a distinct explicit review state", () => {
    const job = buildCylinderFramingRecoveryPlan(plannerInput()).jobs[0];
    const result = validateCylinderFramingRecoveryPass({
      job,
      passNumber: 2,
      inputSha256: SHA_A,
      outputSha256: SHA_B,
      width: 2080,
      height: 2288,
      opaque: true,
      normalization: {
        scale: 1,
        shiftXPx: 0,
        shiftYPx: 1,
        detectedBaselineYPx: 2081,
        targetBaselineYPx: 2082,
        framingQa: framingQa("pass"),
        framingDecision: "pass",
        qaIssues: [],
        objectBounds: { top: 706, bottom: 2081, left: 650, right: 1550 },
        detachedSidecarLaneFloorQa: analyzeSyntheticDetached({ sidecar: { top: 95, bottom: 140 } }),
        shadowOwner: "model",
        shadowQa: shadowQa("fail"),
      },
    });
    assert.equal(result.status, "normalized-shadow-review-required");
    assert.equal(result.reviewStatus, "shadow-review-required");
    assert.deepEqual(result.shadowFailures, ["Multiple connected shadow components detected (3)."]) ;
    assert.equal(result.promotionStatus, "not-promoted");
  });
});
