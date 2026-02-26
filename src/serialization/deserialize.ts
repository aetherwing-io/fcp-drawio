import { XMLParser } from "fast-xml-parser";
import { inflateSync } from "node:zlib";
import type {
  Diagram, Page, Shape, Edge, Group, Layer, Bounds,
  StyleSet, EdgeStyleSet, ShapeType, ArrowType,
  DiagramMetadata,
} from "../types/index.js";
import { NODE_TYPES } from "../lib/node-types.js";
import { createDefaultStyle, createDefaultEdgeStyle } from "../model/defaults.js";

// ── XML parser configuration ────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseAttributeValue: false, // keep all values as strings
});

// ── Compressed content handling ─────────────────────────────

function isCompressed(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.length > 0 && !trimmed.startsWith("<");
}

function decompressContent(encoded: string): string {
  const buffer = Buffer.from(encoded.trim(), "base64");
  const inflated = inflateSync(buffer, { finishFlush: 2 }); // Z_SYNC_FLUSH
  return decodeURIComponent(inflated.toString());
}

// ── Style string parsing ────────────────────────────────────

function parseStyleString(styleStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!styleStr) return result;

  const parts = styleStr.split(";").filter((s) => s.length > 0);
  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) {
      // A bare token like "ellipse", "rhombus", "rounded", "triangle"
      // Store as key with empty value to preserve it
      result[part] = "";
    } else {
      const key = part.substring(0, eqIdx);
      const value = part.substring(eqIdx + 1);
      result[key] = value;
    }
  }
  return result;
}

/**
 * Build a StyleSet from a parsed style map.
 */
function buildStyleSet(styleMap: Record<string, string>): StyleSet {
  const style = createDefaultStyle();

  if (styleMap["fillColor"]) style.fillColor = styleMap["fillColor"];
  if (styleMap["strokeColor"]) style.strokeColor = styleMap["strokeColor"];
  if (styleMap["fontColor"]) style.fontColor = styleMap["fontColor"];
  if (styleMap["fontSize"]) style.fontSize = parseInt(styleMap["fontSize"], 10);
  if (styleMap["fontFamily"]) style.fontFamily = styleMap["fontFamily"];
  if (styleMap["fontStyle"]) style.fontStyle = parseInt(styleMap["fontStyle"], 10);
  if (styleMap["rounded"] === "1" || styleMap["rounded"] === "") style.rounded = true;
  if (styleMap["dashed"] === "1") style.dashed = true;
  if (styleMap["shadow"] === "1") style.shadow = true;
  if (styleMap["opacity"]) style.opacity = parseInt(styleMap["opacity"], 10);

  // Preserve unknown properties in the extensible bucket
  const knownKeys = new Set([
    "fillColor", "strokeColor", "fontColor", "fontSize", "fontFamily",
    "fontStyle", "rounded", "dashed", "shadow", "opacity",
    // draw.io structural keys that are part of the base style, not extensible
    "whiteSpace", "html", "aspect", "boundedLbl", "backgroundOutline",
    "size", "perimeter", "fixedSize", "container", "connectable",
    "collapsed", "verticalAlign", "align",
  ]);
  for (const [key, value] of Object.entries(styleMap)) {
    if (!knownKeys.has(key) && !isBaseStyleToken(key)) {
      style[key] = value;
    }
  }

  return style;
}

/**
 * Build an EdgeStyleSet from a parsed style map.
 */
function buildEdgeStyleSet(styleMap: Record<string, string>): EdgeStyleSet {
  const base = buildStyleSet(styleMap);
  const edgeStyle: EdgeStyleSet = {
    ...base,
    edgeStyle: styleMap["edgeStyle"] || "orthogonalEdgeStyle",
    curved: styleMap["curved"] === "1",
    flowAnimation: styleMap["flowAnimation"] === "1",
  };

  // Copy strokeWidth as extensible if present
  if (styleMap["strokeWidth"]) {
    edgeStyle["strokeWidth"] = styleMap["strokeWidth"];
  }

  return edgeStyle;
}

// ── Shape type inference from style ─────────────────────────

/**
 * Tokens that are part of base styles and don't go into extensible bucket.
 */
