import { describe, it, expect } from "vitest";
import { detectDrawioCLI, renderSnapshot } from "./drawio-cli.js";

describe("detectDrawioCLI", () => {
  it("returns a string path or null", () => {
    const result = detectDrawioCLI();
    // On CI this may be null; on dev machines with draw.io, a string
    expect(result === null || typeof result === "string").toBe(true);
  });

  it("returned path ends with expected binary name if found", () => {
    const result = detectDrawioCLI();
    if (result !== null) {
      // Should end with draw.io or drawio (platform-dependent)
      expect(result).toMatch(/draw(\.io|io)/);
    }
  });
});

const cliPath = detectDrawioCLI();

describe("renderSnapshot", () => {
  it.skipIf(!cliPath)("renders a minimal diagram to PNG base64", async () => {
    const minimalXml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile>
  <diagram name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="Hello" style="rounded=1;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="200" y="200" width="120" height="60" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    const result = await renderSnapshot({
      cliPath: cliPath!,
      diagramXml: minimalXml,
      width: 800,
    });

    expect(result.base64.length).toBeGreaterThan(100);
    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(800);
  });

  it.skipIf(!cliPath)("respects page parameter", async () => {
    const twoPageXml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile>
  <diagram name="Page-1">
    <mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" value="Page1" style="rounded=1;" vertex="1" parent="1">
        <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
      </mxCell>
    </root></mxGraphModel>
  </diagram>
  <diagram name="Page-2">
    <mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" value="Page2" style="ellipse;" vertex="1" parent="1">
        <mxGeometry x="100" y="100" width="80" height="80" as="geometry"/>
      </mxCell>
    </root></mxGraphModel>
  </diagram>
</mxfile>`;

    const result = await renderSnapshot({
      cliPath: cliPath!,
      diagramXml: twoPageXml,
      page: 2,
    });

    expect(result.base64.length).toBeGreaterThan(100);
  });

  it("rejects with error for invalid CLI path", async () => {
    await expect(
      renderSnapshot({
        cliPath: "/nonexistent/drawio",
        diagramXml: "<mxfile></mxfile>",
      })
    ).rejects.toThrow();
  });
});
