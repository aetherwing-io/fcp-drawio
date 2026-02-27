# Visual Snapshot Review Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `snapshot` query to `studio_query` that renders the current diagram to PNG via draw.io CLI and returns it as an MCP image content block for LLM visual review.

**Architecture:** Auto-detect draw.io desktop CLI at server startup. When `studio_query("snapshot")` is called, serialize current diagram to a temp `.drawio` file, shell out to draw.io CLI for PNG export, return base64 image via MCP `image` content type alongside a text summary. Conditionally advertise the feature in the model-map only when CLI is detected.

**Tech Stack:** Node.js `child_process.execFile`, `node:fs`, `node:os`, `node:path`, `node:crypto` for temp file names. MCP SDK `ImageContent` type.

---

### Task 1: Draw.io CLI detection module

**Files:**
- Create: `src/lib/drawio-cli.ts`
- Test: `src/lib/drawio-cli.test.ts`

**Step 1: Write the failing test for CLI detection**

```typescript
// src/lib/drawio-cli.test.ts
import { describe, it, expect, vi } from "vitest";
import { detectDrawioCLI } from "./drawio-cli.js";

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
      expect(result).toMatch(/draw(\.io|io)$/);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/drawio-cli.test.ts`
Expected: FAIL with "Cannot find module ./drawio-cli.js"

**Step 3: Write minimal implementation**

```typescript
// src/lib/drawio-cli.ts
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { platform } from "node:os";

const CANDIDATE_PATHS: Record<string, string[]> = {
  darwin: ["/Applications/draw.io.app/Contents/MacOS/draw.io"],
  linux: ["/usr/bin/drawio", "/snap/bin/drawio", "/usr/local/bin/drawio"],
  win32: [
    "C:\\Program Files\\draw.io\\draw.io.exe",
    `${process.env.LOCALAPPDATA ?? ""}\\draw.io\\draw.io.exe`,
  ],
};

/**
 * Detect draw.io desktop CLI. Returns absolute path or null.
 * Called once at server startup.
 */
export function detectDrawioCLI(): string | null {
  const os = platform();
  const candidates = CANDIDATE_PATHS[os] ?? [];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // Fallback: try PATH lookup
  try {
    const which = os === "win32" ? "where" : "which";
    const result = execFileSync(which, ["drawio"], {
      encoding: "utf-8",
      timeout: 2000,
    }).trim();
    if (result && existsSync(result)) return result;
  } catch {
    // not on PATH
  }

  return null;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/drawio-cli.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/drawio-cli.ts src/lib/drawio-cli.test.ts
git commit -m "feat(snapshot): add draw.io CLI detection"
```

---

### Task 2: Snapshot rendering function

**Files:**
- Modify: `src/lib/drawio-cli.ts`
- Modify: `src/lib/drawio-cli.test.ts`

**Step 1: Write the failing test for renderSnapshot**

```typescript
// Append to src/lib/drawio-cli.test.ts
import { renderSnapshot, detectDrawioCLI } from "./drawio-cli.js";
import { readFileSync } from "node:fs";

describe("renderSnapshot", () => {
  const cliPath = detectDrawioCLI();

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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/drawio-cli.test.ts`
Expected: FAIL with "renderSnapshot is not exported"

**Step 3: Implement renderSnapshot**

Append to `src/lib/drawio-cli.ts`:

```typescript
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export interface SnapshotOptions {
  cliPath: string;
  diagramXml: string;
  width?: number;    // default 1200
  page?: number;     // 1-based, default 1
}

export interface SnapshotResult {
  base64: string;
  mimeType: "image/png";
  width: number;
  sizeBytes: number;
}

/**
 * Render a diagram to PNG via draw.io CLI.
 * Writes temp files, exports, reads result, cleans up.
 */
export async function renderSnapshot(options: SnapshotOptions): Promise<SnapshotResult> {
  const { cliPath, diagramXml, width = 1200, page = 1 } = options;
  const id = randomBytes(6).toString("hex");
  const inputPath = join(tmpdir(), `drawio-snapshot-${id}.drawio`);
  const outputPath = join(tmpdir(), `drawio-snapshot-${id}.png`);

  try {
    writeFileSync(inputPath, diagramXml, "utf-8");

    await new Promise<void>((resolve, reject) => {
      execFile(
        cliPath,
        [
          "--export",
          "--format", "png",
          "--width", String(width),
          "--crop",
          "--border", "10",
          "--page-index", String(page),
          "--output", outputPath,
          inputPath,
        ],
        { timeout: 15_000 },
        (error) => {
          if (error) reject(new Error(`draw.io export failed: ${error.message}`));
          else resolve();
        },
      );
    });

    const pngBuffer = readFileSync(outputPath);
    const base64 = pngBuffer.toString("base64");

    return {
      base64,
      mimeType: "image/png",
      width,
      sizeBytes: pngBuffer.length,
    };
  } finally {
    // Clean up temp files
    try { unlinkSync(inputPath); } catch {}
    try { unlinkSync(outputPath); } catch {}
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/drawio-cli.test.ts`
Expected: PASS (tests that require CLI are skipped on machines without draw.io)