function isBaseStyleToken(key: string): boolean {
  // Bare tokens from base styles (no '=' in original)
  const bareTokens = new Set([
    "ellipse", "rhombus", "triangle",
  ]);
  return bareTokens.has(key);
}

/**
 * Infer the ShapeType from a draw.io style string's parsed map.
 * Uses NODE_TYPES definitions to reverse-match.
 */
function inferShapeType(styleMap: Record<string, string>): ShapeType {
  const shape = styleMap["shape"] || "";

  // Direct shape mappings
  if (shape === "cylinder3") return "db";
  if (shape === "hexagon") return "api";
  if (shape === "cloud") return "cloud";
  if (shape === "mxgraph.basic.person") return "actor";
  if (shape === "document") return "doc";
  if (shape === "parallelogram") return "queue";
  if (shape === "process") return "process";

  // Bare token checks
  if ("rhombus" in styleMap) return "decision";
  if ("triangle" in styleMap) return "triangle";
  if ("ellipse" in styleMap && shape !== "cloud") return "circle";

  // rounded=1 without a specific shape → svc
  if (styleMap["rounded"] === "1" || styleMap["rounded"] === "") return "svc";

  // Default fallback
  return "box";
}

/**
 * Parse arrow type from draw.io style values.
 */
function parseArrowType(arrowValue: string | undefined, fillValue: string | undefined): ArrowType {
  if (!arrowValue || arrowValue === "classic") return "arrow";
  if (arrowValue === "open") return "open-arrow";
  if (arrowValue === "diamond") return "diamond";
  if (arrowValue === "oval") return "circle";
  if (arrowValue === "ERmany") return "crow-foot";
  if (arrowValue === "none") return "none";
  return "arrow";
}

// ── Cell processing ─────────────────────────────────────────

interface RawCell {
  "@_id"?: string;
  "@_value"?: string;
  "@_style"?: string;
  "@_vertex"?: string;
  "@_edge"?: string;
  "@_parent"?: string;
  "@_source"?: string;
  "@_target"?: string;
  "@_connectable"?: string;
  mxGeometry?: {
    "@_x"?: string;
    "@_y"?: string;
    "@_width"?: string;
    "@_height"?: string;
    "@_relative"?: string;
    "@_as"?: string;
    Array?: {
      "@_as"?: string;
      mxPoint?: RawPoint | RawPoint[];
    };
  };
  [key: string]: unknown;
}

interface RawPoint {
  "@_x"?: string;
  "@_y"?: string;
}

function parseBounds(cell: RawCell): Bounds {
  const geom = cell.mxGeometry;
  if (!geom) return { x: 0, y: 0, width: 120, height: 60 };
  return {
    x: parseFloat(geom["@_x"] || "0"),
    y: parseFloat(geom["@_y"] || "0"),
    width: Math.max(parseFloat(geom["@_width"] || "120"), 20),
    height: Math.max(parseFloat(geom["@_height"] || "60"), 20),
  };
}

function parseWaypoints(cell: RawCell): { x: number; y: number }[] {
  const geom = cell.mxGeometry;
  if (!geom?.Array) return [];
  const arr = geom.Array;
  if (arr["@_as"] !== "points") return [];

  const points = arr.mxPoint;
  if (!points) return [];
  const pointList = Array.isArray(points) ? points : [points];

  return pointList.map((p: RawPoint) => ({
    x: parseFloat(p["@_x"] || "0"),
    y: parseFloat(p["@_y"] || "0"),
  }));
}

