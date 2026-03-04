-- Seed packaging templates with starter box types
-- Note: dieline_svg and panel_definitions will be simplified for MVP
-- Full parametric die-line generation will be handled by edge function

-- Standard Tuck End Box (most common retail box)
INSERT INTO public.packaging_templates (
  name,
  category,
  description,
  thumbnail_url,
  dieline_svg,
  panel_definitions,
  base_dimensions,
  dimension_constraints,
  material_options,
  tags,
  fefco_code,
  is_active,
  is_popular,
  sort_order
) VALUES (
  'Standard Tuck End Box',
  'tuck_end',
  'Classic retail packaging box with tuck flaps on top and bottom. Perfect for cosmetics, food products, and retail items.',
  '/templates/thumbnails/standard-tuck-end.png',
  '<svg viewBox="0 0 400 600" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="400" height="600" fill="#fff" stroke="#000"/></svg>',
  '[
    {"id": "front", "label": "Front Panel", "type": "face", "isDesignable": true, "threeDFace": "front"},
    {"id": "back", "label": "Back Panel", "type": "face", "isDesignable": true, "threeDFace": "back"},
    {"id": "left", "label": "Left Side", "type": "face", "isDesignable": true, "threeDFace": "left"},
    {"id": "right", "label": "Right Side", "type": "face", "isDesignable": true, "threeDFace": "right"},
    {"id": "top", "label": "Top Flap", "type": "flap", "isDesignable": false, "threeDFace": "top"},
    {"id": "bottom", "label": "Bottom Flap", "type": "flap", "isDesignable": false, "threeDFace": "bottom"}
  ]'::jsonb,
  '{"length": 100, "width": 50, "height": 150, "unit": "mm"}'::jsonb,
  '{"length": {"min": 50, "max": 500}, "width": {"min": 20, "max": 300}, "height": {"min": 50, "max": 600}}'::jsonb,
  ARRAY['white_board', 'kraft', 'coated'],
  ARRAY['retail', 'cosmetics', 'food', 'popular'],
  '0215',
  true,
  true,
  1
);

-- Reverse Tuck End Box
INSERT INTO public.packaging_templates (
  name,
  category,
  description,
  thumbnail_url,
  dieline_svg,
  panel_definitions,
  base_dimensions,
  dimension_constraints,
  material_options,
  tags,
  fefco_code,
  is_active,
  is_popular,
  sort_order
) VALUES (
  'Reverse Tuck End Box',
  'tuck_end',
  'Tuck flaps open in opposite directions for extra security. Popular for pharmaceutical and supplement packaging.',
  '/templates/thumbnails/reverse-tuck-end.png',
  '<svg viewBox="0 0 400 600" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="400" height="600" fill="#fff" stroke="#000"/></svg>',
  '[
    {"id": "front", "label": "Front Panel", "type": "face", "isDesignable": true, "threeDFace": "front"},
    {"id": "back", "label": "Back Panel", "type": "face", "isDesignable": true, "threeDFace": "back"},
    {"id": "left", "label": "Left Side", "type": "face", "isDesignable": true, "threeDFace": "left"},
    {"id": "right", "label": "Right Side", "type": "face", "isDesignable": true, "threeDFace": "right"}
  ]'::jsonb,
  '{"length": 100, "width": 50, "height": 150, "unit": "mm"}'::jsonb,
  '{"length": {"min": 50, "max": 500}, "width": {"min": 20, "max": 300}, "height": {"min": 50, "max": 600}}'::jsonb,
  ARRAY['white_board', 'kraft', 'coated'],
  ARRAY['pharmaceutical', 'supplements', 'secure'],
  '0210',
  true,
  true,
  2
);

