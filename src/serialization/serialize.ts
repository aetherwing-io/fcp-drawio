import type {
  Diagram, Page, Shape, Edge, Group, Layer,
  StyleSet, EdgeStyleSet, ArrowType, ShapeType,
} from "../types/index.js";
import { NODE_TYPES } from "../lib/node-types.js";
import { computeAllEdgeRenderInfo } from "./connector-intelligence.js";
import type { EdgeRenderInfo } from "./connector-intelligence.js";

// ── XML entity escaping ─────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\n/g, "&#10;");
}

// ── Arrow type → draw.io style mapping ──────────────────────

interface ArrowStyleParts {
  arrow: string;
  fill: string;
}

function arrowTypeToStyle(arrowType: ArrowType): ArrowStyleParts | null {
  switch (arrowType) {
    case "arrow":
      return { arrow: "classic", fill: "1" };
    case "open-arrow":
      return { arrow: "open", fill: "0" };
    case "diamond":
      return { arrow: "diamond", fill: "1" };
    case "circle":
      return { arrow: "oval", fill: "1" };
    case "crow-foot":
      return { arrow: "ERmany", fill: "0" };
    case "none":
      return { arrow: "none", fill: "0" };
    default:
      return null;
  }
}

// ── Style string builders ───────────────────────────────────

/**
 * Build a draw.io style string for a shape.
 * Pattern: baseStyleFromNodeType;fillColor=#xxx;strokeColor=#xxx;fontSize=12;...
 */
export function buildShapeStyleString(shape: Shape): string {
  const parts: string[] = [];

  // Use baseStyleOverride (from stencil packs) if present, otherwise fall back to NODE_TYPES
  const baseStyle = shape.baseStyleOverride ?? NODE_TYPES[shape.type]?.baseStyle;
  if (baseStyle) {
    parts.push(baseStyle.replace(/;$/, ""));
  }

  // Append style properties
  const style = shape.style;
  if (style.fillColor) parts.push(`fillColor=${style.fillColor}`);
  if (style.strokeColor) parts.push(`strokeColor=${style.strokeColor}`);
  if (style.fontColor) parts.push(`fontColor=${style.fontColor}`);
  if (style.fontSize !== null) parts.push(`fontSize=${style.fontSize}`);
  if (style.fontFamily) parts.push(`fontFamily=${style.fontFamily}`);
  if (style.fontStyle !== null && style.fontStyle !== 0) parts.push(`fontStyle=${style.fontStyle}`);
  if (style.rounded && !(baseStyle?.includes("rounded=1"))) parts.push("rounded=1");
  if (style.dashed) parts.push("dashed=1");
  if (style.shadow) parts.push("shadow=1");
  if (style.opacity !== 100) parts.push(`opacity=${style.opacity}`);
  if (style.align) parts.push(`align=${style.align}`);
  if (style.verticalAlign) parts.push(`verticalAlign=${style.verticalAlign}`);

  // Append any extensible/unknown properties
  for (const [key, value] of Object.entries(style)) {
    if (isKnownStyleKey(key)) continue;
    if (value !== null && value !== undefined && value !== "") {
      parts.push(`${key}=${value}`);
    }
  }

  return parts.join(";") + ";";
}

/**
 * Build a draw.io style string for an edge.
 */
export function buildEdgeStyleString(edge: Edge): string {
  const parts: string[] = [];
  const style = edge.style;

  // Edge base style
  parts.push(`edgeStyle=${style.edgeStyle || "orthogonalEdgeStyle"}`);
  if (style.curved) {
    parts.push("curved=1");
  } else {
    parts.push("rounded=1");
  }
  parts.push("orthogonalLoop=1");
  parts.push("jettySize=auto");
  parts.push("html=1");

  // Edge line style
  if (style.dashed) parts.push("dashed=1");
  if (style.dotted) parts.push("dashPattern=1 3");
  if (style.fillColor) parts.push(`fillColor=${style.fillColor}`);
  if (style.strokeColor) parts.push(`strokeColor=${style.strokeColor}`);
  if (style.fontColor) parts.push(`fontColor=${style.fontColor}`);
  if (style.fontSize !== null) parts.push(`fontSize=${style.fontSize}`);
  if (style.fontFamily) parts.push(`fontFamily=${style.fontFamily}`);
  if (style.fontStyle !== null && style.fontStyle !== 0) parts.push(`fontStyle=${style.fontStyle}`);
  if (style.shadow) parts.push("shadow=1");
  if (style.opacity !== 100) parts.push(`opacity=${style.opacity}`);

  // Stroke width for thick style
  const strokeWidth = (style as Record<string, unknown>)["strokeWidth"];
  if (strokeWidth !== undefined && strokeWidth !== null) {
    parts.push(`strokeWidth=${strokeWidth}`);
  }

  // Flow animation
  if (style.flowAnimation) parts.push("flowAnimation=1");

  // Target arrow
  const targetParts = arrowTypeToStyle(edge.targetArrow);
  if (targetParts) {
    // "arrow" (classic) is the default, only emit if non-default
    if (edge.targetArrow !== "arrow") {
      parts.push(`endArrow=${targetParts.arrow}`);
      parts.push(`endFill=${targetParts.fill}`);
    }
  }

  // Source arrow
  const sourceParts = arrowTypeToStyle(edge.sourceArrow);
  if (sourceParts) {
    if (edge.sourceArrow !== "none") {
      parts.push(`startArrow=${sourceParts.arrow}`);
      parts.push(`startFill=${sourceParts.fill}`);
    }
  }

  // Append any extensible/unknown properties
  for (const [key, value] of Object.entries(style)) {
    if (isKnownEdgeStyleKey(key)) continue;
    if (value !== null && value !== undefined && value !== "") {
      parts.push(`${key}=${value}`);
    }
  }

  return parts.join(";") + ";";
}

