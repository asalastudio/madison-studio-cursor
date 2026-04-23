# Prompt Pack — Product Image System

These prompt packs drive the modular bottle paper-doll lane. Every prompt
here is consumed by `src/lib/product-image/promptBuilders.ts`, which produces
the final prompt string. Writers can edit the strings here and in the builder
module without touching types.

## Target model: `gpt-image-2`

All prompts in this pack target **OpenAI `gpt-image-2`** (ChatGPT Images 2.0,
April 2026). Two modes are used:

- **Thinking mode** — for `body_clear_master`, every material-variant prompt,
  `clear_reflection_refine`, all retry prompts, and `assembly_preview`.
  Thinking mode reasons about geometry and spatial relationships before
  rendering, which is the specific capability that makes "preserve geometry,
  change only material" work reliably. Premium pricing; worth it for this
  lane.
- **Instant mode** — for `fitment_master` and `cap_master` component
  normalization passes, where the input is already an extracted PNG and the
  model is doing background cleanup + parchment-plate placement rather than
  geometric reasoning.

Every prompt either takes a reference image (the clear master for variants;
the extracted component for normalization) or operates standalone
(`body_clear_master`, `body_regenerated`). Reference-image-input is how
geometry is locked; the prompt text does not try to describe it.

## Universal rules (apply to every prompt in this pack)

- **Geometry preserved.** The bottle (or component) must match the canonical
  canvas center-X and bottom-anchor of the family spec.
- **Background fixed** to `#EEE6D4` parchment cream with subtle paper grain,
  soft neutral studio lighting.
- **No direct transparency generation for clear glass.** The clear body is
  rendered ON the parchment plate.
- **Clear glass must be neutral and colorless.** No blue, green, or yellow
  tint in the glass body.
- **Reflections must feel photographed.** Natural, broken, multi-faceted —
  not a clean central CGI light bar.
- **Fitments and caps are governed companion assets**, not organic extensions
  of the body. They seat naturally, are not fused.
- **Assembly must look naturally seated.** No gap or float; no penetration;
  believable shadow at the seat line.

---

## `body_clear_master`

**Purpose:** produce the canonical clear-glass body for a family. This is the
most important single asset in the lane — every other material variant is
derived from it.

```
A {family.familyName} attar bottle, cylindrical glass body,
{family.nominalCapacityMl} ml volume, photographed on a parchment cream
(#EEE6D4) background with subtle paper grain. Soft neutral studio lighting
from above and slightly to the left. The glass is completely clear,
colorless, and neutral — no blue, green, or yellow tint. Realistic
photographic reflections: natural, broken highlights on the shoulders and
body, not a single clean central stripe. Believable base thickness visible
through the bottom of the glass. Neck threads are crisp and readable.
Canvas centered horizontally, bottle bottom resting on a soft contact
shadow at the canonical anchor line. No cap, no fitment, no accessories,
no label. Editorial luxury product photography.
```

Negative prompt additions:
- `tinted glass, blue glass, green tint, yellow tint, transparent background,
  checkerboard transparency, broad central CGI reflection stripe,
  floating bottle, cap installed, fitment installed, label on bottle.`

---

## `body_cobalt_variant`

```
Using the provided clear-master image as the exact geometric reference,
tint the entire bottle body to a saturated cobalt blue (rich royal-indigo
transparent glass). Preserve the exact silhouette, neck shape, threads,
base thickness, and contact shadow — only the glass color changes. Keep
the parchment cream (#EEE6D4) background and subtle paper grain identical.
Reflections should deepen naturally with the blue tint; do not add new
highlights or change the lighting direction. No cap, no fitment, no label.
```

---

## `body_amber_variant`

```
Using the provided clear-master image as the exact geometric reference,
tint the entire bottle body to a warm amber (golden honey-brown transparent
glass). Preserve the exact silhouette, neck shape, threads, base thickness,
and contact shadow — only the glass color changes. Keep the parchment cream
(#EEE6D4) background and subtle paper grain identical. Reflections should
warm naturally with the amber tint; do not alter lighting direction or
position. No cap, no fitment, no label.
```

---

## `body_frosted_variant`

```
Using the provided clear-master image as the exact geometric reference,
convert the bottle body surface to a uniformly frosted, matte,
semi-translucent glass finish. Preserve the silhouette, neck shape, threads,
base thickness, and contact shadow. Reflections become soft diffused
highlights, not sharp mirror reflections. The glass remains colorless — it
is not tinted. Keep the parchment cream (#EEE6D4) background identical.
No cap, no fitment, no label.
```

