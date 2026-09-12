-- Sanity destinations follow the real Best Bottles schema.
--
-- The homepage_hero and product_family_hero rows targeted a document type,
-- marketingHeroAsset, that does not exist in the deployed Best Bottles
-- schema. The homepage keeps its hero, family cards, Start Here cards,
-- mobile category cards and mega-menu panels as inline arrays/objects on ONE
-- homepagePage document, so a placement addresses one element by _key.
--
-- target_field_path is now a template ("heroSlides[_key==$slideKey].image")
-- resolved from the picked target's metadata; target_list_query lists the
-- pickable targets. publish_mode = 'draft' lands the change on drafts.<id>
-- for an editor to publish from Studio.

-- homepage_hero: desktop image on one slide
update public.sanity_destination_registry set
  sanity_document_type = 'homepagePage',
  selector_query = '*[_type == $documentType && !(_id in path("drafts.**"))][0]{_id, _type}',
  selector_params = '{}'::jsonb,
  required_metadata = '["slideKey"]'::jsonb,
  target_field_path = 'heroSlides[_key==$slideKey].image',
  target_list_query = '*[_type == "homepagePage" && !(_id in path("drafts.**"))][0].heroSlides[]{"label": coalesce(headline, "Untitled slide"), "metadata": {"slideKey": _key}, "hasImage": defined(image)}',
  publish_mode = 'draft',
  description = 'Desktop hero image for one slide of the homepage slider (homepagePage.heroSlides[].image, 1920x1080 or larger). Lands as a draft for an editor to publish.'
where id = '2b2d0b7a-1d58-4f52-943c-a9dea76a3865';

-- product_family_hero: the design family card on the homepage carousel
update public.sanity_destination_registry set
  sanity_document_type = 'homepagePage',
  selector_query = '*[_type == $documentType && !(_id in path("drafts.**"))][0]{_id, _type}',
  selector_params = '{}'::jsonb,
  required_metadata = '["cardKey"]'::jsonb,
  target_field_path = 'designFamilyCards[_key==$cardKey].image',
  target_list_query = '*[_type == "homepagePage" && !(_id in path("drafts.**"))][0].designFamilyCards[] | order(order asc){"label": coalesce(title, family) + " · " + family, "metadata": {"cardKey": _key, "familySlug": family}, "hasImage": defined(image)}',
  publish_mode = 'draft',
  description = 'Image for one bottle-family card in the homepage Design Families carousel (homepagePage.designFamilyCards[].image, 600x800 portrait). Lands as a draft.'
where id = '6504b046-283a-4e20-a4df-c342bf6165d1';

-- New homepage destinations. Inserted only if absent for this org/profile.
insert into public.sanity_destination_registry
  (id, organization_id, destination_key, schema_profile, is_active, publish_mode, requires_image,
   sanity_document_type, selector_query, selector_params, required_metadata,
   target_field_path, target_list_query, description)
select gen_random_uuid(), v.* from (values
  ('4ab1ac72-cd7e-4faf-9152-5aa5f2862411'::uuid, 'homepage_hero_mobile', 'best-bottles', true, 'draft', true,
   'homepagePage',
   '*[_type == $documentType && !(_id in path("drafts.**"))][0]{_id, _type}',
   '{}'::jsonb, '["slideKey"]'::jsonb,
   'heroSlides[_key==$slideKey].mobileImage',
   '*[_type == "homepagePage" && !(_id in path("drafts.**"))][0].heroSlides[]{"label": coalesce(headline, "Untitled slide"), "metadata": {"slideKey": _key}, "hasImage": defined(mobileImage)}',
   'Portrait hero image for one slide, shown on phones (homepagePage.heroSlides[].mobileImage, 1080x1920). Lands as a draft.'),
  ('4ab1ac72-cd7e-4faf-9152-5aa5f2862411'::uuid, 'homepage_start_here_card', 'best-bottles', true, 'draft', true,
   'homepagePage',
   '*[_type == $documentType && !(_id in path("drafts.**"))][0]{_id, _type}',
   '{}'::jsonb, '["cardKey"]'::jsonb,
   'startHereCards[_key==$cardKey].image',
   '*[_type == "homepagePage" && !(_id in path("drafts.**"))][0].startHereCards[]{"label": coalesce(title, "Untitled card"), "metadata": {"cardKey": _key}, "hasImage": defined(image)}',
   'Image for one Guided Browsing card (homepagePage.startHereCards[].image, 600x400). Lands as a draft.'),
  ('4ab1ac72-cd7e-4faf-9152-5aa5f2862411'::uuid, 'homepage_mobile_category_card', 'best-bottles', true, 'draft', true,
   'homepagePage',
   '*[_type == $documentType && !(_id in path("drafts.**"))][0]{_id, _type}',
   '{}'::jsonb, '["cardKey"]'::jsonb,
   'mobileCategoryCards[_key==$cardKey].image',
   '*[_type == "homepagePage" && !(_id in path("drafts.**"))][0].mobileCategoryCards[]{"label": coalesce(label, "Untitled card"), "metadata": {"cardKey": _key}, "hasImage": defined(image)}',
   'Image for one Shop-by-Application card shown on mobile (homepagePage.mobileCategoryCards[].image, 400x500 portrait). Lands as a draft.'),
  ('4ab1ac72-cd7e-4faf-9152-5aa5f2862411'::uuid, 'homepage_mega_menu_panel', 'best-bottles', true, 'draft', true,
   'homepagePage',
   '*[_type == $documentType && !(_id in path("drafts.**"))][0]{_id, _type}',
   '{}'::jsonb, '["panel"]'::jsonb,
   'megaMenuPanels.$panel.featuredImage',
   '[{"label": "Bottles dropdown", "metadata": {"panel": "bottles"}, "hasImage": defined(*[_type == "homepagePage" && !(_id in path("drafts.**"))][0].megaMenuPanels.bottles.featuredImage)}, {"label": "Closures dropdown", "metadata": {"panel": "closures"}, "hasImage": defined(*[_type == "homepagePage" && !(_id in path("drafts.**"))][0].megaMenuPanels.closures.featuredImage)}, {"label": "Specialty dropdown", "metadata": {"panel": "specialty"}, "hasImage": defined(*[_type == "homepagePage" && !(_id in path("drafts.**"))][0].megaMenuPanels.specialty.featuredImage)}]',
   'Featured image for the Bottles, Closures or Specialty dropdown (homepagePage.megaMenuPanels.<panel>.featuredImage, 400x300). Lands as a draft.')
) as v(organization_id, destination_key, schema_profile, is_active, publish_mode, requires_image,
       sanity_document_type, selector_query, selector_params, required_metadata,
       target_field_path, target_list_query, description)
where not exists (
  select 1 from public.sanity_destination_registry r
  where r.organization_id = v.organization_id
    and r.destination_key = v.destination_key
    and r.schema_profile = v.schema_profile
);