const KNOWN_STYLE_KEYS = new Set([
  "fillColor", "strokeColor", "fontColor", "fontSize", "fontFamily",
  "fontStyle", "rounded", "dashed", "shadow", "opacity", "align", "verticalAlign",
]);

const KNOWN_EDGE_STYLE_KEYS = new Set([
  ...KNOWN_STYLE_KEYS,
  "edgeStyle", "curved", "flowAnimation", "strokeWidth", "dotted",
]);

function isKnownStyleKey(key: string): boolean {
  return KNOWN_STYLE_KEYS.has(key);
}

function isKnownEdgeStyleKey(key: string): boolean {
  return KNOWN_EDGE_STYLE_KEYS.has(key);
}

// ── Edge style + port helpers ────────────────────────────────

/**
 * Build edge style string, injecting port exit/entry points if provided by connector intelligence.
 */
function buildEdgeStyleStringWithPorts(edge: Edge, renderInfo?: EdgeRenderInfo): string {
  const base = buildEdgeStyleString(edge);
  if (!renderInfo?.ports) return base;

  const ports = renderInfo.ports;
  // Remove trailing semicolon, append port styles, re-add semicolon
  const withoutTrailing = base.replace(/;$/, "");
  return `${withoutTrailing};exitX=${ports.exitX};exitY=${ports.exitY};exitDx=0;exitDy=0;entryX=${ports.entryX};entryY=${ports.entryY};entryDx=0;entryDy=0;`;
}

/**
 * Build inner geometry content for an edge (waypoints and/or label offset).
 * Returns null if the geometry should be self-closing.
 */
function buildEdgeGeometryInner(edge: Edge, renderInfo?: EdgeRenderInfo): string | null {
  const parts: string[] = [];

  // Waypoints
  if (edge.waypoints.length > 0) {
    const wpLines = edge.waypoints.map(
      (wp) => `            <mxPoint x="${wp.x}" y="${wp.y}"/>`
    );
    parts.push(
      `          <Array as="points">\n` +
      wpLines.join("\n") + "\n" +
      `          </Array>`
    );
  }

  // Label offset
  if (renderInfo && (renderInfo.labelOffsetX !== 0 || renderInfo.labelOffsetY !== 0)) {
    parts.push(
      `          <mxPoint x="${renderInfo.labelOffsetX}" y="${renderInfo.labelOffsetY}" as="offset"/>`
    );
  }

  if (parts.length === 0) return null;
  return parts.join("\n");
}

// ── Serialization ───────────────────────────────────────────

