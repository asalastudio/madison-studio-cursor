# Best Bottles — Master Image Prompt Document

_Last updated: 2026-04-25_

> Companion document to `src/config/imagePresets.ts` and the Best Bottles Design System (`Best Bottles Design System.zip`). Authoritative source for AI image generation across all 2,300+ SKUs and 27 bottle families.

---

## 1. Why this document exists

Madison Studio assembles every Best Bottles image prompt from five concentric layers:

```
[GLOBAL] + [PRESET] + [SKU DATA] + [CHIPS] + [CONSTRAINTS]
```

`[PRESET]` is already locked in `imagePresets.ts` (canvas, lighting, shadow, composition, quality, negative). It is excellent and intentional. Don't change it.

This document fills the **`[SKU DATA]`** and **`[CHIPS]`** layers — the per-family / per-component / per-colorway / per-material language that gives the model enough specificity to lock geometry and avoid drift.

Without this layer, prompts drift between Aesop / Amouage / Le Labo aesthetics randomly. With it, every image rendered through Madison reads as a single coherent atelier.

---

## 2. Brand foundation (locked, applies to every prompt)

Pulled verbatim from the Best Bottles Design System. Every compiled prompt must carry these constants either by reference or as inlined language.

**Identity in one line:**
> "Beautifully Contained." — quiet confidence, editorial serif on warm neutrals, one accent: muted gold.

**Mood adjectives (always-on):**
- Refined · gallery-like · third-generation atelier · technically fluent · calm · still
- Never: salesy · whimsical · slangy · hustle-y · dramatic · fantastical

**Palette governing the photograph:**
| Token | Hex | Where it shows up in image |
|---|---|---|
| `--bone` | `#F5F3EF` | Page-level surfaces (bottle pages on web) |
| `--travertine` | `#EEE6D4` | **Default image card backdrop** — preset locks this in |
| `--parchment` | `#ECE5D8` | Alt grid backdrop |
| `--warm-white` | `#FDFBF8` | Near-white card option |
| `--linen` | `#FAF8F5` | Section surface |
| `--obsidian` | `#1D1D1F` | Hero gradient overlays only |
| `--muted-gold` | `#C5A065` | Reserved for UI / web — NEVER on the photograph itself |
| `--champagne` | `#D4C5A9` | Borders/UI only — not in photo |

**Photography aesthetic (verbatim from README):**
> Imagery is bottle-centric product photography on warm neutral backdrops — amber glass, clear/frosted glass, aluminum, cream jars, vintage atomizers. Not lifestyle shots… Warm, neutral, softly-lit, indoor studio. Amber and clear glass dominate; backdrops are bone / travertine / champagne. Never cool, never blue-hour, never black-and-white, never grainy. Bottles are the hero — people rarely appear.

**Named photographic references (style-only, never product-design):**
- **Aesop e-commerce hero photography** — defines the *style*: warm cream backdrop, single soft directional key light, single-subject composition, gallery-like restraint, no lifestyle context.
- **Kinfolk magazine still-life** — defines the *spirit*: slow editorial pace, contemplative mood, considered single-subject framing, time-stops feel.
- **Diptyque catalog** (secondary, for family-hero / editorial layer only) — adds slight warmth and painterly feel when more atmosphere is welcome.
- **Amouage drama** (secondary, marketing/campaign layer only) — dark backdrops, jewel-toned, never on the catalog grid.

These are baked into `SHARED_QUALITY_LANGUAGE` in `imagePresets.ts` with explicit guardrails: "match the photographic style, not the product design." The negative-prompt block prohibits the model from rendering Aesop bottles, Aesop labels, or Kinfolk magazine page chrome.

---

## 3. Preservation contract (the geometry-lock layer)

Every image-to-image enhancement run must inject this block. Without it, generative bleed will alter neck threads, fitment proportions, and bottle shoulders even when "denoise" looks low.

