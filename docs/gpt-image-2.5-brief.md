# GPT Image 2.5 — what it is, and what it means for Madison

Announced 2026-09-08 (ChatGPT Images 2.5). Two API models, both
`v1/images/generations` + `v1/images/edits` + the Responses API
`image_generation` tool. Sourced from OpenAI's model pages and the image
generation guide; re-verify before relying on any number here.

## The two models

| | `gpt-image-2.5-flare` | `gpt-image-2.5-sunburst` |
|---|---|---|
| Positioning | OpenAI's default for most apps | Most capable; editing precision |
| Speed | Very fast (~50% lower latency than GPT Image 2) | Medium |
| Use for | Social/creator content, visual search, high-volume, rapid prototyping | Campaign creative, polished product imagery, multi-turn edits |
| Dated snapshot | `gpt-image-2.5-flare-2026-09-08` | `gpt-image-2.5-sunburst-2026-09-08` |

Both take text + image input and return images only. No streaming of text,
no function calling, no structured outputs.

## What actually changed vs `gpt-image-2`

1. **Two new quality tiers: `xhigh` and `max`.** Full set is
   `low | medium | high | xhigh | max | auto`, default `auto`.
   GPT Image 2 and earlier cap at `high`.
2. **Transparent backgrounds are supported.** Set `background: "transparent"`
   with `output_format: "png"` or `"webp"`. `gpt-image-2` does **not** support
   this — Madison's provider coerces transparent → opaque for 2.0 and must not
   for 2.5.
3. **Better reference-subject preservation and more reliable multi-turn edit
   instructions**, plus more natural lighting and richer texture — which is the
   part that matters for product photography.
4. **Latency roughly halved** on Flare at equal-or-better quality.

Size constraints are unchanged from `gpt-image-2`:

- both edges multiples of **16**
- aspect ratio between **1:3 and 3:1**
- neither edge over **3840px**
- total pixels between **655,360** and **8,294,400**
- anything above `2560x1440` is marked **experimental** by OpenAI

Recommended sizes remain `1024x1024`, `1536x1024`, `1024x1536`; any
`WIDTHxHEIGHT` inside the constraints is accepted.

### Madison's canvases against those constraints

| Canvas | Valid? | Note |
|---|---|---|
| `2080x2288` (catalog master, `productImageDimensions.ts`) | yes | 130×143 sixteens, 4,759,040px, ratio 10:11. Sits in OpenAI's "experimental" band above 2560×1440 — worth watching for size-related failures. |
| `2048x2048`, `2048x1152`, `1152x2048` (high tier) | yes | |
| `2880x2880` (4K square tier) | yes, exactly at the ceiling | 8,294,400px is the documented maximum. |
| `3840x2160` / `2160x3840` (4K tier) | yes | Max edge exactly 3840. |
| `1000x1300` (paper-doll composition canvas) | n/a | Local composition canvas — never sent to OpenAI. 1000 is not a multiple of 16, so do not pass it as a `size`. |

## Cost model — read this before enabling `max`

Billing is **per token**, not per image:

- image output **$30 / 1M tokens**
- text input $5 / 1M ($1.25 cached)
- image input $8 / 1M ($2.00 cached)

Token rates match GPT Image 2, but **token consumption does not** — the same
quality label can cost a different amount on 2.5, and OpenAI explicitly says
the GPT Image 2 calculator does not estimate 2.5 consumption. Read `usage` off
real responses rather than trusting any constant. Streaming costs an extra
~100 image output tokens per partial image (`partial_images`, 0–3).

This is why `mapResolutionToQuality` maps Madison's "4k" label to `xhigh`, not
`max`. `max` is an explicit `quality` override only.

## Rate limits (images per minute, by usage tier)

| Tier | TPM | IPM |
|---|---|---|
| 1 | 100,000 | 5 |
| 2 | 250,000 | 20 |
| 3 | 800,000 | 50 |
| 4 | 3,000,000 | 150 |
| 5 | 8,000,000 | 250 |

Batch runners (`bestbottles:generation:run-family`, the paper-doll cut
scripts) should be sized against IPM, not TPM. Also note both models may
require API Organization Verification.

## What is wired in Madison today

Selectable everywhere the OpenAI group is offered:

- `aiProvider` values `openai-image-2.5-sunburst` and `openai-image-2.5-flare`
  (plus `gpt-image-2.5-*` and `openai-gpt-image-2.5-*` aliases) in
  `generate-madison-image`
- `AI_MODEL_OPTIONS` (`src/config/imageSettings.ts`) and the Dark Room
  Pro Settings provider list
- the paper-doll candidate provenance allowlists, so a 2.5-generated component
  candidate can be recorded

Defaults are unchanged: `DEFAULT_IMAGE_AI_PROVIDER` is still
`openai-image-2`, and `OPENAI_IMAGE_MODEL` still defaults to `gpt-image-2`.

## What is deliberately NOT wired

**The Best Bottles reference-locked lane stays pinned to `gpt-image-2`.**
`generate-madison-image` hard-assigns it, and
`_shared/bestBottlesRenderingContract.ts` types it as `"gpt-image-2"`.

That pin is load-bearing. The Bone `#F5F3EF` canvas, the ambient-contact
shadow policy, the light contract, and the ±2px registration tolerances in the
paper-doll rig were all validated against `gpt-image-2` output. Swapping the
model changes lighting and texture — which is the *point* of 2.5, and exactly
why it cannot be a silent bump. A migration needs:

1. a side-by-side plate run on a fixed SKU set (Flare and Sunburst vs 2.0),
2. re-running the shadow/rig QA gates (`shadowQa`, `rigReview`,
   `bestBottlesRigPostprocessPolicy`) against the new output,
3. a real `usage`-based cost read at the chosen quality and size, and
4. a contract-version bump rather than an in-place edit.

### Transparency: why the paper-doll lane still renders opaque

2.5 can emit true transparency, and it is tempting to use it for component
layers. Don't — `clampDecodedMaterialToAuthority` overwrites the generated
alpha with the reviewed authority mask byte-for-byte and QA's the two for exact
equality. Generated alpha is discarded by design: that is the geometry gate
which guarantees a render can never change a silhouette. Worse, a transparent
render leaves unpainted RGB in the cleared regions, and the clamp samples RGB
across the scaled source bounds — so mask-edge pixels could pick up fringe.
An opaque render guarantees painted RGB under every mask pixel.

`generate-paper-doll-component` therefore sends `background: "opaque"` for every
model and varies only `quality` (`xhigh` on 2.5, `high` on gpt-image-2).

Separately, transparent Best Bottles *reference inputs* were retired on
2026-06-22 and `generate-madison-image` hard-rejects them — the live contract is
flattened exports with the original background. 2.5's transparency does not
reopen that path either.
