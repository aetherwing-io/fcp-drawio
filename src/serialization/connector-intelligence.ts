import type { Edge, Page, Shape, Bounds } from "../types/index.js";

// ── Public interfaces ────────────────────────────────────────

export interface PortAssignment {
  exitX: number;  // 0-1 normalized on source shape
  exitY: number;
  entryX: number; // 0-1 normalized on target shape
  entryY: number;
}

export type Face = "right" | "bottom" | "left" | "top";

export interface EdgeRenderInfo {
  ports: PortAssignment | null;  // null = floating (draw.io decides)
  exitFace: Face | null;
  entryFace: Face | null;
  labelOffsetX: number;          // relative position along edge path
  labelOffsetY: number;          // pixels perpendicular to edge
}

// ── Main entry point ─────────────────────────────────────────

/**
 * Pre-compute render info (port assignments and label offsets) for all edges on a page.
 * Returns a Map keyed by edge ID.
 */
export function computeAllEdgeRenderInfo(
  page: Page,
): Map<string, EdgeRenderInfo> {
  const result = new Map<string, EdgeRenderInfo>();
  const edges = [...page.edges.values()];

  // Phase 1: Compute smart ports for each edge individually
  for (const edge of edges) {
    result.set(edge.id, computeEdgeRenderInfo(edge, page));
  }

  // Phase 2: Fan-out spreading — distribute ports when multiple edges share same source+face
  applyFanOutSpreading(result, edges, page);

  // Phase 3: Label x-offset spreading — spread labeled edges so labels don't cluster at midpoints
  applyLabelOffsetSpreading(result, edges);

  return result;
}

/**
 * Compute render info for a single edge.
 */
export function computeEdgeRenderInfo(
  edge: Edge,
  page: Page,
): EdgeRenderInfo {
  const source = page.shapes.get(edge.sourceId);
  const target = page.shapes.get(edge.targetId);

  if (!source || !target) {
    return { ports: null, exitFace: null, entryFace: null, labelOffsetX: 0, labelOffsetY: 0 };
  }

  // Check if edge has explicitly set ports (from deserialization) — preserve them
  const style = edge.style as Record<string, unknown>;
  if (style["exitX"] !== undefined && style["exitX"] !== "") {
    return {
      ports: {
        exitX: parseFloat(String(style["exitX"])),
        exitY: parseFloat(String(style["exitY"] ?? "0.5")),
        entryX: parseFloat(String(style["entryX"] ?? "0.5")),
        entryY: parseFloat(String(style["entryY"] ?? "0.5")),
      },
      exitFace: null,
      entryFace: null,
      labelOffsetX: 0,
      labelOffsetY: 0,
    };
  }

  // Compute smart ports — use cross-group hint if shapes are in different groups
  const crossGroup = source.parentGroup !== target.parentGroup;
  const ports = crossGroup
    ? computeCrossGroupPorts(source, target, page)
    : computeSmartPorts(source, target);

  const exitFace = angleFace(computeAngle(source.bounds, target.bounds));

  return {
    ports,
    exitFace,
    entryFace: mirrorFace(exitFace),
    labelOffsetX: 0,
    labelOffsetY: 0,
  };
}

// ── Smart port computation ───────────────────────────────────

/**
 * Compute angle (in degrees) from source center to target center.
 * Returns angle in range [-180, 180] where 0 = right, 90 = down, -90 = up.
 */
function computeAngle(source: Bounds, target: Bounds): number {
  const sx = source.x + source.width / 2;
  const sy = source.y + source.height / 2;
  const tx = target.x + target.width / 2;
  const ty = target.y + target.height / 2;
  return Math.atan2(ty - sy, tx - sx) * (180 / Math.PI);
}

/**
 * Map an angle to the dominant exit face.
 * Right: [-45, 45), Bottom: [45, 135), Left: [135, 180] or [-180, -135), Top: [-135, -45)
 */
export function angleFace(angleDeg: number): Face {
  if (angleDeg >= -45 && angleDeg < 45) return "right";
  if (angleDeg >= 45 && angleDeg < 135) return "bottom";
  if (angleDeg >= -135 && angleDeg < -45) return "top";
  return "left"; // [135, 180] or [-180, -135)
}

/**
 * Mirror a face: source exits right → target enters left, etc.
 */
function mirrorFace(face: Face): Face {
  switch (face) {
    case "right": return "left";
    case "left": return "right";
    case "top": return "bottom";
    case "bottom": return "top";
  }
}

/**
 * Given source and target shapes, compute smart port assignments.
 * The exit point is on the face of the source closest to the target,
 * with slight variation based on the angle offset from face center.
 */