**Step 5: Commit**

```bash
git add src/lib/drawio-cli.ts src/lib/drawio-cli.test.ts
git commit -m "feat(snapshot): add renderSnapshot via draw.io CLI export"
```

---

### Task 3: QueryHandler return type — support image results

**Files:**
- Modify: `src/server/query-handler.ts` (lines 10-31 primarily)
- Modify: `src/server/intent-layer.ts` (line 73-78)

The current `QueryHandler.dispatch()` returns `string`. We need it to return either a string OR a structured result with image data.

**Step 1: Write the failing test**

```typescript
// Append to src/lib/drawio-cli.test.ts or create src/server/snapshot-query.test.ts
import { describe, it, expect } from "vitest";
import { IntentLayer } from "../server/intent-layer.js";

describe("snapshot query integration", () => {
  it("executeQuery returns QueryResult type", () => {
    const intent = new IntentLayer();
    const result = intent.executeQuery("stats");
    // After refactor, result should be a QueryResult
    expect(typeof result === "string" || (typeof result === "object" && result !== null)).toBe(true);
  });
});
```

**Step 2: Run test to verify behavior baseline**

Run: `npx vitest run src/server/snapshot-query.test.ts`
Expected: PASS (current behavior returns string, which passes the loose check)

**Step 3: Add QueryResult type and refactor dispatch**

In `src/server/query-handler.ts`, change the return type:

```typescript
// Add at top of file:
import type { SnapshotResult } from "../lib/drawio-cli.js";

export interface QueryResult {
  text: string;
  image?: SnapshotResult;
}

export class QueryHandler {
  private drawioCliPath: string | null;

  constructor(private model: DiagramModel, drawioCliPath: string | null = null) {
    this.drawioCliPath = drawioCliPath;
  }

  // Change return type from string to string | QueryResult
  dispatch(query: string): string | QueryResult | Promise<QueryResult> {
    // ... existing switch cases return strings (unchanged)
    // Add: case "snapshot": return this.querySnapshot(tokens.slice(1));
  }
}
```

In `src/server/intent-layer.ts`, update `executeQuery`:

```typescript
  // Change return type:
  executeQuery(query: string): string | QueryResult | Promise<QueryResult> {
    try {
      return this.queryHandler.dispatch(query.trim());
    } catch (err: unknown) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
```

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: PASS — existing tests still work since all existing queries still return strings

**Step 5: Commit**

```bash
git add src/server/query-handler.ts src/server/intent-layer.ts
git commit -m "refactor: QueryHandler returns string | QueryResult for image support"
```

---

### Task 4: Implement snapshot query command

**Files:**
- Modify: `src/server/query-handler.ts` (add snapshot case)
- Modify: `src/server/intent-layer.ts` (wire CLI path)
- Test: `src/server/snapshot-query.test.ts`

**Step 1: Write the failing test**

```typescript
// src/server/snapshot-query.test.ts
import { describe, it, expect } from "vitest";
import { detectDrawioCLI } from "../lib/drawio-cli.js";
import { IntentLayer } from "./intent-layer.js";

const cliPath = detectDrawioCLI();

describe("snapshot query", () => {
  it("returns error when no diagram shapes exist", async () => {
    const intent = new IntentLayer();
    const result = intent.executeQuery("snapshot");
    // Empty diagram — should return text error, not attempt render
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
    // Should be a QueryResult object with image
    expect(typeof result).toBe("object");
    const qr = result as { text: string; image?: { base64: string } };
    expect(qr.image).toBeDefined();
    expect(qr.image!.base64.length).toBeGreaterThan(100);
    expect(qr.text).toContain("snapshot:");
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/snapshot-query.test.ts`
Expected: FAIL — IntentLayer doesn't accept options yet, no snapshot case

