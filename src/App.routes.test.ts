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

test("internal demo and test routes require a super-admin in both app route tables", () => {
  const demoMatches = appSource.match(/path="\/component-demo"/g) ?? [];
  const testMatches = appSource.match(/path="\/madison-test"/g) ?? [];
  const superAdminWrappers = appSource.match(/<SuperAdminRoute>/g) ?? [];

  assert.equal(demoMatches.length, 2);
  assert.equal(testMatches.length, 2);
  assert.ok(superAdminWrappers.length >= 4);
});

test("Best Bottles Studio deep-link route is registered in both app route tables", () => {
  const studioRouteMatches = appSource.match(
    /path="\/best-bottles\/studio\/:groupSlug"/g,
  );

  assert.equal(studioRouteMatches?.length, 2);
});

test("CYL-9ML Studio mounts ReleaseWorkbench without removing legacy Components", () => {
  assert.match(bestBottlesStudioSource, /isCyl9ReleaseWorkbenchGroup/);
  assert.match(bestBottlesStudioSource, /<ReleaseWorkbench/);
  assert.match(bestBottlesStudioSource, /<ComponentsTabPanel/);
  assert.match(bestBottlesStudioSource, /isReleaseWorkbenchView\s*\?/);
  assert.match(bestBottlesStudioSource, /RELEASE_TABS/);
});
