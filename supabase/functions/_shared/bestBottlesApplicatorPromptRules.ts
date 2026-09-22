export interface BestBottlesApplicatorPromptRules {
  colorLabel: string;
  sourceTruth: string;
  fullVisibility: string;
  canvasBounds: string;
  glassMaterialLine: string;
  fitmentMaterialLine: string;
  textileMaterialLine?: string;
  shadowContact: string;
  forbiddenLines: string[];
}

export function buildBestBottlesApplicatorPromptRules(
  productContext?: Record<string, unknown> | null,
): BestBottlesApplicatorPromptRules {
  const applicator = typeof productContext?.applicator === "string"
    ? productContext.applicator.trim()
    : "";
  const label = applicator || "the referenced closure/fitment";
  const normalized = label.toLowerCase();

  const hasTassel = normalized.includes("tassel");
  const hasBulb = hasTassel || normalized.includes("bulb");
  const isStopper =
    normalized.includes("stopper") ||
    normalized.includes("glass rod") ||
    normalized.includes("ground glass");
  const isDropper = normalized.includes("dropper");
  const isRoller = normalized.includes("roller");
  const isSprayer =
    !hasBulb &&
    (
      normalized.includes("spray") ||
      normalized.includes("sprayer") ||
      normalized.includes("atomizer") ||
      normalized.includes("mist") ||
      normalized.includes("pump")
    );
  const isCapOrReducer =
    normalized.includes("cap") ||
    normalized.includes("closure") ||
    normalized.includes("reducer");

  const sharedNoAddedAtomizer =
    "- No added bulb, hose, tassel, atomizer, spray actuator, pump, dip tube, or detached cap unless that exact component is visibly present in Image 1.";
  const requiredDipTubeTruth =
    "visible internal dip tube inside the clear glass bottle, descending from the sprayer/collar centerline to within a few millimeters of the interior base; this tube is required product identity and must be present.";
  const sprayerPumpGlassBoundaryLine =
    "- Sprayer/pump boundary: the actuator, nozzle, collar, and pump housing belong to the top closure assembly and must remain contained under/within the cap and seated at the neck. The pump housing must not hang down the front face, float outside the glass walls, or appear as a large white cylinder below the cap. Any short white connector visible below the cap is an internal neck component seen through clear glass, not a separate visible exterior product component. Do not render it as a distinct rectangular white block below the cap. At most, show a tiny translucent neck stem hidden by the cap edge and glass lip, never as a foreground object, outside-wall object, funnel, plug, sleeve, or pump body. Only the narrow dip tube may continue below the neck into the empty clear glass bottle as a faint clean refracted line. Do not render a large white pump chamber, funnel, plug, sleeve, cloudy column, milky block, or opaque mechanism inside the clear glass body or on the outside/front of the glass wall; keep the neck/shoulder boundary clean and transparent.";
  const requiredDipTubeGlassLine =
    `- Glass: clearer transparency, visible wall thickness, refined refraction, crisp vertical edge glints, tiny rim sparkles on lip and base, realistic base weight, visible separation between front wall, back wall, and the visible internal dip tube. The dip tube must be present and must descend to within a few millimeters of the interior base. No fake bevels or plastic glass. ${sprayerPumpGlassBoundaryLine}`;
  const paleCapVisibilityLine =
    "White, clear, translucent, or pale cap/actuator/over-cap surfaces must remain visible against the Bone background: preserve the rim ellipse, top lip, sidewall edges, nozzle face, subtle gray/cream edge density, tiny specular rim highlights, and local contact shadow. If a detached over-cap is present, it stays readable as a full upright cap object, not a faint ghost cylinder.";

  if (hasTassel) {
    return {
      colorLabel: "Cap / hose / bulb / tassel color",
      sourceTruth:
        `exact bottle body, bulb, hose, tassel, cap/collar, trim, ${requiredDipTubeTruth} glass thickness, silhouette, proportions, component relationships, colors, and material identity.`,
      fullVisibility: "Keep the full product visible, including full bulb, hose, and tassel.",
      canvasBounds:
        "No cap, bulb, hose, bottle base, tassel strands, shadow, or tassel end may touch or leave the canvas. This is one assembled photograph with no cap-off sidecar.",
      glassMaterialLine: requiredDipTubeGlassLine,
      fitmentMaterialLine:
        "- Cap/collar/metal: preserve the exact bulb-sprayer collar, connector rings, trim finish, visible internal dip tube connection, and cap state from Image 1; polish metal with nuanced black/white reflection-card gradients, realistic depth, and no broad CGI stripe.",
      textileMaterialLine:
        "- Textile: sharper weave/thread detail in hose, bulb, and tassel; tactile dimensional softness; locked textile color remains accurate and rich, not crushed or gray.",
      shadowContact: "bottle base, bulb, tassel, and hose contact points",
      forbiddenLines: [
        "- No new colors, color drift, substituted cap/tassel colors, changed textile color, changed metal finish, new bottle shape, changed angle, changed cap height, changed body width/depth, missing internal dip tube, or changed product proportions.",
        "- No zoomed-in crop, scale inflation, cropped tassel, cropped bulb, or product edge touching the canvas.",
      ],
    };
  }

  if (hasBulb) {
    return {
      colorLabel: "Cap / hose / bulb color",
      sourceTruth:
        `exact bottle body, bulb, hose, cap/collar, trim, ${requiredDipTubeTruth} glass thickness, silhouette, proportions, component relationships, colors, and material identity. No tassel may be added unless Image 1 shows one.`,
      fullVisibility: "Keep the full product visible, including full bulb and hose.",
      canvasBounds:
        "No cap, bulb, hose, bottle base, shadow, or product edge may touch or leave the canvas. This is one assembled photograph with no cap-off sidecar.",
      glassMaterialLine: requiredDipTubeGlassLine,
      fitmentMaterialLine:
        "- Cap/collar/metal: preserve the exact bulb-sprayer collar, connector rings, trim finish, visible internal dip tube connection, and cap state from Image 1; polish metal with nuanced black/white reflection-card gradients, realistic depth, and no broad CGI stripe.",
      textileMaterialLine:
        "- Textile: sharper weave/thread detail in hose and bulb; tactile dimensional softness; locked textile color remains accurate and rich, not crushed or gray. No tassel unless Image 1 shows one.",
      shadowContact: "bottle base, bulb, and hose contact points",
      forbiddenLines: [
        "- No new colors, color drift, substituted cap/bulb colors, changed textile color, changed metal finish, new bottle shape, changed angle, changed cap height, changed body width/depth, missing internal dip tube, or changed product proportions.",
        "- No zoomed-in crop, scale inflation, cropped bulb, added tassel, or product edge touching the canvas.",
      ],
    };
  }

  if (isStopper) {
    return {
      colorLabel: "Glass stopper / closure color",
      sourceTruth:
        `exact bottle body, ${label}, glass thickness, silhouette, proportions, component relationships, colors, and material identity. Preserve the solid ground-glass stopper/plug form exactly; no bulb, hose, tassel, atomizer, pump, spray actuator, or dip tube may be added.`,
      fullVisibility: `Keep the full product visible, including the full ${label} and bottle base.`,
      canvasBounds:
        `No ${label}, bottle base, shadow, or product edge may touch or leave the canvas.`,
      glassMaterialLine:
        "- Glass: clearer transparency, visible wall thickness, refined refraction, crisp vertical edge glints, tiny rim sparkles on lip, stopper, and base, realistic base weight, and visible separation between front and back walls. No fake bevels, plastic glass, or invented dip tube.",
      fitmentMaterialLine:
        `- Stopper/closure: preserve the exact ${label} shape from Image 1: solid glass, tapered ground-glass plug seated in the neck, decorative finial top as photographed, no mechanism, no tube, no sprayer, no bulb, no hose, no tassel.`,
      shadowContact: "bottle base and any stopper/closure contact points visible in the reference",
      forbiddenLines: [
        "- No new colors, color drift, substituted stopper/closure color, changed glass finish, new bottle shape, changed angle, changed stopper height, changed body width/depth, or changed product proportions.",
        "- No zoomed-in crop, scale inflation, cropped stopper, cropped bottle base, or product edge touching the canvas.",
        sharedNoAddedAtomizer,
      ],
    };
  }

  if (isDropper) {
    return {
      colorLabel: "Dropper / cap color",
      sourceTruth:
        "exact bottle body, dropper collar, rubber bulb, glass pipette, trim, glass thickness, silhouette, proportions, component relationships, colors, and material identity. No hose, tassel, atomizer, or sprayer may be added.",
      fullVisibility: "Keep the full product visible, including the full dropper assembly and bottle base.",
      canvasBounds:
        "No dropper, pipette, bottle base, shadow, or product edge may touch or leave the canvas.",
      glassMaterialLine:
        "- Glass: clearer transparency, visible wall thickness, refined refraction, crisp vertical edge glints, tiny rim sparkles on lip and base, realistic base weight, and exact pipette shape if visible. No fake bevels or plastic glass.",
      fitmentMaterialLine:
        "- Dropper: preserve the exact collar, rubber bulb, and glass pipette from Image 1; no sprayer, atomizer, hose, bulb sprayer, or tassel.",
      shadowContact: "bottle base and dropper contact points visible in the reference",
      forbiddenLines: [
        "- No new colors, color drift, substituted dropper/cap colors, changed metal or rubber finish, new bottle shape, changed angle, changed cap height, changed body width/depth, or changed product proportions.",
        "- No zoomed-in crop, scale inflation, cropped dropper, or product edge touching the canvas.",
        sharedNoAddedAtomizer,
      ],
    };
  }

  if (isRoller) {
    return {
      colorLabel: "Roller / cap color",
      sourceTruth:
        "exact bottle body, roller ball plug, over-cap if present, trim, glass thickness, silhouette, proportions, component relationships, colors, and material identity. No hose, tassel, atomizer, pump, sprayer, or dip tube may be added.",
      fullVisibility: "Keep the full product visible, including the roller/cap assembly and bottle base.",
      canvasBounds:
        "No roller/cap assembly, bottle base, shadow, or product edge may touch or leave the canvas.",
      glassMaterialLine:
        "- Glass: clearer transparency, visible wall thickness, refined refraction, crisp vertical edge glints, tiny rim sparkles on lip and base, realistic base weight, and visible separation between front and back walls. No fake bevels or plastic glass.",
      fitmentMaterialLine:
        "- Roller/cap: preserve the exact roller ball plug, over-cap state, and closure color from Image 1; no sprayer, bulb, hose, tassel, or dip tube. If the over-cap is detached, keep the exposed roller ball plug seated on the bottle neck centerline and place the matching over-cap upright to the right on the same baseline with a consistent gap and scale.",
      shadowContact: "bottle base, roller plug, and detached over-cap contact points visible in the reference",
      forbiddenLines: [
        "- No new colors, color drift, substituted roller/cap colors, changed finish, new bottle shape, changed angle, changed cap height, changed body width/depth, or changed product proportions.",
        "- No zoomed-in crop, scale inflation, cropped roller/cap, sideways-drifting roller plug, floating cap, far-away cap, overlapping cap, or product edge touching the canvas.",
        sharedNoAddedAtomizer,
      ],
    };
  }

  if (isSprayer) {
    return {
      colorLabel: "Sprayer / pump / cap color",
      sourceTruth:
        `exact bottle body, ${label}, actuator/nozzle/collar, trim, ${requiredDipTubeTruth} glass thickness, silhouette, proportions, component relationships, colors, and material identity. No bulb, hose, or tassel may be added unless Image 1 shows them.`,
      fullVisibility: `Keep the full product visible, including the full ${label} and bottle base.`,
      canvasBounds:
        `No ${label}, actuator/nozzle, bottle base, shadow, detached cap, or product edge may touch or leave the canvas.`,
      glassMaterialLine: requiredDipTubeGlassLine,
      fitmentMaterialLine:
        `- Sprayer/pump: preserve the exact ${label}, actuator, nozzle, collar, cap state, trim finish, neck-seated pump mechanism, and visible internal dip tube from Image 1; no bulb, hose, or tassel unless Image 1 shows them. ${sprayerPumpGlassBoundaryLine} ${paleCapVisibilityLine}`,
      shadowContact: "bottle base and sprayer/pump contact points visible in the reference",
      forbiddenLines: [
        "- No new colors, color drift, substituted sprayer/cap colors, changed metal or plastic finish, new bottle shape, changed angle, changed cap height, changed body width/depth, missing internal dip tube, or changed product proportions.",
        "- No disappearing, washed-out, background-colored, ghosted, or erased cap, actuator, nozzle, collar, detached cap, or over-cap; pale cap components need visible rim, sidewall, top edge, and contact separation.",
        "- No pump body, actuator housing, collar mass, white mechanism block, cloudy column, milky funnel, or opaque plug floating inside the clear glass bottle; only the thin dip tube may continue into the empty glass.",
        "- No zoomed-in crop, scale inflation, cropped sprayer/pump, added bulb, added hose, added tassel, or product edge touching the canvas.",
      ],
    };
  }

  if (isCapOrReducer) {
    return {
      colorLabel: "Cap / closure color",
      sourceTruth:
        `exact bottle body, ${label}, trim, glass thickness, silhouette, proportions, component relationships, colors, and material identity. No mechanism, bulb, hose, tassel, sprayer, pump, or dip tube may be added unless Image 1 shows one.`,
      fullVisibility: `Keep the full product visible, including the full ${label} and bottle base.`,
      canvasBounds:
        `No ${label}, bottle base, shadow, or product edge may touch or leave the canvas.`,
      glassMaterialLine:
        "- Glass: clearer transparency, visible wall thickness, refined refraction, crisp vertical edge glints, tiny rim sparkles on lip and base, realistic base weight, and visible separation between front and back walls. No fake bevels, plastic glass, or invented dip tube.",
      fitmentMaterialLine:
        `- Closure: preserve the exact ${label} shape, finish, height, and cap state from Image 1; no added mechanism or ornamentation.`,
      shadowContact: "bottle base and closure contact points visible in the reference",
      forbiddenLines: [
        "- No new colors, color drift, substituted closure color, changed finish, new bottle shape, changed angle, changed cap height, changed body width/depth, or changed product proportions.",
        "- No zoomed-in crop, scale inflation, cropped closure, or product edge touching the canvas.",
        sharedNoAddedAtomizer,
      ],
    };
  }

  return {
    colorLabel: "Closure / fitment color",
    sourceTruth:
      `exact bottle body, ${label}, trim, glass thickness, silhouette, proportions, component relationships, colors, and material identity. Only render components that are visible in Image 1.`,
    fullVisibility: "Keep the full referenced product visible, including every component that is visible in Image 1.",
    canvasBounds:
      "No referenced component, bottle base, shadow, or product edge may touch or leave the canvas.",
    glassMaterialLine:
      "- Glass: clearer transparency, visible wall thickness, refined refraction, crisp vertical edge glints, tiny rim sparkles on lip and base, realistic base weight, and visible separation between front and back walls. No fake bevels or plastic glass.",
    fitmentMaterialLine:
      `- Closure/fitment: preserve the exact ${label} shape, finish, cap state, and placement from Image 1; do not invent missing components.`,
    shadowContact: "bottle base and any referenced component contact points",
    forbiddenLines: [
      "- No new colors, color drift, substituted closure/fitment colors, changed finish, new bottle shape, changed angle, changed cap height, changed body width/depth, or changed product proportions.",
      "- No zoomed-in crop, scale inflation, cropped closure/fitment, or product edge touching the canvas.",
      sharedNoAddedAtomizer,
    ],
  };
}
