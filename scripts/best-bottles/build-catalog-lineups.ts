import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import sharp from "sharp";

import type { BestBottlesCalibrationRegistryRow } from "../../src/lib/bestBottlesCalibrationRegistry";

export interface BestBottlesLineupSource {
  registryRow: BestBottlesCalibrationRegistryRow;
  /** Lineup-only alpha product layer derived from the approved PSD/reference. */
  productLayerPath: string;
  productLayerReferenceId: string;
  primaryBottleBounds: { top: number; bottom: number; left: number; right: number } | null;
}

export interface BestBottlesLineupManifestItem {
  position: number;
  registryKey: string;
  graceSku: string;
  websiteSku: string;
  family: string;
  capacityMl: number;
  productLayerPath: string;
  productLayerReferenceId: string;
  scaleContractVersion: "best-bottles-catalog-scale-v1";
  promptVersion: "best-bottles-reference-locked-v6.1";
  resolvedAssembledTargetPct: number;
  resolvedBodyTargetPx: number;
  primaryBottleBounds: { top: number; bottom: number; left: number; right: number };
}

export interface BestBottlesLineupRenderPlan {
  manifest: BestBottlesLineupManifestItem[];
  technicalItems: BestBottlesLineupManifestItem[];
  heroItems: BestBottlesLineupManifestItem[];
}

