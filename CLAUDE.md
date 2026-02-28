# fcp-drawio

## Project Overview
MCP server that lets LLMs create/edit draw.io diagrams through intent-level operation strings.
See `docs/` for design documents and specifications.

## Architecture
4-layer architecture:
1. **MCP Server (Intent Layer)** - `src/server/` - Parses op strings, resolves refs, dispatches
2. **Semantic Model (Domain Brain)** - `src/model/` - In-memory entity graph, event sourcing
3. **Layout + Rendering** - Part of model layer for Phase 1 (basic positioning)
4. **Serialization** - `src/serialization/` - Semantic model ↔ mxGraphModel XML

**Implementation Tier**: Tier 3 (no native TypeScript SDK for draw.io). The DiagramModel semantic model + custom XML serializer is the correct pattern for this tier. See `fcp-core/spec/implementation-guide.md`.

## Key Directories
- `src/types/` - Core TypeScript interfaces
- `src/model/` - Semantic model, event sourcing, reference registry
- `src/parser/` - Operation string parser
- `src/serialization/` - XML serialization/deserialization
- `src/server/` - MCP server, tools, intent layer
- `src/lib/` - Component library, themes, type resolver

## Commands
- `npm run build` - Compile TypeScript
- `npm test` - Run tests (vitest)
- `npm run test:watch` - Watch mode
- `npm run dev` - Watch TypeScript compilation

## Conventions
- TypeScript strict mode
- ESM modules (type: "module")
- Tests co-located as `*.test.ts` files
- vitest for testing
- No maxGraph dependency - direct XML generation
