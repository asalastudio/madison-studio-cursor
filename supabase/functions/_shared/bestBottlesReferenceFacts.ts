/**
 * Product facts for Best Bottles product references.
 *
 * Library references are usually "rigged" catalog plates: the bottle with its
 * fitment, and the cap standing beside it (component-topology:
 * fitment-attached-cap-right-sidecar). Sent with no product record, the model
 * reproduced the loose cap, dropped closures and rescaled bottles freely
 * (Oct 9 14:15 PT composite). These helpers turn library tags and the SKU job
 * row into closure, capacity and relative-size facts for the prompt.
 * Dependency-free (node:test and Deno).
 */

export const FITTED_CLOSURE_LINE =
  "The closure is fitted on the bottle; any loose cap shown beside it in a reference is not a separate object and must not appear on its own.";

export const UPRIGHT_NO_OVERLAP_LINE =
  "All products stand upright on one surface, side by side, at their true relative sizes. No overlap, no tilting, no stacking, no product raised on its own riser.";

const GRACE_SKU_RE = /(?<![A-Z0-9])GB-[A-Z0-9]{2,5}-[A-Z0-9]{2,5}-\d+(?:\.\d+)?ML(?:-[A-Z0-9]{1,6}){1,4}(?![A-Z0-9])/i;

export function graceSkuFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    // keep raw
  }
  const match = decoded.match(GRACE_SKU_RE);
  return match ? match[0].toUpperCase() : null;
}

export function capacityMlFromSku(sku: string | null | undefined): number | null {
  const m = sku?.match(/-(\d+(?:\.\d+)?)ML\b/i);
  return m ? Number(m[1]) : null;
}

export interface ReferenceProductFacts {
  sku: string | null;
  displayName?: string | null;
  family?: string | null;
  capacityMl?: number | null;
  applicator?: string | null;
  color?: string | null;
  closure?: string | null;
  topology?: string | null;
  /** Rendered glass-body height in px on the shared 2080x2288 scale rig. */
  bodyTargetPx?: number | null;
  /** Embedded preset such as boston-round:60-standard. */
  glassBody?: string | null;
}

function tagValue(tags: readonly string[], prefix: string): string | null {
  const hit = tags.find((t) => t.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

export function factsFromLibraryTags(tags: readonly string[] | null | undefined): Partial<ReferenceProductFacts> {
  const list = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [];
  const sku = tagValue(list, "sku:");
  const bodyPx = Number(tagValue(list, "scale-body-target-px:"));
  const closure = tagValue(list, "prompt-closure:");
  const family = tagValue(list, "family:");
  return {
    sku: sku ? sku.toUpperCase() : null,
    topology: tagValue(list, "component-topology:"),
    closure: closure ? closure.replace(/_/g, " ") : null,
    family: family ? family.replace(/-/g, " ") : null,
    glassBody: tagValue(list, "glass-body:"),
    bodyTargetPx: Number.isFinite(bodyPx) && bodyPx > 0 ? bodyPx : null,
    capacityMl: capacityMlFromSku(sku),
  };
}

export function mergeFacts(...parts: Array<Partial<ReferenceProductFacts> | null | undefined>): ReferenceProductFacts {
  const out: ReferenceProductFacts = { sku: null };
  for (const part of parts) {
    if (!part) continue;
    for (const [key, value] of Object.entries(part)) {
      if (value !== null && value !== undefined && value !== "") {
        (out as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }
  if (out.capacityMl == null) out.capacityMl = capacityMlFromSku(out.sku);
  return out;
}

export function referenceShowsLooseCap(facts: ReferenceProductFacts): boolean {
  return typeof facts.topology === "string" && /sidecar|exploded|cap-right|cap-left|loose/i.test(facts.topology);
}

function describe(facts: ReferenceProductFacts): string {
  const name =
    facts.displayName ||
    [facts.capacityMl ? `${facts.capacityMl} ml` : null, facts.color, facts.family, "bottle"].filter(Boolean).join(" ");
  const bits = [
    facts.applicator ? `applicator: ${facts.applicator}` : null,
    facts.closure && (!facts.applicator || !facts.applicator.toLowerCase().includes(facts.closure.toLowerCase()))
      ? `closure: ${facts.closure}`
      : null,
  ].filter(Boolean);
  return bits.length ? `${name} (${bits.join("; ")})` : name;
}

/** Relative heights from the shared scale rig, else capacity ordering only. */
export function relativeSizeLine(all: ReferenceProductFacts[]): string | null {
  if (all.length < 2) return null;
  const withPx = all.filter((f) => typeof f.bodyTargetPx === "number");
  if (withPx.length === all.length) {
    const tallest = Math.max(...withPx.map((f) => f.bodyTargetPx as number));
    const parts = all.map(
      (f, i) => `Product ${i + 1} glass body ≈ ${Math.round(((f.bodyTargetPx as number) / tallest) * 100)}% of the tallest`,
    );
    return `RELATIVE HEIGHTS (from the shared scale rig): ${parts.join("; ")}.`;
  }
  const withCap = all
    .map((f, i) => ({ i, ml: f.capacityMl }))
    .filter((x): x is { i: number; ml: number } => typeof x.ml === "number");
  if (withCap.length < 2) return null;
  const sorted = [...withCap].sort((a, b) => a.ml - b.ml);
  return `RELATIVE SIZE: smallest to largest by capacity: ${sorted
    .map((x) => `Product ${x.i + 1} (${x.ml} ml)`)
    .join(" < ")}. A smaller capacity is visibly smaller; never scale bottles to match each other.`;
}

/**
 * Prompt block with per-product facts. `brandBestBottles` adds the fitted
 * closure line for every product; otherwise only when a reference shows a cap
 * off the bottle.
 */
export function buildReferenceProductFactsBlock(
  all: ReferenceProductFacts[],
  options: { brandBestBottles: boolean },
): string {
  if (all.length === 0) return "";
  const lines: string[] = ["PRODUCT FACTS (from the product record; these override what a reference appears to show):"];
  all.forEach((facts, i) => {
    lines.push(`- Product ${i + 1}: ${describe(facts)}${facts.sku ? ` [${facts.sku}]` : ""}.`);
  });
  if (options.brandBestBottles || all.some(referenceShowsLooseCap)) lines.push(`- ${FITTED_CLOSURE_LINE}`);
  const size = relativeSizeLine(all);
  if (size) lines.push(`- ${size}`);
  if (all.length > 1) lines.push(`- ${UPRIGHT_NO_OVERLAP_LINE}`);
  return `${lines.join("\n")}\n`;
}

/** True when any fact beyond a bare SKU is known. */
export function hasUsefulFacts(facts: ReferenceProductFacts): boolean {
  return Boolean(facts.sku || facts.capacityMl || facts.applicator || facts.closure || facts.topology);
}
