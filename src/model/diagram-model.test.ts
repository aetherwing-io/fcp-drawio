import { describe, it, expect, beforeEach } from "vitest";
import { DiagramModel } from "./diagram-model.js";
import { resetIdCounters } from "./id.js";

let model: DiagramModel;

beforeEach(() => {
  resetIdCounters();
  model = new DiagramModel();
  model.createNew("Test Diagram");
});

describe("DiagramModel — lifecycle", () => {
  it("creates a new diagram with one page", () => {
    expect(model.diagram.title).toBe("Test Diagram");
    expect(model.diagram.pages).toHaveLength(1);
    expect(model.getActivePage().name).toBe("Page-1");
  });

  it("adds a page", () => {
    const page = model.addPage("Page-2");
    expect(model.diagram.pages).toHaveLength(2);
    expect(page.name).toBe("Page-2");
    expect(model.diagram.activePage).toBe(page.id);
  });

  it("switches pages", () => {
    model.addPage("Page-2");
    const result = model.switchPage("Page-1");
    expect(result).not.toBeNull();
    expect(model.getActivePage().name).toBe("Page-1");
  });

  it("removes a page", () => {
    model.addPage("Page-2");
    expect(model.removePage("Page-2")).toBe(true);
    expect(model.diagram.pages).toHaveLength(1);
  });

  it("refuses to remove last page", () => {
    expect(model.removePage("Page-1")).toBe(false);
  });
});

describe("DiagramModel — shapes", () => {
  it("adds a shape with defaults", () => {
    const shape = model.addShape("AuthService", "svc");
    expect(shape.label).toBe("AuthService");
    expect(shape.type).toBe("svc");
    expect(shape.bounds.x).toBe(200);
    expect(shape.bounds.y).toBe(200);
    expect(shape.style.fillColor).toBe("#dae8fc"); // blue theme default
  });

  it("positions second shape below first", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    expect(s2.bounds.y).toBeGreaterThan(s1.bounds.y);
  });

  it("positions with near and dir", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc", { near: s1.id, dir: "right" });
    expect(s2.bounds.x).toBeGreaterThan(s1.bounds.x + s1.bounds.width);
  });

  it("applies theme colors", () => {
    const shape = model.addShape("DB", "db", { theme: "green" });
    expect(shape.style.fillColor).toBe("#d5e8d4");
    expect(shape.style.strokeColor).toBe("#82b366");
  });

  it("modifies a shape", () => {
    const shape = model.addShape("A", "svc");
    const modified = model.modifyShape(shape.id, { label: "B" });
    expect(modified?.label).toBe("B");
  });

  it("removes a shape and its edges", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    model.addEdge(s1.id, s2.id);
    expect(model.getActivePage().edges.size).toBe(1);

    model.removeShape(s1.id);
    expect(model.getActivePage().shapes.size).toBe(1);
    expect(model.getActivePage().edges.size).toBe(0);
  });

  it("uses absolute positioning with at", () => {
    const shape = model.addShape("A", "svc", { at: { x: 500, y: 500 } });
    expect(shape.bounds.x).toBe(500);
    expect(shape.bounds.y).toBe(500);
  });

  it("applies dark theme with fontColor", () => {
    const shape = model.addShape("Dark", "svc", { theme: "dark" });
    expect(shape.style.fontColor).toBe("#e0e0e0");
  });
});

describe("DiagramModel — edges", () => {
  it("creates an edge between two shapes", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id, { label: "calls" });
    expect(edge).not.toBeNull();
    expect(edge!.label).toBe("calls");
    expect(edge!.sourceId).toBe(s1.id);
    expect(edge!.targetId).toBe(s2.id);
  });

  it("refuses edge to non-existent shape", () => {
    const s1 = model.addShape("A", "svc");
    expect(model.addEdge(s1.id, "nonexistent")).toBeNull();
  });

  it("removes an edge", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id)!;
    expect(model.removeEdge(edge.id)).not.toBeNull();
    expect(model.getActivePage().edges.size).toBe(0);
  });

  it("finds edge by source and target", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    model.addEdge(s1.id, s2.id);
    const found = model.findEdge(s1.id, s2.id);
    expect(found).toBeDefined();
  });

  it("applies edge style overrides", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id, {
      style: { dashed: true },
      sourceArrow: "none",
      targetArrow: "crow-foot",
    })!;
    expect(edge.style.dashed).toBe(true);
    expect(edge.targetArrow).toBe("crow-foot");
  });
});

