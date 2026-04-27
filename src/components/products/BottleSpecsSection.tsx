/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BOTTLE SPECS SECTION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Packaging-tailored Product Hub section. Renders bottle-specific metadata
 * (capacity, glass color, neck thread, applicator, cap details, physical specs,
 * case quantity, external refs) for organizations whose business is bottles
 * and packaging — Best Bottles being the anchor tenant.
 *
 * Reads from product_hubs.metadata.bottle_specs (populated by
 * scripts/import-bestbottles-catalog.ts). No new schema required.
 *
 * Conditionally rendered: ProductHub.tsx should swap this in for the
 * Scent Profile / Ingredients / Compliance sections when the org is a
 * packaging company.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  Beaker,
  Ruler,
  Package2,
  Tag,
  ExternalLink,
  Layers,
  CheckCircle2,
  AlertCircle,
  Hash,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BottleSpecs {
  family?: string | null;
  shape?: string | null;
  glass_color?: string | null;
  capacity?: { ml?: number | null; oz?: number | null; display?: string | null };
  neck_thread?: string | null;
  applicator?: string | null;
  cap?: {
    color?: string | null;
    trim_color?: string | null;
    style?: string | null;
    height?: string | null;
  };
  ball_material?: string | null;
  physical?: {
    height_with_cap_mm?: number | null;
    height_without_cap_mm?: number | null;
    diameter_mm?: number | null;
    weight_g?: number | null;
  };
  packaging?: {
    case_quantity?: number | null;
    assembly_type?: string | null;
    component_group?: string | null;
    bottle_collection?: string | null;
    fitment_status?: string | null;
  };
  external_refs?: {
    grace_sku?: string | null;
    website_sku?: string | null;
    product_id?: string | null;
    image_url?: string | null;
    product_url?: string | null;
    data_grade?: string | null;
    verified?: boolean | null;
  };
}

interface BottleSpecsSectionProps {
  product: {
    metadata?: { bottle_specs?: BottleSpecs } | string | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSpecs(metadata: BottleSpecsSectionProps["product"]["metadata"]): BottleSpecs | null {
  if (!metadata) return null;
  const m = typeof metadata === "string" ? safeJsonParse(metadata) : metadata;
  return (m?.bottle_specs as BottleSpecs) ?? null;
}

function safeJsonParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Render a label/value pair, gracefully omitting empty values */
function Field({
  label,
  value,
  mono = false,
  badge = false,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
  badge?: boolean;
}) {
  if (value === null || value === undefined || value === "") {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className="text-sm text-muted-foreground/50">—</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      {badge ? (
        <Badge variant="secondary" className="w-fit">{String(value)}</Badge>
      ) : (
        <span className={cn("text-sm font-medium", mono && "font-mono")}>{String(value)}</span>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BottleSpecsSection({ product }: BottleSpecsSectionProps) {
  const specs = parseSpecs(product?.metadata);

  if (!specs) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">
              No bottle specs found. Import via{" "}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                scripts/import-bestbottles-catalog.ts
              </code>{" "}
              to populate this section.
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const cap = specs.cap ?? {};
  const physical = specs.physical ?? {};
  const packaging = specs.packaging ?? {};
  const refs = specs.external_refs ?? {};
  const cap_display = [cap.style, cap.color, cap.height].filter(Boolean).join(" · ") || null;

  return (
    <div className="space-y-6">
      {/* IDENTITY */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Bottle Identity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Family" value={specs.family} badge />
            <Field label="Shape" value={specs.shape} />
            <Field label="Glass Color" value={specs.glass_color} />
            <Field label="Bottle Collection" value={packaging.bottle_collection} />
            <Field label="Assembly Type" value={packaging.assembly_type} />
            <Field label="Component Group" value={packaging.component_group} />
          </div>
        </CardContent>
      </Card>

      {/* CAPACITY & THREAD */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Beaker className="w-4 h-4" />
            Capacity & Neck
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Capacity" value={specs.capacity?.display} />
            <Field label="ml" value={specs.capacity?.ml} mono />
            <Field label="oz" value={specs.capacity?.oz} mono />
            <Field label="Neck Thread" value={specs.neck_thread} mono badge />
          </div>
        </CardContent>
      </Card>

      {/* APPLICATOR & CAP */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Applicator & Cap
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <Field label="Applicator" value={specs.applicator} badge />
            <Field label="Ball Material" value={specs.ball_material} />
            <div /> {/* spacer */}
            <Field label="Cap Style" value={cap.style} />
            <Field label="Cap Color" value={cap.color} />
            <Field label="Cap Height" value={cap.height} />
            <Field label="Trim Color" value={cap.trim_color} />
            {cap_display && (
              <div className="col-span-2 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  Cap (Combined)
                </span>
                <span className="text-sm font-medium text-foreground">{cap_display}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* PHYSICAL DIMENSIONS */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Ruler className="w-4 h-4" />
            Physical Dimensions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field
              label="Height (with cap)"
              value={physical.height_with_cap_mm ? `${physical.height_with_cap_mm} mm` : null}
              mono
            />
            <Field
              label="Height (no cap)"
              value={physical.height_without_cap_mm ? `${physical.height_without_cap_mm} mm` : null}
              mono
            />
            <Field
              label="Diameter"
              value={physical.diameter_mm ? `${physical.diameter_mm} mm` : null}
              mono
            />
            <Field
              label="Weight"
              value={physical.weight_g ? `${physical.weight_g} g` : null}
              mono
            />
          </div>
        </CardContent>
      </Card>

      {/* PACKAGING */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package2 className="w-4 h-4" />
            Packaging
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Case Quantity" value={packaging.case_quantity} mono />
            <Field label="Fitment Status" value={packaging.fitment_status} />
          </div>
        </CardContent>
      </Card>

      {/* EXTERNAL REFS */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Hash className="w-4 h-4" />
            External References
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <Field label="Grace SKU" value={refs.grace_sku} mono badge />
            <Field label="Website SKU" value={refs.website_sku} mono />
            <Field label="Product ID" value={refs.product_id} mono />
            <Field label="Data Grade" value={refs.data_grade} />
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Verified</span>
              {refs.verified === true ? (
                <Badge variant="secondary" className="w-fit gap-1 bg-green-100 text-green-700">
                  <CheckCircle2 className="w-3 h-3" />
                  Verified
                </Badge>
              ) : refs.verified === false ? (
                <Badge variant="secondary" className="w-fit gap-1 bg-amber-100 text-amber-700">
                  <AlertCircle className="w-3 h-3" />
                  Unverified
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground/50">—</span>
              )}
            </div>
          </div>
          {(refs.product_url || refs.image_url) && (
            <>
              <Separator className="my-4" />
              <div className="flex flex-col gap-2">
                {refs.product_url && (
                  <a
                    href={refs.product_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="w-4 h-4" />
                    bestbottles.com product page
                  </a>
                )}
                {refs.image_url && (
                  <a
                    href={refs.image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Legacy hero image
                  </a>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
