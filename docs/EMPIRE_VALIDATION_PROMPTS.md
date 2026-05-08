# Empire — Grid Card Validation Prompts (9 SKUs)

_Last updated: 2026-04-25_

> Companion to `BEST_BOTTLES_IMAGE_PROMPT_MASTER.md`. This document contains the 9 representative Empire SKU prompts that Madison's `assemblePrompt()` produces when these SKUs are run through the `grid-card-2000x2200` preset. Use for audit, ChatGPT parallel validation, or manual testing.
>
> **You do not need to copy these into Madison.** The pipeline auto-generates them at Generate-time from `imagePresets.ts` + `familyShapeDescriptors.ts` + `applicatorShapeDescriptors.ts` + Convex SKU data. This doc is the exact-form audit reference.

## Validation set

| # | SKU | Style | Reference image (assembled-view PSD) |
|---|---|---|---|
| 1 | `empire-50ml-reducer-black-leather` | Reducer w/ leather cap | `4. GBEmp50RdcrBlkLthr.psd` |
| 2 | `empire-50ml-dropper-silver` | Dropper | `51. GBEmp50DrpSl.psd` |
| 3 | `empire-50ml-bulb-black` | Antique bulb sprayer | `39. GBEmp50AnSpBlk.psd` |
| 4 | `empire-50ml-bulb-tassel-black` | Antique bulb sprayer with tassel | `48. GBEmp50AnSpTslBlk.psd` |
| 5 | `empire-50ml-perfume-pump-shiny-silver` | Perfume spray pump | `29. GBEmp50SpryShnSl.psd` |
| 6 | `empire-100ml-reducer-black-leather` | Reducer w/ leather cap | `4. GBEmp100RdcrBlkLthr.psd` |
| 7 | `empire-100ml-bulb-black` | Antique bulb sprayer | `39. GBEmp100AnSpBlk.psd` |
| 8 | `empire-100ml-bulb-tassel-black` | Antique bulb sprayer with tassel | `48. GBEmp100AnSpTslBlk.psd` |
| 9 | `empire-100ml-perfume-pump-shiny-silver` | Perfume spray pump | `29. GBEmp100SpryShnSl.psd` |

> ⚠ **No `empire-100ml-dropper-*` SKU exists.** Empire 100ml doesn't ship with droppers; the original PSD set in `22. Empire Bottle 100ml/1. Empire 100ml PSD/` contains zero `*Drp*.psd` files. If a 10th validation SKU is wanted, substitute `empire-100ml-lotion-shiny-silver` (similar pump-style component).

## Reference paths

PSD source folder for 50ml SKUs:
```
reference-images/2. 18-415 Bottles/21. Empire 50ml/1. Empire 50ml PSD/
```

PSD source folder for 100ml SKUs:
```
reference-images/2. 18-415 Bottles/22. Empire Bottle 100ml/1. Empire 100ml PSD/
```

For ChatGPT validation, render each PSD to PNG first (Photoshop "Save As PNG" works, or `psd-tools`). The PSD's full visible composite is the right reference — that's the assembled studio shot of the bottle + fitment + cap.

---

## Compiled prompts

Each prompt below is what `assemblePrompt({ presetId: "grid-card-2000x2200", sku })` produces. Sections: `[GLOBAL]` + `[PRESET]` + `[SKU]` + `[CONSTRAINTS]`, separated by blank lines.

The **`[GLOBAL]`** and **`[CONSTRAINTS]`** blocks are identical across all 9 prompts. They appear once below for reference; in the Madison output they're prepended/appended automatically. The per-SKU prompts in §1–9 only show the **`[PRESET]` + `[SKU]`** middle section that varies.

### Universal blocks (apply to all 9)

#### `[GLOBAL]` — first block of every prompt

