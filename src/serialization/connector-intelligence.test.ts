import { describe, it, expect, beforeEach } from "vitest";
import { DiagramModel } from "../model/diagram-model.js";
import { resetIdCounters } from "../model/id.js";
import {
  computeEdgeRenderInfo,
  computeAllEdgeRenderInfo,
  computeSmartPorts,
  angleFace,
} from "./connector-intelligence.js";
import { serializeDiagram } from "./serialize.js";
import { deserializeDiagram } from "./deserialize.js";

let model: DiagramModel;

beforeEach(() => {
  resetIdCounters();
  model = new DiagramModel();
  model.createNew("Test Diagram");
});

// ── angleFace ───────────────────────────────────────────────

describe("angleFace — angle to face mapping", () => {
  it("0 degrees → right", () => {
    expect(angleFace(0)).toBe("right");
  });

  it("90 degrees → bottom", () => {
    expect(angleFace(90)).toBe("bottom");
  });

  it("-90 degrees → top", () => {
    expect(angleFace(-90)).toBe("top");
  });

  it("180 degrees → left", () => {
    expect(angleFace(180)).toBe("left");
  });

  it("-180 degrees → left", () => {
    expect(angleFace(-180)).toBe("left");
  });

  it("44 degrees → right (boundary)", () => {
    expect(angleFace(44)).toBe("right");
  });

  it("45 degrees → bottom (boundary)", () => {
    expect(angleFace(45)).toBe("bottom");
  });

  it("-45 degrees → right (boundary)", () => {
    expect(angleFace(-45)).toBe("right");
  });

  it("-46 degrees → top", () => {
    expect(angleFace(-46)).toBe("top");
  });

  it("135 degrees → left (boundary)", () => {
    expect(angleFace(135)).toBe("left");
  });
});

// ── computeSmartPorts ───────────────────────────────────────

describe("computeSmartPorts — directional port assignment", () => {
  it("target directly right → exitX=1.0, entryX=0.0", () => {
    const source = model.addShape("A", "svc", { at: { x: 100, y: 200 } });
    const target = model.addShape("B", "svc", { at: { x: 400, y: 200 } });

    const ports = computeSmartPorts(source, target);
    expect(ports.exitX).toBe(1.0);
    expect(ports.entryX).toBe(0.0);
    // Y should be near 0.5 (centered)
    expect(ports.exitY).toBeCloseTo(0.5, 1);
    expect(ports.entryY).toBeCloseTo(0.5, 1);
  });

  it("target directly below → exitY=1.0, entryY=0.0", () => {
    const source = model.addShape("A", "svc", { at: { x: 200, y: 100 } });
    const target = model.addShape("B", "svc", { at: { x: 200, y: 400 } });

    const ports = computeSmartPorts(source, target);
    expect(ports.exitY).toBe(1.0);
    expect(ports.entryY).toBe(0.0);
    // X should be near 0.5
    expect(ports.exitX).toBeCloseTo(0.5, 1);
    expect(ports.entryX).toBeCloseTo(0.5, 1);
  });

  it("target directly left → exitX=0.0, entryX=1.0", () => {
    const source = model.addShape("A", "svc", { at: { x: 400, y: 200 } });
    const target = model.addShape("B", "svc", { at: { x: 100, y: 200 } });

    const ports = computeSmartPorts(source, target);
    expect(ports.exitX).toBe(0.0);
    expect(ports.entryX).toBe(1.0);
  });

  it("target directly above → exitY=0.0, entryY=1.0", () => {
    const source = model.addShape("A", "svc", { at: { x: 200, y: 400 } });
    const target = model.addShape("B", "svc", { at: { x: 200, y: 100 } });

    const ports = computeSmartPorts(source, target);
    expect(ports.exitY).toBe(0.0);
    expect(ports.entryY).toBe(1.0);
  });

  it("45-degree diagonal → exits from appropriate face", () => {
    const source = model.addShape("A", "svc", { at: { x: 100, y: 100 } });
    const target = model.addShape("B", "svc", { at: { x: 400, y: 400 } });

    const ports = computeSmartPorts(source, target);
    // ~45 degrees → bottom face
    expect(ports.exitY).toBe(1.0);
    expect(ports.entryY).toBe(0.0);
  });

  it("port values stay within [0.1, 0.9] on variable axis", () => {
    const source = model.addShape("A", "svc", { at: { x: 100, y: 100 } });
    const target = model.addShape("B", "svc", { at: { x: 500, y: 300 } });

    const ports = computeSmartPorts(source, target);
    // Exit is on the right face (exitX=1.0), exitY should be in bounds
    expect(ports.exitY).toBeGreaterThanOrEqual(0.1);
    expect(ports.exitY).toBeLessThanOrEqual(0.9);
  });
});

