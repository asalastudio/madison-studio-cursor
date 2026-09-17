import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(currentDir, "App.tsx"), "utf8");
const bestBottlesStudioSource = readFileSync(
  resolve(currentDir, "pages", "BestBottlesStudio.tsx"),
  "utf8",
);

test("Best Bottles Studio deep-link route is registered in both app route tables", () => {
  const studioRouteMatches = appSource.match(
    /path="\/best-bottles\/studio\/:groupSlug"/g,
  );

  assert.equal(studioRouteMatches?.length, 2);
});

test("Best Bottles scale-card pilot route is registered in both app route tables", () => {
  const pilotRouteMatches = appSource.match(
    /path="\/best-bottles\/scale-card-pilot"/g,
  );

  assert.equal(pilotRouteMatches?.length, 2);
  assert.match(appSource, /BestBottlesScaleCardPilot/);
});

test("CYL-9ML Studio mounts ReleaseWorkbench without removing legacy Components", () => {
  assert.match(bestBottlesStudioSource, /isCyl9ReleaseWorkbenchGroup/);
  assert.match(bestBottlesStudioSource, /<ReleaseWorkbench/);
  assert.match(bestBottlesStudioSource, /<ComponentsTabPanel/);
  assert.match(bestBottlesStudioSource, /isReleaseWorkbenchView\s*\?/);
  assert.match(bestBottlesStudioSource, /RELEASE_TABS/);
});