```
GLOBAL SYSTEM:
You are a high-end product photography engine specialized in luxury glass perfume bottles.

NON-NEGOTIABLE RULES:
- Preserve exact geometry and proportions of the product
- No warping, stretching, or redesigning the bottle shape
- Maintain physically accurate glass behavior (refraction, reflection, transparency)
- Lighting must be realistic and consistent with physical studio or natural conditions
- Avoid artificial, CGI, or plastic-looking outputs

VISUAL QUALITY:
- Photo-realistic, editorial-grade output
- High dynamic range, no clipped highlights
- Subtle imperfections allowed for realism (faint mould seam, tooling marks at the base)

COMPOSITION RULES:
- The product remains the focal point
- Clean framing, no clutter
- Maintain consistent scale across images

If a request conflicts with realism or geometry, prioritize realism and product accuracy.
```

#### `[CONSTRAINTS]` — last block of every prompt

```
CONSTRAINT LAYER:
- Do not modify bottle proportions under any circumstances
- Maintain the camera angle defined by the preset (front-facing, eye-level, 85mm product lens at f/8 unless otherwise stated)
- Keep the bottle centered unless the preset explicitly specifies otherwise
- Do not exaggerate thickness, curvature, or reflections
- Ensure all reflections align with the environment and light source described by the preset

SCALING CONSISTENCY:
- Every SKU rendered through this preset must appear as if photographed in the same studio system
- Maintain consistent lighting ratios across all renders
- Maintain visual uniformity across batch outputs — no per-image art direction drift

OUTPUT RULES:
- Never add labels, text, badges, watermarks, packaging, or brand names
- Never add hands, props, spray mist, flowers, or secondary objects
- Never render a transparent or checkerboard background unless the preset is a paper-doll component layer
```

#### `[PRESET]` — same for all grid-card SKUs (any size)

```
PRESET:
- Purpose: Catalog grid tile for bestbottles.com. Matches the current image-gen pipeline output dimensions.
- Canvas: 2080 × 2288 px, 10:11 portrait
- Background: seamless parchment-cream backdrop (#EEE6D4) with a subtle paper grain, completely uncluttered, no gradient, no texture pattern, no vignette
- Lighting: single soft key light from upper-front-left at ~45° elevation (clock position 7:30–8:00 relative to the bottle base), with gentle bounce-fill from the right at matched color temperature — no second hard source; multiple small specular highlights scattered along the shoulder and curves — broken and irregular, never a single broad CGI light stripe; one subtle specular kicker on glass edges where geometry suggests it; single soft window-light feel, not multi-strobe drama; Hasselblad-grade color accuracy, neutral white balance
- Shadow: soft contact shadow casting BACK-RIGHT at the 2:00–2:30 clock position (opposite the upper-front-left key light), extending approximately 30–40% of the bottle's height past the base on the back-right diagonal; 25–30% opacity at the densest point closest to the bottle base, fading to ~5% at the tip; soft penumbra throughout (single soft source = soft edge), never crisp; consistent direction across every component in a family so paper-doll layers composite as one lit scene; no shadow directly underneath the bottle (would suggest overhead light, off-brand), no dramatic long cast, no double shadow, no harsh edge
- Composition: product perfectly centered horizontally; base resting at the canonical anchor line with a natural contact shadow; product fills approximately 72–78% of the vertical canvas height; generous padding on all sides so nothing feels cramped and the full product assembly (including any bulb, tassel, or sprayer extending beyond the body) remains visible inside the frame
- Quality: photo-realistic editorial luxury product photography in the style of Aesop e-commerce hero photography crossed with Kinfolk magazine still-life — warm cream backdrop, single soft directional key light, single-subject composition, gallery-like restraint, slow editorial pace, considered and contemplative; MATCH THE PHOTOGRAPHIC STYLE ONLY — the subject is the Best Bottles glass bottle from the reference image; do not invent or substitute product designs from those brands; enhanced glass clarity with realistic refraction; believable base thickness visible through the bottom of the glass; crisp readable neck threads where exposed; faint mould seam and subtle tooling marks at the base allowed — real pressed-glass micro-imperfections, not CGI-perfect
- Negatives: no label, no text, no badge, no watermark, no brand name, no props, no secondary product, no hands, no spray mist, no flowers; no chrome-CGI sheen on plastic caps; no transparent or checkerboard background; no broad central reflection stripe on the glass body; no surface texture, no stone, no wood, no fabric, no horizon line, no implied tabletop edge; no overhead-flat shadow directly beneath the bottle, no shadow cast to the left or back-left; no cool/blue light, no daylight-noon flat lighting, no rim light, no backlight haze; no Aesop bottles, no Aesop labels, no Aesop product silhouettes — Aesop is a STYLE reference only; no Kinfolk magazine page chrome (no titles, captions, page edges, fold lines, magazine bindings) — Kinfolk is a STYLE reference only; no other brand's bottle shapes — the subject is the Best Bottles bottle from the reference image only
```

