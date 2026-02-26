import { describe, it, expect } from "vitest";
import {
  NODE_TYPES,
  isShapeType,
  getNodeType,
  inferTypeFromLabel,
  computeDefaultSize,
} from "./node-types.js";
import { THEMES, isThemeName, resolveTheme, resolveColor } from "./themes.js";

describe("NODE_TYPES", () => {
  it("has all 12 built-in types", () => {
    expect(Object.keys(NODE_TYPES)).toHaveLength(12);
  });

  it("each type has required fields", () => {
    for (const [key, def] of Object.entries(NODE_TYPES)) {
      expect(def.shorthand).toBe(key);
      expect(def.baseStyle).toBeTruthy();
      expect(def.defaultWidth).toBeGreaterThan(0);
      expect(def.defaultHeight).toBeGreaterThan(0);
      expect(def.description).toBeTruthy();
    }
  });
});

describe("isShapeType", () => {
  it("recognizes valid types", () => {
    expect(isShapeType("svc")).toBe(true);
    expect(isShapeType("db")).toBe(true);
    expect(isShapeType("api")).toBe(true);
    expect(isShapeType("box")).toBe(true);
  });

  it("rejects invalid types", () => {
    expect(isShapeType("unknown")).toBe(false);
    expect(isShapeType("")).toBe(false);
    expect(isShapeType("SVC")).toBe(false);
  });
});

describe("getNodeType", () => {
  it("returns definition for valid type", () => {
    const def = getNodeType("db");
    expect(def).not.toBeNull();
    expect(def!.defaultWidth).toBe(120);
    expect(def!.defaultHeight).toBe(80);
  });

  it("returns null for invalid type", () => {
    expect(getNodeType("invalid")).toBeNull();
  });
});

describe("inferTypeFromLabel", () => {
  it("infers db from database labels", () => {
    expect(inferTypeFromLabel("UserDB")).toBe("db");
    expect(inferTypeFromLabel("user_database")).toBe("db");
    expect(inferTypeFromLabel("Redis Cache")).toBe("db");
    expect(inferTypeFromLabel("PostgresStore")).toBe("db");
  });

  it("infers decision from question marks", () => {
    expect(inferTypeFromLabel("Is Valid?")).toBe("decision");
    expect(inferTypeFromLabel("Check Auth")).toBe("decision");
  });

  it("infers actor from user labels", () => {
    expect(inferTypeFromLabel("Admin User")).toBe("actor");
    expect(inferTypeFromLabel("Customer")).toBe("actor");
  });

  it("infers queue from queue labels", () => {
    expect(inferTypeFromLabel("EventBus")).toBe("queue");
    expect(inferTypeFromLabel("Kafka Topic")).toBe("queue");
    expect(inferTypeFromLabel("SQS Queue")).toBe("queue");
  });

  it("infers cloud from cloud labels", () => {
    expect(inferTypeFromLabel("Cloud CDN")).toBe("cloud");
    expect(inferTypeFromLabel("External API")).toBe("cloud");
  });

  it("infers doc from document labels", () => {
    expect(inferTypeFromLabel("Access Log")).toBe("doc");
    expect(inferTypeFromLabel("Monthly Report")).toBe("doc");
  });

  it("returns null for unrecognized labels", () => {
    expect(inferTypeFromLabel("AuthService")).toBeNull();
    expect(inferTypeFromLabel("Gateway")).toBeNull();
  });
});

describe("computeDefaultSize", () => {
  it("uses type defaults for short labels", () => {
    const size = computeDefaultSize("svc", "Auth");
    expect(size.width).toBe(140);
    expect(size.height).toBe(60);
  });

  it("expands width for long labels", () => {
    const size = computeDefaultSize("svc", "VeryLongServiceNameThatNeedsMoreSpace");
    expect(size.width).toBeGreaterThan(140);
  });
});

describe("THEMES", () => {
  it("has all 9 themes", () => {
    expect(Object.keys(THEMES)).toHaveLength(9);
  });

  it("dark theme has fontColor", () => {
    expect(THEMES.dark.fontColor).toBe("#e0e0e0");
  });

  it("normal themes have no fontColor", () => {
    expect(THEMES.blue.fontColor).toBeUndefined();
  });
});

describe("isThemeName", () => {
  it("recognizes valid themes", () => {
    expect(isThemeName("blue")).toBe(true);
    expect(isThemeName("dark")).toBe(true);
  });

  it("rejects invalid themes", () => {
    expect(isThemeName("rainbow")).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("resolves valid theme", () => {
    const theme = resolveTheme("blue");
    expect(theme).toEqual({ fill: "#dae8fc", stroke: "#6c8ebf" });
  });

  it("returns null for invalid theme", () => {
    expect(resolveTheme("nope")).toBeNull();
  });
});

describe("resolveColor", () => {
  it("passes through hex colors", () => {
    expect(resolveColor("#aabbcc")).toBe("#aabbcc");
  });

  it("resolves theme name to fill color", () => {
    expect(resolveColor("blue")).toBe("#dae8fc");
  });

  it("returns null for unknown non-hex value", () => {
    expect(resolveColor("rainbow")).toBeNull();
  });
});
