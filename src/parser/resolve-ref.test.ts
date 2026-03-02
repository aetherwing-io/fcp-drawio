import { describe, it, expect, beforeEach } from "vitest";
import { resolveRef, type ResolveResult } from "./resolve-ref.js";
import { DiagramModel } from "../model/diagram-model.js";
import { resetIdCounters } from "../model/id.js";

let model: DiagramModel;

beforeEach(() => {
  resetIdCounters();
  model = new DiagramModel();
  model.createNew("Test");
});

function resolve(ref: string): ResolveResult {
  return resolveRef(ref, model.registry, model);
}

describe("resolveRef — level 1: exact match", () => {
  it("resolves exact label", () => {
    model.addShape("AuthService", "svc");
    const result = resolve("AuthService");
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.shape.label).toBe("AuthService");
    }
  });

  it("reports ambiguity for duplicate labels", () => {
    model.addShape("Service", "svc");
    model.addShape("Service", "db");
    const result = resolve("Service");
    expect(result.kind).toBe("multiple");
  });
});

describe("resolveRef — level 2: case-insensitive", () => {
  it("resolves case-insensitive label", () => {
    model.addShape("AuthService", "svc");
    const result = resolve("authservice");
    expect(result.kind).toBe("single");
  });
});

describe("resolveRef — level 3: normalized", () => {
  it("resolves normalized label (underscores/hyphens stripped)", () => {
    model.addShape("Auth-Service", "svc");
    const result = resolve("auth_service");
    expect(result.kind).toBe("single");
  });

  it("resolves with spaces stripped", () => {
    model.addShape("Auth Service", "svc");
    const result = resolve("authservice");
    expect(result.kind).toBe("single");
  });
});

describe("resolveRef — level 4: prefix", () => {
  it("resolves unique prefix", () => {
    model.addShape("AuthService", "svc");
    model.addShape("UserDB", "db");
    const result = resolve("Auth");
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.shape.label).toBe("AuthService");
    }
  });

  it("reports ambiguous prefix", () => {
    model.addShape("AuthService", "svc");
    model.addShape("AuthDB", "db");
    const result = resolve("Auth");
    expect(result.kind).toBe("multiple");
    if (result.kind === "multiple") {
      expect(result.shapes).toHaveLength(2);
    }
  });
});

describe("resolveRef — level 5: not found", () => {
  it("suggests similar labels", () => {
    model.addShape("AuthService", "svc");
    const result = resolve("AthService");
    expect(result.kind).toBe("none");
    if (result.kind === "none") {
      expect(result.message).toContain("AuthService");
    }
  });

  it("reports no shapes when page is empty", () => {
    const result = resolve("Nothing");
    expect(result.kind).toBe("none");
  });
});

describe("resolveRef — type-qualified", () => {
  it("resolves type:label", () => {
    model.addShape("Cache", "svc");
    model.addShape("Cache", "db");
    const result = resolve("db:Cache");
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.shape.type).toBe("db");
    }
  });
});

describe("resolveRef — group-qualified", () => {
  it("resolves group/label", () => {
    const s1 = model.addShape("Service", "svc");
    const s2 = model.addShape("Service", "svc");
    model.createGroup("Backend", [s1.id]);
    model.createGroup("Frontend", [s2.id]);
    const result = resolve("Backend/Service");
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.shape.id).toBe(s1.id);
    }
  });
});

// ── Selectors ─────────────────────────────────────────────

describe("resolveRef — @type selector", () => {
  it("resolves @type:db", () => {
    model.addShape("A", "svc");
    model.addShape("B", "db");
    model.addShape("C", "db");
    const result = resolve("@type:db");
    expect(result.kind).toBe("multiple");
    if (result.kind === "multiple") {
      expect(result.shapes).toHaveLength(2);
    }
  });

  it("reports empty @type with available info", () => {
    model.addShape("A", "svc");
    const result = resolve("@type:db");
    expect(result.kind).toBe("none");
    if (result.kind === "none") {
      expect(result.message).toContain("svc");
    }
  });
});

describe("resolveRef — @group selector", () => {
  it("resolves @group:Backend", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    model.addShape("C", "svc");
    model.createGroup("Backend", [s1.id, s2.id]);
    const result = resolve("@group:Backend");
    expect(result.kind).toBe("multiple");
    if (result.kind === "multiple") {
      expect(result.shapes).toHaveLength(2);
    }
  });

  it("reports unknown group", () => {
    const result = resolve("@group:Nonexistent");
    expect(result.kind).toBe("none");
  });
});