### Family descriptor (used in §1–5 for 50ml and §6–9 for 100ml)

The Empire entry from `familyShapeDescriptors.ts`:

> "Tall, rectangular silhouette with flat front and back surfaces, sharp vertical edges, and a thick, heavy base. The inner panel curves gently inward near the base, creating a distinctive U-shaped inner contour. Short threaded neck with multiple visible screw threads and a slight collar at the base of the neck. Crisp prismatic geometry, not rounded."

---

## §1 — `empire-50ml-reducer-black-leather`

**Reference image:** `reference-images/2. 18-415 Bottles/21. Empire 50ml/1. Empire 50ml PSD/4. GBEmp50RdcrBlkLthr.psd` (rendered to PNG)

**`[SKU]` block:**
```
SUBJECT:
- Family: Empire
- Capacity: 50 ml (1.7 fl oz)
- Body: clear flint glass — tall rectangular silhouette with flat front and back surfaces, sharp vertical edges, thick heavy base, U-shaped inner contour curving gently inward near the base. Short threaded neck with multiple visible screw threads and a slight collar at the base of the neck. Crisp prismatic geometry, not rounded.
- Body dimensions: 37±0.5mm width × 88±1mm body height × 103±2mm cap-on height.
- Neck thread: 18-415.
- Fitment: Reducer — a small threaded reducer cap that screws onto the bottle neck. Restricts the bottle opening to a small drip orifice for splash application. Cap top is in the specified colorway/material. NO bulb. NO sprayer mechanism. NO dip tube. NO atomizer. Simple closure with a reduced central opening.
- Cap material: fine-grain embossed BLACK faux leather wrap, soft satin sheen, gentle micro-stitching shadow at edges. Polished chrome silver collar at the base where the cap meets the neck.
- Liquid: not present (empty bottle).
- Reference image attached — match silhouette and component placement EXACTLY.
```

---

## §2 — `empire-50ml-dropper-silver`

**Reference image:** `reference-images/2. 18-415 Bottles/21. Empire 50ml/1. Empire 50ml PSD/51. GBEmp50DrpSl.psd` (rendered to PNG)

**`[SKU]` block:**
```
SUBJECT:
- Family: Empire
- Capacity: 50 ml (1.7 fl oz)
- Body: clear flint glass — Empire silhouette as described above. 37±0.5mm × 88±1mm. Neck thread: 18-415.
- Fitment: Dropper — glass-eyedropper-style assembly. UNLIKE OTHER FITMENTS, the dropper KEEPS its glass pipette tube — the pipette IS the dropper's functional element, not a removable dip tube.
  COLLAR PROPORTIONS — CRITICAL: the metallized collar is a SHORT, FLAT cylindrical disk (wider than tall, similar to the bulb-sprayer collar — disk profile, not tower profile). The collar diameter is greater than the collar height. NOT tall, NOT vase-shaped, NOT chalice. Think disk, not column.
  On TOP of the collar sits a small, low-profile soft rubber bulb — round, compressible, modest size (NOT exaggerated, NOT towering). The bulb diameter is similar to the collar diameter or slightly smaller.
  From the BOTTOM of the collar, a thin clear glass pipette tube extends straight downward — narrow consistent diameter (standard eyedropper width, NOT a wide tube), smooth glass surface, with a slightly rounded tip at the bottom for drawing drops. The pipette length is about 2x the collar height.
- Material: collar is mirror-polished chrome SILVER (cool-leaning highlights, sharp specular line where geometry suggests); bulb is soft black rubber; pipette is clear transparent glass with subtle refraction.
- NO sprayer mechanism, NO atomizer, NO mesh, NO tassel, NO hose.
- Liquid: not present.
- Reference image attached — match silhouette EXACTLY.
```