-- Mailer Box (E-commerce)
INSERT INTO public.packaging_templates (
  name,
  category,
  description,
  thumbnail_url,
  dieline_svg,
  panel_definitions,
  base_dimensions,
  dimension_constraints,
  material_options,
  tags,
  fefco_code,
  is_active,
  is_popular,
  sort_order
) VALUES (
  'Mailer Box (Flip Top)',
  'mailer',
  'Self-locking mailer box perfect for e-commerce shipping. Easy to assemble, no tape required.',
  '/templates/thumbnails/mailer-box.png',
  '<svg viewBox="0 0 500 400" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="500" height="400" fill="#fff" stroke="#000"/></svg>',
  '[
    {"id": "front", "label": "Front Panel", "type": "face", "isDesignable": true, "threeDFace": "front"},
    {"id": "back", "label": "Back Panel", "type": "face", "isDesignable": true, "threeDFace": "back"},
    {"id": "lid", "label": "Lid", "type": "face", "isDesignable": true, "threeDFace": "top"},
    {"id": "base", "label": "Base", "type": "face", "isDesignable": true, "threeDFace": "bottom"}
  ]'::jsonb,
  '{"length": 200, "width": 150, "height": 75, "unit": "mm"}'::jsonb,
  '{"length": {"min": 100, "max": 600}, "width": {"min": 100, "max": 500}, "height": {"min": 50, "max": 300}}'::jsonb,
  ARRAY['kraft', 'corrugated', 'white_board'],
  ARRAY['ecommerce', 'shipping', 'subscription', 'popular'],
  null,
  true,
  true,
  3
);

-- Display Box (Open Top)
INSERT INTO public.packaging_templates (
  name,
  category,
  description,
  thumbnail_url,
  dieline_svg,
  panel_definitions,
  base_dimensions,
  dimension_constraints,
  material_options,
  tags,
  fefco_code,
  is_active,
  is_popular,
  sort_order
) VALUES (
  'Display Box (Open Top)',
  'display',
  'Retail display box with open top for showcasing products. Perfect for countertop merchandising.',
  '/templates/thumbnails/display-box.png',
  '<svg viewBox="0 0 300 400" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="300" height="400" fill="#fff" stroke="#000"/></svg>',
  '[
    {"id": "front", "label": "Front Panel", "type": "face", "isDesignable": true, "threeDFace": "front"},
    {"id": "back", "label": "Back Panel", "type": "face", "isDesignable": true, "threeDFace": "back"},
    {"id": "left", "label": "Left Side", "type": "face", "isDesignable": true, "threeDFace": "left"},
    {"id": "right", "label": "Right Side", "type": "face", "isDesignable": true, "threeDFace": "right"}
  ]'::jsonb,
  '{"length": 150, "width": 100, "height": 200, "unit": "mm"}'::jsonb,
  '{"length": {"min": 100, "max": 400}, "width": {"min": 50, "max": 300}, "height": {"min": 100, "max": 500}}'::jsonb,
  ARRAY['white_board', 'coated'],
  ARRAY['retail', 'display', 'counter'],
  null,
  true,
  false,
  4
);

-- Tray Box with Lid
INSERT INTO public.packaging_templates (
  name,
  category,
  description,
  thumbnail_url,
  dieline_svg,
  panel_definitions,
  base_dimensions,
  dimension_constraints,
  material_options,
  tags,
  fefco_code,
  is_active,
  is_popular,
  sort_order
) VALUES (
  'Tray with Lid',
  'tray',
  'Two-piece tray and lid box for premium gift packaging and luxury products.',
  '/templates/thumbnails/tray-lid.png',
  '<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="400" height="500" fill="#fff" stroke="#000"/></svg>',
  '[
    {"id": "tray_front", "label": "Tray Front", "type": "face", "isDesignable": true, "threeDFace": "front"},
    {"id": "tray_back", "label": "Tray Back", "type": "face", "isDesignable": true, "threeDFace": "back"},
    {"id": "lid_top", "label": "Lid Top", "type": "face", "isDesignable": true, "threeDFace": "top"}
  ]'::jsonb,
  '{"length": 150, "width": 150, "height": 50, "unit": "mm"}'::jsonb,
  '{"length": {"min": 100, "max": 500}, "width": {"min": 100, "max": 500}, "height": {"min": 30, "max": 200}}'::jsonb,
  ARRAY['white_board', 'coated', 'kraft'],
  ARRAY['gift', 'luxury', 'premium'],
  '0310',
  true,
  false,
  5
);

