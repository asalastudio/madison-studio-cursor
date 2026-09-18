import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("studio and Image Library lock vintage bulb products off cap-off sidecar", () => {
  const imageLibrary = readFileSync(join(root, "pages/ImageLibrary.tsx"), "utf8");
  const masters = readFileSync(join(root, "components/darkroom/MastersTabPanel.tsx"), "utf8");
  const presets = readFileSync(join(root, "config/imagePresets.ts"), "utf8");

  assert.match(imageLibrary, /isAssembledOnlyVintageBulbIdentity/);
  assert.doesNotMatch(imageLibrary, /isEmpireVintageBulbSprayer/);
  assert.match(imageLibrary, /no cap-off state/);

  assert.match(masters, /isAssembledOnlyVintageBulbIdentity/);
  assert.match(masters, /CAP_OFF_SIDECAR_PRESET_ID/);
  assert.match(masters, /There is no cap-off state/);

  assert.match(presets, /resolveAssembledOnlyCatalogPresetId/);
});