---

## `body_swirl_variant`

```
Using the provided clear-master image as the exact geometric reference,
apply an organic multi-tone swirl pattern to the glass body — gentle
sweeping lines of amber, rose, and smoke that remain inside the silhouette
and do not bleed into the background. Preserve neck shape, threads, base
thickness, and contact shadow. Keep the parchment cream (#EEE6D4)
background identical. No cap, no fitment, no label.
```

---

## `clear_reflection_refine`

**Purpose:** retry prompt when a clear body comes back with a fake broad
reflection stripe or an implausible single central highlight.

```
Refine the provided clear-glass bottle image. The current reflections look
artificial: one broad central light stripe dominates the body. Replace with
realistic photographic highlights — multiple smaller specular highlights
scattered along the shoulder and curves, broken and irregular, consistent
with a soft overhead studio light grazing from the left. Preserve geometry,
canvas, background (#EEE6D4), neck, threads, and base thickness exactly.
The glass must remain fully neutral and colorless.
```

---

## `fitment_master`

**Purpose:** produce the canonical presentation of a fitment (sprayer, roller
ball, pump, dropper) as a standalone component image.

```
Product photograph of a {fitment.type} fitment component in isolation,
photographed on a parchment cream (#EEE6D4) background with subtle paper
grain. Soft neutral studio lighting. The fitment is shown upright, centered,
with the neck-seating collar visible at the bottom. Metal surfaces
(if present) show realistic brushed or polished detail with natural
reflections, not CGI-clean. No bottle, no cap, no hands. Editorial luxury
product photography.
```

---

## `cap_master`

**Purpose:** produce the canonical presentation of a cap (screw cap, overcap,
collar) as a standalone component image.

```
Product photograph of a {cap.type} cap component in isolation, photographed
on a parchment cream (#EEE6D4) background with subtle paper grain. Soft
neutral studio lighting from above. The cap is shown upright, centered, in
its natural orientation (threaded opening downward). Surface treatment is
{cap.surface} — realistic material detail, no CGI sheen. No bottle, no
fitment, no hands. Editorial luxury product photography.
```

---

## `assembly_preview_guidance`

**Purpose:** produce a paper-doll assembly preview combining body + fitment +
cap on the parchment plate.

```
Assemble the provided clear-master bottle body, fitment, and cap into a
single product photograph on a parchment cream (#EEE6D4) background with
subtle paper grain. Soft neutral studio lighting identical to the source
components. The fitment seats onto the bottle neck at its natural seat
depth — no gap, no fusion, no penetration. The cap sits directly on top of
the fitment, properly threaded. The composition is centered horizontally,
the bottle bottom resting on the canonical anchor line with a natural
contact shadow. Preserve every input's geometry exactly; only combine them.
No label, no secondary props.
```

---

## Retry prompts (mapped to QC failures)

These are the safe additive prompts when a QC check fails.

### `residual_tint_in_clear` (clear-body QC fail)

```
The provided clear-glass image has a visible residual {blue|yellow|green}
tint. Re-render with the glass completely neutral and colorless. Preserve
geometry, canvas, background (#EEE6D4), and lighting exactly — change only
the tint.
```

### `fake_broad_reflection_stripe` (clear-body QC fail)

See `clear_reflection_refine` above.

### `background_contamination_inside_bottle`

```
The provided image shows the parchment background bleeding through the
bottle body in a way that looks like a cutout, not a photograph. Re-render
so the glass body refracts the background realistically — the area behind
the bottle is softly visible through the glass with subtle displacement,
not a perfect pass-through.
```

### `geometry_drift`

```
The provided variant image has drifted from the clear-master silhouette
(shoulders, neck, or base differ). Re-render with the exact clear-master
silhouette preserved; only change the specified material treatment.
```

### `thread_softening`

```
The provided image has softened or blurred the neck thread detail.
Re-render with crisp, readable neck threads matching the clear-master
geometry exactly.
```

### `variant_misalignment`

```
The provided variant image is misaligned relative to the clear-master on
the canvas (off-center or wrong bottom anchor). Re-render with horizontal
center and bottom anchor matching the clear-master exactly on the parchment
cream (#EEE6D4) canvas.
```
