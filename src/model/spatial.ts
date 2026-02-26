import type { Bounds, FlowDirection } from "../types/index.js";

const DEFAULT_GAP = 30;

/**
 * Check if two rectangles overlap, considering a minimum gap.
 * Returns true if they overlap or are closer than `gap` pixels.
 */
export function boundsOverlap(a: Bounds, b: Bounds, gap: number = DEFAULT_GAP): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

/**
 * Compute the minimum push vector to resolve overlap between a and b,
 * pushing b in the flow direction away from a.
 * Returns { dx, dy } displacement for b, or null if no overlap.
 */
export function computePushVector(
  a: Bounds,
  b: Bounds,
  flowDirection: FlowDirection,
  gap: number = DEFAULT_GAP,
): { dx: number; dy: number } | null {
  if (!boundsOverlap(a, b, gap)) return null;

  switch (flowDirection) {
    case "TB": {
      // Push b downward
      const needed = a.y + a.height + gap - b.y;
      return needed > 0 ? { dx: 0, dy: needed } : null;
    }
    case "BT": {
      // Push b upward
      const needed = b.y + b.height + gap - a.y;
      return needed > 0 ? { dx: 0, dy: -needed } : null;
    }
    case "LR": {
      // Push b rightward
      const needed = a.x + a.width + gap - b.x;
      return needed > 0 ? { dx: needed, dy: 0 } : null;
    }
    case "RL": {
      // Push b leftward
      const needed = b.x + b.width + gap - a.x;
      return needed > 0 ? { dx: -needed, dy: 0 } : null;
    }
  }
}

/**
 * Check if b is downstream of a in the given flow direction.
 * Downstream means b's center is further along the flow axis than a's center.
 */
export function isDownstream(a: Bounds, b: Bounds, flowDirection: FlowDirection): boolean {
  const aCy = a.y + a.height / 2;
  const bCy = b.y + b.height / 2;
  const aCx = a.x + a.width / 2;
  const bCx = b.x + b.width / 2;

  switch (flowDirection) {
    case "TB": return bCy >= aCy;
    case "BT": return bCy <= aCy;
    case "LR": return bCx >= aCx;
    case "RL": return bCx <= aCx;
  }
}
