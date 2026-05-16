/**
 * Best Bottles brand tokens — sourced from the Best Bottles Design System
 * handoff bundle (Claude Design, 2026-04-18) located at
 * `docs/best-bottles-brand/`. The CSS source of truth is
 * `docs/best-bottles-brand/colors_and_type.css`; this module mirrors the
 * subset Madison's prompt assembler and any Best-Bottles-themed UI need.
 *
 * Editorial identity in one breath: **quiet confidence, editorial serif on
 * warm neutrals, one accent — muted gold. "Beautifully Contained."**
 *
 * Add to this file (do not duplicate inline in prompts) so the brand
 * stays in one place. When the design system updates, update here once.
 */

/** Hex codes pulled verbatim from `:root` in colors_and_type.css. */
export const BEST_BOTTLES_COLORS = {
  /** Primary text, dark bar, footer. */
  obsidian: "#1D1D1F",
  /** Default page background — NOT white. */
  bone: "#F5F3EF",
  /** The single allowed accent. Never gradient, never paired with another bright color. */
  mutedGold: "#C5A065",
  /** Secondary text, muted copy. */
  slate: "#637588",
  /** Borders, dividers. */
  champagne: "#D4C5A9",
  /** Soft surface (cards, sections). */
  linen: "#FAF8F5",
  /** Warmer surface — used for product image stages. THIS is the catalog background. */
  travertine: "#EEE6D4",
  /** Grid wrappers, filter rails. */
  parchment: "#ECE5D8",
  /** Near-white, warm. */
  warmWhite: "#FDFBF8",
  /** Muted meta text. */
  ash: "#9A9590",
  /** Portal darker body. */
  ink: "#2C2C2E",
  /** Darker gold accent (use sparingly). */
  goldDim: "#8B6F42",
} as const;

export const BEST_BOTTLES_FONTS = {
  /** UI and body. */
  sans: '"Inter", ui-sans-serif, system-ui, sans-serif',
  /** Headlines, editorial copy. */
  serif: '"EB Garamond", ui-serif, Georgia, "Times New Roman", serif',
  /** Same as serif — display headlines. */
  display: '"EB Garamond", ui-serif, Georgia, serif',
  /** Logotype only. */
  cormorant: '"Cormorant", "EB Garamond", ui-serif, Georgia, serif',
} as const;

/**
 * Non-negotiables from the design system SKILL.md. The image-generation
 * prompts and any Best-Bottles-themed UI must respect these.
 */
export const BEST_BOTTLES_RULES = [
  "Default page background is BONE (#F5F3EF), never pure white. Cards may use warm-white (#FDFBF8) or linen (#FAF8F5).",
  "EB Garamond for all headlines and editorial copy. Inter for UI and body. Cormorant only for the logotype.",
  "Muted Gold (#C5A065) is the ONLY accent. Never gradient it. Never pair with another bright color. No navy, no teal, no red as accents.",
  "Default radius is 2px. Avoid chunky-rounded shapes. Pill (9999px) reserved for filter chips and avatars.",
  "Eyebrow labels are uppercase Inter, 12px, tracking 0.25em, semibold slate. Gold variant exists but used sparingly.",
  "Voice is precise and warm — never salesy. 'Beautifully Contained.' / 'Find your thread.' / 'Talk with Grace →' — never 'Unlock your perfect bottle!'",
  "Restrained shadows. Use shadow-sm by default; step up only on hover or for drawers.",
  "Section rhythm is 96px (--sp-24) padding on desktop.",
  "Product photography stages on parchment (#ECE5D8) or travertine (#EEE6D4) with generous padding.",
  "Editorial > promotional. If a section feels empty, solve it with scale and composition — not more content.",
] as const;

/**
 * Brand voice cues from `docs/best-bottles-brand/README.md` § Content Fundamentals.
 * Used to shape any AI-generated copy that ships under the Best Bottles brand
 * (spec-sheet headers, marketing one-pagers, label previews).
 */
export const BEST_BOTTLES_VOICE = {
  tagline: "Beautifully Contained.",
  vocabulary:
    "Aesthetic perfume-world vocabulary ('silhouette', 'atelier', 'discovery kit', 'refined 55 ml') crossed with operator-grade specificity ('Type III cosmetic', 'thread size', 'fitment verified', 'no tariff surprises'). Never whimsical, never slangy.",
  address:
    "Reader as 'you' in CTAs and microcopy. Brand as 'we'/'our'. Avoid first-person singular ('I').",
  casing: {
    eyebrow: "UPPERCASE with wide tracking (0.25em)",
    headline: "Title Case or sentence case in serif — never all-caps",
    button: "UPPERCASE with wide tracking",
    body: "Sentence case",
    logotype: "BEST BOTTLES — uppercase Cormorant semibold",
  },
  rhythm: "Em dashes ( — ) used liberally for editorial rhythm.",
} as const;

/**
 * Bottle families that belong to the Best Bottles catalog. Madison uses
 * this set to detect "this SKU is for Best Bottles" so the brand context
 * block can be injected into the prompt automatically. Lifted from the
 * Best Bottles design system README's family list (27 families).
 *
 * Keep in sync when new families ship in Convex's `productGroups.family`.
 */
