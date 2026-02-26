import type { Shape, Edge, Group, ThemeName } from "../types/index.js";
import type { DiagramModel } from "../model/diagram-model.js";
import { THEMES } from "../lib/themes.js";

/**
 * Reverse-lookup a theme name from a fill color.
 */
function reverseThemeLookup(fillColor: string | null): string | null {
  if (!fillColor) return null;
  for (const [name, colors] of Object.entries(THEMES)) {
    if (colors.fill === fillColor) return name;
  }
  return null;
}

/**
 * Format a shape creation confirmation.
 * Example: "+svc AuthService @(120,200 140x60) blue"
 */
export function formatShapeCreated(shape: Shape): string {
  const theme = reverseThemeLookup(shape.style.fillColor);
  const pos = `@(${shape.bounds.x},${shape.bounds.y} ${shape.bounds.width}x${shape.bounds.height})`;
  const parts = [`+${shape.type}`, shape.label, pos];
  if (theme) parts.push(theme);
  return parts.join(" ");
}

/**
 * Format an edge creation confirmation.
 * Example: '~AuthService->UserDB "queries" dashed'
 */
export function formatEdgeCreated(edge: Edge, sourceLabel: string, targetLabel: string): string {
  const parts = [`~${sourceLabel}->${targetLabel}`];
  if (edge.label) parts.push(`"${edge.label}"`);
  if (edge.style.dashed) parts.push("dashed");
  if (edge.style.curved) parts.push("curved");
  if (edge.style.flowAnimation) parts.push("animated");
  return parts.join(" ");
}

/**
 * Format a shape modification confirmation.
 * Example: "*styled AuthService fill:red (1 shape)"
 */
export function formatShapeModified(shape: Shape, what: string): string {
  return `*${what} ${shape.label}`;
}

/**
 * Format a shape deletion confirmation.
 * Example: "-AuthService"
 */
export function formatShapeDeleted(shape: Shape): string {
  return `-${shape.label}`;
}

/**
 * Format a group creation confirmation.
 * Example: "!group Backend (3 shapes)"
 */
export function formatGroupCreated(group: Group): string {
  return `!group ${group.name} (${group.memberIds.size} shapes)`;
}

/**
 * Format a full status output (Tier 3).
 */
