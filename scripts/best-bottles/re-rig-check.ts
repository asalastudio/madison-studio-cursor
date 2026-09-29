#!/usr/bin/env tsx
/**
 * Re-run the geometry-only rig postprocess against an
 * ALREADY-GENERATED raw image, in isolation, to validate a rig fix without
 * spending on regeneration. Loads the raw in a headless Playwright page against
 * the local dev server (same in-page dynamic imports the real batch runner
 * uses), runs normalizeBestBottlesRigBaseline without paint-after, and
 * writes the result PNG next to the input for visual inspection.
 *
 * Usage: tsx scripts/best-bottles/re-rig-check.ts <rawImageUrl> <sku> <outPath> [productJson]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

async function main(): Promise<void> {
  const [rawUrl, sku, outPath, productJson] = process.argv.slice(2);
  if (!rawUrl || !sku || !outPath) {
    throw new Error("Usage: re-rig-check.ts <rawImageUrl> <sku> <outPath> [productJson]");
  }
  const product = productJson ? JSON.parse(productJson) as Record<string, unknown> : {};
  const imageUrl = /^(?:https?:|data:)/i.test(rawUrl)
    ? rawUrl
    : `data:image/png;base64,${readFileSync(rawUrl).toString("base64")}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:8081/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(
    async ({ imageUrl, sku, product }) => {
      const { normalizeBestBottlesRigBaseline } = await import(
        "/src/lib/product-image/rigPostprocess.ts"
      );
      const rigged = await normalizeBestBottlesRigBaseline(imageUrl, {
        ...product,
        family: "Cylinder",
        bottleCollection: "Cylinder",
        graceSku: sku,
        targetBackgroundHex: "#F5F3EF",
        maskReferenceUrl: null,
        requireMaskControl: false,
      });
      return rigged;
    },
    { imageUrl, sku, product },
  );

  await browser.close();

  if (result.detectedBaselineYPx === null) {
    console.error("Rig postprocess: baseline was not detectable.", result.qaIssues);
    process.exit(1);
  }
  if (result.qaIssues.length > 0) {
    console.error("Rig QA issues:", result.qaIssues);
  }

  const base64 = result.dataUrl.replace(/^data:image\/png;base64,/, "");
  writeFileSync(outPath, Buffer.from(base64, "base64"));
  console.log(`Re-rigged output written: ${outPath}`);
  console.log(`baseline: ${result.detectedBaselineYPx}px (target ${result.targetBaselineYPx}px)  scale=${result.scale}  qaIssues=${result.qaIssues.length}`);
  console.log("primary bottle bounds:", JSON.stringify(result.framingQa?.primaryBounds ?? null));
  console.log("complete product envelope:", JSON.stringify(result.objectBounds));
  console.log("framing QA:", JSON.stringify(result.framingQa, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
