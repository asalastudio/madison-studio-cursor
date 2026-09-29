import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const currentDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(currentDir, "App.tsx"), "utf8");
const sidebarSource = readFileSync(resolve(currentDir, "components", "AppSidebar.tsx"), "utf8");
const edgeSource = readFileSync(
  resolve(currentDir, "..", "supabase", "functions", "generate-madison-video", "index.ts"),
  "utf8",
);

test("Video studio route is registered in both app route tables", () => {
  const videoRouteMatches = appSource.match(/path="\/video"/g);
  assert.equal(videoRouteMatches?.length, 2);
  assert.match(appSource, /path="\/video-project"/);
  assert.match(appSource, /lazy\(\(\) => import\("\.\/pages\/VideoStudio"\)\)/);
  assert.match(appSource, /pathname !== "\/video"/);
});

test("Video appears in Studio nav and is not Best Bottles branded", () => {
  assert.match(sidebarSource, /title: "Video", url: "\/video"/);
  assert.doesNotMatch(sidebarSource, /Best Bottles Video|Tarife Video/);
});

test("generate-madison-video no longer injects bottle-specific prompt language", () => {
  assert.match(edgeSource, /authorizeOrganization/);
  assert.match(edgeSource, /organizationId is required/);
  assert.doesNotMatch(edgeSource, /includes\("bottle"\)/);
});
