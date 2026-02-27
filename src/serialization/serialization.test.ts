import { describe, it, expect, beforeEach } from "vitest";
import { DiagramModel } from "../model/diagram-model.js";
import { resetIdCounters } from "../model/id.js";
import { serializeDiagram, buildShapeStyleString, buildEdgeStyleString } from "./serialize.js";
import { deserializeDiagram } from "./deserialize.js";

let model: DiagramModel;

beforeEach(() => {
  resetIdCounters();
  model = new DiagramModel();
  model.createNew("Test Diagram");
});

// ── Serialize simple diagram ────────────────────────────────

describe("serializeDiagram — basic structure", () => {
  it("serializes a simple diagram with 2 shapes and 1 edge", () => {
    const s1 = model.addShape("AuthService", "svc");
    const s2 = model.addShape("UserDB", "db", { theme: "green" });
    model.addEdge(s1.id, s2.id, { label: "queries" });

    const xml = serializeDiagram(model.diagram);

    // mxfile wrapper
    expect(xml).toContain('<mxfile host="fcp-drawio"');
    expect(xml).toContain('version="0.2.0"');

    // Page wrapper
    expect(xml).toContain("<diagram");
    expect(xml).toContain("<mxGraphModel");
    expect(xml).toContain("<root>");

    // Foundation cells — default layer uses the model's actual layer ID
    expect(xml).toContain('<mxCell id="0"/>');
    expect(xml).toMatch(/<mxCell id="[^"]*" parent="0"\/>/);  // default layer cell

    // Shape cells
    expect(xml).toContain(`id="${s1.id}"`);
    expect(xml).toContain('value="AuthService"');
    expect(xml).toContain(`id="${s2.id}"`);
    expect(xml).toContain('value="UserDB"');

    // Edge cell
    expect(xml).toContain('value="queries"');
    expect(xml).toContain('edge="1"');
    expect(xml).toContain(`source="${s1.id}"`);
    expect(xml).toContain(`target="${s2.id}"`);

    // Geometry
    expect(xml).toContain("<mxGeometry");
    expect(xml).toContain('as="geometry"');
  });

  it("emits vertex=1 for shapes and edge=1 for edges", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    model.addEdge(s1.id, s2.id);

    const xml = serializeDiagram(model.diagram);

    // Count vertex="1" — should be at least 2 (for 2 shapes)
    const vertexMatches = xml.match(/vertex="1"/g);
    expect(vertexMatches).not.toBeNull();
    expect(vertexMatches!.length).toBeGreaterThanOrEqual(2);

    // Count edge="1" — should be exactly 1
    const edgeMatches = xml.match(/edge="1"/g);
    expect(edgeMatches).not.toBeNull();
    expect(edgeMatches!.length).toBe(1);
  });

  it("outputs uncompressed XML (no base64/deflate)", () => {
    model.addShape("A", "svc");
    const xml = serializeDiagram(model.diagram);

    // Should contain raw XML elements, not base64 encoded content
    expect(xml).toContain("<mxGraphModel");
    expect(xml).toContain("<root>");
    expect(xml).toContain("<mxCell");
  });
});

// ── Round-trip ──────────────────────────────────────────────

