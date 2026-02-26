import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { IntentLayer } from "./intent-layer.js";

export function createServer(): { server: McpServer; intent: IntentLayer } {
  const intent = new IntentLayer();

  const server = new McpServer({
    name: "drawio-mcp-studio",
    version: "0.2.0",
  });

  // ── studio — primary mutation tool ──────────────────────
  server.tool(
    "studio",
    `Execute diagram operations. Each op string follows: VERB [TYPE] TARGET [key:value ...]

MODEL MAP:
DRAW.IO STUDIO — MODEL MAP

DOCUMENT: mxfile > diagram[name] > mxGraphModel > root > mxCell[]
  Cells 0,1 always present. Tool manages all XML structure and IDs.

NODE TYPES:
  svc        rounded rectangle (services, components)
  db         cylinder (databases, storage, caches)
  api        hexagon (APIs, gateways, transforms)
  decision   diamond (branches, conditions)
  queue      parallelogram (queues, streams, buffers)
  cloud      cloud (external services, internet)
  actor      person (users, roles, personas)
  doc        document (files, reports, logs)
  box        plain rectangle (generic)
  circle     ellipse (states, events)
  process    double-bordered rect (predefined processes)
  triangle   triangle (warnings, deltas)

THEMES (fill / stroke):
  blue       #dae8fc / #6c8ebf    green    #d5e8d4 / #82b366
  red        #f8cecc / #b85450    yellow   #fff2cc / #d6b656
  orange     #ffe6cc / #d79b00    purple   #e1d5e7 / #9673a6
  gray       #f5f5f5 / #666666    dark     #1a1a2e / #16213e (light text)
  white      #ffffff / #000000

EDGE STYLES: solid, dashed, dotted, animated, thick, curved, orthogonal
ARROWS: -> (directed), <-> (bidirectional), -- (undirected)
ARROW HEADS: arrow, open-arrow, diamond, circle, crow-foot, none

OPERATIONS: add, connect, style, move, resize, swap, label, badge,
            group, ungroup, remove, layout, define, page, layer

SELECTORS: @type:TYPE, @group:NAME, @connected:REF, @recent, @recent:N,
           @all, @orphan, @page:NAME, @layer:NAME

RESPONSE PREFIXES (read-only, tool-generated):
  +  shape created       ~  edge created/modified
  *  shape modified      -  shape/edge removed
  !  group operation     @  layout/position change

CONVENTIONS:
  - Labels are unique identifiers — no ID management needed
  - Position auto-computed if omitted (near last created shape)
  - near:REF dir:DIRECTION places relative to existing shape
  - Themes and types are expanded by the tool into full draw.io styles
  - All XML structure, IDs, and geometry handled by the tool
  - Custom types (via define) are included in studio_help after creation

Examples: 'add svc AuthService theme:blue', 'connect A -> B label:queries'`,
    {
      ops: z.array(z.string()).describe(
        "Array of operation strings. Examples: 'add svc AuthService theme:blue', 'connect A -> B label:queries', 'style A fill:red'"
      ),
    },
    async ({ ops }) => {
      const results = intent.executeOps(ops);
      const lines = results
        .map((r) => {
          if (r.success) return r.message;
          const line = `ERROR: ${r.message}`;
          return r.suggestion ? `${line}\n  try: ${r.suggestion}` : line;
        });
      // Append state digest for drift detection
      lines.push(intent.model.getDigest());
      const text = lines.join("\n");
      const hasErrors = results.some((r) => !r.success);
      return {
        content: [{ type: "text" as const, text }],
        isError: hasErrors,
      };
    },
  );

  // ── studio_query — read-only queries ────────────────────
  server.tool(
    "studio_query",
    "Query diagram state. Returns shape lists, descriptions, stats, or connection info.",
    {
      q: z.string().describe(
        "Query: 'list', 'list @type:db', 'describe AuthService', 'connections AuthService', 'stats', 'status', 'find Auth', 'diff checkpoint:v1', 'history 5'"
      ),
    },
    async ({ q }) => {
      const text = intent.executeQuery(q);
      return {
        content: [{ type: "text" as const, text }],
      };
    },
  );

  // ── studio_session — lifecycle operations ───────────────
  server.tool(
    "studio_session",
    "Diagram lifecycle: create, open, save, export, checkpoint, undo/redo.",
    {
      action: z.string().describe(
        "Action: 'new \"Title\" type:architecture', 'open ./file.drawio', 'save', 'save as:./out.drawio', 'export png path:./out.png', 'checkpoint v1', 'undo', 'undo to:v1', 'redo'"
      ),
    },
    async ({ action }) => {
      const text = intent.executeSession(action);
      const digest = intent.model.getDigest();
      return {
        content: [{ type: "text" as const, text: `${text}\n${digest}` }],
      };
    },
  );

  // ── studio_help — model map reference card ──────────────
  server.tool(
    "studio_help",
    "Returns the model map reference card with any custom types defined in this session. Use after context truncation or when custom types have been defined.",
    {},
    async () => {
      const text = intent.getHelp();
      return {
        content: [{ type: "text" as const, text }],
      };
    },
  );

  return { server, intent };
}

export async function startServer(): Promise<void> {
  const { server } = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