export function computeSmartPorts(source: Shape, target: Shape): PortAssignment {
  const angleDeg = computeAngle(source.bounds, target.bounds);
  const face = angleFace(angleDeg);

  // Compute fine-tuned position within the face based on angle offset.
  // This gives slight variation so edges don't all leave from dead center.
  const fineOffset = computeFineOffset(angleDeg, face);

  const exit = faceToPort(face, fineOffset);
  const entryFace = mirrorFace(face);
  const entry = faceToPort(entryFace, fineOffset);

  return {
    exitX: exit.x,
    exitY: exit.y,
    entryX: entry.x,
    entryY: entry.y,
  };
}

/**
 * Compute port assignments for edges crossing group boundaries.
 * When source and target are in different groups (or one is ungrouped),
 * compute the angle toward the target's group bounding box edge (not target center directly).
 * This biases the exit port toward the group boundary.
 */
function computeCrossGroupPorts(source: Shape, target: Shape, page: Page): PortAssignment {
  // If target is in a group, use the nearest edge of the group bounding box
  // as the angle target instead of the target shape center directly
  let targetBounds = target.bounds;
  if (target.parentGroup) {
    const group = page.groups.get(target.parentGroup);
    if (group) {
      targetBounds = group.bounds;
    }
  }

  // Compute angle from source center to target group boundary
  const angleDeg = computeAngle(source.bounds, targetBounds);
  const face = angleFace(angleDeg);
  const fineOffset = computeFineOffset(angleDeg, face);

  const exit = faceToPort(face, fineOffset);

  // For entry, compute from target's perspective toward source (or source's group)
  let sourceBounds = source.bounds;
  if (source.parentGroup) {
    const group = page.groups.get(source.parentGroup);
    if (group) {
      sourceBounds = group.bounds;
    }
  }

  const entryAngleDeg = computeAngle(target.bounds, sourceBounds);
  const entryFace = angleFace(entryAngleDeg);
  const entryFineOffset = computeFineOffset(entryAngleDeg, entryFace);
  const entry = faceToPort(entryFace, entryFineOffset);

  return {
    exitX: exit.x,
    exitY: exit.y,
    entryX: entry.x,
    entryY: entry.y,
  };
}

/**
 * Compute a fine offset within a face [-0.25, 0.25] based on angle deviation from face center.
 */
function computeFineOffset(angleDeg: number, face: Face): number {
  // Face center angles: right=0, bottom=90, left=180/-180, top=-90
  let faceCenter: number;
  switch (face) {
    case "right": faceCenter = 0; break;
    case "bottom": faceCenter = 90; break;
    case "left": faceCenter = angleDeg >= 0 ? 180 : -180; break;
    case "top": faceCenter = -90; break;
  }

  // Deviation from face center, normalized to [-0.25, 0.25]
  const deviation = angleDeg - faceCenter;
  return clamp(deviation / 180, -0.25, 0.25);
}

/**
 * Convert a face + fine offset to exit/entry port coordinates.
 * The offset shifts position along the face axis.
 */