describe("round-trip: serialize → deserialize", () => {
  it("preserves shapes, edges, and labels through round-trip", () => {
    const s1 = model.addShape("AuthService", "svc");
    const s2 = model.addShape("UserDB", "db", { theme: "green" });
    const edge = model.addEdge(s1.id, s2.id, { label: "queries" })!;

    const xml = serializeDiagram(model.diagram);
    const restored = deserializeDiagram(xml);

    expect(restored.pages).toHaveLength(1);
    const page = restored.pages[0];

    // Shapes preserved
    expect(page.shapes.size).toBe(2);
    const restoredS1 = page.shapes.get(s1.id);
    const restoredS2 = page.shapes.get(s2.id);
    expect(restoredS1).toBeDefined();
    expect(restoredS2).toBeDefined();
    expect(restoredS1!.label).toBe("AuthService");
    expect(restoredS2!.label).toBe("UserDB");

    // Shape types inferred correctly
    expect(restoredS1!.type).toBe("svc");
    expect(restoredS2!.type).toBe("db");

    // Edge preserved
    expect(page.edges.size).toBe(1);
    const restoredEdge = page.edges.get(edge.id);
    expect(restoredEdge).toBeDefined();
    expect(restoredEdge!.label).toBe("queries");
    expect(restoredEdge!.sourceId).toBe(s1.id);
    expect(restoredEdge!.targetId).toBe(s2.id);
  });

  it("preserves shape bounds through round-trip", () => {
    const shape = model.addShape("Test", "box", { at: { x: 150, y: 250 } });

    const xml = serializeDiagram(model.diagram);
    const restored = deserializeDiagram(xml);
    const page = restored.pages[0];
    const restoredShape = page.shapes.get(shape.id)!;

    expect(restoredShape.bounds.x).toBe(150);
    expect(restoredShape.bounds.y).toBe(250);
    expect(restoredShape.bounds.width).toBe(shape.bounds.width);
    expect(restoredShape.bounds.height).toBe(shape.bounds.height);
  });

  it("preserves style colors through round-trip", () => {
    const shape = model.addShape("GreenBox", "svc", { theme: "green" });

    const xml = serializeDiagram(model.diagram);
    const restored = deserializeDiagram(xml);
    const page = restored.pages[0];
    const restoredShape = page.shapes.get(shape.id)!;

    expect(restoredShape.style.fillColor).toBe("#d5e8d4");
    expect(restoredShape.style.strokeColor).toBe("#82b366");
  });

  it("preserves metadata through round-trip", () => {
    const xml = serializeDiagram(model.diagram);
    const restored = deserializeDiagram(xml);

    expect(restored.metadata.host).toBe("fcp-drawio");
    expect(restored.metadata.version).toBe("0.2.0");
  });

  it("preserves fontStyle bitmask through round-trip", () => {
    const shape = model.addShape("Title", "svc");
    model.modifyShape(shape.id, {
      style: { ...shape.style, fontStyle: 3, fontFamily: "Helvetica" },
    });

    const xml = serializeDiagram(model.diagram);
    const restored = deserializeDiagram(xml);
    const page = restored.pages[0];
    const restoredShape = page.shapes.get(shape.id)!;

    expect(restoredShape.style.fontStyle).toBe(3); // bold + italic
    expect(restoredShape.style.fontFamily).toBe("Helvetica");
  });

  it("preserves align and verticalAlign through round-trip", () => {
    const shape = model.addShape("Title", "svc");
    model.modifyShape(shape.id, {
      style: { ...shape.style, align: "left", verticalAlign: "top" },
    });

    const xml = serializeDiagram(model.diagram);
    const restored = deserializeDiagram(xml);
    const page = restored.pages[0];
    const restoredShape = page.shapes.get(shape.id)!;

    expect(restoredShape.style.align).toBe("left");
    expect(restoredShape.style.verticalAlign).toBe("top");
  });
});

// ── Deserialize uncompressed XML ────────────────────────────