---

## §3 — `empire-50ml-bulb-black`

**Reference image:** `reference-images/2. 18-415 Bottles/21. Empire 50ml/1. Empire 50ml PSD/39. GBEmp50AnSpBlk.psd` (rendered to PNG)

**`[SKU]` block:**
```
SUBJECT:
- Family: Empire
- Capacity: 50 ml (1.7 fl oz)
- Body: clear flint glass — Empire silhouette as described above. 37±0.5mm × 88±1mm. Neck thread: 18-415. Inside the bottle (visible through the clear glass walls with subtle refraction distortion) a thin clear plastic dip tube descends from the center of the neck opening straight downward to within a few millimeters of the interior base — the tube is part of the body for sprayer-class fitments.
- Fitment: Antique Bulb Sprayer (no tassel) — silver chrome collar with a soft mesh squeeze bulb attached DIRECTLY to one side of the collar.
  COLLAR PROPORTIONS — CRITICAL: the collar is a SHORT DISK shape, wider than it is tall, like a small tin can or hockey puck. The collar diameter is greater than the collar height. NOT a tall column, NOT vase-shaped, NOT chalice-shaped, NOT spire-like, NOT chess-piece shape. Think disk, not tower.
  The bottom edge of the collar is finely knurled/ridged for grip (where it screws onto the bottle).
  The TOP of the collar is FLAT, with a SMALL LOW-PROFILE dome finial centered on it — the finial is tiny, barely 1/4 the height of the collar itself, just a little chrome bump with a small ball on top. NO tall finial, NO multi-tier finial, NO ornate spire.
  The mesh bulb attaches to one SIDE of the collar (not the top), close to the level of the top plate, via a short fixed connector — direct attachment, NO hose, NO tube, NO cord between collar and bulb.
  NO tassel. NO Victorian or Edwardian ornamentation.
- Material: collar is polished chrome silver; bulb is BLACK woven mesh thread, tightly knit, individual threads resolved at the highlight, soft fabric matte rather than plastic.
- Modern minimalist apothecary design.
- Liquid: not present.
- Reference image attached — match silhouette EXACTLY.
```

---

## §4 — `empire-50ml-bulb-tassel-black`

**Reference image:** `reference-images/2. 18-415 Bottles/21. Empire 50ml/1. Empire 50ml PSD/48. GBEmp50AnSpTslBlk.psd` (rendered to PNG)

**`[SKU]` block:**
```
SUBJECT:
- Family: Empire
- Capacity: 50 ml (1.7 fl oz)
- Body: clear flint glass — Empire silhouette. 37±0.5mm × 88±1mm. Neck thread: 18-415. Body includes a thin clear plastic dip tube descending from the neck opening to within a few millimeters of the interior base.
- Fitment: Antique Bulb Sprayer with Tassel — identical to the plain Antique Bulb Sprayer (SHORT DISK-shaped silver chrome collar — wider than tall — with knurled bottom edge, flat top with TINY low-profile dome finial, mesh bulb attached directly to one SIDE of the collar via a short fixed connector with NO hose), PLUS a decorative silk tassel of the specified color hanging from the side of the collar opposite the bulb (or from a small loop on the collar).
  Tassel is a simple braided silk fringe, modest length (about 1.5x the bulb diameter), NOT ornate.
  NO hose between collar and bulb. NO Victorian ornamentation. NO multi-tier finials.
  Collar proportions are critical: SHORT, DISK-shaped, wider than tall — NOT a tall column or chalice.
- Material: collar is polished chrome silver; bulb is BLACK woven mesh thread (tightly knit, individual threads resolved); tassel is BLACK soft silk fringe with individual strands resolved.
- Liquid: not present.
- Reference image attached — match silhouette EXACTLY.
```

---

## §5 — `empire-50ml-perfume-pump-shiny-silver`

**Reference image:** `reference-images/2. 18-415 Bottles/21. Empire 50ml/1. Empire 50ml PSD/29. GBEmp50SpryShnSl.psd` (rendered to PNG)

