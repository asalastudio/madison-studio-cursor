#!/usr/bin/env tsx
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";

import {
  getSkuJobNextAction,
  type BestBottlesNeedsWorkAction,
  type BestBottlesReferenceSource,
} from "../src/lib/bestBottlesImageCoverage.ts";
import { getBestBottlesCylinderProductTruthReferenceIssue } from "../src/lib/bestBottlesReferenceFilters.ts";
import { getBestBottlesReferenceUrlIssue } from "../src/lib/bestBottlesReferenceValidation.ts";

export interface ReferenceIntakeSkuRow {
  graceSku: string;
  websiteSku: string | null;
  shopifySku?: string | null;
  family: string | null;
  productGroupSlug: string | null;
  productGroupDisplayName: string | null;
  status: string;
  hasReference: boolean;
  bestReferenceCandidatePath: string | null;
  coverageStatus: string | null;
  liveReferenceUrl?: string | null;
  productUrl?: string | null;
}

export interface FirecrawlReferenceScrapePayload {
  markdown?: string | null;
  html?: string | null;
  metadata?: Record<string, unknown> | null;
  links?: unknown;
  [key: string]: unknown;
}

export type FirecrawlScrapePage = (
  url: string,
  row: ReferenceIntakeSkuRow,
) => Promise<FirecrawlReferenceScrapePayload | null>;

export interface FirecrawlReferenceSourceSummary {
  targeted: number;
  attempted: number;
  sourced: number;
  skippedNoApiKey: boolean;
  errors: Array<{ graceSku: string; url: string; message: string }>;
}

export interface FirecrawlReferenceRowsResult {
  rows: ReferenceIntakeSkuRow[];
  summary: FirecrawlReferenceSourceSummary;
}

export interface FirecrawlReferenceSourceOptions {
  enabled?: boolean;
  limit?: number | null;
  skuKeys?: Iterable<string | null | undefined>;
  apiKey?: string | null;
  timeoutMs?: number;
  scrapePage?: FirecrawlScrapePage;
  fetcher?: typeof fetch;
}

export interface ReferenceFileCandidate {
  absolutePath: string;
  relativePath: string;
  extension: string;
  referenceSource: Exclude<BestBottlesReferenceSource, "bestbottles-live" | "manual" | "none">;
  supportedForGeneration: boolean;
  referenceIssue: string | null;
  keys: string[];
}

export type ReferenceMatchKind = "grace-sku" | "website-sku" | "shopify-sku" | "legacy-slug" | "none";

export interface ReferenceIntakePlanRow extends ReferenceIntakeSkuRow {
  referenceSource: BestBottlesReferenceSource;
  referenceSourcePath: string | null;
  referenceSourceUrl: string | null;
  referenceIssue: string | null;
  referenceImportedAt: string | null;
  matchKind: ReferenceMatchKind;
  duplicateCandidateCount: number;
  nextAction: BestBottlesNeedsWorkAction;
}

export interface ReferenceIntakePlan {
  generatedAt: string;
  localRoots: string[];
  missingLocalRoots?: string[];
  summary: ReferenceIntakeSummary;
  rows: ReferenceIntakePlanRow[];
  flatPngSources?: FlatPngIntakeSourceRow[];
  cylinderCanonicalManifest?: CylinderCanonicalStorefrontManifest;
}

export interface ReferenceIntakeSummary {
  totalRows: number;
  localMatches: number;
  liveSiteCandidates: number;
  unresolved: number;
  duplicateCandidates: number;
  supportedLocalMatches: number;
  conversionRequired: number;
  byFamily: Array<{ family: string; total: number; local: number; live: number; unresolved: number }>;
  byNextAction: Record<BestBottlesNeedsWorkAction, number>;
  /** Task 3: flat-PNG readiness matrix (loaded / classified / blocked). */
  flatPngFamilyReadiness?: FlatPngFamilyReadinessSummary;
  /** Task 3: Cylinder canonical storefront-group generation budget. */
  cylinderStorefrontGeneration?: CanonicalStorefrontGenerationBudget;
}

export const CYLINDER_CANONICAL_STOREFRONT_TARGET_COUNT = 47;

export interface CylinderCanonicalStorefrontTarget {
  productGroupId: string;
  family: string;
  capacityMl: number | null;
  color: string | null;
  neckThreadSize: string | null;
  applicator: string | null;
  representativeGraceSku: string;
  representativeWebsiteSku: string | null;
}

export interface CylinderCanonicalStorefrontExclusion {
  productGroupId: string;
  reason: "plastic-cylinder" | "duplicate-tall-cylinder-9ml-clear-13-415";
  representativeGraceSku: string | null;
}

export interface CylinderCanonicalStorefrontManifest {
  sourceGroupCount: number;
  excluded: CylinderCanonicalStorefrontExclusion[];
  targets: CylinderCanonicalStorefrontTarget[];
}

export interface CanonicalStorefrontGenerationBudget {
  totalTargets: number;
  missingRepresentatives: number;
  alreadyGenerated: number;
}

export type FlatPngClassificationStatus = "classified" | "unclassified" | "rejected";

export interface FlatPngIntakeSourceRow {
  absolutePath: string;
  relativePath: string;
  sourceSha256: string;
  family: string | null;
  bodyIdentityKey: string | null;
  physicalFitmentKey: string | null;
  productGroupId: string | null;
  classificationStatus: FlatPngClassificationStatus;
  rejectionReason: string | null;
}

export interface FlatPngFamilyReadinessRow {
  family: string;
  loaded: number;
  classified: number;
  blocked: number;
  rejected: number;
  ready: boolean;
}

export interface FlatPngFamilyReadinessSummary {
  byFamily: FlatPngFamilyReadinessRow[];
  allReady: boolean;
  loaded: number;
  classified: number;
  blocked: number;
  rejected: number;
}

export interface ReferenceLocalRootsReport {
  configuredRoots: string[];
  existingRoots: string[];
  missingRoots: string[];
}

interface CatalogProductGroupSeed {
  productGroupId?: string | null;
  family?: string | null;
  itemName?: string | null;
  graceSku?: string | null;
  websiteSku?: string | null;
  capacityMl?: number | string | null;
  color?: string | null;
  neckThreadSize?: string | null;
  applicator?: string | null;
  capColor?: string | null;
}

interface BuildReferenceIntakePlanParams {
  rows: ReferenceIntakeSkuRow[];
  localRoots: string[];
  generatedAt?: string;
  missingLocalRoots?: string[];
  catalogProducts?: CatalogProductGroupSeed[];
  flatPngRejections?: Array<{ absolutePath?: string; sourceSha256?: string; reason: string }>;
  alreadyGeneratedProductGroupIds?: Iterable<string>;
}

export interface ReferenceIntakeApplySelectionOptions {
  skus?: string[];
  sampleLocal?: number | null;
  sampleWebsite?: number | null;
  limit?: number | null;
}

interface CliReadinessRow {
  status: string;
  issues?: string[];
  graceSku: string;
  websiteSku: string | null;
  productGroupSlug: string;
  productGroupDisplayName: string;
  family: string | null;
  hasReference?: boolean;
  bestReferenceCandidatePath?: string | null;
  coverageStatus?: string | null;
  productUrl?: string | null;
  measurementOverrideUrl?: string | null;
}

interface CliPipelineProduct {
  graceSku: string;
  websiteSku?: string | null;
  shopifySku?: string | null;
  family?: string | null;
  productGroupSlug?: string | null;
  productGroupDisplayName?: string | null;
  bestReferenceCandidatePath?: string | null;
  coverageStatus?: string | null;
  productUrl?: string | null;
}

