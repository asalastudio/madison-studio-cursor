import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getMobilePageTitle, MOBILE_TAB_ROUTES } from "./mobileNav";

test("mobile tab bar covers the core brand-owner jobs", () => {
  assert.equal(MOBILE_TAB_ROUTES.home, "/dashboard");
  assert.equal(MOBILE_TAB_ROUTES.create, "/create");
  assert.equal(MOBILE_TAB_ROUTES.darkRoom, "/darkroom");
  assert.equal(MOBILE_TAB_ROUTES.images, "/image-library");
  assert.equal(MOBILE_TAB_ROUTES.settings, "/settings");
});

test("mobile page titles resolve nested settings and product routes", () => {
  assert.equal(getMobilePageTitle("/settings"), "Settings");
  assert.equal(getMobilePageTitle("/products/abc"), "Products");
  assert.equal(getMobilePageTitle("/unknown-route"), "Madison");
});

test("app shell mounts the mobile bottom nav once and pads main content", async () => {
  const appSource = await readFile(new URL("../App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /import \{ BottomNavigation \} from "@\/components\/layout\/BottomNavigation"/);
  assert.match(appSource, /<BottomNavigation \/>/);
  assert.match(appSource, /app-shell-mobile/);
});

test("dashboard no longer mounts a second bottom nav", async () => {
  const dashboardSource = await readFile(new URL("../pages/DashboardNew.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(dashboardSource, /<BottomNavigation \/>/);
});

test("mobile CSS prevents page-level horizontal overflow and keeps iOS inputs at 16px", async () => {
  const css = await readFile(new URL("../index.css", import.meta.url), "utf8");
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /font-size:\s*16px/);
  assert.match(css, /env\(safe-area-inset-top/);
});

test("desktop settings tabs stay a wrapping row without a mobile-only scroll wrapper", async () => {
  const settingsSource = await readFile(new URL("../pages/Settings.tsx", import.meta.url), "utf8");
  assert.match(settingsSource, /hidden md:block/);
  assert.match(settingsSource, /flex h-auto w-full flex-wrap/);
  assert.doesNotMatch(settingsSource, /hidden overflow-x-auto md:block/);
});

test("mobile dark room exposes lighting lane and plate mode on the grid", async () => {
  const gridSource = await readFile(new URL("../components/darkroom/MobileSettingsGrid.tsx", import.meta.url), "utf8");
  assert.match(gridSource, /lightingLane/);
  assert.match(gridSource, /Background plate mode/);
  assert.match(gridSource, /Light lane/);
});

test("bottom nav uses short labels so five tabs fit a phone width", async () => {
  const navSource = await readFile(new URL("../components/layout/BottomNavigation.tsx", import.meta.url), "utf8");
  assert.match(navSource, /shortLabel: "Room"/);
  assert.match(navSource, /flex-1/);
  assert.doesNotMatch(navSource, /min-w-\[56px\]/);
});

test("dialogs go full-screen below the md breakpoint", async () => {
  const dialogSource = await readFile(new URL("../components/ui/dialog.tsx", import.meta.url), "utf8");
  assert.match(dialogSource, /h-\[100dvh\]/);
  assert.match(dialogSource, /md:left-\[50%\]/);
});
