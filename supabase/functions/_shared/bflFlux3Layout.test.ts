import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BEST_BOTTLES_PRODUCT_SHOT_LAYOUT,
  BFL_FLUX3_AI_PROVIDER,
  applySingleElementLock,
  flux3RequestForProvider,
  buildFlux3LayoutPrompt,
  buildFlux3RequestBody,
  collectFlux3ReferenceImages,
  composeFlux3Prompt,
  isBflFlux3AiProvider,
  mapMadisonResolutionToFlux3,
  parseFlux3ClientRequest,
  resolveFlux3AspectRatio,
} from "./bflFlux3Layout.ts";

describe("FLUX 3 layout prompts", () => {
  it("joins the caption and a generation element table", () => {
    const prompt = buildFlux3LayoutPrompt(BEST_BOTTLES_PRODUCT_SHOT_LAYOUT.caption, BEST_BOTTLES_PRODUCT_SHOT_LAYOUT.elements);
    assert.match(prompt, /<bottle_1>/);
    assert.match(prompt, /<surface_1>/);
    assert.match(prompt, /<light_1>/);
    const jsonStart = prompt.lastIndexOf(" [");
    const rows = JSON.parse(prompt.slice(jsonStart + 1)) as Array<Record<string, unknown>>;
    assert.equal(rows.length, 3);
    const bottle = rows.find((row) => row.id === "bottle_1");
    assert.deepEqual(bottle?.bbox, [90, 300, 860, 700]);
    assert.equal(bottle && "from" in bottle, false);
    assert.equal(BEST_BOTTLES_PRODUCT_SHOT_LAYOUT.aspectRatio, "4:5");
    assert.equal(BEST_BOTTLES_PRODUCT_SHOT_LAYOUT.resolution, "2k");
  });

  it("cites an element id when the caption forgot it", () => {
    const prompt = buildFlux3LayoutPrompt("A bottle on a table.", [
      { id: "bottle_1", bbox: [100, 300, 800, 700], desc: "Clear glass bottle." },
    ]);
    assert.match(prompt, /<bottle_1>/);
    assert.match(prompt, /\[\{"id":"bottle_1","bbox":\[100,300,800,700\],"desc":"Clear glass bottle\."\}\]$/);
  });

  it("locks every box except the one being re-edited", () => {
    const locked = applySingleElementLock(BEST_BOTTLES_PRODUCT_SHOT_LAYOUT.elements, "light_1");
    const light = locked.find((row) => row.id === "light_1");
    const bottle = locked.find((row) => row.id === "bottle_1");
    assert.equal(light?.from, null);
    assert.equal(light?.src_bbox, null);
    assert.deepEqual(light?.tgt_bbox, [0, 0, 320, 380]);
    assert.equal(bottle?.from, "ref_image_0");
    assert.deepEqual(bottle?.src_bbox, bottle?.tgt_bbox);
    assert.deepEqual(bottle?.src_bbox, [90, 300, 860, 700]);

    const prompt = composeFlux3Prompt({
      scenePrompt: "In <ref_image_0>, change only the window light <light_1>. Keep the bottle <bottle_1> and surface <surface_1> unchanged.",
      enhancedPrompt: "ignored madison essay",
      request: {
        elements: BEST_BOTTLES_PRODUCT_SHOT_LAYOUT.elements,
        lockExceptId: "light_1",
      },
    });
    assert.equal(prompt.singleElementEdit, true);
    const rows = JSON.parse(prompt.prompt.slice(prompt.prompt.lastIndexOf(" [") + 1)) as Array<Record<string, unknown>>;
    assert.equal(rows.filter((row) => row.from === "ref_image_0").length, 2);
    assert.equal(rows.find((row) => row.id === "light_1")?.from, null);
  });

  it("rejects boxes outside the 0–1000 grid and unknown aspect ratios", () => {
    assert.throws(
      () => parseFlux3ClientRequest({
        elements: [{ id: "bottle_1", bbox: [0, 0, 1001, 500], desc: "Bottle" }],
      }),
      /0 to 1000/,
    );
    assert.throws(() => resolveFlux3AspectRatio("10:11"), /10:11/);
    assert.equal(resolveFlux3AspectRatio("4:5"), "4:5");
    assert.equal(resolveFlux3AspectRatio(""), "auto");
  });
});

