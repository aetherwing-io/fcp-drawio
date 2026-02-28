#!/usr/bin/env node
import { startServer } from "./server/mcp-server.js";

startServer().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