// ── Deserialized port preservation ──────────────────────────

describe("computeEdgeRenderInfo — deserialized port preservation", () => {
  it("preserves existing exitX/exitY from edge style", () => {
    const s1 = model.addShape("A", "svc", { at: { x: 100, y: 100 } });
    const s2 = model.addShape("B", "svc", { at: { x: 300, y: 300 } });
    const edge = model.addEdge(s1.id, s2.id)!;

    // Simulate deserialized ports by setting them in the extensible style bucket
    (edge.style as Record<string, unknown>)["exitX"] = "0.75";
    (edge.style as Record<string, unknown>)["exitY"] = "0.25";
    (edge.style as Record<string, unknown>)["entryX"] = "0.1";
    (edge.style as Record<string, unknown>)["entryY"] = "0.9";

    const page = model.getActivePage();
    const info = computeEdgeRenderInfo(edge, page);

    expect(info.ports).not.toBeNull();
    expect(info.ports!.exitX).toBe(0.75);
    expect(info.ports!.exitY).toBe(0.25);
    expect(info.ports!.entryX).toBe(0.1);
    expect(info.ports!.entryY).toBe(0.9);
  });

  it("does not overwrite deserialized ports with smart computation", () => {
    const s1 = model.addShape("A", "svc", { at: { x: 100, y: 100 } });
    const s2 = model.addShape("B", "svc", { at: { x: 400, y: 100 } });
    const edge = model.addEdge(s1.id, s2.id)!;

    // Set explicit ports that differ from what smart ports would compute
    (edge.style as Record<string, unknown>)["exitX"] = "0.5";
    (edge.style as Record<string, unknown>)["exitY"] = "1.0";

    const page = model.getActivePage();
    const info = computeEdgeRenderInfo(edge, page);

    // Should use the explicit values, not smart-computed ones
    expect(info.ports!.exitX).toBe(0.5);
    expect(info.ports!.exitY).toBe(1.0);
  });
});

// ── computeEdgeRenderInfo — edge cases ──────────────────────

describe("computeEdgeRenderInfo — edge cases", () => {
  it("returns null ports when source shape is missing", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id)!;

    const page = model.getActivePage();
    page.shapes.delete(s1.id);

    const info = computeEdgeRenderInfo(edge, page);
    expect(info.ports).toBeNull();
  });

  it("returns null ports when target shape is missing", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id)!;

    const page = model.getActivePage();
    page.shapes.delete(s2.id);

    const info = computeEdgeRenderInfo(edge, page);
    expect(info.ports).toBeNull();
  });
});

// ── computeAllEdgeRenderInfo ────────────────────────────────

describe("computeAllEdgeRenderInfo", () => {
  it("returns a Map with entries for all edges", () => {
    const s1 = model.addShape("A", "svc", { at: { x: 100, y: 100 } });
    const s2 = model.addShape("B", "svc", { at: { x: 300, y: 100 } });
    const s3 = model.addShape("C", "svc", { at: { x: 100, y: 300 } });
    const e1 = model.addEdge(s1.id, s2.id, { label: "one" })!;
    const e2 = model.addEdge(s1.id, s3.id, { label: "two" })!;

    const page = model.getActivePage();
    const infos = computeAllEdgeRenderInfo(page);

    expect(infos.size).toBe(2);
    expect(infos.has(e1.id)).toBe(true);
    expect(infos.has(e2.id)).toBe(true);
  });

  it("returns empty Map for page with no edges", () => {
    model.addShape("A", "svc");
    const page = model.getActivePage();
    const infos = computeAllEdgeRenderInfo(page);
    expect(infos.size).toBe(0);
  });
});

