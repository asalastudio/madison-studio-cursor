/**
 * How a product group's HERO image presents its closure.
 *
 * Most heroes show the bottle with its fitment seated and the over-cap standing
 * to the right on the same baseline — the detached sidecar. Droppers are the
 * exception (Jordan, 2026-09-19): "we don't need the dropper on the side … we're
 * just going to put the dropper inside the bottle." A pipette lying beside the
 * glass reads as a loose part, and the assembled bottle is how the product is
 * actually recognised.
 *
 * This decides two things downstream, which is why it lives in one place:
 *  - which reference role the hero is generated from, and therefore which
 *    Photoshop tree Cowork exports (`2. PSD Capped` vs `1. PSD Uncapped`);
 *  - the component topology the rig and prompt are told to expect.
 *
 * It does NOT change the shoulder target. The lock is one number per glass
 * body, and an assembled dropper shares its body's line with every sprayer,
 * pump and reducer on that glass.
 */

export type BestBottlesHeroPresentation = "detached-sidecar" | "assembled";

export type BestBottlesHeroReferenceRole = "pdp-cap-off-sidecar" | "identity-cap-on";

export type BestBottlesHeroPresentationInput = {
  groupSlug?: string | null;
  applicator?: string | null;
  websiteSku?: string | null;
};

function isDropper(input: BestBottlesHeroPresentationInput): boolean {
  const applicator = String(input.applicator ?? "").toLowerCase();
  if (/\bdropper\b|\bpipette\b/.test(applicator)) return true;
  // Group slugs end in the fitment: `slim-30ml-clear-18-415-dropper`.
  if (/(?:^|-)dropper$/.test(String(input.groupSlug ?? "").toLowerCase())) return true;
  // Website SKUs carry a `Drp` segment: `GBSlm30DrpCu`, `GBCyl25DrpGl`.
  return /Drp(?=[A-Z]|$)/.test(String(input.websiteSku ?? ""));
}

export function resolveBestBottlesHeroPresentation(
  input: BestBottlesHeroPresentationInput,
): BestBottlesHeroPresentation {
  return isDropper(input) ? "assembled" : "detached-sidecar";
}

export function resolveBestBottlesHeroReferenceRole(
  input: BestBottlesHeroPresentationInput,
): BestBottlesHeroReferenceRole {
  return resolveBestBottlesHeroPresentation(input) === "assembled"
    ? "identity-cap-on"
    : "pdp-cap-off-sidecar";
}
