export type ShoulderLandmarkBounds = {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
};

/**
 * Which point on the glass a lock is measured to.
 *
 * "shoulder" — where the straight wall ends. Every body locked so far uses it;
 * on a tight-cornered body it lands within ~1% of the canvas under the closure,
 * which is why Cylinder and Slim read as "at the cap".
 *
 * "closure-seat" — the top of the glass neck ring, where a cap or collar sits.
 * For glass with no straight wall. An urn swells and then curves in, so "where
 * the wall ends" has no single answer: on Diva the shoulder rule landed at the
 * start of the ribs or partway down the dome, through the bottle. The seat is
 * the one edge every fitment shares — the collar's bottom edge, or on a bare
 * neck the step from the ring into the threads.
 */
export type ShoulderLandmarkKind = "shoulder" | "closure-seat";

export type GlassShoulderLandmark = {
  shoulderYPx: number;
  /** Pre-refinement pick, kept so a manifest shows how far the edge moved; null when only geometry resolved. */
  coarseShoulderYPx: number | null;
  /** Bottom edge of the cap/collar sitting on the glass, when one was found. */
  closureEdgeYPx: number | null;
  /** First sustained narrowing of the glass going up from the wall, when found. */
  narrowingOnsetYPx: number | null;
  /** Shoulder-to-foot height over wall-to-wall width; comparable to the glass's known proportions. */
  bodyAspectRatio: number;
  footYPx: number;
  bodyLeftXPx: number;
  bodyRightXPx: number;
  confidence: number;
  /** Shoulder: the material change at the landmark. Closure seat: the step into the fitment, % of the ring's width. */
  transitionScore: number;
  /** Shoulder: how well both walls hold under the landmark. Closure seat: 0 — an urn has no straight wall. */
  wallSupport: number;
  /** Present only when the landmark is the closure seat. */
  landmark?: "closure-seat";
  /** Closure seat only: the widest row of glass below the seat, the width its aspect is stated in. */
  outerBodyWidthPx?: number;
};

