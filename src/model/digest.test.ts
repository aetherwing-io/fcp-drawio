import { describe, it, expect, beforeEach } from "vitest";
import { DiagramModel } from "./diagram-model.js";
import { resetIdCounters } from "./id.js";

let model: DiagramModel;

beforeEach(() => {
  resetIdCounters();
  model = new DiagramModel();
  model.createNew("Test");
});

describe("DiagramModel.getDigest", () => {
  it("returns digest for empty page", () => {
    const digest = model.getDigest();
    expect(digest).toBe("[0s 0e 0g p:1/1]");
  });

  it("reflects shape count", () => {
    model.addShape("A", "svc");
    model.addShape("B", "svc");
    expect(model.getDigest()).toContain("2s");
  });

  it("reflects edge count", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    model.addEdge(s1.id, s2.id);
    expect(model.getDigest()).toContain("1e");
  });

  it("reflects group count", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    model.createGroup("G", [s1.id, s2.id]);
    expect(model.getDigest()).toContain("1g");
  });

  it("reflects multi-page", () => {
    model.addPage("Page-2");
    expect(model.getDigest()).toContain("p:2/2");
  });
});
