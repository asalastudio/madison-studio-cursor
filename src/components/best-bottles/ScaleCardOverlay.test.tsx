import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { resolveScaleCardOverlayModel } from "@/lib/bestBottlesScaleCardOverlay";
import { ScaleCardOverlay } from "./ScaleCardOverlay";

describe("ScaleCardOverlay", () => {
  it("renders target and current shoulder lines without legacy millimeter ticks", () => {
    const model = resolveScaleCardOverlayModel({
      family: "Cylinder",
      graceSku: "GB-CYL-CLR-5ML-SPR-SGLD",
      capacityMl: 5,
      heightWithoutCap: "53 mm",
      canvasHeightPx: 2288,
      measuredShoulderYPx: 1217,
      shoulderConfidence: 0.98,
    });

    const markup = renderToStaticMarkup(
      <ScaleCardOverlay model={model} density="full" />,
    );

    assert.match(markup, /data-mode="shoulder-lock"/);
    assert.match(markup, /Shoulder lock/);
    assert.match(markup, /Current shoulder/);
    assert.match(markup, /36\.5%/);
    assert.match(markup, /37\.8%/);
    assert.doesNotMatch(markup, /53 mm/);
    assert.doesNotMatch(markup, /Max assembled/);
  });
});