describe("deserializeDiagram — uncompressed XML", () => {
  it("parses a hand-crafted uncompressed XML", () => {
    const xml = `<mxfile host="fcp-drawio" modified="2026-02-25T00:00:00Z" version="0.2.0">
  <diagram id="page1" name="System Overview">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1">
    <root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      <mxCell id="s1" value="AuthService" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
        <mxGeometry x="120" y="200" width="140" height="60" as="geometry"/>
      </mxCell>
      <mxCell id="s2" value="UserDB" style="shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
        <mxGeometry x="120" y="340" width="120" height="80" as="geometry"/>
      </mxCell>
      <mxCell id="e1" value="queries" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" source="s1" target="s2" parent="1">
        <mxGeometry relative="1" as="geometry"/>
      </mxCell>
    </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    const diagram = deserializeDiagram(xml);

    expect(diagram.pages).toHaveLength(1);
    const page = diagram.pages[0];
    expect(page.name).toBe("System Overview");

    // Shapes
    expect(page.shapes.size).toBe(2);
    const s1 = page.shapes.get("s1")!;
    expect(s1.label).toBe("AuthService");
    expect(s1.type).toBe("svc");
    expect(s1.bounds.x).toBe(120);
    expect(s1.bounds.y).toBe(200);
    expect(s1.style.fillColor).toBe("#dae8fc");
    expect(s1.style.strokeColor).toBe("#6c8ebf");

    const s2 = page.shapes.get("s2")!;
    expect(s2.label).toBe("UserDB");
    expect(s2.type).toBe("db");
    expect(s2.style.fillColor).toBe("#d5e8d4");

    // Edge
    expect(page.edges.size).toBe(1);
    const e1 = page.edges.get("e1")!;
    expect(e1.label).toBe("queries");
    expect(e1.sourceId).toBe("s1");
    expect(e1.targetId).toBe("s2");
  });

  it("creates default layer when foundation cells are present", () => {
    const xml = `<mxfile host="test" modified="2026-01-01" version="0.1.0">
  <diagram id="p1" name="Test">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1">
    <root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
    </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    const diagram = deserializeDiagram(xml);
    const page = diagram.pages[0];
    expect(page.layers).toHaveLength(1);
    expect(page.layers[0].name).toBe("Default");
    expect(page.defaultLayer).toBe("1");
  });

  it("handles extra layers", () => {
    const xml = `<mxfile host="test" modified="2026-01-01" version="0.1.0">
  <diagram id="p1" name="Test">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1">
    <root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      <mxCell id="layer2" value="Background" parent="0"/>
    </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    const diagram = deserializeDiagram(xml);
    const page = diagram.pages[0];
    expect(page.layers).toHaveLength(2);
    expect(page.layers[1].name).toBe("Background");
  });

  it("removes orphaned edges (source/target missing)", () => {
    const xml = `<mxfile host="test" modified="2026-01-01" version="0.1.0">
  <diagram id="p1" name="Test">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1">
    <root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      <mxCell id="s1" value="A" style="whiteSpace=wrap;html=1;" vertex="1" parent="1">
        <mxGeometry x="0" y="0" width="120" height="60" as="geometry"/>
      </mxCell>
      <mxCell id="e1" value="" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="s1" target="s_missing" parent="1">
        <mxGeometry relative="1" as="geometry"/>
      </mxCell>
    </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    const diagram = deserializeDiagram(xml);
    const page = diagram.pages[0];
    expect(page.shapes.size).toBe(1);
    expect(page.edges.size).toBe(0); // orphaned edge removed
  });
});

// ── Style string generation ─────────────────────────────────

describe("buildShapeStyleString — theme colors appear in style", () => {
  it("includes fillColor and strokeColor from theme", () => {
    const shape = model.addShape("BlueBox", "box");
    const styleStr = buildShapeStyleString(shape);

    expect(styleStr).toContain("fillColor=#dae8fc");
    expect(styleStr).toContain("strokeColor=#6c8ebf");
  });

  it("includes base style from node type", () => {
    const shape = model.addShape("Service", "svc");
    const styleStr = buildShapeStyleString(shape);

    // svc base style includes rounded=1
    expect(styleStr).toContain("rounded=1");
    expect(styleStr).toContain("whiteSpace=wrap");
    expect(styleStr).toContain("html=1");
  });

  it("includes shape=cylinder3 for db type", () => {
    const shape = model.addShape("MyDB", "db");
    const styleStr = buildShapeStyleString(shape);

    expect(styleStr).toContain("shape=cylinder3");
  });

  it("includes fontColor for dark theme", () => {
    const shape = model.addShape("Dark", "svc", { theme: "dark" });
    const styleStr = buildShapeStyleString(shape);

    expect(styleStr).toContain("fontColor=#e0e0e0");
    expect(styleStr).toContain("fillColor=#1a1a2e");
    expect(styleStr).toContain("strokeColor=#16213e");
  });

  it("appends dashed=1 when style is dashed", () => {
    const shape = model.addShape("Dashed", "box");
    shape.style.dashed = true;
    const styleStr = buildShapeStyleString(shape);

    expect(styleStr).toContain("dashed=1");
  });
});

// ── Edge style generation ───────────────────────────────────