-- Crash Lock Bottom Box
INSERT INTO public.packaging_templates (
  name,
  category,
  description,
  thumbnail_url,
  dieline_svg,
  panel_definitions,
  base_dimensions,
  dimension_constraints,
  material_options,
  tags,
  fefco_code,
  is_active,
  is_popular,
  sort_order
) VALUES (
  'Crash Lock Bottom Box',
  'folding',
  'Auto-lock bottom for quick assembly, tuck-top closure. Efficient for high-volume production.',
  '/templates/thumbnails/crash-lock.png',
  '<svg viewBox="0 0 400 600" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="400" height="600" fill="#fff" stroke="#000"/></svg>',
  '[
    {"id": "front", "label": "Front Panel", "type": "face", "isDesignable": true, "threeDFace": "front"},
    {"id": "back", "label": "Back Panel", "type": "face", "isDesignable": true, "threeDFace": "back"},
    {"id": "left", "label": "Left Side", "type": "face", "isDesignable": true, "threeDFace": "left"},
    {"id": "right", "label": "Right Side", "type": "face", "isDesignable": true, "threeDFace": "right"}
  ]'::jsonb,
  '{"length": 100, "width": 50, "height": 150, "unit": "mm"}'::jsonb,
  '{"length": {"min": 50, "max": 500}, "width": {"min": 20, "max": 300}, "height": {"min": 50, "max": 600}}'::jsonb,
  ARRAY['white_board', 'kraft', 'coated'],
  ARRAY['food', 'retail', 'fast-assembly'],
  '0217',
  true,
  true,
  6
);

-- Pillow Box
INSERT INTO public.packaging_templates (
  name,
  category,
  description,
  thumbnail_url,
  dieline_svg,
  panel_definitions,
  base_dimensions,
  dimension_constraints,
  material_options,
  tags,
  fefco_code,
  is_active,
  is_popular,
  sort_order
) VALUES (
  'Pillow Box',
  'folding',
  'Curved tuck-end design creates a pillow shape. Perfect for small gifts, jewelry, and party favors.',
  '/templates/thumbnails/pillow-box.png',
  '<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg"><ellipse cx="150" cy="100" rx="140" ry="90" fill="#fff" stroke="#000"/></svg>',
  '[
    {"id": "main", "label": "Main Surface", "type": "face", "isDesignable": true, "threeDFace": "front"}
  ]'::jsonb,
  '{"length": 120, "width": 80, "height": 40, "unit": "mm"}'::jsonb,
  '{"length": {"min": 50, "max": 300}, "width": {"min": 30, "max": 200}, "height": {"min": 20, "max": 100}}'::jsonb,
  ARRAY['white_board', 'kraft', 'coated'],
  ARRAY['gift', 'jewelry', 'favor', 'small-item'],
  null,
  true,
  false,
  7
);

-- Sleeve Box
INSERT INTO public.packaging_templates (
  name,
  category,
  description,
  thumbnail_url,
  dieline_svg,
  panel_definitions,
  base_dimensions,
  dimension_constraints,
  material_options,
  tags,
  fefco_code,
  is_active,
  is_popular,
  sort_order
) VALUES (
  'Sleeve Box',
  'folding',
  'Sliding sleeve wraps around inner tray. Premium packaging for luxury products and gift sets.',
  '/templates/thumbnails/sleeve-box.png',
  '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="400" height="300" fill="#fff" stroke="#000"/></svg>',
  '[
    {"id": "sleeve_front", "label": "Sleeve Front", "type": "face", "isDesignable": true, "threeDFace": "front"},
    {"id": "sleeve_back", "label": "Sleeve Back", "type": "face", "isDesignable": true, "threeDFace": "back"},
    {"id": "sleeve_spine", "label": "Sleeve Spine", "type": "face", "isDesignable": true, "threeDFace": "left"}
  ]'::jsonb,
  '{"length": 150, "width": 50, "height": 150, "unit": "mm"}'::jsonb,
  '{"length": {"min": 100, "max": 400}, "width": {"min": 30, "max": 200}, "height": {"min": 100, "max": 400}}'::jsonb,
  ARRAY['white_board', 'coated'],
  ARRAY['luxury', 'gift', 'premium'],
  null,
  true,
  false,
  8
);