function faceToPort(face: Face, fineOffset: number): { x: number; y: number } {
  switch (face) {
    case "right":  return { x: 1.0, y: clamp(0.5 + fineOffset, 0.1, 0.9) };
    case "left":   return { x: 0.0, y: clamp(0.5 + fineOffset, 0.1, 0.9) };
    case "bottom": return { x: clamp(0.5 + fineOffset, 0.1, 0.9), y: 1.0 };
    case "top":    return { x: clamp(0.5 + fineOffset, 0.1, 0.9), y: 0.0 };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ── Fan-out spreading ────────────────────────────────────────

/**
 * Post-process edge render infos to spread port positions when multiple edges
 * exit from the same face of the same source shape (or enter the same face of the same target).
 */
function applyFanOutSpreading(
  infos: Map<string, EdgeRenderInfo>,
  edges: Edge[],
  page: Page,
): void {
  // Group edges by (sourceId, exitFace)
  const exitGroups = new Map<string, { edge: Edge; info: EdgeRenderInfo }[]>();
  // Group edges by (targetId, entryFace)
  const entryGroups = new Map<string, { edge: Edge; info: EdgeRenderInfo }[]>();

  for (const edge of edges) {
    const info = infos.get(edge.id);
    if (!info?.ports || !info.exitFace) continue;

    const exitKey = `${edge.sourceId}:${info.exitFace}`;
    if (!exitGroups.has(exitKey)) exitGroups.set(exitKey, []);
    exitGroups.get(exitKey)!.push({ edge, info });

    const entryKey = `${edge.targetId}:${info.entryFace}`;
    if (!entryGroups.has(entryKey)) entryGroups.set(entryKey, []);
    entryGroups.get(entryKey)!.push({ edge, info });
  }

  // Spread exit ports for groups with N > 1
  for (const [key, group] of exitGroups) {
    if (group.length <= 1) continue;

    const face = key.split(":")[1] as Face;
    spreadExitPorts(group, face, page);
  }

  // Spread entry ports for groups with N > 1
  for (const [key, group] of entryGroups) {
    if (group.length <= 1) continue;

    const face = key.split(":")[1] as Face;
    spreadEntryPorts(group, face, page);
  }
}

/**
 * Spread exit port positions across a face when N edges leave from the same source face.
 * Sort by target position along the face axis, then distribute evenly.
 */
function spreadExitPorts(
  group: { edge: Edge; info: EdgeRenderInfo }[],
  face: Face,
  page: Page,
): void {
  const n = group.length;

  // Sort by target position along the face's variable axis
  group.sort((a, b) => {
    const ta = page.shapes.get(a.edge.targetId);
    const tb = page.shapes.get(b.edge.targetId);
    if (!ta || !tb) return 0;
    const taCx = ta.bounds.x + ta.bounds.width / 2;
    const taCy = ta.bounds.y + ta.bounds.height / 2;
    const tbCx = tb.bounds.x + tb.bounds.width / 2;
    const tbCy = tb.bounds.y + tb.bounds.height / 2;

    // For top/bottom faces, sort by target X; for left/right, sort by target Y
    if (face === "top" || face === "bottom") return taCx - tbCx;
    return taCy - tbCy;
  });

  // Spread positions: (i + 1) / (N + 1) for i in [0, N-1]
  for (let i = 0; i < n; i++) {
    const pos = (i + 1) / (n + 1);
    const info = group[i].info;
    if (!info.ports) continue;

    if (face === "top" || face === "bottom") {
      info.ports.exitX = pos;
    } else {
      info.ports.exitY = pos;
    }
  }
}

/**
 * Spread entry port positions across a face when N edges enter the same target face.
 */
function spreadEntryPorts(
  group: { edge: Edge; info: EdgeRenderInfo }[],
  face: Face,
  page: Page,
): void {
  const n = group.length;

  // Sort by source position along the face's variable axis
  group.sort((a, b) => {
    const sa = page.shapes.get(a.edge.sourceId);
    const sb = page.shapes.get(b.edge.sourceId);
    if (!sa || !sb) return 0;
    const saCx = sa.bounds.x + sa.bounds.width / 2;
    const saCy = sa.bounds.y + sa.bounds.height / 2;
    const sbCx = sb.bounds.x + sb.bounds.width / 2;
    const sbCy = sb.bounds.y + sb.bounds.height / 2;

    if (face === "top" || face === "bottom") return saCx - sbCx;
    return saCy - sbCy;
  });

  for (let i = 0; i < n; i++) {
    const pos = (i + 1) / (n + 1);
    const info = group[i].info;
    if (!info.ports) continue;

    if (face === "top" || face === "bottom") {
      info.ports.entryX = pos;
    } else {
      info.ports.entryY = pos;
    }
  }
}

// ── Label x-offset spreading ─────────────────────────────────

/**
 * Spread label x-offsets for labeled edges sharing the same source shape,
 * so labels don't all cluster at the midpoint.
 *
 * For N labeled edges from same source:
 *   N=1 → x=0 (centered)
 *   N=2 → x at -0.15, +0.15
 *   N=3 → x at -0.3, 0, +0.3
 *   General: x = -0.3 + (i * 0.6) / (N - 1)
 */
function applyLabelOffsetSpreading(
  infos: Map<string, EdgeRenderInfo>,
  edges: Edge[],
): void {
  // Group labeled edges by source shape
  const labelGroups = new Map<string, { edge: Edge; info: EdgeRenderInfo }[]>();

  for (const edge of edges) {
    if (!edge.label) continue;
    const info = infos.get(edge.id);
    if (!info) continue;

    const key = edge.sourceId;
    if (!labelGroups.has(key)) labelGroups.set(key, []);
    labelGroups.get(key)!.push({ edge, info });
  }

  for (const [, group] of labelGroups) {
    const n = group.length;
    if (n <= 1) continue;

    // Sort by target ID for deterministic ordering
    group.sort((a, b) => a.edge.targetId.localeCompare(b.edge.targetId));

    for (let i = 0; i < n; i++) {
      const x = -0.3 + (i * 0.6) / (n - 1);
      group[i].info.labelOffsetX = Math.round(x * 100) / 100;
    }
  }
}
