#!/usr/bin/env tsx
/**
 * Best Bottles — production family-parametrized bulk generation runner.
 *
 * This is the batch sibling of `scripts/best-bottles/live-cylinder-smoke.ts`.
 * It drives REAL image generation for an entire product family (Cylinder first,
 * ~113 SKUs with a live https reference today) through the live pipeline. It
 * spends real money and writes to Supabase, so correctness matters.
 *
 * WHAT IT SHARES WITH live-cylinder-smoke.ts (byte-for-byte identical request):
 *   - buildBestBottlesPromptPreflight → precompiledPromptRecord via
 *     buildCylinderSmokePromptRecord (canon-framing default; no cap/volume cues).
 *   - buildBestBottlesGenerationIdentity + getBestBottlesGenerationIdentityIssue.
 *   - The exact `generate-madison-image` request body shape (prompt,
 *     referenceImages, productContext, extraLibraryTags, precompiledPromptRecord,
 *     imageConstraints, aiProvider, resolution, proModeControls, …).
 *   - The rig postprocess step in a Playwright page
 *     (colorCorrectToTarget → normalizeBestBottlesRigBaseline) and the patch of
 *     generated_images.image_url to the rigged URL.
 *
 * WHAT DIFFERS (the point of this runner):
 *   1. Targets are sourced DYNAMICALLY from the live
 *      `best_bottles_pipeline_sku_jobs` table (family arg), then exact dual identity
 *      is joined to the immutable role-aware readiness artifact. The selected
 *      preset role supplies the only accepted public URL and SHA-256; mutable job
 *      reference pointers are never generation authority.
 *   2. Resilience: each SKU is wrapped in try/catch with N retries (default 2)
 *      on transient failures INCLUDING rig-QA failures and edge errors. One SKU
 *      failing never aborts the batch.
 *   3. Bounded concurrency (default 2; env BB_GEN_CONCURRENCY). One Playwright
 *      page per concurrent slot so the rig step is safe under concurrency.
 *   4. An incrementally-updated manifest JSON is written after every SKU, so a
 *      killed run is resumable and idempotent (already-`rendered` SKUs skip).
 *   5. --family / --limit / --dry-run flags.
 *
 * Usage:
 *   # DRY RUN — resolve targets, build preflight/prompt, no generation, no rig:
 *   npm run bestbottles:generation:run-family -- --dry-run --family Cylinder
 *
 *   # REAL batch (spends money, writes to Supabase):
 *   npm run bestbottles:generation:run-family -- --family Cylinder
 *
 *   # Bounded/limited real batch:
 *   BB_GEN_CONCURRENCY=3 npm run bestbottles:generation:run-family -- --family Cylinder --limit 25
 *
 * Resume: re-running with the same --family + manifest path skips SKUs already
 * marked `rendered` in the manifest. Pass --manifest <path> to pin the file.
 *
 * Env (mirrors live-cylinder-smoke.ts where noted):
 *   BB_GEN_AI_PROVIDER        default openai-image-2.5-sunburst   (smoke: BB_SMOKE_AI_PROVIDER)
 *   BB_GEN_PROMPT_MODE        canon-framing | canon-only
 *   BB_GEN_RESOLUTION         standard | high | 4k
 *   BB_GEN_PROMPT_ADDENDUM    (optional smoke addendum id)
 *   BB_GEN_SKIP_RIG_POSTPROCESS=1   skip the Playwright rig step
 *   BB_GEN_CONCURRENCY        default 2
 *   BB_GEN_MAX_ATTEMPTS       default 2
 *   MADISON_BEST_BOTTLES_ORG_ID / MADISON_BEST_BOTTLES_USER_ID  (defaults below)
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

import { lookupCanonTruth, withCanonTruthGeometry } from "./canon-truth";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";

import { IMAGE_PRESETS } from "../../src/config/imagePresets";
import {
  BEST_BOTTLES_VISUAL_TARGET_VERSION,
  BEST_BOTTLES_VISUAL_TARGET_CANVAS_HEX,
  applyBestBottlesVisualTargetPrompt,
  getBestBottlesVisualTargetReference,
  getBestBottlesVisualTargetTags,
} from "../../src/config/bestBottlesVisualTarget";
import { inferBestBottlesBodyMaterial } from "../../src/lib/bestBottlesBodyMaterial";
import { buildBestBottlesPromptPreflight } from "../../src/lib/bestBottlesPromptPreflight";
import {
  buildBestBottlesGenerationIdentity,
  getBestBottlesGenerationIdentityIssue,
} from "../../src/lib/bestBottlesGenerationIdentity";
import {
  getBestBottlesCanonicalReferenceIssue,
  getBestBottlesReferenceUrlIssue,
} from "../../src/lib/bestBottlesReferenceValidation";
import { getExactOutputCanvasConstraints } from "../../src/lib/product-image/exactOutputCanvas";
import { resolveWholeVesselBounds } from "../../src/lib/product-image/rigPostprocess";
import { clipDetachedSidecar } from "./reference-sidecar-split";
import { resolveBestBottlesShadowTopology } from "../../src/lib/bestBottlesShadowTopology";
import {
  buildBestBottlesRawReconciliationPayload,
  buildBestBottlesRigReconciliationPayload,
} from "../../src/lib/bestBottlesImageReconciliation";
import type { BestBottlesCatalogTruthSnapshot } from "../../src/lib/bestBottlesImageReconciliationRules";
import {
  BEST_BOTTLES_CYLINDER_ROLE_AWARE_READINESS_VERSION,
  applyRoleAwareCanonicalCylinderGeometry,
  buildCylinderCanonicalGeometryContract,
  buildCylinderCanonicalRosterAuthority,
  buildCylinderRoleAwareReadinessIndex,
  invokeWithCylinderVerifiedReference,
  verifyCylinderImmutableReferenceBytesForPreset,
  cylinderProductionIdentityKey,
  resolveCylinderImmutableReferenceForPreset,
  type CylinderRoleAwareReadinessArtifact,
  type CylinderRoleAwareReadinessRow,
  type CylinderRoleGenerationAuthority,
  type CylinderVerifiedReferenceBytes,
} from "../../src/lib/bestBottlesCylinderRoleAuthority";
import { resolveBestBottlesHeroPresentation } from "../../src/lib/bestBottlesHeroPresentation";
import { loadPromptSystem } from "../generate-prompts";
import {
  buildCylinderSmokePromptRecord,
  getCylinderSmokePromptMode,
  getCylinderSmokeResolution,
} from "./cylinder-smoke-prompt-mode";
import {
  applySmokePromptAddendum,
  getSmokePromptAddendum,
} from "./smoke-prompt-addendums";
import {
  canSkipRenderedEntry,
  isSystemicQaFailure,
  type FamilyBatchGenerationIdentity,
} from "./family-batch-resume";

type ProductRow = Record<string, unknown>;

const ROOT =
  "/Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026";
const convexSnapshotPath = `${ROOT}/data/audits/2026-06-27-framing-profiles/convex_snapshot.json`;

const ORG_ID =
  process.env.MADISON_BEST_BOTTLES_ORG_ID || "4ab1ac72-cd7e-4faf-9152-5aa5f2862411";
const USER_ID =
  process.env.MADISON_BEST_BOTTLES_USER_ID || "d4cd4ae9-a9a8-4ea6-ab6f-fd1e19078e5e";

const preset = IMAGE_PRESETS["grid-card-exploded-2000x2200"];
if (!preset) throw new Error("Missing grid-card-exploded-2000x2200 preset.");

const aiProvider = process.env.BB_GEN_AI_PROVIDER?.trim() || "openai-image-2.5-sunburst";
const allowBestBottlesProviderOverride = !/^openai|^gpt-image|^dall-e/i.test(aiProvider);
const skipRigPostprocess = process.env.BB_GEN_SKIP_RIG_POSTPROCESS === "1";
const promptAddendum = getSmokePromptAddendum(process.env.BB_GEN_PROMPT_ADDENDUM);
const promptMode = getCylinderSmokePromptMode(process.env.BB_GEN_PROMPT_MODE);
const resolution = getCylinderSmokeResolution(process.env.BB_GEN_RESOLUTION);
const concurrency = Math.max(1, Number(process.env.BB_GEN_CONCURRENCY || "2") || 2);
const maxAttempts = Math.max(1, Number(process.env.BB_GEN_MAX_ATTEMPTS || "2") || 2);
const systemicQaFailureThreshold = Math.max(
  1,
  Number(process.env.BB_GEN_SYSTEMIC_QA_FAILURE_THRESHOLD || "3") || 3,
);

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function getArg(name: string, fallback = ""): string {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return fallback;
  return v;
}
const family = getArg("--family", "Cylinder");
const productGroup = getArg("--product-group", "");
// Defer bulb+tassel SKUs (their scale-to-bottle-height framing fix is separate).
const skipTassel = process.argv.includes("--skip-tassel");
const includeBulbTassel = process.argv.includes("--include-bulb-tassel");
const referenceFolder = getArg("--reference-folder", "");
// Cylinder is fenced: generation must use the exact promoted immutable role
// reference. Jordan lifted that for the flattened-Photoshop route on
// 2026-09-19 — the PSD flat is the original source the promoted derivative was
// made from, and every other family already generates from it. It stays opt-in:
// it needs a --reference-folder, only ever applies to a target that came from
// that folder, and tags the image so its provenance is never mistaken for a
// promoted reference. Without the flag the fence is exactly as it was.
const allowFlattenedPsdReference = process.argv.includes("--allow-flattened-psd-reference");
if (allowFlattenedPsdReference && !referenceFolder) {
  throw new Error("--allow-flattened-psd-reference requires --reference-folder.");
}
const skusArg = getArg("--skus", "");
// Optional explicit graceSku allowlist for curated cross-group pilots
// (e.g. one representative each of 3/4/5/9ml to check the capacity scale).
const skuFilter = skusArg
  ? new Set(skusArg.split(",").map((s) => s.trim()).filter(Boolean))
  : null;
const dryRun = process.argv.includes("--dry-run");
const resumeRawImageId = getArg("--resume-raw-image-id", "");
const limitArg = getArg("--limit", "");
const limit = limitArg ? Math.max(0, Number(limitArg) || 0) : null;

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const familySlug = family.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
const manifestPath = path.resolve(
  getArg("--manifest", `tmp/bestbottles-generation/${familySlug}-family-batch.json`),
);
const cylinderLedgerPath = path.resolve(
  "tmp/bestbottles-generation/cylinder-v6.1-closeout-ledger.json",
);
const cylinderReferenceManifestPath = path.resolve(
  "tmp/bestbottles-generation/cylinder-v6.1-reference-manifest.json",
);
const cylinderRoleAwareReadinessPath = path.resolve(
  "public/data/best-bottles-cylinder-sidecar-promotion.json",
);
const isCylinderCloseoutFamily = ["cylinder", "tall cylinder"].includes(
  family.trim().toLowerCase(),
);

// ---------------------------------------------------------------------------
// env + Supabase
// ---------------------------------------------------------------------------
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const file of [".env", ".env.local"]) {
    try {
      for (const line of readFileSync(file, "utf8").split(/\n/)) {
        const match = line.match(/^\s*([A-Za-z0-9_]+)=(.*)$/);
        if (!match) continue;
        env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    } catch {
      // Optional env files.
    }
  }
  return env;
}
const env = loadEnv();
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing Supabase URL or service role key.");
}
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Convex snapshot → product (mirrors live-cylinder-smoke.ts productFromSnapshot)
// ---------------------------------------------------------------------------
function getText(row: ProductRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : value == null ? null : String(value);
}
function getNumber(row: ProductRow, key: string): number | null {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function productFromSnapshot(row: ProductRow) {
  return {
    graceSku: getText(row, "graceSku"),
    websiteSku: getText(row, "websiteSku"),
    itemName: getText(row, "itemName"),
    itemDescription: getText(row, "itemDescription"),
    bottleCollection: getText(row, "bottleCollection"),
    family: getText(row, "family"),
    category: getText(row, "category"),
    color: getText(row, "color"),
    capacityMl: getNumber(row, "capacityMl"),
    applicator: getText(row, "applicator"),
    capColor: getText(row, "capColor"),
    trimColor: getText(row, "trimColor"),
    capStyle: getText(row, "capStyle"),
    heightWithoutCap: getText(row, "heightWithoutCap"),
    heightWithCap: getText(row, "heightWithCap"),
    diameter: getText(row, "diameter"),
    neckThreadSize: getText(row, "neckThreadSize"),
  };
}

type BBProduct = ReturnType<typeof productFromSnapshot> & {
  canonicalBodyHeightMm?: number;
  canonicalAssembledHeightMm?: number;
  canonicalWidthAxisMm?: number;
  canonicalSecondAxisMm?: number;
  measurementSource?: string;
  capState?: "detached" | "assembled";
  mode?: string;
  capOffReferenceId?: string | null;
  topologyReferenceId?: string;
  componentTopology?: CylinderRoleGenerationAuthority["componentTopology"];
};

function promptHeader(prompt: string): string | null {
  return prompt
    .split("\n")
    .find((line) => /FRAMING PROFILE \(CANVAS COMPOSITION AUTHORITY\):/.test(line)) ?? null;
}

// ---------------------------------------------------------------------------
// Target = live sku-job row + joined product + resolved reference URL
// ---------------------------------------------------------------------------
interface SkuJobRow {
  id: string;
  grace_sku: string;
  website_sku: string | null;
  family: string;
  product_group_slug: string | null;
  reference_source: string | null;
  expected_canonical_filename: string | null;
  coverage_status: string | null;
  status: string | null;
  best_reference_candidate_path: string | null;
}
interface FamilyTarget {
  pipelineSkuJobId: string;
  sku: string;
  productGroupSlug: string;
  referenceUrl: string;
  referenceHash: string;
  verifiedReference: CylinderVerifiedReferenceBytes | null;
  product: BBProduct;
  canonicalReadiness: CylinderRoleAwareReadinessRow | null;
  sidecarAuthority: CylinderRoleGenerationAuthority | null;
}
interface Skip {
  sku: string;
  productGroupSlug: string | null;
  reason: string;
}

/** True only when this target's reference bytes were read from --reference-folder. */
function isFlattenedPsdTarget(target: FamilyTarget): boolean {
  const lineage = target.verifiedReference?.lineageUrl;
  return typeof lineage === "string" && localHeroFilePaths.has(lineage);
}

