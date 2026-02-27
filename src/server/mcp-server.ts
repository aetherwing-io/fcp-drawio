import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { IntentLayer } from "./intent-layer.js";
import type { QueryResult } from "./query-handler.js";

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

DRAW.IO STUDIO — MODEL MAP

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

EDGE STYLES: solid, dashed (- - -), dotted (· · ·), animated, thick, curved, orthogonal
ARROWS: -> (directed), <-> (bidirectional), -- (undirected)
ARROW HEADS: arrow, open-arrow, diamond, circle, crow-foot, none

OPERATIONS:

ADD
  add TYPE LABEL [theme:T] [near:REF dir:DIR] [at:X,Y] [size:WxH] [label:"Display Name"]
  Ex: add svc AuthService theme:blue near:Gateway dir:right

CONNECT
  connect SRC ARROW TGT [label:"text"] [style:STYLE] [exit:FACE entry:FACE]
  Ex: connect AuthService -> UserDB label:queries style:dashed

DISCONNECT
  disconnect SRC -> TGT

LABEL
  label REF "new text"              rename shape
  label SRC -> TGT "new text"       relabel edge
  Ex: label Gateway "API Gateway v2"

STYLE
  style REF [fill:#HEX] [stroke:#HEX] [font:#HEX] [fontSize:N]
  style REF [bold] [italic] [underline] [no-bold] [no-italic] [no-underline]
  style REF [font-family:NAME] [align:left|center|right] [valign:top|middle|bottom]
  style @SELECTOR [same params]
  Ex: style AuthService fill:#ff0000 bold fontSize:16
  Ex: style @type:db font-family:Courier align:left

MOVE
  move REF to:X,Y | to:REGION | near:REF dir:DIR
  move @group:NAME to:REGION|X,Y
  Regions: top-left, top-center, top-right, center, bottom-left, bottom-right

RESIZE
  resize REF to:WxH

REMOVE
  remove REF | remove @SELECTOR

SWAP
  swap REF REF (exchange positions)

BADGE
  badge REF "text" [pos:top-left|top-right|bottom-left|bottom-right]

GROUP / UNGROUP
  group REF REF ... as:"Group Name"
  ungroup "Group Name"

LAYOUT
  layout @all algo:layered|force|tree dir:TB|LR|BT|RL [spacing:N]

ORIENT
  orient TB|LR|BT|RL (page flow direction)

DEFINE
  define NAME base:TYPE [theme:T] [badge:"text"] [size:WxH]

LOAD (stencil packs)
  load list                          show available stencil packs
  load PACK                          activate (aws, azure, gcp, k8s, cisco, ibm)

PAGE / LAYER / CHECKPOINT / TITLE
  page add|switch|remove|list "Name"
  layer create|switch|show|hide|list "Name"
  checkpoint NAME (snapshot; undo to:NAME restores)
  title "Diagram Title"

SELECTORS: @type:TYPE, @group:NAME, @connected:REF, @recent, @recent:N,
           @all, @orphan, @page:NAME, @layer:NAME

RESPONSE PREFIXES:
  +  shape created       ~  edge created/modified
  *  shape modified      -  shape/edge removed
  !  group operation     @  layout/position change

CONVENTIONS:
  - Labels are unique identifiers — no ID management needed
  - Position auto-computed if omitted (near last created shape)
  - near:REF dir:DIRECTION places relative to existing shape
  - All XML structure, IDs, and geometry handled by the tool
  - Call studio_help for full reference with examples`,
    {
      ops: z.array(z.string()).describe(
        "Array of operation strings. Examples: 'add svc AuthService theme:blue', 'connect A -> B label:queries', 'style A fill:red'"
      ),
    },
    async ({ ops }) => {
      const results = await intent.executeOps(ops);
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
    "Query diagram state. Returns shape lists, descriptions, spatial map, stats, or connection info.",
    {
      q: z.string().describe(
        "Query: 'map' (spatial summary), 'list', 'list @type:db', 'describe AuthService', 'connections AuthService', 'stats', 'status', 'find Auth', 'diff checkpoint:v1', 'history 5'"
      ),
    },
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
      const qr = resolved as QueryResult;
      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];
      if (qr.image) {
        content.push({ type: "image" as const, data: qr.image.base64, mimeType: qr.image.mimeType });
      }
      content.push({ type: "text" as const, text: qr.text });

      return { content };
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