**`[SKU]` block:**
```
SUBJECT:
- Family: Empire
- Capacity: 50 ml (1.7 fl oz)
- Body: clear flint glass — Empire silhouette. 37±0.5mm × 88±1mm. Neck thread: 18-415. Body includes a thin clear plastic dip tube descending from the neck opening to within a few millimeters of the interior base.
- Fitment: Perfume Spray Pump — crimped polished metal collar that fits over the bottle neck, with a small spray actuator button on top (about half the diameter of the collar) and a tiny atomizer hole in the actuator's side or front. Tall and slim profile compared to fine-mist sprayers — typically used on larger bottles.
  NO bulb. NO tassel. NO hose. NO dip tube in this fitment layer (tube belongs to the body).
- Material: collar and actuator are mirror-finish polished chrome SILVER (shiny silver), cool-leaning highlights, sharp specular line where geometry suggests, micro-imperfections allowed at the threading.
- Liquid: not present.
- Reference image attached — match silhouette EXACTLY.
```

---

## §6 — `empire-100ml-reducer-black-leather`

**Reference image:** `reference-images/2. 18-415 Bottles/22. Empire Bottle 100ml/1. Empire 100ml PSD/4. GBEmp100RdcrBlkLthr.psd` (rendered to PNG)

**`[SKU]` block:**
```
SUBJECT:
- Family: Empire
- Capacity: 100 ml (3.4 fl oz)
- Body: clear flint glass — Empire silhouette as described above, but taller proportions (height-to-width ratio increases — appears slimmer in proportion than the 50ml). Neck thread maintained at 18-415 for fitment compatibility.
- Body native dimensions: ~46mm width × ~107mm body height (cap-off) × ~132mm with cap.
- Fitment: Reducer — same description as §1, threaded reducer cap with a small drip orifice. Cap top in the specified colorway. NO bulb. NO sprayer mechanism. NO dip tube. NO atomizer.
- Material: BLACK faux leather wrap on the cap (fine grain, soft satin sheen). Polished chrome silver collar at the base where the cap meets the neck.
- Liquid: not present.
- Reference image attached — match silhouette EXACTLY.
```

---

## §7 — `empire-100ml-bulb-black`

**Reference image:** `reference-images/2. 18-415 Bottles/22. Empire Bottle 100ml/1. Empire 100ml PSD/39. GBEmp100AnSpBlk.psd` (rendered to PNG)

**`[SKU]` block:**
```
SUBJECT:
- Family: Empire
- Capacity: 100 ml (3.4 fl oz) — Empire silhouette taller proportions than 50ml. Neck thread: 18-415. Body includes a thin clear plastic dip tube descending from the neck opening.
- Fitment: Antique Bulb Sprayer (no tassel) — same description as §3.
- Material: polished chrome silver collar; BLACK woven mesh bulb.
- NO tassel, NO hose, NO Victorian ornamentation. Modern minimalist apothecary design.
- Liquid: not present.
- Reference image attached — match silhouette EXACTLY.
```

---

## §8 — `empire-100ml-bulb-tassel-black`

**Reference image:** `reference-images/2. 18-415 Bottles/22. Empire Bottle 100ml/1. Empire 100ml PSD/48. GBEmp100AnSpTslBlk.psd` (rendered to PNG)

**`[SKU]` block:**
```
SUBJECT:
- Family: Empire
- Capacity: 100 ml (3.4 fl oz) — Empire silhouette taller proportions. Neck thread: 18-415. Body includes a clear dip tube.
- Fitment: Antique Bulb Sprayer with Tassel — same description as §4.
- Material: polished chrome silver collar; BLACK woven mesh bulb; BLACK silk tassel fringe (modest length ~1.5x bulb diameter).
- NO hose between collar and bulb, NO Victorian ornamentation, NO multi-tier finials.
- Liquid: not present.
- Reference image attached — match silhouette EXACTLY.
```

---

## §9 — `empire-100ml-perfume-pump-shiny-silver`

**Reference image:** `reference-images/2. 18-415 Bottles/22. Empire Bottle 100ml/1. Empire 100ml PSD/29. GBEmp100SpryShnSl.psd` (rendered to PNG)

