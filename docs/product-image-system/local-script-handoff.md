# Local Script → Madison Handoff

The paper-doll lane does **not** parse PSD files in Madison. The operator's
existing local extraction script (the ~10-step pipeline they already run)
stays on their machine. This document defines the contract between the
script's output and Madison's Paper-Doll Drawer ingest.

## 1. The folder layout

Per PSD run, the script produces a folder containing component PNGs plus a
`manifest.json` file. Folder name is free-form but should be descriptive;
Madison reads only the manifest to identify the run.

```
cyl-9ml-17-415-run-2026-04-23-1430/        ← folder name is informational only
├── bottle.png                              ← clear body, bg removed, on canonical canvas
├── fitment-roller-ball-metal.png           ← fitment, bg removed, on canonical canvas
├── cap-screw-metal.png                     ← cap, bg removed, on canonical canvas
└── manifest.json                           ← the handshake
```

**PNG requirements** (enforced by the script, trusted by Madison):

- Transparent background (alpha channel).
- Component centered horizontally on a canvas of the size stated in
  `manifest.canonicalCanvas`.
- Component's canonical anchor Y matches the `anchorY` stated in the
  manifest's `components[]` entry for that file.

## 2. `manifest.json` — required fields

```json
{
  "manifestVersion":   "1.0",
  "runId":             "2026-04-23-1430",
  "sourceFile":        "bottle-paperdoll-v3.psd",
  "scriptVersion":     "paperdoll-extract-v2.4",

  "family":            "Cylinder",
  "capacityMl":        9,
  "threadSize":        "17-415",
  "glassColor":        "Clear",

  "canonicalCanvas":   { "widthPx": 2000, "heightPx": 2400 },
  "centerXLocked":     true,
  "bottomAnchor":      { "y": 2250 },

  "components": [
    {
      "role":     "bottle",
      "file":     "bottle.png",
      "anchorY":  2250
    },
    {
      "role":     "fitment",
      "file":     "fitment-roller-ball-metal.png",
      "type":     "roller-ball-metal",
      "anchorY":  450
    },
    {
      "role":     "cap",
      "file":     "cap-screw-metal.png",
      "type":     "screw-metal",
      "anchorY":  200
    }
  ]
}
```

### Field notes

| Field | Notes |
|---|---|
| `manifestVersion` | Madison rejects unknown versions with a clear error. Bump this if the format changes. |
| `family` | Must match a `PipelineGroup.family` value. For the pilot: `"Cylinder"`. |
| `capacityMl` | Integer. Must match `PipelineGroup.capacity_ml`. |
| `threadSize` | Must match `PipelineGroup.thread_size`. The first number (before the dash) encodes neck outer diameter in mm and is parsed by Madison at ingest time. |
| `glassColor` | For the pilot, always `"Clear"` — the script extracts the clear master; material variants are derived by Madison via `gpt-image-2`, not by the script. |
| `canonicalCanvas` | Canvas the script composited the components onto. Madison stores this in `geometry_spec.canonicalCanvas`. |
| `bottomAnchor.y` | Pixel Y coordinate of the bottle bottom. All components in the run share the same canvas and are aligned to this anchor. |
| `components[].role` | One of `"bottle"`, `"fitment"`, `"cap"`. Any other role is ignored in this pilot. |
| `components[].type` | Fitment/cap sub-type (e.g., `"roller-ball-metal"`). Used to look up default `fitmentSeatDepthMm` in Madison's config. Omitted for `bottle`. |
| `components[].anchorY` | Pixel Y coordinate where this component's natural anchor (bottle bottom / fitment collar / cap seam) sits on the canvas. |

## 3. Matching a manifest to a pipeline row

Madison matches the uploaded manifest to a `PipelineGroup` row via the composite key:

```
(organization_id, family, capacity_ml, thread_size)
```

The drawer is always opened from a specific shape group, so the expected values are known before upload. On upload, Madison:

1. Parses `manifest.json`.
2. Validates that `family` / `capacityMl` / `threadSize` match the shape group the drawer belongs to. If not, surfaces a clear error listing the expected vs. received values — the ingest is rejected with no side effects.
3. Uploads each PNG to Supabase Storage under `product-image-ingest/{organizationId}/{shapeKey}/{runId}/{file}`.
4. Writes the manifest's canvas + anchor numbers into the row's `geometry_spec`, merged with the Madison-side physical-mm defaults for the family.
5. Marks the clear body row as `is_clear_master_reference = true`, flipping off any prior clear master in the same shape group (partial unique index enforces at most one).
6. Transitions `madison_status` to `queued`, ready for variant derivation.

## 4. Failure modes and error copy

| Failure | Cause | Drawer behavior |
|---|---|---|
| `manifest.json` missing from folder | Folder is not the script's output | Reject, link to this doc |
| `manifestVersion` not recognized | Script newer than Madison, or malformed | Reject, show the version received |
| `family` / `capacityMl` / `threadSize` don't match the shape group | Wrong folder dropped on wrong row | Reject, show expected vs. received |
| A `components[].file` is missing from the folder | Script write failed | Reject, list missing files |
| PNG alpha channel missing | Script bg-removal failed | Reject, name the offending PNG |
| Canvas size mismatch between `canonicalCanvas` and PNG dimensions | Script misaligned an export | Reject, name the offending PNG |

Every rejection surfaces the specific problem and performs **no writes** —
neither to Supabase Storage nor to the `best_bottles_pipeline_groups` row.
The operator fixes upstream, re-runs the script, re-drops the folder.

## 5. Small changes the script needs to make

If the script doesn't already produce `manifest.json`, the delta is roughly:

```python
# pseudo-code — wherever the script finishes writing its PNGs
manifest = {
    "manifestVersion":  "1.0",
    "runId":            run_id,
    "sourceFile":       os.path.basename(psd_path),
    "scriptVersion":    SCRIPT_VERSION,
    "family":           family,
    "capacityMl":       capacity_ml,
    "threadSize":       thread_size,
    "glassColor":       "Clear",
    "canonicalCanvas":  { "widthPx": canvas_w, "heightPx": canvas_h },
    "centerXLocked":    True,
    "bottomAnchor":     { "y": bottom_anchor_y },
    "components":       components_list,
}
with open(os.path.join(out_dir, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=2)
```

All of these values are numbers the script already has in memory — it's just
serializing them to JSON.

## 6. What Madison does NOT expect from the script

- Does not expect the script to upload PNGs anywhere. Operator drag-drops
  the folder.
- Does not expect the script to derive material variants (cobalt / amber /
  frosted / swirl). Variants are generated by Madison via `gpt-image-2`.
- Does not expect the script to produce assembly previews. Madison composes
  those.
- Does not expect the script to call any Madison API. This is a one-way
  handoff.

## 7. Future (Phase 4, not this PR)

Deploy the script as a Supabase edge function so the operator can drop the
raw `.psd` into the drawer and the script runs in the cloud. The manifest
contract stays identical — only the trigger surface changes.
