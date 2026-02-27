import { describe, it, expect } from "vitest";
import { detectDrawioCLI } from "../lib/drawio-cli.js";
import { IntentLayer } from "./intent-layer.js";

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
