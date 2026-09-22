import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveBestBottlesScaleVerdict,
  type BestBottlesScaleVerdictReconciliation,
} from "./bestBottlesScaleVerdict.ts";

const passedRow: BestBottlesScaleVerdictReconciliation = {
  lifecycle_state: "qa-passed",
  final_image_url: "https://example.com/rigged.png",
  framing_decision: "pass",
  qa_issues: [],
  fill_height_pct: 63.7,
};

describe("Best Bottles pipeline QA verdict", () => {
  it("fails closed when the rig did not persist a final image", () => {
    const verdict = resolveBestBottlesScaleVerdict({
      reconciliation: {
        ...passedRow,
        lifecycle_state: "qa-failed",
        final_image_url: null,
        qa_issues: ["Detached cap geometry failed."],
      },
      tags: ["cap-state:sidecar"],
      heightWithoutCap: 74,
      heightWithCap: 94,
      applicator: "Lotion Pump",
    });

    assert.equal(verdict?.verdict, "fail");
    assert.match(verdict?.summary ?? "", /raw render, not a completed rigged final/i);
  });

  it("carries a pipeline pass into the Library without reinterpretation", () => {
    const verdict = resolveBestBottlesScaleVerdict({
      reconciliation: passedRow,
      tags: ["cap-state:sidecar"],
      heightWithoutCap: 74,
      heightWithCap: 94,
      applicator: "Lotion Pump",
    });

    assert.equal(verdict?.verdict, "pass");
    assert.equal(verdict?.label, "Pipeline QA passed");
    assert.equal(verdict?.visibleHeightPct, 63.7);
  });

  it("fails closed when a stale pass exceeds catalog heightWithCap", () => {
    const verdict = resolveBestBottlesScaleVerdict({
      reconciliation: {
        ...passedRow,
        // At v2 Medium (64% for 70 mm), 99.7% canvas ≈ 109.1 mm assembled — over the 100 mm hard max.
        fill_height_pct: 99.7,
        framing_qa: {
          measurements: { glassHeightPct: 64 },
          physicalScale: {
            verdict: "pass",
            deltaMm: 0,
          },
        },
      },
      tags: ["cap-state:sidecar"],
      heightWithoutCap: 70,
      heightWithCap: 98,
      applicator: "Lotion Pump",
    });

    assert.equal(verdict?.verdict, "fail");
    assert.equal(verdict?.visibleHeightMm, 109);
    assert.match(verdict?.summary ?? "", /exceeds the catalog maximum/i);
  });

  it("fails pending rows that already exceed assembled height", () => {
    const verdict = resolveBestBottlesScaleVerdict({
      reconciliation: {
        ...passedRow,
        lifecycle_state: "review-pending",
        framing_decision: "normalize",
        // 85% at 64%/70 mm ≈ 93 mm visible vs 83+2 mm catalog max.
        fill_height_pct: 85,
      },
      tags: ["cap-state:sidecar"],
      heightWithoutCap: 70,
      heightWithCap: 83,
      applicator: "Metal Roller Ball",
    });

    assert.equal(verdict?.verdict, "fail");
    assert.match(verdict?.summary ?? "", /exceeds the catalog maximum/i);
  });

  it("carries pipeline QA issues into a failed Library verdict", () => {
    const verdict = resolveBestBottlesScaleVerdict({
      reconciliation: {
        ...passedRow,
        qa_issues: ["Product baseline was not detectable."],
      },
      tags: ["cap-state:assembled"],
      heightWithoutCap: 74,
      heightWithCap: 94,
      applicator: "Lotion Pump",
    });

    assert.equal(verdict?.verdict, "fail");
    assert.match(verdict?.summary ?? "", /blocking issues/i);
  });
});
