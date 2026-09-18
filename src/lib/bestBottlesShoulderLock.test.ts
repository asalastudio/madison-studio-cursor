import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BEST_BOTTLES_SHOULDER_LOCK_BODIES,
  BEST_BOTTLES_SHOULDER_LOCK_VERSION,
  resolveGlassBodyKey,
  resolveShoulderLock,
} from "./bestBottlesShoulderLock";

const snapshotPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../public/data/best-bottles-shoulder-lock-2026-09-07.json",
);

describe("Best Bottles shoulder lock", () => {
  it("pins the Sep 7 lock table and matches the committed snapshot", () => {
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
      version: string;
      bodies: Array<{ glassBodyKey: string; shoulderPct: number; status: string }>;
    };
    assert.equal(snapshot.version, BEST_BOTTLES_SHOULDER_LOCK_VERSION);
    assert.equal(BEST_BOTTLES_SHOULDER_LOCK_BODIES.length, 14);
    assert.deepEqual(
      BEST_BOTTLES_SHOULDER_LOCK_BODIES.map((body) => ({
        glassBodyKey: body.glassBodyKey,
        shoulderPct: body.shoulderPct,
        status: body.status,
      })),
      snapshot.bodies.map((body) => ({
        glassBodyKey: body.glassBodyKey,
        shoulderPct: body.shoulderPct,
        status: body.status,
      })),
    );
  });

  it("keys Cylinder bodies by family + capacity, not fitment", () => {
    assert.equal(
      resolveGlassBodyKey({ family: "Cylinder", capacityMl: 5, applicator: "Fine Mist Sprayer" }),
      "cylinder:5-standard",
    );
    assert.equal(
      resolveGlassBodyKey({ family: "Cylinder", capacityMl: 5, applicator: "Plastic Roller Ball" }),
      "cylinder:5-standard",
    );
    assert.equal(
      resolveGlassBodyKey({ family: "Cylinder", capacityMl: 9, heightWithoutCap: "70 ±1 mm" }),
      "cylinder:9-standard",
    );
    assert.equal(
      resolveGlassBodyKey({
        family: "Cylinder",
        capacityMl: 9,
        websiteSku: "GBTallCyl9SpryBlkSh",
        heightWithoutCap: "106 ±2 mm",
      }),
      "cylinder:9-tall",
    );
    assert.equal(
      resolveGlassBodyKey({ family: "Boston Round", capacityMl: 100 }),
      null,
    );
  });

  it("does not let a broken 30 ml Convex row choose a different body", () => {
    const lock = resolveShoulderLock({
      family: "Cylinder",
      capacityMl: 30,
      heightWithoutCap: "50.8",
    });
    assert.ok(lock);
    assert.equal(lock.glassBodyKey, "cylinder:30-standard");
    assert.equal(lock.shoulderPct, 46);
    assert.equal(lock.shoulderYFromTopPct, 45);
  });

  it("maps 3 ml catalog rows onto the 3.3 ml lock", () => {
    const lock = resolveShoulderLock({ family: "Cylinder", capacityMl: 3 });
    assert.ok(lock);
    assert.equal(lock.glassBodyKey, "cylinder:3.3-standard");
    assert.equal(lock.shoulderPct, 26.5);
  });

  it("reads capacity from a Grace SKU when capacityMl is missing", () => {
    const lock = resolveShoulderLock({
      family: "Cylinder",
      sku: "GB-CYL-CLR-454ML-T",
      heightWithoutCap: "195 mm",
    });
    assert.ok(lock);
    assert.equal(lock.glassBodyKey, "cylinder:454-standard");
    assert.equal(lock.shoulderPct, 71.5);
  });

  it("keeps the 117 mm 18-415 50 ml glass on the locked 56% body", () => {
    assert.equal(
      resolveGlassBodyKey({
        family: "Cylinder",
        capacityMl: 50,
        heightWithoutCap: "117 ±2 mm",
        applicator: "Perfume Spray Pump",
        neckThreadSize: "18-415",
      }),
      "cylinder:50-standard",
    );
    assert.equal(
      resolveGlassBodyKey({
        family: "Cylinder",
        capacityMl: 50,
        graceSku: "GB-CYL-CLR-50ML-RDC-SBLK-T",
        heightWithoutCap: "117 ±2 mm",
      }),
      "cylinder:50-standard",
    );
    const lock = resolveShoulderLock({
      family: "Cylinder",
      capacityMl: 50,
      heightWithoutCap: "117 ±2 mm",
    });
    assert.ok(lock);
    assert.equal(lock.glassBodyKey, "cylinder:50-standard");
    assert.equal(lock.shoulderPct, 56);
  });

  it("splits the 98 mm 16 mm 50 ml roll-on onto its own glass body", () => {
    assert.equal(
      resolveGlassBodyKey({
        family: "Cylinder",
        capacityMl: 50,
        heightWithoutCap: "98 ±1 mm",
        applicator: "Metal Roller Ball",
        neckThreadSize: "16mm",
        websiteSku: "GBCyl50MtlRollBlk",
      }),
      "cylinder:50-rollon",
    );
    assert.equal(
      resolveGlassBodyKey({
        family: "Cylinder",
        capacityMl: 50,
        graceSku: "GB-CYL-WHT-50ML-ROL-WHT",
        applicator: "Plastic Roller Ball",
      }),
      "cylinder:50-rollon",
    );
    assert.ok(
      resolveShoulderLock({
        family: "Cylinder",
        capacityMl: 50,
        heightWithoutCap: "98 ±1 mm",
        applicator: "Metal Roller Ball",
      }),
    );
    const lock = resolveShoulderLock({
      family: "Cylinder",
      capacityMl: 50,
      heightWithoutCap: "98 ±1 mm",
      diameter: "37 ±0.5 mm",
      neckThreadSize: "16mm",
      applicator: "Metal Roller Ball",
    });
    assert.ok(lock);
    assert.equal(lock.glassBodyKey, "cylinder:50-rollon");
    assert.equal(lock.shoulderPct, 53);
    assert.equal(lock.shoulderYFromTopPct, 38);
  });

  it("keeps a short 18-415 50 ml row on the spray glass, not the roll-on", () => {
    const lock = resolveShoulderLock({
      family: "Cylinder",
      capacityMl: 50,
      heightWithoutCap: "85 ±1 mm",
      diameter: "30 ±0.5 mm",
      neckThreadSize: "18-415",
      applicator: "Vintage Bulb",
      graceSku: "GB-CYL-CLR-50ML-ASP-WHT",
    });
    assert.ok(lock);
    assert.equal(lock.glassBodyKey, "cylinder:50-standard");
    assert.equal(lock.shoulderPct, 56);
  });
});
