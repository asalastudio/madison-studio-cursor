export function catalogClosureLabel(bottle: {
  isOil: boolean;
  isSpray: boolean;
}): string | null {
  if (bottle.isOil) return "dropper, roller or screw cap";
  if (bottle.isSpray) return "fine-mist sprayer";
  return null;
}

export function catalogCrossCheckLine(
  closureFromCatalog: string | null | undefined,
): string {
  if (!closureFromCatalog) return "";
  return `Catalog closure: ${closureFromCatalog}. This must match the reference; if it does not, reproduce the reference.`;
}

export function brandPaletteSetOnlyLine(
  colors: Array<{ name?: string; hex?: string }>,
): string {
  const listed = colors
    .slice(0, 5)
    .map((color) => {
      const name = color.name?.trim() || "Brand color";
      return color.hex ? `${name} (${color.hex})` : name;
    })
    .join(", ");

  return (
    `COLOR PALETTE (SET ONLY): ${listed}. ` +
    "Brand palette applies to the background and surfaces only, never to the product, glass, closure or liquid."
  );
}

export function lightingMandateBlock(mandate: string): string {
  return (
    `LIGHTING MANDATE (MANDATORY): ${mandate}\n` +
    "This is the only lighting authority."
  );
}

export function proLightingDeltaBlock(ontologySpecs: string): string {
  return (
    "USER LIGHTING DELTA (apply only if it does not conflict with the lighting mandate above):\n" +
    ontologySpecs.trim()
  );
}
