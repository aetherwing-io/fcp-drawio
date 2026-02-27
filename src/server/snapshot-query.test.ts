import { describe, it, expect } from "vitest";
import { detectDrawioCLI } from "../lib/drawio-cli.js";
import { IntentLayer } from "./intent-layer.js";
import { getModelMap } from "./model-map.js";

const cliPath = detectDrawioCLI();

describe("snapshot query", () => {
  it("returns error when no diagram shapes exist", () => {
    const intent = new IntentLayer();
    const result = intent.executeQuery("snapshot");
    expect(typeof result).toBe("string");
    expect(result as string).toContain("empty");
  });

  it("returns error when CLI not available and shapes exist", async () => {
    const intent = new IntentLayer({ drawioCliPath: null });
    await intent.executeOps(["add svc Foo"]);
    const result = intent.executeQuery("snapshot");
    expect(typeof result).toBe("string");
    expect(result as string).toContain("not found");
  });

  it.skipIf(!cliPath)("returns QueryResult with image for valid diagram", async () => {
    const intent = new IntentLayer({ drawioCliPath: cliPath });
    await intent.executeOps(["add svc Foo", "add db Bar"]);
    const result = await intent.executeQuery("snapshot");
    expect(typeof result).toBe("object");
    const qr = result as { text: string; image?: { base64: string } };
    expect(qr.image).toBeDefined();
    expect(qr.image!.base64.length).toBeGreaterThan(100);
    expect(qr.text).toContain("snapshot");
  });

  it.skipIf(!cliPath)("parses width param", async () => {
    const intent = new IntentLayer({ drawioCliPath: cliPath });
    await intent.executeOps(["add svc Foo"]);
    const result = await intent.executeQuery("snapshot width:600");
    expect(typeof result).toBe("object");
    const qr = result as { text: string; image?: { width: number } };
    expect(qr.image!.width).toBe(600);
  });
});

describe("mcp response format", () => {
  it("QueryResult can be converted to MCP content array", () => {
    const qr = {
      text: "snapshot: 1200px 229KB [13s 11e 2g p:1/1]",
      image: { base64: "iVBOR...", mimeType: "image/png" as const, width: 1200, sizeBytes: 229000 },
    };

    const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];
    if (qr.image) {
      content.push({ type: "image", data: qr.image.base64, mimeType: qr.image.mimeType });
    }
    content.push({ type: "text", text: qr.text });

    expect(content).toHaveLength(2);
    expect(content[0].type).toBe("image");
    expect(content[1].type).toBe("text");
  });
});

describe("model-map snapshot advertising", () => {
  it("shows SNAPSHOT section in help when CLI detected", () => {
    const help = getModelMap(new Map(), undefined, undefined, true);
    expect(help).toContain("SNAPSHOT:");
  });

  it("does NOT show SNAPSHOT section in help when CLI not detected", () => {
    const help = getModelMap(new Map(), undefined, undefined, false);
    expect(help).not.toContain("SNAPSHOT:");
  });
});

describe("snapshot multi-page", () => {
  it("returns empty error when requested page has no shapes (not active page)", async () => {
    const intent = new IntentLayer({ drawioCliPath: null });
    // Add shapes to page 1, then add empty page 2
    await intent.executeOps(["add svc Foo"]);
    await intent.executeOps(["page add \"Page2\""]);
    // Switch back to page 1 so active page has shapes
    await intent.executeOps(["page switch \"Page-1\""]);
    // Request snapshot of page 2 (empty) — should get empty error
    const result = intent.executeQuery("snapshot page:2");
    expect(typeof result).toBe("string");
    expect(result as string).toContain("empty");
  });

  it("does NOT return empty error when active page is empty but requested page has shapes", async () => {
    const intent = new IntentLayer({ drawioCliPath: null });
    // Add shapes to page 1
    await intent.executeOps(["add svc Foo"]);
    // Add page 2 (which becomes active and is empty)
    await intent.executeOps(["page add \"Page2\""]);
    // Active page (Page2) is empty, but we request page 1 which has shapes
    // Should NOT get empty error — should get CLI not found instead
    const result = intent.executeQuery("snapshot page:1");
    expect(typeof result).toBe("string");
    expect(result as string).toContain("not found");
  });

  it("returns error for out-of-range page number", async () => {
    const intent = new IntentLayer({ drawioCliPath: null });
    await intent.executeOps(["add svc Foo"]);
    const result = intent.executeQuery("snapshot page:5");
    expect(typeof result).toBe("string");
    expect(result as string).toContain("invalid page 5");
  });

  it.skipIf(!cliPath)("snapshot page:2 renders the second page", async () => {
    const intent = new IntentLayer({ drawioCliPath: cliPath });
    // Page 1: one shape
    await intent.executeOps(["add svc Foo"]);
    // Page 2: different shapes
    await intent.executeOps(["page add \"Page2\""]);
    await intent.executeOps(["add db Bar", "add api Baz"]);

    // Snapshot page 1
    const r1 = await intent.executeQuery("snapshot page:1");
    expect(typeof r1).toBe("object");
    const qr1 = r1 as { text: string; image?: { base64: string } };
    expect(qr1.text).toContain("p:1/2");
    expect(qr1.text).toContain("1s"); // 1 shape on page 1

    // Snapshot page 2
    const r2 = await intent.executeQuery("snapshot page:2");
    expect(typeof r2).toBe("object");
    const qr2 = r2 as { text: string; image?: { base64: string } };
    expect(qr2.text).toContain("p:2/2");
    expect(qr2.text).toContain("2s"); // 2 shapes on page 2
    expect(qr2.image).toBeDefined();
    expect(qr2.image!.base64.length).toBeGreaterThan(100);
  }, 20_000);
});
