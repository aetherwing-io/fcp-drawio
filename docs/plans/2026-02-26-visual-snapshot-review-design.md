# Visual Snapshot Review

## Problem

After layout, diagrams often have visual issues invisible to algorithmic checks: overlapping labels, cramped spacing, edges crossing through groups, poor aesthetic balance. The LLM has no way to see the rendered result before saving.

## Solution

Add a `snapshot` command to `studio_query` that renders the current diagram to PNG via draw.io's desktop CLI, returning the image inline via MCP's `image` content type. The LLM sees exactly what the user will see and can issue fix-up ops before saving.

## Flow

```
LLM builds diagram -> layout -> studio_query("snapshot")
                                      |
                          save temp .drawio -> draw.io CLI export -> PNG
                                      |
                          return base64 image + text summary
                                      |
                          LLM reviews visually -> issues fixes -> snapshot again
                                      |
                          happy -> save
```

## Detection

At server startup, probe for draw.io CLI in platform-specific locations:

| Platform | Paths checked |
|----------|--------------|
| macOS | `/Applications/draw.io.app/Contents/MacOS/draw.io` |
| Linux | `drawio` on PATH, `/snap/bin/drawio`, flatpak |
| Windows | `C:\Program Files\draw.io\draw.io.exe` |

Store the resolved path (or `null`). Only advertise `snapshot` in the model-map and query help if detected.

## Query Syntax

```
snapshot                    default 1200px wide, current page
snapshot width:800          custom width
snapshot page:2             specific page (1-based)
```

## Response Format

MCP tool response with both image and text content:

```typescript
{
  content: [
    { type: "image", data: base64Png, mimeType: "image/png" },
    { type: "text",  text: "snapshot: 1200x688 [13s 11e 2g p:1/1]" }
  ]
}
```

## Files to Create

### `src/lib/drawio-cli.ts`

Draw.io CLI detection and snapshot rendering.

**`detectDrawioCLI(): string | null`**
- Probe platform-specific paths
- Verify the binary exists and is executable
- Return resolved absolute path, or `null` if not found
- Called once at server startup

**`renderSnapshot(options): Promise<SnapshotResult>`**
- Write current diagram XML to a temp `.drawio` file
- Spawn draw.io CLI: `--export --format png --width WIDTH --crop --border 10 --page-index PAGE`
- Read the output PNG, convert to base64
- Clean up temp files (both `.drawio` input and `.png` output)
- 10 second timeout on subprocess
- Return `{ base64: string, width: number, height: number, sizeBytes: number }`

### `src/lib/drawio-cli.test.ts`

Tests for detection logic, temp file lifecycle, query argument parsing.

## Files to Modify

### `src/server/query-handler.ts`

- Add `case "snapshot"` to the dispatch switch
- Parse optional `width:N` and `page:N` params from tokens
- Call `renderSnapshot()` with serialized diagram XML
- Return a structured result the MCP handler can convert to image content
- The query handler return type needs to change from `string` to support image results

### `src/server/mcp-server.ts`

- Pass draw.io CLI path to IntentLayer / QueryHandler at construction
- Change `studio_query` handler to support non-text content types in the response
- When query result includes image data, return `{ type: "image", data, mimeType }` alongside the text summary

### `src/server/intent-layer.ts`

- Accept draw.io CLI path at construction
- Pass it through to QueryHandler
- Expose `hasSnapshotSupport()` for model-map

### `src/server/model-map.ts`

- Conditionally include `snapshot` in the QUERIES section of the model-map
- Only shown when draw.io CLI was detected at startup

## Key Details

- **Temp file lifecycle**: Write XML to `os.tmpdir()/drawio-snapshot-{random}.drawio`, export to `.png`, read PNG, delete both. All within the query call.
- **Timeout**: 10s on the CLI subprocess (export normally takes ~3s on macOS)
- **Image size**: Default `--width 1200 --crop --border 10`. Produces ~200-300KB PNGs that fit well in LLM context.
- **No draw.io? No noise**: If CLI isn't found, `snapshot` never appears in help. If someone types it anyway, clear error with install link.
- **Page support**: `--page-index` maps to draw.io's 1-based page index. Defaults to the active page.

## Build Order

1. `src/lib/drawio-cli.ts` — detection + rendering
2. `src/server/query-handler.ts` — snapshot query command + return type change
3. `src/server/mcp-server.ts` — image content support in studio_query response
4. `src/server/intent-layer.ts` — wire CLI path through
5. `src/server/model-map.ts` — conditional snapshot in help
6. Tests

## Verification

1. `npm test` — all existing tests pass
2. New tests: CLI detection, snapshot rendering, query parsing, missing CLI fallback
3. Manual: build, restart, `studio_query("snapshot")` returns viewable PNG