// ── Fan-out spreading ───────────────────────────────────────

describe("computeAllEdgeRenderInfo — fan-out spreading", () => {
  it("3 edges from same source going down → exitX spread to 0.25, 0.50, 0.75", () => {
    // Source at top center, 3 targets below spread left to right
    const src = model.addShape("Hub", "svc", { at: { x: 200, y: 50 } });
    const t1 = model.addShape("Left", "svc", { at: { x: 50, y: 300 } });
    const t2 = model.addShape("Center", "svc", { at: { x: 200, y: 300 } });
    const t3 = model.addShape("Right", "svc", { at: { x: 350, y: 300 } });

    const e1 = model.addEdge(src.id, t1.id)!;
    const e2 = model.addEdge(src.id, t2.id)!;
    const e3 = model.addEdge(src.id, t3.id)!;

    const page = model.getActivePage();
    const infos = computeAllEdgeRenderInfo(page);

    // All 3 edges exit from the bottom face, should be spread
    const i1 = infos.get(e1.id)!;
    const i2 = infos.get(e2.id)!;
    const i3 = infos.get(e3.id)!;

    // All exit from bottom (exitY=1.0)
    expect(i1.ports!.exitY).toBe(1.0);
    expect(i2.ports!.exitY).toBe(1.0);
    expect(i3.ports!.exitY).toBe(1.0);

    // exitX should be spread: sorted by target X position
    // t1 (x=50) < t2 (x=200) < t3 (x=350)
    // Spread: 0.25, 0.50, 0.75
    expect(i1.ports!.exitX).toBeCloseTo(0.25, 2);
    expect(i2.ports!.exitX).toBeCloseTo(0.50, 2);
    expect(i3.ports!.exitX).toBeCloseTo(0.75, 2);
  });

  it("3 edges entering same target from above → entryX spread", () => {
    // 3 sources above, 1 target below
    const s1 = model.addShape("S1", "svc", { at: { x: 50, y: 50 } });
    const s2 = model.addShape("S2", "svc", { at: { x: 200, y: 50 } });
    const s3 = model.addShape("S3", "svc", { at: { x: 350, y: 50 } });
    const tgt = model.addShape("Target", "svc", { at: { x: 200, y: 300 } });

    const e1 = model.addEdge(s1.id, tgt.id)!;
    const e2 = model.addEdge(s2.id, tgt.id)!;
    const e3 = model.addEdge(s3.id, tgt.id)!;

    const page = model.getActivePage();
    const infos = computeAllEdgeRenderInfo(page);

    // All enter from top (entryY=0.0)
    const i1 = infos.get(e1.id)!;
    const i2 = infos.get(e2.id)!;
    const i3 = infos.get(e3.id)!;

    expect(i1.ports!.entryY).toBe(0.0);
    expect(i2.ports!.entryY).toBe(0.0);
    expect(i3.ports!.entryY).toBe(0.0);

    // entryX should be spread, sorted by source X
    expect(i1.ports!.entryX).toBeCloseTo(0.25, 2);
    expect(i2.ports!.entryX).toBeCloseTo(0.50, 2);
    expect(i3.ports!.entryX).toBeCloseTo(0.75, 2);
  });

  it("single outgoing edge → centered at 0.5 (no spreading needed)", () => {
    const src = model.addShape("Hub", "svc", { at: { x: 200, y: 50 } });
    const tgt = model.addShape("Target", "svc", { at: { x: 200, y: 300 } });

    const e = model.addEdge(src.id, tgt.id)!;

    const page = model.getActivePage();
    const infos = computeAllEdgeRenderInfo(page);

    const info = infos.get(e.id)!;
    expect(info.ports!.exitX).toBeCloseTo(0.5, 1);
  });

  it("bidirectional pair → each direction on different face, no stacking", () => {
    // A to the left, B to the right
    const a = model.addShape("A", "svc", { at: { x: 100, y: 200 } });
    const b = model.addShape("B", "svc", { at: { x: 400, y: 200 } });

    const ab = model.addEdge(a.id, b.id)!;
    const ba = model.addEdge(b.id, a.id)!;

    const page = model.getActivePage();
    const infos = computeAllEdgeRenderInfo(page);

    const abInfo = infos.get(ab.id)!;
    const baInfo = infos.get(ba.id)!;

    // A→B exits right, B→A exits left — different faces, naturally separated
    expect(abInfo.ports!.exitX).toBe(1.0);
    expect(baInfo.ports!.exitX).toBe(0.0);
  });
});