function processCells(cells: RawCell[]): {
  shapes: Map<string, Shape>;
  edges: Map<string, Edge>;
  groups: Map<string, Group>;
  layers: Layer[];
  defaultLayer: string;
} {
  const shapes = new Map<string, Shape>();
  const edges = new Map<string, Edge>();
  const groups = new Map<string, Group>();
  const layers: Layer[] = [];
  let defaultLayer = "1";
  let layerOrder = 0;

  // First pass: identify layers and the default layer
  for (const cell of cells) {
    const id = cell["@_id"] || "";
    const parent = cell["@_parent"] || "";

    if (id === "0") {
      // Root cell — skip
      continue;
    }

    if (id === "1" && parent === "0") {
      // Default layer
      defaultLayer = "1";
      layers.push({
        id: "1",
        name: "Default",
        visible: true,
        locked: false,
        order: layerOrder++,
      });
      continue;
    }

    if (parent === "0" && id !== "1") {
      // Additional layer
      const name = cell["@_value"] || `Layer-${id}`;
      layers.push({
        id,
        name,
        visible: true,
        locked: false,
        order: layerOrder++,
      });
      continue;
    }
  }

  // If no default layer was found, create one
  if (layers.length === 0) {
    layers.push({
      id: "1",
      name: "Default",
      visible: true,
      locked: false,
      order: 0,
    });
  }

  // Second pass: identify containers/groups
  for (const cell of cells) {
    const id = cell["@_id"] || "";
    const parent = cell["@_parent"] || "";

    if (id === "0" || parent === "0") continue;

    const isVertex = cell["@_vertex"] === "1";
    const styleStr = cell["@_style"] || "";
    const styleMap = parseStyleString(styleStr);
    const isContainer = styleMap["container"] === "1" || cell["@_connectable"] === "0";

    if (isVertex && isContainer) {
      const bounds = parseBounds(cell);
      const groupStyle = buildStyleSet(styleMap);
      const collapsed = styleMap["collapsed"] === "1";

      groups.set(id, {
        id,
        name: cell["@_value"] || "",
        memberIds: new Set<string>(),
        isContainer: true,
        collapsed,
        bounds,
        style: groupStyle,
      });
    }
  }

  // Third pass: shapes and edges
  const now = Date.now();
  let seq = 1;

  for (const cell of cells) {
    const id = cell["@_id"] || "";
    const parent = cell["@_parent"] || "";

    if (id === "0" || parent === "0") continue;

    const isVertex = cell["@_vertex"] === "1";
    const isEdge = cell["@_edge"] === "1";
    const styleStr = cell["@_style"] || "";
    const styleMap = parseStyleString(styleStr);

    // Skip containers — already processed
    if (isVertex && (styleMap["container"] === "1" || cell["@_connectable"] === "0")) continue;

    if (isVertex) {
      const bounds = parseBounds(cell);
      const shapeStyle = buildStyleSet(styleMap);
      const shapeType = inferShapeType(styleMap);

      // Determine if parent is a group or a layer
      const parentGroup = groups.has(parent) ? parent : null;
      const layer = parentGroup
        ? findLayerForGroup(parent, groups, cells, defaultLayer)
        : parent;

      // Track group membership
      if (parentGroup && groups.has(parentGroup)) {
        groups.get(parentGroup)!.memberIds.add(id);
      }

      // Convert container-relative coords back to absolute for the model
      if (parentGroup) {
        const group = groups.get(parentGroup);
        if (group) {
          bounds.x += group.bounds.x;
          bounds.y += group.bounds.y;
        }
      }

      shapes.set(id, {
        id,
        label: cell["@_value"] || "",
        type: shapeType,
        bounds,
        style: shapeStyle,
        parentGroup,
        layer: layer || defaultLayer,
        metadata: {},
        createdAt: seq,
        modifiedAt: seq++,
      });
    }

    if (isEdge) {
      const edgeStyle = buildEdgeStyleSet(styleMap);
      const waypoints = parseWaypoints(cell);

      const targetArrow = parseArrowType(styleMap["endArrow"], styleMap["endFill"]);
      const sourceArrow = parseArrowType(styleMap["startArrow"], styleMap["startFill"]);

      edges.set(id, {
        id,
        sourceId: cell["@_source"] || "",
        targetId: cell["@_target"] || "",
        label: cell["@_value"] || null,
        style: edgeStyle,
        waypoints,
        sourceArrow,
        targetArrow,
        createdAt: seq,
        modifiedAt: seq++,
      });
    }
  }

  return { shapes, edges, groups, layers, defaultLayer };
}

/**
 * Walk upward from a group to find which layer it belongs to.
 */