// ---------------------------------------------------------------------------
// Manifest (resume + inspectability)
// ---------------------------------------------------------------------------
type RunStatus = "rendered" | "skipped" | "failed";
interface ManifestEntry {
  graceSku: string;
  websiteSku: string | null;
  productGroupSlug: string;
  status: RunStatus;
  attempts: number;
  savedImageId: string | null;
  imageUrl: string | null;
  rawImageUrl: string | null;
  generationIdentity: FamilyBatchGenerationIdentity | null;
  geometryQa: { pass: boolean; report: unknown } | null;
  shadowQa: { pass: boolean; report: unknown } | null;
  lifecycle: "pending" | "qa-passed" | "review-pending" | "failed";
  qaIssues: string[];
  error: string | null;
  elapsedMs: number;
  updatedAt: string;
}
interface Manifest {
  runId: string;
  family: string;
  provider: string;
  promptMode: string;
  resolution: string;
  entries: Record<string, ManifestEntry>;
}

interface CylinderLedgerFile {
  sha256: string;
  publicationTargets: Array<{ graceSku: string; websiteSku: string }>;
}

interface CylinderReferenceDecisionFile {
  graceSku: string;
  websiteSku: string;
  status: string;
  sha256: string | null;
}

interface CylinderReferenceManifestFile {
  ledgerHash: string;
  sha256: string;
  decisions: CylinderReferenceDecisionFile[];
}

function readCylinderCloseoutInputs(): {
  ledger: CylinderLedgerFile;
  references: CylinderReferenceManifestFile;
} | null {
  if (!isCylinderCloseoutFamily) return null;
  const ledger = JSON.parse(readFileSync(cylinderLedgerPath, "utf8")) as CylinderLedgerFile;
  const references = JSON.parse(
    readFileSync(cylinderReferenceManifestPath, "utf8"),
  ) as CylinderReferenceManifestFile;
  if (!ledger.sha256 || references.ledgerHash !== ledger.sha256) {
    throw new Error("Cylinder closeout ledger/reference manifest hash mismatch. Rebuild both inputs.");
  }
  if (
    ledger.publicationTargets.length === 0
    || references.decisions.length !== ledger.publicationTargets.length
  ) {
    throw new Error(
      `Cylinder closeout inputs must contain the same nonzero identity total; found ledger=${ledger.publicationTargets.length} references=${references.decisions.length}.`,
    );
  }
  const identities = new Set(ledger.publicationTargets.map((target) => cylinderProductionIdentityKey(
    target.websiteSku,
    target.graceSku,
  )));
  if (identities.size !== ledger.publicationTargets.length || identities.has("|")) {
    throw new Error("Cylinder closeout inputs contain duplicate or missing exact identities.");
  }
  return { ledger, references };
}

const cylinderCloseout = readCylinderCloseoutInputs();

function readCylinderRoleAwareReadiness(): {
  artifact: CylinderRoleAwareReadinessArtifact;
  index: Map<string, CylinderRoleAwareReadinessRow>;
} | null {
  if (!isCylinderCloseoutFamily) return null;
  const artifact = JSON.parse(
    readFileSync(cylinderRoleAwareReadinessPath, "utf8"),
  ) as CylinderRoleAwareReadinessArtifact;
  if (artifact.version !== BEST_BOTTLES_CYLINDER_ROLE_AWARE_READINESS_VERSION) {
    throw new Error(
      `Cylinder role-aware readiness version is ${String(artifact.version)}; expected ${BEST_BOTTLES_CYLINDER_ROLE_AWARE_READINESS_VERSION}.`,
    );
  }
  const rosterPath = String(artifact.provenance?.productionReadiness?.path ?? "");
  if (!/^public\/data\/[a-z0-9._-]+\.json$/i.test(rosterPath)) {
    throw new Error("Cylinder role-aware readiness has an invalid canonical-roster provenance path.");
  }
  const rosterBytes = new Uint8Array(readFileSync(path.resolve(rosterPath)));
  const roster = buildCylinderCanonicalRosterAuthority(artifact, rosterBytes);
  return { artifact, index: buildCylinderRoleAwareReadinessIndex(artifact, roster) };
}

const cylinderRoleAwareInput = readCylinderRoleAwareReadiness();
const cylinderRoleAwareReadiness = cylinderRoleAwareInput?.artifact ?? null;
const cylinderReadinessByIdentity = cylinderRoleAwareInput
  ? cylinderRoleAwareInput.index
  : new Map<string, CylinderRoleAwareReadinessRow>();

const sidecarOverridesPath = getArg("--sidecar-overrides", "");
if (sidecarOverridesPath) {
  const overrides = JSON.parse(readFileSync(path.resolve(sidecarOverridesPath), "utf8")) as Record<
    string,
    Record<string, unknown>
  >;
  let applied = 0;
  for (const row of cylinderReadinessByIdentity.values()) {
    const patch = overrides[row.graceSku];
    if (!patch) continue;
    Object.assign(row.references.pdpCapOffSidecar, patch);
    applied += 1;
  }
  console.log(`sidecar overrides applied    : ${applied} from ${sidecarOverridesPath}`);
}

type LocalHeroReference = {
  graceSku: string;
  websiteSku: string | null;
  filePath: string;
  productGroupSlug: string | null;
  isBulbOrTassel: boolean;
};

function normalizeHeroKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function isBulbOrTasselHero(value: string): boolean {
  return /\b(?:ASP|AST|ANTIQUE|TASSEL|VINTAGE)\b/i.test(value);
}

function loadLocalHeroFolder(folderArg: string): Map<string, LocalHeroReference> {
  const folder = path.resolve(folderArg);
  if (!existsSync(folder)) {
    throw new Error(`Reference folder does not exist: ${folder}`);
  }
  const byKey = new Map<string, LocalHeroReference>();
  const remember = (key: string, ref: LocalHeroReference) => {
    const normalized = normalizeHeroKey(key);
    if (normalized) byKey.set(normalized, ref);
  };
  const manifestPath = path.join(folder, "..", `${path.basename(folder)}.manifest.json`);
  const manifestRows = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, "utf8")) as {
        rows?: Array<{
          graceSku?: string;
          websiteSku?: string;
          outputFile?: string;
          productGroupSlug?: string;
        }>;
      }).rows ?? []
    : [];
  const files = new Map(
    readdirSync(folder)
      .filter((name) => /\.png$/i.test(name))
      .map((name) => [name, path.join(folder, name)]),
  );
  for (const row of manifestRows) {
    const fileName = row.outputFile ?? `${row.graceSku ?? ""}.png`;
    const filePath = files.get(fileName);
    if (!filePath || !row.graceSku) continue;
    const ref: LocalHeroReference = {
      graceSku: row.graceSku,
      websiteSku: row.websiteSku ?? null,
      filePath,
      productGroupSlug: row.productGroupSlug ?? null,
      isBulbOrTassel: isBulbOrTasselHero(
        [row.graceSku, row.websiteSku, row.productGroupSlug, fileName].join(" "),
      ),
    };
    remember(row.graceSku, ref);
    remember(row.websiteSku, ref);
    remember(path.parse(fileName).name, ref);
  }
  for (const [fileName, filePath] of files) {
    const stem = path.parse(fileName).name;
    if (byKey.has(normalizeHeroKey(stem))) continue;
    const ref: LocalHeroReference = {
      graceSku: stem,
      websiteSku: null,
      filePath,
      productGroupSlug: null,
      isBulbOrTassel: isBulbOrTasselHero(stem),
    };
    remember(stem, ref);
  }
  console.log(`local hero folder            : ${files.size} PNG(s) from ${folder}`);
  return byKey;
}

const localHeroByKey = referenceFolder ? loadLocalHeroFolder(referenceFolder) : new Map<string, LocalHeroReference>();
/** File paths that came from --reference-folder, so a target can prove its route. */
const localHeroFilePaths = new Set([...localHeroByKey.values()].map((hero) => hero.filePath));

