import type { Shape, ShapeType, Edge, Page } from "../types/index.js";

/**
 * Multi-index registry for fast shape lookups by label, type, group, and recency.
 * Rebuilt from the page state on each mutation (Phase 1 simplicity; incremental in Phase 2).
 */
export class ReferenceRegistry {
  private byId = new Map<string, Shape>();
  private byLabel = new Map<string, Shape[]>();
  private byLabelNormalized = new Map<string, Shape[]>();
  private byType = new Map<string, Shape[]>();
  private byGroup = new Map<string, Shape[]>();
  private byLayer = new Map<string, Shape[]>();
  private recentOrder: Shape[] = [];
  private edgesById = new Map<string, Edge>();

  rebuild(page: Page): void {
    this.byId.clear();
    this.byLabel.clear();
    this.byLabelNormalized.clear();
    this.byType.clear();
    this.byGroup.clear();
    this.byLayer.clear();
    this.recentOrder = [];
    this.edgesById.clear();

    const shapes = [...page.shapes.values()].sort(
      (a, b) => a.createdAt - b.createdAt,
    );

    for (const shape of shapes) {
      this.byId.set(shape.id, shape);

      // by exact label
      const labelList = this.byLabel.get(shape.label) ?? [];
      labelList.push(shape);
      this.byLabel.set(shape.label, labelList);

      // by normalized label (lowercase, strip hyphens/underscores/spaces)
      const normalized = normalizeLabel(shape.label);
      const normList = this.byLabelNormalized.get(normalized) ?? [];
      normList.push(shape);
      this.byLabelNormalized.set(normalized, normList);

      // by type
      const typeList = this.byType.get(shape.type) ?? [];
      typeList.push(shape);
      this.byType.set(shape.type, typeList);

      // by group
      if (shape.parentGroup) {
        const groupList = this.byGroup.get(shape.parentGroup) ?? [];
        groupList.push(shape);
        this.byGroup.set(shape.parentGroup, groupList);
      }

      // by layer
      const layerList = this.byLayer.get(shape.layer) ?? [];
      layerList.push(shape);
      this.byLayer.set(shape.layer, layerList);
    }

    // Recent order: sorted by modifiedAt descending
    this.recentOrder = [...shapes].sort((a, b) => b.modifiedAt - a.modifiedAt);

    // Edges
    for (const edge of page.edges.values()) {
      this.edgesById.set(edge.id, edge);
    }
  }

  getById(id: string): Shape | undefined {
    return this.byId.get(id);
  }

  getByExactLabel(label: string): Shape[] {
    return this.byLabel.get(label) ?? [];
  }

  getByCaseInsensitiveLabel(label: string): Shape[] {
    const lower = label.toLowerCase();
    const results: Shape[] = [];
    for (const [key, shapes] of this.byLabel) {
      if (key.toLowerCase() === lower) {
        results.push(...shapes);
      }
    }
    return results;
  }

  getByNormalizedLabel(label: string): Shape[] {
    return this.byLabelNormalized.get(normalizeLabel(label)) ?? [];
  }

  getByPrefixLabel(prefix: string): Shape[] {
    const lower = prefix.toLowerCase();
    const results: Shape[] = [];
    for (const [key, shapes] of this.byLabel) {
      if (key.toLowerCase().startsWith(lower)) {
        results.push(...shapes);
      }
    }
    return results;
  }

  getByType(type: string): Shape[] {
    return this.byType.get(type) ?? [];
  }

  getByGroup(groupName: string): Shape[] {
    // Look up by group name → find group ID → get shapes
    return this.byGroup.get(groupName) ?? [];
  }

  getByGroupId(groupId: string): Shape[] {
    return this.byGroup.get(groupId) ?? [];
  }

  getMostRecent(count: number = 1): Shape[] {
    return this.recentOrder.slice(0, count);
  }

  getAllShapes(): Shape[] {
    return [...this.byId.values()];
  }

  getOrphans(page: Page): Shape[] {
    // Shapes with no incoming or outgoing edges
    const connected = new Set<string>();
    for (const edge of page.edges.values()) {
      connected.add(edge.sourceId);
      connected.add(edge.targetId);
    }
    return this.getAllShapes().filter((s) => !connected.has(s.id));
  }

  getEdgeById(id: string): Edge | undefined {
    return this.edgesById.get(id);
  }

  getConnectedShapes(shapeId: string, page: Page): Shape[] {
    const connected = new Set<string>();
    for (const edge of page.edges.values()) {
      if (edge.sourceId === shapeId) connected.add(edge.targetId);
      if (edge.targetId === shapeId) connected.add(edge.sourceId);
    }
    return [...connected].map((id) => this.byId.get(id)).filter(Boolean) as Shape[];
  }

  getEdgesForShape(shapeId: string, page: Page): { incoming: Edge[]; outgoing: Edge[] } {
    const incoming: Edge[] = [];
    const outgoing: Edge[] = [];
    for (const edge of page.edges.values()) {
      if (edge.sourceId === shapeId) outgoing.push(edge);
      if (edge.targetId === shapeId) incoming.push(edge);
    }
    return { incoming, outgoing };
  }
}

/**
 * Normalize a label for fuzzy matching:
 * lowercase, strip hyphens, underscores, spaces.
 */
function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[-_\s]/g, "");
}