**Step 3: Wire CLI path into IntentLayer and QueryHandler**

In `src/server/intent-layer.ts`, modify the constructor:

```typescript
export class IntentLayer {
  model: DiagramModel;
  private queryHandler: QueryHandler;
  private sessionHandler: SessionHandler;
  loadedStencilEntries: Map<string, StencilEntry> = new Map();
  readonly drawioCliPath: string | null;

  constructor(options?: { drawioCliPath?: string | null }) {
    this.model = new DiagramModel();
    this.drawioCliPath = options?.drawioCliPath ?? null;
    this.queryHandler = new QueryHandler(this.model, this.drawioCliPath);
    this.sessionHandler = new SessionHandler(this.model);
  }
```

In `src/server/query-handler.ts`, add the snapshot case:

```typescript
import { renderSnapshot } from "../lib/drawio-cli.js";
import type { SnapshotResult } from "../lib/drawio-cli.js";
import { serializeDiagram } from "../serialization/serialize.js";
import { isKeyValue, parseKeyValue } from "../parser/tokenizer.js";

// Inside dispatch switch:
case "snapshot": return this.querySnapshot(tokens.slice(1));

// New method:
private querySnapshot(args: string[]): string | Promise<QueryResult> {
  const page = this.model.getActivePage();
  if (page.shapes.size === 0) {
    return "snapshot: empty diagram — add shapes first";
  }

  if (!this.drawioCliPath) {
    return "snapshot unavailable: draw.io desktop app not found. Install from https://drawio.com for visual review. Use 'map' query for text-based spatial summary.";
  }

  // Parse optional params
  let width = 1200;
  let pageNum = 1;
  for (const arg of args) {
    if (isKeyValue(arg)) {
      const { key, value } = parseKeyValue(arg);
      if (key === "width") width = parseInt(value, 10) || 1200;
      if (key === "page") pageNum = parseInt(value, 10) || 1;
    }
  }

  const xml = serializeDiagram(this.model.diagram);

  return renderSnapshot({
    cliPath: this.drawioCliPath,
    diagramXml: xml,
    width,
    page: pageNum,
  }).then((image) => {
    const pageCount = this.model.diagram.pages.length;
    const shapeCount = page.shapes.size;
    const edgeCount = page.edges.size;
    const groupCount = page.groups.size;
    const sizeKB = Math.round(image.sizeBytes / 1024);
    return {
      text: `snapshot: ${image.width}px ${sizeKB}KB [${shapeCount}s ${edgeCount}e ${groupCount}g p:${pageNum}/${pageCount}]`,
      image,
    } as QueryResult;
  });
}
```

**Step 4: Update executeQuery to handle async**

In `src/server/intent-layer.ts`, update the method signature and body:

```typescript
executeQuery(query: string): string | QueryResult | Promise<QueryResult> {
  try {
    return this.queryHandler.dispatch(query.trim());
  } catch (err: unknown) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
```

**Step 5: Run tests**

Run: `npx vitest run src/server/snapshot-query.test.ts`
Expected: PASS

Run: `npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/server/query-handler.ts src/server/intent-layer.ts src/server/snapshot-query.test.ts
git commit -m "feat(snapshot): implement snapshot query command"
```

---

### Task 5: MCP server — return image content from studio_query

**Files:**
- Modify: `src/server/mcp-server.ts` (lines 150-165)

**Step 1: Write the failing test**

This is an integration-level change. The test verifies the handler resolves image content correctly. We'll add a lightweight test:

```typescript
// Append to src/server/snapshot-query.test.ts
describe("mcp response format", () => {
  it("QueryResult can be converted to MCP content array", () => {
    const qr = {
      text: "snapshot: 1200px 229KB [13s 11e 2g p:1/1]",
      image: { base64: "iVBOR...", mimeType: "image/png" as const, width: 1200, sizeBytes: 229000 },
    };

    // Simulate what mcp-server.ts will do:
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
```

**Step 2: Run test — should pass (pure logic test)**

Run: `npx vitest run src/server/snapshot-query.test.ts`
Expected: PASS

**Step 3: Update mcp-server.ts studio_query handler**

In `src/server/mcp-server.ts`, import the `QueryResult` type and update the handler at lines 159-164:

```typescript
import type { QueryResult } from "./query-handler.js";

// Replace the studio_query handler body (lines 159-164):
async ({ q }) => {
  const result = intent.executeQuery(q);

  // Handle async results (snapshot)
  const resolved = result instanceof Promise ? await result : result;

  // String result — text-only response
  if (typeof resolved === "string") {
    return {
      content: [{ type: "text" as const, text: resolved }],
    };
  }

  // QueryResult with optional image
  const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];
  if (resolved.image) {
    content.push({ type: "image" as const, data: resolved.image.base64, mimeType: resolved.image.mimeType });
  }
  content.push({ type: "text" as const, text: resolved.text });

  return { content };
},
```

**Step 4: Build and verify**

Run: `npm run build`
Expected: Clean compile

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/server/mcp-server.ts
git commit -m "feat(snapshot): return image content from studio_query"
```

---

### Task 6: Auto-detect CLI at server startup

**Files:**
- Modify: `src/server/mcp-server.ts` (lines 6-7)

**Step 1: Wire detection into createServer**

```typescript
import { detectDrawioCLI } from "../lib/drawio-cli.js";

export function createServer(): { server: McpServer; intent: IntentLayer } {
  const drawioCliPath = detectDrawioCLI();
  const intent = new IntentLayer({ drawioCliPath });
  // ... rest unchanged
```

**Step 2: Build and verify**

Run: `npm run build && npx vitest run`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add src/server/mcp-server.ts
git commit -m "feat(snapshot): auto-detect draw.io CLI at server startup"
```

---

### Task 7: Conditional model-map advertising

**Files:**
- Modify: `src/server/model-map.ts` (near line 166)
- Modify: `src/server/intent-layer.ts` (line 92-94)
- Test: `src/server/snapshot-query.test.ts`

**Step 1: Write the failing test**

```typescript
// Append to src/server/snapshot-query.test.ts
import { getModelMap } from "./model-map.js";

describe("model-map snapshot advertising", () => {
  it("shows snapshot in help when CLI detected", () => {
    const help = getModelMap(new Map(), undefined, undefined, true);
    expect(help).toContain("snapshot");
  });

  it("does NOT show snapshot in help when CLI not detected", () => {
    const help = getModelMap(new Map(), undefined, undefined, false);
    expect(help).not.toContain("snapshot");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/snapshot-query.test.ts`
Expected: FAIL — getModelMap doesn't accept the 4th parameter yet

**Step 3: Add snapshotAvailable param to getModelMap**

In `src/server/model-map.ts`, update the function signature at line 166:

```typescript
export function getModelMap(
  customTypes: Map<string, CustomType>,
  customThemes?: Map<string, CustomTheme>,
  loadedStencilPacks?: Set<string>,
  snapshotAvailable?: boolean,
): string {
  let result = MODEL_MAP_BASE;

  // ... existing stencil, theme, custom type sections ...

  // After the STENCILS section (before custom themes), add:
  if (snapshotAvailable) {
    result += `\n\nSNAPSHOT:
  snapshot                           render diagram to PNG for visual review
  snapshot width:800                 custom width (default 1200)
  snapshot page:2                    specific page (1-based)`;
  }

  // ... rest unchanged
```

In `src/server/intent-layer.ts`, update `getHelp()` at line 92:

```typescript
getHelp(): string {
  return getModelMap(
    this.model.diagram.customTypes,
    this.model.diagram.customThemes,
    this.model.diagram.loadedStencilPacks,
    this.drawioCliPath !== null,
  );
}
```

Also update `studio_query` description in `src/server/mcp-server.ts` to mention snapshot:

```typescript
q: z.string().describe(
  "Query: 'map' (spatial summary), 'list', 'list @type:db', 'describe AuthService', 'connections AuthService', 'stats', 'status', 'find Auth', 'diff checkpoint:v1', 'history 5', 'snapshot' (visual render)"
),
```

**Step 4: Run tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/server/model-map.ts src/server/intent-layer.ts src/server/mcp-server.ts src/server/snapshot-query.test.ts
git commit -m "feat(snapshot): conditional model-map advertising"
```

---

### Task 8: End-to-end verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS (existing 438 + new snapshot tests)

**Step 2: Build**

Run: `npm run build`
Expected: Clean compile, no type errors

**Step 3: Manual smoke test**

After restarting MCP server:
1. `studio_query("status")` — verify existing queries still work
2. `studio_help()` — verify SNAPSHOT section appears
3. Create a diagram: `studio(["add svc A", "add db B", "connect A -> B"])`
4. `studio_query("snapshot")` — verify PNG image returned
5. `studio_query("snapshot width:600")` — verify smaller image

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "feat(snapshot): visual snapshot review — complete"
```
