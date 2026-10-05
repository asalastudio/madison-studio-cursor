# FLUX 3 Image in Madison

Black Forest Labs FLUX 3 Image is a selectable provider on `generate-madison-image`. It generates and edits product imagery with layout boxes, up to 10 reference images, and native 2K or 4K output.

Official docs:

- Product: https://bfl.ai/models/flux-3-image
- Generate: https://docs.bfl.ai/flux_3/flux3_image_generate
- Bounding boxes: https://docs.bfl.ai/flux_3/flux3_image_bounding_boxes

## Secret

Name: `BFL_API_KEY`

Header sent to `https://api.bfl.ai`: `x-key`. The signed result URL is downloaded without that header. It expires after about an hour, so Madison stores the bytes in Supabase Storage immediately.

Do not commit a key. If the secret is missing, FLUX 3 requests fail with a clear error and do not fall back to Gemini or OpenAI.

Supabase edge secret (Jordan, after merge — do not deploy from this branch):

```bash
supabase secrets set BFL_API_KEY="your-key-from-the-bfl-dashboard" --project-ref likkskifwsrvszxdvufw
```

Local edge env (`.env` or the local functions env, not committed):

```bash
BFL_API_KEY=your-key-from-the-bfl-dashboard
```

Then deploy **only** `generate-madison-image`. This change does not add a database migration.

## How to try it

1. Set `BFL_API_KEY` and deploy `generate-madison-image`.
2. Dark Room or Image Editor → AI model → **FLUX 3 Image**.
3. Choosing it sets resolution to High (2K). Use 4K Ultra for a final product plate.
4. Open **FLUX 3 layout**. Use **Bottle, surface, light** for a 4:5 product shot, or add boxes yourself.
5. Attach up to 10 reference images (public https URLs or uploads). Private and loopback URLs are dropped.
6. **Re-edit one box** locks every other element to the first reference so the rest of the frame stays put. That path needs a reference image.

Best Bottles PDP primary and secondary masters stay on GPT Image 2. FLUX 3 runs for Dark Room, Image Editor, and Best Bottles marketing or scene presets. A reference-locked PDP master that asks for FLUX 3 returns a 400 instead of silently switching models.

FLUX 3 does not accept the Best Bottles `10:11` catalog ratio or older BFL fields such as `seed`, `width`, and `input_image`. Madison sends `4:5` when the canvas ratio is not in the FLUX 3 list. Supported ratios: `21:9`, `2:1`, `16:9`, `3:2`, `7:5`, `4:3`, `5:4`, `1:1`, `4:5`, `3:4`, `5:7`, `2:3`, `9:16`, `1:2`, `9:21`, `auto`.

Resolutions: Madison `standard` → `1k`, `high` → `2k`, `4k` → `4k`. Native values `768sq` and `1.5k` are also accepted on `flux3.resolution`.

## Example: Best Bottles bottle, surface, and light

`POST https://api.bfl.ai/v1/flux-3-image`

```json
{
  "prompt": "Studio product photograph. A clear glass bottle <bottle_1> stands upright and centered on a warm stone surface <surface_1>, label facing the camera. Soft daylight <light_1> falls from a tall window at the upper left. Quiet contact shadow, no extra props, no rendered type. [{\"id\":\"surface_1\",\"bbox\":[680,0,1000,1000],\"desc\":\"A warm honed limestone surface filling the lower frame, with a soft ambient contact shadow where the bottle meets the stone.\"},{\"id\":\"bottle_1\",\"bbox\":[90,300,860,700],\"desc\":\"A clear cylindrical glass bottle with the cap on, label facing the camera, centered, true product proportions, no distortion.\"},{\"id\":\"light_1\",\"bbox\":[0,0,320,380],\"desc\":\"Soft daylight from a tall window at the upper left, gentle highlights along the glass shoulder and a quiet falloff toward the right.\"}]",
  "aspect_ratio": "4:5",
  "resolution": "2k",
  "images": ["https://cdn.example.com/best-bottles/cylinder-reference.png"]
}
```

Boxes are `[y_min, x_min, y_max, x_max]` on a 0–1000 grid from the top left. Madison builds that prompt from the layout editor; callers can also send `flux3` on `generate-madison-image`:

```json
{
  "aiProvider": "bfl-flux-3-image",
  "prompt": "Studio product photograph of the bottle.",
  "aspectRatio": "4:5",
  "resolution": "high",
  "referenceImages": [
    { "url": "https://cdn.example.com/best-bottles/cylinder-reference.png", "label": "Product" }
  ],
  "flux3": {
    "aspectRatio": "4:5",
    "resolution": "2k",
    "caption": "Studio product photograph. A clear glass bottle <bottle_1> stands upright and centered on a warm stone surface <surface_1>, label facing the camera. Soft daylight <light_1> falls from a tall window at the upper left. Quiet contact shadow, no extra props, no rendered type.",
    "elements": [
      { "id": "surface_1", "bbox": [680, 0, 1000, 1000], "desc": "A warm honed limestone surface filling the lower frame, with a soft ambient contact shadow where the bottle meets the stone." },
      { "id": "bottle_1", "bbox": [90, 300, 860, 700], "desc": "A clear cylindrical glass bottle with the cap on, label facing the camera, centered, true product proportions, no distortion." },
      { "id": "light_1", "bbox": [0, 0, 320, 380], "desc": "Soft daylight from a tall window at the upper left, gentle highlights along the glass shoulder and a quiet falloff toward the right." }
    ]
  }
}
```

Single-box re-edit: set `flux3.lockExceptId` to `light_1` and include the source image. Madison turns the other rows into Keep rows (`from: "ref_image_0"`, matching `src_bbox` and `tgt_bbox`) and the chosen row into a New row.

## Follow-up

The layout control is a list of boxes, not a drag canvas. A canvas where someone draws the boxes on the frame is the next UI step.

Live calls are skipped unless `BFL_FLUX3_LIVE_SMOKE=1` and `BFL_API_KEY` are both set. CI mocks the network.