interface CliAuditRow {
  graceSku: string;
  websiteSku?: string | null;
  liveReferenceUrl?: string | null;
}

interface CliCatalogProduct {
  graceSku: string;
  websiteSku?: string | null;
  imageUrl?: string | null;
  productUrl?: string | null;
}

const BEST_BOTTLES_REPO_ROOT =
  "/Users/jordanrichter/Projects/Clients/Nemat-International/Best-Bottles-Website-02-20-2026";
const DEFAULT_LEGACY_REFERENCE_ROOT = join(
  BEST_BOTTLES_REPO_ROOT,
  "pipeline/aios-shopify-pdp-images/00-input/legacy-reference",
);
const DEFAULT_REFERENCE_FLATTENED_ROOT = join(
  BEST_BOTTLES_REPO_ROOT,
  "pipeline/aios-shopify-pdp-images/00-input/reference-flattened",
);
const DEFAULT_CANONICAL_RENDER_ROOT = join(
  BEST_BOTTLES_REPO_ROOT,
  "pipeline/best-bottles-reference-images-clean/01-transparent-png-candidates",
);
const SUPPORTED_REFERENCE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const IMAGE_REFERENCE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const BEST_BOTTLES_ORIGIN = "https://www.bestbottles.com";
const FIRECRAWL_SCRAPE_ENDPOINT = "https://api.firecrawl.dev/v1/scrape";

export function defaultReferenceLocalRoots(): string[] {
  return [
    DEFAULT_REFERENCE_FLATTENED_ROOT,
    DEFAULT_CANONICAL_RENDER_ROOT,
    DEFAULT_LEGACY_REFERENCE_ROOT,
  ];
}

export function inspectReferenceLocalRoots(roots: string[]): ReferenceLocalRootsReport {
  const configuredRoots = roots.map((root) => resolve(root));
  const existingRoots: string[] = [];
  const missingRoots: string[] = [];
  for (const root of configuredRoots) {
    if (existsSync(root) && statSync(root).isDirectory()) existingRoots.push(root);
    else missingRoots.push(root);
  }
  return { configuredRoots, existingRoots, missingRoots };
}

