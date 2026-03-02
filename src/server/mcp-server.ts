import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createFcpServer } from "@aetherwing/fcp-core";
import { DrawioAdapter } from "../adapter.js";
import { DRAWIO_VERB_SPECS } from "../verb-specs.js";
import { IntentLayer } from "./intent-layer.js";
import { detectDrawioCLI } from "../lib/drawio-cli.js";
import { buildReferenceCardSections } from "./model-map.js";

export function createServer(): { server: McpServer; intent: IntentLayer } {
  const drawioCliPath = detectDrawioCLI();
  const adapter = new DrawioAdapter({ drawioCliPath });
  const intent = adapter.intentLayer;

  const server = createFcpServer<
    import("../model/diagram-model.js").DiagramModel,
    import("../types/index.js").DiagramEvent
  >({
    domain: "drawio",
    adapter,
    verbs: DRAWIO_VERB_SPECS,
    referenceCard: {
      sections: buildReferenceCardSections(),
    },
  });

  return { server, intent };
}

export async function startServer(): Promise<void> {
  const { server } = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
