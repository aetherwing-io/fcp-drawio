// elkjs CJS default export needs interop cast under Node16 module resolution
import _ELK from "elkjs/lib/elk.bundled.js";
const ELK = _ELK as unknown as { new(): { layout(graph: any): Promise<any> } };
import type { Page, Point, Shape, Edge, Group } from "../types/index.js";

// ── Public interfaces ────────────────────────────────────────

export interface LayoutOptions {
  algorithm: "layered" | "force" | "tree";
  direction: "TB" | "LR" | "BT" | "RL";
  spacing?: number;
}

export interface LayoutResult {
  shapePositions: Map<string, { x: number; y: number }>;
  edgeWaypoints: Map<string, Point[]>;
}

// ── Algorithm + direction mapping ────────────────────────────

const ALGORITHM_MAP: Record<LayoutOptions["algorithm"], string> = {
  layered: "org.eclipse.elk.layered",
  force: "org.eclipse.elk.force",
  tree: "org.eclipse.elk.mrtree",
};

const DIRECTION_MAP: Record<LayoutOptions["direction"], string> = {
  TB: "DOWN",
  LR: "RIGHT",
  BT: "UP",
  RL: "LEFT",
};

// ── ELK graph building ──────────────────────────────────────

interface ElkNode {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  children?: ElkNode[];
  layoutOptions?: Record<string, string>;
}

interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections?: ElkSection[];
}

interface ElkSection {
  startPoint: Point;
  endPoint: Point;
  bendPoints?: Point[];
}

interface ElkGraph {
  id: string;
  layoutOptions: Record<string, string>;
  children: ElkNode[];
  edges: ElkEdge[];
}

/**
 * Build an ELK graph from a Page, respecting group hierarchy.
 * Groups become parent nodes with children arrays.
 */
export function buildElkGraph(
  page: Page,
  options: LayoutOptions,
): ElkGraph {
  const spacing = String(options.spacing ?? 60);

  const layoutOptions: Record<string, string> = {
    "elk.algorithm": ALGORITHM_MAP[options.algorithm],
    "elk.direction": DIRECTION_MAP[options.direction],
    "elk.edgeRouting": "ORTHOGONAL",
    "elk.spacing.nodeNode": spacing,
    "elk.layered.spacing.nodeNodeBetweenLayers": spacing,
  };

  // Collect shapes by group
  const groupChildren = new Map<string, Shape[]>();
  const ungroupedShapes: Shape[] = [];

  for (const shape of page.shapes.values()) {
    if (shape.parentGroup) {
      if (!groupChildren.has(shape.parentGroup)) {
        groupChildren.set(shape.parentGroup, []);
      }
      groupChildren.get(shape.parentGroup)!.push(shape);
    } else {
      ungroupedShapes.push(shape);
    }
  }

  const children: ElkNode[] = [];

  // Add ungrouped shapes as top-level children
  for (const shape of ungroupedShapes) {
    children.push({
      id: shape.id,
      width: shape.bounds.width,
      height: shape.bounds.height,
    });
  }

  // Add groups as hierarchical nodes with children
  for (const [groupId, group] of page.groups) {
    const members = groupChildren.get(groupId) ?? [];
    const elkChildren: ElkNode[] = members.map((shape) => ({
      id: shape.id,
      width: shape.bounds.width,
      height: shape.bounds.height,
    }));

    children.push({
      id: groupId,
      width: group.bounds.width,
      height: group.bounds.height,
      children: elkChildren,
      layoutOptions: {
        "elk.algorithm": ALGORITHM_MAP[options.algorithm],
        "elk.direction": DIRECTION_MAP[options.direction],
        "elk.spacing.nodeNode": spacing,
        "elk.padding": "[top=50,left=40,bottom=35,right=40]",
      },
    });
  }

  // Build edges — ELK expects sources/targets to reference node IDs
  const edges: ElkEdge[] = [];
  for (const edge of page.edges.values()) {
    edges.push({
      id: edge.id,
      sources: [edge.sourceId],
      targets: [edge.targetId],
    });
  }

  return {
    id: "root",
    layoutOptions,
    children,
    edges,
  };
}

// ── Layout execution ────────────────────────────────────────

/**
 * Run ELK layout on a page and return new positions/waypoints.
 */
export async function runElkLayout(
  page: Page,
  options: LayoutOptions,
): Promise<LayoutResult> {
  const elk = new ELK();
  const graph = buildElkGraph(page, options);

  const layouted = await elk.layout(graph as any);

  return extractLayoutResult(layouted as any, page);
}

// ── Result extraction ───────────────────────────────────────

/**
 * Extract shape positions and edge waypoints from an ELK layout result.
 * Converts relative coords within groups to absolute coords.
 */
function extractLayoutResult(
  elkResult: ElkGraph & { children?: (ElkNode & { children?: ElkNode[] })[] },
  page: Page,
): LayoutResult {
  const shapePositions = new Map<string, { x: number; y: number }>();
  const edgeWaypoints = new Map<string, Point[]>();

  if (!elkResult.children) return { shapePositions, edgeWaypoints };

  for (const node of elkResult.children) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;

    // Check if this is a group node (has children) or a shape
    if (node.children && node.children.length > 0) {
      // This is a group — set group position and convert children to absolute
      shapePositions.set(node.id, { x, y });

      for (const child of node.children) {
        const childX = (child.x ?? 0) + x;
        const childY = (child.y ?? 0) + y;
        shapePositions.set(child.id, { x: childX, y: childY });
      }
    } else {
      // This is a top-level shape
      shapePositions.set(node.id, { x, y });
    }
  }

  // Extract edge waypoints from sections
  if (elkResult.edges) {
    for (const edge of elkResult.edges as (ElkEdge & { sections?: ElkSection[] })[]) {
      if (edge.sections && edge.sections.length > 0) {
        const section = edge.sections[0];
        const waypoints: Point[] = [];
        if (section.bendPoints) {
          for (const bp of section.bendPoints) {
            waypoints.push({ x: bp.x, y: bp.y });
          }
        }
        edgeWaypoints.set(edge.id, waypoints);
      }
    }
  }

  return { shapePositions, edgeWaypoints };
}