describe("DiagramModel — groups", () => {
  it("creates a group", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const group = model.createGroup("Backend", [s1.id, s2.id]);
    expect(group).not.toBeNull();
    expect(group!.name).toBe("Backend");
    expect(group!.memberIds.size).toBe(2);
    expect(s1.parentGroup).toBe(group!.id);
  });

  it("dissolves a group", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const group = model.createGroup("Backend", [s1.id, s2.id])!;
    model.dissolveGroup(group.id);
    expect(model.getActivePage().groups.size).toBe(0);
    expect(s1.parentGroup).toBeNull();
  });

  it("computes group bounding box", () => {
    const s1 = model.addShape("A", "svc", { at: { x: 100, y: 100 } });
    const s2 = model.addShape("B", "svc", { at: { x: 300, y: 300 } });
    const group = model.createGroup("Test", [s1.id, s2.id])!;
    expect(group.bounds.x).toBeLessThan(100);
    expect(group.bounds.y).toBeLessThan(100);
    expect(group.bounds.width).toBeGreaterThan(200);
  });

  it("refuses group with non-existent member", () => {
    const s1 = model.addShape("A", "svc");
    expect(model.createGroup("Bad", [s1.id, "nonexistent"])).toBeNull();
  });

  it("finds group by name", () => {
    const s1 = model.addShape("A", "svc");
    model.createGroup("Backend", [s1.id]);
    expect(model.getGroupByName("Backend")).toBeDefined();
    expect(model.getGroupByName("Frontend")).toBeUndefined();
  });
});

describe("DiagramModel — custom types", () => {
  it("defines a custom type", () => {
    const ct = model.defineCustomType("payment-svc", "svc", { theme: "purple", badge: "PCI" });
    expect(ct.name).toBe("payment-svc");
    expect(ct.base).toBe("svc");
    expect(model.diagram.customTypes.has("payment-svc")).toBe(true);
  });
});

describe("DiagramModel — undo/redo", () => {
  it("undoes shape creation", () => {
    model.addShape("A", "svc");
    expect(model.getActivePage().shapes.size).toBe(1);
    model.undo();
    expect(model.getActivePage().shapes.size).toBe(0);
  });

  it("redoes undone shape creation", () => {
    model.addShape("A", "svc");
    model.undo();
    model.redo();
    expect(model.getActivePage().shapes.size).toBe(1);
  });

  it("undoes to named checkpoint", () => {
    model.addShape("A", "svc");
    model.addShape("B", "svc");
    model.checkpoint("v1");
    model.addShape("C", "svc");
    model.addShape("D", "svc");
    expect(model.getActivePage().shapes.size).toBe(4);

    model.undoTo("v1");
    expect(model.getActivePage().shapes.size).toBe(2);
  });

  it("undoes shape modification", () => {
    const shape = model.addShape("A", "svc");
    model.modifyShape(shape.id, { label: "B" });
    expect(model.getActivePage().shapes.get(shape.id)!.label).toBe("B");

    model.undo();
    expect(model.getActivePage().shapes.get(shape.id)!.label).toBe("A");
  });

  it("undoes edge creation", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    model.addEdge(s1.id, s2.id);
    expect(model.getActivePage().edges.size).toBe(1);

    model.undo();
    expect(model.getActivePage().edges.size).toBe(0);
  });

  it("undoes group creation", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    model.createGroup("Test", [s1.id, s2.id]);
    expect(model.getActivePage().groups.size).toBe(1);

    model.undo();
    expect(model.getActivePage().groups.size).toBe(0);
    expect(s1.parentGroup).toBeNull();
  });

  it("reports canUndo/canRedo", () => {
    expect(model.canUndo()).toBe(false);
    model.addShape("A", "svc");
    expect(model.canUndo()).toBe(true);
    expect(model.canRedo()).toBe(false);
    model.undo();
    expect(model.canRedo()).toBe(true);
  });
});

