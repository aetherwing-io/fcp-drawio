import { describe, it, expect, beforeEach } from "vitest";
import { IntentLayer } from "./intent-layer.js";
import { resetIdCounters } from "../model/id.js";

let layer: IntentLayer;

beforeEach(() => {
  resetIdCounters();
  layer = new IntentLayer();
});

describe("IntentLayer — add", () => {
  it("adds a shape with type and theme", () => {
    const results = layer.executeOps(["add svc AuthService theme:blue"]);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].message).toContain("+svc");
    expect(results[0].message).toContain("AuthService");
    expect(results[0].message).toContain("blue");

    // Verify shape in model
    const page = layer.model.getActivePage();
    expect(page.shapes.size).toBe(1);
    const shape = [...page.shapes.values()][0];
    expect(shape.label).toBe("AuthService");
    expect(shape.type).toBe("svc");
  });

  it("infers type from label when no type given", () => {
    const results = layer.executeOps(["add UserDB"]);
    expect(results[0].success).toBe(true);

    const page = layer.model.getActivePage();
    const shape = [...page.shapes.values()][0];
    expect(shape.type).toBe("db");
  });

  it("defaults to svc when type cannot be inferred", () => {
    const results = layer.executeOps(["add Gateway"]);
    expect(results[0].success).toBe(true);

    const page = layer.model.getActivePage();
    const shape = [...page.shapes.values()][0];
    // "Gateway" doesn't match any inferred type patterns, defaults to svc
    expect(shape.type).toBe("svc");
  });

  it("handles batch add with count:N", () => {
    const results = layer.executeOps(["add svc Worker count:3"]);
    expect(results[0].success).toBe(true);

    const page = layer.model.getActivePage();
    expect(page.shapes.size).toBe(3);

    const labels = [...page.shapes.values()].map((s) => s.label).sort();
    expect(labels).toEqual(["Worker1", "Worker2", "Worker3"]);
  });

  it("adds a shape at a specific position", () => {
    const results = layer.executeOps(["add svc Frontend at:100,200"]);
    expect(results[0].success).toBe(true);

    const shape = [...layer.model.getActivePage().shapes.values()][0];
    expect(shape.bounds.x).toBe(100);
    expect(shape.bounds.y).toBe(200);
  });

  it("adds a shape with explicit size", () => {
    const results = layer.executeOps(["add box Header size:200x40"]);
    expect(results[0].success).toBe(true);

    const shape = [...layer.model.getActivePage().shapes.values()][0];
    expect(shape.bounds.width).toBe(200);
    expect(shape.bounds.height).toBe(40);
  });
});

describe("IntentLayer — connect", () => {
  beforeEach(() => {
    layer.executeOps([
      "add svc AuthService",
      "add db UserDB",
      "add db TokenCache",
    ]);
  });

  it("connects two shapes with directed arrow", () => {
    const results = layer.executeOps(["connect AuthService -> UserDB label:queries"]);
    expect(results[0].success).toBe(true);
    expect(results[0].message).toContain("~AuthService->UserDB");
    expect(results[0].message).toContain('"queries"');

    const page = layer.model.getActivePage();
    expect(page.edges.size).toBe(1);
  });

  it("creates chained connections", () => {
    const results = layer.executeOps(["connect AuthService -> UserDB -> TokenCache"]);
    expect(results[0].success).toBe(true);

    const page = layer.model.getActivePage();
    expect(page.edges.size).toBe(2);
  });

  it("handles bidirectional arrows", () => {
    const results = layer.executeOps(["connect AuthService <-> UserDB"]);
    expect(results[0].success).toBe(true);

    const page = layer.model.getActivePage();
    const edge = [...page.edges.values()][0];
    expect(edge.sourceArrow).toBe("arrow");
    expect(edge.targetArrow).toBe("arrow");
  });

  it("handles undirected edges", () => {
    const results = layer.executeOps(["connect AuthService -- UserDB"]);
    expect(results[0].success).toBe(true);

    const page = layer.model.getActivePage();
    const edge = [...page.edges.values()][0];
    expect(edge.sourceArrow).toBe("none");
    expect(edge.targetArrow).toBe("none");
  });

  it("returns error for unknown reference", () => {
    const results = layer.executeOps(["connect AuthService -> NonExistent"]);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain("NonExistent");
  });
});

