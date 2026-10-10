import { supabase } from "@/integrations/supabase/client";
import {
    formToBrandProductRow,
    manualProductId,
    upsertBrandProducts,
} from "../../supabase/functions/_shared/brandProducts.ts";

interface CSVImportResult {
    updatedCount: number;
    insertedCount: number;
    failedCount: number;
}

export async function importProductsFromCSV(
    file: File,
    organizationId: string
): Promise<CSVImportResult> {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
        throw new Error("CSV file must contain at least a header row and one data row.");
    }

    const headers = lines[0].split(',').map(h => h.trim());

    const products = lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const productData: any = {
            organization_id: organizationId,
        };

        // Map CSV fields to database columns
        headers.forEach((header, index) => {
            const value = values[index]?.replace(/^"|"$/g, '').trim();
            if (!value || value === '') return;

            mapCSVFieldToProduct(header, value, productData);
        });

        // Auto-set category if not provided
        if (!productData.category) {
            productData.category = 'personal_fragrance';
        }

        return productData;
    }).filter(p => p.name);

    if (products.length === 0) {
        throw new Error("The CSV file appears to be empty or has no valid product names.");
    }

    // Live brand_products shape (org_id, product_id, specs, metadata). Rows are
    // matched to existing products by handle/name, so re-imports update in place.
    const rows = products.map((p: Record<string, unknown>) => {
        const { organization_id: _org, ...form } = p;
        return formToBrandProductRow(
            organizationId,
            manualProductId(String(p.name), typeof p.handle === "string" ? p.handle : null),
            form,
            "csv",
        );
    });
    let updatedCount = 0;
    let insertedCount = 0;
    let failedCount = 0;
    try {
        const res = await upsertBrandProducts(supabase, organizationId, rows, { preserveManual: false });
        updatedCount = res.updated;
        insertedCount = res.inserted;
    } catch (err) {
        console.error("CSV product import failed:", err);
        failedCount = rows.length;
    }

    return { updatedCount, insertedCount, failedCount };
}

function parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
            values.push(currentValue.trim());
            currentValue = '';
        } else {
            currentValue += char;
        }
    }
    values.push(currentValue.trim());

    return values;
}

function mapCSVFieldToProduct(header: string, value: string, productData: any): void {
    switch (header) {
        case 'title':
            productData.name = value;
            break;
        case 'handle':
            productData.handle = value;
            break;
        case 'collection_tier':
            productData.collection_tier = value;
            break;
        case 'scent_family_detailed':
            productData.scent_family_detailed = value;
            break;
        case 'platform_type':
            productData.platform_type = value;
            break;
        case 'platform_material':
            productData.platform_material = value;
            break;
        case 'visual_world':
            productData.visual_world = value;
            break;
        case 'visual_world_week':
            productData.visual_world_week = parseInt(value) || null;
            break;
        case 'dip_layer_moral':
            productData.dip_layer_moral = value;
            break;
        case 'color_palette_hex_codes':
            productData.color_palette_hex_codes = value;
            break;
        case 'lighting_spec':
            productData.lighting_spec = value;
            break;
        case 'lighting_direction':
            productData.lighting_direction = value;
            break;
        case 'depth_of_field':
            productData.depth_of_field = value;
            break;
        case 'composition_style':
            productData.composition_style = value;
            break;
        case 'aspect_ratio_primary':
            productData.aspect_ratio_primary = value;
            break;
        case 'shadow_treatment':
            productData.shadow_treatment = value;
            break;
        case 'image_type_primary':
            productData.image_type_primary = value;
            break;
        case 'archetype_hero_enabled':
            productData.archetype_hero_enabled = value.toLowerCase() === 'yes';
            break;
        case 'archetype_flatlay_enabled':
            productData.archetype_flatlay_enabled = value.toLowerCase() === 'yes';
            break;
        case 'archetype_lived_enabled':
            productData.archetype_lived_enabled = value.toLowerCase() === 'yes';
            break;
        case 'archetype_travel_enabled':
            productData.archetype_travel_enabled = value.toLowerCase() === 'yes';
            break;
        case 'archetype_environmental_enabled':
            productData.archetype_environmental_enabled = value.toLowerCase() === 'yes';
            break;
        case 'archetype_ritual_enabled':
            productData.archetype_ritual_enabled = value.toLowerCase() === 'yes';
            break;
        case 'hero_primary_artifacts':
            productData.hero_primary_artifacts = value;
            break;
        case 'hero_artifact_placement':
            productData.hero_artifact_placement = value;
            break;
        case 'flatlay_ingredients':
            productData.flatlay_ingredients = value;
            break;
        case 'lived_life_context':
            productData.lived_life_context = value;
            break;
        case 'travel_context':
            productData.travel_context = value;
            break;
        case 'environmental_location':
            productData.environmental_location = value;
            break;
        case 'ritual_skin_tone':
            productData.ritual_skin_tone = value;
            break;
        case 'textile_backdrop':
            productData.textile_backdrop = value;
            break;
        case 'moral_philosophy':
            productData.moral_philosophy = value;
            break;
        case 'philosophy_keywords':
            productData.philosophy_keywords = value;
            break;
        case 'semantic_categories':
            productData.semantic_categories = value;
            break;
        case 'approved_descriptors':
            productData.approved_descriptors = value;
            break;
        case 'primary_avatar':
            productData.primary_avatar = value;
            break;
        case 'avatar_motivation':
            productData.avatar_motivation = value;
            break;
        case 'use_case_primary':
            productData.use_case_primary = value;
            break;
        case 'occasion_tags':
            productData.occasion_tags = value;
            break;
        case 'transparency_statement':
            productData.transparency_statement = value;
            break;
        case 'craftsmanship_term':
            productData.craftsmanship_term = value;
            break;
        case 'ingredient_disclosure':
            productData.ingredient_disclosure = value;
            break;
        case 'notes_top':
            productData.top_notes = value;
            break;
        case 'notes_middle':
            productData.middle_notes = value;
            break;
        case 'notes_base':
            productData.base_notes = value;
            break;
        case 'longevity_hours':
            productData.longevity_hours = value;
            break;
        case 'sillage_description':
            productData.sillage_description = value;
            break;
        case 'prompt_template_id':
            productData.prompt_template_id = value;
            break;
        case 'use_case_templates':
            productData.use_case_templates = value;
            break;
    }
}