describe("buildEdgeStyleString — edge styles", () => {
  it("generates default orthogonal edge style with rounded corners", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id)!;

    const styleStr = buildEdgeStyleString(edge);

    expect(styleStr).toContain("edgeStyle=orthogonalEdgeStyle");
    expect(styleStr).toContain("rounded=1");
    expect(styleStr).not.toContain("rounded=0");
    expect(styleStr).toContain("orthogonalLoop=1");
    expect(styleStr).toContain("jettySize=auto");
    expect(styleStr).toContain("html=1");
  });

  it("includes dashed=1 for dashed edges", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id, { style: { dashed: true } })!;

    const styleStr = buildEdgeStyleString(edge);
    expect(styleStr).toContain("dashed=1");
  });

  it("includes dashPattern=1 3 for dotted edges", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id, { style: { dashed: true, dotted: true } })!;

    const styleStr = buildEdgeStyleString(edge);
    expect(styleStr).toContain("dashed=1");
    expect(styleStr).toContain("dashPattern=1 3");
  });

  it("does NOT include dashPattern for plain dashed edges", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id, { style: { dashed: true } })!;

    const styleStr = buildEdgeStyleString(edge);
    expect(styleStr).toContain("dashed=1");
    expect(styleStr).not.toContain("dashPattern");
  });

  it("generates open-arrow endArrow style", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id, { targetArrow: "open-arrow" })!;

    const styleStr = buildEdgeStyleString(edge);
    expect(styleStr).toContain("endArrow=open");
    expect(styleStr).toContain("endFill=0");
  });

  it("generates diamond endArrow style", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id, { targetArrow: "diamond" })!;

    const styleStr = buildEdgeStyleString(edge);
    expect(styleStr).toContain("endArrow=diamond");
    expect(styleStr).toContain("endFill=1");
  });

  it("generates crow-foot endArrow style", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id, { targetArrow: "crow-foot" })!;

    const styleStr = buildEdgeStyleString(edge);
    expect(styleStr).toContain("endArrow=ERmany");
    expect(styleStr).toContain("endFill=0");
  });

  it("generates none endArrow style", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id, { targetArrow: "none" })!;

    const styleStr = buildEdgeStyleString(edge);
    expect(styleStr).toContain("endArrow=none");
  });

  it("generates startArrow for source arrow", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id, {
      sourceArrow: "diamond",
      targetArrow: "arrow",
    })!;

    const styleStr = buildEdgeStyleString(edge);
    expect(styleStr).toContain("startArrow=diamond");
    expect(styleStr).toContain("startFill=1");
  });

  it("does not emit endArrow for default arrow type", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id, { targetArrow: "arrow" })!;

    const styleStr = buildEdgeStyleString(edge);
    // Default arrow (classic) should not be explicitly emitted
    expect(styleStr).not.toContain("endArrow=");
  });
});

// ── Multiple pages ──────────────────────────────────────────

describe("serializeDiagram — multiple pages", () => {
  it("serializes multiple pages correctly", () => {
    model.addShape("A", "svc");
    model.addPage("Page-2");
    model.addShape("B", "db");

    const xml = serializeDiagram(model.diagram);

    // Should have 2 <diagram> elements
    const diagramMatches = xml.match(/<diagram /g);
    expect(diagramMatches).not.toBeNull();
    expect(diagramMatches!.length).toBe(2);

    // Each page should have its own mxGraphModel
    const modelMatches = xml.match(/<mxGraphModel /g);
    expect(modelMatches).not.toBeNull();
    expect(modelMatches!.length).toBe(2);

    // Page names
    expect(xml).toContain('name="Page-1"');
    expect(xml).toContain('name="Page-2"');
  });

  it("round-trips multiple pages", () => {
    model.addShape("PageOneShape", "svc");
    model.addPage("Page-2");
    model.addShape("PageTwoShape", "db");

    const xml = serializeDiagram(model.diagram);
    const restored = deserializeDiagram(xml);

    expect(restored.pages).toHaveLength(2);
    expect(restored.pages[0].name).toBe("Page-1");
    expect(restored.pages[1].name).toBe("Page-2");

    // Page 1 has one shape
    expect(restored.pages[0].shapes.size).toBe(1);
    const p1Shape = [...restored.pages[0].shapes.values()][0];
    expect(p1Shape.label).toBe("PageOneShape");

    // Page 2 has one shape
    expect(restored.pages[1].shapes.size).toBe(1);
    const p2Shape = [...restored.pages[1].shapes.values()][0];
    expect(p2Shape.label).toBe("PageTwoShape");
  });
});

// ── Groups serialize as containers ──────────────────────────