export function formatStatus(model: DiagramModel): string {
  const d = model.diagram;
  const page = model.getActivePage();
  const shapeCount = page.shapes.size;
  const edgeCount = page.edges.size;
  const groupCount = page.groups.size;
  const opCount = model.eventLog.events.length;
  const checkpointCount = model.eventLog.checkpoints.size;
  const savedState = d.filePath ? `saved: ${d.filePath}` : "unsaved";

  const lines: string[] = [];
  lines.push(`status: "${d.title}" (${savedState}, ${opCount} ops, ${checkpointCount} checkpoints)`);
  lines.push(`  page: ${page.name} (${shapeCount} shapes, ${edgeCount} edges, ${groupCount} groups)`);

  // Group shapes by their group membership
  const grouped = new Map<string, Shape[]>();
  const ungrouped: Shape[] = [];
  for (const shape of page.shapes.values()) {
    if (shape.parentGroup) {
      const group = page.groups.get(shape.parentGroup);
      const groupName = group?.name ?? "Unknown";
      const list = grouped.get(groupName) ?? [];
      list.push(shape);
      grouped.set(groupName, list);
    } else {
      ungrouped.push(shape);
    }
  }

  for (const [groupName, shapes] of grouped) {
    const shapeList = shapes.map((s) => `${s.label}(${s.type})`).join(", ");
    lines.push(`    ${groupName}: ${shapeList}`);
  }

  if (ungrouped.length > 0) {
    const shapeList = ungrouped.map((s) => `${s.label}(${s.type})`).join(", ");
    lines.push(`    Ungrouped: ${shapeList}`);
  }

  // Checkpoints
  if (checkpointCount > 0) {
    const cpEntries: string[] = [];
    for (const [name, idx] of model.eventLog.checkpoints) {
      cpEntries.push(`"${name}" @op:${idx}`);
    }
    lines.push(`  checkpoints: ${cpEntries.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Format a list of shapes.
 */
export function formatList(shapes: Shape[]): string {
  if (shapes.length === 0) return "No shapes on this page.";
  return shapes.map((s) => `${s.label}(${s.type})`).join("\n");
}

/**
 * Format connections for a shape.
 */
export function formatConnections(
  shape: Shape,
  incoming: Edge[],
  outgoing: Edge[],
  model: DiagramModel,
): string {
  const page = model.getActivePage();
  const lines: string[] = [];
  lines.push(`connections for ${shape.label}:`);

  if (outgoing.length > 0) {
    const targets = outgoing.map((e) => {
      const target = page.shapes.get(e.targetId);
      const label = target?.label ?? e.targetId;
      return e.label ? `${label}("${e.label}")` : label;
    });
    lines.push(`  out: ${targets.join(", ")}`);
  } else {
    lines.push("  out: (none)");
  }

  if (incoming.length > 0) {
    const sources = incoming.map((e) => {
      const source = page.shapes.get(e.sourceId);
      const label = source?.label ?? e.sourceId;
      return e.label ? `${label}("${e.label}")` : label;
    });
    lines.push(`  in: ${sources.join(", ")}`);
  } else {
    lines.push("  in: (none)");
  }

  return lines.join("\n");
}

/**
 * Format a shape description (full details).
 */
export function formatDescribe(shape: Shape, model: DiagramModel): string {
  const page = model.getActivePage();
  const theme = reverseThemeLookup(shape.style.fillColor);
  const lines: string[] = [];
  lines.push(`${shape.label} (${shape.type})`);
  lines.push(`  position: (${shape.bounds.x}, ${shape.bounds.y})`);
  lines.push(`  size: ${shape.bounds.width}x${shape.bounds.height}`);
  if (theme) lines.push(`  theme: ${theme}`);
  if (shape.style.fillColor) lines.push(`  fill: ${shape.style.fillColor}`);
  if (shape.style.strokeColor) lines.push(`  stroke: ${shape.style.strokeColor}`);
  if (shape.parentGroup) {
    const group = page.groups.get(shape.parentGroup);
    if (group) lines.push(`  group: ${group.name}`);
  }
  if (shape.metadata.badges && shape.metadata.badges.length > 0) {
    lines.push(`  badges: ${shape.metadata.badges.map((b) => b.text).join(", ")}`);
  }
  const layer = page.layers.find((l) => l.id === shape.layer);
  if (layer) lines.push(`  layer: ${layer.name}`);
  return lines.join("\n");
}

/**
 * Format stats summary.
 */
export function formatStats(model: DiagramModel): string {
  const page = model.getActivePage();
  const lines: string[] = [];
  lines.push(`shapes: ${page.shapes.size}`);
  lines.push(`edges: ${page.edges.size}`);
  lines.push(`groups: ${page.groups.size}`);
  lines.push(`pages: ${model.diagram.pages.length}`);
  return lines.join(", ");
}

/**
 * Format history events.
 */
export function formatHistory(events: import("../types/index.js").DiagramEvent[]): string {
  if (events.length === 0) return "No history.";
  return events.map((e) => {
    switch (e.type) {
      case "shape_created": return `+${e.shape.type} ${e.shape.label}`;
      case "shape_modified": return `*modified ${e.id}`;
      case "shape_deleted": return `-${e.shape.label}`;
      case "edge_created": return `~edge ${e.edge.sourceId}->${e.edge.targetId}`;
      case "edge_modified": return `~modified edge ${e.id}`;
      case "edge_deleted": return `-edge ${e.edge.sourceId}->${e.edge.targetId}`;
      case "group_created": return `!group ${e.group.name}`;
      case "group_modified": return `!modified group ${e.id}`;
      case "group_dissolved": return `!ungroup ${e.group.name}`;
      case "page_added": return `+page ${e.page.name}`;
      case "page_removed": return `-page ${e.page.name}`;
      case "checkpoint": return `checkpoint "${e.name}"`;
    }
  }).join("\n");
}