export type DetectGlassShoulderLandmarkInput = {
  pixels: ArrayLike<number>;
  width: number;
  height: number;
  primaryBounds: ShoulderLandmarkBounds | null | undefined;
  footYPx: number;
  expectedShoulderYPx?: number;
  /** Canvas colour; sampled from the image corners when omitted. */
  background?: { r: number; g: number; b: number };
  /** How far the glass must narrow, as a fraction of body width, to count as the shoulder. */
  narrowingFraction?: number;
  /**
   * Shoulder-to-foot height over wall-to-wall width for this glass body, from its
   * lock. Picks between candidates and rejects a detection more than 15% off.
   * Across 29 re-rigged Madison renders, 26 sat within 5.5% and the model's
   * too-fat tall 9 ml at 9-12.5%; the one wrong landmark (a black collar on
   * cobalt, picked far too high) sat alone at 21%.
   */
  expectedBodyAspectRatio?: number;
  /** Which point the lock is measured to. Defaults to "shoulder". */
  landmark?: ShoulderLandmarkKind;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pixelDelta(
  pixels: ArrayLike<number>,
  width: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const first = (y1 * width + x1) * 4;
  const second = (y2 * width + x2) * 4;
  const red = Number(pixels[first] ?? 0) - Number(pixels[second] ?? 0);
  const green = Number(pixels[first + 1] ?? 0) - Number(pixels[second + 1] ?? 0);
  const blue = Number(pixels[first + 2] ?? 0) - Number(pixels[second + 2] ?? 0);
  return Math.sqrt(red * red + green * green + blue * blue);
}

function horizontalEdgeEnergy(
  pixels: ArrayLike<number>,
  width: number,
  x: number,
  startY: number,
  endY: number,
): number {
  let total = 0;
  let count = 0;
  for (let y = startY; y <= endY; y += 2) {
    total += pixelDelta(pixels, width, x - 1, y, x + 1, y);
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

function strongestEdgeX(
  pixels: ArrayLike<number>,
  width: number,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
): { x: number; energy: number } | null {
  let bestX = -1;
  let bestEnergy = 0;
  for (let x = startX; x <= endX; x += 1) {
    const energy = horizontalEdgeEnergy(pixels, width, x, startY, endY);
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestX = x;
    }
  }
  return bestX >= 0 && bestEnergy >= 6 ? { x: bestX, energy: bestEnergy } : null;
}

function edgeStrengthNear(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): number {
  let strongest = 0;
  const minX = clamp(x - radius, 1, width - 2);
  const maxX = clamp(x + radius, 1, width - 2);
  const safeY = clamp(y, 0, height - 1);
  for (let sampleX = minX; sampleX <= maxX; sampleX += 1) {
    strongest = Math.max(
      strongest,
      pixelDelta(pixels, width, sampleX - 1, safeY, sampleX + 1, safeY),
    );
  }
  return strongest;
}

function materialTransitionScore(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  left: number,
  right: number,
  y: number,
  sampleOffset: number,
): number {
  const aboveY = clamp(y - sampleOffset, 0, height - 1);
  const belowY = clamp(y + sampleOffset, 0, height - 1);
  const inset = Math.max(2, Math.round((right - left) * 0.08));
  const startX = clamp(left + inset, 0, width - 1);
  const endX = clamp(right - inset, 0, width - 1);
  const stride = Math.max(1, Math.round((endX - startX) / 48));
  let total = 0;
  let count = 0;
  for (let x = startX; x <= endX; x += stride) {
    total += pixelDelta(pixels, width, x, aboveY, x, belowY);
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

type ColorSignature = { r: number; g: number; b: number };

function regionColorSignature(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  left: number,
  right: number,
  startY: number,
  endY: number,
): ColorSignature | null {
  const inset = Math.max(2, Math.round((right - left) * 0.18));
  const startX = clamp(left + inset, 0, width - 1);
  const endX = clamp(right - inset, startX, width - 1);
  const safeStartY = clamp(startY, 0, height - 1);
  const safeEndY = clamp(endY, safeStartY, height - 1);
  const xStride = Math.max(1, Math.round((endX - startX) / 32));
  const yStride = Math.max(1, Math.round((safeEndY - safeStartY) / 12));
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let y = safeStartY; y <= safeEndY; y += yStride) {
    for (let x = startX; x <= endX; x += xStride) {
      const index = (y * width + x) * 4;
      r += Number(pixels[index] ?? 0);
      g += Number(pixels[index + 1] ?? 0);
      b += Number(pixels[index + 2] ?? 0);
      count += 1;
    }
  }
  return count > 0 ? { r: r / count, g: g / count, b: b / count } : null;
}

function signatureSimilarity(
  first: ColorSignature | null,
  second: ColorSignature | null,
): number {
  if (!first || !second) return 0;
  const red = first.r - second.r;
  const green = first.g - second.g;
  const blue = first.b - second.b;
  const delta = Math.sqrt(red * red + green * green + blue * blue);
  return Math.exp(-delta / 52);
}

function sampleCornerBackground(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
): ColorSignature {
  const patch = Math.max(2, Math.min(8, Math.floor(Math.min(width, height) / 16)));
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (const [originX, originY] of [
    [0, 0],
    [width - patch, 0],
    [0, height - patch],
    [width - patch, height - patch],
  ]) {
    for (let y = originY; y < originY + patch; y += 1) {
      for (let x = originX; x < originX + patch; x += 1) {
        const index = (y * width + x) * 4;
        r += Number(pixels[index] ?? 0);
        g += Number(pixels[index + 1] ?? 0);
        b += Number(pixels[index + 2] ?? 0);
        count += 1;
      }
    }
  }
  return { r: r / count, g: g / count, b: b / count };
}

/**
 * Silhouette width of one row, from the outermost off-background pixel on each
 * side. Clear glass matches the canvas inside but keeps a visible rim, so the
 * outer contour is measurable where the interior is not. Measured edge to edge,
 * never about a centre: on dark glass the wall finder can land on an internal
 * highlight, and a width mirrored about that centre read 570 px on a 450 px
 * bottle — enough to make a landmark 350 px too high look well-proportioned.
 */
function silhouetteWidthAt(
  pixels: ArrayLike<number>,
  width: number,
  y: number,
  left: number,
  right: number,
  background: ColorSignature,
  threshold: number,
): number {
  const offBackground = (x: number): boolean => {
    const index = (y * width + x) * 4;
    return (
      Math.max(
        Math.abs(Number(pixels[index] ?? 0) - background.r),
        Math.abs(Number(pixels[index + 1] ?? 0) - background.g),
        Math.abs(Number(pixels[index + 2] ?? 0) - background.b),
      ) > threshold
    );
  };
  let leftEdge = -1;
  for (let x = left; x <= right; x += 1) {
    if (offBackground(x)) {
      leftEdge = x;
      break;
    }
  }
  if (leftEdge < 0) return 0;
  let rightEdge = leftEdge;
  for (let x = right; x > leftEdge; x -= 1) {
    if (offBackground(x)) {
      rightEdge = x;
      break;
    }
  }
  return rightEdge - leftEdge + 1;
}

/**
 * Going up from the straight wall, the first row where the glass has narrowed
 * by `narrowingFraction` and stays narrow — "right before the wall starts".
 * This is the Sep 7 lock's reviewed landmark: on a tight-cornered body it sits
 * within a few pixels of the closure's bottom edge; on a sloped shoulder it
 * sits near the bottom of the slope, far below the neck. Returns null when
 * nothing narrows above the wall, i.e. a body-width cap or collar.
 */
function glassNarrowingOnsetY(input: {
  pixels: ArrayLike<number>;
  width: number;
  left: number;
  right: number;
  top: number;
  background: ColorSignature;
  silhouetteThreshold: number;
  lowerBodyStart: number;
  lowerBodyEnd: number;
  span: number;
  narrowingFraction: number;
}): { onsetY: number | null; bodyWidth: number } {
  const widthAt = (y: number): number =>
    silhouetteWidthAt(
      input.pixels,
      input.width,
      y,
      input.left,
      input.right,
      input.background,
      input.silhouetteThreshold,
    );
  const bodyWidths: number[] = [];
  for (let y = input.lowerBodyStart; y <= input.lowerBodyEnd; y += 2) bodyWidths.push(widthAt(y));
  bodyWidths.sort((first, second) => first - second);
  const bodyWidth = bodyWidths[Math.floor(bodyWidths.length / 2)] ?? 0;
  if (bodyWidth < 6) return { onsetY: null, bodyWidth: 0 };

  const limit = bodyWidth * (1 - input.narrowingFraction);
  const sustain = Math.max(5, Math.round(input.span * 0.02));
  for (let y = input.lowerBodyStart - 1; y > input.top + sustain; y -= 1) {
    if (widthAt(y) >= limit) continue;
    let narrowRows = 0;
    for (let above = y - 1; above >= y - sustain; above -= 1) {
      if (widthAt(above) < limit) narrowRows += 1;
    }
    if (narrowRows >= sustain * 0.9) return { onsetY: y, bodyWidth };
  }
  return { onsetY: null, bodyWidth };
}

/**
 * Re-localizes a coarse shoulder candidate onto the top edge of the glass
 * shoulder: where the closure (cap or collar) ends, or where a bare neck meets
 * the body.
 *
 * The coarse transition compares rows `sampleOffset` apart, so every candidate
 * within `sampleOffset` of a real boundary scores alike and the wall/body terms
 * pick among them. At production scale that plateau is 40+ px tall — about two
 * shoulder-curve heights, ~1% of canvas — and the pick varied per render. A
 * 1 px comparison resolves the boundary itself; the top-most strong run inside
 * the plateau is the shoulder edge, above any refraction lines in the curve.
 */
function sharpestTopBoundaryNear(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  left: number,
  right: number,
  coarseY: number,
  radius: number,
  minY: number,
  maxY: number,
): number {
  const startY = Math.max(minY, coarseY - radius);
  const endY = Math.min(maxY, coarseY + radius);
  const strengths: number[] = [];
  let strongest = 0;
  for (let y = startY; y <= endY; y += 1) {
    const strength = materialTransitionScore(pixels, width, height, left, right, y, 1);
    strengths.push(strength);
    strongest = Math.max(strongest, strength);
  }
  if (strongest < 8) return coarseY;

  const threshold = strongest * 0.6;
  const runStart = strengths.findIndex((strength) => strength >= threshold);
  let runEnd = runStart;
  while (runEnd + 1 < strengths.length && strengths[runEnd + 1] >= threshold) runEnd += 1;
  return startY + Math.round((runStart + runEnd) / 2);
}

/** Outermost off-background pixel on each side of one row, as silhouetteWidthAt reads it. */
function silhouetteEdgesAt(
  pixels: ArrayLike<number>,
  width: number,
  y: number,
  left: number,
  right: number,
  background: ColorSignature,
  threshold: number,
): { left: number; right: number } | null {
  const offBackground = (x: number): boolean => {
    const index = (y * width + x) * 4;
    return (
      Math.max(
        Math.abs(Number(pixels[index] ?? 0) - background.r),
        Math.abs(Number(pixels[index + 1] ?? 0) - background.g),
        Math.abs(Number(pixels[index + 2] ?? 0) - background.b),
      ) > threshold
    );
  };
  let leftEdge = -1;
  for (let x = left; x <= right; x += 1) {
    if (offBackground(x)) {
      leftEdge = x;
      break;
    }
  }
  if (leftEdge < 0) return null;
  let rightEdge = leftEdge;
  for (let x = right; x > leftEdge; x -= 1) {
    if (offBackground(x)) {
      rightEdge = x;
      break;
    }
  }
  return { left: leftEdge, right: rightEdge };
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * The closure seat on glass with no straight wall; see ShoulderLandmarkKind.
 *
 * Going up from the belly, an urn's silhouette narrows over the dome, holds
 * roughly level across the neck ring, then steps in where the collar or the
 * threads begin. On the 18 Diva Photoshop sources (tassels aside) the ring reads
 * 63-65% of the belly at every size and fitment, and the step into the fitment
 * is 17.6-35% of the ring's width — a dropper's collar is the widest; no other
 * step between the dome and the seat passes 11.1%. So the seat is the first step
 * above the dome of at least 15% that lasts. Stopping at the first one matters:
 * the collar's own top, a dropper bulb and a sprayer actuator all step in again
 * further up.
 */
function detectClosureSeatLandmark(
  input: DetectGlassShoulderLandmarkInput,
): GlassShoulderLandmark | null {
  const { pixels, width, height } = input;
  const bounds = input.primaryBounds;
  if (
    !bounds ||
    typeof bounds.left !== "number" ||
    typeof bounds.right !== "number" ||
    width < 12 ||
    height < 12 ||
    bounds.right - bounds.left < 10 ||
    input.footYPx <= bounds.top
  ) {
    return null;
  }

  const left = clamp(Math.floor(bounds.left), 1, width - 3);
  const right = clamp(Math.ceil(bounds.right), left + 2, width - 2);
  const top = clamp(Math.floor(bounds.top), 0, height - 2);
  const foot = clamp(Math.round(input.footYPx), top + 1, height - 1);
  const span = foot - top;
  const lowerBodyStart = clamp(Math.round(top + span * 0.52), top, foot - 2);
  const lowerBodyEnd = clamp(Math.round(top + span * 0.84), lowerBodyStart + 1, foot - 1);

  // The seat is read off the whole silhouette, so every part of the glass has to
  // show. The shoulder rule's bar hides frosted glass on Bone: the first frosted
  // Diva render averaged 11.5 levels off the canvas, just under that rule's
  // frosted cut, and at its clear-glass bar of 28 whole rows of body went
  // missing. At 8 the same render reads as cleanly as clear glass, and the clear
  // renders and Photoshop sources read the same as before.
  const background = input.background ?? sampleCornerBackground(pixels, width, height);
  const threshold = 8;

  const widths: number[] = [];
  for (let y = top; y <= foot; y += 1) {
    const edges = silhouetteEdgesAt(pixels, width, y, left, right, background, threshold);
    widths.push(edges ? edges.right - edges.left + 1 : 0);
  }
  const widthAt = (y: number): number => widths[y - top] ?? 0;
  const medianWidth = (fromY: number, toY: number): number => {
    const values: number[] = [];
    for (let y = Math.max(top, fromY); y <= Math.min(foot, toY); y += 1) values.push(widthAt(y));
    return medianOf(values);
  };

  // The belly is the widest glass. It sits in the lower body under a tall fitment
  // and above it under a short one, so take the widest row there, then keep
  // climbing until the glass has clearly turned onto the dome.
  let bellyWidth = 0;
  let bellyY = lowerBodyStart;
  for (let y = lowerBodyStart; y <= lowerBodyEnd; y += 1) {
    if (widthAt(y) > bellyWidth) {
      bellyWidth = widthAt(y);
      bellyY = y;
    }
  }
  let domeY = -1;
  for (let y = lowerBodyStart - 1; y > top; y -= 1) {
    if (widthAt(y) > bellyWidth) {
      bellyWidth = widthAt(y);
      bellyY = y;
    } else if (widthAt(y) < bellyWidth * 0.85) {
      domeY = y;
      break;
    }
  }
  if (bellyWidth < 12 || domeY < 0) return null;

  const window = Math.max(2, Math.round(span * 0.004));
  const lasting = Math.max(window * 2, Math.round(span * 0.02));
  let searchFrom = domeY;
  let searchTo = top + lasting;
  if (typeof input.expectedShoulderYPx === "number") {
    const expectedY = Math.round(input.expectedShoulderYPx);
    const expectedRadius = Math.max(4, Math.round(height * 0.015));
    searchFrom = Math.min(searchFrom, expectedY + expectedRadius);
    searchTo = Math.max(searchTo, expectedY - expectedRadius);
  }

  const qualifies = (y: number): { drop: number; halfway: number } | null => {
    const ring = medianWidth(y + 1, y + window);
    const neck = medianWidth(y - window, y - 1);
    // The ring stands in from the belly; a step inside the body is not the neck.
    if (ring <= 0 || ring > bellyWidth * 0.85) return null;
    // A cheap first pass only. The ring's top is rounded, which smears the edge
    // across two short windows: on the Diva renders a 16% seat peaked at 13-14%
    // here and the search walked past it to the dropper bulb.
    if ((ring - neck) / ring < 0.1) return null;
    // The real test: size the step from clean rows either side of the edge, all
    // ring below and all fitment above.
    const fullRing = medianWidth(y + 1, y + window * 2);
    const fullNeck = medianWidth(y - window * 3, y - window - 1);
    const drop = fullRing > 0 ? (fullRing - fullNeck) / fullRing : 0;
    if (drop < 0.15) return null;
    // Frosted glass reads thin along the crease between the dome and the ring and
    // then widens again; the fitment above a real seat stays narrow.
    const halfway = (fullRing + fullNeck) / 2;
    if (medianWidth(y - lasting, y - window) > halfway) return null;
    return { drop, halfway };
  };

  let found: { y: number; drop: number; halfway: number } | null = null;
  for (let y = searchFrom; y >= searchTo && !found; y -= 1) {
    const step = qualifies(y);
    if (step) found = { y, ...step };
  }
  // Where the dome meets the ring the glass narrows too: 11-14% on the Diva
  // renders, under the bar but close to it. A borderline first step with another
  // one within a ring's height above it was the ring's foot, and the upper one is
  // the seat. A seat into a fitment steps 16-37%, and nothing else steps that
  // close above it: collars, pumps and threads all run on for longer.
  if (found && found.drop < 0.2) {
    const ringHeight = Math.round(span * 0.03);
    for (let y = found.y - window * 3; y >= Math.max(searchTo, found.y - ringHeight); y -= 1) {
      const step = qualifies(y);
      if (step) {
        found = { y, ...step };
        break;
      }
    }
  }

  if (found) {
    const { y, drop, halfway } = found;
    let seatY = y;
    for (let row = y + window; row >= y - window * 2; row -= 1) {
      if (widthAt(row) < halfway) {
        seatY = row;
        break;
      }
    }

    // A detached cap stands to the right of the glass and can reach up into the
    // belly rows: on the 100 ml reducer render the belly read 1196 px against
    // ~1000 of glass. The upper body just below the seat is always clear of it —
    // even a sprayer's tall over-cap stops well short — and its two walls are
    // clean and symmetric, so its axis mirrors the left wall; where a row's right
    // edge runs past that mirror, the cap is in the row and the mirror is the
    // glass. Rows without a cap keep their measured width. (A frosted bare neck
    // made a poor axis: its faint thread edges pulled the centre 40 px off.)
    const axisSamples: number[] = [];
    const upperBodyEnd = seatY + Math.round((foot - seatY) * 0.3);
    for (let row = seatY + lasting; row <= upperBodyEnd; row += 1) {
      const edges = silhouetteEdgesAt(pixels, width, row, left, right, background, threshold);
      if (edges) axisSamples.push((edges.left + edges.right) / 2);
    }
    const axis = axisSamples.length ? medianOf(axisSamples) : null;
    const glassEdgesAt = (row: number): { left: number; right: number } | null => {
      const edges = silhouetteEdgesAt(pixels, width, row, left, right, background, threshold);
      if (!edges || axis == null) return edges;
      const mirror = Math.round(2 * axis - edges.left);
      return edges.right > mirror + Math.max(4, (mirror - edges.left) * 0.03)
        ? { left: edges.left, right: mirror }
        : edges;
    };
    // Search the whole glass below the seat: the cap's width also cut the climb to
    // the dome short, so the first belly reading cannot bound this search.
    let glassBelly = 0;
    let glassBellyY = bellyY;
    for (let row = seatY + lasting; row <= lowerBodyEnd; row += 1) {
      const edges = glassEdgesAt(row);
      const rowWidth = edges ? edges.right - edges.left + 1 : 0;
      if (rowWidth > glassBelly) {
        glassBelly = rowWidth;
        glassBellyY = row;
      }
    }
    if (glassBelly >= 12) {
      bellyWidth = glassBelly;
      bellyY = glassBellyY;
    }

    const bodyAspectRatio = (foot - seatY) / bellyWidth;
    const expectedAspect = input.expectedBodyAspectRatio;
    if (
      typeof expectedAspect === "number" &&
      Number.isFinite(expectedAspect) &&
      expectedAspect > 0 &&
      Math.abs(bodyAspectRatio / expectedAspect - 1) > 0.15
    ) {
      // The first lasting step is the seat or nothing: every step above it is the
      // fitment's own, so fail closed rather than try the next one.
      return null;
    }
    const bellyEdges = glassEdgesAt(bellyY);
    return {
      shoulderYPx: seatY,
      coarseShoulderYPx: y,
      closureEdgeYPx: seatY,
      narrowingOnsetYPx: null,
      bodyAspectRatio: Number(bodyAspectRatio.toFixed(4)),
      footYPx: foot,
      bodyLeftXPx: bellyEdges?.left ?? left,
      bodyRightXPx: bellyEdges?.right ?? right,
      // The 15% floor reads 0.7 and 17.5% reads 0.8, so every Diva Photoshop seat
      // clears the sheet's bar; 22.5% and up reads 1. The shallowest render seats
      // (~16%) read ~0.75, which only sends the rig for its second look.
      confidence: Number(clamp(0.7 + (drop - 0.15) * 4, 0, 1).toFixed(3)),
      transitionScore: Number((drop * 100).toFixed(2)),
      wallSupport: 0,
      landmark: "closure-seat",
      outerBodyWidthPx: bellyWidth,
    };
  }
  return null;
}

/**
 * Locates the body-to-neck/collar transition on a front-on Cylinder render.
 *
 * Clear glass cannot be segmented reliably by background distance. Instead,
 * this detector first finds the persistent pair of vertical glass-wall edges
 * in the lower body, then searches upward for the strongest horizontal
 * material transition that still has those two walls immediately below it.
 */
export function detectGlassShoulderLandmark(
  input: DetectGlassShoulderLandmarkInput,
): GlassShoulderLandmark | null {
  if (input.landmark === "closure-seat") return detectClosureSeatLandmark(input);
  const { pixels, width, height } = input;
  const bounds = input.primaryBounds;
  if (
    !bounds ||
    typeof bounds.left !== "number" ||
    typeof bounds.right !== "number" ||
    width < 12 ||
    height < 12 ||
    bounds.right - bounds.left < 10 ||
    input.footYPx <= bounds.top
  ) {
    return null;
  }

  const left = clamp(Math.floor(bounds.left), 1, width - 3);
  const right = clamp(Math.ceil(bounds.right), left + 2, width - 2);
  const top = clamp(Math.floor(bounds.top), 0, height - 2);
  const foot = clamp(Math.round(input.footYPx), top + 1, height - 1);
  const span = foot - top;
  const center = Math.round((left + right) / 2);
  const lowerBodyStart = clamp(Math.round(top + span * 0.52), top, foot - 2);
  const lowerBodyEnd = clamp(Math.round(top + span * 0.84), lowerBodyStart + 1, foot - 1);
  const minimumHalfWidth = Math.max(3, Math.round((right - left) * 0.12));

  // Reach a little outside the bounds. Clear glass has a dark rim, so its bounds
  // sit outside the rim and the rim's inner edge falls inside them. Frosted glass
  // is one light tone with no rim: its only wall edge is the canvas-to-glass step,
  // which lies ON the bounds line, where a search kept inside never straddles it.
  // The same reach lets dark glass find its true outer wall instead of settling
  // for an internal highlight.
  //
  // How far: the bounds finder needs 40 levels of contrast, which frosted glass
  // (~18) never reaches, so frosted bounds come from darker parts such as the base
  // and can sit inset by an unpredictable amount per side — 12 px, 3.9% of the
  // width, on one real rescaled render, which a 2% reach missed. 5% covers that and
  // still stops short of a detached sidecar: bottle-only bounds guarantee an empty
  // gap of at least 1% of the canvas (~21 px) beside the bottle.
  const wallSearchMargin = Math.max(4, Math.round((right - left) * 0.05));
  const leftWall = strongestEdgeX(
    pixels,
    width,
    Math.max(1, left - wallSearchMargin),
    center - minimumHalfWidth,
    lowerBodyStart,
    lowerBodyEnd,
  );
  const rightWall = strongestEdgeX(
    pixels,
    width,
    center + minimumHalfWidth,
    Math.min(width - 2, right + wallSearchMargin),
    lowerBodyStart,
    lowerBodyEnd,
  );
  if (!leftWall || !rightWall || rightWall.x - leftWall.x < minimumHalfWidth * 2) {
    return null;
  }

  const bodyWidth = rightWall.x - leftWall.x;
  const wallRadius = Math.max(2, Math.round(bodyWidth * 0.035));
  let searchStart = clamp(Math.round(top + span * 0.12), top + 1, foot - 2);
  let searchEnd = clamp(Math.round(top + span * 0.58), searchStart + 1, foot - 2);
  if (typeof input.expectedShoulderYPx === "number") {
    const expectedY = clamp(
      Math.round(input.expectedShoulderYPx),
      searchStart,
      searchEnd,
    );
    const expectedRadius = Math.max(4, Math.round(height * 0.015));
    searchStart = Math.max(searchStart, expectedY - expectedRadius);
    searchEnd = Math.min(searchEnd, expectedY + expectedRadius);
  }
  const sampleOffset = Math.max(2, Math.round(span * 0.012));
  const supportDepth = Math.max(4, Math.round(span * 0.06));
  const leftReference = Math.max(leftWall.energy, 1);
  const rightReference = Math.max(rightWall.energy, 1);
  const bodySignature = regionColorSignature(
    pixels,
    width,
    height,
    leftWall.x,
    rightWall.x,
    lowerBodyStart,
    lowerBodyEnd,
  );

  let best:
    | {
        y: number;
        score: number;
        transition: number;
        support: number;
        bodySimilarity: number;
      }
    | null = null;

  for (let y = searchStart; y <= searchEnd; y += 1) {
    let wallSupportTotal = 0;
    let wallSupportSamples = 0;
    for (let sampleY = y + sampleOffset; sampleY <= y + supportDepth; sampleY += 2) {
      if (sampleY >= foot) break;
      const leftStrength = edgeStrengthNear(
        pixels,
        width,
        height,
        leftWall.x,
        sampleY,
        wallRadius,
      );
      const rightStrength = edgeStrengthNear(
        pixels,
        width,
        height,
        rightWall.x,
        sampleY,
        wallRadius,
      );
      wallSupportTotal += Math.min(
        1,
        Math.min(leftStrength / leftReference, rightStrength / rightReference),
      );
      wallSupportSamples += 1;
    }
    const wallSupport =
      wallSupportSamples > 0 ? wallSupportTotal / wallSupportSamples : 0;
    if (wallSupport < 0.32) continue;

    const transition = materialTransitionScore(
      pixels,
      width,
      height,
      leftWall.x,
      rightWall.x,
      y,
      sampleOffset,
    );
    const candidateBodySignature = regionColorSignature(
      pixels,
      width,
      height,
      leftWall.x,
      rightWall.x,
      y + Math.round(supportDepth * 0.7),
      y + supportDepth,
    );
    const bodySimilarity = signatureSimilarity(bodySignature, candidateBodySignature);
    const score =
      transition *
      (0.12 + wallSupport * 0.28 + bodySimilarity * 0.6);
    if (!best || score > best.score) {
      best = { y, score, transition, support: wallSupport, bodySimilarity };
    }
  }

  // A material change is only one of two cues. Where the neck and body are the same
  // material — a bare frosted neck — it is weak by nature and can fall under the bar
  // once the rig rescales, while the glass still narrows plainly. Keep going on
  // geometry alone rather than giving up before the width rule has been tried.
  const coarse = best && best.transition >= 8 ? best : null;
  const closureEdgeYPx = coarse
    ? sharpestTopBoundaryNear(
        pixels,
        width,
        height,
        leftWall.x,
        rightWall.x,
        coarse.y,
        sampleOffset + 2,
        top + 1,
        foot - 2,
      )
    : null;
  // The silhouette is read against the canvas. Clear glass is found by its rim and
  // coloured glass is far off the canvas, so 28 separates both from canvas noise.
  // Frosted glass is one light tone only 18–27 levels off, under that bar, so halve
  // its own measured contrast instead; being opaque, the whole body then reads.
  const background = input.background ?? sampleCornerBackground(pixels, width, height);
  const bodyContrast = bodySignature
    ? Math.max(
        Math.abs(bodySignature.r - background.r),
        Math.abs(bodySignature.g - background.g),
        Math.abs(bodySignature.b - background.b),
      )
    : 0;
  const silhouetteThreshold =
    bodyContrast >= 12 && bodyContrast < 56 ? Math.max(8, bodyContrast * 0.5) : 28;
  const narrowing = glassNarrowingOnsetY({
    pixels,
    width,
    left,
    right,
    top,
    background,
    silhouetteThreshold,
    lowerBodyStart,
    lowerBodyEnd,
    span,
    narrowingFraction: input.narrowingFraction ?? 0.08,
  });
  const narrowingOnsetYPx = narrowing.onsetY;
  // Outer silhouette width, the width a lock's proportions are stated in. The wall
  // edges above can sit on the inner wall of thick glass, ~15% narrower on a 5 ml.
  const outerBodyWidth = narrowing.bodyWidth >= bodyWidth ? narrowing.bodyWidth : bodyWidth;
  // Whichever is met first going up from the wall: a narrow collar or bare neck
  // leaves the glass narrowing below the closure; a body-width cap hides it.
  // Position alone cannot tell a hidden shoulder from a false transition inside
  // the body (a bulb-sprayer hose, a tassel), and colour cannot either — a matte
  // silver collar averages out like swirl glass. The glass's own proportions can:
  // given them, take the candidate that fits and refuse a detection that does not,
  // so the rig fails closed instead of seating a confident wrong landmark.
  const candidates = [narrowingOnsetYPx, closureEdgeYPx].filter(
    (candidate): candidate is number => candidate !== null,
  );
  if (candidates.length === 0) return null;
  let shoulderYPx = Math.max(...candidates);
  const expectedAspect = input.expectedBodyAspectRatio;
  if (typeof expectedAspect === "number" && Number.isFinite(expectedAspect) && expectedAspect > 0) {
    const deviation = (y: number): number =>
      Math.abs((foot - y) / outerBodyWidth / expectedAspect - 1);
    shoulderYPx = candidates.reduce((bestY, y) => (deviation(y) < deviation(bestY) ? y : bestY));
    if (deviation(shoulderYPx) > 0.15) return null;
  }
  // Two agreeing cues earn the measured score; geometry alone is a fair reading but
  // a single one, and says so.
  const confidence = coarse
    ? clamp(
        0.35 +
          Math.min(0.3, coarse.transition / 240) +
          coarse.support * 0.2 +
          coarse.bodySimilarity * 0.25,
        0,
        1,
      )
    : 0.6;

  return {
    shoulderYPx,
    coarseShoulderYPx: coarse?.y ?? null,
    closureEdgeYPx,
    narrowingOnsetYPx,
    bodyAspectRatio: Number(((foot - shoulderYPx) / outerBodyWidth).toFixed(4)),
    footYPx: foot,
    bodyLeftXPx: leftWall.x,
    bodyRightXPx: rightWall.x,
    confidence: Number(confidence.toFixed(3)),
    transitionScore: Number((coarse?.transition ?? 0).toFixed(2)),
    wallSupport: Number((coarse?.support ?? 0).toFixed(3)),
  };
}