function serializePage(page: Page): string {
  const cells: string[] = [];

  // Foundation cells
  cells.push(`      <mxCell id="0"/>`);
  // Default layer — use the model's actual defaultLayer ID so child cells can reference it
  cells.push(`      <mxCell id="${escapeXml(page.defaultLayer)}" parent="0"/>`);

  // Additional layers (beyond default)
  for (const layer of page.layers) {
    if (layer.id === page.defaultLayer) continue;
    cells.push(`      <mxCell id="${escapeXml(layer.id)}" value="${escapeXml(layer.name)}" parent="0"/>`);
  }

  // Groups (containers)
  for (const [, group] of page.groups) {
    if (!group.isContainer) continue;
    const groupStyle = buildGroupStyleString(group);
    const b = group.bounds;
    cells.push(
      `      <mxCell id="${escapeXml(group.id)}" value="${escapeXml(group.name)}" style="${escapeXml(groupStyle)}" vertex="1" connectable="0" parent="${escapeXml(page.defaultLayer)}">\n` +
      `        <mxGeometry x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" as="geometry"/>\n` +
      `      </mxCell>`
    );
  }

  // Shapes
  for (const [, shape] of page.shapes) {
    const styleStr = buildShapeStyleString(shape);
    const b = shape.bounds;
    const parent = shape.parentGroup ?? shape.layer;

    // If parented to a group, convert absolute coords to container-relative
    let x = b.x;
    let y = b.y;
    if (shape.parentGroup) {
      const group = page.groups.get(shape.parentGroup);
      if (group) {
        x = b.x - group.bounds.x;
        y = b.y - group.bounds.y;
      }
    }

    cells.push(
      `      <mxCell id="${escapeXml(shape.id)}" value="${escapeXml(shape.label)}" style="${escapeXml(styleStr)}" vertex="1" parent="${escapeXml(parent)}">\n` +
      `        <mxGeometry x="${x}" y="${y}" width="${b.width}" height="${b.height}" as="geometry"/>\n` +
      `      </mxCell>`
    );
  }

  // Pre-compute connector intelligence for all edges
  const edgeRenderInfos = computeAllEdgeRenderInfo(page);

  // Edges
  for (const [, edge] of page.edges) {
    const renderInfo = edgeRenderInfos.get(edge.id);
    const styleStr = buildEdgeStyleStringWithPorts(edge, renderInfo);
    const labelAttr = edge.label ? ` value="${escapeXml(edge.label)}"` : ` value=""`;

    // Determine the layer for the edge (use the source shape's layer)
    const sourcePage = page.shapes.get(edge.sourceId);
    const edgeParent = sourcePage?.layer ?? page.defaultLayer;

    // Build geometry inner content
    const geomInner = buildEdgeGeometryInner(edge, renderInfo);

    if (geomInner) {
      cells.push(
        `      <mxCell id="${escapeXml(edge.id)}"${labelAttr} style="${escapeXml(styleStr)}" edge="1" source="${escapeXml(edge.sourceId)}" target="${escapeXml(edge.targetId)}" parent="${escapeXml(edgeParent)}">\n` +
        `        <mxGeometry relative="1" as="geometry">\n` +
        geomInner + "\n" +
        `        </mxGeometry>\n` +
        `      </mxCell>`
      );
    } else {
      cells.push(
        `      <mxCell id="${escapeXml(edge.id)}"${labelAttr} style="${escapeXml(styleStr)}" edge="1" source="${escapeXml(edge.sourceId)}" target="${escapeXml(edge.targetId)}" parent="${escapeXml(edgeParent)}">\n` +
        `        <mxGeometry relative="1" as="geometry"/>\n` +
        `      </mxCell>`
      );
    }
  }

  const flowAttr = page.flowDirection ? ` flowDirection="${escapeXml(page.flowDirection)}"` : "";
  return (
    `  <diagram id="${escapeXml(page.id)}" name="${escapeXml(page.name)}"${flowAttr}>\n` +
    `    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1">\n` +
    `    <root>\n` +
    cells.join("\n") + "\n" +
    `    </root>\n` +
    `    </mxGraphModel>\n` +
    `  </diagram>`
  );
}

function buildGroupStyleString(group: Group): string {
  const parts: string[] = [];
  parts.push("whiteSpace=wrap");
  parts.push("html=1");
  parts.push("container=1");
  parts.push("verticalAlign=top");
  parts.push("fontStyle=1");
  parts.push("swimlaneLine=0");

  const style = group.style;
  if (style.fillColor) parts.push(`fillColor=${style.fillColor}`);
  if (style.strokeColor) parts.push(`strokeColor=${style.strokeColor}`);
  if (style.fontColor) parts.push(`fontColor=${style.fontColor}`);
  if (style.dashed) parts.push("dashed=1");
  if (style.rounded) parts.push("rounded=1");
  if (style.shadow) parts.push("shadow=1");
  if (style.opacity !== 100) parts.push(`opacity=${style.opacity}`);
  if (group.collapsed) parts.push("collapsed=1");

  return parts.join(";") + ";";
}

/**
 * Serialize a Diagram to draw.io XML (mxfile format).
 * Always writes uncompressed XML — no base64/deflate encoding.
 */
export function serializeDiagram(diagram: Diagram): string {
  const meta = diagram.metadata;
  const modified = escapeXml(meta.modified);
  const host = escapeXml(meta.host);
  const version = escapeXml(meta.version);

  const pages = diagram.pages.map((page) => serializePage(page));

  // Serialize custom types and themes as JSON in a fcp-meta attribute
  let fcpMetaAttr = "";
  const fcpMeta: Record<string, unknown> = {};
  if (diagram.customTypes.size > 0) {
    fcpMeta.customTypes = Object.fromEntries(diagram.customTypes);
  }
  if (diagram.customThemes.size > 0) {
    fcpMeta.customThemes = Object.fromEntries(diagram.customThemes);
  }
  if (diagram.loadedStencilPacks.size > 0) {
    fcpMeta.loadedStencilPacks = [...diagram.loadedStencilPacks];
  }
  if (Object.keys(fcpMeta).length > 0) {
    fcpMetaAttr = ` fcp-meta="${escapeXml(JSON.stringify(fcpMeta))}"`;
  }

  return (
    `<mxfile host="${host}" modified="${modified}" version="${version}"${fcpMetaAttr}>\n` +
    pages.join("\n") + "\n" +
    `</mxfile>`
  );
}