describe("serializeDiagram — groups", () => {
  it("serializes groups as container cells", () => {
    const s1 = model.addShape("A", "svc", { at: { x: 100, y: 100 } });
    const s2 = model.addShape("B", "svc", { at: { x: 300, y: 300 } });
    const group = model.createGroup("Backend", [s1.id, s2.id])!;

    const xml = serializeDiagram(model.diagram);

    // Group cell should have container=1 in its style and vertex="1"
    expect(xml).toContain(`id="${group.id}"`);
    expect(xml).toContain('value="Backend"');
    expect(xml).toContain("container=1");

    // Member shapes should have the group as parent
    // The shape cell should reference the group ID as parent
    const s1Match = xml.match(new RegExp(`id="${s1.id}"[^>]*parent="${group.id}"`));
    expect(s1Match).not.toBeNull();
  });

  it("round-trips groups with members", () => {
    const s1 = model.addShape("A", "svc", { at: { x: 100, y: 100 } });
    const s2 = model.addShape("B", "svc", { at: { x: 300, y: 300 } });
    const group = model.createGroup("Backend", [s1.id, s2.id])!;

    const xml = serializeDiagram(model.diagram);
    const restored = deserializeDiagram(xml);
    const page = restored.pages[0];

    // Group is restored
    expect(page.groups.size).toBe(1);
    const restoredGroup = page.groups.get(group.id);
    expect(restoredGroup).toBeDefined();
    expect(restoredGroup!.name).toBe("Backend");
    expect(restoredGroup!.isContainer).toBe(true);

    // Members reference the group
    const restoredS1 = page.shapes.get(s1.id)!;
    const restoredS2 = page.shapes.get(s2.id)!;
    expect(restoredS1.parentGroup).toBe(group.id);
    expect(restoredS2.parentGroup).toBe(group.id);

    // Group has the right members
    expect(restoredGroup!.memberIds.size).toBe(2);
    expect(restoredGroup!.memberIds.has(s1.id)).toBe(true);
    expect(restoredGroup!.memberIds.has(s2.id)).toBe(true);
  });
});

// ── XML entity escaping ─────────────────────────────────────

describe("serializeDiagram — XML escaping", () => {
  it("escapes special characters in labels", () => {
    model.addShape("Auth & User <Service>", "svc");
    const xml = serializeDiagram(model.diagram);

    expect(xml).toContain("Auth &amp; User &lt;Service&gt;");
    expect(xml).not.toContain("Auth & User <Service>");
  });

  it("encodes newlines as &#10; in labels", () => {
    model.addShape("Auth\nService", "svc");
    const xml = serializeDiagram(model.diagram);

    expect(xml).toContain("Auth&#10;Service");
    expect(xml).not.toContain("Auth\nService");
  });
});

// ── Shape type inference ────────────────────────────────────

describe("deserializeDiagram — shape type inference", () => {
  it("infers circle from ellipse style", () => {
    const xml = `<mxfile host="test" modified="2026-01-01" version="0.1.0">
  <diagram id="p1" name="Test">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1">
    <root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      <mxCell id="s1" value="Start" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#dae8fc;" vertex="1" parent="1">
        <mxGeometry x="0" y="0" width="60" height="60" as="geometry"/>
      </mxCell>
    </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    const diagram = deserializeDiagram(xml);
    const shape = diagram.pages[0].shapes.get("s1")!;
    expect(shape.type).toBe("circle");
  });

  it("infers decision from rhombus style", () => {
    const xml = `<mxfile host="test" modified="2026-01-01" version="0.1.0">
  <diagram id="p1" name="Test">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1">
    <root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      <mxCell id="s1" value="Yes/No?" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;" vertex="1" parent="1">
        <mxGeometry x="0" y="0" width="100" height="80" as="geometry"/>
      </mxCell>
    </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    const diagram = deserializeDiagram(xml);
    const shape = diagram.pages[0].shapes.get("s1")!;
    expect(shape.type).toBe("decision");
  });

  it("infers api from hexagon shape", () => {
    const xml = `<mxfile host="test" modified="2026-01-01" version="0.1.0">
  <diagram id="p1" name="Test">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1">
    <root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      <mxCell id="s1" value="Gateway" style="shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fixedSize=1;size=20;fillColor=#dae8fc;" vertex="1" parent="1">
        <mxGeometry x="0" y="0" width="120" height="80" as="geometry"/>
      </mxCell>
    </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    const diagram = deserializeDiagram(xml);
    const shape = diagram.pages[0].shapes.get("s1")!;
    expect(shape.type).toBe("api");
  });

  it("infers box from plain rectangle style", () => {
    const xml = `<mxfile host="test" modified="2026-01-01" version="0.1.0">
  <diagram id="p1" name="Test">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1">
    <root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      <mxCell id="s1" value="Plain" style="whiteSpace=wrap;html=1;fillColor=#f5f5f5;" vertex="1" parent="1">
        <mxGeometry x="0" y="0" width="120" height="60" as="geometry"/>
      </mxCell>
    </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    const diagram = deserializeDiagram(xml);
    const shape = diagram.pages[0].shapes.get("s1")!;
    expect(shape.type).toBe("box");
  });
});