function findLayerForGroup(
  groupId: string,
  groups: Map<string, Group>,
  cells: RawCell[],
  defaultLayer: string,
): string {
  // Look up the cell for this group to find its parent
  for (const cell of cells) {
    if (cell["@_id"] === groupId) {
      const parent = cell["@_parent"] || "";
      // If parent is a layer (parent of "0"), return it
      // Check if parent is another group
      if (groups.has(parent)) {
        return findLayerForGroup(parent, groups, cells, defaultLayer);
      }
      return parent || defaultLayer;
    }
  }
  return defaultLayer;
}

// ── Main deserialization ────────────────────────────────────

/**
 * Deserialize a draw.io XML string into a Diagram object.
 * Handles both compressed (base64/deflate) and uncompressed content.
 */
export function deserializeDiagram(xml: string): Diagram {
  const parsed = parser.parse(xml);

  // Extract mxfile attributes
  const mxfile = parsed.mxfile;
  if (!mxfile) {
    throw new Error("Invalid draw.io XML: missing <mxfile> element");
  }

  const metadata: DiagramMetadata = {
    host: mxfile["@_host"] || "drawio-mcp-studio",
    modified: mxfile["@_modified"] || new Date().toISOString(),
    version: mxfile["@_version"] || "0.2.0",
  };

  // Extract diagram elements (one per page)
  let diagramElements = mxfile.diagram;
  if (!diagramElements) {
    throw new Error("Invalid draw.io XML: no <diagram> elements found");
  }
  if (!Array.isArray(diagramElements)) {
    diagramElements = [diagramElements];
  }

  const pages: Page[] = [];

  for (const diag of diagramElements) {
    const pageId = diag["@_id"] || crypto.randomUUID();
    const pageName = diag["@_name"] || "Page-1";

    // Get mxGraphModel — might be inline XML or compressed content
    let graphModel = diag.mxGraphModel;

    if (!graphModel) {
      // Check for compressed/text content
      const textContent = diag["#text"] || (typeof diag === "string" ? diag : "");
      if (textContent && isCompressed(String(textContent))) {
        const decompressed = decompressContent(String(textContent));
        const innerParsed = parser.parse(decompressed);
        graphModel = innerParsed.mxGraphModel;
      }
    }

    if (!graphModel) {
      // Create empty page if no model found
      pages.push({
        id: pageId,
        name: pageName,
        shapes: new Map(),
        edges: new Map(),
        groups: new Map(),
        layers: [{ id: "1", name: "Default", visible: true, locked: false, order: 0 }],
        defaultLayer: "1",
      });
      continue;
    }

    // Extract cells from root
    const root = graphModel.root;
    if (!root) {
      pages.push({
        id: pageId,
        name: pageName,
        shapes: new Map(),
        edges: new Map(),
        groups: new Map(),
        layers: [{ id: "1", name: "Default", visible: true, locked: false, order: 0 }],
        defaultLayer: "1",
      });
      continue;
    }

    // Get mxCell elements
    let rawCells: RawCell[] = [];
    if (root.mxCell) {
      rawCells = Array.isArray(root.mxCell) ? root.mxCell : [root.mxCell];
    }

    const { shapes, edges, groups, layers, defaultLayer } = processCells(rawCells);

    // Read flowDirection from diagram element if present
    const rawFlowDir = diag["@_flowDirection"] as string | undefined;
    const validFlowDirs = new Set(["TB", "LR", "BT", "RL"]);
    const flowDirection = rawFlowDir && validFlowDirs.has(rawFlowDir)
      ? (rawFlowDir as import("../types/index.js").FlowDirection)
      : undefined;

    // Validate: remove edges referencing non-existent shapes
    for (const [edgeId, edge] of edges) {
      if (!shapes.has(edge.sourceId) || !shapes.has(edge.targetId)) {
        edges.delete(edgeId);
      }
    }

    // Validate: remove group members that don't exist
    for (const [, group] of groups) {
      for (const memberId of group.memberIds) {
        if (!shapes.has(memberId)) {
          group.memberIds.delete(memberId);
        }
      }
    }

    pages.push({
      id: pageId,
      name: pageName,
      shapes,
      edges,
      groups,
      layers,
      defaultLayer,
      flowDirection,
    });
  }

  return {
    id: crypto.randomUUID(),
    title: pages[0]?.name || "Untitled",
    filePath: null,
    pages,
    activePage: pages[0]?.id || "",
    customTypes: new Map(),
    metadata,
  };
}
