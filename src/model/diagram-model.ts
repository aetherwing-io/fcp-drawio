import type {
  Diagram, Page, Shape, Edge, Group, Layer, Bounds, Point,
  StyleSet, EdgeStyleSet, ShapeType, ArrowType, ThemeName,
  DiagramEvent, EventLog, CustomType, Badge,
} from "../types/index.js";
import { createEventLog, appendEvent, createCheckpoint, getUndoEvents, undoToCheckpoint, getRedoEvents, getRecentEvents, canUndo, canRedo } from "./event-log.js";
import { nextShapeId, nextEdgeId, nextGroupId, nextPageId, nextLayerId, nextSequence } from "./id.js";
import { createDefaultStyle, createDefaultEdgeStyle } from "./defaults.js";
import { ReferenceRegistry } from "./reference-registry.js";
import { NODE_TYPES, inferTypeFromLabel, computeDefaultSize } from "../lib/node-types.js";
import { THEMES, isThemeName } from "../lib/themes.js";

const DEFAULT_GAP = 60;
const FIRST_SHAPE_POS = { x: 200, y: 200 };

export class DiagramModel {
  diagram: Diagram;
  eventLog: EventLog;
  registry: ReferenceRegistry;

  constructor() {
    this.eventLog = createEventLog();
    this.registry = new ReferenceRegistry();
    this.diagram = this.createEmptyDiagram("Untitled");
  }

  // ── Diagram lifecycle ────────────────────────────────────

  createNew(title: string): void {
    this.diagram = this.createEmptyDiagram(title);
    this.eventLog = createEventLog();
    this.rebuildRegistry();
  }

  private createEmptyDiagram(title: string): Diagram {
    const pageId = nextPageId();
    const layerId = nextLayerId();
    const page: Page = {
      id: pageId,
      name: "Page-1",
      shapes: new Map(),
      edges: new Map(),
      groups: new Map(),
      layers: [{ id: layerId, name: "Default", visible: true, locked: false, order: 0 }],
      defaultLayer: layerId,
    };
    return {
      id: crypto.randomUUID(),
      title,
      filePath: null,
      pages: [page],
      activePage: pageId,
      customTypes: new Map(),
      metadata: {
        host: "drawio-mcp-studio",
        modified: new Date().toISOString(),
        version: "0.2.0",
      },
    };
  }

  // ── Page access ──────────────────────────────────────────

  getActivePage(): Page {
    const page = this.diagram.pages.find((p) => p.id === this.diagram.activePage);
    if (!page) throw new Error("No active page");
    return page;
  }

  getPageByName(name: string): Page | undefined {
    return this.diagram.pages.find((p) => p.name === name);
  }

  switchPage(name: string): Page | null {
    const page = this.getPageByName(name);
    if (!page) return null;
    this.diagram.activePage = page.id;
    this.rebuildRegistry();
    return page;
  }

  addPage(name: string): Page {
    const layerId = nextLayerId();
    const page: Page = {
      id: nextPageId(),
      name,
      shapes: new Map(),
      edges: new Map(),
      groups: new Map(),
      layers: [{ id: layerId, name: "Default", visible: true, locked: false, order: 0 }],
      defaultLayer: layerId,
    };
    this.diagram.pages.push(page);
    this.emit({ type: "page_added", page });
    this.diagram.activePage = page.id;
    this.rebuildRegistry();
    return page;
  }

  removePage(name: string): boolean {
    if (this.diagram.pages.length <= 1) return false;
    const idx = this.diagram.pages.findIndex((p) => p.name === name);
    if (idx === -1) return false;
    const [removed] = this.diagram.pages.splice(idx, 1);
    this.emit({ type: "page_removed", page: removed });
    if (this.diagram.activePage === removed.id) {
      this.diagram.activePage = this.diagram.pages[0].id;
      this.rebuildRegistry();
    }
    return true;
  }

  // ── Shape CRUD ───────────────────────────────────────────

  addShape(
    label: string,
    type: ShapeType,
    options: {
      theme?: ThemeName;
      near?: string;      // shape ID to position near
      dir?: string;
      at?: Point;
      inGroup?: string;   // group ID
      size?: { width: number; height: number };
    } = {},
  ): Shape {
    const page = this.getActivePage();
    const now = nextSequence();

    // Compute size
    const computedSize = options.size ?? computeDefaultSize(type, label);

    // Compute position
    const position = this.computePosition(page, options, computedSize);

    // Build style
    const style = this.buildShapeStyle(type, options.theme);

    const shape: Shape = {
      id: nextShapeId(),
      label,
      type,
      bounds: { x: position.x, y: position.y, width: computedSize.width, height: computedSize.height },
      style,
      parentGroup: options.inGroup ?? null,
      layer: page.defaultLayer,
      metadata: {},
      createdAt: now,
      modifiedAt: now,
    };

    page.shapes.set(shape.id, shape);

    // If placed in a group, add to group membership
    if (options.inGroup) {
      const group = page.groups.get(options.inGroup);
      if (group) {
        group.memberIds.add(shape.id);
        this.recomputeGroupBounds(group, page);
      }
    }

    this.emit({ type: "shape_created", shape });
    this.rebuildRegistry();
    return shape;
  }