-- Gable Top Box
INSERT INTO public.packaging_templates (
  name,
  category,
  description,
  thumbnail_url,
  dieline_svg,
  panel_definitions,
  base_dimensions,
  dimension_constraints,
  material_options,
  tags,
  fefco_code,
  is_active,
  is_popular,
  sort_order
) VALUES (
  'Gable Top Box',
  'folding',
  'Box with built-in carry handle at the top. Great for takeout, party favors, and gift packaging.',
  '/templates/thumbnails/gable-box.png',
  '<svg viewBox="0 0 300 400" xmlns="http://www.w3.org/2000/svg"><path d="M0,0 L300,0 L300,350 L150,400 L0,350 Z" fill="#fff" stroke="#000"/></svg>',
  '[
    {"id": "front", "label": "Front Panel", "type": "face", "isDesignable": true, "threeDFace": "front"},
    {"id": "back", "label": "Back Panel", "type": "face", "isDesignable": true, "threeDFace": "back"},
    {"id": "left", "label": "Left Side", "type": "face", "isDesignable": true, "threeDFace": "left"},
    {"id": "right", "label": "Right Side", "type": "face", "isDesignable": true, "threeDFace": "right"}
  ]'::jsonb,
  '{"length": 100, "width": 80, "height": 120, "unit": "mm"}'::jsonb,
  '{"length": {"min": 60, "max": 300}, "width": {"min": 50, "max": 250}, "height": {"min": 80, "max": 400}}'::jsonb,
  ARRAY['white_board', 'kraft', 'coated'],
  ARRAY['takeout', 'gift', 'party-favor'],
  null,
  true,
  false,
  9
);

-- Paper Bag (Handle)
INSERT INTO public.packaging_templates (
  name,
  category,
  description,
  thumbnail_url,
  dieline_svg,
  panel_definitions,
  base_dimensions,
  dimension_constraints,
  material_options,
  tags,
  fefco_code,
  is_active,
  is_popular,
  sort_order
) VALUES (
  'Paper Bag with Handles',
  'paper_bags',
  'Retail shopping bag with twisted paper handles. Customizable for branding and promotions.',
  '/templates/thumbnails/paper-bag.png',
  '<svg viewBox="0 0 300 500" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="300" height="500" fill="#fff" stroke="#000"/></svg>',
  '[
    {"id": "front", "label": "Front Panel", "type": "face", "isDesignable": true, "threeDFace": "front"},
    {"id": "back", "label": "Back Panel", "type": "face", "isDesignable": true, "threeDFace": "back"},
    {"id": "side", "label": "Side Gusset", "type": "face", "isDesignable": true, "threeDFace": "left"}
  ]'::jsonb,
  '{"length": 250, "width": 100, "height": 300, "unit": "mm"}'::jsonb,
  '{"length": {"min": 150, "max": 500}, "width": {"min": 80, "max": 300}, "height": {"min": 200, "max": 600}}'::jsonb,
  ARRAY['kraft', 'white_board'],
  ARRAY['retail', 'shopping', 'branding'],
  null,
  true,
  false,
  10
);

-- Comment for seed data
COMMENT ON COLUMN public.packaging_templates.dieline_svg IS 'Simplified SVG for display. Full parametric generation handled by edge function.';