```
PRESERVATION CONTRACT — MANDATORY
- Geometry lock: match the reference image silhouette, proportions, and edge
  detail exactly. Do not alter neck thread profile, cap height, bottle width,
  fitment dimensions, dip-tube path, or any structural detail.
- Composition lock: preserve the position, scale, and rotation of every
  component as photographed. Do not re-pose, re-stage, or re-frame.
- Identity lock: this is a [family] [capacity] [colorway]. Render only
  the materials and finishes specified. Do not add, remove, or substitute
  components.
- Enhancement only: improve glass clarity, refraction realism, material
  fidelity, and lighting nuance. Do NOT regenerate the subject from scratch.
- Image-to-image strength target: 0.25–0.35 denoise (enhancement, not
  re-creation). If the model defaults higher, lower it.
```

This block goes in BEFORE the visual foundation language so the model parses it as a constraint, not a stylistic suggestion.

---

## 4. The backdrop decision (resolved)

**Locked policy: the catalog grid uses the parchment-cream `#EEE6D4` (travertine) backdrop already specified in `GRID_CARD_2000×2200`. Single surface, no family variation. Period.**

Variation appears at *other* layers:

| Layer | Backdrop policy | Use case |
|---|---|---|
| **Catalog grid** (`GRID_CARD_2000×2200`) | Locked travertine `#EEE6D4` | Every product card on /shop, /family/*, /search |
| **Sanity hero** (`SANITY_HERO_928×1152`) | Locked travertine `#EEE6D4` | PDP hero, paper-doll group hero |
| **Family landing hero** (TODO: add preset) | Themed signature surface per family | One per family-landing page only |
| **Marketplace** (`SQUARE_MARKETPLACE_1800×1800`) | Locked travertine | Etsy / Faire feeds |
| **Landscape hero** (`LANDSCAPE_HERO_2400×1350`) | Travertine OR signature surface | Homepage / category banner |
| **Editorial / campaign** | No restrictions | Marketing only — not commerce |

**Why a single grid surface beats family-themed stones:**
1. Brand spec already commits to it: "imagery is bottle-centric product photography on warm neutral backdrops"
2. Catalog scannability collapses when surfaces vary — eyes re-orient instead of compare
3. Search results / saved-fitment pages mix families, so any family-specific surface becomes visual noise the moment results are heterogeneous
4. Generation cost stays bounded — one surface to render perfectly across 2,300 SKUs

**Where signature surfaces belong (the future Layer-2 preset):**
A new preset — `FAMILY_HERO_*` — should be added for each family-landing page hero. Suggested signature pairings (subject to brand-team approval; this is a starting matrix, not a decision):

| Family | Signature surface |
|---|---|
| Empire (clear glass, cuboid) | Polished travertine slab |
| Atomizer (chrome cylinder) | Brushed aged-brass plate |
| Cylindrical | Matte limestone |
| Diva / Round | Cream marble |
| Frosted variants | Unglazed porcelain |
| Apothecary | Aged oak shelf |
| Sleek | Honed concrete |
| Slim | Travertine |

These are *not* used on grid cards. Only on family-landing hero shots and editorial.

---

## 5. Lighting recipe

The preset already specifies this; reproducing here for the prompt-builder so it's available at the per-SKU layer too.

```
LIGHTING — house style
- Single soft key light from UPPER-FRONT-LEFT (~45° elevation, ~45° azimuth
  left of the camera-to-subject axis — clock position 7:30–8:00 relative to
  the bottle base)
- Gentle bounce-fill from the right at matched color temperature, no second
  hard source
- Multiple small specular highlights scattered along bottle shoulders and
  curves — broken and irregular, never a single broad CGI light stripe
- One subtle specular kicker on glass edges where geometry suggests it
- Hasselblad-grade color accuracy, neutral white balance
- Single soft window-light feel, not multi-strobe drama
- No rim light, no backlight haze, no atmospheric fog
- No flat overhead daylight

SHADOW — house style
- Soft contact shadow grounding the bottle to the floor plane
- Cast direction: shadow falls BACK-RIGHT at the 2:00–2:30 clock position
  (light at 7:30–8:00, shadow opposite — the floor plane behind and slightly
  right of the bottle base catches the shadow)
- Length: shadow extends ~30–40% of the bottle's height past the base on the
  back-right diagonal. Not directly underneath, not a long dramatic cast.
- 25–30% opacity at the densest point closest to the bottle base, fading
  to ~5% at the tip
- Soft edge throughout (single soft source = soft penumbra), never crisp
- Consistent direction across every component in a family — body, fitment,
  cap all cast to 2:00–2:30 so composited paper-doll layers read as one lit
  scene
- No dramatic cast shadow, no harsh edge, no double shadow, no shadow
  directly underneath the bottle (would suggest overhead light, off-brand)

COLOR SCIENCE
- Warm-neutral white balance (~5200K)
- Kodak Portra 400-leaning warmth without saturation push
- Deep but not crushed blacks (preserve detail at obsidian #1D1D1F level)
- Whites stay warm; never push toward cool/blue
```

**Negative against common lighting failures:** add to negatives if not already there:
- "no cool/blue light, no daylight-noon flat lighting, no studio strobe with hard shadow, no gradient banding in the backdrop, no vignette"

---

## 6. Material rendering dictionary

Reusable language modules. The compiled prompt picks 1-3 of these per SKU based on the components present.

### Glass
- **Clear flint glass** — "crystal-clear flint glass, slight cyan-leaning highlights on edges, faint internal caustics where the glass thickens at the base, no green tint, no bluish-purple reflections, base thickness visible through the bottom of the bottle, refractions of the parchment-cream backdrop reading as warm cream behind the glass walls"
- **Frosted / satin glass** — "satin frosted glass, milky translucency with even matte surface, soft frosted halo at the edge, no plastic look, no specular hot-spots, slight warm cast through the body"
- **Amber glass** — "deep cognac-amber glass, transparent enough to read as glass not plastic, internal warmth glow from refracted light, edge tone deepens to oxblood at the thickest point"
- **Cobalt glass** — "saturated cobalt blue, ultramarine through-body color, edges read slightly violet, no neon push"
- **Green glass** — "olivine to forest-green, leaf-leaning rather than blue-leaning"

### Polished metal
- **Shiny silver / chrome** — "mirror-finish chrome silver, cool-leaning highlights, sharp specular line where geometry suggests, micro-imperfections allowed at the threading"
- **Shiny gold** — "polished yellow gold finish, warm specular highlights, slight champagne undertone, never brassy or orange"
- **Shiny black** — "polished obsidian-black anodized metal, near-mirror highlights, deep but not crushed blacks"
- **Copper** — "polished copper, warm rose-gold tones, slight oxidation patina at edges to read as real metal not CGI plastic"

### Matte metal
- **Matte silver** — "anodized matte silver, powder-soft sheen, scattered diffuse highlights instead of specular line, no chrome look"
- **Matte gold** — "anodized matte gold, soft champagne sheen, no specular hot-spot"
- **Matte copper** — "anodized matte copper-rose, brushed micro-grain visible at close inspection"
- **Tall-cap variants** — same as base color, taller cap height preserved exactly per reference

### Leather wraps (reducer SKUs)
- **Black leather** — "fine-grain embossed faux black leather, soft satin sheen, gentle micro-stitching shadow at edges"
- **Brown leather** — "saddle-brown faux leather, warm tobacco undertone, fine grain"
- **Light-brown leather** — "tan/cognac faux leather, lighter than saddle, slight warmth"
- **Pink leather** — "dusty-rose faux leather, soft warm pink, satin matte"
- **Ivory leather** — "off-white ivory faux leather, cream undertone, fine grain"

### Soft goods (vintage atomizer family)
- **Woven bulb fabric** — "tightly knit thread sphere, micro-mesh visible at close range, individual threads resolved at the highlight, soft fabric matte rather than plastic, gentle pressure dimples preserved per reference"
- **Tassel cord** — "soft silk fringe, individual strands resolved, gentle natural drape, slight sheen on individual fibers"
- **Atomizer hose** — "fabric-wrapped flexible hose, woven texture, smooth curve as photographed, no kinks added"
- **Rubber bulb (interior)** — "soft black rubber, low specular, flexible compressed-air feel"

### Plastic (caps / closures)
- **Phenolic plastic black/white** — "matte phenolic plastic, no chrome bleed, fine mould seam at the thread allowed (not CGI-perfect), warm undertone, never glossy enough to read as metal"
- **Clear acrylic overcap** — "transparent acrylic with the same refraction quality as glass, slight warmer cast than the glass body, micro-imperfections preserved"

---

## 7. Family modules

One per bottle family in the catalog (27 total per Brand System). Each module includes: silhouette description, neck thread, signature characteristic, geometry constraints. Modules combine with the Preservation Contract — they describe what the model is photographing, not what to invent.

> **Note on scope:** Only families I have direct catalog evidence for are written below. Remaining families need module drafts; flag for brand-team review. List at end of this section.

### Empire 50ml
> Square-shouldered cuboid, sharp 90° vertical edges, beveled neck shoulder, 18-415 thread. Clear flint glass. Width 37±0.5mm × body height 88±1mm × cap-on height 103±2mm. Reads as substantive without being heavy.

### Empire 100ml
> Same Empire silhouette as 50ml but taller; 18-415 thread maintained for fitment compatibility. Height-to-width ratio increases — appears slimmer in proportion. Clear flint glass.

### Atomizer 5ml
> Tall narrow cylindrical metal atomizer, 13-400 internal thread, fixed pump cap. Visible exterior is an opaque metal finish layer. Not leather-wrapped. Slim variant exists with reduced diameter.

### Atomizer 10ml
> Same construction as 5ml but ~30% taller and slightly wider. Single-piece appearance with integrated pump.

### Cylindrical 30ml (18-415)
> Symmetrical cylinder with rounded shoulder, 18-415 thread. Clear flint glass. Body diameter visibly wider than the neck — silhouette is bottle-shaped, not tube-shaped.

### Slim 50ml
> Tall slim rectangular silhouette, narrower face than Empire, 18-415 thread. Clear flint glass. Reads as taller and more elegant than Empire 50ml at the same capacity.

### Diva (clear) 100ml
> Curvy waisted bottle, soft shoulders, decorative profile, 18-415 thread. Clear flint glass. Most "feminine" silhouette in the catalog.

### Round (clear) 128ml
> Spherical body with short neck, 18-415 thread. Clear flint glass. Reads as substantial / apothecary-leaning.

### Round Frosted 128ml
> Same silhouette as Round (clear) but in satin frosted glass. Diffuse milky glass appearance, soft halo edge.

### Elegant Frosted 100ml
> Tall elegant frosted glass with tapered shoulder, 18-415 thread.

### Sleek 100ml
> Modern slim flat-faced rectangular silhouette, 18-415 thread. Clear flint glass.

### Bell 12ml (13-415)
> Bell-shaped silhouette, 13-415 thread. Clear glass, miniature.

### Tulip 5ml Amber / Clear (13-415)
> Tulip-flared silhouette, narrow neck, 13-415 thread. Variants in amber and clear flint.

### Royal 13ml (13-415)
> Squat octagonal-shouldered silhouette, 13-415 thread. Clear flint glass.

### Queen 10ml (13-415)
> Round-shouldered miniature, 13-415 thread. Clear flint glass.

### Flair 15ml (13-415)
> Rounded flair silhouette, 13-415 thread. Clear flint glass.

### Footed Rectangular 10ml / 15ml (13-415)
> Rectangular body with a small foot/plinth at the base, 13-415 thread. Clear flint glass.

### Tall Rectangular 10ml (13-415)
> Tall rectangular silhouette, 13-415 thread. Clear flint glass.

### Tall Cylinder 9ml (13-415)
> Slim tall cylinder, 13-415 thread. Clear flint glass.

### Daisy 10ml (13-415)
> Decorative daisy-petal-form base, 13-415 thread. Clear flint glass.

### Square 15ml (13-415)
> Cube-form glass, 13-415 thread. Clear flint glass.

### Circle 15ml / 30ml (13-415)
> Round disc-form, 13-415 thread. Clear flint glass.

### Amber 5ml Cylinder / Clear 5ml Cylinder / Blue 5ml Cylinder (13-415)
> Mini cylinder silhouette, 13-415 thread. Glass color per name (amber, clear, blue).

### Sleek 5ml / 8ml (13-415)
> Smaller sleek rectangular silhouette, 13-415 thread.

### 18-415 Boston Round / 20-400 Boston Round (1oz / 2oz)
> Classic apothecary Boston Round silhouette, amber or clear glass.

### Cream Jars
> Wide-mouth squat jar, 70-400 or similar large thread, screw-top closure. Clear or frosted glass.

### Apothecary
> Tall apothecary-style bottle with elongated neck, 18-415 thread. Clear flint glass.

### Decorative / Hearts / 8mm Deco Hearts
> Decorative heart-shaped silhouettes, miniature.

### Vials
> Test-tube-style miniature vials with cork or screw cap.

### 20-410 Aluminum
> Aluminum-bodied bottle, 20-410 thread.

### Plastic 1oz / 10ml
> PET plastic bottles, frosted-finish appearance.

### Roll-on 30ml / 50ml
> Cylindrical roll-on bottle, integrated steel/glass ball at neck, 18-415 thread.

### Small Spray 3ml / 4ml
> Miniature glass with attached spray pump.

### 8-425 5ml Elegant
> Tall slim 5ml elegant silhouette, 8-425 micro-thread.

### 13-400 Atomizer (5ml / 10ml)
> Metal travel atomizer (see Atomizer entries above).

### Aerial / Side Views
> Reference photography only — not a SKU family. Flag if encountered in the catalog feed.

**Pending modules (need brand-team confirmation of silhouette language):** any family above where the silhouette description is one line — those should be expanded with measurement-grade specifics like Empire 50ml has.

---

## 8. Component / fitment modules

Fitments swap across compatible thread sizes. The same fitment (e.g., bulb-tassel-black) renders identically regardless of which bottle family it docks onto, as long as thread sizes match. Therefore fitment modules are **family-agnostic**.

### Reducer
> Solid cylindrical cap with leather or metal-finish wrap, sits flush on the neck collar, no visible thread, simple geometric profile. Cap height varies by SKU (regular vs tall variants).

### Lotion pump
> Curved actuator head over chrome cylindrical stem, integrated dispenser tip, dip tube reaches to bottle base. Pump head reads as functional rather than decorative.

### Perfume spray pump
> Cylindrical chrome housing with flat or slightly domed actuator, fine atomizer nozzle visible at the top edge, dip tube reaches bottle base. Smaller and more refined than lotion pump.

### Antique bulb sprayer (no tassel)
> Woven fabric sphere directly attached to a chrome collar with vintage-style nozzle. No hose; bulb sits immediately on the collar nozzle. The "minimalist" antique sprayer SKU.

### Antique bulb sprayer with tassel
> Woven fabric sphere connected to chrome collar nozzle by a curved fabric-wrapped hose. Tassel of soft fringe hangs from the base of the bulb. Four visible parts: collar nozzle, hose, bulb, tassel. Most ornamental fitment in the catalog.

### Dropper
> Glass pipette extending into bottle, soft rubber bulb at the top in a colored finish (typically chrome / gold / copper to match the SKU). Visible bulb sits proud above the collar.

### Roll-on (steel ball)
> Steel ball seated in a chrome housing at the bottle neck, designed for skin application. Ball sits flush in the housing.

### Cap / closure (generic)
> Phenolic plastic or metal cap, screw-thread fit, simple cylindrical or domed top.

### Overcap (clear acrylic)
> Transparent acrylic decorative cap that fits over the pump assembly, glass-like refraction. Used on lotion-clear-overcap SKUs.

### Glass stopper
> Solid glass plug stopper, ground-glass fit, decorative finial top.

---

## 9. Colorway modifiers

Combine with material module + family module. Color tokens stay simple (one or two words). The material module above does the heavy rendering work.

| Color token | Visual cue |
|---|---|
| `black` | True black, rich obsidian-leaning, low chroma |
| `gold` | Warm yellow gold |
| `silver` | Cool neutral silver |
| `copper` | Warm rose-gold |
| `white` | Cream-warm white, never paper-white |
| `red` | Brick-red leaning warm, never orange-red |
| `pink` | Dusty rose, never hot pink |
| `lavender` | Muted dusty lavender, low saturation |
| `blue` | Periwinkle / muted blue, never electric |
| `green` | Sage / olive, never lime |
| `ivory` | Cream-leaning off-white |
| `matte-silver` | Soft anodized silver |
| `shiny-silver` | Mirror chrome silver |
| `matte-gold` | Soft anodized champagne-gold |
| `shiny-gold` | Polished warm gold |
| `matte-copper` | Soft anodized rose |
| `shiny-black` | Polished obsidian |
| `black-leather` | Embossed faux leather, true black |
| `brown-leather` | Saddle-brown faux leather |
| `light-brown-leather` | Tan/cognac faux leather |
| `pink-leather` | Dusty rose faux leather |
| `ivory-leather` | Off-white cream faux leather |
| `clear-overcap` | Transparent acrylic decorative cap |

Pattern variants (atomizer family):
| Pattern token | Cue |
|---|---|
| `dots` | Repeating polka pattern in foil/print on the metal cylinder |
| `stars` | Star pattern, foiled |
| `hearts` | Heart pattern, foiled |

---

## 10. Negative prompt template

Append to every generation. This block expands the existing `negativeLanguage` in `imagePresets.ts` with brand-specific failure modes from the Best Bottles Design System.

```
NEGATIVES — universal
- No label, no text, no badge, no watermark, no brand name, no logo
- No props, no secondary product, no flowers, no botanical elements
- No hands, no people, no human elements
- No spray mist, no liquid in motion, no droplets except as natively photographed
- No chrome-CGI sheen on plastic caps; phenolic plastic must read as plastic
- No transparent or checkerboard background
- No broad central reflection stripe on the glass body — highlights are
  scattered and irregular
- No cool / blue light, no blue-hour, no daylight-noon flat lighting
- No studio strobe with hard shadow, no rim light, no backlight haze
- No gradient banding in the backdrop, no vignette, no atmospheric fog
- No film grain, no painterly artifacts, no Instagram filter look
- No bluish-purple gradients (Best Bottles never uses this gradient family)
- No emoji of any kind anywhere
- No hand-drawn illustration overlay, no repeating decorative pattern
  (except on dot/stars/hearts atomizers as authentic SKU pattern)
- No surface texture, no stone, no wood, no fabric, no horizon line, no
  implied tabletop on grid-card preset
- No people, no lifestyle context on grid-card preset
- No deformation, no proportion changes, no extra components, no missing
  components, no melted edges, no asymmetry that isn't in the reference
- No fantasy elements, no surrealism, no rendered CGI plastic look
```

---

## 11. Compiled prompt recipe

The Madison prompt assembler should produce per-SKU prompts following this formula:

```
{PRESERVATION_CONTRACT}

{BRAND_FOUNDATION}
"Beautifully Contained." — Best Bottles editorial product photography.
Quiet confidence, gallery-like restraint, third-generation atelier feel.

{PRESET_BLOCK}
[from imagePresets.ts: lightingLanguage + shadowLanguage + compositionLanguage
 + qualityLanguage]

{SKU_DATA}
Subject: {family.silhouette_description} in {capacity}.
Neck thread: {family.neck_thread}.
Geometry: {family.dimensions}. Match reference exactly.

{COMPONENT_DATA — one block per visible component}
For each fitment present:
- Component: {component.name}
- Description: {component_module.description}
- Material: {material_module.full_description}
- Color: {colorway_module.description}

{NEGATIVES}
[from §10 above + preset.negativeLanguage]

{TECHNICAL FOOTER}
- Aspect: {preset.aspect_ratio}
- Backdrop: parchment-cream {preset.backgroundHex}
- Image-to-image strength: 0.25–0.35
- Reference image: {sku.reference_png_url} (anchor; do not regenerate subject)
```

### Worked example — `empire-50ml-bulb-tassel-black`

```
PRESERVATION CONTRACT
Match the reference image silhouette and proportions exactly. Do not alter
neck thread profile, cap height, bottle width, fitment dimensions, dip-tube
path, or any structural detail. Preserve the position, scale, and rotation
of every component as photographed. Render only the materials and finishes
specified. Image-to-image strength 0.25–0.35.

BRAND FOUNDATION
"Beautifully Contained." Best Bottles editorial product photography.
Quiet confidence, gallery-like restraint.

PRESET — paper-doll-component-1500x1300
Single soft key light from upper-front-left (~45° elevation, clock position
7:30–8:00 relative to the bottle base), with gentle bounce-fill from the
right at matched color temperature; identical lighting direction across
every component layer in this family; Hasselblad-grade color accuracy,
neutral white balance.
Soft contact shadow casting BACK-RIGHT at the 2:00–2:30 clock position
(opposite the light source), extending ~30–40% of the bottle's height past
the base on the back-right diagonal, 25–30% opacity at the densest point,
soft penumbra. Component rendered at canonical z-anchor so layers composite
at (0,0). Bottle body anchored at canvas x=1000.

Photographed in the editorial style of Aesop e-commerce hero photography
crossed with Kinfolk magazine still-life — warm cream backdrop, single soft
directional key light, single-subject composition, gallery-like restraint,
slow editorial pace, considered and contemplative. MATCH THE PHOTOGRAPHIC
STYLE ONLY — the subject is the Empire 50ml glass bottle from the reference
image. Faint mould seam at the base allowed — real pressed-glass
micro-imperfections, not CGI-perfect.

SKU DATA
Subject: Empire 50ml — square-shouldered cuboid, sharp 90° vertical edges,
beveled neck shoulder, 18-415 thread, clear flint glass. Width 37±0.5mm
× body height 88±1mm. Match reference exactly.

COMPONENT — Antique bulb sprayer with tassel (black colorway)
Woven fabric sphere connected to chrome collar nozzle by a curved
fabric-wrapped hose. Tassel of soft silk fringe hangs from the base of the
bulb. Four visible parts: chrome collar, fabric hose, woven bulb, tassel.

MATERIALS
- Glass: crystal-clear flint, slight cyan-leaning highlights on edges, faint
  internal caustics where the glass thickens at the base, no green tint.
- Chrome collar / nozzle: mirror-finish chrome silver, cool-leaning
  highlights, sharp specular line where geometry suggests.
- Hose / bulb / tassel: tightly knit black thread; individual threads
  resolved at the highlight; soft fabric matte; tassel of soft silk fringe
  with strands resolved.

COLORWAY: black — true black, rich obsidian-leaning, low chroma.

NEGATIVES
[full §10 block]

Aspect: 15:13 portrait. Backdrop: parchment-cream #EEE6D4. Reference image
anchor: empire-50ml-bulb-tassel-black.png. Image-to-image strength
0.25–0.35.
```

---

## 12. Implementation notes for Madison Studio

### Wiring this into `src/config/imagePresets.ts`

Add a new file `src/config/imagePromptModules.ts` that exports:

```ts
export const PRESERVATION_CONTRACT = "...";
export const BRAND_FOUNDATION = "...";
export const FAMILY_MODULES: Record<FamilyId, FamilyModule>;
export const COMPONENT_MODULES: Record<ComponentId, ComponentModule>;
export const MATERIAL_MODULES: Record<MaterialId, MaterialModule>;
export const COLORWAY_MODIFIERS: Record<ColorwayId, ColorwayModule>;
export const UNIVERSAL_NEGATIVES: string;

export function compilePrompt(sku: SKU, presetId: ImagePresetId): string;
```

The `compilePrompt` function does the assembly per the recipe in §11. Madison's image-generation routes (`generate-images-clean.ts`, `enhance-image.ts`, etc.) should call `compilePrompt(sku, presetId)` instead of hand-rolling prompts.

### QA checklist for generated images

Before any image is committed to Sanity / shipped to bestbottles.com:

- [ ] Geometry: bottle silhouette matches reference within 2% tolerance (use SSIM or pixel-diff against the source PNG)
- [ ] Backdrop: parchment-cream `#EEE6D4` (sample 4 corner pixels)
- [ ] Lighting: shadow is grounded contact-only, no harsh edge, ≤30% opacity
- [ ] Material: glass reads as glass (visible refraction through body)
- [ ] No bluish-purple anywhere in the frame
- [ ] No emoji, no text, no logo, no hands
- [ ] Fitment fully visible (bulb-tassel and similar wide assemblies not clipped on the 1500×1300 wide preset)
- [ ] Face palette samples within tolerance of bone / travertine / champagne range — no cool-leaning shifts

### When a new family is added to the catalog

1. Photograph the SKU per the existing studio standard (matching the reference imagery already in `reference-images/`)
2. Run the PSD-extraction pipeline (`extract_*.py` in `outputs/`) to produce the layered components
3. Add a new `FamilyModule` entry to `imagePromptModules.ts` with silhouette description + measurement-grade dimensions
4. Confirm thread-size compatibility with existing fitment library
5. Add to the family taxonomy in this document (§7)

### When a new colorway / material is added

1. Add a `ColorwayModule` or `MaterialModule` entry to `imagePromptModules.ts`
2. Include the visual rendering language (see §6, §9 for examples)
3. Update the negative-prompt block ONLY if the new color introduces a failure mode (e.g., a new neon color that needs "no electric saturation" added)

### Known gaps (to address)

- **Family-hero preset is not yet in `imagePresets.ts`.** When the brand team approves Layer-2 themed surfaces (§4), add presets like `FAMILY_HERO_EMPIRE_2400×1350`, etc. Each has the same lighting/shadow/quality language, only `compositionLanguage` and `backgroundDescription` change.
- **Many family modules in §7 are one-line stubs.** Full measurement-grade descriptions need brand-team confirmation per family. Empire 50ml is the gold standard.
- **No `FrostedFamilyModule` distinction is implemented in `imagePresets.ts`.** Frosted variants need their own material rendering language baked into the preset's `qualityLanguage` so the model knows to render satin diffusion not crystal clarity.

---

## 13. Source documents

| Document | Path |
|---|---|
| This document | `madison-app/docs/BEST_BOTTLES_IMAGE_PROMPT_MASTER.md` |
| Image preset registry | `madison-app/src/config/imagePresets.ts` |
| Geometry constraints | `madison-app/src/config/productImageGeometry.ts` |
| Best Bottles Design System (full) | `outputs/best-bottles-design-system/` |
| Design System README | `outputs/best-bottles-design-system/README.md` |
| Design System tokens | `outputs/best-bottles-design-system/colors_and_type.css` |
| Madison Studio brand guide | `madison-app/docs/MADISON_BRAND_GUIDE.md` |
| Sibling brand (Tarife Attar) | `madison-app/docs/TARIFE_ATTAR_BRAND_GUIDE_ENHANCED.md` |
| Reference imagery | `pipeline/paper-doll/reference-images/` |
| Extracted Madison-ready PNGs | `pipeline/paper-doll/reference-images/_MADISON-UPLOAD-*/` |

---

## 14. Versioning

This document evolves with the catalog. Bump the `Last updated` header on every revision. Significant additions (new families, new presets, new material modules) should be summarized in a CHANGELOG section if the team wants traceability — flag if so.

When `imagePresets.ts` changes substantively, this doc should be reviewed in the same PR.
