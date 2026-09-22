/**
 * The bottle's own box in a detached-sidecar reference whose whole-vessel box
 * has swallowed the cap.
 *
 * On some Photoshop sources a drop shadow joins the bottle and its detached cap,
 * so the two read as one object. The Diva 46 ml lotion pumps measured 1.55
 * against ~2.3 for the bottle, and every correctly drawn render then failed the
 * 6% proportion gate against that number. The split is the shoulder target
 * sheet's, validated there on every family's flats: the first empty column past
 * the bottle, or, when a shadow leaves none, the emptiest column that still has
 * a denser object past it.
 *
 * Returns null when the vessel already stops short of the split, so every
 * reference that measured cleanly keeps exactly the number it had.
 */
export type ReferenceBox = { left: number; right: number; top: number; bottom: number };

export function clipDetachedSidecar(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  background: { r: number; g: number; b: number },
  vessel: ReferenceBox,
): ReferenceBox | null {
  const ink = (x: number, y: number): boolean => {
    const index = (y * width + x) * 4;
    return (
      Math.max(
        Math.abs(Number(rgba[index] ?? 0) - background.r),
        Math.abs(Number(rgba[index + 1] ?? 0) - background.g),
        Math.abs(Number(rgba[index + 2] ?? 0) - background.b),
      ) > 12
    );
  };

  let left = width;
  let right = -1;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!ink(x, y)) continue;
      if (top < 0) top = y;
      bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (right < 0) return null;

  const columnInk = (x: number): number => {
    let count = 0;
    for (let y = top; y <= bottom; y += 2) if (ink(x, y)) count += 1;
    return count;
  };
  let split = -1;
  for (let x = left + 40; x < right; x += 1) {
    if (columnInk(x) === 0) {
      split = x;
      break;
    }
  }
  if (split < 0) {
    const from = left + Math.round((right - left) * 0.35);
    const to = right - Math.round((right - left) * 0.04);
    let valleyX = -1;
    let valleyInk = Number.POSITIVE_INFINITY;
    for (let x = from; x <= to; x += 1) {
      const count = columnInk(x);
      if (count < valleyInk) {
        valleyInk = count;
        valleyX = x;
      }
    }
    const past: number[] = [];
    for (let x = valleyX + 1; x <= right; x += 2) past.push(columnInk(x));
    past.sort((first, second) => first - second);
    const pastValley = past.length ? past[past.length >> 1]! : 0;
    if (valleyX > 0 && pastValley >= Math.max(4, valleyInk * 2)) split = valleyX;
  }
  if (split < 0 || vessel.right < split) return null;

  let clippedTop = -1;
  let clippedBottom = -1;
  for (let y = vessel.top; y <= vessel.bottom; y += 1) {
    for (let x = vessel.left; x < split; x += 1) {
      if (ink(x, y)) {
        if (clippedTop < 0) clippedTop = y;
        clippedBottom = y;
        break;
      }
    }
  }
  return clippedTop < 0
    ? null
    : { left: vessel.left, right: split - 1, top: clippedTop, bottom: clippedBottom };
}
