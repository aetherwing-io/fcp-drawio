import { describe, it, expect } from "vitest";
import { boundsOverlap, computePushVector, isDownstream } from "./spatial.js";
import type { Bounds } from "../types/index.js";

describe("boundsOverlap", () => {
  it("detects overlapping rectangles", () => {
    const a: Bounds = { x: 0, y: 0, width: 100, height: 60 };
    const b: Bounds = { x: 80, y: 40, width: 100, height: 60 };
    expect(boundsOverlap(a, b, 0)).toBe(true);
  });

  it("detects non-overlapping rectangles", () => {
    const a: Bounds = { x: 0, y: 0, width: 100, height: 60 };
    const b: Bounds = { x: 200, y: 200, width: 100, height: 60 };
    expect(boundsOverlap(a, b)).toBe(false);
  });

  it("detects gap violation", () => {
    const a: Bounds = { x: 0, y: 0, width: 100, height: 60 };
    // b is 10px below a — within default 30px gap
    const b: Bounds = { x: 0, y: 70, width: 100, height: 60 };
    expect(boundsOverlap(a, b, 30)).toBe(true);
  });

  it("respects custom gap", () => {
    const a: Bounds = { x: 0, y: 0, width: 100, height: 60 };
    const b: Bounds = { x: 0, y: 70, width: 100, height: 60 };
    expect(boundsOverlap(a, b, 5)).toBe(false);
  });
});

describe("computePushVector", () => {
  it("pushes downstream in TB direction", () => {
    const a: Bounds = { x: 100, y: 100, width: 140, height: 60 };
    const b: Bounds = { x: 100, y: 140, width: 140, height: 60 };
    const push = computePushVector(a, b, "TB", 30);
    expect(push).not.toBeNull();
    expect(push!.dx).toBe(0);
    expect(push!.dy).toBeGreaterThan(0);
  });

  it("pushes downstream in LR direction", () => {
    const a: Bounds = { x: 100, y: 100, width: 140, height: 60 };
    const b: Bounds = { x: 200, y: 100, width: 140, height: 60 };
    const push = computePushVector(a, b, "LR", 30);
    expect(push).not.toBeNull();
    expect(push!.dx).toBeGreaterThan(0);
    expect(push!.dy).toBe(0);
  });

  it("returns null when no overlap", () => {
    const a: Bounds = { x: 0, y: 0, width: 100, height: 60 };
    const b: Bounds = { x: 0, y: 200, width: 100, height: 60 };
    expect(computePushVector(a, b, "TB")).toBeNull();
  });

  it("pushes upstream in BT direction", () => {
    const a: Bounds = { x: 100, y: 200, width: 140, height: 60 };
    const b: Bounds = { x: 100, y: 180, width: 140, height: 60 };
    const push = computePushVector(a, b, "BT", 30);
    expect(push).not.toBeNull();
    expect(push!.dy).toBeLessThan(0);
  });

  it("pushes leftward in RL direction", () => {
    const a: Bounds = { x: 200, y: 100, width: 140, height: 60 };
    const b: Bounds = { x: 180, y: 100, width: 140, height: 60 };
    const push = computePushVector(a, b, "RL", 30);
    expect(push).not.toBeNull();
    expect(push!.dx).toBeLessThan(0);
  });
});

describe("isDownstream", () => {
  it("detects downstream in TB", () => {
    const a: Bounds = { x: 0, y: 0, width: 100, height: 60 };
    const b: Bounds = { x: 0, y: 100, width: 100, height: 60 };
    expect(isDownstream(a, b, "TB")).toBe(true);
    expect(isDownstream(b, a, "TB")).toBe(false);
  });

  it("detects downstream in LR", () => {
    const a: Bounds = { x: 0, y: 0, width: 100, height: 60 };
    const b: Bounds = { x: 200, y: 0, width: 100, height: 60 };
    expect(isDownstream(a, b, "LR")).toBe(true);
    expect(isDownstream(b, a, "LR")).toBe(false);
  });

  it("detects downstream in BT", () => {
    const a: Bounds = { x: 0, y: 200, width: 100, height: 60 };
    const b: Bounds = { x: 0, y: 0, width: 100, height: 60 };
    expect(isDownstream(a, b, "BT")).toBe(true);
  });

  it("detects downstream in RL", () => {
    const a: Bounds = { x: 200, y: 0, width: 100, height: 60 };
    const b: Bounds = { x: 0, y: 0, width: 100, height: 60 };
    expect(isDownstream(a, b, "RL")).toBe(true);
  });
});
