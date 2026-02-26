import { describe, it, expect, beforeEach } from "vitest";
import { DiagramModel } from "../model/diagram-model.js";
import { resetIdCounters } from "../model/id.js";
import { buildElkGraph, runElkLayout } from "./elk-layout.js";
import type { LayoutOptions } from "./elk-layout.js";

let model: DiagramModel;

beforeEach(() => {
  resetIdCounters();
  model = new DiagramModel();
  model.createNew("Test Diagram");
});

const defaultOpts: LayoutOptions = {
  algorithm: "layered",
  direction: "TB",
};

// ── buildElkGraph ───────────────────────────────────────────

describe("buildElkGraph — structure", () => {
  it("3-node chain → ELK graph structure correct", () => {
    const s1 = model.addShape("A", "svc", { at: { x: 0, y: 0 } });
    const s2 = model.addShape("B", "svc", { at: { x: 0, y: 100 } });
    const s3 = model.addShape("C", "svc", { at: { x: 0, y: 200 } });
    model.addEdge(s1.id, s2.id);
    model.addEdge(s2.id, s3.id);

    const page = model.getActivePage();
    const graph = buildElkGraph(page, defaultOpts);

    expect(graph.id).toBe("root");
    expect(graph.children).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);

    // Children have correct dimensions
    const nodeA = graph.children.find((c) => c.id === s1.id);
    expect(nodeA).toBeDefined();
    expect(nodeA!.width).toBe(s1.bounds.width);
    expect(nodeA!.height).toBe(s1.bounds.height);

    // Edges reference correct sources/targets
    const edge1 = graph.edges[0];
    expect(edge1.sources).toEqual([s1.id]);
    expect(edge1.targets).toEqual([s2.id]);
  });

  it("group → hierarchical ELK node with children", () => {
    const s1 = model.addShape("A", "svc", { at: { x: 100, y: 100 } });
    const s2 = model.addShape("B", "svc", { at: { x: 300, y: 100 } });
    const group = model.createGroup("Backend", [s1.id, s2.id])!;

    const page = model.getActivePage();
    const graph = buildElkGraph(page, defaultOpts);

    // Top-level should have one node (the group)
    expect(graph.children).toHaveLength(1);

    const elkGroup = graph.children[0];
    expect(elkGroup.id).toBe(group.id);
    expect(elkGroup.children).toHaveLength(2);
    expect(elkGroup.children![0].id).toBe(s1.id);
    expect(elkGroup.children![1].id).toBe(s2.id);
  });

  it("uses correct algorithm ID for layered", () => {
    model.addShape("A", "svc");
    const page = model.getActivePage();
    const graph = buildElkGraph(page, { algorithm: "layered", direction: "LR" });

    expect(graph.layoutOptions["elk.algorithm"]).toBe("org.eclipse.elk.layered");
    expect(graph.layoutOptions["elk.direction"]).toBe("RIGHT");
  });

  it("uses correct algorithm ID for force", () => {
    model.addShape("A", "svc");
    const page = model.getActivePage();
    const graph = buildElkGraph(page, { algorithm: "force", direction: "TB" });

    expect(graph.layoutOptions["elk.algorithm"]).toBe("org.eclipse.elk.force");
  });

  it("uses correct algorithm ID for tree", () => {
    model.addShape("A", "svc");
    const page = model.getActivePage();
    const graph = buildElkGraph(page, { algorithm: "tree", direction: "TB" });

    expect(graph.layoutOptions["elk.algorithm"]).toBe("org.eclipse.elk.mrtree");
  });

  it("uses custom spacing", () => {
    model.addShape("A", "svc");
    const page = model.getActivePage();
    const graph = buildElkGraph(page, { algorithm: "layered", direction: "TB", spacing: 120 });

    expect(graph.layoutOptions["elk.spacing.nodeNode"]).toBe("120");
  });
});

// ── runElkLayout ────────────────────────────────────────────

describe("runElkLayout — integration", () => {
  it("5 shapes + 4 edges → all shapes get distinct non-overlapping positions", async () => {
    const s1 = model.addShape("A", "svc", { at: { x: 0, y: 0 } });
    const s2 = model.addShape("B", "svc", { at: { x: 0, y: 0 } });
    const s3 = model.addShape("C", "svc", { at: { x: 0, y: 0 } });
    const s4 = model.addShape("D", "svc", { at: { x: 0, y: 0 } });
    const s5 = model.addShape("E", "svc", { at: { x: 0, y: 0 } });
    model.addEdge(s1.id, s2.id);
    model.addEdge(s1.id, s3.id);
    model.addEdge(s2.id, s4.id);
    model.addEdge(s3.id, s5.id);

    const page = model.getActivePage();
    const result = await runElkLayout(page, defaultOpts);

    // All 5 shapes should have positions
    expect(result.shapePositions.size).toBe(5);

    // All positions should be distinct (no two shapes at exact same spot)
    const posStrs = new Set<string>();
    for (const [, pos] of result.shapePositions) {
      posStrs.add(`${pos.x},${pos.y}`);
    }
    expect(posStrs.size).toBe(5);
  });

  it("ELK output → shape positions extracted", async () => {
    const s1 = model.addShape("A", "svc", { at: { x: 0, y: 0 } });
    const s2 = model.addShape("B", "svc", { at: { x: 0, y: 0 } });
    model.addEdge(s1.id, s2.id);

    const page = model.getActivePage();
    const result = await runElkLayout(page, defaultOpts);

    const posA = result.shapePositions.get(s1.id);
    const posB = result.shapePositions.get(s2.id);

    expect(posA).toBeDefined();
    expect(posB).toBeDefined();
    // In TB layered layout, B should be below A
    expect(posB!.y).toBeGreaterThan(posA!.y);
  });

  it("LR direction → shapes arranged left to right", async () => {
    const s1 = model.addShape("A", "svc", { at: { x: 0, y: 0 } });
    const s2 = model.addShape("B", "svc", { at: { x: 0, y: 0 } });
    model.addEdge(s1.id, s2.id);

    const page = model.getActivePage();
    const result = await runElkLayout(page, { algorithm: "layered", direction: "LR" });

    const posA = result.shapePositions.get(s1.id);
    const posB = result.shapePositions.get(s2.id);

    expect(posA).toBeDefined();
    expect(posB).toBeDefined();
    // In LR layout, B should be to the right of A
    expect(posB!.x).toBeGreaterThan(posA!.x);
  });

  it("grouped shapes → positions are absolute (not relative)", async () => {
    const s1 = model.addShape("A", "svc", { at: { x: 100, y: 100 } });
    const s2 = model.addShape("B", "svc", { at: { x: 300, y: 100 } });
    model.createGroup("MyGroup", [s1.id, s2.id]);
    model.addEdge(s1.id, s2.id);

    const page = model.getActivePage();
    const result = await runElkLayout(page, defaultOpts);

    // Both shapes should have positions
    expect(result.shapePositions.has(s1.id)).toBe(true);
    expect(result.shapePositions.has(s2.id)).toBe(true);

    // Positions should be reasonable (not tiny relative coords)
    const posA = result.shapePositions.get(s1.id)!;
    const posB = result.shapePositions.get(s2.id)!;
    expect(posA.x).toBeGreaterThanOrEqual(0);
    expect(posA.y).toBeGreaterThanOrEqual(0);
    expect(posB.x).toBeGreaterThanOrEqual(0);
    expect(posB.y).toBeGreaterThanOrEqual(0);
  });
});