function lookupLocalHero(...keys: Array<string | null | undefined>): LocalHeroReference | null {
  for (const key of keys) {
    const found = localHeroByKey.get(normalizeHeroKey(key));
    if (found) return found;
  }
  return null;
}

function buildLocalHeroVerifiedReference(localHero: LocalHeroReference, bytes: Buffer, width: number, height: number): CylinderVerifiedReferenceBytes {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  // A dropper hero shows the dropper seated in the bottle. Telling the model
  // "detached sidecar" against a reference with nothing detached makes it
  // invent a loose part, so the authority has to match what the reference
  // shows. The assembled shape mirrors buildCylinderRoleGenerationAuthority
  // for a real identity-cap-on role.
  const assembled = resolveBestBottlesHeroPresentation({
    groupSlug: localHero.productGroupSlug,
    websiteSku: localHero.websiteSku,
  }) === "assembled";
  return {
    authority: assembled
      ? {
          referenceRoleId: "identity-cap-on",
          componentTopology: "assembled",
          capState: "assembled",
          capOffReferenceId: null,
          topologyReferenceId: sha256,
          shadowTopology: "complex-contact",
        }
      : {
          referenceRoleId: "pdp-cap-off-sidecar",
          componentTopology: "fitment-attached-cap-right-sidecar",
          capState: "detached",
          capOffReferenceId: sha256,
          topologyReferenceId: sha256,
          shadowTopology: "detached-sidecar",
        },
    bytes: new Uint8Array(bytes),
    sha256,
    dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
    lineageUrl: localHero.filePath,
    width,
    height,
  };
}

function loadManifest(): Manifest {
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
    if (parsed && parsed.entries && parsed.family === family) return parsed;
  } catch {
    // fresh
  }
  return {
    runId,
    family,
    provider: aiProvider,
    promptMode,
    resolution,
    entries: {},
  };
}
const manifest = loadManifest();
let manifestDirty = false;
function persistManifest(): void {
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  manifestDirty = false;
}
function recordManifest(entry: ManifestEntry): void {
  manifest.entries[entry.graceSku] = entry;
  manifestDirty = true;
  persistManifest();
}

// ---------------------------------------------------------------------------
// Rig postprocess — identical semantics to live-cylinder-smoke.ts
// (upload to generated-images, patch generated_images.image_url to rigged URL).
// capState/mode come from the reviewed sidecar authority (see resolveTargets),
// so cap-off lanes arrive here as capState="detached".
//
// ASPECT GATE (2026-07-29): rigPostprocess deliberately disables its
// canonical-mm aspect fallback for detached lanes — a cap-off frame has no
// assembled heightWithCap to grade against — so without a caller-supplied
// `expectedPrimaryAspectRatio` the width/proportion gate is OFF and only the
// baseline re-seat runs. That is why the 50 ml reducer cap-off cohort shipped
// with a 460–527 px bottle-width spread (h/w 3.50–4.00 against a canonical
// 117/32 = 3.66) while every badge still read a 0–3 px baseline delta.
// We now measure the byte-locked reference's own bottle ratio and hand it to
// the gate, exactly as the Studio hook does (useAssembledPromptGeneration).
// ---------------------------------------------------------------------------
async function rigPostprocessOutput(input: {
  page: Page;
  imageUrl: string;
  /** Canon-policed, reference-measured pictured-state aspect (detached lanes). */
  expectedPrimaryAspectRatio: number | null;
  savedImageId: string;
  product: BBProduct;
  sku: string;
}): Promise<{
  imageUrl: string;
  qaIssues: string[];
  geometryQa: { pass: boolean; report: unknown };
  shadowQa: { pass: boolean; report: unknown };
  shadowReviewPending: boolean;
  finalImageHash: string;
  reconciliationEvidence: {
    preTransformBaselineYPx: number | null;
    detectedBaselineYPx: number | null;
    targetBaselineYPx: number | null;
    preTransformShoulderYPx: number | null;
    detectedShoulderYPx: number | null;
    targetShoulderYPx: number | null;
    shoulderDeltaPct: number | null;
    shoulderConfidence: number | null;
    fillHeightPct: number | null;
    glassHeightPct: number | null;
    centerXPct: number | null;
    targetCenterXPct: number | null;
    centerDeltaPct: number | null;
    shiftXPx: number;
    shiftYPx: number;
    scaleFactor: number;
    maskControlled: boolean;
    preTransformObjectBounds: unknown;
    transformControlBounds: unknown;
    objectBounds: unknown;
    framingQa: unknown;
    framingDecision: unknown;
    shadowOwner: "model" | "rig";
    shadowQa: unknown;
    shadowTopology: ReturnType<typeof resolveBestBottlesShadowTopology>;
  };
}> {
  const shadowTopology = resolveBestBottlesShadowTopology(input.product, {});
  const rigged = await input.page.evaluate(
    async ({ imageUrl, expectedPrimaryAspectRatio, product, targetBackgroundHex, shadowTopology, canonTruth }) => {
      // PAINT-AFTER REMOVED (2026-07-10): the global corner-sampled colorCorrectToTarget
      // shift tinted the whole image and washed out clear glass. The bone background is
      // now painted by the model in-scene (framing-profile directive), so the rig runs
      // GEOMETRY ONLY. normalizeBestBottlesRigBaseline still fills bone behind the masked
      // product as a deterministic backstop and resizes to the exact 2080x2288 canvas.
      const { normalizeBestBottlesRigBaseline } =
        await import("/src/lib/product-image/rigPostprocess.ts");
      // Detached (cap-off sidecar) lanes carry their proportion truth in from
      // resolveTargets: the byte-locked reference measured with the
      // whole-vessel detector, already canon-policed BEFORE provider spend.
      // Fail closed: an ungated cap-off render is exactly the defect this
      // measurement exists to prevent.
      const isDetached = /\b(?:detached|cap[-_\s]?off|exploded)\b/.test(
        `${product.capState ?? ""} ${product.mode ?? ""}`.toLowerCase(),
      );
      if (isDetached && expectedPrimaryAspectRatio == null) {
        throw new Error(
          "detached-lane aspect truth missing — refusing to rig a cap-off render with the width gate off",
        );
      }
      return normalizeBestBottlesRigBaseline(imageUrl, {
        expectedPrimaryAspectRatio,
        family: product.family,
        bottleCollection: product.bottleCollection,
        graceSku: product.graceSku,
        websiteSku: product.websiteSku,
        itemName: product.itemName,
        itemDescription: product.itemDescription,
        applicator: product.applicator,
        capacityMl: product.capacityMl,
        heightWithCap: product.heightWithCap,
        heightWithoutCap: product.heightWithoutCap,
        diameter: product.diameter,
        // A flat flask's catalog diameter is not its pictured width; the canonical
        // truth sheet's front-view axis is what an assembled frame is held to.
        canonWidthAxisMm: canonTruth?.widthAxisMm ?? null,
        canonHeightWithCapMm: canonTruth?.heightWithCapMm ?? null,
        capState: product.capState ?? null,
        mode: product.mode ?? null,
        shadowTopology,
        targetBackgroundHex,
        maskReferenceUrl: null,
        requireMaskControl: false,
      });
    },
    {
      imageUrl: input.imageUrl,
      expectedPrimaryAspectRatio: input.expectedPrimaryAspectRatio,
      product: input.product,
      targetBackgroundHex: BEST_BOTTLES_VISUAL_TARGET_CANVAS_HEX,
      shadowTopology,
      canonTruth: lookupCanonTruth(input.sku),
    },
  );

  if (rigged.detectedBaselineYPx === null || rigged.targetBaselineYPx === null) {
    throw new Error(`${input.sku} rig postprocess failed: baseline was not detectable.`);
  }
  // Soft / recoverable issues must not burn another Sunburst call:
  // - body-control derivation miss already fell back inside normalize
  // - framingQa "warn" is reviewable; only "fail" regenerates
  const blockingQaIssues = rigged.qaIssues.filter(
    (issue) => !/body-control bounds could not be derived/i.test(issue),
  );
  if (blockingQaIssues.length > 0) {
    // Surface QA failures to the retry loop so they trigger a regeneration.
    throw new Error(`${input.sku} rig postprocess failed: ${blockingQaIssues.join(" ")}`);
  }
  if (rigged.framingQa?.status === "fail") {
    throw new Error(`${input.sku} rig postprocess failed: framing QA did not pass.`);
  }
  // A shadow-only miss is not an identity or geometry failure. Preserve the
  // generated asset and route it to explicit review without spending another
  // model call on the same identity-locked bottle.
  const bodyControlReviewPending = rigged.qaIssues.some((issue) =>
    /body-control bounds could not be derived/i.test(issue),
  );
  const shadowReviewPending =
    (rigged.shadowOwner === "model" && rigged.shadowQa?.status !== "pass")
    || bodyControlReviewPending;

  const base64 = rigged.dataUrl.replace(/^data:image\/png;base64,/, "");
  const bytes = Buffer.from(base64, "base64");
  const finalImageHash = createHash("sha256").update(bytes).digest("hex");
  const riggedPath =
    `${ORG_ID}/${USER_ID}/family-batch/${familySlug}-${runId}/rigged/${input.sku}__rigged.png`;
  const upload = await supabase.storage
    .from("generated-images")
    .upload(riggedPath, bytes, {
      contentType: "image/png",
      cacheControl: "3600",
      upsert: true,
    });
  if (upload.error) {
    throw new Error(`${input.sku} rigged upload failed: ${upload.error.message}`);
  }
  const { data: publicUrlData } = supabase.storage.from("generated-images").getPublicUrl(riggedPath);
  if (!publicUrlData.publicUrl) throw new Error(`${input.sku} rigged upload returned no URL.`);

  const { error: updateError } = await supabase
    .from("generated_images")
    .update({ image_url: publicUrlData.publicUrl })
    .eq("id", input.savedImageId);
  if (updateError) {
    throw new Error(`${input.sku} rigged row update failed: ${updateError.message}`);
  }

  return {
    imageUrl: publicUrlData.publicUrl,
    qaIssues: rigged.qaIssues,
    geometryQa: {
      pass: rigged.framingQa?.status === "pass",
      report: rigged.framingQa,
    },
    shadowQa: {
      pass: rigged.shadowQa?.status === "pass",
      report: rigged.shadowQa,
    },
    shadowReviewPending,
    finalImageHash,
    reconciliationEvidence: {
      preTransformBaselineYPx: rigged.preTransformBaselineYPx,
      detectedBaselineYPx: rigged.detectedBaselineYPx,
      targetBaselineYPx: rigged.targetBaselineYPx,
      preTransformShoulderYPx: rigged.preTransformShoulderYPx,
      detectedShoulderYPx: rigged.detectedShoulderYPx,
      targetShoulderYPx: rigged.targetShoulderYPx,
      shoulderDeltaPct: rigged.shoulderDeltaPct,
      shoulderConfidence: rigged.shoulderConfidence,
      fillHeightPct: rigged.framingQa?.measurements.fillHeightPct ?? null,
      glassHeightPct: rigged.framingQa?.measurements.glassHeightPct ?? null,
      centerXPct: rigged.framingQa?.measurements.centerXPct ?? null,
      targetCenterXPct: rigged.framingQa?.measurements.targetCenterXPct ?? null,
      centerDeltaPct: rigged.framingQa?.measurements.centerDeltaPct ?? null,
      shiftXPx: rigged.shiftXPx,
      shiftYPx: rigged.shiftYPx,
      scaleFactor: rigged.scale,
      maskControlled: rigged.maskControlled,
      preTransformObjectBounds: rigged.preTransformObjectBounds,
      transformControlBounds: rigged.transformControlBounds,
      objectBounds: rigged.objectBounds,
      framingQa: rigged.framingQa,
      framingDecision: rigged.framingDecision,
      shadowOwner: rigged.shadowOwner,
      shadowQa: rigged.shadowQa,
      shadowTopology,
    },
  };
}