function normalizedFamily(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function isPlasticCylinderCatalogGroup(rows: CatalogProductGroupSeed[]): boolean {
  return rows.some((row) => /plastic\s+cylinder\s+shaped/i.test(String(row.itemName ?? "")));
}

export function isDuplicateTallCylinder9MlClear13415Group(rows: CatalogProductGroupSeed[]): boolean {
  if (rows.length === 0) return false;
  if (!rows.every((row) => normalizedFamily(row.family) === "tall cylinder")) return false;
  const sample = rows[0];
  const capacity = asFiniteNumber(sample?.capacityMl);
  const color = String(sample?.color ?? "").trim().toLowerCase();
  const neck = String(sample?.neckThreadSize ?? "").trim().toLowerCase().replace(/[.\s_/]+/g, "-");
  return capacity === 9 && color === "clear" && (neck === "13-415" || neck === "13415");
}

export function buildCylinderCanonicalStorefrontManifest(
  products: CatalogProductGroupSeed[],
): CylinderCanonicalStorefrontManifest {
  const byGroup = new Map<string, CatalogProductGroupSeed[]>();
  for (const product of products) {
    const family = normalizedFamily(product.family);
    if (family !== "cylinder" && family !== "tall cylinder") continue;
    const productGroupId = String(product.productGroupId ?? "").trim();
    if (!productGroupId) continue;
    const existing = byGroup.get(productGroupId) ?? [];
    existing.push(product);
    byGroup.set(productGroupId, existing);
  }

  const excluded: CylinderCanonicalStorefrontExclusion[] = [];
  const targets: CylinderCanonicalStorefrontTarget[] = [];

  for (const [productGroupId, rows] of [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sortedRows = [...rows].sort((a, b) =>
      String(a.graceSku ?? "").localeCompare(String(b.graceSku ?? "")),
    );
    const representative = sortedRows[0];
    const representativeGraceSku = String(representative?.graceSku ?? "").trim() || null;

    if (isPlasticCylinderCatalogGroup(rows)) {
      excluded.push({
        productGroupId,
        reason: "plastic-cylinder",
        representativeGraceSku,
      });
      continue;
    }
    if (isDuplicateTallCylinder9MlClear13415Group(rows)) {
      excluded.push({
        productGroupId,
        reason: "duplicate-tall-cylinder-9ml-clear-13-415",
        representativeGraceSku,
      });
      continue;
    }

    if (!representativeGraceSku) {
      throw new Error(`Cylinder product group ${productGroupId} has no representative Grace SKU.`);
    }

    targets.push({
      productGroupId,
      family: String(representative?.family ?? "Cylinder"),
      capacityMl: asFiniteNumber(representative?.capacityMl),
      color: representative?.color == null ? null : String(representative.color),
      neckThreadSize: representative?.neckThreadSize == null ? null : String(representative.neckThreadSize),
      applicator: representative?.applicator == null ? null : String(representative.applicator),
      representativeGraceSku,
      representativeWebsiteSku: representative?.websiteSku == null ? null : String(representative.websiteSku),
    });
  }

  return {
    sourceGroupCount: byGroup.size,
    excluded,
    targets,
  };
}

export function computeCanonicalStorefrontGenerationBudget(
  manifest: CylinderCanonicalStorefrontManifest,
  alreadyGeneratedProductGroupIds: Iterable<string> = [],
): CanonicalStorefrontGenerationBudget {
  const generated = new Set(
    [...alreadyGeneratedProductGroupIds].map((id) => String(id).trim()).filter(Boolean),
  );
  let alreadyGenerated = 0;
  for (const target of manifest.targets) {
    if (generated.has(target.productGroupId)) alreadyGenerated += 1;
  }
  return {
    totalTargets: manifest.targets.length,
    alreadyGenerated,
    missingRepresentatives: Math.max(0, manifest.targets.length - alreadyGenerated),
  };
}

export function dedupeFlatPngSourcesBySha(rows: FlatPngIntakeSourceRow[]): {
  unique: FlatPngIntakeSourceRow[];
  duplicateCount: number;
} {
  const seen = new Map<string, FlatPngIntakeSourceRow>();
  let duplicateCount = 0;
  for (const row of rows) {
    const sha = String(row.sourceSha256 ?? "").toLowerCase();
    if (!sha) continue;
    if (seen.has(sha)) {
      duplicateCount += 1;
      continue;
    }
    seen.set(sha, row);
  }
  return {
    unique: Array.from(seen.values()),
    duplicateCount,
  };
}

export function summarizeFlatPngFamilyReadiness(
  rows: FlatPngIntakeSourceRow[],
): FlatPngFamilyReadinessSummary {
  const byFamily = new Map<string, FlatPngFamilyReadinessRow>();
  let loaded = 0;
  let classified = 0;
  let blocked = 0;
  let rejected = 0;

  for (const row of rows) {
    const family = row.family?.trim() || "(blank)";
    const current = byFamily.get(family) ?? {
      family,
      loaded: 0,
      classified: 0,
      blocked: 0,
      rejected: 0,
      ready: true,
    };
    current.loaded += 1;
    loaded += 1;
    if (row.classificationStatus === "classified") {
      current.classified += 1;
      classified += 1;
    } else if (row.classificationStatus === "rejected") {
      current.rejected += 1;
      rejected += 1;
    } else {
      current.blocked += 1;
      blocked += 1;
    }
    current.ready = current.blocked === 0;
    byFamily.set(family, current);
  }

  const familyRows = Array.from(byFamily.values()).sort(
    (a, b) => b.loaded - a.loaded || a.family.localeCompare(b.family),
  );
  return {
    byFamily: familyRows,
    allReady: familyRows.every((row) => row.ready),
    loaded,
    classified,
    blocked,
    rejected,
  };
}

export function assertFlatPngFamiliesReadyForBulkGeneration(
  readiness: FlatPngFamilyReadinessSummary,
): void {
  if (readiness.allReady) return;
  const blockedFamilies = readiness.byFamily
    .filter((row) => !row.ready)
    .map((row) => `${row.family} (${row.blocked} unclassified)`)
    .join(", ");
  throw new Error(
    `Flat-PNG families are not ready for bulk generation; blocked unclassified rows remain: ${blockedFamilies}`,
  );
}

export function buildBodyIdentityKey(input: {
  family?: string | null;
  capacityMl?: number | string | null;
  color?: string | null;
}): string {
  return [
    safeSegment(input.family),
    asFiniteNumber(input.capacityMl) ?? "unknown",
    safeSegment(input.color),
  ].join("|");
}

function sha256File(absolutePath: string): string {
  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

/**
 * Inventory every flat PNG under the configured roots, hash bytes, and assign
 * family / body / physical-fitment cohorts when an exact SKU key match exists.
 * Unmatched rows stay unclassified (fail-closed) until classified or rejected.
 */
export function buildFlatPngIntakeSourceRows(params: {
  localRoots: string[];
  catalogProducts: CatalogProductGroupSeed[];
  rejections?: Array<{ absolutePath?: string; sourceSha256?: string; reason: string }>;
}): FlatPngIntakeSourceRow[] {
  const candidates = scanReferenceFiles(params.localRoots);
  const catalogByKey = new Map<string, CatalogProductGroupSeed>();
  for (const product of params.catalogProducts) {
    for (const raw of [product.graceSku, product.websiteSku]) {
      const key = normalizeKey(raw);
      if (key && !catalogByKey.has(key)) catalogByKey.set(key, product);
    }
  }
  const rejectionByPath = new Map<string, string>();
  const rejectionBySha = new Map<string, string>();
  for (const rejection of params.rejections ?? []) {
    if (rejection.absolutePath) rejectionByPath.set(resolve(rejection.absolutePath), rejection.reason);
    if (rejection.sourceSha256) rejectionBySha.set(rejection.sourceSha256.toLowerCase(), rejection.reason);
  }

  const rows: FlatPngIntakeSourceRow[] = [];
  for (const candidate of candidates) {
    if (candidate.extension !== ".png") continue;
    const sourceSha256 = sha256File(candidate.absolutePath);
    const explicitRejection =
      rejectionByPath.get(candidate.absolutePath) ??
      rejectionBySha.get(sourceSha256) ??
      null;

    let matched: CatalogProductGroupSeed | null = null;
    for (const key of candidate.keys) {
      const hit = catalogByKey.get(key);
      if (hit) {
        matched = hit;
        break;
      }
    }

    if (explicitRejection) {
      rows.push({
        absolutePath: candidate.absolutePath,
        relativePath: candidate.relativePath,
        sourceSha256,
        family: matched?.family == null ? null : String(matched.family),
        bodyIdentityKey: null,
        physicalFitmentKey: null,
        productGroupId: matched?.productGroupId == null ? null : String(matched.productGroupId),
        classificationStatus: "rejected",
        rejectionReason: explicitRejection,
      });
      continue;
    }

    if (!matched) {
      rows.push({
        absolutePath: candidate.absolutePath,
        relativePath: candidate.relativePath,
        sourceSha256,
        family: null,
        bodyIdentityKey: null,
        physicalFitmentKey: null,
        productGroupId: null,
        classificationStatus: "unclassified",
        rejectionReason: null,
      });
      continue;
    }

    const finishColor = String(
      (matched as { capColor?: string | null }).capColor ??
        matched.color ??
        "unspec",
    );
    rows.push({
      absolutePath: candidate.absolutePath,
      relativePath: candidate.relativePath,
      sourceSha256,
      family: matched.family == null ? null : String(matched.family),
      bodyIdentityKey: buildBodyIdentityKey({
        family: matched.family == null ? null : String(matched.family),
        capacityMl: matched.capacityMl,
        color: matched.color == null ? null : String(matched.color),
      }),
      physicalFitmentKey: [
        safeSegment(matched.neckThreadSize),
        safeSegment(matched.applicator),
        safeSegment(finishColor),
        "assembled-cap-on",
      ].join("|"),
      productGroupId: matched.productGroupId == null ? null : String(matched.productGroupId),
      classificationStatus: "classified",
      rejectionReason: null,
    });
  }
  return rows;
}

function normalizeKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function safeSegment(value: string | null | undefined): string {
  return String(value ?? "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "unknown";
}

export function sourceForPath(filePath: string): ReferenceFileCandidate["referenceSource"] {
  const normalizedPath = filePath.replace(/\\/g, "/");
  if (normalizedPath.includes("/best-bottles-reference-images-clean/")) return "canonical-render";
  if (normalizedPath.includes("/reference-flattened/")) return "flattened-product-truth";
  return "local-legacy";
}

/**
 * Coverage state machine (reference layer). A row that matched a clean canonical
 * reference flips to `covered_canonical`; otherwise we preserve the incoming
 * coverage state. Conservative on purpose: we only PROMOTE rows that gained a
 * clean reference and never demote, so the cutover can't churn unrelated rows.
 */
export function deriveReferenceCoverageStatus(
  matchedReferenceSource: BestBottlesReferenceSource | null | undefined,
  fallbackCoverageStatus: string | null,
): string | null {
  if (matchedReferenceSource === "canonical-render") return "covered_canonical";
  return fallbackCoverageStatus;
}

function referenceIssueForFile(filePath: string): string | null {
  const extension = extname(filePath).toLowerCase();
  if (SUPPORTED_REFERENCE_EXTENSIONS.has(extension)) return null;
  if (extension === ".gif") return "Reference format is unsupported for image edits. Convert GIF to PNG before generation.";
  return "Reference format is unsupported for image edits. Use PNG, JPG, or WebP.";
}

function filenameKeys(filePath: string): string[] {
  const stem = basename(filePath, extname(filePath));
  const parts = stem.split("__").filter(Boolean);
  const keys = new Set<string>([normalizeKey(stem)]);
  for (const part of parts) {
    if (!/^(legacy-reference|pdp-main|v\d+|cap-on)$/i.test(part)) {
      keys.add(normalizeKey(part));
    }
  }
  return Array.from(keys).filter(Boolean);
}

// Internal/scratch dirs in the clean-reference lane that must NOT be treated as
// reference sources: rejected cutouts (_quarantine), QA checkerboard renders
// (_qa-checker), and manifest JSON (_manifests). NOTE: the real transparent PNGs
// live INSIDE dated `_dryrun-*` dumps, so we deliberately do NOT skip every "_"
// dir — only this explicit denylist (plus dotfiles).
const EXCLUDED_REFERENCE_DIR_NAMES = new Set(["_quarantine", "_qa-checker", "_manifests"]);

function isExcludedReferenceDir(name: string): boolean {
  return name.startsWith(".") || EXCLUDED_REFERENCE_DIR_NAMES.has(name);
}

function walkReferenceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const filePath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (isExcludedReferenceDir(entry.name)) continue;
        walk(filePath);
      } else if (entry.isFile() && IMAGE_REFERENCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        out.push(filePath);
      }
    }
  };
  walk(root);
  return out;
}

