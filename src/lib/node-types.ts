import type { NodeTypeDefinition, ShapeType } from "../types/index.js";

/**
 * Built-in node types with their draw.io style mappings and default sizes.
 *
 * Style strings follow draw.io's semicolon-delimited format.
 * The base style is a template — theme colors are merged at creation time.
 */
export const NODE_TYPES: Record<ShapeType, NodeTypeDefinition> = {
  box: {
    shorthand: "box",
    drawioShape: "rectangle",
    baseStyle: "whiteSpace=wrap;html=1;",
    defaultWidth: 120,
    defaultHeight: 60,
    description: "Plain rectangle (generic)",
  },
  svc: {
    shorthand: "svc",
    drawioShape: "rounded rectangle",
    baseStyle: "rounded=1;whiteSpace=wrap;html=1;",
    defaultWidth: 140,
    defaultHeight: 60,
    description: "Rounded rectangle (services, components)",
  },
  circle: {
    shorthand: "circle",
    drawioShape: "ellipse",
    baseStyle: "ellipse;whiteSpace=wrap;html=1;aspect=fixed;",
    defaultWidth: 60,
    defaultHeight: 60,
    description: "Ellipse (states, events)",
  },
  decision: {
    shorthand: "decision",
    drawioShape: "rhombus",
    baseStyle: "rhombus;whiteSpace=wrap;html=1;",
    defaultWidth: 100,
    defaultHeight: 80,
    description: "Diamond (decisions, conditions)",
  },
  db: {
    shorthand: "db",
    drawioShape: "cylinder3",
    baseStyle: "shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;",
    defaultWidth: 120,
    defaultHeight: 80,
    description: "Cylinder (databases, storage)",
  },
  api: {
    shorthand: "api",
    drawioShape: "hexagon",
    baseStyle: "shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fixedSize=1;size=20;",
    defaultWidth: 120,
    defaultHeight: 80,
    description: "Hexagon (APIs, gateways)",
  },
  cloud: {
    shorthand: "cloud",
    drawioShape: "cloud",
    baseStyle: "ellipse;shape=cloud;whiteSpace=wrap;html=1;",
    defaultWidth: 140,
    defaultHeight: 60,
    description: "Cloud (external services)",
  },
  actor: {
    shorthand: "actor",
    drawioShape: "shape=mxgraph.basic.person",
    baseStyle: "shape=mxgraph.basic.person;whiteSpace=wrap;html=1;",
    defaultWidth: 40,
    defaultHeight: 60,
    description: "Person shape (users, personas)",
  },
  doc: {
    shorthand: "doc",
    drawioShape: "document",
    baseStyle: "shape=document;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=0.27;",
    defaultWidth: 120,
    defaultHeight: 80,
    description: "Document shape (files, reports)",
  },
  queue: {
    shorthand: "queue",
    drawioShape: "parallelogram",
    baseStyle: "shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fixedSize=1;size=20;",
    defaultWidth: 140,
    defaultHeight: 60,
    description: "Parallelogram (queues, streams)",
  },
  triangle: {
    shorthand: "triangle",
    drawioShape: "triangle",
    baseStyle: "triangle;whiteSpace=wrap;html=1;",
    defaultWidth: 80,
    defaultHeight: 80,
    description: "Triangle (warnings, deltas)",
  },
  process: {
    shorthand: "process",
    drawioShape: "process",
    baseStyle: "shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;size=0.1;",
    defaultWidth: 120,
    defaultHeight: 60,
    description: "Double-bordered rect (predefined processes)",
  },
};

const SHAPE_TYPES = new Set(Object.keys(NODE_TYPES));

export function isShapeType(name: string): name is ShapeType {
  return SHAPE_TYPES.has(name);
}

export function getNodeType(name: string): NodeTypeDefinition | null {
  if (isShapeType(name)) {
    return NODE_TYPES[name];
  }
  return null;
}

/**
 * Split a label into tokens on camelCase, PascalCase, snake_case, kebab-case, and space boundaries.
 * "UserDB" → ["User", "DB"], "event_bus" → ["event", "bus"], "Redis Cache" → ["Redis", "Cache"]
 */
function tokenizeLabel(label: string): string[] {
  return label
    .replace(/([a-z])([A-Z])/g, "$1 $2")   // camelCase split
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // consecutive uppercase split
    .replace(/[_\-]/g, " ")                  // snake/kebab to spaces
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Infer shape type from a label using tokenized matching.
 * Returns null if no pattern matches (caller should default to "svc").
 */
export function inferTypeFromLabel(label: string): ShapeType | null {
  const tokens = tokenizeLabel(label).map((t) => t.toLowerCase());
  const joined = tokens.join(" ");

  // Database patterns
  const dbWords = new Set(["database", "db", "store", "cache", "redis", "postgres", "mysql", "mongo"]);
  if (tokens.some((t) => dbWords.has(t))) return "db";

  // Decision patterns
  const decisionWords = new Set(["decision", "check", "condition"]);
  if (tokens.some((t) => decisionWords.has(t)) || label.endsWith("?")) return "decision";

  // Actor patterns
  const actorWords = new Set(["user", "actor", "person", "customer", "admin"]);
  if (tokens.some((t) => actorWords.has(t))) return "actor";

  // Queue patterns
  const queueWords = new Set(["queue", "buffer", "stream", "kafka", "sqs", "event"]);
  if (tokens.some((t) => queueWords.has(t))) return "queue";

  // Cloud patterns
  const cloudWords = new Set(["cloud", "external", "internet", "cdn"]);
  if (tokens.some((t) => cloudWords.has(t))) return "cloud";

  // Document patterns
  const docWords = new Set(["document", "file", "log", "report"]);
  if (tokens.some((t) => docWords.has(t))) return "doc";

  return null;
}

/**
 * Compute default size for a shape type, potentially expanding width for long labels.
 */
export function computeDefaultSize(
  type: ShapeType,
  label: string,
): { width: number; height: number } {
  const def = NODE_TYPES[type];
  let width = def.defaultWidth;
  const height = def.defaultHeight;

  // Expand width for long labels (rough: ~8px per character)
  const labelWidth = label.length * 8 + 20; // padding
  if (labelWidth > width) {
    width = Math.ceil(labelWidth / 10) * 10; // round up to nearest 10
  }

  return { width, height };
}