// ---------------------------------------------------------------------------
// Per-SKU generation — one attempt. Throws on any failure (caught by retry).
// Body shape is IDENTICAL to live-cylinder-smoke.ts.
// ---------------------------------------------------------------------------
const system = loadPromptSystem(process.cwd());

interface GenerationOutcome {
  savedImageId: string;
  rawImageUrl: string;
  finalImageUrl: string;
  qaIssues: string[];
  geometryQa: { pass: boolean; report: unknown };
  shadowQa: { pass: boolean; report: unknown };
  lifecycle: "qa-passed" | "review-pending" | "pending";
  generationIdentity: FamilyBatchGenerationIdentity;
}

function buildCatalogTruthSnapshot(target: FamilyTarget): BestBottlesCatalogTruthSnapshot {
  const product = target.product;
  const readiness = target.canonicalReadiness;
  return {
    name: product.itemName ?? null,
    graceSku: product.graceSku ?? null,
    websiteSku: product.websiteSku ?? null,
    eligibleGraceSkus: product.graceSku ? [product.graceSku] : [],
    eligibleWebsiteSkus: product.websiteSku ? [product.websiteSku] : [],
    family: product.family ?? null,
    category: product.category ?? null,
    capacityMl: product.capacityMl ?? null,
    heightWithoutCap: product.heightWithoutCap ?? null,
    heightWithCap: product.heightWithCap ?? null,
    diameter: product.diameter ?? null,
    neckThreadSize: product.neckThreadSize ?? null,
    applicator: product.applicator ?? null,
    capState: target.sidecarAuthority?.capState ?? target.product.capState ?? null,
    capColor: product.capColor ?? null,
    trimColor: product.trimColor ?? null,
    bodyMaterial: inferBestBottlesBodyMaterial(product),
    color: product.color ?? null,
    identityStatus: readiness ? (readiness.blockers.length === 0 ? "ready" : "blocked") : "ready",
    identityBlockers: readiness?.blockers ?? [],
    identityHash: readiness?.canonicalIdentityKey ?? null,
    sourceReferenceUrl: target.referenceUrl,
    sourcePageUrl: null,
    measurementSource: product.measurementSource ?? null,
    measurementSourceUrl: null,
    measurementSourceNote: "Canonical body geometry joined by exact Website SKU + Grace SKU.",
    websiteTruthStatus: readiness ? (readiness.blockers.length === 0 ? "ready" : "blocked") : "ready",
    websiteTruthIssues: readiness?.blockers ?? [],
  };
}

/** Terminal = the job's linked image is the LIVE cap-on PDP candidate (guarded by the DB). */
async function isTerminalSkuJob(pipelineSkuJobId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("best_bottles_pipeline_sku_jobs")
    .select("status,approved_image_id")
    .eq("id", pipelineSkuJobId)
    .maybeSingle();
  if (error || !data) return false; // unknown → attempt the link; the DB guard stays authoritative
  return ["approved", "shopify-pushed", "synced"].includes(String(data.status)) ||
    data.approved_image_id != null;
}

async function persistReconciliation(payload: Record<string, unknown>, sku: string): Promise<void> {
  const { error } = await supabase
    .from("best_bottles_image_reconciliations")
    .upsert(payload, { onConflict: "image_id" });
  if (error) throw new Error(`${sku} reconciliation write failed: ${error.message}`);
}

function buildBodyForTarget(target: FamilyTarget) {
  const product = target.product;
  const referenceUrl = target.referenceUrl;
  const generationReferenceUrl = target.verifiedReference?.dataUrl ?? referenceUrl;
  const bodyMaterial = inferBestBottlesBodyMaterial(product);
  const canonicalGeometryContract = target.canonicalReadiness
    ? buildCylinderCanonicalGeometryContract(target.canonicalReadiness)
    : null;
  const componentTopology = target.sidecarAuthority?.componentTopology
    ?? (preset.id === "grid-card-exploded-2000x2200" ? "fitment-attached-cap-right-sidecar" : "assembled");
  const capState = target.sidecarAuthority?.capState
    ?? (componentTopology === "fitment-attached-cap-right-sidecar" ? "detached" : "assembled");
  const topologyReferenceId = target.sidecarAuthority?.topologyReferenceId ?? target.referenceHash;

  const promptPreflight = buildBestBottlesPromptPreflight({
    product,
    referenceImagePath: referenceUrl,
    bodyMaterial,
    canvas: preset.canvas,
    system,
  });
  if (promptPreflight.status === "error" || !promptPreflight.record) {
    throw new Error(`${target.sku} prompt preflight blocked: ${promptPreflight.issue ?? "missing record"}`);
  }
  if (!promptPreflight.sku) {
    throw new Error(`${target.sku} prompt preflight returned no SKU record.`);
  }
  const promptRecord = buildCylinderSmokePromptRecord({
    record: promptPreflight.record,
    sku: promptPreflight.sku,
    mode: promptMode,
  });
  // Surface hints mirror the Studio hook (2026-07-20 lesson): without the
  // catalog color + grace-SKU body segment, every colored/textured glass
  // bottle silently fell back to the clear exemplar — which the deployed
  // edge contract now rejects as a surface mismatch.
  const visualTargetSurfaceHints = {
    color: product.color ?? null,
    graceSku: product.graceSku ?? null,
  };
  const visualTargetReference = getBestBottlesVisualTargetReference(bodyMaterial, visualTargetSurfaceHints);
  const visualTargetTags = getBestBottlesVisualTargetTags(bodyMaterial, visualTargetSurfaceHints);
  const addendumPrompt = applySmokePromptAddendum(promptRecord.final_prompt, promptAddendum);
  const finalPrompt = applyBestBottlesVisualTargetPrompt(
    addendumPrompt,
    bodyMaterial,
    componentTopology,
    visualTargetSurfaceHints,
  );
  const precompiledPromptRecord = {
    ...promptRecord,
    final_prompt: finalPrompt,
    qa_checklist: Array.from(new Set([
      ...promptRecord.qa_checklist,
      ...visualTargetTags,
      `component-topology:${componentTopology}`,
      ...(promptAddendum ? [`smoke_prompt_addendum:${promptAddendum.id}`] : []),
    ])),
  };

  const identity = buildBestBottlesGenerationIdentity(product, {
    bodyMaterial,
    sourceReference: referenceUrl,
  });
  const identityIssue = getBestBottlesGenerationIdentityIssue(identity);
  if (identityIssue) throw new Error(`${target.sku} identity blocked: ${identityIssue}`);
  if (!identity.calibrationRegistryKey || identity.resolvedBodyTargetPx == null) {
    throw new Error(
      `${target.sku} scale blocked: reconciled assembled/body measurements and a calibration registry key are required.`,
    );
  }
  const shadowTopology = resolveBestBottlesShadowTopology(product, promptPreflight.sku);
  const generationIdentity: FamilyBatchGenerationIdentity = {
    ledgerHash: cylinderCloseout?.ledger.sha256 ?? "not-applicable",
    referenceHash: target.referenceHash,
    promptHash: createHash("sha256").update(finalPrompt).digest("hex"),
    promptVersion: identity.promptVersion,
    shadowOwner: identity.shadowOwner,
    shadowContract: identity.shadowContract,
    shadowTopology: shadowTopology.kind,
    scaleContractVersion: identity.scaleContractVersion,
    calibrationRegistryKey: identity.calibrationRegistryKey,
    resolvedAssembledTargetPct: identity.resolvedAssembledTargetPct,
    resolvedBodyTargetPx: identity.resolvedBodyTargetPx,
  };

  const extraLibraryTags = [
    "sku-preset",
    `preset:${preset.id}`,
    `canvas:${preset.canvas.widthPx}x${preset.canvas.heightPx}`,
    "brand:best-bottles",
    "studio-master",
    "prompt-source:json-precompiler",
    "family-batch:live",
    `family-run:${runId}`,
    `prompt-family:${promptPreflight.sku?.product_family}`,
    `prompt-material:${promptPreflight.sku?.body_material}`,
    `prompt-closure:${promptPreflight.sku?.closure_type}`,
    `prompt-frame:${promptPreflight.sku?.frame_class}`,
    `prompt-qa:${promptPreflight.status}`,
    `smoke-prompt-mode:${promptMode}`,
    `smoke-resolution:${resolution}`,
    `family:${String(product.family ?? "unknown").toLowerCase().replace(/\s+/g, "-")}`,
    `sku:${target.sku}`,
    product.websiteSku ? `websiteSku:${product.websiteSku}` : null,
    `product-group:${target.productGroupSlug}`,
    "reference-lineage:job-table-candidate",
    "truth-ref:best-reference-candidate-path",
    `model:${aiProvider}`,
    promptAddendum ? `prompt-addendum:${promptAddendum.id}` : null,
    "reference-source:sku-job",
    `prompt:${identity.promptVersion}`,
    `rig:${identity.rigVersion}`,
    `scale-contract:${identity.scaleContractVersion}`,
    identity.glassBodyKey ? `glass-body:${identity.glassBodyKey}` : null,
    identity.shoulderTargetPct != null ? `shoulder-pct:${identity.shoulderTargetPct}` : null,
    `scale-registry:${identity.calibrationRegistryKey}`,
    `scale-assembled-target:${identity.resolvedAssembledTargetPct}`,
    `scale-body-target-px:${identity.resolvedBodyTargetPx}`,
    `identity:${identity.identityHash}`,
    `qa:${identity.qaStatus}`,
    `component-topology:${componentTopology}`,
    `topology-reference:${topologyReferenceId}`,
    // Never let a render made from a local Photoshop flat read as if it came
    // from a promoted immutable reference.
    isFlattenedPsdTarget(target) ? "reference-route:flattened-psd" : null,
    ...visualTargetTags,
  ].filter((tag): tag is string => Boolean(tag));

  const body = {
    prompt: finalPrompt,
    userId: USER_ID,
    organizationId: ORG_ID,
    goalType: "product_photography",
    aspectRatio: preset.aspectRatio,
    outputFormat: "png",
    referenceImages: [
      {
        url: generationReferenceUrl,
        label: "Product Reference",
        description: [
          "Use this image as an exact product-identity lock: preserve the bottle geometry, camera angle, scale relationships, body material/substrate",
          `(${bodyMaterial}), cap texture, fitment, applicator, body color, hose/bulb/tassel color, collar/ring details, reducer finish, trim metal, and all surface details.`,
          promptPreflight.sku.body_material === "clear_glass"
            ? "Baked-in white-background edge rails are source-lighting artifacts, not product markings. Preserve the silhouette boundary and physical wall thickness, but never copy a dark rail, black stripe, or drawn sidewall outline into the final glass."
            : "",
          "Do not redesign, restyle, recolor, rotate, or reinterpret the product components.",
          componentTopology === "fitment-attached-cap-right-sidecar"
            ? "Render exactly one bottle upright with its exact fitment or applicator attached, plus exactly one matching cap or overcap detached on camera-right on the same shared baseline. Preserve the exact component count, cap identity, sidecar position, spacing, and relative scale shown in this Product Reference; do not assemble, omit, duplicate, or substitute the cap."
            : componentTopology === "assembled-live-site-exception"
              ? "Preserve the exact reviewed assembled live-site topology, including every physically attached bulb, hose, tassel, collar, ring, and closure component shown in this Product Reference; do not add a detached sidecar or any unshown component."
              : "Preserve the exact reviewed cap-on product topology as assembled in the Product Reference; do not detach, omit, duplicate, or substitute any component.",
          "Do allow luxury catalog staging, lighting, background replacement, shadow, and refined PDP canvas placement as instructed by the server prompt.",
        ].join(" "),
      },
      visualTargetReference.imageUrl ? {
        url: visualTargetReference.imageUrl,
        label: visualTargetReference.material === "aluminum"
          ? "Metal Lighting-Only Style Reference"
          : "Glass Specularity Style Reference",
        description: [
          `Approved Best Bottles ${BEST_BOTTLES_VISUAL_TARGET_VERSION} style-only calibration reference.`,
          "Use only for canvas tonal character, material rendering, reflection/specular rhythm, contact shadow, ambient occlusion, and premium studio polish.",
          "Do not copy its product silhouette, bottle family, cap, closure, applicator, color, scale, crop, geometry, components, or composition.",
          "The Product Reference remains the sole product-identity authority.",
        ].join(" "),
      } : null,
    ].filter((reference) => Boolean(reference)),
    proModeControls: { productAccuracy: "strict" },
    aiProvider,
    allowBestBottlesProviderOverride,
    resolution,
    imageConstraints: getExactOutputCanvasConstraints(preset.canvas),
    extraLibraryTags,
    productContext: {
      name: product.itemName,
      websiteSku: product.websiteSku ?? null,
      itemDescription: product.itemDescription ?? null,
      collection: product.bottleCollection ?? undefined,
      family: product.family,
      category: product.category,
      presetId: preset.id,
      capState,
      mode: componentTopology,
      componentTopology,
      capOffReferenceId: target.sidecarAuthority?.capOffReferenceId ?? (capState === "detached" ? target.referenceHash : null),
      topologyReferenceId,
      referenceRoleId: target.sidecarAuthority?.referenceRoleId ?? null,
      // Resolved material binding — the deployed edge contract fails closed
      // ("Cylinder style reference requires one complete resolved material
      // binding") when a style reference arrives without all four fields.
      // Mirrors useAssembledPromptGeneration's Studio payload exactly.
      styleReferenceSurface: visualTargetReference.surface,
      styleReferenceImageId: visualTargetReference.imageId,
      styleReferenceImageUrl: visualTargetReference.imageUrl,
      styleReferenceExportSha256: visualTargetReference.exportSha256,
      bodyMaterial,
      color: product.color ?? null,
      sku: product.graceSku,
      capacityMl: product.capacityMl,
      heightWithoutCap: product.heightWithoutCap,
      heightWithCap: product.heightWithCap,
      diameter: product.diameter,
      capColor: identity.capColor,
      trimColor: product.trimColor ?? null,
      applicator: product.applicator ?? null,
      tasselColor: identity.tasselColor,
      bulbColor: identity.bulbColor,
      hoseColor: identity.hoseColor,
      collarFinish: identity.collarFinish,
      ringPresent: identity.ringPresent,
      accessoryCode: identity.accessoryCode,
      reducerFinish: identity.reducerFinish,
      // The active flattened PNG is the sole geometry/provenance authority. Do
      // not forward a historical identity source that may describe a retired
      // import route and contradict the reference supplied above.
      sourceReference: referenceUrl,
      canonicalGeometryContract,
      referenceWorkflow: "flattened-product-truth-plus-style",
      maskReference: null,
      maskQcStatus: null,
      identityStatus: identity.identityStatus,
      identityBlockers: identity.identityBlockers,
      identityHash: identity.identityHash,
      promptVersion: identity.promptVersion,
      scaleContractVersion: identity.scaleContractVersion,
      calibrationRegistryKey: identity.calibrationRegistryKey,
      resolvedAssembledTargetPct: identity.resolvedAssembledTargetPct,
      resolvedBodyTargetPx: identity.resolvedBodyTargetPx,
      rigVersion: identity.rigVersion,
      qaStatus: identity.qaStatus,
      canvas: identity.canvas,
      shadowTopology,
    },
    precompiledPromptRecord,
  };

  return { body, finalPrompt, precompiledPromptRecord, generationIdentity };
}

