import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BEST_BOTTLES_SHOULDER_LOCK_BODIES,
  BEST_BOTTLES_SHOULDER_LOCK_VERSION,
  resolveGlassBodyKey,
  resolveShoulderLandmarkKind,
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
      bodies: Array<{ glassBodyKey: string; shoulderPct: number; bodyAspect: number; status: string }>;
    };
    assert.equal(snapshot.version, BEST_BOTTLES_SHOULDER_LOCK_VERSION);
    // 14 Cylinder from the Sep 7 lock + 3 Slim, 4 Elegant, 5 Sleek and 3 Boston
    // Round locked 2026-09-19/20, and 3 Diva, 4 Circle, 2 Round and 2 Empire on
    // 2026-09-21.
    assert.equal(BEST_BOTTLES_SHOULDER_LOCK_BODIES.length, 40);
    assert.deepEqual(
      BEST_BOTTLES_SHOULDER_LOCK_BODIES.map((body) => ({
        glassBodyKey: body.glassBodyKey,
        shoulderPct: body.shoulderPct,
        bodyAspect: body.bodyAspect,
        status: body.status,
      })),
      snapshot.bodies.map((body) => ({
        glassBodyKey: body.glassBodyKey,
        shoulderPct: body.shoulderPct,
        bodyAspect: body.bodyAspect,
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

  it("treats the 5.5 ml label as the 5 ml glass", () => {
    // Same 53 mm body. The edge function reads 5.5 from the item name, and
    // Math.round(5.5) is 6 — which has no lock and failed the render closed.
    for (const input of [
      { family: "Cylinder", capacityMl: 5.5 },
      { family: "Cylinder", itemName: "Cylinder design 5.5ml, 1/6oz Clear glass bottle with matte black spray" },
      { family: "Cylinder", capacity: "5.5 ml" },
    ]) {
      const lock = resolveShoulderLock(input);
      assert.ok(lock, JSON.stringify(input));
      assert.equal(lock.glassBodyKey, "cylinder:5-standard");
      assert.equal(lock.shoulderPct, 36.5);
    }
    // The alias must stay narrow: 6 ml is not a body we have locked.
    assert.equal(resolveGlassBodyKey({ family: "Cylinder", capacityMl: 6 }), null);
    assert.equal(resolveGlassBodyKey({ family: "Cylinder", capacityMl: 5.6 }), null);
  });

  it("locks Slim to three bodies by stated capacity, whatever the fitment", () => {
    for (const [capacityMl, key, pct, fromTop] of [
      [30, "slim:30-standard", 48.5, 42.5],
      [50, "slim:50-standard", 54, 37],
      [100, "slim:100-standard", 67.5, 23.5],
    ] as const) {
      for (const applicator of ["Fine Mist Sprayer", "Lotion Pump", "Reducer", "Dropper"]) {
        const lock = resolveShoulderLock({ family: "Slim", capacityMl, applicator });
        assert.ok(lock, `${capacityMl} ml ${applicator}`);
        assert.equal(lock.glassBodyKey, key);
        assert.equal(lock.shoulderPct, pct);
        assert.equal(lock.shoulderYFromTopPct, fromTop);
      }
    }
  });

  it("does not let Slim's junk catalog rows choose the body", () => {
    // Seven Slim lotion pumps carry the known junk 72 mm diameter, and three
    // rows list millimetres that contradict the capacity in their own name.
    // The stated capacity is the key; measurements must not move it.
    assert.equal(
      resolveGlassBodyKey({ family: "Slim", capacityMl: 50, heightWithoutCap: "121 ±2 mm", applicator: "Lotion Pump" }),
      "slim:50-standard",
    );
    assert.equal(
      resolveGlassBodyKey({ family: "Slim", capacityMl: 100, heightWithoutCap: "120 ±1 mm" }),
      "slim:100-standard",
    );
    assert.equal(resolveGlassBodyKey({ bottleCollection: "Slim", itemName: "Slim design 30 ml, 1oz clear glass bottle" }), "slim:30-standard");
  });

  it("fails closed on a Slim capacity that has no locked body", () => {
    assert.equal(resolveGlassBodyKey({ family: "Slim", capacityMl: 15 }), null);
    assert.equal(resolveShoulderLock({ family: "Slim", capacityMl: 75 }), null);
    assert.equal(resolveShoulderLock({ family: "Slim" }), null);
    // Slim's lock must not leak onto a family that only shares the capacity.
    assert.equal(resolveGlassBodyKey({ family: "Diva", capacityMl: 50 }), null);
  });

  it("locks Elegant to four bodies by stated capacity, whatever the colour or fitment", () => {
    for (const [capacityMl, key, pct, fromTop] of [
      [15, "elegant:15-standard", 39, 52],
      [30, "elegant:30-standard", 43, 48],
      [60, "elegant:60-standard", 47, 44],
      [100, "elegant:100-standard", 57, 34],
    ] as const) {
      for (const applicator of ["Fine Mist Sprayer", "Lotion Pump", "Reducer", "Dropper", "Vintage Bulb Sprayer"]) {
        for (const websiteSku of ["GBElg", "GBElgFrst"]) {
          const lock = resolveShoulderLock({ family: "Elegant", capacityMl, applicator, websiteSku });
          assert.ok(lock, `${capacityMl} ml ${applicator} ${websiteSku}`);
          assert.equal(lock.glassBodyKey, key);
          assert.equal(lock.shoulderPct, pct);
          assert.equal(lock.shoulderYFromTopPct, fromTop);
        }
      }
    }
  });

  it("does not let Elegant's inconsistent catalog heights choose the body", () => {
    // Frosted 15 ml rows report 70 mm and the 60 ml bulb sprayers 92 mm, for the
    // same 61 mm and 86 mm glass the rest of the size reports.
    assert.equal(resolveGlassBodyKey({ family: "Elegant", capacityMl: 15, heightWithoutCap: "70 ±1 mm" }), "elegant:15-standard");
    assert.equal(resolveGlassBodyKey({ family: "Elegant", capacityMl: 60, heightWithoutCap: "92 ±1 mm", applicator: "Vintage Bulb Sprayer" }), "elegant:60-standard");
  });

  it("fails closed on an Elegant capacity that has no locked body", () => {
    assert.equal(resolveGlassBodyKey({ family: "Elegant", capacityMl: 50 }), null);
    assert.equal(resolveShoulderLock({ family: "Elegant" }), null);
    // Elegant's lock must not leak onto a family that only shares the capacity:
    // an unlocked family gets nothing, and Diva (locked since) keeps its own body.
    assert.equal(resolveGlassBodyKey({ family: "Tulip", capacityMl: 30 }), null);
    assert.equal(resolveGlassBodyKey({ family: "Diva", capacityMl: 30 }), "diva:30-standard");
  });

  it("locks Sleek to five bodies by stated capacity, whatever the fitment", () => {
    for (const [capacityMl, key, pct] of [
      [5, "sleek:5-standard", 37], [8, "sleek:8-standard", 43], [30, "sleek:30-standard", 47],
      [50, "sleek:50-standard", 56], [100, "sleek:100-standard", 60.5],
    ] as const) {
      for (const applicator of ["Fine Mist Sprayer", "Lotion Pump", "Metal Roller Ball", "Reducer"]) {
        const lock = resolveShoulderLock({ family: "Sleek", capacityMl, applicator });
        assert.ok(lock, `${capacityMl} ml ${applicator}`);
        assert.equal(lock.glassBodyKey, key);
        assert.equal(lock.shoulderPct, pct);
      }
    }
    // Sleek 50 ml was the standing proof that a family cannot borrow another's
    // capacity; now that it is locked, its own number must be the one that wins.
    assert.equal(resolveShoulderLock({ family: "Sleek", capacityMl: 50 })?.shoulderPct, 56);
    assert.equal(resolveShoulderLock({ family: "Slim", capacityMl: 50 })?.shoulderPct, 54);
    assert.equal(resolveShoulderLock({ family: "Sleek", capacityMl: 15 }), null);
  });

  it("locks Boston Round to three bodies, and keys it on the two-word family name", () => {
    for (const [capacityMl, key, pct] of [
      [15, "boston-round:15-standard", 42], [30, "boston-round:30-standard", 45], [60, "boston-round:60-standard", 52],
    ] as const) {
      for (const family of ["Boston Round", "boston round", "Boston-Round"]) {
        const lock = resolveShoulderLock({ family, capacityMl });
        assert.ok(lock, `${family} ${capacityMl} ml`);
        assert.equal(lock.glassBodyKey, key);
        assert.equal(lock.shoulderPct, pct);
      }
    }
    // Three families now lock a 30 ml, and each must keep its own number.
    assert.equal(resolveShoulderLock({ family: "Boston Round", capacityMl: 30 })?.shoulderPct, 45);
    assert.equal(resolveShoulderLock({ family: "Slim", capacityMl: 30 })?.shoulderPct, 48.5);
    assert.equal(resolveShoulderLock({ family: "Elegant", capacityMl: 30 })?.shoulderPct, 43);
    assert.equal(resolveShoulderLock({ family: "Sleek", capacityMl: 30 })?.shoulderPct, 47);
    assert.equal(resolveShoulderLock({ family: "Boston Round", capacityMl: 100 }), null);
  });

  it("locks Diva's three bodies to the closure seat, and nothing else moves off the shoulder", () => {
    for (const [capacityMl, key, pct] of [
      [30, "diva:30-standard", 40], [46, "diva:46-standard", 47], [100, "diva:100-standard", 57],
    ] as const) {
      for (const applicator of ["Fine Mist Sprayer", "Reducer", "Dropper", "Lotion Pump", "Antique Bulb Sprayer"]) {
        const lock = resolveShoulderLock({ family: "Diva", capacityMl, applicator });
        assert.ok(lock, `Diva ${capacityMl} ml ${applicator}`);
        assert.equal(lock.glassBodyKey, key);
        assert.equal(lock.shoulderPct, pct);
        assert.equal(lock.landmark, "closure-seat");
      }
    }
    assert.equal(resolveShoulderLock({ family: "Diva", capacityMl: 60 }), null);
    for (const family of ["Cylinder", "Slim", "Elegant", "Sleek", "Boston Round"]) {
      assert.equal(resolveShoulderLock({ family, capacityMl: 30 })?.landmark, "shoulder", family);
    }
    for (const family of ["Circle", "Round", "Diva"]) {
      assert.equal(resolveShoulderLandmarkKind({ family }), "closure-seat", family);
    }
    for (const [family, capacityMl, key, pct] of [
      ["Circle", 15, "circle:15-standard", 40], ["Circle", 30, "circle:30-standard", 44],
      ["Circle", 50, "circle:50-standard", 48], ["Circle", 100, "circle:100-standard", 56],
      ["Round", 78, "round:78-standard", 42.5], ["Round", 128, "round:128-standard", 52],
    ] as const) {
      const lock = resolveShoulderLock({ family, capacityMl, applicator: "Fine Mist Sprayer" });
      assert.ok(lock, `${family} ${capacityMl} ml`);
      assert.equal(lock.glassBodyKey, key);
      assert.equal(lock.shoulderPct, pct);
      assert.equal(lock.landmark, "closure-seat");
    }
    assert.equal(resolveShoulderLock({ family: "Round", capacityMl: 100 }), null);
  });

  it("locks Empire by capacity, as a shoulder", () => {
    for (const [capacityMl, key, pct, applicator] of [
      [50, "empire:50-standard", 48, "Dropper"], [100, "empire:100-standard", 57, "Lotion Pump"],
    ] as const) {
      const lock = resolveShoulderLock({ family: "Empire", capacityMl, applicator });
      assert.ok(lock, `Empire ${capacityMl} ml`);
      assert.equal(lock.glassBodyKey, key);
      assert.equal(lock.shoulderPct, pct);
      assert.notEqual(lock.landmark, "closure-seat");
    }
    assert.equal(resolveShoulderLandmarkKind({ family: "Empire" }), "shoulder");
    assert.equal(resolveShoulderLock({ family: "Empire", capacityMl: 30 }), null);
    assert.equal(resolveShoulderLandmarkKind({ family: "Boston Round" }), "shoulder");
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
      neckThreadSize: "18-415",
      applicator: "Vintage Bulb",
      graceSku: "GB-CYL-CLR-50ML-ASP-WHT",
    });
    assert.ok(lock);
    assert.equal(lock.glassBodyKey, "cylinder:50-standard");
    assert.equal(lock.shoulderPct, 56);
  });
});