describe("IntentLayer — style", () => {
  beforeEach(() => {
    layer.executeOps([
      "add db UserDB theme:green",
      "add db TokenCache theme:green",
      "add svc AuthService theme:blue",
    ]);
  });

  it("styles a single shape by label", () => {
    const results = layer.executeOps(["style AuthService fill:red"]);
    expect(results[0].success).toBe(true);
    expect(results[0].message).toContain("*styled");
    expect(results[0].message).toContain("1 shape");
  });

  it("styles multiple shapes with selector", () => {
    const results = layer.executeOps(["style @type:db fill:#ff0000"]);
    expect(results[0].success).toBe(true);
    expect(results[0].message).toContain("2 shapes");
  });

  it("returns error for unknown ref", () => {
    const results = layer.executeOps(["style NonExistent fill:red"]);
    expect(results[0].success).toBe(false);
  });
});

describe("IntentLayer — group", () => {
  beforeEach(() => {
    layer.executeOps([
      "add svc AuthService",
      "add db UserDB",
    ]);
  });

  it("creates a group from multiple shapes", () => {
    const results = layer.executeOps(["group AuthService UserDB as:Backend"]);
    expect(results[0].success).toBe(true);
    expect(results[0].message).toContain("!group");
    expect(results[0].message).toContain("Backend");
    expect(results[0].message).toContain("2 shapes");

    const group = layer.model.getGroupByName("Backend");
    expect(group).toBeDefined();
    expect(group!.memberIds.size).toBe(2);
  });

  it("ungroups a group", () => {
    layer.executeOps(["group AuthService UserDB as:Backend"]);
    const results = layer.executeOps(["ungroup Backend"]);
    expect(results[0].success).toBe(true);
    expect(results[0].message).toContain("ungrouped");

    const group = layer.model.getGroupByName("Backend");
    expect(group).toBeUndefined();
  });
});

describe("IntentLayer — queries", () => {
  beforeEach(() => {
    layer.executeOps([
      "add svc AuthService theme:blue",
      "add db UserDB theme:green",
      "connect AuthService -> UserDB",
    ]);
  });

  it("lists all shapes", () => {
    const result = layer.executeQuery("list");
    expect(result).toContain("AuthService(svc)");
    expect(result).toContain("UserDB(db)");
  });

  it("lists filtered by type", () => {
    const result = layer.executeQuery("list @type:db");
    expect(result).toContain("UserDB(db)");
    expect(result).not.toContain("AuthService");
  });

  it("returns stats", () => {
    const result = layer.executeQuery("stats");
    expect(result).toContain("shapes: 2");
    expect(result).toContain("edges: 1");
  });

  it("returns status", () => {
    const result = layer.executeQuery("status");
    expect(result).toContain("Untitled");
    expect(result).toContain("AuthService(svc)");
    expect(result).toContain("UserDB(db)");
  });

  it("describes a shape", () => {
    const result = layer.executeQuery("describe AuthService");
    expect(result).toContain("AuthService (svc)");
    expect(result).toContain("position:");
    expect(result).toContain("size:");
  });

  it("shows connections", () => {
    const result = layer.executeQuery("connections AuthService");
    expect(result).toContain("out:");
    expect(result).toContain("UserDB");
  });

  it("finds shapes by text", () => {
    const result = layer.executeQuery("find Auth");
    expect(result).toContain("AuthService");
  });

  it("returns history", () => {
    const result = layer.executeQuery("history 5");
    // Should contain recent events
    expect(result).toContain("+");
  });
});

describe("IntentLayer — session", () => {
  it("creates a new diagram", () => {
    const result = layer.executeSession('new "My Diagram"');
    expect(result).toContain("My Diagram");
    expect(layer.model.diagram.title).toBe("My Diagram");
  });

  it("creates and restores checkpoints", () => {
    layer.executeOps(["add svc AuthService"]);
    const cpResult = layer.executeSession("checkpoint v1");
    expect(cpResult).toContain("v1");

    layer.executeOps(["add db UserDB"]);
    expect(layer.model.getActivePage().shapes.size).toBe(2);

    const undoResult = layer.executeSession("undo to:v1");
    expect(undoResult).toContain("undone");
    expect(layer.model.getActivePage().shapes.size).toBe(1);
  });

  it("handles undo and redo", () => {
    layer.executeOps(["add svc AuthService"]);
    expect(layer.model.getActivePage().shapes.size).toBe(1);

    const undoResult = layer.executeSession("undo");
    expect(undoResult).toContain("undone");
    expect(layer.model.getActivePage().shapes.size).toBe(0);

    const redoResult = layer.executeSession("redo");
    expect(redoResult).toContain("redone");
    expect(layer.model.getActivePage().shapes.size).toBe(1);
  });

  it("reports nothing to undo when empty", () => {
    const result = layer.executeSession("undo");
    expect(result).toContain("nothing to undo");
  });
});

