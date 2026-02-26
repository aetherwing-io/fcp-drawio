# drawio-mcp-studio: Design Specification v2

**Version:** 0.2.0-draft
**Date:** 2026-02-25
**Status:** Design / Pre-implementation
**Revision:** Complete redesign of interface layer based on LLM communication research

---

## Table of Contents

1. [Vision](#1-vision)
2. [Problem Statement](#2-problem-statement)
3. [Key Concept: The Codebook Protocol](#3-key-concept-the-codebook-protocol)
4. [Architecture Overview](#4-architecture-overview)
5. [Layer 1: MCP Server (Intent Layer)](#5-layer-1-mcp-server-intent-layer)
6. [Layer 2: Semantic Model (Domain Brain)](#6-layer-2-semantic-model-domain-brain)
7. [Layer 3: Layout and Rendering](#7-layer-3-layout-and-rendering)
8. [Layer 4: Serialization](#8-layer-4-serialization)
9. [The Model Map](#9-the-model-map)
10. [Operation Reference](#10-operation-reference)
11. [Component Library](#11-component-library)
12. [Smart Defaults and Inference](#12-smart-defaults-and-inference)
13. [Error Prevention and Handling](#13-error-prevention-and-handling)
14. [Response Format](#14-response-format)
15. [Technology Stack](#15-technology-stack)
16. [Token Economics](#16-token-economics)
17. [Session Lifecycle](#17-session-lifecycle)
18. [Testing Strategy](#18-testing-strategy)
19. [Implementation Phases](#19-implementation-phases)
20. [Future: The Generalized Domain Brain Pattern](#20-future-the-generalized-domain-brain-pattern)

---

## 1. Vision

A "Domain Brain" MCP tool that lets LLMs create and edit rich, high-fidelity draw.io diagrams through intent-level commands. The LLM never touches XML. Instead, it sends compact operation strings inside a JSON array -- a format that leverages the LLM's existing knowledge of CLI commands, config files, and arrow-based relationship syntax (Mermaid, DOT, etc.).

The core insight: diagram creation involves two fundamentally different skill sets -- **understanding what to draw** (which LLMs excel at) and **knowing how to encode it** (XML/style string minutiae that LLMs waste tokens on and frequently get wrong). drawio-mcp-studio separates these concerns completely. The LLM expresses intent; the tool handles encoding.

### Design Principles

1. **No new language.** The LLM uses syntax patterns already in its training data (CLI commands, key:value pairs, arrow notation). A "model map" establishes the domain vocabulary.
2. **Shared model, compact deltas.** Like chess algebraic notation -- both sides know the board. Operations encode only what changed.
3. **Semantic transparency over compression.** `add svc AuthService theme:blue` beats `+r:Auth[b]`. The SMILES vs IUPAC research (91% fewer errors with meaningful names) guides this.
4. **Template operations, not grammar.** Every operation follows `VERB [TYPE] TARGET [key:value]*`. No grammar to learn, no syntax to remember. Like Redis commands.
5. **The tool is the domain expert.** It handles IDs, XML structure, style strings, positioning, validation. The LLM handles creative decisions.

---

## 2. Problem Statement

### Current State

LLMs generating draw.io diagrams today must either:

1. **Produce raw mxGraphModel XML** -- verbose (~1,150 tokens per edit), error-prone (~42% failure rate on non-trivial edits), and requiring deep knowledge of draw.io's XML schema, style string format, and coordinate system. At scale (5+ pages, 50+ shapes), XML output exceeds context and output limits, causing generation crashes even when the LLM understands the diagram conceptually.

2. **Use existing MCP tools** -- either raw XML pass-through (jgraph/drawio-mcp) or fine-grained CRUD with raw style strings (lgazo/drawio-mcp-server). Neither solves the context bloat or error rate problems.

3. **Use Mermaid as an intermediary** -- limited expressiveness (no manual positioning, limited styling, no multi-page, no round-trip editing of existing files).

### Desired State

An LLM issues operations like:

```json
{"ops": [
  "add svc AuthService theme:blue",
  "add db UserDB theme:green near:AuthService dir:below",
  "connect AuthService -> UserDB label:queries style:dashed"
]}
```

And receives back:

```
+svc AuthService @(120,200 140x60) blue
+db UserDB @(120,340 120x80) green
~AuthService->UserDB "queries" dashed
```

Zero XML knowledge required. Zero serialization errors. ~25 tokens per operation. The tool handles all layout, styling, XML generation, and validation.

### Why This Matters

The failure mode is not the LLM's understanding -- it's the serialization bottleneck. In real-world testing, an LLM successfully maintained a mental model of a 5-page globally distributed pacing architecture (actor hierarchies, cross-page references, complex relationships) but could not emit the XML. The output exceeded limits, partial composition broke referential integrity, and the creative work was lost.

This tool eliminates the serialization bottleneck entirely. The LLM's creative capacity becomes the only limit.

---

## 3. Key Concept: The Codebook Protocol

### The Chess Analogy

Two chess grandmasters can play a game verbally with no board because they share:
- **Initial state**: both know the starting position
- **Rules**: legal moves, captures, check, castling
- **Piece vocabulary**: N=knight, B=bishop, etc.
- **Guarantees**: the game enforces legality; you don't verify each move

Algebraic notation (`Nf3`, `O-O`, `exd5`) is not a language -- it's a compression scheme over a shared mental model. It encodes only the delta.

### The Codebook Protocol

drawio-mcp-studio applies this pattern:

| Chess | drawio-mcp-studio |
|-------|-------------------|
| Both know the board | Both know the XML schema (mxfile/diagram/mxGraphModel/root/mxCell) |
| Both know piece types | Both know node types (svc=rounded rect, db=cylinder, api=hexagon) |
| Both know movement rules | Both know conventions (auto-IDs, auto-positioning, valid XML) |
| Notation encodes only the delta | Operations encode only what changed |
| Ambiguity resolved by context | Ambiguity resolved by label uniqueness + fuzzy matching |
| The game enforces legality | The tool enforces structural validity |

The **model map** (~200 tokens) is the "rules and starting position" -- established once in the tool description, referenced thereafter. Operations are the "moves" -- compact because the shared model carries the rest.

### Research Basis

This design is informed by:

- **Tam et al. (EMNLP 2024)**: Structured format constraints degrade LLM reasoning. JSON hurts more than YAML, which hurts more than free text. Minimize syntactic overhead.
- **MetaGlyph (2026)**: LLMs interpret symbolic shortcuts from training data with 62-81% token reduction. Symbols must be familiar, not novel.
- **Emmetify**: HTML compressed to Emmet abbreviations (training data) achieves ~90% token reduction with no accuracy loss. Compression over shared model, not a new language.
- **SMILES vs IUPAC**: Semantic transparency produces 91% fewer LLM errors than opaque compression. Readable operation strings beat terse symbols.
- **Johnson et al. (2025)**: Natural language tool descriptions beat JSON schemas by +18.4pp accuracy. Minimize format tax.
- **JSON Whisperer (EMNLP 2025)**: LLMs can generate RFC 6902 patches (delta operations) with 31% token reduction. Use stable label-based keys, not positional indices.

### Comparison: Equivalent Operations

**Raw XML (~1,150 tokens):**
```xml
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="auth1" value="AuthService" style="rounded=1;whiteSpace=wrap;html=1;
      fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=12;fontFamily=Helvetica;"
      vertex="1" parent="1">
      <mxGeometry x="120" y="200" width="140" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="db1" value="UserDB" style="shape=cylinder3;whiteSpace=wrap;html=1;
      boundedLbl=1;backgroundOutline=1;size=15;fillColor=#d5e8d4;strokeColor=#82b366;"
      vertex="1" parent="1">
      <mxGeometry x="120" y="340" width="120" height="80" as="geometry"/>
    </mxCell>
    <mxCell id="e1" value="queries" style="edgeStyle=orthogonalEdgeStyle;rounded=0;
      orthogonalLoop=1;jettySize=auto;html=1;" edge="1"
      source="auth1" target="db1" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
```

**Codebook Protocol (~63 tokens):**
```json
{"ops": [
  "add svc AuthService theme:blue",
  "add db UserDB theme:green near:AuthService dir:below",
  "connect AuthService -> UserDB label:queries"
]}
```

**18x token reduction. Zero XML errors possible.**

---

## 4. Architecture Overview

The system is organized into four layers:

```
+------------------------------------------------------------------+
|  LLM (Claude, GPT, etc.)                                        |
|  Sends JSON array of operation strings via MCP tool call         |
+------------------------------------------------------------------+
        |  {"ops": ["add svc AuthService theme:blue", ...]}
        v
+------------------------------------------------------------------+
|  Layer 1: MCP Server (Intent Layer)                              |
|  Parses op strings, validates, resolves references,              |
|  infers defaults, dispatches to semantic model                   |
|  3-4 MCP tools, model map in tool descriptions                   |
+------------------------------------------------------------------+
        |  Resolved commands with concrete IDs, positions, styles
        v
+------------------------------------------------------------------+
|  Layer 2: Semantic Model (Domain Brain)                          |
|  In-memory entity graph: Diagram -> Pages -> Shapes/Edges/Groups |
|  Event-sourced state, reference registry, alias resolution       |
+------------------------------------------------------------------+
        |  Model mutations / queries
        v
+------------------------------------------------------------------+
|  Layer 3: Layout + Rendering                                     |
|  ELK.js for auto-layout (Phase 2)                                |
|  draw.io Desktop CLI for exports (optional)                      |
+------------------------------------------------------------------+
        |  Positioned model / rendered images
        v
+------------------------------------------------------------------+
|  Layer 4: Serialization                                          |
|  Semantic model <-> mxGraphModel XML (bidirectional, lossless)   |
|  Direct XML generation (no maxGraph dependency)                  |
|  Style string generation, compressed content handling            |
+------------------------------------------------------------------+
        |  .drawio XML file / PNG / SVG / PDF
        v
     [ Filesystem ]
```

**Data flow for a typical operation:**

1. LLM sends `{"ops": ["add db UserDB theme:green near:AuthService dir:below"]}` as MCP tool input
2. Intent layer parses: verb=`add`, type=`db`, label=`UserDB`, theme=`green`, near=`AuthService`, dir=`below`
3. Intent layer resolves `AuthService` to internal ID `shape_a3`, resolves `green` to `{fillColor: "#d5e8d4", strokeColor: "#82b366"}`, resolves `db` to cylinder base style, computes position from AuthService's bounds + 60px gap below
4. Semantic model creates a new Shape entity, appends a `ShapeCreated` event
5. Response: `+db UserDB @(120,340 120x80) green`

---

## 5. Layer 1: MCP Server (Intent Layer)

### Responsibility

Expose MCP tools that accept operation strings, parse them, validate references, infer defaults, and dispatch to the semantic model. Manage the model map and tiered response strategy.

### MCP Tools

The server exposes 3-4 tools, following the "Six-Tool Pattern" research recommendation:

**`studio`** -- The primary tool. Accepts an array of operation strings.

```json
{
  "name": "studio",
  "description": "Execute diagram operations. Each string is one operation: VERB [TYPE] TARGET [key:value ...]. See model map in system instructions for node types, themes, and conventions.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "ops": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Array of operation strings. Examples: 'add svc AuthService theme:blue', 'connect A -> B label:queries', 'style A fill:red'"
      }
    },
    "required": ["ops"]
  }
}
```

**`studio_query`** -- Read-only queries. Separated to allow the LLM to distinguish read vs write operations.

```json
{
  "name": "studio_query",
  "description": "Query diagram state. Returns shape lists, descriptions, stats, or connection info.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "q": {
        "type": "string",
        "description": "Query: 'list', 'list @type:db', 'describe AuthService', 'connections AuthService', 'stats', 'status', 'find Auth', 'diff checkpoint:v1', 'history 5'"
      }
    },
    "required": ["q"]
  }
}
```

**`studio_session`** -- Lifecycle and file operations.

```json
{
  "name": "studio_session",
  "description": "Diagram lifecycle: create, open, save, export, checkpoint, undo/redo.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "description": "Action: 'new \"Title\" type:architecture', 'open ./file.drawio', 'save', 'save as:./out.drawio', 'export png path:./out.png', 'checkpoint v1', 'undo', 'undo to:v1', 'redo'"
      }
    },
    "required": ["action"]
  }
}
```

**`studio_help`** -- Returns the model map reference card (~200 tokens). **Dynamic**: if custom types have been defined via `define`, they are appended to the NODE TYPES section. This ensures the LLM can rediscover custom types after context truncation.

### Operation String Parsing

Each operation string follows a fixed template pattern. There is no grammar or parser generator. Parsing is trivial string splitting:

```typescript
function parseOp(op: string): ParsedOp {
  // 1. Tokenize: split by whitespace, respecting quoted strings
  // 2. First token is the verb (add, connect, style, move, etc.)
  // 3. Verb determines how to parse remaining tokens:
  //    - "add":     TYPE LABEL [key:value]*
  //    - "connect": REF ARROW REF [ARROW REF]* [key:value]*
  //    - "style":   REF [key:value]*
  //    - "group":   REF [REF]* as:NAME
  //    - etc.
  // 4. key:value pairs are always trailing, order-independent
}
```

Parsing rules:
- Whitespace separates tokens
- Quoted strings (`"multi word label"`) are single tokens
- `key:value` pairs are identified by the `:` separator
- Arrow tokens (`->`, `<->`, `--`) are identified literally
- Selectors start with `@` (`@type:db`, `@group:Backend`, `@recent`)
- Everything else is a label reference

No grammar, no AST, no backtracking. Split, match verb, extract key:values.

### Reference Resolution

When the LLM refers to a shape (e.g., `AuthService`, `"User Database"`, `@recent`), the intent layer resolves it:

1. **Exact label match** (case-sensitive)
2. **Case-insensitive match** -- `authservice` matches `AuthService`
3. **Normalized match** -- strip hyphens, underscores, spaces: `user_db` matches `UserDB`
4. **Prefix match** -- `Auth` matches `AuthService` if unambiguous
5. **Recency match** -- `@recent` resolves to the most recently created/modified shape
6. **Type-qualified match** -- `db:UserDB` disambiguates when multiple shapes share a label
7. **Scope-qualified match** -- `Backend/AuthService` disambiguates by group
8. **Disambiguation response** -- if multiple candidates remain, return all matches and ask

The resolution cascade short-circuits at the first level that produces exactly one match.

### Selector Resolution

Selectors match zero or more shapes. They are used anywhere a reference is accepted.

| Selector | Matches |
|----------|---------|
| `@type:TYPE` | All shapes of the given type on current page |
| `@group:NAME` | All shapes in the named group |
| `@connected:REF` | All shapes connected to the referenced shape |
| `@page:NAME` | All shapes on the named page |
| `@layer:NAME` | All shapes on the named layer |
| `@recent` | The most recently created/modified shape |
| `@recent:N` | The last N created/modified shapes |
| `@all` | Every shape on the current page |
| `@orphan` | Shapes with no incoming or outgoing edges |

**Phase 2 selectors:** `@label:/regex/`, `@style:prop=value`

---

## 6. Layer 2: Semantic Model (Domain Brain)

### Responsibility

Maintain an in-memory entity graph representing the diagram's logical structure. Provide event-sourced state management with checkpoint-based undo. Manage the component library, theme resolution, and reference registry.

### Entity Graph

```
Diagram
  +-- pages: Page[]
        +-- shapes: Shape[]
        +-- edges: Edge[]
        +-- groups: Group[]
        +-- layers: Layer[]
```

#### Core Entities

```typescript
interface Diagram {
  id: string;
  title: string;
  filePath: string | null;
  pages: Page[];
  activePage: string;           // page ID
  theme: Theme;
  customTypes: Map<string, CustomType>; // user-defined node types
  metadata: DiagramMetadata;
}

interface Page {
  id: string;
  name: string;
  shapes: Map<string, Shape>;
  edges: Map<string, Edge>;
  groups: Map<string, Group>;
  layers: Layer[];
  defaultLayer: string;
}

interface Shape {
  id: string;
  label: string;
  type: ShapeType;              // "svc", "db", "api", "decision", etc.
  bounds: Bounds;               // { x, y, width, height }
  style: StyleSet;
  parentGroup: string | null;
  layer: string;
  metadata: ShapeMetadata;      // tooltips, badges, custom data
  createdAt: number;
  modifiedAt: number;
}

interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
  label: string | null;
  style: EdgeStyleSet;
  waypoints: Point[];
  sourceArrow: ArrowType;
  targetArrow: ArrowType;
  createdAt: number;
  modifiedAt: number;
}

interface Group {
  id: string;
  name: string;
  memberIds: Set<string>;
  isContainer: boolean;         // draw.io container vs logical group
  collapsed: boolean;
  bounds: Bounds;               // computed bounding box
  style: StyleSet;
}

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  order: number;
}

interface Bounds { x: number; y: number; width: number; height: number; }
interface Point { x: number; y: number; }
```

#### Style Types

```typescript
interface StyleSet {
  fillColor: string | null;
  strokeColor: string | null;
  fontColor: string | null;
  fontSize: number | null;
  fontFamily: string | null;
  fontStyle: number | null;     // bitmask: 1=bold, 2=italic, 4=underline
  rounded: boolean;
  dashed: boolean;
  shadow: boolean;
  opacity: number;              // 0-100
  [key: string]: any;           // extensible for draw.io-specific props
}

interface EdgeStyleSet extends StyleSet {
  edgeStyle: string;
  curved: boolean;
  flowAnimation: boolean;
}
```

### Event Sourcing

All mutations are recorded as events:

```typescript
type DiagramEvent =
  | { type: "shape_created"; shape: Shape }
  | { type: "shape_modified"; id: string; before: Partial<Shape>; after: Partial<Shape> }
  | { type: "shape_deleted"; shape: Shape }
  | { type: "edge_created"; edge: Edge }
  | { type: "edge_modified"; id: string; before: Partial<Edge>; after: Partial<Edge> }
  | { type: "edge_deleted"; edge: Edge }
  | { type: "group_created"; group: Group }
  | { type: "group_modified"; id: string; before: Partial<Group>; after: Partial<Group> }
  | { type: "group_dissolved"; group: Group }
  | { type: "page_added"; page: Page }
  | { type: "page_removed"; page: Page }
  | { type: "theme_changed"; before: Theme; after: Theme }
  | { type: "checkpoint"; name: string; eventIndex: number };

interface EventLog {
  events: DiagramEvent[];
  cursor: number;               // current position (for undo/redo)
  checkpoints: Map<string, number>;
}
```

**Undo** reverses events backward from cursor. **Redo** replays forward. **Checkpoint** records cursor position under a name.

### Theme and Style Resolver

Semantic theme names resolve to concrete draw.io style values:

```typescript
const THEMES: Record<string, { fill: string; stroke: string; fontColor?: string }> = {
  blue:    { fill: "#dae8fc", stroke: "#6c8ebf" },
  green:   { fill: "#d5e8d4", stroke: "#82b366" },
  red:     { fill: "#f8cecc", stroke: "#b85450" },
  yellow:  { fill: "#fff2cc", stroke: "#d6b656" },
  orange:  { fill: "#ffe6cc", stroke: "#d79b00" },
  purple:  { fill: "#e1d5e7", stroke: "#9673a6" },
  gray:    { fill: "#f5f5f5", stroke: "#666666" },
  dark:    { fill: "#1a1a2e", stroke: "#16213e", fontColor: "#e0e0e0" },
  white:   { fill: "#ffffff", stroke: "#000000" },
};
```

### Reference Registry

Maintains multiple indices for fast shape lookup:

```typescript
class ReferenceRegistry {
  private byId: Map<string, Shape>;
  private byLabel: Map<string, Shape[]>;
  private byLabelNormalized: Map<string, Shape[]>;
  private byType: Map<ShapeType, Shape[]>;
  private byGroup: Map<string, Shape[]>;
  private byLayer: Map<string, Shape[]>;
  private recentOrder: Shape[];
}
```

Rebuilt from the semantic model on mutation. (Incremental index maintenance deferred to Phase 2 for large diagrams.)

---

## 7. Layer 3: Layout and Rendering

### Layout: Basic Positioning (Phase 1)

Phase 1 uses simple relative positioning without a layout engine:

| Position specification | Behavior |
|----------------------|----------|
| No position specified | Place near the most recently created shape |
| `near:REF dir:below` | 60px below REF, horizontally centered |
| `near:REF dir:right` | 60px right of REF, vertically centered |
| `near:REF dir:above-left` | 60px above and left of REF |
| `at:X,Y` | Absolute coordinates |
| Batch (`count:4`) | Arrange in a row to the right |

The `near` system uses shape bounding boxes plus a configurable gap (default 60px) to compute positions. The tool chooses the least crowded side when no direction is specified.

### Layout: ELK.js Integration (Phase 2)

ELK.js provides automatic graph layout:

| Algorithm | Use Case | Operation |
|-----------|----------|-----------|
| Layered (Sugiyama) | Flowcharts, pipelines, DAGs | `layout @all algo:dagre dir:TB` |
| Force-directed | Network diagrams, organic | `layout @all algo:force` |
| Tree | Hierarchies, org charts | `layout @all algo:tree` |

ELK.js runs natively in Node.js with no DOM requirement. Input: graph JSON with node dimensions. Output: graph JSON with computed x,y positions. The tool translates between the semantic model and ELK's format.

**Note:** ELK.js does not support incremental layout (full recompute each time). For incremental behavior, the tool pins existing shape positions and only feeds new shapes to the engine.

### Rendering: draw.io Desktop CLI (Optional)

draw.io Desktop includes a headless export CLI:

```bash
drawio --export --format png --output diagram.png diagram.drawio
drawio --export --format svg --crop --output diagram.svg diagram.drawio
drawio --export --format png --page-index 0 --scale 2 diagram.drawio
```

Rendering is **not a hard dependency**. The tool works fully without it -- the LLM creates diagrams and opens them in draw.io directly. When available, rendering enables screenshot-based visual verification.

Region rendering: for `screenshot @group:Backend`, compute the group's bounding box, export the page, crop to the region with padding.

---

## 8. Layer 4: Serialization

### Responsibility

Convert between the semantic model and draw.io's mxGraphModel XML format. Bidirectional, lossless round-tripping. Direct XML generation -- no maxGraph dependency.

### Why Direct XML Generation

The research evaluated three options:

| Option | Verdict |
|--------|---------|
| maxGraph library | **Rejected.** Requires DOM (jsdom), SVG APIs throw errors in Node.js, pre-1.0 with ~2 maintainers |
| drawpyo (Python) | **Rejected.** Python subprocess dependency, limited features |
| Direct XML generation | **Selected.** Format is simple and stable since 2005. Full control, zero dependencies. |

The draw.io XML format is a flat list of `<mxCell>` elements. A few hundred lines of TypeScript template code covers all supported features.

### Compressed Content Handling

draw.io Desktop saves files with compressed diagram content by default:

```xml
<!-- Compressed (default from draw.io Desktop) -->
<diagram id="abc" name="Page-1">
  7V1Zc6M4EP41... <!-- base64(deflate(mxGraphModel XML)) -->
</diagram>

<!-- Uncompressed (what we generate) -->
<diagram id="abc" name="Page-1">
  <mxGraphModel dx="1422" dy="762" ...>
    <root>
      <mxCell id="0"/>
      ...
    </root>
  </mxGraphModel>
</diagram>
```

The `open` command handles both forms (detect, decompress if needed). The `save` command **always writes uncompressed XML** -- it's Git-friendly (diffable), human-readable, and draw.io opens both forms.

### mxGraphModel XML Structure

```xml
<mxfile host="drawio-mcp-studio" modified="2026-02-25T..." version="0.2.0">
  <diagram id="page1" name="System Overview">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1">
      <root>
        <mxCell id="0"/>                              <!-- root cell -->
        <mxCell id="1" parent="0"/>                   <!-- default layer -->
        <mxCell id="s1" value="AuthService"           <!-- shape -->
          style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;"
          vertex="1" parent="1">
          <mxGeometry x="120" y="200" width="140" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="e1" value="queries"               <!-- edge -->
          style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;"
          edge="1" source="s1" target="s2" parent="1">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

### Semantic Model to XML

```typescript
function serializeDiagram(diagram: Diagram): string {
  // 1. Generate mxfile wrapper with host, modified, version
  // 2. For each page:
  //    a. Create <diagram> element with id and name
  //    b. Create <mxGraphModel> with canvas settings
  //    c. Create <root> with foundation cells (id="0", id="1")
  //    d. For each layer: create parent mxCell
  //    e. For each group (if isContainer): create container mxCell
  //    f. For each shape: create vertex mxCell with geometry + style string
  //    g. For each edge: create edge mxCell with geometry + waypoints + style string
  // 3. Return formatted XML (uncompressed)
}
```

### XML to Semantic Model

When opening an existing .drawio file:

1. Parse XML
2. Detect and decompress if content is base64/deflate encoded
3. Extract `<diagram>` elements (one per page)
4. Walk `<root>` children:
   - `id="0"` → root cell (skip)
   - `id="1"` or cells with `parent="0"` → layers
   - Cells with `vertex="1"` containing child `vertex="1"` cells → containers/groups
   - Cells with `vertex="1"` → shapes
   - Cells with `edge="1"` → edges
5. Parse style strings into semantic StyleSet
6. Rebuild entity graph, reference registry, and indices

### Round-trip Guarantee

Unknown draw.io properties are preserved as opaque key-value pairs in the StyleSet's extensible `[key: string]: any` bucket. Opening a complex file from the GUI, editing via studio operations, and saving back does not lose information.

### Validation

| Check | Action on Failure |
|-------|-------------------|
| Edge source/target IDs exist | Remove orphaned edges, warn |
| No duplicate IDs | Assert (tool-assigned, should never happen) |
| Group member IDs exist | Remove missing members, warn |
| Foundation cells present | Auto-create if missing |
| Page has at least one layer | Auto-create default layer |
| Shape bounds non-negative | Clamp to minimum 20x20 |

---

## 9. The Model Map

The model map is the "shared understanding" between LLM and tool. It is returned by `studio_help` and included in the tool descriptions. Target: ~200 tokens.

```
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
```

---

## 10. Operation Reference

### Operation String Format

Every operation string follows a fixed template:

```
VERB [TYPE] TARGET [key:value ...]
```

- **VERB**: First token. Determines how to parse the rest.
- **TYPE**: For `add` operations, the node type from the model map.
- **TARGET**: Label reference, selector, or quoted string.
- **key:value pairs**: Trailing, order-independent. Values with spaces use quotes: `label:"POST /auth"`.

### Shape Operations

**`add` -- Create a shape**

```
add TYPE LABEL [theme:THEME] [near:REF] [dir:DIRECTION] [at:X,Y] [in:GROUP] [size:WxH] [count:N]
```

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| TYPE | Yes | -- | Node type from model map (svc, db, api, etc.) |
| LABEL | Yes | -- | Unique label. Quotes for spaces: `"Auth Service"` |
| theme | No | blue | Color theme from model map |
| near | No | @recent | Reference shape for positioning |
| dir | No | auto | above, below, left, right, above-left, above-right, below-left, below-right |
| at | No | auto | Absolute position: `at:100,200` |
| in | No | none | Parent group: `in:Backend` |
| size | No | type default | Dimensions: `size:150x80` |
| count | No | 1 | Batch create: `count:4` → Label1, Label2, Label3, Label4 |

**Examples:**
```
add svc AuthService theme:blue
add db UserDB theme:green near:AuthService dir:below
add decision "Is Valid?" theme:yellow near:AuthService dir:right
add svc Worker theme:gray in:Backend count:3
add api Gateway theme:orange at:200,50
add cloud CDN theme:gray near:Gateway dir:right
```

**`remove` -- Delete a shape or edge**

```
remove REF
```

Removing a shape also removes all connected edges.

**`define` -- Register a custom node type**

```
define NAME base:TYPE [theme:THEME] [badge:TEXT] [size:WxH]
```

**Examples:**
```
define payment-svc base:svc theme:purple badge:PCI
define kafka-topic base:queue theme:orange
define aws-ec2 base:box theme:orange badge:EC2 size:60x60
```

After definition: `add payment-svc OrderPayment near:OrderService dir:right`

### Connection Operations

**`connect` -- Create edges**

```
connect REF ARROW REF [ARROW REF]* [label:TEXT] [style:STYLE] [source-arrow:TYPE] [target-arrow:TYPE]
```

Arrow operators:

| Operator | Meaning |
|----------|---------|
| `->` | Directed edge (source to target) |
| `<->` | Bidirectional edge |
| `--` | Undirected edge (no arrows) |

Edge styles: `solid`, `dashed`, `dotted`, `animated`, `thick`, `curved`, `orthogonal`

Arrow head types: `arrow`, `open-arrow`, `diamond`, `circle`, `crow-foot`, `none`

**Examples:**
```
connect AuthService -> UserDB
connect AuthService -> UserDB label:queries style:dashed
connect A -> B -> C -> D
connect Client <-> Server label:WebSocket
connect Service -- Service label:"same process"
connect AuthService -> UserDB source-arrow:none target-arrow:crow-foot
connect Gateway -> @group:Backend
```

**`disconnect` -- Remove an edge**

```
disconnect REF -> REF
```

### Style Operations

**`style` -- Set style properties**

```
style REF [key:value]*
```

Style properties: `fill:COLOR`, `stroke:COLOR`, `font-color:COLOR`, `font-size:N`, `opacity:N`, `rounded:BOOL`, `dashed:BOOL`, `shadow:BOOL`

Colors can be theme names or hex: `fill:blue`, `fill:#aabbcc`

**Examples:**
```
style AuthService fill:red stroke:darkred font-size:14
style @type:db fill:green stroke:#2e7d32
style @group:Backend shadow:true
```

**`label` -- Set or update label text**

```
label REF "new text"
```

**`badge` -- Add indicator badge**

```
badge REF "text" [pos:POSITION]
```

Positions: `top-left`, `top-right`, `bottom-left`, `bottom-right`

### Layout Operations

**`move` -- Reposition a shape**

```
move REF to:X,Y
move REF near:OTHER dir:DIRECTION
```

**`resize` -- Change dimensions**

```
resize REF to:WxH
```

**`swap` -- Exchange positions**

```
swap REF REF
```

**`layout` -- Auto-layout (Phase 2: ELK.js)**

```
layout REF algo:ALGO [dir:DIRECTION] [spacing:N]
```

Algorithms: `dagre`, `force`, `tree`
Directions: `TB`, `BT`, `LR`, `RL`

**`align` -- Align shapes**

```
align REF edge:EDGE
```

Edges: `top`, `bottom`, `left`, `right`, `center`

**`distribute` -- Space evenly**

```
distribute REF dir:DIRECTION
```

### Organization Operations

**`group` -- Group shapes**

```
group REF [REF]* as:NAME
```

**`ungroup` -- Dissolve a group**

```
ungroup REF
```

**`layer` -- Layer management**

```
layer create NAME
layer move REF to:LAYER
layer show NAME
layer hide NAME
```

### Page Operations

```
page add "Page Name"
page switch "Page Name"
page remove "Page Name"
page duplicate "Page Name"
```

### Session Operations (via `studio_session` tool)

```
new "Diagram Title" [type:TYPE]
open ./path/to/file.drawio
save
save as:./path/to/output.drawio
checkpoint NAME
undo
undo to:CHECKPOINT
redo
export FORMAT [path:PATH] [scale:N]
screenshot [REF] [padding:N]
preview
```

Diagram type hints: `architecture`, `flowchart`, `sequence`, `er`, `network`, `uml`

### Query Operations (via `studio_query` tool)

```
list                          # all shapes on current page
list @type:db                 # filtered by selector
describe AuthService          # full details of one shape
connections AuthService       # all edges to/from shape
stats                         # summary counts
status                        # full diagram state (~200 tokens)
find "Auth"                   # fuzzy search by label
diff checkpoint:v1            # changes since checkpoint
history 5                     # last 5 operations
```

---

## 11. Component Library

### Built-in Node Types

These are the types available in the model map via their shorthand names.

#### Basic Shapes

| Shorthand | draw.io Shape | Default Size | Typical Use |
|-----------|--------------|-------------|-------------|
| `box` | rectangle | 120x60 | Generic blocks |
| `svc` | rounded rectangle | 140x60 | Services, components |
| `circle` | ellipse (1:1) | 60x60 | States, events |
| `decision` | rhombus | 100x80 | Decisions, conditions |
| `db` | cylinder3 | 120x80 | Databases, storage |
| `api` | hexagon | 120x80 | APIs, gateways |
| `cloud` | cloud | 140x60 | External services |
| `actor` | person shape | 40x60 | Users, personas |
| `doc` | document shape | 120x80 | Files, reports |
| `queue` | parallelogram | 140x60 | Queues, streams |
| `triangle` | triangle | 80x80 | Warnings, deltas |
| `process` | double-bordered rect | 120x60 | Predefined processes |

#### Flowchart Presets (Phase 2)

| Shorthand | Description |
|-----------|-------------|
| `terminal` | Rounded rectangle, green, bold |
| `io` | Parallelogram, gray |
| `predefined` | Double-bordered rect, blue |

#### Cloud Provider Icons (Phase 3)

| Prefix | Examples |
|--------|---------|
| `aws-` | `aws-ec2`, `aws-s3`, `aws-lambda`, `aws-rds`, `aws-sqs`, `aws-sns` |
| `azure-` | `azure-vm`, `azure-blob`, `azure-functions`, `azure-cosmos-db` |
| `gcp-` | `gcp-compute`, `gcp-storage`, `gcp-cloud-functions`, `gcp-bigquery` |
| `k8s-` | `k8s-pod`, `k8s-deployment`, `k8s-service`, `k8s-ingress` |

Cloud provider icons are implemented via the `define` mechanism with embedded SVG/PNG icons from official icon sets.

### Custom Type Registration

Users define custom types using the `define` operation:

```
define payment-svc base:svc theme:purple badge:PCI
define kafka-topic base:queue theme:orange
define cache base:db theme:red badge:TTL
```

Custom types are session-scoped. Future: persist to a component library file.

---

## 12. Smart Defaults and Inference

### Type Inference from Labels

When a shape is created with the generic `box` type or no explicit type, the tool infers the type from the label using word-boundary matching:

| Pattern (word boundary) | Inferred Type |
|------------------------|---------------|
| Contains "database", "DB", "store", "cache", "redis", "postgres", "mysql", "mongo" | `db` |
| Contains "decision", "check", "condition", or ends with "?" | `decision` |
| Contains "user", "actor", "person", "customer", "admin" | `actor` |
| Contains "queue", "buffer", "stream", "kafka", "sqs", "event" | `queue` |
| Contains "cloud", "external", "internet", "cdn" | `cloud` |
| Contains "document", "file", "log", "report" | `doc` |

If no pattern matches, default type is `svc` (rounded rectangle).

### Position Inference

| Situation | Default Behavior |
|-----------|-----------------|
| First shape on empty page | Place at (200, 200) |
| Shape added with no position | Place near most recently created shape, below if vertical flow or right if horizontal |
| `near:X` with no direction | Place on least crowded side of X |
| `in:GROUP` | Place inside group's bounding box, auto-expand if needed |
| Batch (`count:4`) | Arrange in a row to the right |

### Edge Inference

| Situation | Default Behavior |
|-----------|-----------------|
| Edge with no style | Solid, orthogonal, arrow at target |
| Multiple edges between same pair | Offset parallel edges |
| Edge to a selector (`@group:X`) | Create edges to all matching shapes |

### Size Inference

Shape sizes based on label text length: short labels get minimum size, longer labels auto-expand width. Minimum sizes per type are defined in the component library.

---

## 13. Error Prevention and Handling

### Errors Prevented by Construction

| Error Class | How Prevented |
|-------------|--------------|
| Orphaned edge references | Both endpoints must resolve before edge creation |
| Duplicate IDs | IDs are tool-assigned (never user-specified) |
| Malformed style strings | Themes and types are expanded by the serializer |
| Missing foundation cells | Serializer always emits cells 0 and 1 |
| Invalid XML structure | LLM never touches XML |
| Invalid geometry | Bounds computed by tool, clamped to minimums |

### Errors Still Possible

| Error | Response |
|-------|----------|
| Typo in reference | `error: unknown ref "AthService". did you mean "AuthService"?` |
| Ambiguous reference | `error: "Service" matches 3: AuthService, UserService, PaymentService. qualify with type (e.g., db:UserDB) or group (Backend/AuthService)` |
| Self-reference in group | `error: cannot add Backend to Backend (circular)` |
| Wrong page | `error: AuthService is on "System Overview", not current page` |
| Empty selector | `warn: @type:api matched 0 shapes (page has: 5 svc, 3 db, 2 decision)` |
| File not found | `error: file not found: ./nonexistent.drawio` |

### Error Response Format

```
error: <concise description>
  > <original operation string>
  <suggestion or available options>
```

Warnings are non-fatal and accompany the success result:

```
+svc Service1 @(120,200) blue
+svc Service2 @(260,200) blue
  warn: label "Service" already exists, auto-suffixed
```

---

## 14. Response Format

Responses are tiered by information density.

### Tier 1: Confirmations (~20-30 tokens per op)

For mutations (add, connect, style, move):

```
+svc AuthService @(120,200 140x60) blue
+db UserDB @(120,340 120x80) green
~AuthService->UserDB "queries" dashed
```

Prefix convention (tool-generated, read-only):
- `+` shape created
- `~` edge created/modified
- `*` shape modified
- `-` shape/edge removed
- `!` group operation
- `@` layout/position change

### Tier 2: Topology Changes (~80-120 tokens)

For connections (includes adjacency summary):

```
~AuthService->UserDB "queries"
  AuthService: out[UserDB, TokenCache] in[Gateway]
  UserDB: out[] in[AuthService, AdminPanel]
```

### Tier 3: Queries (~200-400 tokens)

For list, describe, stats, status:

```
status: "System Architecture" (unsaved, 23 ops, 2 checkpoints)
  page: System Overview (12 shapes, 15 edges, 3 groups)
    Backend: AuthService(svc), UserDB(db), TokenCache(db)
    Frontend: LoginPage(box), Dashboard(box), NavBar(box)
    External: Gateway(api), CDN(cloud)
    Ungrouped: ErrorPage(box), HealthCheck(decision)
  checkpoints: "initial" @op:5, "before-refactor" @op:18
```

### Tier 4: Screenshots (~1,600-4,000 tokens)

For screenshot/preview/export: PNG image as base64 + text summary.

---

## 15. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| MCP Server | TypeScript + `@modelcontextprotocol/sdk` | MCP SDK is mature in TS; draw.io ecosystem is JS/TS |
| Op String Parsing | TypeScript (string splitting + pattern matching) | No grammar, no parser generator needed. Split by whitespace, match verbs, extract key:value pairs |
| XML Generation | Direct TypeScript string templates | Format is stable since 2005. Zero dependencies. Full control. |
| XML Parsing | `fast-xml-parser` | Lightweight, fast, handles draw.io XML well |
| Layout Engine | ELK.js (Phase 2) | Best-in-class graph layout, runs natively in Node.js, no DOM |
| Rendering | draw.io Desktop CLI (optional) | Pixel-perfect export. Gracefully absent. |
| State Management | In-memory event-sourced model | Fast reads, full undo, cheap checkpoints, zero dependencies |
| Image Processing | Sharp (Phase 3, optional) | Region cropping for targeted screenshots |

### Runtime Requirements

- **Node.js** >= 18
- **draw.io Desktop** (optional, for export/screenshot)
- **MCP-compatible client** (Claude Code, Cursor, etc.)

### Package Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.x",
    "fast-xml-parser": "^4.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vitest": "^2.x",
    "@types/node": "^20"
  }
}
```

Phase 2 adds `elkjs`. Phase 3 adds `sharp`.

---

## 16. Token Economics

### Per-Operation Token Cost

| Approach | Tokens per Op | Failure Rate | Format Knowledge Required |
|----------|--------------|-------------|--------------------------|
| Raw XML | ~1,150 | ~42% | Full XML schema + style strings |
| Index-guided XML | ~350 | ~15% | Partial XML + style props |
| Structured JSON MCP | ~35-40 | ~0% | JSON tool schema |
| **Codebook op strings** | **~25** | **~0%** | **Model map only (~200 tokens once)** |

### Cost Breakdown

A typical diagram session (20 shapes, 25 edges, 3 screenshots):

| Component | Tokens | Cost (Claude) |
|-----------|--------|---------------|
| Model map (once) | ~200 | $0.0002 |
| 20 add operations (input) | ~500 | $0.0004 |
| 25 connect operations (input) | ~750 | $0.0006 |
| 10 style/layout operations (input) | ~250 | $0.0002 |
| Responses (confirmations) | ~1,500 | $0.0012 |
| 3 queries (status, list) | ~800 | $0.0006 |
| 3 screenshots | ~6,000 | $0.005 |
| **Total** | **~10,000** | **~$0.008** |

Compare raw XML approach: ~50,000+ tokens, ~$0.04, with ~42% failure rate requiring retries.

### Why It Works

The compression comes from three sources:
1. **The model map** (~200 tokens once) eliminates per-operation style/type information
2. **The codebook vocabulary** (`svc`, `blue`, `dashed`) replaces verbose XML/JSON keys
3. **Tool-side expansion** generates all XML boilerplate, geometry, style strings, IDs

---

## 17. Session Lifecycle

### Phase 1: Create or Open

```
new "System Architecture" type:architecture
```

Tool creates empty semantic model, one page, returns:
```
ok: created "System Architecture" (architecture, 1 page, 0 shapes)
```

Or for existing files:
```
open ./existing-system.drawio
```

Tool reads XML, decompresses if needed, builds semantic model:
```
ok: opened "existing-system.drawio" (2 pages, 24 shapes, 31 edges, 4 groups)
```

### Phase 2: Build

```json
{"ops": [
  "add svc AuthService theme:blue",
  "add svc UserService theme:blue near:AuthService dir:right",
  "add db UserDB theme:green near:UserService dir:below",
  "connect AuthService -> UserService label:getUserProfile",
  "connect UserService -> UserDB label:SELECT",
  "group AuthService UserService UserDB as:Backend"
]}
```

All operations recorded in event log.

### Phase 3: Review

```
status
```

Returns compact diagram summary. Or request a screenshot (if draw.io Desktop available).

### Phase 4: Iterate

```json
{"ops": [
  "checkpoint v1-layout",
  "style @type:db fill:#e8f5e9 stroke:#2e7d32",
  "badge AuthService \"v2\" pos:top-right"
]}
```

If unsatisfied: `undo to:v1-layout`

### Phase 5: Save and Export

```
save
export png path:./system-architecture.png
export svg path:./system-architecture.svg
```

### Phase 6: Resume After Context Truncation

When context is truncated, one query restores the full picture:

```
status
```

Returns (~200 tokens):
```
status: "System Architecture" (saved, 47 ops, 3 checkpoints)
  page: System Overview (12 shapes, 15 edges, 3 groups)
    Backend: AuthService(svc), UserService(svc), UserDB(db)
    Frontend: LoginPage(box), Dashboard(box), NavBar(box)
    External: Gateway(api), CDN(cloud)
  page: Deployment (8 shapes, 10 edges, 2 groups)
  custom types: payment-svc(svc+purple), kafka-topic(queue+orange)
  checkpoints: "v1-layout" @op:15, "before-styling" @op:30, "final" @op:45
  recent: TokenCache(+), AuthService(*)
```

The LLM can continue editing without re-reading conversation history.

---

## 18. Testing Strategy

### Unit Tests

| Component | What to Test | Coverage Target |
|-----------|-------------|----------------|
| Op string parser | Each verb, key:value extraction, quoted strings, selectors, arrows, edge cases | 95%+ |
| Reference resolver | Exact match, case-insensitive, normalized, prefix, disambiguation | 95%+ |
| Semantic model | Shape/edge/group CRUD, event log, undo/redo, checkpoint | 95%+ |
| Theme resolver | All theme names, hex colors, unknown colors | 100% |
| Type resolver | All built-in types, custom types, type inference | 100% |
| Style string generator | All style properties, round-trip from StyleSet to string and back | 100% |

### Integration Tests

| Scenario | What to Validate |
|----------|-----------------|
| Full session: create → edit → save → reopen | Round-trip: semantic model → XML → semantic model is lossless |
| Batch operations | All ops in array execute, partial failure doesn't lose successful ops |
| Open existing .drawio file (compressed) | Decompress, parse, build model, verify shape count |
| Open existing .drawio file (uncompressed) | Parse, build model, verify shape count |
| Cross-page references | Shapes on different pages referenced correctly |
| Undo/redo across checkpoints | State restored correctly at each checkpoint |

### Round-trip Tests

The most critical test category. For each supported draw.io feature:

1. Create a `.drawio` file in the draw.io GUI with that feature
2. Open it with drawio-mcp-studio
3. Make a trivial edit (add one shape)
4. Save it back
5. Open it in draw.io GUI
6. Verify the original feature is preserved

Test files should cover: basic shapes, styled shapes, edges with waypoints, groups/containers, multiple pages, layers, custom shapes, images, tooltips, collapsed containers.

### Snapshot Tests

For XML serialization: given a known semantic model state, the serialized XML must match a known-good snapshot. Changes to serialization logic are caught immediately.

### Property-Based Tests

For the reference resolver: generate random shape labels, verify that resolution always returns the correct shape or reports ambiguity (never silently resolves to the wrong shape).

---

## 19. Implementation Phases

### Phase 1: The Context Shield (MVP)

**Goal:** Let the LLM build and edit multipage diagrams without ever holding XML in context.

**Scope:**

| Component | Included |
|-----------|---------|
| MCP server | 4 tools: `studio`, `studio_query`, `studio_session`, `studio_help` |
| Model map | Built-in types, themes, conventions. `studio_help` is dynamic — includes custom types. |
| Op string parser | All verbs except `layout` (auto-layout) |
| Semantic model | Shapes, edges, groups, pages, layers |
| Event sourcing | Full undo/redo, checkpoints |
| Reference resolver | Levels 1-5 (exact, case-insensitive, normalized, prefix, recency) |
| Selectors | `@type`, `@group`, `@recent`, `@all`, `@orphan` |
| Serialization | Model → XML (uncompressed), XML → model (both compressed and uncompressed) |
| Positioning | Relative (`near`/`dir`), absolute (`at`), batch |
| Node types | 12 basic shapes |
| Themes | 9 color themes |
| Response format | Tiers 1-3 |
| Custom types | `define` operation |

**Not included:** ELK.js layout, screenshot/rendering, cloud provider icons, regex selectors, `@connected` selector, `@style` selector, `for_each`/`clone_structure`, Sharp image processing.

**Definition of done:** Create a 20-shape, 3-page architecture diagram entirely through MCP tool calls. Open in draw.io Desktop. All shapes, edges, groups, labels, and styles render correctly. Reopen the saved file through the tool and continue editing.

### Phase 2: The Smart Layouter

| Feature | Description |
|---------|-------------|
| ELK.js integration | `layout` operation with dagre, force, tree algorithms |
| `align` and `distribute` | Layout primitives |
| Full reference resolution | Levels 6-8 (type-qualified, scope-qualified, disambiguation) |
| `@connected` selector | Shapes connected to a reference |
| `@label:/regex/` selector | Regex matching on labels |
| Batch operations | `for_each SELECTOR do:OP` |
| Annotations | `badge`, `tooltip`, `step_numbers`, `legend`, `title` |
| Layer operations | Full layer create/move/show/hide |
| `studio_help` enhancements | Include operation examples, selector cheat sheet |

### Phase 3: The Component Ecosystem

| Feature | Description |
|---------|-------------|
| Cloud provider icons | AWS, Azure, GCP, Kubernetes icon sets via `define` |
| Screenshot integration | draw.io Desktop CLI for rendering |
| Region screenshots | Crop to group/shape bounding box |
| Sharp integration | Image processing for targeted screenshots |
| `clone_structure` | Duplicate groups with renamed labels |
| Theme presets | Dark, blueprint, sketch global themes |
| Component library files | Persist custom type definitions across sessions |
| `@style:prop=value` selector | Match by style property |

---

## 20. Future: The Generalized Domain Brain Pattern

The architecture embodies a generalizable pattern. Only three components are domain-specific:

| Component | Reusable? | Domain-Specific? |
|-----------|-----------|-------------------|
| MCP server framework | Yes | No |
| Op string parser (verb dispatch) | Yes | No |
| Event sourcing engine | Yes | No |
| Reference resolution | Yes | No |
| Model map framework | Yes | No |
| **Semantic model (entities)** | No | **Yes** |
| **Component library** | No | **Yes** |
| **Serialization (XML/HCL/YAML)** | No | **Yes** |

### Potential Domain Brains

| Domain | Example Operations | Serialization |
|--------|-------------------|---------------|
| **draw.io** (this spec) | `add svc Auth theme:blue` | mxGraphModel XML |
| **Terraform** | `add aws-s3 assets versioning:true` | HCL (.tf) |
| **Kubernetes** | `add deployment api replicas:3 image:nginx` | YAML manifests |
| **Database Schema** | `add table users cols:id,email,name` | SQL DDL |
| **CI/CD** | `add stage test run:pytest after:build` | GitHub Actions YAML |

The shared infrastructure (op string parser, event sourcing, reference resolution, MCP scaffold) could be extracted into a `domain-brain-sdk`.

---

## Appendix A: Example Session

```
> studio_session: new "Order Processing System" type:architecture

ok: created "Order Processing System" (architecture, 1 page, 0 shapes)

> studio: [
    "add api Gateway theme:orange",
    "add svc OrderService theme:blue near:Gateway dir:below",
    "add svc PaymentService theme:blue near:OrderService dir:right",
    "add svc NotificationService theme:blue near:OrderService dir:left",
    "add db OrderDB theme:green near:OrderService dir:below",
    "add db PaymentDB theme:green near:PaymentService dir:below",
    "add queue EventBus theme:orange near:OrderService dir:below-right",
    "add cloud EmailProvider theme:gray near:NotificationService dir:below"
  ]

+api Gateway @(200,50 140x60) orange
+svc OrderService @(200,170 140x60) blue
+svc PaymentService @(400,170 140x60) blue
+svc NotificationService @(0,170 180x60) blue
+db OrderDB @(200,290 120x80) green
+db PaymentDB @(400,290 120x80) green
+queue EventBus @(350,290 140x60) orange
+cloud EmailProvider @(0,290 140x60) gray

> studio: [
    "connect Gateway -> OrderService label:\"POST /orders\"",
    "connect OrderService -> PaymentService label:processPayment",
    "connect OrderService -> EventBus label:orderCreated",
    "connect EventBus -> NotificationService label:notify",
    "connect NotificationService -> EmailProvider label:sendEmail",
    "connect OrderService -> OrderDB label:INSERT",
    "connect PaymentService -> PaymentDB label:INSERT"
  ]

~Gateway->OrderService "POST /orders"
~OrderService->PaymentService "processPayment"
~OrderService->EventBus "orderCreated"
~EventBus->NotificationService "notify"
~NotificationService->EmailProvider "sendEmail"
~OrderService->OrderDB "INSERT"
~PaymentService->PaymentDB "INSERT"

> studio: [
    "group OrderService PaymentService NotificationService as:Services",
    "group OrderDB PaymentDB as:Databases",
    "checkpoint initial-layout",
    "style @group:Services shadow:true",
    "badge PaymentService \"PCI\" pos:top-right",
    "label Gateway \"API Gateway v2\"",
    "title \"Order Processing — Microservices\""
  ]

!group Services (3 shapes)
!group Databases (2 shapes)
ok: checkpoint "initial-layout"
*styled @group:Services shadow:true (3 shapes)
*badge PaymentService "PCI" top-right
*label Gateway "API Gateway v2"
+title "Order Processing — Microservices"

> studio_session: save as:./order-processing.drawio

ok: saved ./order-processing.drawio (8 shapes, 7 edges, 2 groups)

> studio_session: export png path:./order-processing.png

ok: exported PNG ./order-processing.png (1280x1040px)
```

---

## Appendix B: MCP Configuration

### Claude Code (settings.json)

```json
{
  "mcpServers": {
    "drawio-studio": {
      "command": "node",
      "args": ["path/to/drawio-mcp-studio/dist/index.js"],
      "env": {
        "DRAWIO_PATH": "/Applications/draw.io.app/Contents/MacOS/draw.io",
        "DRAWIO_STUDIO_THEME": "light"
      }
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DRAWIO_PATH` | Auto-detect | Path to draw.io desktop executable |
| `DRAWIO_STUDIO_THEME` | `light` | Default theme |
| `DRAWIO_STUDIO_GRID_SIZE` | `10` | Default grid size in pixels |
| `DRAWIO_STUDIO_MAX_SHAPES` | `500` | Max shapes per page (safety limit) |

---

## Appendix C: Research References

### Design Decisions Informed by Research

| Decision | Research Source |
|----------|---------------|
| No custom DSL grammar | Tam et al. (EMNLP 2024): format constraints degrade reasoning |
| Semantic transparency | SMILES vs IUPAC (Inductive Bio 2025): 91% fewer errors |
| Codebook/model map pattern | MetaGlyph (2026): 62-81% token reduction via familiar symbols |
| Array of op strings | Johnson et al. (2025): +18.4pp accuracy with simpler formats |
| Label-based references | JSON Whisperer (EMNLP 2025): stable keys beat positional indices |
| 3-4 MCP tools | Six-Tool Pattern (MCP Bundles 2025): ~6 tools optimal |
| Direct XML generation | maxGraph evaluation: DOM dependency, fragile headless |
| Template operations | Vim/Redis patterns: fixed verb-noun templates beat grammars |

### Key Papers and Sources

- Tam et al., "Let Me Speak Freely?" (EMNLP 2024) -- arxiv:2408.02442
- Johnson et al., "Natural Language Tools" (2025) -- arxiv:2510.14453
- MetaGlyph (2026) -- arxiv:2601.07354
- JSON Whisperer (EMNLP 2025) -- arxiv:2510.04717
- Emmetify -- github.com/emmetify/emmetify-py
- TOON format -- toonformat.dev
- Anthropic, "Writing Effective Tools for Agents" (2025)
- MCP Bundles, "Six-Tool Pattern" (2025)
- Aider Edit Formats -- aider.chat/docs/more/edit-formats.html
- Iverson, "Notation as a Tool of Thought" (1979 Turing Award)
- Green & Petre, "Cognitive Dimensions of Notations" framework

---

## Appendix D: Glossary

| Term | Definition |
|------|-----------|
| **Codebook Protocol** | The communication pattern: model map (shared understanding) + operation strings (compact deltas) |
| **Model Map** | The ~200 token reference card establishing node types, themes, conventions between LLM and tool |
| **Domain Brain** | An MCP tool giving LLMs expert control over a complex domain format through intent-level operations |
| **Operation String** | A single compact command: `VERB [TYPE] TARGET [key:value]*` |
| **Semantic Model** | The in-memory entity graph (shapes, edges, groups, layers) |
| **Reference** | A label, selector, or variable identifying shapes |
| **Selector** | Pattern-based reference matching multiple shapes (`@type:db`) |
| **Checkpoint** | Named snapshot of event log position for targeted undo |
| **Round-trip** | Open .drawio → edit → save without losing information |
| **Theme** | Named color pair (fill + stroke) from the codebook |