// ── Cross-group routing hints ───────────────────────────────

describe("computeAllEdgeRenderInfo — cross-group routing", () => {
  it("shape in group → shape outside group: exit faces group boundary", () => {
    // Shape inside a group on the left, external shape far to the right
    const s1 = model.addShape("Internal", "svc", { at: { x: 100, y: 200 } });
    const s2 = model.addShape("External", "svc", { at: { x: 600, y: 200 } });

    // Create group containing s1
    model.createGroup("MyGroup", [s1.id]);

    const edge = model.addEdge(s1.id, s2.id)!;

    const page = model.getActivePage();
    const infos = computeAllEdgeRenderInfo(page);
    const info = infos.get(edge.id)!;

    // Internal → External (right direction): exit should be on right face
    expect(info.ports!.exitX).toBe(1.0);
  });

  it("shapes in different groups separated horizontally: edges exit right/left", () => {
    const s1 = model.addShape("LeftShape", "svc", { at: { x: 100, y: 200 } });
    const s2 = model.addShape("RightShape", "svc", { at: { x: 600, y: 200 } });

    model.createGroup("LeftGroup", [s1.id]);
    model.createGroup("RightGroup", [s2.id]);

    const edge = model.addEdge(s1.id, s2.id)!;

    const page = model.getActivePage();
    const infos = computeAllEdgeRenderInfo(page);
    const info = infos.get(edge.id)!;

    // Left→Right: exit right, enter left
    expect(info.ports!.exitX).toBe(1.0);
    expect(info.ports!.entryX).toBe(0.0);
  });

  it("shapes in same group: no cross-group adjustment (standard smart ports)", () => {
    const s1 = model.addShape("A", "svc", { at: { x: 100, y: 200 } });
    const s2 = model.addShape("B", "svc", { at: { x: 400, y: 200 } });

    model.createGroup("SameGroup", [s1.id, s2.id]);

    const edge = model.addEdge(s1.id, s2.id)!;

    const page = model.getActivePage();
    const infos = computeAllEdgeRenderInfo(page);
    const info = infos.get(edge.id)!;

    // Standard smart ports, both in same group
    expect(info.ports!.exitX).toBe(1.0);
    expect(info.ports!.entryX).toBe(0.0);
  });
});

// ── Label x-offset spreading ────────────────────────────────