  modifyShape(id: string, changes: Partial<Pick<Shape, "label" | "type" | "bounds" | "style" | "parentGroup" | "metadata">>): Shape | null {
    const page = this.getActivePage();
    const shape = page.shapes.get(id);
    if (!shape) return null;

    const before: Partial<Shape> = {};
    const after: Partial<Shape> = {};

    for (const [key, value] of Object.entries(changes)) {
      if (value !== undefined) {
        (before as any)[key] = (shape as any)[key];
        (after as any)[key] = value;
        (shape as any)[key] = value;
      }
    }

    shape.modifiedAt = nextSequence();
    this.emit({ type: "shape_modified", id, before, after });
    this.rebuildRegistry();
    return shape;
  }

  removeShape(id: string): Shape | null {
    const page = this.getActivePage();
    const shape = page.shapes.get(id);
    if (!shape) return null;

    // Remove connected edges
    const edgesToRemove: string[] = [];
    for (const [edgeId, edge] of page.edges) {
      if (edge.sourceId === id || edge.targetId === id) {
        edgesToRemove.push(edgeId);
      }
    }
    for (const edgeId of edgesToRemove) {
      this.removeEdge(edgeId);
    }

    // Remove from group
    if (shape.parentGroup) {
      const group = page.groups.get(shape.parentGroup);
      if (group) {
        group.memberIds.delete(id);
        this.recomputeGroupBounds(group, page);
      }
    }

    page.shapes.delete(id);
    this.emit({ type: "shape_deleted", shape });
    this.rebuildRegistry();
    return shape;
  }

  // ── Edge CRUD ────────────────────────────────────────────

  addEdge(
    sourceId: string,
    targetId: string,
    options: {
      label?: string;
      style?: Partial<EdgeStyleSet>;
      sourceArrow?: ArrowType;
      targetArrow?: ArrowType;
    } = {},
  ): Edge | null {
    const page = this.getActivePage();
    if (!page.shapes.has(sourceId) || !page.shapes.has(targetId)) return null;

    const now = nextSequence();
    const edgeStyle = { ...createDefaultEdgeStyle(), ...options.style };

    const edge: Edge = {
      id: nextEdgeId(),
      sourceId,
      targetId,
      label: options.label ?? null,
      style: edgeStyle,
      waypoints: [],
      sourceArrow: options.sourceArrow ?? "none",
      targetArrow: options.targetArrow ?? "arrow",
      createdAt: now,
      modifiedAt: now,
    };

    page.edges.set(edge.id, edge);
    this.emit({ type: "edge_created", edge });
    this.rebuildRegistry();
    return edge;
  }

  removeEdge(id: string): Edge | null {
    const page = this.getActivePage();
    const edge = page.edges.get(id);
    if (!edge) return null;

    page.edges.delete(id);
    this.emit({ type: "edge_deleted", edge });
    this.rebuildRegistry();
    return edge;
  }

  findEdge(sourceId: string, targetId: string): Edge | undefined {
    const page = this.getActivePage();
    for (const edge of page.edges.values()) {
      if (edge.sourceId === sourceId && edge.targetId === targetId) return edge;
    }
    return undefined;
  }

  // ── Group operations ─────────────────────────────────────

  createGroup(name: string, memberIds: string[]): Group | null {
    const page = this.getActivePage();

    // Validate all members exist
    for (const id of memberIds) {
      if (!page.shapes.has(id)) return null;
    }

    const group: Group = {
      id: nextGroupId(),
      name,
      memberIds: new Set(memberIds),
      isContainer: true,
      collapsed: false,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      style: createDefaultStyle(),
    };

    // Set parent group on each member
    for (const id of memberIds) {
      const shape = page.shapes.get(id)!;
      shape.parentGroup = group.id;
    }

    this.recomputeGroupBounds(group, page);
    page.groups.set(group.id, group);
    this.emit({ type: "group_created", group });
    this.rebuildRegistry();
    return group;
  }