async function generateOnce(target: FamilyTarget, page: Page | null): Promise<GenerationOutcome> {
  const { body, finalPrompt, generationIdentity } = buildBodyForTarget(target);
  let rawImageUrl: string;
  let savedImageId: string;
  if (resumeRawImageId) {
    const { data: resumed, error: resumeError } = await supabase
      .from("best_bottles_image_reconciliations")
      .select("image_id,grace_sku,website_sku,raw_image_url,source_reference_hash,prompt_hash,lifecycle_state")
      .eq("organization_id", ORG_ID)
      .eq("image_id", resumeRawImageId)
      .maybeSingle();
    if (resumeError) throw new Error(`${target.sku} raw-image resume read failed: ${resumeError.message}`);
    if (
      !resumed
      || resumed.grace_sku !== target.sku
      || resumed.source_reference_hash !== target.referenceHash
      || resumed.prompt_hash !== generationIdentity.promptHash
      || !String(resumed.raw_image_url ?? "").startsWith("https://")
      || !["rigging", "failed", "review-pending"].includes(String(resumed.lifecycle_state ?? ""))
    ) {
      throw new Error(
        `${target.sku} raw-image resume blocked: image ID, grace_sku, source_reference_hash, prompt_hash, URL, and lifecycle must match the current request exactly.`,
      );
    }
    savedImageId = String(resumed.image_id);
    rawImageUrl = String(resumed.raw_image_url);
  } else {
    const invokeRemoteGeneration = async (verified: CylinderVerifiedReferenceBytes | null) => {
      if (
        verified
        && (body.referenceImages[0] as { url: string }).url !== verified.dataUrl
      ) {
        throw new Error(`${target.sku} generation input drifted from the exact verified reference payload.`);
      }
      return supabase.functions.invoke("generate-madison-image", { body });
    };
    const flattenedPsdRoute = allowFlattenedPsdReference && isFlattenedPsdTarget(target);
    if (flattenedPsdRoute && isCylinderCloseoutFamily) {
      console.log(`  [${target.sku}] reference route: FLATTENED PSD (${path.basename(target.verifiedReference!.lineageUrl)}) — immutable-role fence lifted by --allow-flattened-psd-reference`);
    }
    const { data, error } = flattenedPsdRoute
      // The drift check still runs: the bytes sent must be the bytes verified.
      ? await invokeRemoteGeneration(target.verifiedReference)
      : isCylinderCloseoutFamily
      ? await invokeWithCylinderVerifiedReference({
          row: target.canonicalReadiness,
          presetId: preset.id,
          referenceUrl: target.referenceUrl,
          preverified: target.verifiedReference,
          invoke: invokeRemoteGeneration,
        })
      : await invokeRemoteGeneration(null);
    if (error) {
      let bodyText = "";
      const context = (error as unknown as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } }).context;
      try {
        if (context?.json) bodyText = JSON.stringify(await context.json());
        else if (context?.text) bodyText = await context.text();
      } catch {
        bodyText = "";
      }
      throw new Error(
        `${target.sku} generation failed: ${error.message ?? JSON.stringify(error)}${bodyText ? ` body=${bodyText.slice(0, 1000)}` : ""}`,
      );
    }
    // Heartbeat-streaming responses report post-defer failures as HTTP 200 with an
    // `error` field in the body — treat those as hard failures.
    if (typeof data?.error === "string" && data.error.trim()) {
      throw new Error(`${target.sku} generation failed (streamed error): ${data.error}`);
    }
    if (!data?.imageUrl || !data?.savedImageId) {
      throw new Error(`${target.sku} generation returned incomplete response: ${JSON.stringify(data)}`);
    }
    rawImageUrl = data.imageUrl as string;
    savedImageId = data.savedImageId as string;
  }
  const catalogTruth = buildCatalogTruthSnapshot(target);
  const catalogTruthHash = createHash("sha256")
    .update(JSON.stringify(catalogTruth))
    .digest("hex");
  const shadowTopology = resolveBestBottlesShadowTopology(target.product, {});
  const rawReconciliationInput = {
    imageId: savedImageId,
    organizationId: ORG_ID,
    graceSku: target.product.graceSku,
    websiteSku: target.product.websiteSku,
    family: target.product.family,
    sourceReferenceUrl: target.referenceUrl,
    sourceReferenceHash: target.referenceHash,
    prompt: finalPrompt,
    promptHash: generationIdentity.promptHash,
    promptVersion: generationIdentity.promptVersion,
    rigVersion: String((body.productContext as { rigVersion?: string }).rigVersion ?? ""),
    providerModel: aiProvider,
    shadowOwner: generationIdentity.shadowOwner,
    shadowTopology,
    catalogTruth,
    catalogTruthHash,
    // Role follows the preset: the cap-off sidecar preset is the PDP-secondary
    // lane (2026-07-29 fix — the hardcoded "pdp-primary" mislabeled 112
    // wave-1 cap-off reconciliation rows; backfill noted in the loop ledger).
    assetRole: (preset.id === "grid-card-exploded-2000x2200" ? "pdp-secondary" : "pdp-primary") as "pdp-primary" | "pdp-secondary",
    requiresPipelineReconciliation: true,
    rawImageUrl,
    canvasWidthPx: preset.canvas.widthPx,
    canvasHeightPx: preset.canvas.heightPx,
  };

  await persistReconciliation(
    buildBestBottlesRawReconciliationPayload(rawReconciliationInput),
    target.sku,
  );
  let rigged: Awaited<ReturnType<typeof rigPostprocessOutput>> | null = null;
  try {
    rigged = page
      ? await rigPostprocessOutput({
        page,
        imageUrl: rawImageUrl,
        expectedPrimaryAspectRatio: target.referenceAspectRatio,
        savedImageId,
        product: target.product,
        sku: target.sku,
      })
      : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await persistReconciliation({
      ...buildBestBottlesRawReconciliationPayload(rawReconciliationInput),
      lifecycle_state: "failed",
      last_error: message,
      qa_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, target.sku);
    throw error;
  }

  if (rigged) {
    const lifecycleState = rigged.shadowReviewPending ? "review-pending" : "qa-passed";
    const shadowReportHash = createHash("sha256")
      .update(JSON.stringify(rigged.reconciliationEvidence.shadowQa))
      .digest("hex");
    const shadowTopologyHash = createHash("sha256")
      .update(JSON.stringify(rigged.reconciliationEvidence.shadowTopology))
      .digest("hex");
    await persistReconciliation({
      ...buildBestBottlesRigReconciliationPayload({
        ...rawReconciliationInput,
        finalImageUrl: rigged.imageUrl,
        ...rigged.reconciliationEvidence,
        qaIssues: rigged.qaIssues,
        lifecycleState,
        lastError: null,
      }),
      source_reference_hash: target.referenceHash,
      prompt_hash: generationIdentity.promptHash,
      catalog_truth_hash: catalogTruthHash,
      final_image_hash: rigged.finalImageHash,
      shadow_report_hash: shadowReportHash,
      shadow_topology_hash: shadowTopologyHash,
    }, target.sku);

    // Cap-off sidecar renders are LIBRARY-LANE assets (tracked by tags), not
    // PDP-main candidates. A SKU job in a terminal state (synced / approved /
    // shopify-pushed, or with an approved image) is protected by the DB's
    // terminal-link guard — correctly, because its linked image IS the live
    // cap-on PDP candidate and must never be overwritten by a cap-off frame.
    // Batch 1 (2026-07-29) burned duplicate renders retrying that guard on
    // frosted rollers whose cap-on was already synced. Skip the link for
    // terminal jobs on the cap-off preset; everything else still links.
    const jobTerminal = await isTerminalSkuJob(target.pipelineSkuJobId);
    if (preset.id === "grid-card-exploded-2000x2200" && jobTerminal) {
      console.log(`  ↷ ${target.sku}: cap-off render saved as library asset; SKU job is terminal (cap-on live) — link skipped by design.`);
    } else {
      const { error: linkError } = await supabase.rpc("link_best_bottles_generated_image", {
        p_organization_id: ORG_ID,
        p_pipeline_sku_job_id: target.pipelineSkuJobId,
        p_image_id: savedImageId,
      });
      if (linkError) {
        throw new Error(`${target.sku} generated image/SKU job link failed: ${linkError.message}`);
      }
    }
  }

  return {
    savedImageId,
    rawImageUrl,
    finalImageUrl: rigged?.imageUrl ?? rawImageUrl,
    qaIssues: rigged?.qaIssues ?? [],
    geometryQa: rigged?.geometryQa ?? { pass: false, report: null },
    shadowQa: rigged?.shadowQa ?? { pass: false, report: null },
    lifecycle: rigged
      ? rigged.shadowReviewPending
        ? "review-pending"
        : "qa-passed"
      : "pending",
    generationIdentity,
  };
}