describe("resolveRef — @recent selector", () => {
  it("resolves @recent to most recent", () => {
    model.addShape("First", "svc");
    model.addShape("Second", "svc");
    model.addShape("Third", "svc");
    const result = resolve("@recent");
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.shape.label).toBe("Third");
    }
  });

  it("resolves @recent:2", () => {
    model.addShape("First", "svc");
    model.addShape("Second", "svc");
    model.addShape("Third", "svc");
    const result = resolve("@recent:2");
    expect(result.kind).toBe("multiple");
    if (result.kind === "multiple") {
      expect(result.shapes).toHaveLength(2);
    }
  });
});

describe("resolveRef — @all selector", () => {
  it("resolves @all", () => {
    model.addShape("A", "svc");
    model.addShape("B", "db");
    const result = resolve("@all");
    expect(result.kind).toBe("multiple");
    if (result.kind === "multiple") {
      expect(result.shapes).toHaveLength(2);
    }
  });

  it("reports empty on empty page", () => {
    const result = resolve("@all");
    expect(result.kind).toBe("none");
  });
});

describe("resolveRef — @orphan selector", () => {
  it("resolves @orphan to unconnected shapes", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const s3 = model.addShape("C", "svc");
    model.addEdge(s1.id, s2.id);
    const result = resolve("@orphan");
    expect(result.kind).toBe("multiple");
    if (result.kind === "multiple") {
      expect(result.shapes).toHaveLength(1);
      expect(result.shapes[0].label).toBe("C");
    }
  });
});

describe("resolveRef — @connected selector", () => {
  it("resolves @connected:REF to neighbor shapes", () => {
    const s1 = model.addShape("Auth", "svc");
    const s2 = model.addShape("UserDB", "db");
    const s3 = model.addShape("Cache", "db");
    model.addShape("Orphan", "svc");
    model.addEdge(s1.id, s2.id);
    model.addEdge(s1.id, s3.id);
    const result = resolve("@connected:Auth");
    expect(result.kind).toBe("multiple");
    if (result.kind === "multiple") {
      expect(result.shapes).toHaveLength(2);
      const labels = result.shapes.map(s => s.label).sort();
      expect(labels).toEqual(["Cache", "UserDB"]);
    }
  });

  it("returns empty when shape has no connections", () => {
    model.addShape("Lonely", "svc");
    const result = resolve("@connected:Lonely");
    expect(result.kind).toBe("none");
    if (result.kind === "none") {
      expect(result.message).toContain("matched 0");
    }
  });

  it("reports error for unknown inner ref", () => {
    const result = resolve("@connected:Nonexistent");
    expect(result.kind).toBe("none");
    if (result.kind === "none") {
      expect(result.message).toContain("@connected:Nonexistent");
    }
  });

  it("includes both incoming and outgoing neighbors", () => {
    const s1 = model.addShape("Source", "svc");
    const s2 = model.addShape("Middle", "svc");
    const s3 = model.addShape("Target", "svc");
    model.addEdge(s1.id, s2.id);
    model.addEdge(s2.id, s3.id);
    const result = resolve("@connected:Middle");
    expect(result.kind).toBe("multiple");
    if (result.kind === "multiple") {
      expect(result.shapes).toHaveLength(2);
      const labels = result.shapes.map(s => s.label).sort();
      expect(labels).toEqual(["Source", "Target"]);
    }
  });
});

// ── Fix 4: Newline label canonicalization ─────────────────

describe("resolveRef — newline canonicalization", () => {
  it("resolves shape with \\n in label via &#10; reference", () => {
    model.addShape("Container\nRegistry", "svc");
    const result = resolve("Container&#10;Registry");
    expect(result.kind).toBe("single");
  });

  it("resolves shape with &#10; in label via \\n reference", () => {
    // Simulate a shape that was deserialized with &#10; in label
    const shape = model.addShape("Line1&#10;Line2", "svc");
    const result = resolve("Line1\nLine2");
    expect(result.kind).toBe("single");
  });
});

// ── Fix 5: Alias resolution ──────────────────────────────

describe("resolveRef — alias", () => {
  it("resolves shape by alias", () => {
    const shape = model.addShape("Display Name", "svc");
    model.modifyShape(shape.id, { alias: "Ref" });

    const result = resolve("Ref");
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.shape.label).toBe("Display Name");
    }
  });

  it("resolves shape by label when alias exists", () => {
    const shape = model.addShape("Display Name", "svc");
    model.modifyShape(shape.id, { alias: "Ref" });

    const result = resolve("Display Name");
    expect(result.kind).toBe("single");
  });

  it("alias case-insensitive resolution", () => {
    const shape = model.addShape("Display Name", "svc");
    model.modifyShape(shape.id, { alias: "MyRef" });

    const result = resolve("myref");
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.shape.label).toBe("Display Name");
    }
  });
});