export const BEST_BOTTLES_FAMILIES: ReadonlySet<string> = new Set([
  "Cylinder",
  "Tall Cylinder",
  "Diva",
  "Elegant",
  "Empire",
  "Boston Round",
  "Sleek",
  "Slim",
  "Circle",
  "Atomizer",
  "Apothecary",
  "Decorative",
  "Bell",
  "Diamond",
  "Teardrop",
  "Round",
  "Pillar",
  "Tulip",
  "Flair",
  "Rectangle",
  "Footed Rectangular",
  "Tall Rectangular",
  "Square",
  "Vial",
  "Cream Jar",
]);

/** Convenience: is this family part of the Best Bottles catalog? */
export function isBestBottlesFamily(family: string | null | undefined): boolean {
  if (!family) return false;
  return BEST_BOTTLES_FAMILIES.has(family);
}

/**
 * Returns the BRAND CONTEXT prompt section to prepend onto Best Bottles
 * generation prompts. Gives the image model explicit guardrails about
 * Best Bottles' visual language so generated catalog imagery matches the
 * design system instead of defaulting to generic "premium glassware."
 *
 * Critically, this also tells the model what NOT to do: the legacy
 * Best Bottles catalog (pre-2026) used heavy navy borders, bold sans-serif
 * banners, and a brash "Beauty Packaging Experts" treatment. The new
 * design system explicitly retires that aesthetic. The prompt block
 * names this so gpt-image-2 doesn't regress to it.
 */
export function buildBestBottlesBrandBlock(): string {
  return [
    "BRAND CONTEXT — BEST BOTTLES VISUAL LANGUAGE:",
    "The bottle in the output is sold by Best Bottles, a premium glass-bottle and packaging brand. The visual language is editorial restraint, warm neutrals, and quiet confidence. Treat the rendering style as if it were photographed for a 2026-era luxury fragrance catalog, not a wholesale supplier brochure.",
    "",
    "Brand surface palette (use ONLY these approved surfaces as backgrounds and surrounding tones):",
    `- Bone ${BEST_BOTTLES_COLORS.bone} — primary catalog background and current Madison grid hero plate`,
    `- Travertine ${BEST_BOTTLES_COLORS.travertine} — warmer product stage (preferred for catalog tiles)`,
    `- Parchment ${BEST_BOTTLES_COLORS.parchment} — slightly cooler grid wrapper`,
    `- Linen ${BEST_BOTTLES_COLORS.linen} — soft card surface`,
    `- Warm white ${BEST_BOTTLES_COLORS.warmWhite} — near-white when needed`,
    "",
    `Single allowed accent (use sparingly, never as a flood): Muted Gold ${BEST_BOTTLES_COLORS.mutedGold}. Never gradient it. Never pair it with a second bright color. The bottle's own glass + cap colors are the visual focus; brand color only enters via subtle accent (a thin rule, an editorial mark, a label flourish — and only when explicitly requested).`,
    "",
    "Typography (where any text appears in the output — labels, spec callouts, headers):",
    "- Serif headlines: EB Garamond Medium (500). Editorial, slightly old-world, never decorative.",
    "- Sans-serif body / UI: Inter Regular or Medium. Clean, neutral, tightly tracked.",
    "- Logotype only: Cormorant Semibold uppercase, used exclusively for the BEST BOTTLES wordmark.",
    "- Eyebrow labels: Inter Semibold 12px, UPPERCASE, tracking 0.25em.",
    "",
    "Voice (any in-image copy):",
    "- Editorial, never promotional. 'Beautifully Contained.' / 'Find your thread.' — never 'Best Quality!' or 'Premium Glass!!'",
    "- Operator-grade specificity ('Type III cosmetic', 'thread size 18-415', 'fitment verified') — never marketing fluff.",
    "- Em dashes ( — ) for rhythm.",
    "",
    "Forbidden patterns (the legacy Best Bottles wholesale catalog used these — they are explicitly retired):",
    "- NO navy blue borders, banners, or accents anywhere.",
    "- NO heavy sans-serif logotypes (e.g., chunky bold black 'BESTBOTTLES' wordmarks).",
    "- NO 'Beauty Packaging Experts' tagline or any tagline other than 'Beautifully Contained.'",
    "- NO double-bordered frames around the canvas (the legacy catalog used a thick navy outer frame plus a thin inner frame — both are off-brand now).",
    "- NO call-to-action chrome (phone numbers, web URLs, 'Click here', star ribbons like '1,000+ BOTTLE STYLES'). The new brand is restrained — no shouty marketing chrome.",
    "- NO bright color blocks behind product photos. Stage on bone, travertine, parchment, or linen only. For current grid hero production, use Bone exactly; no sage, green, or olive cast.",
    "- NO sales-flyer composition. The output should read as a 2026 luxury fragrance editorial, not a 2010 wholesale supplier sheet.",
    "",
    'Editorial principle: "Less. Quieter. More air. Editorial > promotional. If a section feels empty, solve it with scale and composition, not more content."',
  ].join("\n");
}