  dissolveGroup(groupId: string): Group | null {
    const page = this.getActivePage();
    const group = page.groups.get(groupId);
    if (!group) return null;

    // Clear parent group from members
    for (const id of group.memberIds) {
      const shape = page.shapes.get(id);
      if (shape) shape.parentGroup = null;
    }

    page.groups.delete(groupId);
    this.emit({ type: "group_dissolved", group });
    this.rebuildRegistry();
    return group;
  }

  getGroupByName(name: string): Group | undefined {
    const page = this.getActivePage();
    for (const group of page.groups.values()) {
      if (group.name === name) return group;
    }
    return undefined;
  }

  // ── Custom types ─────────────────────────────────────────

  defineCustomType(name: string, base: ShapeType, options: { theme?: ThemeName; badge?: string; size?: { width: number; height: number } } = {}): CustomType {
    const ct: CustomType = {
      name,
      base,
      theme: options.theme,
      badge: options.badge,
      defaultSize: options.size,
    };
    this.diagram.customTypes.set(name, ct);
    return ct;
  }

  // ── Checkpoints and undo ─────────────────────────────────

  checkpoint(name: string): void {
    createCheckpoint(this.eventLog, name);
  }

  undo(count: number = 1): DiagramEvent[] {
    const events = getUndoEvents(this.eventLog, count);
    for (const event of events) {
      this.reverseEvent(event);
    }
    this.rebuildRegistry();
    return events;
  }

  undoTo(checkpointName: string): DiagramEvent[] | null {
    const events = undoToCheckpoint(this.eventLog, checkpointName);
    if (!events) return null;
    for (const event of events) {
      this.reverseEvent(event);
    }
    this.rebuildRegistry();
    return events;
  }

  redo(count: number = 1): DiagramEvent[] {
    const events = getRedoEvents(this.eventLog, count);
    for (const event of events) {
      this.replayEvent(event);
    }
    this.rebuildRegistry();
    return events;
  }

  getHistory(count: number): DiagramEvent[] {
    return getRecentEvents(this.eventLog, count);
  }

  canUndo(): boolean {
    return canUndo(this.eventLog);
  }

  canRedo(): boolean {
    return canRedo(this.eventLog);
  }

  /** Compact state digest for drift detection. */
  getDigest(): string {
    const page = this.getActivePage();
    const pageIdx = this.diagram.pages.findIndex(p => p.id === this.diagram.activePage) + 1;
    const totalPages = this.diagram.pages.length;
    return `[${page.shapes.size}s ${page.edges.size}e ${page.groups.size}g p:${pageIdx}/${totalPages}]`;
  }

  // ── Position computation ─────────────────────────────────

  private computePosition(
    page: Page,
    options: { near?: string; dir?: string; at?: Point },
    size: { width: number; height: number },
  ): Point {
    // Absolute position
    if (options.at) return options.at;

    // Relative to another shape
    if (options.near) {
      const ref = page.shapes.get(options.near);
      if (ref) {
        return this.positionRelativeTo(ref.bounds, size, options.dir ?? "below");
      }
    }

    // Relative to most recent shape
    const recent = this.registry.getMostRecent(1);
    if (recent.length > 0) {
      return this.positionRelativeTo(recent[0].bounds, { width: size.width, height: size.height }, "below");
    }

    // First shape on empty page
    return FIRST_SHAPE_POS;
  }

  private positionRelativeTo(
    ref: Bounds,
    size: { width: number; height: number },
    dir: string,
  ): Point {
    const gap = DEFAULT_GAP;
    const refCx = ref.x + ref.width / 2;
    const refCy = ref.y + ref.height / 2;

    switch (dir) {
      case "below":
        return { x: refCx - size.width / 2, y: ref.y + ref.height + gap };
      case "above":
        return { x: refCx - size.width / 2, y: ref.y - gap - size.height };
      case "right":
        return { x: ref.x + ref.width + gap, y: refCy - size.height / 2 };
      case "left":
        return { x: ref.x - gap - size.width, y: refCy - size.height / 2 };
      case "below-right":
        return { x: ref.x + ref.width + gap, y: ref.y + ref.height + gap };
      case "below-left":
        return { x: ref.x - gap - size.width, y: ref.y + ref.height + gap };
      case "above-right":
        return { x: ref.x + ref.width + gap, y: ref.y - gap - size.height };
      case "above-left":
        return { x: ref.x - gap - size.width, y: ref.y - gap - size.height };
      default:
        return { x: refCx - size.width / 2, y: ref.y + ref.height + gap };
    }
  }

  // ── Style building ───────────────────────────────────────