describe("FLUX 3 request body", () => {
  it("emits only documented fields and maps Madison resolution names", () => {
    const body = buildFlux3RequestBody({
      prompt: "A bottle.",
      images: ["https://cdn.example.com/bottle.png"],
      aspectRatio: "4:5",
      resolution: "high",
      grounding: false,
    });
    assert.deepEqual(Object.keys(body).sort(), ["aspect_ratio", "grounding", "images", "prompt", "resolution"]);
    assert.equal(body.resolution, "2k");
    assert.equal(body.aspect_ratio, "4:5");
    assert.equal("seed" in body, false);
    assert.equal("width" in body, false);
    assert.equal("input_image" in body, false);
    assert.equal(mapMadisonResolutionToFlux3("standard"), "1k");
    assert.equal(mapMadisonResolutionToFlux3("4k"), "4k");
    assert.equal(mapMadisonResolutionToFlux3("1.5k"), "1.5k");
  });

  it("keeps at most ten public references and drops private URLs", () => {
    const inline = "a".repeat(20);
    const collected = collectFlux3ReferenceImages({
      product: ["https://cdn.example.com/bottle.png", "http://127.0.0.1/secret.png"],
      component: [],
      background: [`data:image/png;base64,${inline}`],
      style: ["https://cdn.example.com/light.png"],
      lane: "place",
    });
    assert.deepEqual(collected.images, [
      inline,
      "https://cdn.example.com/bottle.png",
      "https://cdn.example.com/light.png",
    ]);
    assert.equal(collected.skipped.length, 1);
    assert.equal(isBflFlux3AiProvider(BFL_FLUX3_AI_PROVIDER), true);
    assert.equal(isBflFlux3AiProvider("openai-image-2"), false);
    assert.equal(flux3RequestForProvider("openai-image-2", null, "4:5"), undefined);
    assert.equal(flux3RequestForProvider(BFL_FLUX3_AI_PROVIDER, null, "10:11")?.aspectRatio, "4:5");
    assert.equal(flux3RequestForProvider(BFL_FLUX3_AI_PROVIDER, { aspectRatio: "1:1" }, "10:11")?.aspectRatio, "1:1");
  });

  it("refuses an eleventh reference", () => {
    const urls = Array.from({ length: 11 }, (_, index) => `https://cdn.example.com/${index}.png`);
    assert.throws(
      () => collectFlux3ReferenceImages({
        product: urls,
        component: [],
        background: [],
        style: [],
      }),
      /at most 10/,
    );
  });
});

it("FLUX 3 caption without boxes gets scene integration when a product is referenced", () => {
  const withRef = composeFlux3Prompt({ scenePrompt: "Bottle on limestone", enhancedPrompt: "", request: null, hasProductReference: true });
  assert.match(withRef.prompt, /^Bottle on limestone\n\n/);
  assert.match(withRef.prompt, /change only the scene light falling on it/);
  assert.match(withRef.prompt, /contact shadow/);
  const noRef = composeFlux3Prompt({ scenePrompt: "Bottle on limestone", enhancedPrompt: "", request: null });
  assert.equal(noRef.prompt, "Bottle on limestone");
});

it("FLUX 3 no-box caption carries product facts and the new relight wording", () => {
  const out = composeFlux3Prompt({
    scenePrompt: "Bottle on limestone",
    enhancedPrompt: "",
    request: null,
    hasProductReference: true,
    productFacts: "PRODUCT FACTS: The closure is fitted on the bottle.",
  });
  assert.match(out.prompt, /^Bottle on limestone\n\nPRODUCT FACTS: The closure is fitted on the bottle\.\n\nKeep the exact silhouette/);
  assert.doesNotMatch(out.prompt, /Do not copy/);
});