function scanReferenceFiles(localRoots: string[]): ReferenceFileCandidate[] {
  const candidates: ReferenceFileCandidate[] = [];
  for (const root of localRoots) {
    const resolvedRoot = resolve(root);
    for (const absolutePath of walkReferenceFiles(resolvedRoot)) {
      const extension = extname(absolutePath).toLowerCase();
      candidates.push({
        absolutePath,
        relativePath: relative(resolvedRoot, absolutePath),
        extension,
        referenceSource: sourceForPath(absolutePath),
        supportedForGeneration: SUPPORTED_REFERENCE_EXTENSIONS.has(extension),
        referenceIssue: referenceIssueForFile(absolutePath),
        keys: filenameKeys(absolutePath),
      });
    }
  }
  return candidates;
}

function buildCandidateIndex(candidates: ReferenceFileCandidate[]): Map<string, ReferenceFileCandidate[]> {
  const index = new Map<string, ReferenceFileCandidate[]>();
  for (const candidate of candidates) {
    for (const key of candidate.keys) {
      const existing = index.get(key) ?? [];
      existing.push(candidate);
      index.set(key, existing);
    }
  }
  return index;
}

function rankCandidate(candidate: ReferenceFileCandidate): number {
  let score = 0;
  if (candidate.supportedForGeneration) score += 100;
  // Prefer the clean canonical reference over the opaque legacy renders so a SKU
  // with a clean cutout binds to it (and thus flips to covered_canonical).
  if (candidate.referenceSource === "canonical-render") score += 40;
  else if (candidate.referenceSource === "flattened-product-truth") score += 35;
  else if (candidate.referenceSource === "local-legacy") score += 20;
  if (candidate.relativePath.includes("madison-upload-website-sku-png")) score += 10;
  if (candidate.extension === ".png") score += 5;
  return score;
}

function pickCandidate(candidates: ReferenceFileCandidate[]): ReferenceFileCandidate {
  return [...candidates].sort((a, b) => {
    const scoreDelta = rankCandidate(b) - rankCandidate(a);
    if (scoreDelta !== 0) return scoreDelta;
    return a.absolutePath.localeCompare(b.absolutePath);
  })[0];
}

function isCylinderReferenceRow(row: ReferenceIntakeSkuRow): boolean {
  return (
    /cylinder/i.test(row.family ?? "") ||
    /cylinder/i.test(row.productGroupSlug ?? "") ||
    /cylinder/i.test(row.productGroupDisplayName ?? "")
  );
}

function isRetiredCylinderReferenceCandidate(
  row: ReferenceIntakeSkuRow,
  candidate: ReferenceFileCandidate,
): boolean {
  if (!isCylinderReferenceRow(row)) return false;
  return getBestBottlesCylinderProductTruthReferenceIssue([
    candidate.absolutePath,
    candidate.relativePath,
    candidate.keys,
    candidate.referenceSource,
  ]) !== null;
}

function findLocalMatch(
  row: ReferenceIntakeSkuRow,
  index: Map<string, ReferenceFileCandidate[]>,
): { candidate: ReferenceFileCandidate; matchKind: ReferenceMatchKind; duplicateCandidateCount: number } | null {
  const probes: Array<{ key: string; matchKind: ReferenceMatchKind }> = [
    { key: normalizeKey(row.graceSku), matchKind: "grace-sku" },
    { key: normalizeKey(row.websiteSku), matchKind: "website-sku" },
    { key: normalizeKey(row.shopifySku), matchKind: "shopify-sku" },
  ].filter((probe) => probe.key);

  for (const probe of probes) {
    const candidates = (index.get(probe.key) ?? []).filter(
      (candidate) => !isRetiredCylinderReferenceCandidate(row, candidate),
    );
    if (probe.matchKind !== "grace-sku" && candidates.length > 1) {
      continue;
    }
    if (candidates.length > 0) {
      return {
        candidate: pickCandidate(candidates),
        matchKind: probe.matchKind,
        duplicateCandidateCount: candidates.length > 1 ? candidates.length : 0,
      };
    }
  }
  return null;
}

function rowNeedsReference(row: ReferenceIntakeSkuRow): boolean {
  const referencePath = row.bestReferenceCandidatePath?.trim() ?? "";
  const needsPublicImport =
    Boolean(referencePath) &&
    getBestBottlesReferenceUrlIssue(referencePath) !== null &&
    !/^https?:\/\//i.test(referencePath);

  return (
    row.status === "needs-reference" ||
    row.coverageStatus === "missing_local_reference_image" ||
    row.coverageStatus === "covered_needs_canonical_copy" ||
    row.hasReference === false ||
    !referencePath ||
    needsPublicImport
  );
}

function toBestBottlesAbsoluteUrl(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text, BEST_BOTTLES_ORIGIN);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.hostname !== "bestbottles.com" && !url.hostname.endsWith(".bestbottles.com")) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function buildFirecrawlReferenceSourceUrls(row: ReferenceIntakeSkuRow): string[] {
  const urls = new Set<string>();
  const productUrl = toBestBottlesAbsoluteUrl(row.productUrl);
  if (productUrl) urls.add(productUrl);

  for (const query of [row.websiteSku, row.graceSku, row.shopifySku]) {
    const trimmed = query?.trim();
    if (!trimmed) continue;
    urls.add(`${BEST_BOTTLES_ORIGIN}/search?q=${encodeURIComponent(trimmed)}`);
  }

  return Array.from(urls);
}

function collectStringLeaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringLeaves(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStringLeaves(item, out);
  }
  return out;
}