**`[SKU]` block:**
```
SUBJECT:
- Family: Empire
- Capacity: 100 ml (3.4 fl oz) — Empire silhouette taller proportions. Neck thread: 18-415. Body includes a clear dip tube.
- Fitment: Perfume Spray Pump — same description as §5. Crimped polished metal collar with small spray actuator on top.
- Material: mirror-finish polished chrome SILVER collar and actuator.
- NO bulb, NO tassel, NO hose, NO dip tube in this fitment layer.
- Liquid: not present.
- Reference image attached — match silhouette EXACTLY.
```

---

## How to use this document

### Path 1 — Madison batch (recommended for production)

1. Open Madison Studio Dark Room → Generate
2. Filter to Best Bottles → Empire family
3. Select each of the 9 SKUs (or multi-select if supported)
4. Pick preset: `grid-card-2000x2200`
5. Click Generate
6. Madison's `assemblePrompt()` will produce these exact prompts and call gpt-image-2 with the SKU's reference image attached
7. Outputs land in Sanity / the standard delivery flow

### Path 2 — ChatGPT manual validation (for prompt sanity-check)

For each SKU:
1. Render the source PSD to PNG (Photoshop "Save As" or `psd_tools.PSDImage(...).composite()`)
2. Open ChatGPT (gpt-image-2 / advanced image mode)
3. Upload the rendered PNG as a reference
4. Paste: `[GLOBAL]` + blank line + `[PRESET]` + blank line + the `[SKU]` block from §N + blank line + `[CONSTRAINTS]`
5. Generate
6. Inspect: did gpt-image-2 produce a 2000×2200 cream-backdrop image with the bottle centered, 2:00–2:30 shadow cast, and the right materials?
7. If yes — the prompt template is good; commit to the Madison batch
8. If no — identify the drift category (geometry / shadow / material / colorway) and patch the corresponding config file:
   - Geometry → `familyShapeDescriptors.ts`
   - Component → `applicatorShapeDescriptors.ts`
   - Lighting / shadow / mood → `imagePresets.ts`

### Path 3 — Hero image (next deliverable)

Once these 9 grid card images validate, the hero image is a separate preset (`LANDSCAPE_HERO_2400×1350`) and a separate prompt assembly. Treat as Phase 2 — same family/applicator descriptors apply, only the preset changes.

---

## QA checklist (apply to every output)

- [ ] Canvas is exactly 2080 × 2288 px
- [ ] Background is parchment-cream `#EEE6D4` — sample 4 corner pixels
- [ ] Bottle is horizontally centered (cx within ±20 px of canvas midline)
- [ ] Bottle fills 72–78% of vertical canvas height
- [ ] Shadow casts to 2:00–2:30 (back-right) — NOT directly underneath, NOT to the left
- [ ] Shadow length is 30–40% of bottle height
- [ ] Shadow opacity peaks at ~25-30% near base, fades to ~5% at tip
- [ ] No surface texture / no implied tabletop / no horizon line
- [ ] No labels, text, badges, watermarks
- [ ] No Aesop / Kinfolk product designs leaked into the output
- [ ] Glass reads as glass (visible refraction through body)
- [ ] Material colorway matches the SKU spec exactly
- [ ] Geometry matches reference within 2% tolerance (use SSIM diff if needed)
- [ ] No deformation, no extra/missing components compared to reference

---

## Files referenced

- This document: `madison-app/docs/EMPIRE_VALIDATION_PROMPTS.md`
- Master prompt doc: `madison-app/docs/BEST_BOTTLES_IMAGE_PROMPT_MASTER.md`
- Preset registry: `madison-app/src/config/imagePresets.ts`
- Family descriptors: `madison-app/src/config/familyShapeDescriptors.ts`
- Applicator descriptors: `madison-app/src/config/applicatorShapeDescriptors.ts`
- Prompt assembler: `madison-app/src/lib/product-image/promptAssembler.ts`
- OpenAI provider: `madison-app/supabase/functions/_shared/openaiProvider.ts` (gpt-image-2 default)