export function buildCatalogLineupRenderPlan(
  sources: BestBottlesLineupSource[],
): BestBottlesLineupRenderPlan {
  const manifest = sources.map((source, position): BestBottlesLineupManifestItem => {
    const row = source.registryRow;
    if (!source.productLayerPath.trim()) {
      throw new Error(`Lineup product layer is missing for ${row.graceSku}.`);
    }
    if (source.productLayerReferenceId !== row.capOnReferenceId) {
      throw new Error(`Lineup product layer reference lineage does not match ${row.graceSku}.`);
    }
    if (!source.primaryBottleBounds) {
      throw new Error(`Primary-bottle QA bounds are missing for ${row.graceSku}.`);
    }
    if (row.measurementStatus !== "reconciled") {
      throw new Error(`Reconciled measurements are required for ${row.graceSku}.`);
    }
    if (row.scaleContractVersion !== "best-bottles-catalog-scale-v1") {
      throw new Error(`Scale-contract lineage is stale for ${row.graceSku}.`);
    }
    if (row.promptVersion !== "best-bottles-reference-locked-v6.1") {
      throw new Error(`V6.1 prompt lineage is required for ${row.graceSku}.`);
    }
    return {
      position,
      registryKey: row.registryKey,
      graceSku: row.graceSku,
      websiteSku: row.websiteSku,
      family: row.family,
      capacityMl: row.capacityMl,
      productLayerPath: source.productLayerPath,
      productLayerReferenceId: source.productLayerReferenceId,
      scaleContractVersion: row.scaleContractVersion,
      promptVersion: row.promptVersion,
      resolvedAssembledTargetPct: row.finalAssembledTargetPct,
      resolvedBodyTargetPx: row.bodyTargetPx,
      primaryBottleBounds: source.primaryBottleBounds,
    };
  });

  return {
    manifest,
    technicalItems: manifest.map((item) => ({ ...item })),
    heroItems: manifest.map((item) => ({ ...item })),
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function renderLineup(
  items: BestBottlesLineupManifestItem[],
  outputPath: string,
  technical: boolean,
): Promise<void> {
  const tileWidth = 360;
  const topPadding = technical ? 90 : 50;
  const floorY = 840;
  const labelHeight = technical ? 190 : 40;
  const canvasHeight = floorY + labelHeight;
  const canvasWidth = Math.max(tileWidth, items.length * tileWidth);
  const composites: sharp.OverlayOptions[] = [];

  for (const [index, item] of items.entries()) {
    const metadata = await sharp(item.productLayerPath).metadata();
    if (!metadata.hasAlpha) {
      throw new Error(`Lineup product layer must retain alpha from approved PSD export: ${item.graceSku}.`);
    }
    const targetHeightPx = Math.round(760 * (item.resolvedAssembledTargetPct / 100));
    const productBuffer = await sharp(item.productLayerPath)
      .trim()
      .resize({ height: targetHeightPx, fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer();
    const productMeta = await sharp(productBuffer).metadata();
    const productWidth = productMeta.width ?? tileWidth;
    const productHeight = productMeta.height ?? targetHeightPx;
    composites.push({
      input: productBuffer,
      left: Math.round(index * tileWidth + (tileWidth - productWidth) / 2),
      top: floorY - productHeight,
    });

    if (technical) {
      const label = Buffer.from(`
        <svg width="${tileWidth}" height="${labelHeight}">
          <style>
            .family { font: 600 20px -apple-system, BlinkMacSystemFont, sans-serif; fill: #302b27; }
            .meta { font: 15px -apple-system, BlinkMacSystemFont, sans-serif; fill: #665e57; }
          </style>
          <text x="${tileWidth / 2}" y="32" text-anchor="middle" class="family">${escapeXml(item.family)} · ${item.capacityMl} ml</text>
          <text x="${tileWidth / 2}" y="60" text-anchor="middle" class="meta">${escapeXml(item.graceSku)}</text>
          <text x="${tileWidth / 2}" y="86" text-anchor="middle" class="meta">target ${item.resolvedAssembledTargetPct.toFixed(1)}% · body ${item.resolvedBodyTargetPx}px</text>
        </svg>
      `);
      composites.push({ input: label, left: index * tileWidth, top: floorY + 8 });
    }
  }

  await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: "#F5F3EF",
    },
  })
    .composite([
      {
        input: Buffer.from(`<svg width="${canvasWidth}" height="4"><rect width="${canvasWidth}" height="2" y="1" fill="#d9cec5" opacity="0.7"/></svg>`),
        left: 0,
        top: floorY,
      },
      ...composites,
    ])
    .png()
    .toFile(outputPath);
}

type LayerManifestRow = {
  registryKey?: string;
  productLayerPath?: string;
  productLayerReferenceId?: string;
  primaryBottleBounds?: { top: number; bottom: number; left: number; right: number } | null;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const outputDir = path.join(root, "tmp/best-bottles-calibration");
  const registryPath = path.join(root, "public/data/best-bottles-catalog-scale-registry.json");
  const layerManifestPath = path.join(outputDir, "approved-product-layers.json");
  mkdirSync(outputDir, { recursive: true });

  const registryData = readJson<{ registry?: BestBottlesCalibrationRegistryRow[] }>(registryPath);
  const registry = registryData.registry ?? [];
  const layerRows = existsSync(layerManifestPath)
    ? readJson<{ sources?: LayerManifestRow[] }>(layerManifestPath).sources ?? []
    : [];
  const layerByRegistryKey = new Map(layerRows.map((row) => [row.registryKey, row]));
  const blockers: Array<{ registryKey: string; graceSku: string; reason: string }> = [];
  const sources: BestBottlesLineupSource[] = [];

  for (const row of registry) {
    const layer = layerByRegistryKey.get(row.registryKey);
    if (!layer?.productLayerPath || !layer.productLayerReferenceId || !layer.primaryBottleBounds) {
      blockers.push({
        registryKey: row.registryKey,
        graceSku: row.graceSku,
        reason: "Approved PSD-derived alpha product layer with primary-bottle QA bounds is missing.",
      });
      continue;
    }
    sources.push({
      registryRow: row,
      productLayerPath: layer.productLayerPath,
      productLayerReferenceId: layer.productLayerReferenceId,
      primaryBottleBounds: layer.primaryBottleBounds,
    });
  }

  writeFileSync(path.join(outputDir, "lineup-blockers.json"), `${JSON.stringify({ blockers }, null, 2)}\n`);
  if (sources.length === 0) {
    console.log(JSON.stringify({ rendered: false, eligibleSources: 0, blockers: blockers.length }, null, 2));
    process.exitCode = 1;
    return;
  }

  const cylinderSources = sources
    .filter((source) => /^(?:tall )?cylinder$|^vial$/i.test(source.registryRow.family))
    .sort((a, b) => a.registryRow.capacityMl - b.registryRow.capacityMl);
  const familySources = [...new Map(
    sources
      .sort((a, b) => a.registryRow.family.localeCompare(b.registryRow.family) || a.registryRow.capacityMl - b.registryRow.capacityMl)
      .map((source) => [source.registryRow.family, source]),
  ).values()];
  const cylinderPlan = buildCatalogLineupRenderPlan(cylinderSources);
  const familyPlan = buildCatalogLineupRenderPlan(familySources);

  await renderLineup(cylinderPlan.technicalItems, path.join(outputDir, "cylinder-technical.png"), true);
  await renderLineup(familyPlan.technicalItems, path.join(outputDir, "catalog-families-technical.png"), true);
  await renderLineup(familyPlan.heroItems, path.join(outputDir, "catalog-families-hero.png"), false);
  writeFileSync(
    path.join(outputDir, "catalog-family-lineup-manifest.json"),
    `${JSON.stringify({
      scaleContractVersion: "best-bottles-catalog-scale-v1",
      technicalItems: familyPlan.technicalItems,
      heroItems: familyPlan.heroItems,
      blockers,
    }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ rendered: true, cylinderItems: cylinderPlan.manifest.length, familyItems: familyPlan.manifest.length, blockers: blockers.length }, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