describe("computeAllEdgeRenderInfo — label offset spreading", () => {
  it("single labeled edge → x=0", () => {
    const s1 = model.addShape("A", "svc", { at: { x: 100, y: 100 } });
    const s2 = model.addShape("B", "svc", { at: { x: 100, y: 300 } });
    model.addEdge(s1.id, s2.id, { label: "only-one" });

    const page = model.getActivePage();
    const infos = computeAllEdgeRenderInfo(page);

    const info = [...infos.values()][0];
    expect(info.labelOffsetX).toBe(0);
  });

  it("2 labeled edges from same source → x at -0.15, +0.15 (approx -0.3, +0.3)", () => {
    const src = model.addShape("Hub", "svc", { at: { x: 200, y: 50 } });
    const t1 = model.addShape("T1", "svc", { at: { x: 100, y: 300 } });
    const t2 = model.addShape("T2", "svc", { at: { x: 300, y: 300 } });

    const e1 = model.addEdge(src.id, t1.id, { label: "alpha" })!;
    const e2 = model.addEdge(src.id, t2.id, { label: "beta" })!;

    const page = model.getActivePage();
    const infos = computeAllEdgeRenderInfo(page);

    const offsets = [infos.get(e1.id)!.labelOffsetX, infos.get(e2.id)!.labelOffsetX].sort((a, b) => a - b);
    expect(offsets[0]).toBeCloseTo(-0.3, 2);
    expect(offsets[1]).toBeCloseTo(0.3, 2);
  });

  it("3 labeled edges from same source → x at -0.3, 0, +0.3", () => {
    const src = model.addShape("Hub", "svc", { at: { x: 200, y: 50 } });
    const t1 = model.addShape("T1", "svc", { at: { x: 50, y: 300 } });
    const t2 = model.addShape("T2", "svc", { at: { x: 200, y: 300 } });
    const t3 = model.addShape("T3", "svc", { at: { x: 350, y: 300 } });

    const e1 = model.addEdge(src.id, t1.id, { label: "one" })!;
    const e2 = model.addEdge(src.id, t2.id, { label: "two" })!;
    const e3 = model.addEdge(src.id, t3.id, { label: "three" })!;

    const page = model.getActivePage();
    const infos = computeAllEdgeRenderInfo(page);

    const offsets = [
      infos.get(e1.id)!.labelOffsetX,
      infos.get(e2.id)!.labelOffsetX,
      infos.get(e3.id)!.labelOffsetX,
    ].sort((a, b) => a - b);

    expect(offsets[0]).toBeCloseTo(-0.3, 2);
    expect(offsets[1]).toBeCloseTo(0, 2);
    expect(offsets[2]).toBeCloseTo(0.3, 2);
  });

  it("unlabeled edges excluded from label grouping", () => {
    const src = model.addShape("Hub", "svc", { at: { x: 200, y: 50 } });
    const t1 = model.addShape("T1", "svc", { at: { x: 100, y: 300 } });
    const t2 = model.addShape("T2", "svc", { at: { x: 300, y: 300 } });

    const e1 = model.addEdge(src.id, t1.id, { label: "labeled" })!;
    model.addEdge(src.id, t2.id)!; // no label

    const page = model.getActivePage();
    const infos = computeAllEdgeRenderInfo(page);

    // Only one labeled edge → no spreading, x=0
    expect(infos.get(e1.id)!.labelOffsetX).toBe(0);
  });
});

// ── Integration: serializer with smart ports ────────────────

describe("serialize — smart port integration", () => {
  it("emits exitX/exitY/entryX/entryY in edge style when smart ports computed", () => {
    const s1 = model.addShape("A", "svc", { at: { x: 100, y: 200 } });
    const s2 = model.addShape("B", "svc", { at: { x: 400, y: 200 } });
    model.addEdge(s1.id, s2.id);

    const xml = serializeDiagram(model.diagram);

    // Target is to the right, so exitX=1.0, entryX=0.0
    expect(xml).toContain("exitX=1");
    expect(xml).toContain("entryX=0");
    expect(xml).toContain("exitDx=0");
    expect(xml).toContain("entryDx=0");
  });

  it("round-trip preserves smart port assignments", () => {
    const s1 = model.addShape("A", "svc", { at: { x: 100, y: 200 } });
    const s2 = model.addShape("B", "svc", { at: { x: 400, y: 200 } });
    const edge = model.addEdge(s1.id, s2.id, { label: "test" })!;

    const xml = serializeDiagram(model.diagram);
    const restored = deserializeDiagram(xml);
    const page = restored.pages[0];

    expect(page.edges.size).toBe(1);
    const restoredEdge = page.edges.get(edge.id)!;
    expect(restoredEdge.label).toBe("test");
    // The edge should still have its source and target IDs
    expect(restoredEdge.sourceId).toBe(s1.id);
    expect(restoredEdge.targetId).toBe(s2.id);
  });
});