function cleanupImageCandidateUrl(value: string): string {
  return value
    .trim()
    .replace(/^["'([{]+/, "")
    .replace(/["')\]},.;:]+$/, "");
}

function addImageCandidate(value: string, out: Set<string>): void {
  const cleaned = cleanupImageCandidateUrl(value);
  if (!cleaned) return;
  const absolute = toBestBottlesAbsoluteUrl(cleaned);
  if (!absolute) return;
  const extension = extname(new URL(absolute).pathname).toLowerCase();
  if (!IMAGE_REFERENCE_EXTENSIONS.has(extension)) return;
  out.add(absolute);
}

function extractImageUrlsFromText(text: string): string[] {
  const urls = new Set<string>();
  const absoluteImageUrlPattern = /https?:\/\/[^\s"'<>()[\]]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>()[\]]*)?/gi;
  const quotedImagePathPattern = /(?:src|href|content)=["']([^"']+\.(?:png|jpe?g|webp|gif)(?:\?[^"']*)?)["']/gi;
  const markdownImagePattern = /!\[[^\]]*]\(([^)\s]+\.(?:png|jpe?g|webp|gif)(?:\?[^)]*)?)\)/gi;

  for (const pattern of [absoluteImageUrlPattern, quotedImagePathPattern, markdownImagePattern]) {
    for (const match of text.matchAll(pattern)) {
      addImageCandidate(match[1] ?? match[0], urls);
    }
  }

  return Array.from(urls);
}

function hasSkuEvidence(row: ReferenceIntakeSkuRow, text: string): boolean {
  const normalizedText = normalizeKey(text);
  return [row.graceSku, row.websiteSku, row.shopifySku]
    .map(normalizeKey)
    .filter(Boolean)
    .some((key) => normalizedText.includes(key));
}

function referenceRowMatchesSkuKeys(row: ReferenceIntakeSkuRow, skuKeys: Set<string>): boolean {
  if (skuKeys.size === 0) return true;
  return [row.graceSku, row.websiteSku, row.shopifySku]
    .map(normalizeKey)
    .filter(Boolean)
    .some((key) => skuKeys.has(key));
}

function scoreFirecrawlImageUrl(row: ReferenceIntakeSkuRow, imageUrl: string): number {
  const normalizedUrl = normalizeKey(decodeURIComponent(imageUrl));
  let score = 0;
  const websiteSku = normalizeKey(row.websiteSku);
  const shopifySku = normalizeKey(row.shopifySku);
  const graceSku = normalizeKey(row.graceSku);
  if (websiteSku && normalizedUrl.includes(websiteSku)) score += 1000;
  if (shopifySku && normalizedUrl.includes(shopifySku)) score += 800;
  if (graceSku && normalizedUrl.includes(graceSku)) score += 600;
  if (/\/enlarged_pics\//i.test(imageUrl)) score += 200;
  if (/\/images\/store\//i.test(imageUrl)) score += 100;
  const extension = extname(new URL(imageUrl).pathname).toLowerCase();
  if (SUPPORTED_REFERENCE_EXTENSIONS.has(extension)) score += 20;
  if (extension === ".gif") score += 10;
  return score;
}

export function pickFirecrawlReferenceImageUrl(
  row: ReferenceIntakeSkuRow,
  payload: FirecrawlReferenceScrapePayload,
): string | null {
  const text = collectStringLeaves(payload).join("\n");
  if (!hasSkuEvidence(row, text)) return null;

  const ranked = extractImageUrlsFromText(text)
    .map((url) => ({ url, score: scoreFirecrawlImageUrl(row, url) }))
    .filter((candidate) => candidate.score >= 100)
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  return ranked[0]?.url ?? null;
}

function unwrapFirecrawlPayload(payload: unknown): FirecrawlReferenceScrapePayload | null {
  if (!payload || typeof payload !== "object") return null;
  const objectPayload = payload as Record<string, unknown>;
  if (objectPayload.data && typeof objectPayload.data === "object") {
    return objectPayload.data as FirecrawlReferenceScrapePayload;
  }
  return objectPayload as FirecrawlReferenceScrapePayload;
}

async function scrapeBestBottlesPageWithFirecrawl(params: {
  url: string;
  apiKey: string;
  timeoutMs: number;
  fetcher: typeof fetch;
}): Promise<FirecrawlReferenceScrapePayload | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const response = await params.fetcher(FIRECRAWL_SCRAPE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: params.url,
        formats: ["markdown", "html"],
        onlyMainContent: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Firecrawl HTTP ${response.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
    }
    return unwrapFirecrawlPayload(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

export async function sourceReferenceRowsWithFirecrawl(
  rows: ReferenceIntakeSkuRow[],
  options: FirecrawlReferenceSourceOptions = {},
): Promise<FirecrawlReferenceRowsResult> {
  const summary: FirecrawlReferenceSourceSummary = {
    targeted: 0,
    attempted: 0,
    sourced: 0,
    skippedNoApiKey: false,
    errors: [],
  };
  const enabled = options.enabled ?? true;
  if (!enabled) return { rows, summary };

  const skuKeys = new Set(Array.from(options.skuKeys ?? []).map(normalizeKey).filter(Boolean));
  const targets = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => rowNeedsReference(row) && !row.liveReferenceUrl?.trim() && referenceRowMatchesSkuKeys(row, skuKeys));
  summary.targeted = targets.length;
  if (targets.length === 0) return { rows, summary };

  const limit = Math.max(0, options.limit ?? targets.length);
  const selectedTargets = targets.slice(0, limit);
  if (selectedTargets.length === 0) return { rows, summary };

  const apiKey = options.apiKey ?? process.env.FIRECRAWL_API_KEY ?? process.env.FIRECRAWL_KEY ?? null;
  const scrapePage =
    options.scrapePage ??
    (apiKey
      ? ((url: string) =>
          scrapeBestBottlesPageWithFirecrawl({
            url,
            apiKey,
            timeoutMs: Math.max(1000, options.timeoutMs ?? 15000),
            fetcher: options.fetcher ?? fetch,
          }))
      : null);

  if (!scrapePage) {
    summary.skippedNoApiKey = true;
    return { rows, summary };
  }

  const nextRows = [...rows];
  for (const { row, index } of selectedTargets) {
    for (const url of buildFirecrawlReferenceSourceUrls(row)) {
      summary.attempted += 1;
      try {
        const payload = await scrapePage(url, row);
        const referenceUrl = payload ? pickFirecrawlReferenceImageUrl(row, payload) : null;
        if (!referenceUrl) continue;
        nextRows[index] = {
          ...row,
          liveReferenceUrl: referenceUrl,
        };
        summary.sourced += 1;
        break;
      } catch (error) {
        summary.errors.push({
          graceSku: row.graceSku,
          url,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { rows: nextRows, summary };
}

function toPlanRow(
  row: ReferenceIntakeSkuRow,
  match: ReturnType<typeof findLocalMatch>,
): ReferenceIntakePlanRow {
  let referenceSource: BestBottlesReferenceSource = "none";
  let referenceSourcePath: string | null = null;
  let referenceSourceUrl: string | null = null;
  let referenceIssue: string | null = null;
  let matchKind: ReferenceMatchKind = "none";
  let duplicateCandidateCount = 0;

  if (match) {
    referenceSource = match.candidate.referenceSource;
    referenceSourcePath = match.candidate.absolutePath;
    referenceIssue = match.candidate.referenceIssue;
    matchKind = match.matchKind;
    duplicateCandidateCount = match.duplicateCandidateCount;
  } else if (row.liveReferenceUrl) {
    referenceSource = "bestbottles-live";
    referenceSourceUrl = row.liveReferenceUrl;
  }

  const coverageStatus = deriveReferenceCoverageStatus(referenceSource, row.coverageStatus);

  const nextAction = getSkuJobNextAction({
    status: row.status,
    bestReferenceCandidatePath: row.bestReferenceCandidatePath,
    coverageStatus,
    referenceSource,
    referenceSourcePath,
    referenceSourceUrl,
    referenceIssue,
  });

  return {
    ...row,
    coverageStatus,
    referenceSource,
    referenceSourcePath,
    referenceSourceUrl,
    referenceIssue,
    referenceImportedAt: null,
    matchKind,
    duplicateCandidateCount,
    nextAction,
  };
}

export function buildReferenceIntakePlan(params: BuildReferenceIntakePlanParams): ReferenceIntakePlan {
  const candidates = scanReferenceFiles(params.localRoots);
  const index = buildCandidateIndex(candidates);
  const rows = params.rows
    .filter(rowNeedsReference)
    .map((row) => toPlanRow(row, findLocalMatch(row, index)));
  const summary = summarizeReferenceIntake(rows);

  let flatPngSources: FlatPngIntakeSourceRow[] | undefined;
  let cylinderCanonicalManifest: CylinderCanonicalStorefrontManifest | undefined;
  if (params.catalogProducts) {
    const rawFlat = buildFlatPngIntakeSourceRows({
      localRoots: params.localRoots,
      catalogProducts: params.catalogProducts,
      rejections: params.flatPngRejections,
    });
    const deduped = dedupeFlatPngSourcesBySha(rawFlat);
    flatPngSources = deduped.unique;
    summary.flatPngFamilyReadiness = summarizeFlatPngFamilyReadiness(flatPngSources);
    // Surface SHA duplicates on the SKU-intake duplicate counter when present.
    if (deduped.duplicateCount > 0) {
      summary.duplicateCandidates += deduped.duplicateCount;
    }

    cylinderCanonicalManifest = buildCylinderCanonicalStorefrontManifest(params.catalogProducts);
    summary.cylinderStorefrontGeneration = computeCanonicalStorefrontGenerationBudget(
      cylinderCanonicalManifest,
      params.alreadyGeneratedProductGroupIds ?? [],
    );
  }

  return {
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    localRoots: params.localRoots.map((root) => resolve(root)),
    missingLocalRoots: (params.missingLocalRoots ?? []).map((root) => resolve(root)),
    summary,
    rows,
    flatPngSources,
    cylinderCanonicalManifest,
  };
}

export function summarizeReferenceIntake(rows: ReferenceIntakePlanRow[]): ReferenceIntakeSummary {
  const byNextAction = {
    "import-local-reference": 0,
    "source-website-reference": 0,
    "generate-image": 0,
    "review-generated": 0,
    "push-to-shopify": 0,
    "sync-convex": 0,
    "needs-source-match": 0,
    complete: 0,
  } satisfies Record<BestBottlesNeedsWorkAction, number>;
  const familyCounts = new Map<string, { family: string; total: number; local: number; live: number; unresolved: number }>();

  let localMatches = 0;
  let liveSiteCandidates = 0;
  let unresolved = 0;
  let duplicateCandidates = 0;
  let supportedLocalMatches = 0;
  let conversionRequired = 0;

  for (const row of rows) {
    byNextAction[row.nextAction] += 1;
    if (
      row.referenceSource === "local-legacy" ||
      row.referenceSource === "flattened-product-truth" ||
      row.referenceSource === "canonical-render"
    ) {
      localMatches += 1;
      if (row.referenceIssue) conversionRequired += 1;
      else supportedLocalMatches += 1;
    } else if (row.referenceSource === "bestbottles-live") {
      liveSiteCandidates += 1;
    } else if (row.referenceSource === "none") {
      unresolved += 1;
    }
    if (row.duplicateCandidateCount > 0) duplicateCandidates += 1;

    const family = row.family?.trim() || "(blank)";
    const counts = familyCounts.get(family) ?? { family, total: 0, local: 0, live: 0, unresolved: 0 };
    counts.total += 1;
    if (
      row.referenceSource === "local-legacy" ||
      row.referenceSource === "flattened-product-truth" ||
      row.referenceSource === "canonical-render"
    ) counts.local += 1;
    else if (row.referenceSource === "bestbottles-live") counts.live += 1;
    else if (row.referenceSource === "none") counts.unresolved += 1;
    familyCounts.set(family, counts);
  }

  return {
    totalRows: rows.length,
    localMatches,
    liveSiteCandidates,
    unresolved,
    duplicateCandidates,
    supportedLocalMatches,
    conversionRequired,
    byFamily: Array.from(familyCounts.values()).sort((a, b) => b.total - a.total || a.family.localeCompare(b.family)),
    byNextAction,
  };
}

function isApplyableReferenceRow(row: ReferenceIntakePlanRow): boolean {
  return row.nextAction === "import-local-reference" || row.nextAction === "source-website-reference";
}

function rowMatchesSku(row: ReferenceIntakePlanRow, skuKeys: Set<string>): boolean {
  return [row.graceSku, row.websiteSku, row.shopifySku]
    .map(normalizeKey)
    .filter(Boolean)
    .some((key) => skuKeys.has(key));
}

export function selectReferenceIntakeApplyRows(
  rows: ReferenceIntakePlanRow[],
  options: ReferenceIntakeApplySelectionOptions = {},
): ReferenceIntakePlanRow[] {
  const limit = Math.max(0, options.limit ?? Number.POSITIVE_INFINITY);
  const importableRows = rows.filter(isApplyableReferenceRow);
  const skuKeys = new Set((options.skus ?? []).map(normalizeKey).filter(Boolean));

  if (skuKeys.size > 0) {
    return importableRows.filter((row) => rowMatchesSku(row, skuKeys)).slice(0, limit);
  }

  const sampleLocal = options.sampleLocal ?? null;
  const sampleWebsite = options.sampleWebsite ?? null;
  if (sampleLocal != null || sampleWebsite != null) {
    const selected: ReferenceIntakePlanRow[] = [];
    if ((sampleLocal ?? 0) > 0) {
      selected.push(
        ...importableRows
          .filter((row) => row.nextAction === "import-local-reference")
          .slice(0, sampleLocal ?? 0),
      );
    }
    if ((sampleWebsite ?? 0) > 0) {
      selected.push(
        ...importableRows
          .filter((row) => row.nextAction === "source-website-reference")
          .slice(0, sampleWebsite ?? 0),
      );
    }
    return selected.slice(0, limit);
  }

  return importableRows.slice(0, limit);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function optionalLiveReferenceBySku(auditPath: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!auditPath || !existsSync(auditPath)) return map;
  const payload = readJson<{ rows?: CliAuditRow[] }>(auditPath);
  for (const row of payload.rows ?? []) {
    if (!row.liveReferenceUrl) continue;
    for (const key of [row.graceSku, row.websiteSku].map(normalizeKey).filter(Boolean)) {
      map.set(key, row.liveReferenceUrl);
    }
  }
  return map;
}

function optionalCatalogReferenceBySku(catalogPath: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!catalogPath || !existsSync(catalogPath)) return map;
  const payload = readJson<{ products?: CliCatalogProduct[] }>(catalogPath);
  for (const product of payload.products ?? []) {
    if (!product.imageUrl) continue;
    for (const key of [product.graceSku, product.websiteSku].map(normalizeKey).filter(Boolean)) {
      map.set(key, product.imageUrl);
    }
  }
  return map;
}

export function buildRowsFromCliInputs(params: {
  readinessPath: string;
  pipelinePath: string;
  liveAuditPath: string | null;
  catalogPath?: string | null;
}): ReferenceIntakeSkuRow[] {
  const readiness = readJson<{ rows?: CliReadinessRow[] }>(params.readinessPath);
  const pipeline = readJson<{ products?: CliPipelineProduct[] }>(params.pipelinePath);
  const pipelineBySku = new Map<string, CliPipelineProduct>();
  for (const product of pipeline.products ?? []) {
    pipelineBySku.set(normalizeKey(product.graceSku), product);
    if (product.websiteSku) pipelineBySku.set(normalizeKey(product.websiteSku), product);
  }
  const liveReferenceBySku = optionalLiveReferenceBySku(params.liveAuditPath);
  const catalogReferenceBySku = optionalCatalogReferenceBySku(params.catalogPath ?? null);

  return (readiness.rows ?? []).map((row): ReferenceIntakeSkuRow => {
    const pipelineProduct =
      pipelineBySku.get(normalizeKey(row.graceSku)) ??
      pipelineBySku.get(normalizeKey(row.websiteSku));
    const liveReferenceUrl =
      liveReferenceBySku.get(normalizeKey(row.graceSku)) ??
      liveReferenceBySku.get(normalizeKey(row.websiteSku)) ??
      catalogReferenceBySku.get(normalizeKey(row.graceSku)) ??
      catalogReferenceBySku.get(normalizeKey(row.websiteSku)) ??
      null;
    return {
      graceSku: row.graceSku,
      websiteSku: row.websiteSku ?? pipelineProduct?.websiteSku ?? null,
      shopifySku: pipelineProduct?.shopifySku ?? null,
      family: row.family ?? pipelineProduct?.family ?? null,
      productGroupSlug: row.productGroupSlug ?? pipelineProduct?.productGroupSlug ?? null,
      productGroupDisplayName: row.productGroupDisplayName ?? pipelineProduct?.productGroupDisplayName ?? null,
      status: row.status,
      hasReference: Boolean(row.hasReference),
      bestReferenceCandidatePath: row.bestReferenceCandidatePath ?? pipelineProduct?.bestReferenceCandidatePath ?? null,
      coverageStatus: row.coverageStatus ?? pipelineProduct?.coverageStatus ?? null,
      liveReferenceUrl,
      productUrl: row.productUrl ?? row.measurementOverrideUrl ?? pipelineProduct?.productUrl ?? null,
    };
  });
}

function planToCsv(rows: ReferenceIntakePlanRow[]): string {
  const headers: Array<keyof ReferenceIntakePlanRow> = [
    "graceSku",
    "websiteSku",
    "shopifySku",
    "family",
    "productGroupSlug",
    "status",
    "coverageStatus",
    "referenceSource",
    "referenceSourcePath",
    "referenceSourceUrl",
    "referenceIssue",
    "matchKind",
    "duplicateCandidateCount",
    "nextAction",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

function writePlanOutputs(plan: ReferenceIntakePlan, outJson: string, publicOutJson: string, outCsv: string): void {
  for (const filePath of [outJson, publicOutJson, outCsv]) {
    mkdirSync(dirname(filePath), { recursive: true });
  }
  writeFileSync(outJson, JSON.stringify(plan, null, 2) + "\n");
  writeFileSync(publicOutJson, JSON.stringify(plan, null, 2) + "\n");
  writeFileSync(outCsv, planToCsv(plan.rows) + "\n");
}

export function buildReferenceUploadStoragePath(row: ReferenceIntakePlanRow, extension: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return [
    "best-bottles",
    "reference-intake",
    safeSegment(row.family),
    `${safeSegment(row.graceSku)}_${stamp}${extension}`,
  ].join("/");
}

export function buildReferenceIntakeUpdatePayload(params: {
  row: ReferenceIntakePlanRow;
  publicUrl: string;
  existingStatus: string;
  importedAt: string;
  includeMetadataColumns: boolean;
}): Record<string, string | null> {
  const nextStatus = params.existingStatus === "needs-reference" ? "ready-to-generate" : params.existingStatus;
  const payload: Record<string, string | null> = {
    best_reference_candidate_path: params.publicUrl,
    coverage_status: "covered_canonical",
    status: nextStatus,
    last_error: null,
  };

  if (params.includeMetadataColumns) {
    payload.reference_source = params.row.referenceSource;
    payload.reference_source_path = params.row.referenceSourcePath;
    payload.reference_source_url = params.row.referenceSourceUrl;
    payload.reference_imported_at = params.importedAt;
    payload.reference_issue = null;
  }

  return payload;
}

async function readPreparedReference(row: ReferenceIntakePlanRow): Promise<{ buffer: Buffer; extension: string; contentType: string }> {
  if (row.referenceSourcePath) {
    const input = readFileSync(row.referenceSourcePath);
    const extension = extname(row.referenceSourcePath).toLowerCase();
    if (SUPPORTED_REFERENCE_EXTENSIONS.has(extension)) {
      return {
        buffer: input,
        extension,
        contentType:
          extension === ".webp"
            ? "image/webp"
            : extension === ".jpg" || extension === ".jpeg"
              ? "image/jpeg"
              : "image/png",
      };
    }
    const png = await sharp(input, { animated: false })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer();
    return { buffer: png, extension: ".png", contentType: "image/png" };
  }

  if (row.referenceSourceUrl) {
    const response = await fetch(row.referenceSourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (BestBottles internal reference intake)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${row.referenceSourceUrl}`);
    const input = Buffer.from(await response.arrayBuffer());
    const urlExtension = extname(new URL(row.referenceSourceUrl).pathname).toLowerCase();
    if (SUPPORTED_REFERENCE_EXTENSIONS.has(urlExtension)) {
      return {
        buffer: input,
        extension: urlExtension,
        contentType:
          urlExtension === ".webp"
            ? "image/webp"
            : urlExtension === ".jpg" || urlExtension === ".jpeg"
              ? "image/jpeg"
              : "image/png",
      };
    }
    const png = await sharp(input, { animated: false })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer();
    return { buffer: png, extension: ".png", contentType: "image/png" };
  }

  throw new Error(`No reference source for ${row.graceSku}`);
}

export function isMissingReferenceMetadataColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(
    (error?.code === "42703" || error?.code === "PGRST204") &&
      /reference_(source|source_path|source_url|imported_at|issue)/i.test(error.message ?? ""),
  );
}

async function applyReferenceIntake(
  plan: ReferenceIntakePlan,
  params: { organizationId: string } & ReferenceIntakeApplySelectionOptions,
): Promise<void> {
  if (plan.summary.flatPngFamilyReadiness) {
    assertFlatPngFamiliesReadyForBulkGeneration(plan.summary.flatPngFamilyReadiness);
  } else {
    throw new Error(
      "Flat-PNG family readiness is missing; refuse --apply until the intake manifest includes a 100% classified (or explicitly rejected) flat-PNG inventory.",
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --apply.");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const rows = selectReferenceIntakeApplyRows(plan.rows, params);

  let completed = 0;
  console.log(
    `[reference-intake] applying ${rows.length} reference${rows.length === 1 ? "" : "s"} ` +
      `(${rows.filter((row) => row.nextAction === "import-local-reference").length} local, ` +
      `${rows.filter((row) => row.nextAction === "source-website-reference").length} website)`,
  );
  for (const row of rows) {
    const prepared = await readPreparedReference(row);
    const storagePath = buildReferenceUploadStoragePath(row, prepared.extension);
    const { error: uploadError } = await supabase.storage
      .from("generated-images")
      .upload(storagePath, prepared.buffer, {
        cacheControl: "3600",
        upsert: false,
        contentType: prepared.contentType,
      });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage.from("generated-images").getPublicUrl(storagePath);
    if (!urlData?.publicUrl) throw new Error(`No public URL returned for ${row.graceSku}`);

    const { data: existing, error: lookupError } = await supabase
      .from("best_bottles_pipeline_sku_jobs")
      .select("id,status")
      .eq("organization_id", params.organizationId)
      .eq("grace_sku", row.graceSku)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) {
      console.warn(`[reference-intake] no SKU job for ${row.graceSku}; uploaded but did not update row`);
      continue;
    }
    const importedAt = new Date().toISOString();
    const updateWithMetadata = buildReferenceIntakeUpdatePayload({
      row,
      publicUrl: urlData.publicUrl,
      existingStatus: existing.status,
      importedAt,
      includeMetadataColumns: true,
    });
    const updateWithoutMetadata = buildReferenceIntakeUpdatePayload({
      row,
      publicUrl: urlData.publicUrl,
      existingStatus: existing.status,
      importedAt,
      includeMetadataColumns: false,
    });
    const { error: updateError } = await supabase
      .from("best_bottles_pipeline_sku_jobs")
      .update(updateWithMetadata)
      .eq("id", existing.id);
    if (updateError) {
      if (!isMissingReferenceMetadataColumn(updateError)) throw updateError;
      const { error: retryError } = await supabase
        .from("best_bottles_pipeline_sku_jobs")
        .update(updateWithoutMetadata)
        .eq("id", existing.id);
      if (retryError) throw retryError;
      console.warn("[reference-intake] metadata columns missing; updated legacy SKU job fields only");
    }
    completed += 1;
    console.log(`[reference-intake] ${completed}/${rows.length} imported ${row.graceSku}`);
  }
  console.log(`[reference-intake] imported ${completed}/${rows.length} references`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      readiness: { type: "string", default: "public/data/best-bottles-generation-readiness.json" },
      pipeline: { type: "string", default: "public/data/best-bottles-madison-pipeline-ui.json" },
      catalog: { type: "string", default: "public/data/best-bottles-catalog-lite.json" },
      "live-audit": { type: "string", default: "tmp/best-bottles-reference-backed-cap-on-all-audit.json" },
      "local-root": { type: "string", multiple: true, default: defaultReferenceLocalRoots() },
      "out-json": { type: "string", default: "tmp/best-bottles-reference-intake.json" },
      "public-out-json": { type: "string", default: "public/data/best-bottles-reference-intake.json" },
      "out-csv": { type: "string", default: "tmp/best-bottles-reference-intake.csv" },
      apply: { type: "boolean", default: false },
      "organization-id": { type: "string" },
      sku: { type: "string", multiple: true, default: [] },
      "sample-local": { type: "string" },
      "sample-website": { type: "string" },
      limit: { type: "string", default: "10000" },
      firecrawl: { type: "boolean", default: true },
      "no-firecrawl": { type: "boolean", default: false },
      "firecrawl-limit": { type: "string", default: "50" },
      "firecrawl-timeout-ms": { type: "string", default: "15000" },
    },
  });

  const configuredLocalRoots = values["local-root"] as string[];
  const rootReport = inspectReferenceLocalRoots(configuredLocalRoots);
  const localRoots = rootReport.existingRoots;
  if (rootReport.missingRoots.length > 0) {
    console.warn(
      `[reference-intake] missing flat-PNG roots (${rootReport.missingRoots.length}):\n` +
        rootReport.missingRoots.map((root) => `  - ${root}`).join("\n"),
    );
  }

  const catalogPath = values.catalog ? resolve(values.catalog as string) : null;
  let catalogProducts: CatalogProductGroupSeed[] = [];
  if (catalogPath && existsSync(catalogPath)) {
    const catalogJson = JSON.parse(readFileSync(catalogPath, "utf8")) as {
      products?: CatalogProductGroupSeed[];
    };
    catalogProducts = Array.isArray(catalogJson.products) ? catalogJson.products : [];
  }

  const rows = buildRowsFromCliInputs({
    readinessPath: resolve(values.readiness as string),
    pipelinePath: resolve(values.pipeline as string),
    liveAuditPath: values["live-audit"] ? resolve(values["live-audit"] as string) : null,
    catalogPath,
  });
  const planOptions = {
    localRoots,
    missingLocalRoots: rootReport.missingRoots,
    catalogProducts: catalogProducts.length > 0 ? catalogProducts : undefined,
  };
  const initialPlan = buildReferenceIntakePlan({ rows, ...planOptions });
  const selectedSkuKeys = new Set((values.sku as string[]).map(normalizeKey).filter(Boolean));
  const firecrawlSkuKeys = new Set<string>();
  for (const row of initialPlan.rows) {
    if (row.nextAction !== "needs-source-match") continue;
    if (selectedSkuKeys.size > 0 && !rowMatchesSku(row, selectedSkuKeys)) continue;
    for (const key of [row.graceSku, row.websiteSku, row.shopifySku].map(normalizeKey).filter(Boolean)) {
      firecrawlSkuKeys.add(key);
    }
  }
  let firecrawlResult: FirecrawlReferenceRowsResult = {
    rows,
    summary: {
      targeted: 0,
      attempted: 0,
      sourced: 0,
      skippedNoApiKey: false,
      errors: [],
    },
  };
  // Dry-run default: no Firecrawl provider spend unless --firecrawl is left on
  // AND --apply is requested. Explicit --no-firecrawl always wins.
  const allowFirecrawl =
    Boolean(values.apply) && Boolean(values.firecrawl) && !Boolean(values["no-firecrawl"]);
  if (firecrawlSkuKeys.size > 0 && allowFirecrawl) {
    firecrawlResult = await sourceReferenceRowsWithFirecrawl(rows, {
      enabled: true,
      skuKeys: firecrawlSkuKeys,
      limit: Math.max(0, Number.parseInt(values["firecrawl-limit"] as string, 10) || 0),
      timeoutMs: Math.max(1000, Number.parseInt(values["firecrawl-timeout-ms"] as string, 10) || 15000),
    });
  } else if (firecrawlSkuKeys.size > 0 && !allowFirecrawl) {
    console.log(
      `[reference-intake] dry-run: skipped Firecrawl for ${firecrawlSkuKeys.size} unresolved SKU key(s); no provider spend`,
    );
  }
  const plan = buildReferenceIntakePlan({ rows: firecrawlResult.rows, ...planOptions });
  writePlanOutputs(
    plan,
    resolve(values["out-json"] as string),
    resolve(values["public-out-json"] as string),
    resolve(values["out-csv"] as string),
  );

  console.log(
    [
      `Reference intake rows: ${plan.summary.totalRows}`,
      `local: ${plan.summary.localMatches}`,
      `live: ${plan.summary.liveSiteCandidates}`,
      `unresolved: ${plan.summary.unresolved}`,
      `duplicates: ${plan.summary.duplicateCandidates}`,
      `conversion: ${plan.summary.conversionRequired}`,
    ].join(" · "),
  );
  if (plan.summary.flatPngFamilyReadiness) {
    const readiness = plan.summary.flatPngFamilyReadiness;
    console.log(
      [
        `Flat-PNG readiness: loaded ${readiness.loaded}`,
        `classified ${readiness.classified}`,
        `blocked ${readiness.blocked}`,
        `rejected ${readiness.rejected}`,
        readiness.allReady ? "READY" : "BLOCKED",
      ].join(" · "),
    );
  }
  if (plan.summary.cylinderStorefrontGeneration) {
    const budget = plan.summary.cylinderStorefrontGeneration;
    console.log(
      `Cylinder storefront generation budget: ${budget.missingRepresentatives} missing of ${budget.totalTargets} canonical groups`,
    );
  }
  if (plan.missingLocalRoots && plan.missingLocalRoots.length > 0) {
    console.warn(`[reference-intake] plan recorded ${plan.missingLocalRoots.length} missing root(s)`);
  }
  if (firecrawlResult.summary.targeted > 0) {
    if (firecrawlResult.summary.skippedNoApiKey) {
      console.warn(
        `[reference-intake] Firecrawl skipped for ${firecrawlResult.summary.targeted} unresolved row${
          firecrawlResult.summary.targeted === 1 ? "" : "s"
        }; set FIRECRAWL_API_KEY to source Needs source match rows automatically.`,
      );
    } else {
      console.log(
        `[reference-intake] Firecrawl sourced ${firecrawlResult.summary.sourced}/${
          firecrawlResult.summary.targeted
        } unresolved row${firecrawlResult.summary.targeted === 1 ? "" : "s"} ` +
          `with ${firecrawlResult.summary.attempted} scrape attempt${
            firecrawlResult.summary.attempted === 1 ? "" : "s"
          }`,
      );
    }
  }
  for (const error of firecrawlResult.summary.errors.slice(0, 5)) {
    console.warn(`[reference-intake] Firecrawl ${error.graceSku} ${error.url}: ${error.message}`);
  }
  console.log(`Public JSON: ${resolve(values["public-out-json"] as string)}`);

  if (values.apply) {
    const organizationId = values["organization-id"];
    if (!organizationId) throw new Error("--organization-id is required with --apply.");
    await applyReferenceIntake(plan, {
      organizationId: organizationId as string,
      skus: values.sku as string[],
      sampleLocal: values["sample-local"] == null ? null : Math.max(0, Number.parseInt(values["sample-local"] as string, 10) || 0),
      sampleWebsite: values["sample-website"] == null ? null : Math.max(0, Number.parseInt(values["sample-website"] as string, 10) || 0),
      limit: Math.max(1, Number.parseInt(values.limit as string, 10) || 10000),
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