async function generateWithRetry(target: FamilyTarget, page: Page | null): Promise<ManifestEntry> {
  const startedAt = Date.now();
  let attempts = 0;
  let lastError: string | null = null;
  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const outcome = await generateOnce(target, page);
      return {
        graceSku: target.sku,
        websiteSku: target.product.websiteSku,
        productGroupSlug: target.productGroupSlug,
        status: "rendered",
        attempts,
        savedImageId: outcome.savedImageId,
        imageUrl: outcome.finalImageUrl,
        rawImageUrl: outcome.rawImageUrl,
        generationIdentity: outcome.generationIdentity,
        geometryQa: outcome.geometryQa,
        shadowQa: outcome.shadowQa,
        lifecycle: outcome.lifecycle,
        qaIssues: outcome.qaIssues,
        error: null,
        elapsedMs: Date.now() - startedAt,
        updatedAt: new Date().toISOString(),
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`  [${target.sku}] attempt ${attempts}/${maxAttempts} failed: ${lastError}`);
      if (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1500 * attempts));
      }
    }
  }
  return {
    graceSku: target.sku,
    websiteSku: target.product.websiteSku,
    productGroupSlug: target.productGroupSlug,
    status: "failed",
    attempts,
    savedImageId: null,
    imageUrl: null,
    rawImageUrl: null,
    generationIdentity: null,
    geometryQa: null,
    shadowQa: null,
    lifecycle: "failed",
    qaIssues: [],
    error: lastError,
    elapsedMs: Date.now() - startedAt,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------
async function resolveTargets(): Promise<{ targets: FamilyTarget[]; skips: Skip[] }> {
  let jobQuery = supabase
    .from("best_bottles_pipeline_sku_jobs")
    .select("id,grace_sku,website_sku,family,product_group_slug,expected_canonical_filename,reference_source,best_reference_candidate_path,coverage_status,status")
    .eq("organization_id", ORG_ID)
    .eq("family", family);
  // Optional pilot scoping: restrict to a single product group (e.g. one lane)
  // so a validation batch does not bleed into the whole family.
  if (productGroup) jobQuery = jobQuery.eq("product_group_slug", productGroup);
  const { data: jobRows, error } = await jobQuery;
  if (error) throw new Error(`Failed to read sku jobs: ${error.message}`);

  const publicationTargetByWebsiteSku = new Map(
    (cylinderCloseout?.ledger.publicationTargets ?? []).map((target) => [
      target.websiteSku,
      target,
    ]),
  );
  const snapshot = JSON.parse(readFileSync(convexSnapshotPath, "utf8")) as { products: ProductRow[] };
  const productBySku = new Map<string, ProductRow>();
  const productByWebsiteSku = new Map<string, ProductRow>();
  for (const row of snapshot.products) {
    const sku = getText(row, "graceSku");
    const website = getText(row, "websiteSku");
    if (sku) productBySku.set(sku, row);
    if (website) productByWebsiteSku.set(website, row);
  }

  const targets: FamilyTarget[] = [];
  const skips: Skip[] = [];
  const seenWebsiteSkus = new Set<string>();
  const usedLocalHeroPaths = new Set<string>();

  const sortedJobRows = [...((jobRows ?? []) as SkuJobRow[])].sort((left, right) => {
    const leftTarget = publicationTargetByWebsiteSku.get(left.website_sku ?? "");
    const rightTarget = publicationTargetByWebsiteSku.get(right.website_sku ?? "");
    const leftCanonical = leftTarget?.graceSku === left.grace_sku ? 0 : 1;
    const rightCanonical = rightTarget?.graceSku === right.grace_sku ? 0 : 1;
    return leftCanonical - rightCanonical || left.grace_sku.localeCompare(right.grace_sku);
  });

  for (const job of sortedJobRows) {
    const websiteSku = String(job.website_sku ?? "").trim();
    const publicationTarget = publicationTargetByWebsiteSku.get(websiteSku);
    const sku = publicationTarget?.graceSku ?? job.grace_sku;
    const localHero = lookupLocalHero(sku, job.grace_sku, websiteSku);
    const skuFilterAllows = !skuFilter
      || skuFilter.has(sku)
      || skuFilter.has(job.grace_sku)
      || skuFilter.has(websiteSku)
      || Boolean(localHero && (
        skuFilter.has(localHero.graceSku)
        || (localHero.websiteSku != null && skuFilter.has(localHero.websiteSku))
      ));
    if (!skuFilterAllows) continue;
    // One reference file is one hero. The catalog carries `-01` twin rows that
    // share a website SKU, and the website-SKU dedupe below is skipped for
    // local heroes — so without this the same render is billed twice.
    // Canonical publication rows sort first, so the twin is what gets dropped.
    if (localHero && usedLocalHeroPaths.has(localHero.filePath)) continue;
    if (cylinderCloseout && websiteSku && seenWebsiteSkus.has(websiteSku) && !localHero) continue;
    if (cylinderCloseout && websiteSku) seenWebsiteSkus.add(websiteSku);
    const productGroupSlug = localHero?.productGroupSlug ?? job.product_group_slug ?? "unknown";
    let referenceUrl = "";
    let resolvedReferenceHash = "";
    let referenceAspectRatio: number | null = null;
    let verifiedReference: CylinderVerifiedReferenceBytes | null = null;
    const readinessKey = cylinderProductionIdentityKey(websiteSku, sku);
    const canonicalReadiness = readinessKey
      ? cylinderReadinessByIdentity.get(readinessKey) ?? null
      : null;
    const roleReference = isCylinderCloseoutFamily
      ? resolveCylinderImmutableReferenceForPreset(canonicalReadiness, preset.id)
      : null;
    let sidecarAuthority: CylinderRoleGenerationAuthority | null = null;
    if (localHero && localHero.isBulbOrTassel && !includeBulbTassel) {
      skips.push({ sku: localHero.graceSku, productGroupSlug, reason: "bulb/tassel held for 1536x1024 canvas" });
      usedLocalHeroPaths.add(localHero.filePath);
      continue;
    }
    if (cylinderCloseout && !publicationTarget && !localHero) {
      skips.push({ sku, productGroupSlug, reason: "not in canonical Cylinder publication ledger" });
      continue;
    }
    if (isCylinderCloseoutFamily && cylinderRoleAwareReadiness && !roleReference && !localHero) {
      skips.push({
        sku,
        productGroupSlug,
        reason: `immutable role authority blocked: ${canonicalReadiness?.blockers.join(", ") || "exact Website + Grace SKU or preset role is not generation-authorized"}`,
      });
      continue;
    }
    referenceUrl = isCylinderCloseoutFamily
      ? roleReference?.publicUrl?.trim() ?? ""
      : job.best_reference_candidate_path?.trim() ?? "";

    try {
      let referenceBytes: Buffer;
      if (localHero) {
        referenceBytes = readFileSync(localHero.filePath);
        const image = sharp(referenceBytes, { failOn: "error" });
        const metadata = await image.metadata();
        if (!metadata.width || !metadata.height) {
          skips.push({ sku: localHero.graceSku, productGroupSlug, reason: "local hero PNG has no canvas size" });
          continue;
        }
        verifiedReference = buildLocalHeroVerifiedReference(
          localHero,
          referenceBytes,
          metadata.width,
          metadata.height,
        );
        referenceUrl = verifiedReference.dataUrl;
        resolvedReferenceHash = verifiedReference.sha256;
        sidecarAuthority = verifiedReference.authority;
      } else if (isCylinderCloseoutFamily) {
        const refIssue = getBestBottlesReferenceUrlIssue(referenceUrl);
        if (refIssue) {
          skips.push({ sku, productGroupSlug, reason: `no usable reference: ${refIssue}` });
          continue;
        }
        const verified = await verifyCylinderImmutableReferenceBytesForPreset(
          canonicalReadiness,
          preset.id,
          referenceUrl,
        );
        referenceBytes = Buffer.from(verified.bytes);
        resolvedReferenceHash = verified.sha256;
        verifiedReference = verified;
        sidecarAuthority = verified.authority;
      } else {
        const refIssue = getBestBottlesReferenceUrlIssue(referenceUrl);
        if (refIssue) {
          skips.push({ sku, productGroupSlug, reason: `no usable reference: ${refIssue}` });
          continue;
        }
        const response = await fetch(referenceUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        referenceBytes = Buffer.from(await response.arrayBuffer());
        resolvedReferenceHash = createHash("sha256").update(referenceBytes).digest("hex");
      }
      const image = sharp(referenceBytes, { failOn: "error" });
      const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
      const reviewedSidecarProvenance = Boolean(
        localHero
        || (
          isCylinderCloseoutFamily
          && roleReference
          && /^(?:approved|reviewed)$/i.test(String(roleReference.sourceReviewStatus ?? ""))
          && (
            roleReference.sourceRoute === "reviewed-immutable-sidecar-remediation"
            || roleReference.sourceRoute === "reviewed-bbuat-studio-capped"
            || roleReference.sourceRoute === "production-readiness-cap-on"
          )
        ),
      );
      const canonicalIssue = getBestBottlesCanonicalReferenceIssue(
        referenceUrl,
        metadata.width && metadata.height
          ? { width: metadata.width, height: metadata.height }
          : null,
        {
          referenceSource: reviewedSidecarProvenance || localHero
            ? "flattened-product-truth"
            : job.reference_source,
          referenceName: localHero ? path.basename(localHero.filePath) : job.expected_canonical_filename,
        },
      );
      if (canonicalIssue) {
        skips.push({ sku, productGroupSlug, reason: `canonical reference blocked: ${canonicalIssue}` });
        continue;
      }
      const alpha = stats.channels.find((channel) => channel.channel === "alpha");
      if (alpha && alpha.min < 255) {
        skips.push({
          sku,
          productGroupSlug,
          reason: "canonical reference blocked: pixel alpha evidence contains transparent or partially transparent pixels",
        });
        continue;
      }
      // CANON POLICE (Jordan ruling 2026-07-29): the reference sets the
      // pictured-state aspect expectation for detached lanes, and canon
      // guards the reference — BEFORE provider spend. A cap-off reference
      // whose whole-vessel aspect reads slimmer than the canonical bare body
      // (beyond 3% tolerance), or implies a fitment adding more than 55%
      // height, is condemned and skipped; a weak reference must never move
      // the goalpost.
      if (sidecarAuthority?.capState === "detached") {
        const rgba = new Uint8ClampedArray(
          await sharp(referenceBytes).ensureAlpha().raw().toBuffer(),
        );
        const refW = metadata.width ?? 0;
        const refH = metadata.height ?? 0;
        const px = (x: number, y: number) => [
          rgba[(y * refW + x) * 4], rgba[(y * refW + x) * 4 + 1], rgba[(y * refW + x) * 4 + 2],
        ];
        const corners = [px(2, 2), px(refW - 3, 2), px(2, refH - 3), px(refW - 3, refH - 3)];
        const refBg = {
          r: Math.round(corners.reduce((a, c) => a + c[0], 0) / 4),
          g: Math.round(corners.reduce((a, c) => a + c[1], 0) / 4),
          b: Math.round(corners.reduce((a, c) => a + c[2], 0) / 4),
        };
        const wholeVessel = resolveWholeVesselBounds(rgba, refW, refH, refBg);
        // A drop shadow can join the bottle and its detached cap into one object
        // on the Photoshop source; measure the bottle alone when it has.
        const vessel = wholeVessel
          ? clipDetachedSidecar(rgba, refW, refH, refBg, wholeVessel) ?? wholeVessel
          : null;
        const measuredRefAspect = vessel && vessel.right > vessel.left
          ? (vessel.bottom - vessel.top + 1) / (vessel.right - vessel.left + 1)
          : null;
        const canonBodyMm = Number(canonicalReadiness?.canonical?.canon_bodyHeightMm ?? NaN);
        const canonWidthMm = Number(canonicalReadiness?.canonical?.canon_widthAxisMm ?? NaN);
        const canonBodyAspect = Number.isFinite(canonBodyMm) && Number.isFinite(canonWidthMm) && canonWidthMm > 0
          ? canonBodyMm / canonWidthMm
          : null;
        if (measuredRefAspect == null) {
          skips.push({ sku, productGroupSlug, reason: "canon police: reference vessel aspect unmeasurable" });
          continue;
        }
        if (canonBodyAspect != null) {
          const ratio = measuredRefAspect / canonBodyAspect;
          if (ratio < 0.97 || ratio > 1.55) {
            skips.push({
              sku,
              productGroupSlug,
              reason: `canon police: reference condemned — vessel aspect ${measuredRefAspect.toFixed(3)} vs canon body ${canonBodyAspect.toFixed(3)} (ratio ${ratio.toFixed(2)}, allowed 0.97–1.55)`,
            });
            continue;
          }
        }
        referenceAspectRatio = measuredRefAspect;
      }
    } catch (referenceError) {
      skips.push({
        sku,
        productGroupSlug,
        reason: `canonical reference inspection failed: ${referenceError instanceof Error ? referenceError.message : String(referenceError)}`,
      });
      continue;
    }

    const productRow = productBySku.get(sku)
      ?? productBySku.get(localHero?.graceSku ?? "")
      ?? productByWebsiteSku.get(websiteSku)
      ?? productByWebsiteSku.get(localHero?.websiteSku ?? "");
    if (!productRow) {
      skips.push({ sku, productGroupSlug, reason: "no Convex product metadata (snapshot join miss)" });
      continue;
    }
    const snapshotProduct = productFromSnapshot(productRow);
    const canonicalProduct = canonicalReadiness
      ? applyRoleAwareCanonicalCylinderGeometry(snapshotProduct, canonicalReadiness)
      : withCanonTruthGeometry(snapshotProduct);
    if (isCylinderCloseoutFamily && !sidecarAuthority) {
      skips.push({ sku, productGroupSlug, reason: "missing reviewed sidecar generation authority" });
      continue;
    }
    const product: BBProduct = {
      ...canonicalProduct,
      capState: sidecarAuthority?.capState ?? snapshotProduct.capState,
      mode: sidecarAuthority?.componentTopology ?? snapshotProduct.mode,
      capOffReferenceId: sidecarAuthority?.capOffReferenceId ?? snapshotProduct.capOffReferenceId,
      topologyReferenceId: sidecarAuthority?.topologyReferenceId ?? resolvedReferenceHash,
      componentTopology: sidecarAuthority?.componentTopology ?? snapshotProduct.componentTopology,
    };

    if (skipTassel && /tassel/i.test(`${product.applicator ?? ""} ${product.itemName ?? ""}`)) {
      skips.push({ sku, productGroupSlug, reason: "tassel deferred (framing fix pending)" });
      continue;
    }

    // Exclude identity-blocked SKUs (same gate the runner enforces per attempt).
    const bodyMaterial = inferBestBottlesBodyMaterial(product);
    const identity = buildBestBottlesGenerationIdentity(product, { bodyMaterial, sourceReference: referenceUrl });
    const identityIssue = getBestBottlesGenerationIdentityIssue(identity);
    if (identityIssue) {
      skips.push({ sku, productGroupSlug, reason: `identity blocked: ${identityIssue}` });
      continue;
    }

    const target = {
      pipelineSkuJobId: job.id,
      sku,
      productGroupSlug,
      referenceUrl,
      referenceHash: resolvedReferenceHash,
      referenceAspectRatio,
      verifiedReference,
      product,
      canonicalReadiness,
      sidecarAuthority,
    };
    const { generationIdentity } = buildBodyForTarget(target);
    if (canSkipRenderedEntry(manifest.entries[sku], generationIdentity)) {
      skips.push({ sku, productGroupSlug, reason: "already-rendered with exact V6.1 generation identity and passing QA" });
      continue;
    }

    // Claim the reference only once a row is accepted. Claiming it on read let a
    // row that was then refused shadow the correct one: the catalog files each
    // frosted Elegant 15 ml twice under one website SKU, a wrong `CLR` row that
    // the identity check rightly blocks and the correct `FRS` row after it,
    // which the duplicate filter above then skipped.
    if (localHero) usedLocalHeroPaths.add(localHero.filePath);
    targets.push(target);
  }

  const leftoverHeroes = [...new Map(
    [...localHeroByKey.values()]
      .filter((hero) => !usedLocalHeroPaths.has(hero.filePath))
      .filter((hero) =>
        !skuFilter
        || skuFilter.has(hero.graceSku)
        || (hero.websiteSku != null && skuFilter.has(hero.websiteSku)),
      )
      .map((hero) => [hero.filePath, hero]),
  ).values()];
  for (const localHero of leftoverHeroes) {
    const productRow = productBySku.get(localHero.graceSku)
      ?? productByWebsiteSku.get(localHero.websiteSku ?? "");
    const productGroupSlug = localHero.productGroupSlug ?? "unknown";
    if (localHero.isBulbOrTassel && !includeBulbTassel) {
      skips.push({ sku: localHero.graceSku, productGroupSlug, reason: "bulb/tassel held for 1536x1024 canvas" });
      continue;
    }
    if (!productRow) {
      skips.push({ sku: localHero.graceSku, productGroupSlug, reason: "no Convex product metadata (snapshot join miss)" });
      continue;
    }
    const matchingJob = ((jobRows ?? []) as SkuJobRow[]).find((job) =>
      job.grace_sku === localHero.graceSku || job.website_sku === localHero.websiteSku,
    );
    const websiteSku = localHero.websiteSku ?? getText(productRow, "websiteSku") ?? "";
    const sku = localHero.graceSku;
    const readinessKey = cylinderProductionIdentityKey(websiteSku, sku);
    const canonicalReadiness = readinessKey
      ? cylinderReadinessByIdentity.get(readinessKey) ?? null
      : null;
    try {
      const referenceBytes = readFileSync(localHero.filePath);
      const image = sharp(referenceBytes, { failOn: "error" });
      const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
      if (!metadata.width || !metadata.height) {
        skips.push({ sku, productGroupSlug, reason: "local hero PNG has no canvas size" });
        continue;
      }
      const verifiedReference = buildLocalHeroVerifiedReference(
        localHero,
        referenceBytes,
        metadata.width,
        metadata.height,
      );
      const canonicalIssue = getBestBottlesCanonicalReferenceIssue(
        verifiedReference.dataUrl,
        { width: metadata.width, height: metadata.height },
        {
          referenceSource: "flattened-product-truth",
          referenceName: path.basename(localHero.filePath),
        },
      );
      if (canonicalIssue) {
        skips.push({ sku, productGroupSlug, reason: `canonical reference blocked: ${canonicalIssue}` });
        continue;
      }
      const alpha = stats.channels.find((channel) => channel.channel === "alpha");
      if (alpha && alpha.min < 255) {
        skips.push({
          sku,
          productGroupSlug,
          reason: "canonical reference blocked: pixel alpha evidence contains transparent or partially transparent pixels",
        });
        continue;
      }
      const snapshotProduct = productFromSnapshot(productRow);
      const canonicalProduct = canonicalReadiness
        ? applyRoleAwareCanonicalCylinderGeometry(snapshotProduct, canonicalReadiness)
        : withCanonTruthGeometry(snapshotProduct);
      const product: BBProduct = {
        ...canonicalProduct,
        capState: verifiedReference.authority.capState,
        mode: verifiedReference.authority.componentTopology,
        capOffReferenceId: verifiedReference.authority.capOffReferenceId,
        topologyReferenceId: verifiedReference.authority.topologyReferenceId,
        componentTopology: verifiedReference.authority.componentTopology,
      };
      const identity = buildBestBottlesGenerationIdentity(product, {
        bodyMaterial: inferBestBottlesBodyMaterial(product),
        sourceReference: verifiedReference.dataUrl,
      });
      const identityIssue = getBestBottlesGenerationIdentityIssue(identity);
      if (identityIssue) {
        skips.push({ sku, productGroupSlug, reason: `identity blocked: ${identityIssue}` });
        continue;
      }
      targets.push({
        pipelineSkuJobId: matchingJob?.id ?? "",
        sku,
        productGroupSlug,
        referenceUrl: verifiedReference.dataUrl,
        referenceHash: verifiedReference.sha256,
        verifiedReference,
        product,
        canonicalReadiness,
        sidecarAuthority: verifiedReference.authority,
      });
    } catch (referenceError) {
      skips.push({
        sku,
        productGroupSlug,
        reason: `canonical reference inspection failed: ${referenceError instanceof Error ? referenceError.message : String(referenceError)}`,
      });
    }
  }

  targets.sort((a, b) => a.sku.localeCompare(b.sku));
  return { targets, skips };
}

function groupCounts<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Concurrency runner (one Playwright page per slot)
// ---------------------------------------------------------------------------
async function runBatch(targets: FamilyTarget[], pages: (Page | null)[]): Promise<void> {
  let cursor = 0;
  let rendered = 0;
  let failed = 0;
  let heldForCohortQa = 0;
  const qaFailuresByGroup = new Map<string, number>();
  const haltedGroups = new Set<string>();
  const total = targets.length;
  const workers = pages.map(async (page) => {
    while (cursor < targets.length) {
      const index = cursor++;
      const target = targets[index];
      if (haltedGroups.has(target.productGroupSlug)) {
        heldForCohortQa += 1;
        console.log(`  ⏸ ${target.sku} held: cohort ${target.productGroupSlug} reached its QA-failure threshold`);
        continue;
      }
      console.log(`[${index + 1}/${total}] ${target.sku} (${target.productGroupSlug}) …`);
      const entry = await generateWithRetry(target, page);
      recordManifest(entry);
      if (entry.status === "rendered") {
        rendered += 1;
        console.log(`  ✓ ${target.sku} → ${entry.imageUrl} (${entry.attempts} attempt(s), ${entry.elapsedMs}ms)`);
      } else {
        failed += 1;
        console.log(`  ✗ ${target.sku} FAILED after ${entry.attempts} attempt(s): ${entry.error}`);
        if (isSystemicQaFailure(entry.error)) {
          const qaFailures = (qaFailuresByGroup.get(target.productGroupSlug) ?? 0) + 1;
          qaFailuresByGroup.set(target.productGroupSlug, qaFailures);
          if (qaFailures >= systemicQaFailureThreshold) {
            haltedGroups.add(target.productGroupSlug);
            console.log(
              `  ⏸ halted cohort ${target.productGroupSlug}: ${qaFailures} systemic QA failures (threshold=${systemicQaFailureThreshold})`,
            );
          }
        }
      }
    }
  });
  await Promise.all(workers);
  console.log(`\nBatch complete: rendered=${rendered} failed=${failed} held-for-cohort-qa=${heldForCohortQa} total=${total}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log(`=== Best Bottles family batch — family="${family}" run=${runId} ===`);
  console.log(`provider=${aiProvider} promptMode=${promptMode} resolution=${resolution} concurrency=${concurrency} maxAttempts=${maxAttempts} systemicQaFailureThreshold=${systemicQaFailureThreshold}`);
  console.log(`manifest: ${path.relative(process.cwd(), manifestPath)}`);
  console.log(`dryRun=${dryRun} limit=${limit ?? "none"} productGroup=${productGroup || "ALL"} skus=${skusArg || "ALL"} referenceFolder=${referenceFolder || "none"} rig=${skipRigPostprocess ? "SKIPPED" : "on"}`);

  const { targets: allTargets, skips } = await resolveTargets();
  if (isCylinderCloseoutFamily && !skuFilter && !productGroup && limit === null) {
    const exactResumeCount = skips.filter((skip) =>
      skip.reason.startsWith("already-rendered with exact V6.1"),
    ).length;
    const resolvedPublicationTargets = allTargets.length + exactResumeCount;
    const expectedProductionTargets = cylinderRoleAwareReadiness
      ? (preset.id === "grid-card-exploded-2000x2200"
        ? cylinderRoleAwareReadiness.summary.pdpCapOffSidecarVerifiedCount
        : cylinderRoleAwareReadiness.summary.identityCapOnVerifiedCount)
      : 0;
    if (resolvedPublicationTargets !== expectedProductionTargets) {
      throw new Error(
        `Full Cylinder V6.1 run resolved ${resolvedPublicationTargets}/${expectedProductionTargets} reviewed sidecar production targets (${allTargets.length} pending, ${exactResumeCount} exact resumable). Refusing a partial family run.`,
      );
    }
  }
  const targets = limit != null ? allTargets.slice(0, limit) : allTargets;

  const perGroup = groupCounts(targets, (t) => t.productGroupSlug);
  const skipReasons = groupCounts(skips, (s) => s.reason.replace(/:.*/, ""));

  console.log(`\n=== RESOLUTION ===`);
  console.log(`ready-to-generate targets : ${targets.length}${limit != null && allTargets.length > targets.length ? ` (of ${allTargets.length}, limited)` : ""}`);
  console.log(`skips                     : ${skips.length}`);
  console.log(`product groups            : ${Object.keys(perGroup).length}`);
  console.log(`\nper-product-group counts:`);
  for (const [group, count] of Object.entries(perGroup).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(3)}  ${group}`);
  }
  console.log(`\nskip reasons:`);
  for (const [reason, count] of Object.entries(skipReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(3)}  ${reason}`);
  }
  if (dryRun || skuFilter) {
    console.log(`\nskip details:`);
    for (const skip of skips) {
      console.log(`  ↷ ${skip.sku}  ${skip.reason}`);
    }
  }

  if (dryRun) {
    // Build the prompt for one sample target to prove canon markers + no cap/vol cues.
    const sample = targets[0];
    if (sample) {
      const { body, finalPrompt } = buildBodyForTarget(sample);
      const hasEnhanceMarker = /You are enhancing the attached product reference image/.test(finalPrompt);
      const framingHeader = promptHeader(finalPrompt);
      const visualTargetReference = body.referenceImages.find(
        (reference) => reference?.label !== "Product Reference",
      ) ?? null;
      const hasVisualTargetBlock = finalPrompt.includes(
        `VISUAL CALIBRATION TARGET — ${BEST_BOTTLES_VISUAL_TARGET_VERSION}`,
      );
      const hasVisualTargetLineage = body.extraLibraryTags.includes(
        `visual-target:${BEST_BOTTLES_VISUAL_TARGET_VERSION}`,
      );
      const hasCompositionSafety = sample.sidecarAuthority?.componentTopology === "fitment-attached-cap-right-sidecar"
        ? /SIDECAR COMPOSITION SAFETY:/.test(finalPrompt)
          && /exactly one matching cap or overcap detached on camera-right/i.test(finalPrompt)
          && /Do not assemble the sidecar onto the bottle, omit it, duplicate it, substitute it/i.test(finalPrompt)
        : /COMPOSITION SAFETY:/.test(finalPrompt)
          && /exactly one finished SKU product/i.test(finalPrompt);
      // Cap/volume cue lines were removed today — assert none survive.
      const capVolumeCue = finalPrompt
        .split("\n")
        .find((line) => /\bcap[- ]?(on|off)\b|\bvolume cue\b|\bfill line\b|\bml of\b/i.test(line)) ?? null;
      console.log(`\n=== SAMPLE PROMPT CHECK (${sample.sku}) ===`);
      console.log(`enhance marker present       : ${hasEnhanceMarker}`);
      console.log(`FRAMING PROFILE block present: ${Boolean(framingHeader)}`);
      if (framingHeader) console.log(`  ${framingHeader.trim()}`);
      console.log(`visual target block present : ${hasVisualTargetBlock}`);
      console.log(`style reference attached    : ${Boolean(visualTargetReference)} (${visualTargetReference?.label ?? "missing"})`);
      console.log(`style reference image id    : ${body.productContext.styleReferenceImageId ?? "MISSING"}`);
      console.log(`style reference surface     : ${body.productContext.styleReferenceSurface ?? "MISSING"} (sha ${String(body.productContext.styleReferenceExportSha256 ?? "MISSING").slice(0, 12)}…)`);
      console.log(`visual target lineage tags  : ${hasVisualTargetLineage}`);
      console.log(`component topology lineage  : ${body.precompiledPromptRecord.qa_checklist.filter((tag) => tag.startsWith("component-topology:")).join(", ") || "missing"}`);
      console.log(`shadow topology lineage     : ${body.precompiledPromptRecord.qa_checklist.filter((tag) => tag.startsWith("shadow-topology:")).join(", ") || "missing"}`);
      console.log(`shadow contact lineage      : ${body.precompiledPromptRecord.qa_checklist.filter((tag) => tag.startsWith("shadow-contact:")).join(", ") || "missing"}`);
      console.log(`shoulder lock present        : ${/SHOULDER LOCK/.test(finalPrompt)}`);
      const glassSpecLine = finalPrompt.split("\n").find((line) => line.includes("GLASS BODY SPECIFICATION"));
      const shoulderLockLine = finalPrompt.split("\n").find((line) => line.startsWith("- SHOULDER LOCK"));
      if (glassSpecLine) console.log(`  ${glassSpecLine.trim()}`);
      if (shoulderLockLine) console.log(`  ${shoulderLockLine.trim()}`);
      console.log(`single-product guard present : ${hasCompositionSafety}`);
      if (!hasCompositionSafety) {
        console.log(`single-product guard evidence: ${finalPrompt.split("\n").filter((line) => /COMPOSITION SAFETY|detached cap|exactly one finished/i.test(line)).join(" | ") || "missing from final prompt"}`);
      }
      console.log(`cap/volume cue line present  : ${capVolumeCue ? `YES → ${capVolumeCue.trim()}` : "no"}`);
      // The checks above sample a few lines. To read what the model is actually told —
      // e.g. whether a frosted SKU carries any clear-glass wording — write it all out.
      const promptDumpPath = process.env.BB_GEN_DUMP_PROMPT?.trim();
      if (promptDumpPath) {
        writeFileSync(path.resolve(promptDumpPath), `${finalPrompt}\n`);
        console.log(`sample prompt written        : ${promptDumpPath}`);
      }
    } else {
      console.log(`\n(no targets resolved — nothing to sample)`);
    }
    console.log(`\nDRY RUN — no generation, no rig, no Supabase writes.`);
    return;
  }

  if (isCylinderCloseoutFamily && skipRigPostprocess) {
    throw new Error("Cylinder V6.1 generation requires geometry and per-contact shadow QA; BB_GEN_SKIP_RIG_POSTPROCESS=1 is not allowed.");
  }

  if (targets.length === 0) {
    console.log(`\nNothing to generate.`);
    return;
  }

  // Real run — persist an initial manifest, then run bounded concurrency.
  persistManifest();

  let browser: Browser | null = null;
  const pages: (Page | null)[] = [];
  try {
    if (!skipRigPostprocess) {
      browser = await chromium.launch({ headless: true });
      for (let i = 0; i < concurrency; i++) {
        const page = await browser.newPage();
        await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded" });
        pages.push(page);
      }
    } else {
      for (let i = 0; i < concurrency; i++) pages.push(null);
    }

    await runBatch(targets, pages);
  } finally {
    await browser?.close();
    if (manifestDirty) persistManifest();
    console.log(`\nManifest written: ${path.relative(process.cwd(), manifestPath)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