// ── Edge arrow round-trip ───────────────────────────────────

describe("round-trip — edge arrow types", () => {
  it("preserves open-arrow through round-trip", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id, { targetArrow: "open-arrow" })!;

    const xml = serializeDiagram(model.diagram);
    const restored = deserializeDiagram(xml);
    const restoredEdge = restored.pages[0].edges.get(edge.id)!;

    expect(restoredEdge.targetArrow).toBe("open-arrow");
  });

  it("preserves crow-foot through round-trip", () => {
    const s1 = model.addShape("A", "svc");
    const s2 = model.addShape("B", "svc");
    const edge = model.addEdge(s1.id, s2.id, {
      sourceArrow: "crow-foot",
      targetArrow: "diamond",
    })!;

    const xml = serializeDiagram(model.diagram);
    const restored = deserializeDiagram(xml);
    const restoredEdge = restored.pages[0].edges.get(edge.id)!;

    expect(restoredEdge.sourceArrow).toBe("crow-foot");
    expect(restoredEdge.targetArrow).toBe("diamond");
  });
});

describe("round-trip — flowDirection", () => {
  it("persists flowDirection through serialize/deserialize", () => {
    model.addShape("A", "svc");
    model.getActivePage().flowDirection = "LR";

    const xml = serializeDiagram(model.diagram);
    expect(xml).toContain('flowDirection="LR"');

    const restored = deserializeDiagram(xml);
    expect(restored.pages[0].flowDirection).toBe("LR");
  });

  it("omits flowDirection when not set", () => {
    model.addShape("A", "svc");
    const xml = serializeDiagram(model.diagram);
    expect(xml).not.toContain("flowDirection");

    const restored = deserializeDiagram(xml);
    expect(restored.pages[0].flowDirection).toBeUndefined();
  });
});

describe("round-trip — custom types and themes", () => {
  it("persists custom types through serialize/deserialize", () => {
    model.defineCustomType("payment-svc", "svc", { theme: "purple", badge: "PCI" });
    model.addShape("A", "svc");

    const xml = serializeDiagram(model.diagram);
    expect(xml).toContain("fcp-meta");
    expect(xml).toContain("payment-svc");

    const restored = deserializeDiagram(xml);
    expect(restored.customTypes.size).toBe(1);
    const ct = restored.customTypes.get("payment-svc")!;
    expect(ct.base).toBe("svc");
    expect(ct.theme).toBe("purple");
    expect(ct.badge).toBe("PCI");
  });

  it("persists custom themes through serialize/deserialize", () => {
    model.defineCustomTheme("critical", "#f8cecc", "#990000", "#660000");
    model.addShape("A", "svc");

    const xml = serializeDiagram(model.diagram);
    expect(xml).toContain("fcp-meta");

    const restored = deserializeDiagram(xml);
    expect(restored.customThemes.size).toBe(1);
    const theme = restored.customThemes.get("critical")!;
    expect(theme.fill).toBe("#f8cecc");
    expect(theme.stroke).toBe("#990000");
    expect(theme.fontColor).toBe("#660000");
  });

  it("omits fcp-meta when no custom types or themes", () => {
    model.addShape("A", "svc");
    const xml = serializeDiagram(model.diagram);
    expect(xml).not.toContain("fcp-meta");
  });

  it("handles both custom types and themes together", () => {
    model.defineCustomType("k8s-pod", "svc", { theme: "blue", badge: "K8s" });
    model.defineCustomTheme("alert", "#ff0000", "#cc0000");
    model.addShape("A", "svc");

    const xml = serializeDiagram(model.diagram);
    const restored = deserializeDiagram(xml);
    expect(restored.customTypes.size).toBe(1);
    expect(restored.customThemes.size).toBe(1);
    expect(restored.customTypes.get("k8s-pod")!.badge).toBe("K8s");
    expect(restored.customThemes.get("alert")!.fill).toBe("#ff0000");
  });
});
