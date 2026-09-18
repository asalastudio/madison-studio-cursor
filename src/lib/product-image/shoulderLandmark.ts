export type ShoulderLandmarkBounds = {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
};

export type GlassShoulderLandmark = {
  shoulderYPx: number;
  footYPx: number;
  bodyLeftXPx: number;
  bodyRightXPx: number;
  confidence: number;
  transitionScore: number;
  wallSupport: number;
};

export type DetectGlassShoulderLandmarkInput = {
  pixels: ArrayLike<number>;
  width: number;
  height: number;
  primaryBounds: ShoulderLandmarkBounds | null | undefined;
  footYPx: number;
  expectedShoulderYPx?: number;
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

  const leftWall = strongestEdgeX(
    pixels,
    width,
    left + 1,
    center - minimumHalfWidth,
    lowerBodyStart,
    lowerBodyEnd,
  );
  const rightWall = strongestEdgeX(
    pixels,
    width,
    center + minimumHalfWidth,
    right - 1,
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

  if (!best || best.transition < 8) return null;
  const confidence = clamp(
    0.35 +
      Math.min(0.3, best.transition / 240) +
      best.support * 0.2 +
      best.bodySimilarity * 0.25,
    0,
    1,
  );

  return {
    shoulderYPx: best.y,
    footYPx: foot,
    bodyLeftXPx: leftWall.x,
    bodyRightXPx: rightWall.x,
    confidence: Number(confidence.toFixed(3)),
    transitionScore: Number(best.transition.toFixed(2)),
    wallSupport: Number(best.support.toFixed(3)),
  };
}