describe("DiagramModel — registry queries", () => {
  it("finds shape by exact label", () => {
    model.addShape("AuthService", "svc");
    const results = model.registry.getByExactLabel("AuthService");
    expect(results).toHaveLength(1);
  });

  it("finds shape by case-insensitive label", () => {
    model.addShape("AuthService", "svc");
    const results = model.registry.getByCaseInsensitiveLabel("authservice");
    expect(results).toHaveLength(1);
  });

  it("finds shape by normalized label", () => {
    model.addShape("Auth-Service", "svc");
    const results = model.registry.getByNormalizedLabel("auth_service");
    expect(results).toHaveLength(1);
  });

  it("finds shape by prefix", () => {
    model.addShape("AuthService", "svc");
    model.addShape("AuthDB", "db");
    const results = model.registry.getByPrefixLabel("Auth");
    expect(results).toHaveLength(2);
  });

  it("finds shapes by type", () => {
    model.addShape("A", "svc");
    model.addShape("B", "db");
    model.addShape("C", "svc");
    expect(model.registry.getByType("svc")).toHaveLength(2);
    expect(model.registry.getByType("db")).toHaveLength(1);
  });

  it("gets most recent shapes", () => {
    model.addShape("First", "svc");
    model.addShape("Second", "svc");
    model.addShape("Third", "svc");
    const recent = model.registry.getMostRecent(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].label).toBe("Third");
  });

  it("finds orphan shapes", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const s3 = model.addShape("C", "svc");
    model.addEdge(s1.id, s2.id);
    const orphans = model.registry.getOrphans(model.getActivePage());
    expect(orphans).toHaveLength(1);
    expect(orphans[0].label).toBe("C");
  });

  it("gets connected shapes", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const s3 = model.addShape("C", "svc");
    model.addEdge(s1.id, s2.id);
    model.addEdge(s1.id, s3.id);
    const connected = model.registry.getConnectedShapes(s1.id, model.getActivePage());
    expect(connected).toHaveLength(2);
  });

  it("gets edges for shape (incoming and outgoing)", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const s3 = model.addShape("C", "svc");
    model.addEdge(s1.id, s2.id);
    model.addEdge(s3.id, s2.id);
    const { incoming, outgoing } = model.registry.getEdgesForShape(s2.id, model.getActivePage());
    expect(incoming).toHaveLength(2);
    expect(outgoing).toHaveLength(0);
  });
});

describe("DiagramModel — event history", () => {
  it("returns recent events", () => {
    model.addShape("A", "svc");
    model.addShape("B", "svc");
    model.addShape("C", "svc");
    const history = model.getHistory(2);
    expect(history).toHaveLength(2);
    expect(history[0].type).toBe("shape_created");
    expect(history[1].type).toBe("shape_created");
  });
});

describe("DiagramModel — layer event sourcing", () => {
  it("addLayer emits layer_created event", () => {
    const layer = model.addLayer("Background");
    expect(layer.name).toBe("Background");
    const page = model.getActivePage();
    expect(page.layers).toHaveLength(2);
    const history = model.getHistory(1);
    expect(history[0].type).toBe("layer_created");
  });

  it("undo reverses addLayer", () => {
    model.addLayer("Background");
    expect(model.getActivePage().layers).toHaveLength(2);
    model.undo();
    expect(model.getActivePage().layers).toHaveLength(1);
  });

  it("redo restores addLayer", () => {
    model.addLayer("Background");
    model.undo();
    model.redo();
    expect(model.getActivePage().layers).toHaveLength(2);
    expect(model.getActivePage().layers[1].name).toBe("Background");
  });

  it("modifyLayer emits layer_modified event", () => {
    const layer = model.addLayer("Background");
    model.modifyLayer(layer.id, { visible: false });
    const page = model.getActivePage();
    const bg = page.layers.find(l => l.name === "Background")!;
    expect(bg.visible).toBe(false);
  });

  it("undo reverses modifyLayer", () => {
    const layer = model.addLayer("Background");
    model.modifyLayer(layer.id, { visible: false });
    model.undo();
    const page = model.getActivePage();
    const bg = page.layers.find(l => l.name === "Background")!;
    expect(bg.visible).toBe(true);
  });
});

describe("DiagramModel — flow direction event sourcing", () => {
  it("setFlowDirection emits event", () => {
    model.setFlowDirection("LR");
    expect(model.getActivePage().flowDirection).toBe("LR");
    const history = model.getHistory(1);
    expect(history[0].type).toBe("flow_direction_changed");
  });

  it("undo reverses setFlowDirection", () => {
    model.setFlowDirection("LR");
    model.undo();
    expect(model.getActivePage().flowDirection).toBeUndefined();
  });

  it("redo restores setFlowDirection", () => {
    model.setFlowDirection("LR");
    model.undo();
    model.redo();
    expect(model.getActivePage().flowDirection).toBe("LR");
  });
});

describe("DiagramModel — title event sourcing", () => {
  it("setTitle emits event", () => {
    model.setTitle("New Title");
    expect(model.diagram.title).toBe("New Title");
    const history = model.getHistory(1);
    expect(history[0].type).toBe("title_changed");
  });

  it("undo reverses setTitle", () => {
    model.setTitle("New Title");
    model.undo();
    expect(model.diagram.title).toBe("Test Diagram");
  });

  it("redo restores setTitle", () => {
    model.setTitle("New Title");
    model.undo();
    model.redo();
    expect(model.diagram.title).toBe("New Title");
  });
});