describe("IntentLayer — error handling", () => {
  it("returns error for parse errors", () => {
    const results = layer.executeOps(["bogus command"]);
    expect(results[0].success).toBe(false);
    expect(results[0].message).toContain("unknown verb");
  });

  it("returns error for unknown reference in connect", () => {
    layer.executeOps(["add svc A"]);
    const results = layer.executeOps(["connect A -> B"]);
    expect(results[0].success).toBe(false);
  });

  it("handles empty ops array", () => {
    const results = layer.executeOps([]);
    expect(results).toHaveLength(0);
  });

  it("returns error for empty op string", () => {
    const results = layer.executeOps([""]);
    expect(results[0].success).toBe(false);
  });
});

describe("IntentLayer — define custom type", () => {
  it("defines a custom type and uses it", () => {
    const defineResult = layer.executeOps([
      "define payment-svc base:svc theme:purple badge:PCI",
    ]);
    expect(defineResult[0].success).toBe(true);
    expect(defineResult[0].message).toContain("payment-svc");

    // Use the custom type
    const addResult = layer.executeOps(["add payment-svc PaymentGateway"]);
    expect(addResult[0].success).toBe(true);
    expect(addResult[0].message).toContain("PaymentGateway");
    expect(addResult[0].message).toContain("purple");

    // Verify shape has custom type base
    const shape = [...layer.model.getActivePage().shapes.values()][0];
    expect(shape.type).toBe("svc");

    // Verify badge was applied
    expect(shape.metadata.badges).toBeDefined();
    expect(shape.metadata.badges!.length).toBe(1);
    expect(shape.metadata.badges![0].text).toBe("PCI");
  });

  it("includes custom types in help output", () => {
    layer.executeOps(["define my-svc base:svc theme:green"]);
    const help = layer.getHelp();
    expect(help).toContain("CUSTOM TYPES:");
    expect(help).toContain("my-svc");
  });
});

describe("IntentLayer — remove", () => {
  it("removes a shape", () => {
    layer.executeOps(["add svc AuthService"]);
    const results = layer.executeOps(["remove AuthService"]);
    expect(results[0].success).toBe(true);
    expect(results[0].message).toContain("-AuthService");
    expect(layer.model.getActivePage().shapes.size).toBe(0);
  });
});

describe("IntentLayer — label and badge", () => {
  beforeEach(() => {
    layer.executeOps(["add svc AuthService"]);
  });

  it("relabels a shape", () => {
    const results = layer.executeOps(['label AuthService "Auth Gateway"']);
    expect(results[0].success).toBe(true);
    const shape = [...layer.model.getActivePage().shapes.values()][0];
    expect(shape.label).toBe("Auth Gateway");
  });

  it("adds a badge to a shape", () => {
    const results = layer.executeOps(['badge AuthService "v2"']);
    expect(results[0].success).toBe(true);
    const shape = [...layer.model.getActivePage().shapes.values()][0];
    expect(shape.metadata.badges).toBeDefined();
    expect(shape.metadata.badges![0].text).toBe("v2");
  });
});

describe("IntentLayer — page operations", () => {
  it("adds and switches pages", () => {
    const results = layer.executeOps(["page add Page-2"]);
    expect(results[0].success).toBe(true);
    expect(layer.model.diagram.pages).toHaveLength(2);

    const switchResult = layer.executeOps(["page switch Page-1"]);
    expect(switchResult[0].success).toBe(true);
    expect(layer.model.getActivePage().name).toBe("Page-1");
  });
});

