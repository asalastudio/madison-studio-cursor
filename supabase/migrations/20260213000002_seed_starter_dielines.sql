-- ═══════════════════════════════════════════════════════════════════════════════
-- THE PRESS - SEED STARTER DIELINE TEMPLATES
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Populates the Madison Library with 3 essential dieline templates for fragrance brands
--
-- Created: February 13, 2026
-- ═══════════════════════════════════════════════════════════════════════════════

-- Template 1: 50ml Perfume Box (Tuck-End)
INSERT INTO public.dieline_templates (
  id,
  organization_id,
  name,
  description,
  category,
  subcategory,
  dimensions,
  dieline_svg,
  panel_zones,
  source,
  source_url,
  thumbnail_url,
  is_public
) VALUES (
  'c8e8f4b0-1234-4a5b-8c9d-1234567890ab',
  NULL,
  '50ml Perfume Box - Tuck End',
  'Standard tuck-end box for 50ml perfume bottles. Classic fragrance packaging format with front, back, and side panels.',
  'perfume_box',
  'tuck_end_50ml',
  '{
    "width_mm": 50,
    "height_mm": 150,
    "depth_mm": 50,
    "bleed_mm": 3,
    "safe_zone_mm": 5,
    "units": "mm"
  }'::jsonb,
  '/dielines/50ml-perfume-box-tuck-end.svg',
  '[
    {"id": "front", "name": "Front Panel", "type": "printable", "width_mm": 50, "height_mm": 150, "primary": true},
    {"id": "back", "name": "Back Panel", "type": "printable", "width_mm": 50, "height_mm": 150, "primary": true},
    {"id": "left", "name": "Left Side", "type": "side", "width_mm": 50, "height_mm": 150},
    {"id": "right", "name": "Right Side", "type": "side", "width_mm": 50, "height_mm": 150},
    {"id": "top", "name": "Top Panel", "type": "printable", "width_mm": 50, "height_mm": 50},
    {"id": "bottom", "name": "Bottom Panel", "type": "printable", "width_mm": 50, "height_mm": 50},
    {"id": "top-flap", "name": "Top Flap", "type": "flap"},
    {"id": "bottom-flap", "name": "Bottom Flap", "type": "flap"},
    {"id": "glue-tab", "name": "Glue Tab", "type": "glue"}
  ]'::jsonb,
  'madison_library',
  NULL,
  '/dielines/thumbnails/50ml-perfume-box.jpg',
  true
) ON CONFLICT (id) DO NOTHING;

-- Template 2: 10ml Roller Bottle Box (Small Format)
INSERT INTO public.dieline_templates (
  id,
  organization_id,
  name,
  description,
  category,
  subcategory,
  dimensions,
  dieline_svg,
  panel_zones,
  source,
  source_url,
  thumbnail_url,
  is_public
) VALUES (
  'd9f9f5c1-2345-4b6c-9d0e-2345678901bc',
  NULL,
  '10ml Roller Bottle Box - Small Format',
  'Compact box for 10ml roller bottles. Perfect for perfume oils, attar, and travel-size fragrances. Includes optional window cutout.',
  'roller_box',
  'small_format_10ml',
  '{
    "width_mm": 30,
    "height_mm": 100,
    "depth_mm": 30,
    "bleed_mm": 3,
    "safe_zone_mm": 5,
    "units": "mm"
  }'::jsonb,
  '/dielines/10ml-roller-box-small.svg',
  '[
    {"id": "front", "name": "Front Panel", "type": "printable", "width_mm": 30, "height_mm": 100, "primary": true, "features": ["window_cutout"]},
    {"id": "back", "name": "Back Panel", "type": "printable", "width_mm": 30, "height_mm": 100, "primary": true},
    {"id": "left", "name": "Left Side", "type": "side", "width_mm": 30, "height_mm": 100},
    {"id": "right", "name": "Right Side", "type": "side", "width_mm": 30, "height_mm": 100},
    {"id": "top", "name": "Top Panel", "type": "printable", "width_mm": 30, "height_mm": 30},
    {"id": "bottom", "name": "Bottom Panel", "type": "printable", "width_mm": 30, "height_mm": 30},
    {"id": "top-flap", "name": "Tuck Flap", "type": "flap"},
    {"id": "glue-tab", "name": "Glue Tab", "type": "glue"}
  ]'::jsonb,
  'madison_library',
  NULL,
  '/dielines/thumbnails/10ml-roller-box.jpg',
  true
) ON CONFLICT (id) DO NOTHING;

-- Template 3: Perfume Bottle Label (Wraparound)
INSERT INTO public.dieline_templates (
  id,
  organization_id,
  name,
  description,
  category,
  subcategory,
  dimensions,
  dieline_svg,
  panel_zones,
  source,
  source_url,
  thumbnail_url,
  is_public
) VALUES (
  'e0a0a6d2-3456-4c7d-0e1f-3456789012cd',
  NULL,
  'Perfume Bottle Label - Wraparound',
  'Full wraparound label for perfume bottles. 360° coverage with front display panel and back information panel. Includes overlap zone for seam.',
  'label',
  'wraparound_200mm',
  '{
    "width_mm": 200,
    "height_mm": 80,
    "bleed_mm": 3,
    "safe_zone_mm": 5,
    "circumference_mm": 200,
    "units": "mm"
  }'::jsonb,
  '/dielines/perfume-bottle-label-wraparound.svg',
  '[
    {"id": "front", "name": "Front Panel", "type": "printable", "width_mm": 80, "height_mm": 80, "primary": true},
    {"id": "back", "name": "Back Panel", "type": "printable", "width_mm": 80, "height_mm": 80, "primary": true},
    {"id": "left-side", "name": "Left Side Transition", "type": "side", "width_mm": 10, "height_mm": 80},
    {"id": "right-side", "name": "Right Side Transition", "type": "side", "width_mm": 10, "height_mm": 80},
    {"id": "wraparound", "name": "Wraparound Extension", "type": "side", "width_mm": 50, "height_mm": 80},
    {"id": "overlap", "name": "Overlap/Glue Zone", "type": "glue", "width_mm": 15, "height_mm": 80}
  ]'::jsonb,
  'madison_library',
  NULL,
  '/dielines/thumbnails/perfume-label-wraparound.jpg',
  true
) ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.dieline_templates IS 'Seeded with 3 Madison Library templates: 50ml perfume box, 10ml roller box, wraparound label';
