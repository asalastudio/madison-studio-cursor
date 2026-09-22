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

/**
 * The cap beside a bottle when no empty column separates the two.
 *
 * The emptiest-column guess that used to answer this reads clear glass
 * wrongly: the inside of a clear bottle is emptier than the gap beside it, so
 * it cut the Empire 100 ml lotion pump down its dip tube and trimmed the right
 * wall off the Empire 50 ml, and read a whole second 50 ml body out of it. A
 * cap stands on the baseline, though, and even where its top tucks under a
 * belly (Diva, Grace) or a disc (Circle) it is its own connected shape. So:
 * one object on the baseline means no cap is pictured, and the bottle is the
 * whole frame; a second object is the cap, and the bottle ends where it
 * starts. A cap too short or too tall to be one — a fragment of frosted foot,
 * or a cap a shadow has fused to the glass — is left unresolved for the
 * caller's older fallback.
 */
export type TouchingSidecar = { kind: "no-cap" } | { kind: "cap"; left: number } | { kind: "unresolved" };

export function findTouchingSidecar(
  ink: (x: number, y: number) => boolean,
  width: number,
  height: number,
  frame: ReferenceBox,
): TouchingSidecar {
  const span = frame.bottom - frame.top;
  const frameWidth = frame.right - frame.left;
  if (span <= 0 || frameWidth <= 0) return { kind: "unresolved" };

  // Objects standing on the baseline: runs of occupied columns in a band just
  // above the lowest ink, clear of the thin tail of a contact shadow.
  const bandTop = Math.round(frame.bottom - span * 0.1);
  const bandBottom = Math.round(frame.bottom - span * 0.02);
  const minimumRun = frameWidth * 0.01;
  const runs: Array<{ start: number; end: number }> = [];
  let runStart = -1;
  for (let x = frame.left; x <= frame.right + 1; x += 1) {
    let occupied = false;
    if (x <= frame.right) {
      for (let y = bandTop; y <= bandBottom; y += 1) {
        if (ink(x, y)) {
          occupied = true;
          break;
        }
      }
    }
    if (occupied && runStart < 0) runStart = x;
    if (!occupied && runStart >= 0) {
      if (x - runStart >= minimumRun) runs.push({ start: runStart, end: x - 1 });
      runStart = -1;
    }
  }
  if (runs.length < 2) return { kind: "no-cap" };

  // The cap is the shape standing in the rightmost run.
  const capRun = runs[runs.length - 1]!;
  let seedX = -1;
  let seedY = -1;
  for (let x = capRun.end; x >= capRun.start && seedX < 0; x -= 1) {
    for (let y = bandTop; y <= bandBottom; y += 1) {
      if (ink(x, y)) {
        seedX = x;
        seedY = y;
        break;
      }
    }
  }
  if (seedX < 0) return { kind: "unresolved" };

  const visited = new Uint8Array(width * height);
  const stack = [seedY * width + seedX];
  visited[seedY * width + seedX] = 1;
  let capLeft = seedX;
  let capTop = seedY;
  let capBottom = seedY;
  while (stack.length > 0) {
    const index = stack.pop()!;
    const x = index % width;
    const y = (index - x) / width;
    if (x < capLeft) capLeft = x;
    if (y < capTop) capTop = y;
    if (y > capBottom) capBottom = y;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (visited[next] || !ink(nx, ny)) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }
  }
  // Joined to the foot, it is part of the bottle: a clear bottle's base can read
  // as its two walls, and a thin run is the right wall. A wide one is a cap the
  // glass has fused with.
  const foot = runs[0]!;
  let joinedToFoot = false;
  for (let y = bandTop; y <= bandBottom && !joinedToFoot; y += 1) {
    for (let x = foot.start; x <= foot.end; x += 1) {
      if (visited[y * width + x]) {
        joinedToFoot = true;
        break;
      }
    }
  }
  if (joinedToFoot) return capRun.end - capRun.start < frameWidth * 0.05 ? { kind: "no-cap" } : { kind: "unresolved" };
  const capHeight = (capBottom - capTop) / span;
  if (capHeight < 0.05 || capHeight > 0.6 || capLeft <= foot.end) return { kind: "unresolved" };
  return { kind: "cap", left: capLeft };
}

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
    const sidecar = findTouchingSidecar(ink, width, height, { left, right, top, bottom });
    if (sidecar.kind === "no-cap") return null;
    if (sidecar.kind === "cap") split = sidecar.left;
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