  private buildShapeStyle(type: ShapeType, theme?: ThemeName): StyleSet {
    const style = createDefaultStyle();
    const typeDef = NODE_TYPES[type];

    if (typeDef && typeDef.baseStyle.includes("rounded=1")) {
      style.rounded = true;
    }

    // Apply theme colors
    const themeName = theme ?? "blue";
    if (isThemeName(themeName)) {
      const colors = THEMES[themeName];
      style.fillColor = colors.fill;
      style.strokeColor = colors.stroke;
      if (colors.fontColor) style.fontColor = colors.fontColor;
    }

    return style;
  }

  // ── Group bounds ─────────────────────────────────────────

  private recomputeGroupBounds(group: Group, page: Page): void {
    const padding = 20;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const id of group.memberIds) {
      const shape = page.shapes.get(id);
      if (!shape) continue;
      minX = Math.min(minX, shape.bounds.x);
      minY = Math.min(minY, shape.bounds.y);
      maxX = Math.max(maxX, shape.bounds.x + shape.bounds.width);
      maxY = Math.max(maxY, shape.bounds.y + shape.bounds.height);
    }

    if (minX !== Infinity) {
      group.bounds = {
        x: minX - padding,
        y: minY - padding,
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2,
      };
    }
  }

  // ── Event handling ───────────────────────────────────────

  private emit(event: DiagramEvent): void {
    appendEvent(this.eventLog, event);
    this.diagram.metadata.modified = new Date().toISOString();
  }

  private reverseEvent(event: DiagramEvent): void {
    const page = this.getActivePage();
    switch (event.type) {
      case "shape_created":
        page.shapes.delete(event.shape.id);
        break;
      case "shape_deleted":
        page.shapes.set(event.shape.id, { ...event.shape });
        break;
      case "shape_modified": {
        const shape = page.shapes.get(event.id);
        if (shape) Object.assign(shape, event.before);
        break;
      }
      case "edge_created":
        page.edges.delete(event.edge.id);
        break;
      case "edge_deleted":
        page.edges.set(event.edge.id, { ...event.edge });
        break;
      case "edge_modified": {
        const edge = page.edges.get(event.id);
        if (edge) Object.assign(edge, event.before);
        break;
      }
      case "group_created":
        page.groups.delete(event.group.id);
        for (const id of event.group.memberIds) {
          const shape = page.shapes.get(id);
          if (shape) shape.parentGroup = null;
        }
        break;
      case "group_dissolved":
        page.groups.set(event.group.id, {
          ...event.group,
          memberIds: new Set(event.group.memberIds),
        });
        for (const id of event.group.memberIds) {
          const shape = page.shapes.get(id);
          if (shape) shape.parentGroup = event.group.id;
        }
        break;
      case "page_added": {
        const idx = this.diagram.pages.findIndex((p) => p.id === event.page.id);
        if (idx !== -1) this.diagram.pages.splice(idx, 1);
        break;
      }
      case "page_removed":
        this.diagram.pages.push(event.page);
        break;
      case "checkpoint":
        // No-op for undo
        break;
    }
  }

  private replayEvent(event: DiagramEvent): void {
    const page = this.getActivePage();
    switch (event.type) {
      case "shape_created":
        page.shapes.set(event.shape.id, { ...event.shape });
        break;
      case "shape_deleted":
        page.shapes.delete(event.shape.id);
        break;
      case "shape_modified": {
        const shape = page.shapes.get(event.id);
        if (shape) Object.assign(shape, event.after);
        break;
      }
      case "edge_created":
        page.edges.set(event.edge.id, { ...event.edge });
        break;
      case "edge_deleted":
        page.edges.delete(event.edge.id);
        break;
      case "edge_modified": {
        const edge = page.edges.get(event.id);
        if (edge) Object.assign(edge, event.after);
        break;
      }
      case "group_created":
        page.groups.set(event.group.id, {
          ...event.group,
          memberIds: new Set(event.group.memberIds),
        });
        for (const id of event.group.memberIds) {
          const shape = page.shapes.get(id);
          if (shape) shape.parentGroup = event.group.id;
        }
        break;
      case "group_dissolved":
        page.groups.delete(event.group.id);
        for (const id of event.group.memberIds) {
          const shape = page.shapes.get(id);
          if (shape) shape.parentGroup = null;
        }
        break;
      case "page_added":
        this.diagram.pages.push(event.page);
        break;
      case "page_removed": {
        const idx = this.diagram.pages.findIndex((p) => p.id === event.page.id);
        if (idx !== -1) this.diagram.pages.splice(idx, 1);
        break;
      }
      case "checkpoint":
        break;
    }
  }

  // ── Registry rebuild ─────────────────────────────────────

  rebuildRegistry(): void {
    this.registry.rebuild(this.getActivePage());
  }
}