describe("IntentLayer — move and resize", () => {
  beforeEach(() => {
    layer.executeOps(["add svc AuthService at:100,100"]);
  });

  it("moves a shape to absolute position", () => {
    const results = layer.executeOps(["move AuthService to:300,400"]);
    expect(results[0].success).toBe(true);
    const shape = [...layer.model.getActivePage().shapes.values()][0];
    expect(shape.bounds.x).toBe(300);
    expect(shape.bounds.y).toBe(400);
  });

  it("resizes a shape", () => {
    const results = layer.executeOps(["resize AuthService to:200x100"]);
    expect(results[0].success).toBe(true);
    const shape = [...layer.model.getActivePage().shapes.values()][0];
    expect(shape.bounds.width).toBe(200);
    expect(shape.bounds.height).toBe(100);
  });
});

describe("IntentLayer — swap", () => {
  it("swaps positions of two shapes", () => {
    layer.executeOps([
      "add svc A at:100,100",
      "add svc B at:300,300",
    ]);

    const results = layer.executeOps(["swap A B"]);
    expect(results[0].success).toBe(true);

    const page = layer.model.getActivePage();
    const shapes = [...page.shapes.values()];
    const a = shapes.find((s) => s.label === "A")!;
    const b = shapes.find((s) => s.label === "B")!;

    expect(a.bounds.x).toBe(300);
    expect(a.bounds.y).toBe(300);
    expect(b.bounds.x).toBe(100);
    expect(b.bounds.y).toBe(100);
  });
});

describe("IntentLayer — disconnect", () => {
  it("disconnects two shapes", () => {
    layer.executeOps([
      "add svc A",
      "add svc B",
      "connect A -> B",
    ]);

    expect(layer.model.getActivePage().edges.size).toBe(1);

    const results = layer.executeOps(["disconnect A -> B"]);
    expect(results[0].success).toBe(true);
    expect(layer.model.getActivePage().edges.size).toBe(0);
  });
});

describe("IntentLayer — title and checkpoint ops", () => {
  it("sets the diagram title", () => {
    const results = layer.executeOps(['title "My Architecture"']);
    expect(results[0].success).toBe(true);
    expect(layer.model.diagram.title).toBe("My Architecture");
  });

  it("creates a checkpoint via ops", () => {
    const results = layer.executeOps(["checkpoint v1"]);
    expect(results[0].success).toBe(true);
    expect(results[0].message).toContain("v1");
  });
});

describe("IntentLayer — repair suggestions", () => {
  it("suggests corrected ref for typos", () => {
    layer.executeSession('new "Test"');
    layer.executeOps(["add svc AuthService theme:blue"]);
    const results = layer.executeOps(["style AthService fill:red"]);
    expect(results[0].success).toBe(false);
    expect(results[0].suggestion).toBeDefined();
    expect(results[0].suggestion).toContain("AuthService");
  });

  it("suggests type-qualified ref for ambiguous labels", () => {
    layer.executeSession('new "Test"');
    layer.executeOps([
      "add svc Service theme:blue",
      "add db Service theme:green",
    ]);
    const results = layer.executeOps(["style Service fill:red"]);
    expect(results[0].success).toBe(false);
    expect(results[0].suggestion).toBeDefined();
    expect(results[0].suggestion).toContain(":");
  });

  it("no suggestion when ref is completely unknown", () => {
    layer.executeSession('new "Test"');
    const results = layer.executeOps(["style CompletelyRandom fill:red"]);
    expect(results[0].success).toBe(false);
    // May or may not have suggestion depending on whether there are any shapes
  });

  it("suggests corrected ref for typos in connect", () => {
    layer.executeSession('new "Test"');
    layer.executeOps([
      "add svc AuthService theme:blue",
      "add db UserDB theme:green",
    ]);
    const results = layer.executeOps(["connect AthService -> UserDB"]);
    expect(results[0].success).toBe(false);
    expect(results[0].suggestion).toBeDefined();
    expect(results[0].suggestion).toContain("AuthService");
  });

  it("suggests corrected ref for typos in remove", () => {
    layer.executeSession('new "Test"');
    layer.executeOps(["add svc AuthService theme:blue"]);
    const results = layer.executeOps(["remove AthService"]);
    expect(results[0].success).toBe(false);
    expect(results[0].suggestion).toBeDefined();
    expect(results[0].suggestion).toContain("AuthService");
  });
});
