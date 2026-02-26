# drawio-mcp-studio: Design Specification

**Version:** 0.1.0-draft
**Date:** 2026-02-25
**Status:** Design / Pre-implementation

---

## Table of Contents

1. [Vision](#1-vision)
2. [Problem Statement](#2-problem-statement)
3. [Key Concept: Studio Language Protocol](#3-key-concept-studio-language-protocol)
4. [Architecture Overview](#4-architecture-overview)
5. [Layer 1: Studio Language Parser](#5-layer-1-studio-language-parser)
6. [Layer 2: Intent Layer (MCP Server)](#6-layer-2-intent-layer-mcp-server)
7. [Layer 3: Semantic Model (Domain Brain)](#7-layer-3-semantic-model-domain-brain)
8. [Layer 4: Layout and Rendering](#8-layer-4-layout-and-rendering)
9. [Layer 5: Serialization](#9-layer-5-serialization)
10. [Studio Language Grammar](#10-studio-language-grammar)
11. [Component Library](#11-component-library)
12. [Smart Defaults and Inference](#12-smart-defaults-and-inference)
13. [Error Prevention and Handling](#13-error-prevention-and-handling)
14. [Response Format](#14-response-format)
15. [Technology Stack](#15-technology-stack)
16. [Token Economics](#16-token-economics)
17. [Session Lifecycle](#17-session-lifecycle)
18. [Future: The Generalized Domain Brain Pattern](#18-future-the-generalized-domain-brain-pattern)

---

## 1. Vision

A "Domain Brain" MCP tool that lets LLMs create and edit rich, high-fidelity draw.io diagrams through intent-level commands. The LLM never touches XML. Instead, it speaks a terse "studio language" protocol -- a compact DSL optimized for minimal token usage in tool calls.

The core insight is that diagram creation involves two fundamentally different skill sets: **understanding what to draw** (which LLMs excel at) and **knowing how to encode it** (XML/style string minutiae that LLMs waste tokens on and frequently get wrong). drawio-mcp-studio separates these concerns completely. The LLM expresses intent; the tool handles encoding.

---

## 2. Problem Statement

### Current State

LLMs generating draw.io diagrams today must either:

1. **Produce raw mxGraphModel XML** -- verbose (~1,150 tokens per edit), error-prone (~42% failure rate on non-trivial edits), and requiring deep knowledge of draw.io's XML schema, style string format, and coordinate system.

2. **Use an index-based guided approach** -- still requires partial XML knowledge (~350 tokens per edit, ~15% failure rate), and the LLM must maintain mental models of XML structure.

3. **Describe diagrams in natural language for a human to create** -- accurate but entirely manual, not automatable.

### Desired State

An LLM issues a command like:

```
create cylinder:UserDB[green] near:AuthService.below
connect AuthService -> UserDB label:"queries" style:animated-flow
```

And receives back:

```
ok: created cylinder:UserDB @(120,280 120x80)
ok: connected AuthService -> UserDB "queries"
```

Zero XML knowledge required. Zero serialization errors. ~80-120 tokens per edit. The tool handles all layout, styling, XML generation, and rendering.

---

## 3. Key Concept: Studio Language Protocol

The studio language is a compact, line-oriented DSL designed specifically for LLM tool calls. Every design decision optimizes for:

- **Minimal tokens**: purpose-built syntax is 2x more efficient than even structured JSON
- **Composability**: selectors, variables, and references allow complex operations in single lines
- **Learnability**: reads like pseudocode; an LLM can use it after seeing a few examples
- **Error resilience**: fuzzy matching, smart defaults, and "did you mean?" suggestions

### Comparison: Equivalent Operations

**Raw XML (1,150 tokens):**
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
      orthogonalLoop=1;jettySize=auto;html=1;flowAnimation=1;" edge="1"
      source="auth1" target="db1" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
```

**JSON Intent API (220 tokens):**
```json
[
  {"op": "add_shape", "type": "rounded-rectangle", "label": "AuthService",
   "style": {"fillColor": "#dae8fc", "strokeColor": "#6c8ebf"}},
  {"op": "add_shape", "type": "cylinder", "label": "UserDB",
   "style": {"fillColor": "#d5e8d4", "strokeColor": "#82b366"},
   "position": {"relative_to": "AuthService", "direction": "below"}},
  {"op": "connect", "from": "AuthService", "to": "UserDB",
   "label": "queries", "style": {"flowAnimation": true}}
]
```

**Studio Language (80-120 tokens):**
```
create rounded:AuthService[blue]
create cylinder:UserDB[green] near:AuthService.below
connect AuthService -> UserDB label:"queries" style:animated-flow
```

---

## 4. Architecture Overview

The system is organized into five layers, each with a clear responsibility boundary:

```
+------------------------------------------------------------------+
|  LLM (Claude, GPT, etc.)                                        |
|  Speaks studio language via MCP tool call                        |
+------------------------------------------------------------------+
        |  studio language text (e.g., "create square:Auth[blue]")
        v
+------------------------------------------------------------------+
|  Layer 1: Studio Language Parser                                 |
|  Parses DSL text -> structured Operation objects                 |
+------------------------------------------------------------------+
        |  Operation[]
        v
+------------------------------------------------------------------+
|  Layer 2: Intent Layer (MCP Server)                              |
|  Validates, infers defaults, resolves references                 |
|  80+ operations across 11 categories                             |
+------------------------------------------------------------------+
        |  Resolved commands with concrete IDs, positions, styles
        v
+------------------------------------------------------------------+
|  Layer 3: Semantic Model (Domain Brain)                          |
|  In-memory entity graph: Diagram -> Pages -> Shapes/Edges/Groups |
|  Event-sourced state, reference registry, alias resolution       |
+------------------------------------------------------------------+
        |  Model mutations / queries
        v
+------------------------------------------------------------------+
|  Layer 4: Layout + Rendering                                     |
|  ELK.js for auto-layout                                         |
|  draw.io Desktop CLI for screenshots/exports                     |
+------------------------------------------------------------------+
        |  Positioned model / rendered images
        v
+------------------------------------------------------------------+
|  Layer 5: Serialization                                          |
|  Semantic model <-> mxGraphModel XML (bidirectional, lossless)   |
|  Style string generation, shape embedding, validation            |
+------------------------------------------------------------------+
        |  .drawio XML file / PNG / SVG / PDF
        v
     [ Filesystem ]
```

**Data flow for a typical command:**

1. LLM sends `create cylinder:UserDB[green] near:AuthService.below` as MCP tool input
2. Parser produces `{ op: "create", type: "cylinder", label: "UserDB", styles: ["green"], position: { near: "AuthService", direction: "below" } }`
3. Intent layer resolves "AuthService" to internal ID `shape_a3`, resolves "green" to `{ fillColor: "#d5e8d4", strokeColor: "#82b366" }`, computes position from AuthService's bounds
4. Semantic model creates a new Shape entity, appends a `ShapeCreated` event, updates the entity graph
5. Layout engine adjusts spacing if needed, routing engine notes no edges to route yet
6. Response: `ok: created cylinder:UserDB @(120,280 120x80)`

---

## 5. Layer 1: Studio Language Parser

### Responsibility

Parse the compact DSL text into structured Operation objects. Handle syntax errors gracefully with suggestions.

### Parser Strategy

A hand-written recursive descent parser in TypeScript. The grammar is simple enough that a parser generator (PEG.js, nearley) adds unnecessary dependency complexity without meaningful benefit. The parser should be:

- **Single-pass**: no backtracking needed for this grammar
- **Streaming-friendly**: parse line-by-line, each line is an independent command
- **Error-recovering**: on syntax error, skip to next line and report all errors

### Grammar Overview

The studio language is line-oriented. Each line is one command. Blank lines and lines starting with `#` are ignored.

```
program        := line*
line           := command NL
command        := create_cmd | connect_cmd | style_cmd | layout_cmd
               | query_cmd | session_cmd | render_cmd | group_cmd
               | annotation_cmd | bulk_cmd | page_cmd

create_cmd     := "create" shape_spec position? grouping? batch?
shape_spec     := type_name ":" label style_list?
type_name      := IDENT | component_ref
component_ref  := IDENT "-" IDENT ("-" IDENT)*        # e.g., aws-ec2, k8s-pod
label          := IDENT | QUOTED_STRING
style_list     := "[" style ("," style)* "]"
style          := color_name | style_prop
color_name     := "red" | "blue" | "green" | "yellow" | ...
style_prop     := IDENT ":" value
position       := "near:" ref "." direction | "at:" INT "," INT
direction      := "above" | "below" | "left" | "right"
               | "above-left" | "above-right" | "below-left" | "below-right"
grouping       := "in:" ref
batch          := "x" INT

connect_cmd    := "connect" ref connect_chain connect_opts*
connect_chain  := arrow ref (arrow ref)*
arrow          := "->" | "<->" | "-x"
connect_opts   := "label:" QUOTED_STRING | "style:" edge_style
               | "source-arrow:" arrow_type | "target-arrow:" arrow_type
edge_style     := "solid" | "dashed" | "dotted" | "animated-flow"
               | "thick" | "curved" | "orthogonal"
arrow_type     := "arrow" | "open-arrow" | "diamond" | "circle"
               | "crow-foot" | "none"

style_cmd      := "style" ref style_props+
               | "theme" theme_name
               | "preset" preset_subcmd
style_props    := IDENT ":" value
preset_subcmd  := "create" QUOTED_STRING style_props+
               | "apply" QUOTED_STRING "to" ref

layout_cmd     := "orient" ref orientation layout_opts*
               | "align" ref alignment
               | "distribute" ref distribution
               | "grid" ref grid_opts*
               | "auto_layout" algo layout_opts*
               | "snap_to_grid" INT
               | "move" ref "to" position
               | "resize" ref "to" INT "x" INT
               | "swap" ref ref
orientation    := "vertical" | "horizontal"
alignment      := "top" | "bottom" | "left" | "right" | "center"
distribution   := "horizontal" | "vertical"
algo           := "dagre" | "elk" | "force" | "tree"
layout_opts    := IDENT ":" value

query_cmd      := "list" list_target?
               | "describe" ref
               | "connections" ref
               | "find" QUOTED_STRING
               | "stats"
               | "validate"
               | "diff" "checkpoint:" QUOTED_STRING
               | "status"
               | "history" INT?

list_target    := selector | "commands" | "components" | "themes" | "styles" | "presets"

session_cmd    := "new" QUOTED_STRING session_opts*
               | "open" QUOTED_STRING
               | "save" save_opts?
               | "checkpoint" QUOTED_STRING
               | "undo" undo_opts?
               | "redo"
session_opts   := "type:" diagram_type | "persist_log:" ("true" | "false")
save_opts      := "as:" QUOTED_STRING
undo_opts      := "to:" QUOTED_STRING

render_cmd     := "screenshot" ref? render_opts*
               | "preview"
               | "export" export_format export_opts*
render_opts    := "padding:" INT | "scale:" FLOAT
export_format  := "png" | "svg" | "pdf"
export_opts    := "path:" QUOTED_STRING

page_cmd       := "add_page" QUOTED_STRING
               | "remove_page" QUOTED_STRING
               | "switch_page" QUOTED_STRING
               | "duplicate_page" QUOTED_STRING

group_cmd      := "group" ref+ "as" QUOTED_STRING
               | "ungroup" ref
               | "add_to_group" ref ref
               | "collapse" ref
               | "expand" ref
               | "layer" layer_subcmd
layer_subcmd   := "create" QUOTED_STRING
               | "move" ref "to" QUOTED_STRING
               | "show" QUOTED_STRING
               | "hide" QUOTED_STRING

annotation_cmd := "label" ref QUOTED_STRING
               | "badge" ref QUOTED_STRING badge_opts?
               | "tooltip" ref QUOTED_STRING
               | "step_numbers" ref+
               | "legend" legend_entries
               | "title" QUOTED_STRING

bulk_cmd       := "batch" NL (command NL)+ "end"
               | "for_each" selector "do" command
               | "clone_structure" ref "as" QUOTED_STRING

ref            := label_ref | selector | variable
label_ref      := IDENT | QUOTED_STRING
selector       := "@type:" IDENT
               | "@group:" IDENT
               | "@connected:" ref
               | "@page:" IDENT
               | "@layer:" IDENT
               | "@label:/" REGEX "/"
               | "@style:" IDENT "=" value
               | "@recent" (":" INT)?
               | "@all"
               | "@orphan"
variable       := "$last" | "$center" | "$origin" | "$bounds"

value          := INT | FLOAT | QUOTED_STRING | IDENT | HEX_COLOR
IDENT          := [a-zA-Z_][a-zA-Z0-9_-]*
QUOTED_STRING  := '"' [^"]* '"'
HEX_COLOR      := "#" [0-9a-fA-F]{3,8}
INT            := [0-9]+
FLOAT          := [0-9]+ "." [0-9]+
REGEX          := [^/]+
NL             := "\n"
```

### Parser Output

Each parsed line produces an `Operation` object:

```typescript
interface Operation {
  kind: OperationKind;         // "create" | "connect" | "style" | ...
  args: Record<string, any>;   // operation-specific arguments
  source: SourceSpan;          // line number + column range for error reporting
}

interface SourceSpan {
  line: number;
  col: number;
  len: number;
  text: string;                // original source text for error messages
}
```

### Error Handling

Parser errors include the original source text, a caret pointing to the error location, and a suggestion when possible:

```
error: unknown shape type "rectangel"
  > create rectangel:MyShape[blue]
           ^^^^^^^^^
  did you mean: "rectangle"?
```

The parser maintains a dictionary of all valid tokens for Levenshtein-distance-based suggestions.

---

## 6. Layer 2: Intent Layer (MCP Server)

### Responsibility

The MCP server exposes a single primary tool (`studio`) that accepts studio language text. It validates parsed operations, resolves references, infers defaults, and dispatches to the semantic model. It also manages the tiered response strategy.

### MCP Tool Interface

The server exposes two MCP tools:

**`studio`** -- The primary tool. Accepts one or more lines of studio language.

```
Tool: studio
Input: { "cmd": "create rounded:AuthService[blue]\ncreate cylinder:UserDB[green] near:AuthService.below" }
Output: "ok: created rounded:AuthService @(120,200 140x60)\nok: created cylinder:UserDB @(120,340 120x80)"
```

**`studio_help`** -- Returns a compact syntax reference card (~400 tokens). The LLM can call this if it needs a reminder of the DSL syntax.

### Operation Categories (80+ operations)

#### Lifecycle (7 operations)
| Command | Description |
|---------|-------------|
| `new` | Create a new diagram with optional type hint |
| `open` | Open an existing .drawio file, parse into semantic model |
| `save` | Serialize semantic model to .drawio XML, write to disk |
| `export` | Render to PNG/SVG/PDF via draw.io CLI |
| `checkpoint` | Snapshot current state with a named label |
| `undo` | Revert last operation or revert to named checkpoint |
| `redo` | Re-apply last undone operation |

#### Pages (4 operations)
| Command | Description |
|---------|-------------|
| `add_page` | Add a new page to the diagram |
| `remove_page` | Remove a page by name |
| `switch_page` | Change the active page |
| `duplicate_page` | Copy a page with all its contents |

#### Shapes (5 operations)
| Command | Description |
|---------|-------------|
| `create` | Create one or more shapes with type, label, styles, position |
| `add_image` | Add an image shape (base64 or URL) |
| `add_container` | Create a container/swimlane shape |
| `add_list_shape` | Create a list shape (e.g., UML class with sections) |
| `duplicate` | Copy an existing shape |

#### Connections (6 operations)
| Command | Description |
|---------|-------------|
| `connect` (single) | Create an edge between two shapes |
| `connect` (chain) | Create edges along a chain: A -> B -> C |
| `disconnect` | Remove an edge between two shapes |
| `redirect` | Change the source or target of an existing edge |
| `splice` | Insert a shape into an existing edge (A->C becomes A->B->C) |
| `connect_star` | Connect one shape to all shapes matching a selector |

#### Layout (10 operations)
| Command | Description |
|---------|-------------|
| `orient` | Arrange shapes vertically or horizontally |
| `align` | Align shapes along an edge (top, bottom, left, right, center) |
| `distribute` | Space shapes evenly |
| `grid` | Arrange shapes in a grid pattern |
| `stack` | Stack shapes vertically or horizontally with zero gap |
| `auto_layout` | Run a full layout algorithm (dagre, elk, force, tree) |
| `snap_to_grid` | Snap all shapes to a grid of given size |
| `move` | Move a shape to an absolute or relative position |
| `resize` | Change a shape's dimensions |
| `swap` | Exchange the positions of two shapes |

#### Styling (6 operations)
| Command | Description |
|---------|-------------|
| `style` | Set style properties on one or more shapes |
| `style_all` | Apply style to all shapes matching criteria |
| `theme` | Set a global theme (light, dark, blueprint, sketch) |
| `preset create` | Define a named style preset |
| `preset apply` | Apply a named preset to shapes |
| `copy_style` | Copy style from one shape to others |

#### Annotation (6 operations)
| Command | Description |
|---------|-------------|
| `label` | Set or update a shape's label text |
| `badge` | Add a small badge/indicator to a shape corner |
| `tooltip` | Set hover tooltip text |
| `step_numbers` | Add sequential numbers to a set of shapes |
| `legend` | Create a color/symbol legend |
| `title` | Add a title block to the diagram |

#### Organization (7 operations)
| Command | Description |
|---------|-------------|
| `group` | Group shapes under a named group |
| `ungroup` | Dissolve a group, keeping its children |
| `add_to_group` | Add a shape to an existing group |
| `layer create` | Create a new layer |
| `layer move` | Move shapes to a layer |
| `collapse` | Collapse a container/group visually |
| `expand` | Expand a collapsed container/group |

#### Query (14 operations)
| Command | Description |
|---------|-------------|
| `list` | List all shapes, optionally filtered by selector |
| `list commands` | List all available Studio Language commands |
| `list components` | List available shape components (e.g., from AWS, k8s) |
| `list themes` | List available visual themes (e.g., light, dark) |
| `list styles` | List available style shorthands (e.g., red, dashed) |
| `list presets` | List defined style presets |
| `describe` | Show full details of a shape |
| `connections` | Show all edges to/from a shape |
| `find` | Fuzzy-search shapes by label |
| `stats` | Summary counts (shapes, edges, groups, pages) |
| `validate` | Check structural integrity |
| `diff` | Show changes since a named checkpoint |
| `status` | Compact full-diagram summary (~200 tokens) |
| `history` | Show last N operations |

#### Bulk (3 operations)
| Command | Description |
|---------|-------------|
| `batch` | Execute multiple commands atomically |
| `for_each` | Apply a command template to all shapes matching a selector |
| `clone_structure` | Duplicate a group/subgraph with new labels |

#### Rendering (4 operations)
| Command | Description |
|---------|-------------|
| `screenshot` | Render full page or region to PNG |
| `screenshot` (shape) | Render a single shape with padding |
| `preview` | Fast low-resolution thumbnail |
| `export` | Export to PNG/SVG/PDF file |

### Reference Resolution

When the LLM refers to a shape (e.g., `AuthService`, `"User Database"`, `@recent`), the intent layer resolves it through an 8-level cascade:

1. **Exact match** -- label matches exactly (case-sensitive)
2. **Case-insensitive match** -- `authservice` matches `AuthService`
3. **Normalized match** -- strip hyphens, underscores, spaces: `user_db` matches `UserDB`
4. **Prefix match** -- `Auth` matches `AuthService` if unambiguous
5. **Recency match** -- `$last` or `@recent` resolves to the most recently created/modified shape
6. **Kind-qualified match** -- `cylinder:UserDB` disambiguates when multiple shapes share a label
7. **Scope-qualified match** -- `Backend/AuthService` disambiguates by group
8. **Disambiguation prompt** -- if multiple candidates remain, return all matches and ask

The resolution cascade short-circuits at the first level that produces exactly one match.

### Alias Registry

The LLM or user can register session-scoped aliases:

```
alias AS AuthService
alias DB UserDB
connect AS -> DB
```

Aliases are checked before the 8-level cascade.

---

## 7. Layer 3: Semantic Model (Domain Brain)

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
  presets: Map<string, StyleSet>;
  aliases: Map<string, string>; // alias -> shape ID
  metadata: DiagramMetadata;
}

interface Page {
  id: string;
  name: string;
  shapes: Map<string, Shape>;
  edges: Map<string, Edge>;
  groups: Map<string, Group>;
  layers: Layer[];
  defaultLayer: string;         // layer ID
}

interface Shape {
  id: string;
  label: string;
  type: ShapeType;              // "rectangle", "cylinder", "diamond", etc.
  bounds: Bounds;               // { x, y, width, height }
  style: StyleSet;
  parentGroup: string | null;   // group ID
  layer: string;                // layer ID
  metadata: ShapeMetadata;      // tooltips, badges, custom data
  createdAt: number;            // for recency resolution
  modifiedAt: number;
}

interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
  label: string | null;
  style: EdgeStyleSet;
  waypoints: Point[];           // intermediate routing points
  sourceArrow: ArrowType;
  targetArrow: ArrowType;
  createdAt: number;
  modifiedAt: number;
}

interface Group {
  id: string;
  name: string;
  memberIds: Set<string>;       // shape IDs
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
  order: number;                // z-index
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}
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
  edgeStyle: string;            // "orthogonalEdgeStyle", "elbowEdgeStyle", etc.
  curved: boolean;
  flowAnimation: boolean;
  jettySize: string | number;
}
```

### Event Sourcing

All mutations to the semantic model are recorded as events. This enables:

- **Full undo/redo** at any granularity
- **Named checkpoints** for milestone-based revert
- **Diff generation** between any two points in history
- **Audit trail** of all operations

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
  checkpoints: Map<string, number>; // name -> event index
}
```

**Undo** moves the cursor backward and reverses events. **Redo** moves it forward and replays. **Checkpoint** records the current cursor position under a name.

For debugging and audit purposes, the entire event log can be persisted to a file (`.jsonl` format) by enabling the `persist_log` option during session creation or via an environment variable.

### Theme and Style Resolver

Semantic color names and style shorthands are resolved to concrete draw.io style values through a theme-aware resolver:

```typescript
const COLOR_MAP = {
  // Semantic names -> { fillColor, strokeColor }
  "red":     { fill: "#f8cecc", stroke: "#b85450" },
  "blue":    { fill: "#dae8fc", stroke: "#6c8ebf" },
  "green":   { fill: "#d5e8d4", stroke: "#82b366" },
  "yellow":  { fill: "#fff2cc", stroke: "#d6b656" },
  "orange":  { fill: "#ffe6cc", stroke: "#d79b00" },
  "purple":  { fill: "#e1d5e7", stroke: "#9673a6" },
  "gray":    { fill: "#f5f5f5", stroke: "#666666" },
  "dark":    { fill: "#1a1a2e", stroke: "#16213e", fontColor: "#e0e0e0" },
  "white":   { fill: "#ffffff", stroke: "#000000" },
};
```

Themes override the default color map. For example, a "dark" theme inverts the palette and uses light text on dark backgrounds.

### Reference Registry

The registry maintains multiple indices for fast shape lookup:

```typescript
class ReferenceRegistry {
  private byId: Map<string, Shape>;
  private byLabel: Map<string, Shape[]>;          // label -> shapes (may have duplicates)
  private byLabelNormalized: Map<string, Shape[]>; // normalized label -> shapes
  private byType: Map<ShapeType, Shape[]>;
  private byGroup: Map<string, Shape[]>;           // group name -> member shapes
  private byLayer: Map<string, Shape[]>;
  private recentOrder: Shape[];                     // most recent first
  private aliases: Map<string, string>;             // alias -> shape ID
}
```

The registry is rebuilt from the semantic model on every mutation to keep indices consistent. (For large diagrams, incremental index maintenance would be preferred -- deferred to v2.)

---

## 8. Layer 4: Layout and Rendering

### Responsibility

Compute positions for shapes and route edges. Render diagrams to images for visual feedback.

### Layout Engine: ELK.js

ELK.js (Eclipse Layout Kernel) provides the core layout algorithms:

| Algorithm | Use Case | ELK Option |
|-----------|----------|------------|
| Layered (dagre-like) | Flowcharts, pipelines, DAGs | `elk.layered` |
| Force-directed | Network diagrams, organic layouts | `elk.force` |
| Tree | Hierarchies, org charts | `elk.mrtree` |
| Box | Container packing | `elk.box` |

#### Layout Modes

**Full layout** (`auto_layout`): Position all shapes from scratch. Used when creating a new diagram or after major structural changes.

**Incremental layout** (`auto_layout incremental`): Adjust positions of newly added shapes while preserving existing positions. Used during iterative editing.

**Partial layout** (`orient`, `align`, `distribute`, `grid`): Apply layout constraints to a subset of shapes. The most common mode during interactive editing.

#### Edge Routing

Edges are routed using orthogonal routing with obstacle avoidance:

1. Compute source and target connection points (nearest sides)
2. Route edges orthogonally (horizontal/vertical segments only)
3. Avoid passing through other shapes
4. Minimize crossings with other edges
5. Add waypoints for clean corners

For simple diagrams (< 20 edges), a greedy router suffices. For complex diagrams, delegate to ELK.js's built-in edge routing.

### Rendering: draw.io Desktop CLI

draw.io's desktop application includes a CLI for headless rendering:

```bash
# PNG export
drawio --export --format png --output diagram.png diagram.drawio

# SVG export
drawio --export --format svg --output diagram.svg diagram.drawio

# PDF export
drawio --export --format pdf --output diagram.pdf diagram.drawio

# Specific page
drawio --export --format png --page-index 0 --output page1.png diagram.drawio

# Scale factor
drawio --export --format png --scale 2 --output diagram@2x.png diagram.drawio

# Crop to content
drawio --export --format png --crop --output cropped.png diagram.drawio
```

#### Region Rendering

For `screenshot @group:Backend`, the tool:

1. Computes the bounding box of all shapes in the `Backend` group
2. Adds padding (default 50px)
3. Exports the full page as PNG
4. Crops to the computed region
5. Returns the cropped image as base64

Region rendering costs ~1,600 tokens for the image content, making it affordable for frequent visual verification.

#### Rendering Cost Estimate

At current Claude pricing (~$0.80 per 1M input tokens for images), a single screenshot costs approximately:

- Full page diagram: ~$0.003 (3,000-4,000 tokens)
- Region screenshot: ~$0.001 (1,000-2,000 tokens)
- Preview thumbnail: ~$0.0005 (500-800 tokens)

These costs are negligible, making liberal use of `screenshot` practical.

---

## 9. Layer 5: Serialization

### Responsibility

Convert between the semantic model and draw.io's mxGraphModel XML format. Ensure bidirectional, lossless round-tripping.

### mxGraphModel XML Structure

A draw.io file is XML with this structure:

```xml
<mxfile host="..." modified="..." version="...">
  <diagram id="..." name="Page-1">
    <mxGraphModel dx="..." dy="..." grid="1" ...>
      <root>
        <mxCell id="0"/>                              <!-- root cell, always present -->
        <mxCell id="1" parent="0"/>                   <!-- default layer, always present -->
        <mxCell id="shape1" value="Label"             <!-- a shape -->
          style="rounded=1;fillColor=#dae8fc;..."
          vertex="1" parent="1">
          <mxGeometry x="120" y="200" width="140" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="edge1" value="label"              <!-- an edge -->
          style="edgeStyle=orthogonalEdgeStyle;..."
          edge="1" source="shape1" target="shape2" parent="1">
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
  // 1. Generate mxfile wrapper
  // 2. For each page:
  //    a. Create <diagram> element
  //    b. Create <mxGraphModel> with canvas settings
  //    c. Create <root> with foundation cells (id="0", id="1")
  //    d. For each layer: create parent mxCell
  //    e. For each group: create container mxCell if isContainer
  //    f. For each shape: create vertex mxCell with geometry + style string
  //    g. For each edge: create edge mxCell with geometry + waypoints + style string
  // 3. Return formatted XML
}
```

### Style String Generation

draw.io uses semicolon-delimited key=value style strings:

```
rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=12;
```

The serializer converts semantic StyleSet properties to draw.io's style string format, including:

- Shape-specific base styles (e.g., `shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=15` for cylinders)
- Color properties (`fillColor`, `strokeColor`, `fontColor`)
- Typography (`fontSize`, `fontFamily`, `fontStyle`)
- Visual effects (`rounded`, `dashed`, `shadow`, `opacity`)
- Edge-specific properties (`edgeStyle`, `curved`, `flowAnimation`)

### XML to Semantic Model

When opening an existing .drawio file:

1. Parse XML into DOM
2. Extract all `<diagram>` elements (one per page)
3. Decode each diagram's `<mxGraphModel>` content
4. Walk the `<root>` children:
   - `id="0"` -> root cell (skip)
   - `id="1"` or cells with no `vertex`/`edge` attr and children -> layers
   - Cells with `vertex="1"` and child cells with `vertex="1"` -> containers/groups
   - Cells with `vertex="1"` -> shapes
   - Cells with `edge="1"` -> edges
5. Parse style strings back into semantic StyleSet properties
6. Rebuild the entity graph, reference registry, and indices

### Round-trip Guarantee

The serializer preserves all draw.io-specific properties that it does not understand as opaque key-value pairs in the StyleSet's extensible `[key: string]: any` bucket. This ensures that opening a complex draw.io file created in the GUI, making edits via studio language, and saving back does not lose any features or formatting.

Properties that the tool does not recognize are preserved verbatim in the style string during round-trip.

### Validation

Before serialization, the model is validated:

| Check | Action on Failure |
|-------|-------------------|
| All edge source/target IDs exist as shapes | Remove orphaned edges, warn |
| No duplicate IDs | Should never happen (tool-assigned), assert |
| All group member IDs exist | Remove missing members, warn |
| Foundation cells (id=0, id=1) present | Auto-create if missing |
| Page has at least one layer | Auto-create default layer |
| Shape bounds are non-negative | Clamp to minimum 20x20 |

---

## 10. Studio Language Grammar

This section provides the definitive reference for the studio language syntax. Each subsection covers one command category with full syntax, examples, and edge cases.

### Shape Creation

**Syntax:**
```
create <type>:<label>[<styles>] [near:<ref>.<position>] [at:<x>,<y>] [in:<group>] [x<N>]
```

**Shape Types:**

| Shorthand | draw.io Shape | Typical Use |
|-----------|--------------|-------------|
| `square` | rectangle (1:1 aspect) | Generic blocks |
| `rect` | rectangle | Containers, services |
| `rounded` | rounded rectangle | Software components |
| `circle` | ellipse (1:1 aspect) | States, events |
| `ellipse` | ellipse | States, annotations |
| `diamond` | rhombus | Decisions, conditions |
| `cylinder` | cylinder3 | Databases, storage |
| `hexagon` | hexagon | Processes, transforms |
| `cloud` | cloud | External services, internet |
| `actor` | shape=mxgraph.basic.person | Users, personas |
| `document` | document shape | Files, reports |
| `parallelogram` | parallelogram | I/O, queues |
| `triangle` | triangle | Warnings, deltas |
| `process` | process | Predefined processes |

**Component types** use a namespaced format:
```
aws-ec2, aws-s3, aws-lambda, aws-rds, aws-sqs, aws-sns
azure-vm, azure-blob, azure-functions
gcp-compute, gcp-storage, gcp-cloud-functions
k8s-pod, k8s-deployment, k8s-service, k8s-ingress
```

**Style shorthand:**

| Shorthand | Effect |
|-----------|--------|
| `[red]` | Red fill + matching stroke |
| `[blue,rounded]` | Blue fill + rounded corners |
| `[fill:#abc,stroke:#def]` | Explicit hex colors |
| `[dashed]` | Dashed border |
| `[shadow]` | Drop shadow |
| `[bold]` | Bold label text |
| `[italic]` | Italic label text |
| `[opacity:50]` | 50% opacity |

**Position shorthand:**

| Shorthand | Placement |
|-----------|-----------|
| `near:X.below` | Below shape X, centered horizontally |
| `near:X.right` | Right of shape X, centered vertically |
| `near:X.above-right` | Above and to the right of shape X |
| `at:100,200` | Absolute position (x=100, y=200) |

**Batch creation:**
```
create rounded:Service[blue] x4
```
Produces: `Service1`, `Service2`, `Service3`, `Service4`, arranged in a row.

**Examples:**
```
create square:AuthService[blue,rounded]
create cylinder:UserDB[green] near:AuthService.below
create diamond:IsValid?[yellow] near:AuthService.right
create rounded:Worker[gray] x3 in:Backend
create aws-ec2:WebServer near:LoadBalancer.right
create custom:payment-service in:Backend
```

### Connections

**Syntax:**
```
connect <ref> <arrow> <ref> [<arrow> <ref>]* [label:"<text>"] [style:<edge-style>] [source-arrow:<type>] [target-arrow:<type>]
```

**Arrow operators:**

| Operator | Meaning |
|----------|---------|
| `->` | Directed edge (source to target) |
| `<->` | Bidirectional edge |
| `-x` | Undirected edge (no arrows) |

**Edge styles:**

| Style | Effect |
|-------|--------|
| `solid` | Default solid line |
| `dashed` | Dashed line |
| `dotted` | Dotted line |
| `animated-flow` | Animated dashes (draw.io flowAnimation) |
| `thick` | Thicker stroke width |
| `curved` | Curved routing instead of orthogonal |
| `orthogonal` | Right-angle routing (default) |

**Arrow types:**

| Type | Visual |
|------|--------|
| `arrow` | Filled triangle (default for ->) |
| `open-arrow` | Open triangle |
| `diamond` | Diamond (UML aggregation) |
| `circle` | Circle |
| `crow-foot` | Crow's foot (ER diagrams) |
| `none` | No arrowhead |

**Examples:**
```
connect AuthService -> UserDB
connect AuthService -> UserDB label:"queries" style:dashed
connect A -> B -> C -> D
connect Client <-> Server label:"WebSocket"
connect Service -x Service label:"same process"
connect AuthService -> UserDB source-arrow:none target-arrow:crow-foot
connect Gateway -> @group:Backend
```

### Selectors

Selectors match zero or more shapes. They are used anywhere a `<ref>` is accepted.

**Syntax and semantics:**

| Selector | Matches |
|----------|---------|
| `@type:<shape-type>` | All shapes of the given type on current page |
| `@group:<name>` | All shapes in the named group |
| `@connected:<ref>` | All shapes connected to the referenced shape |
| `@page:<name>` | All shapes on the named page |
| `@layer:<name>` | All shapes on the named layer |
| `@label:/<regex>/` | Shapes whose label matches the regex |
| `@style:<property>=<value>` | Shapes with a specific style property value |
| `@recent` | The most recently created/modified shape |
| `@recent:<N>` | The last N created/modified shapes |
| `@all` | Every shape on the current page |
| `@orphan` | Shapes with no incoming or outgoing edges |

**Examples:**
```
style @type:cylinder fill:#d5e8d4 stroke:#82b366
connect Gateway -> @group:Backend
list @orphan
orient @connected:AuthService vertical
style @label:/^User.*/ fill:blue
for_each @type:rounded do badge $item "v2" position:top-right
```

### Variables

Variables provide dynamic references resolved at execution time.

| Variable | Resolves To |
|----------|-------------|
| `$last` | The most recently created or modified shape |
| `$center` | The center point of the referenced shape's bounding box |
| `$origin` | The top-left corner of the referenced shape's bounding box |
| `$bounds` | The full bounding box `{x, y, width, height}` of referenced shape(s) |

**Examples:**
```
create rounded:Service[blue]
connect $last -> UserDB                    # $last = Service
style $last fill:red                       # $last = Service (style didn't create)
create circle:Event near:$last.right       # $last still = Service
```

### Layout Commands

```
orient <refs> vertical|horizontal [align:left|center|right] [spacing:<px>]
align <refs> top|bottom|left|right|center
distribute <refs> horizontal|vertical
grid <refs> cols:<N> [spacing:<px>]
stack <refs> vertical|horizontal
auto_layout dagre|elk|force|tree [direction:TB|BT|LR|RL] [spacing:<px>]
snap_to_grid <size>
move <ref> to <position>
resize <ref> to <width>x<height>
swap <ref> <ref>
```

**Examples:**
```
orient @group:Backend vertical align:left spacing:20
align @type:cylinder top
distribute @recent:5 horizontal
grid @group:Services cols:3 spacing:30
auto_layout dagre direction:LR spacing:40
snap_to_grid 10
move AuthService to at:100,100
resize UserDB to 150x100
swap AuthService UserDB
```

### Styling Commands

```
style <ref> <property>:<value> [<property>:<value>]*
theme light|dark|blueprint|sketch
preset create "<name>" <property>:<value> [<property>:<value>]*
preset apply "<name>" to <ref>
copy_style <source-ref> to <target-ref>
```

**Style properties:**

| Property | Values | Example |
|----------|--------|---------|
| `fill` | color name or hex | `fill:blue`, `fill:#aabbcc` |
| `stroke` | color name or hex | `stroke:red` |
| `font-color` | color name or hex | `font-color:white` |
| `font-size` | number (px) | `font-size:14` |
| `font` | number (shorthand for font-size) | `font:14` |
| `rounded` | boolean | `rounded:true` |
| `dashed` | boolean | `dashed:true` |
| `shadow` | boolean | `shadow:true` |
| `opacity` | 0-100 | `opacity:50` |

**Examples:**
```
style AuthService fill:blue stroke:#1a237e font-size:14
style @type:cylinder fill:#d5e8d4 stroke:#82b366
theme dark
preset create "danger" fill:red stroke:darkred font-color:white
preset apply "danger" to ErrorHandler
copy_style AuthService to @group:Backend
```

### Query Commands

```
list [<selector>]
describe <ref>
connections <ref>
find "<search-text>"
stats
validate
diff checkpoint:"<name>"
status
history [<N>]
```

**Example outputs:**

`list @type:cylinder`:
```
cylinders (3): UserDB @(120,280), TokenCache @(300,280), SessionStore @(480,280)
```

`describe AuthService`:
```
rounded:AuthService @(120,200 140x60) [blue,rounded]
  group: Backend
  layer: default
  out: -> UserDB "queries", -> TokenCache "validates"
  in: <- APIGateway "authenticates"
  badges: "v2" (top-right)
```

`stats`:
```
pages:1 shapes:12 edges:15 groups:3 layers:1
types: rounded(5) cylinder(3) diamond(2) cloud(2)
groups: Backend(5) Frontend(4) External(3)
```

`status`:
```
"System Architecture" (unsaved)
  page: System Overview (12 shapes, 15 edges, 3 groups)
  recent: AuthService(modified), UserDB(created), TokenCache(created)
  checkpoints: "initial" (5 ops ago), "before-refactor" (2 ops ago)
```

### Rendering Commands

```
screenshot [<ref>] [padding:<px>] [scale:<factor>]
preview
export png|svg|pdf [path:"<filepath>"]
```

**Examples:**
```
screenshot                               # full current page
screenshot @group:Backend               # just the Backend group region
screenshot AuthService padding:80        # AuthService with generous context
preview                                  # fast low-res full page
export png path:"./architecture.png"
export svg path:"./architecture.svg"
export pdf path:"./architecture.pdf"
```

### Session Commands

```
new "<title>" [type:flowchart|sequence|er|network|architecture|uml]
open "<filepath>"
save [as:"<filepath>"]
checkpoint "<name>"
undo [to:"<checkpoint-name>"]
redo
```

**Diagram type hints** influence smart defaults:

| Type | Default Layout | Default Shapes | Default Edge Style |
|------|---------------|----------------|-------------------|
| `flowchart` | Top-to-bottom dagre | Terminals, processes, decisions | Orthogonal |
| `sequence` | Left-to-right | Lifelines, activations | Dashed |
| `er` | Force-directed | Rectangles with attributes | Crow-foot |
| `network` | Force-directed | Network icons | Solid |
| `architecture` | Hierarchical | Rounded rects, cylinders | Orthogonal |
| `uml` | Hierarchical | UML-specific shapes | Solid with decorators |

### Page Commands

```
add_page "<name>"
remove_page "<name>"
switch_page "<name>"
duplicate_page "<name>"
```

### Group and Layer Commands

```
group <ref> [<ref>]* as "<group-name>"
ungroup <ref>
add_to_group <shape-ref> <group-ref>
collapse <ref>
expand <ref>
layer create "<name>"
layer move <ref> to "<layer-name>"
layer show "<name>"
layer hide "<name>"
```

### Annotation Commands

```
label <ref> "<text>"
badge <ref> "<text>" [position:top-left|top-right|bottom-left|bottom-right]
tooltip <ref> "<text>"
step_numbers <ref> [<ref>]*
legend [<entry>]*
title "<text>"
```

Legend entries use the format `"<label>":"<color>"`:
```
legend "Service":"blue" "Database":"green" "External":"orange" "Decision":"yellow"
```

### Bulk Commands

```
batch
  <command>
  <command>
  ...
end

for_each <selector> do <command-template>

clone_structure <ref> as "<new-name-prefix>"
```

In `for_each`, the current item is referenced as `$item`:
```
for_each @type:rounded do badge $item "v2" position:top-right
for_each @group:Backend do style $item shadow:true
```

`clone_structure` duplicates a group or subgraph, renaming all labels with the new prefix:
```
clone_structure @group:Backend as "Staging-Backend"
# Backend/AuthService -> Staging-Backend/AuthService
# Backend/UserDB -> Staging-Backend/UserDB
# All internal edges are duplicated
```

---

## 11. Component Library

### Built-in Categories

#### Flowchart
| Component | Shape | Default Style |
|-----------|-------|---------------|
| `terminal` | rounded rectangle | green fill, bold text |
| `process` | rectangle | blue fill |
| `decision` | diamond | yellow fill |
| `data` | parallelogram | gray fill |
| `document` | document shape | white fill |
| `predefined-process` | double-bordered rect | blue fill |
| `manual-operation` | trapezoid | gray fill |

#### UML
| Component | Shape | Default Style |
|-----------|-------|---------------|
| `class` | list shape (3 sections) | white fill |
| `interface` | list shape + header | white fill, italic name |
| `package` | tabbed rectangle | light yellow fill |
| `actor` | stick figure | no fill |
| `use-case` | ellipse | white fill |
| `lifeline` | rectangle + dashed line | white fill |
| `activation` | narrow rectangle on lifeline | blue fill |

#### AWS (selected)
| Component | Icon Source | Default Style |
|-----------|-----------|---------------|
| `aws-ec2` | AWS icon set | Orange accent |
| `aws-s3` | AWS icon set | Green accent |
| `aws-lambda` | AWS icon set | Orange accent |
| `aws-rds` | AWS icon set | Blue accent |
| `aws-sqs` | AWS icon set | Pink accent |
| `aws-sns` | AWS icon set | Pink accent |
| `aws-cloudfront` | AWS icon set | Purple accent |
| `aws-api-gateway` | AWS icon set | Purple accent |
| `aws-ecs` | AWS icon set | Orange accent |
| `aws-eks` | AWS icon set | Orange accent |
| `aws-dynamodb` | AWS icon set | Blue accent |
| `aws-elasticache` | AWS icon set | Blue accent |
| `aws-route53` | AWS icon set | Purple accent |
| `aws-vpc` | AWS icon set | Green accent |
| `aws-subnet` | AWS icon set | Green accent |
| `aws-security-group` | AWS icon set | Red accent |
| `aws-iam` | AWS icon set | Red accent |

#### Azure (selected)
| Component | Icon Source | Default Style |
|-----------|-----------|---------------|
| `azure-vm` | Azure icon set | Blue accent |
| `azure-blob` | Azure icon set | Blue accent |
| `azure-functions` | Azure icon set | Yellow accent |
| `azure-cosmos-db` | Azure icon set | Blue accent |
| `azure-service-bus` | Azure icon set | Blue accent |
| `azure-app-service` | Azure icon set | Blue accent |
| `azure-aks` | Azure icon set | Blue accent |
| `azure-sql-database` | Azure icon set | Blue accent |

#### GCP (selected)
| Component | Icon Source | Default Style |
|-----------|-----------|---------------|
| `gcp-compute` | GCP icon set | Blue accent |
| `gcp-storage` | GCP icon set | Blue accent |
| `gcp-cloud-functions` | GCP icon set | Blue accent |
| `gcp-bigquery` | GCP icon set | Blue accent |
| `gcp-pub-sub` | GCP icon set | Red accent |
| `gcp-cloud-run` | GCP icon set | Blue accent |
| `gcp-gke` | GCP icon set | Blue accent |
| `gcp-cloud-sql` | GCP icon set | Blue accent |

#### Kubernetes
| Component | Shape | Default Style |
|-----------|-------|---------------|
| `k8s-pod` | rounded rect + pod icon | Blue accent |
| `k8s-deployment` | rounded rect + deploy icon | Blue accent |
| `k8s-service` | rounded rect + svc icon | Blue accent |
| `k8s-ingress` | rounded rect + ingress icon | Purple accent |
| `k8s-configmap` | rounded rect + cm icon | Green accent |
| `k8s-secret` | rounded rect + secret icon | Red accent |
| `k8s-pvc` | cylinder + pvc icon | Blue accent |
| `k8s-namespace` | container + ns icon | Gray accent |
| `k8s-node` | rect + node icon | Gray accent |
| `k8s-hpa` | rounded rect + hpa icon | Orange accent |

#### Network
| Component | Shape | Default Style |
|-----------|-------|---------------|
| `server` | server rack shape | Gray fill |
| `router` | router shape | Blue fill |
| `switch` | switch shape | Blue fill |
| `firewall` | firewall shape | Red fill |
| `load-balancer` | LB shape | Green fill |
| `database` | cylinder | Blue fill |
| `cloud` | cloud shape | Light blue fill |
| `client` | desktop shape | Gray fill |
| `mobile` | phone shape | Gray fill |

#### General
All basic geometric shapes available directly by name: `rectangle`, `rounded-rectangle`, `circle`, `diamond`, `cylinder`, `hexagon`, `parallelogram`, `triangle`, `cloud`, `actor`, `document`.

### Custom Component Registration

Users can register custom components that extend built-in types:

**Syntax:**
```
register "<name>" base:<type> [icon:"<path>"] [fill:<color>] [stroke:<color>] [badge:<position>] [label:<position>]
```

**Examples:**
```
register "payment-service" base:rounded icon:"./icons/payment.svg" fill:#E3F2FD stroke:#1565C0 badge:top-right label:bottom
register "kafka-topic" base:parallelogram fill:#FF6F00 stroke:#E65100 label:center
register "auth-gateway" base:hexagon fill:#F3E5F5 stroke:#7B1FA2 badge:top-left
```

Once registered, custom components are used like built-in types:
```
create payment-service:OrderPayment near:OrderService.right
create kafka-topic:UserEvents near:UserService.below
```

Custom component registrations persist for the session. They can be saved to a component library file for reuse across sessions.

---

## 12. Smart Defaults and Inference

The intent layer applies heuristic defaults to minimize the verbosity required from the LLM. These defaults can always be overridden by explicit parameters.

### Type Inference from Labels

When a shape is created without an explicit type (or with the generic `rect` type), the tool infers the type from the label text:

| Trigger Pattern | Inferred Type | Example |
|----------------|---------------|---------|
| Contains "database", "DB", "store", "cache", "redis", "postgres", "mysql", "mongo" | `cylinder` | `create :UserDB` -> cylinder |
| Contains "decision", "check", "if", "condition", "?" | `diamond` | `create :IsValid?` -> diamond |
| Contains "user", "actor", "person", "customer", "admin" | `actor` | `create :Customer` -> actor |
| Contains "queue", "buffer", "stream", "kafka", "sqs", "event" | `parallelogram` | `create :EventStream` -> parallelogram |
| Contains "cloud", "external", "internet", "cdn" | `cloud` | `create :CloudFront` -> cloud |
| Contains "document", "file", "log", "report", "pdf" | `document` | `create :AuditLog` -> document |

If no pattern matches, the default type is `rounded` (rounded rectangle), which is the most common shape in software architecture diagrams.

### Position Inference

| Situation | Default Behavior |
|-----------|-----------------|
| First shape on empty page | Place at (200, 200) |
| Shape added with no position, others exist | Place near the most recently created shape, respecting flow direction |
| Shape added with `near:X` but no direction | Place on the least crowded side of X |
| Shape added with `in:<group>` | Place inside the group's bounding box, auto-expanding if needed |
| Batch creation (`x4`) | Arrange in a row to the right of the last placed shape |

### Edge Inference

| Situation | Default Behavior |
|-----------|-----------------|
| Edge created between shapes | Auto-route orthogonally |
| Edge crosses another shape | Route around the obstacle |
| Multiple edges between same pair | Offset parallel edges to avoid overlap |
| Edge created to a group (`@group:X`) | Create edges to all members of the group |

### Container Inference

| Situation | Default Behavior |
|-----------|-----------------|
| Child shape added to container | Auto-expand container if child doesn't fit |
| All children removed from container | Container retains its size (no auto-shrink) |
| Shape moved out of container | Remove parent-child relationship |
| Shape dragged into container bounds | Add parent-child relationship (in GUI; in studio language, use `in:`) |

### Style Inference

| Situation | Default Behavior |
|-----------|-----------------|
| Shape created with no style | Use theme default for the shape type |
| Edge created with no style | Solid, orthogonal, with filled arrow at target |
| Container created | Semi-transparent fill, dashed border |
| Theme changed | Re-apply theme defaults to shapes that use defaults (not to explicitly styled shapes) |

---

## 13. Error Prevention and Handling

### Errors Prevented by Construction

These error classes are structurally impossible because the tool controls the encoding:

| Error Class | How It Is Prevented |
|-------------|-------------------|
| Orphaned edge references | Edges are created via `connect` -- both endpoints must exist and be resolved before the edge is created |
| Duplicate IDs | IDs are tool-assigned (monotonic counter or UUID), never user-specified |
| Malformed style strings | Semantic properties are converted to style strings by the serializer; the LLM never writes style strings |
| Missing foundation cells | The serializer always emits `id="0"` and `id="1"` cells |
| Invalid XML structure | The LLM never touches XML; the serializer guarantees valid structure |
| Unbalanced XML tags | Same as above |
| Invalid geometry values | Bounds are computed by the tool; negative or zero dimensions are clamped |
| Missing parent references | Parent-child relationships are managed by the model; orphaned children are impossible |

### Errors Still Possible and Their Handling

| Error | Detection | Response |
|-------|-----------|----------|
| Typo in reference | Fuzzy match against all labels, aliases, groups | `error: unknown ref "AthService". did you mean "AuthService"?` |
| Ambiguous reference | Multiple matches at same resolution level | `error: "Service" matches 3 shapes: AuthService, UserService, PaymentService. Use full label or kind-qualified ref (e.g., rounded:AuthService)` |
| Impossible layout constraint | Layout engine reports infeasible | `warn: shapes overlap after layout. auto-expanding canvas.` |
| Circular group membership | A group containing itself | `error: cannot add Backend to Backend (circular group)` |
| Self-edge | `connect A -> A` | Allowed -- creates a self-loop edge (valid in many diagrams) |
| Duplicate labels | Two shapes with identical labels | Allowed -- auto-suffix with number if created in batch; warn if created individually |
| Reference to wrong page | Shape exists on different page | `error: AuthService is on page "System Overview", not current page "Deployment". Use @page:SystemOverview/AuthService or switch_page "System Overview"` |
| Invalid file path | `open` or `save` to nonexistent path | `error: file not found: ./nonexistent.drawio` |
| Empty selector result | Selector matches nothing | `warn: @type:hexagon matched 0 shapes (page has: 5 rounded, 3 cylinder, 2 diamond)` |

### Error Response Format

All errors follow a consistent format:

```
error: <concise description>
  > <original command>
    <caret pointing to issue>
  <suggestion or context>
```

Warnings are non-fatal and include the successful result:

```
ok: created rounded:Service1, rounded:Service2 @row(120,200)
  warn: label "Service" already exists, auto-suffixed to "Service1", "Service2"
```

---

## 14. Response Format

Responses are tiered by information density to minimize token usage for common operations while providing rich detail when needed.

### Tier 1: Confirmations (~30 tokens)

Used for: shape creation, connection, style changes, layout adjustments.

```
ok: created rounded:AuthService @(120,200 140x60)
```
```
ok: styled @type:cylinder fill:#d5e8d4 (3 shapes)
```
```
ok: moved AuthService to @(300,200)
```

Format: `ok: <verb> <subject> <compact-position-or-summary>`

### Tier 2: Topology Changes (~80-120 tokens)

Used for: connections (show updated adjacency), group changes, structural modifications.

```
ok: connected AuthService -> UserDB "queries"
  AuthService: out[UserDB, TokenCache] in[APIGateway]
  UserDB: out[] in[AuthService, AdminPanel]
```

The adjacency summary helps the LLM maintain its mental model of the graph without issuing separate query commands.

### Tier 3: Queries (~200-400 tokens)

Used for: `list`, `describe`, `stats`, `status`, `connections`, `diff`.

```
page: System Overview (12 shapes, 15 edges, 3 groups)
  Backend: AuthService(rounded), UserDB(cylinder), TokenCache(cylinder)
  Frontend: LoginPage(rect), Dashboard(rect), NavBar(rect)
  External: APIGateway(cloud), CDN(cloud)
  Ungrouped: ErrorPage(rect), HealthCheck(diamond)
```

```
status: "System Architecture" (unsaved, 23 ops, 2 checkpoints)
  page: System Overview (12 shapes, 15 edges, 3 groups)
  recent: AuthService(modified), UserDB(created), TokenCache(created)
  checkpoints: "initial" @op:5, "before-refactor" @op:18
  warnings: 0
```

### Tier 4: Screenshots (~1,600 tokens)

Used for: `screenshot`, `preview`, `export` (when returning inline).

Returns a rendered PNG image as base64-encoded content. The MCP response includes both the image and a text summary:

```
screenshot: Backend group (5 shapes, 7 edges, 480x360px)
[image data]
```

### Response Size Budget

| Tier | Target Size | When |
|------|------------|------|
| 1 | 20-40 tokens | Mutations (create, connect, style, move) |
| 2 | 80-120 tokens | Topology changes (connect with adjacency) |
| 3 | 200-400 tokens | Queries (list, describe, status) |
| 4 | 1,600-4,000 tokens | Screenshots (images) |

The tool defaults to the lowest applicable tier. The LLM can request higher detail with explicit query commands.

---

## 15. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| MCP Server | TypeScript + `@modelcontextprotocol/sdk` | draw.io ecosystem is JavaScript/TypeScript; maxGraph is TS; MCP SDK is mature in TS |
| DSL Parser | TypeScript (hand-written recursive descent) | Grammar is simple; hand-written parser gives better error messages than generated parsers |
| XML Generation | maxGraph (mxGraph successor) | Official draw.io API; native TypeScript; full control over mxGraphModel structure |
| Layout Engine | ELK.js | Best-in-class hierarchical/compound graph layout; WASM builds available; incremental mode |
| Rendering | draw.io Desktop CLI (Electron) | Pixel-perfect rendering of all draw.io features including animations and custom shapes |
| State Management | In-memory event-sourced model (TypeScript) | Fast reads, full undo support, cheap checkpoints, no external dependencies |
| Persistence | `.drawio` XML files | Industry standard; Git-friendly; lossless round-trip with draw.io GUI |
| Image Processing | Sharp (Node.js) | Fast region cropping for targeted screenshots; high-quality PNG output |

### Runtime Requirements

- **Node.js** >= 18 (for MCP server)
- **draw.io Desktop** (optional, for screenshot/export -- gracefully degrades without it)
- **MCP-compatible client** (Claude Code, Cursor, etc.)

### Package Dependencies (estimated)

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.x",
    "maxgraph": "^0.x",
    "elkjs": "^0.9",
    "sharp": "^0.33",
    "fast-xml-parser": "^4.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vitest": "^1.x",
    "@types/node": "^20"
  }
}
```

---

## 16. Token Economics

### Per-Edit Token Cost Comparison

| Approach | Tokens per Edit | Failure Rate | Format Knowledge Required |
|----------|----------------|-------------|--------------------------|
| Raw XML | ~1,150 | ~42% | Full XML schema + draw.io style strings |
| Index-guided XML | ~350 | ~15% | Partial XML + style properties |
| Intent API (JSON) | ~220 | ~0% serialization | None (but verbose JSON syntax) |
| **Studio Language** | **~80-120** | **~0% serialization** | **None** |

### Why the Studio Language Wins

1. **No quoting overhead**: `create rounded:Auth[blue]` vs `{"op":"create","type":"rounded","label":"Auth","style":{"fill":"blue"}}`
2. **No key names**: `near:Auth.below` vs `"position":{"relative_to":"Auth","direction":"below"}`
3. **Chaining**: `A -> B -> C` vs three separate connection objects
4. **Selectors**: `@type:cylinder` vs filtering logic in multiple tool calls
5. **Batch shorthand**: `x4` vs four separate create calls

### Total Cost for a Typical Diagram (20 shapes, 25 edges, 3 screenshots)

| Approach | Total Tokens | Estimated Cost (Claude) |
|----------|-------------|------------------------|
| Raw XML | ~30,000 | ~$0.024 |
| Intent API (JSON) | ~7,000 | ~$0.006 |
| **Studio Language** | **~4,000** | **~$0.003** |

The studio language achieves approximately 7.5x token reduction compared to raw XML and 1.75x reduction compared to structured JSON.

---

## 17. Session Lifecycle

### Phase 1: Create or Open

```
new "System Architecture" type:architecture
```

The tool:
1. Creates an empty semantic model with one page ("Page 1")
2. Sets the diagram type hint (influences defaults)
3. Returns: `ok: created "System Architecture" (architecture, 1 page, 0 shapes)`

Or for an existing file:
```
open "./existing-system.drawio"
```

The tool:
1. Reads and parses the .drawio XML file
2. Builds the semantic model (shapes, edges, groups, layers)
3. Builds the reference registry
4. Returns: `ok: opened "existing-system.drawio" (2 pages, 24 shapes, 31 edges, 4 groups)`

### Phase 2: Draft

The LLM issues studio language commands. Each command is executed immediately and the tool returns a terse confirmation:

```
create rounded:AuthService[blue]
create rounded:UserService[blue] near:AuthService.right
create cylinder:UserDB[green] near:UserService.below
connect AuthService -> UserService label:"getUserProfile"
connect UserService -> UserDB label:"SELECT"
group AuthService UserService UserDB as "Backend"
```

All operations are recorded in the event log for undo/redo.

### Phase 3: Review

The LLM requests visual feedback:

```
screenshot
```

The tool renders the diagram to PNG and returns the image. The LLM can inspect the result and decide whether adjustments are needed.

For targeted review:
```
screenshot @group:Backend padding:50
```

### Phase 4: Iterate

If changes are needed, the LLM can:

```
checkpoint "v1-layout"
orient @group:Backend vertical align:center spacing:30
style @type:cylinder fill:#e8f5e9 stroke:#2e7d32
screenshot @group:Backend
```

If the result is worse:
```
undo to:"v1-layout"
```

### Phase 5: Save and Export

```
save
export png path:"./system-architecture.png"
export svg path:"./system-architecture.svg"
```

### Phase 6: Resume After Context Truncation

When a long conversation causes context truncation (the LLM loses earlier messages), it can recover the full diagram state with a single command:

```
status
```

Returns (~200 tokens):
```
status: "System Architecture" (saved, 47 ops, 3 checkpoints)
  page: System Overview (12 shapes, 15 edges, 3 groups)
    Backend: AuthService(rounded), UserService(rounded), UserDB(cylinder)
    Frontend: LoginPage(rect), Dashboard(rect), NavBar(rect)
    External: APIGateway(cloud), CDN(cloud)
    Ungrouped: ErrorPage(rect), HealthCheck(diamond)
  page: Deployment (8 shapes, 10 edges, 2 groups)
  checkpoints: "v1-layout" @op:15, "before-styling" @op:30, "final" @op:45
  recent: TokenCache(created), AuthService(styled)
```

This gives the LLM enough context to continue editing without re-reading the entire conversation history.

---

## 18. Future: The Generalized Domain Brain Pattern

The architecture of drawio-mcp-studio embodies a generalizable pattern for building "domain brain" tools -- MCP servers that give LLMs expert-level control over complex domain-specific formats.

### The Pattern

```
[ LLM ] --studio language--> [ Parser ] --> [ Intent Layer ] --> [ Semantic Model ] --> [ Serializer ] --> [ Domain Format ]
```

Each layer has a clear responsibility, and only the rightmost three layers are domain-specific:

| Layer | Reusable? | Domain-Specific? |
|-------|-----------|-------------------|
| Studio language grammar framework | Yes | No (syntax is extensible) |
| Parser infrastructure | Yes | No (grammar rules are pluggable) |
| MCP server framework | Yes | No (tool registration is generic) |
| Event sourcing engine | Yes | No (events are typed generically) |
| Reference resolution | Yes | No (8-level cascade is generic) |
| **Semantic model** | No | **Yes** (entities are domain-specific) |
| **Component library** | No | **Yes** (shapes vs. resources vs. tables) |
| **Serialization** | No | **Yes** (XML vs. HCL vs. YAML) |

### Potential Domain Brains

| Domain | Studio Language Example | Serialization Target |
|--------|----------------------|---------------------|
| **draw.io** (this spec) | `create cylinder:UserDB[green]` | mxGraphModel XML |
| **Terraform** | `create aws-s3:assets versioning:true` | HCL (.tf files) |
| **Kubernetes** | `create deployment:api replicas:3 image:nginx` | YAML manifests |
| **Database Schema** | `create table:users cols:id,email,name` | SQL DDL / migrations |
| **CI/CD** | `create stage:test run:"pytest" after:build` | GitHub Actions YAML |
| **OpenAPI** | `create endpoint:GET:/users response:UserList` | OpenAPI 3.x YAML |

The shared infrastructure (parser framework, event sourcing, reference resolution, MCP server scaffold) could be extracted into a `domain-brain-sdk` package, reducing the effort to build each new domain brain to implementing only the three domain-specific layers.

---

## Appendix A: Example Session

A complete example showing the creation of a microservices architecture diagram:

```
> new "Order Processing System" type:architecture

ok: created "Order Processing System" (architecture, 1 page, 0 shapes)

> create rounded:APIGateway[purple]
> create rounded:OrderService[blue] near:APIGateway.below
> create rounded:PaymentService[blue] near:OrderService.right
> create rounded:NotificationService[blue] near:OrderService.left
> create cylinder:OrderDB[green] near:OrderService.below
> create cylinder:PaymentDB[green] near:PaymentService.below
> create parallelogram:EventBus[orange] near:OrderService.below-right
> create cloud:EmailProvider[gray] near:NotificationService.below

ok: created rounded:APIGateway @(200,100 140x60)
ok: created rounded:OrderService @(200,220 140x60)
ok: created rounded:PaymentService @(400,220 140x60)
ok: created rounded:NotificationService @(0,220 180x60)
ok: created cylinder:OrderDB @(200,360 120x80)
ok: created cylinder:PaymentDB @(400,360 120x80)
ok: created parallelogram:EventBus @(350,360 140x60)
ok: created cloud:EmailProvider @(0,360 140x60)

> connect APIGateway -> OrderService label:"POST /orders"
> connect OrderService -> PaymentService label:"processPayment"
> connect OrderService -> EventBus label:"orderCreated"
> connect EventBus -> NotificationService label:"notify"
> connect NotificationService -> EmailProvider label:"sendEmail"
> connect OrderService -> OrderDB label:"INSERT"
> connect PaymentService -> PaymentDB label:"INSERT"

ok: connected APIGateway -> OrderService "POST /orders"
ok: connected OrderService -> PaymentService "processPayment"
ok: connected OrderService -> EventBus "orderCreated"
ok: connected EventBus -> NotificationService "notify"
ok: connected NotificationService -> EmailProvider "sendEmail"
ok: connected OrderService -> OrderDB "INSERT"
ok: connected PaymentService -> PaymentDB "INSERT"

> group OrderService PaymentService NotificationService as "Services"
> group OrderDB PaymentDB as "Databases"
> checkpoint "initial-layout"
> auto_layout dagre direction:TB spacing:40

ok: grouped "Services" (3 shapes)
ok: grouped "Databases" (2 shapes)
ok: checkpoint "initial-layout"
ok: auto_layout dagre TB (8 shapes repositioned)

> screenshot

screenshot: full page (8 shapes, 7 edges, 640x520px)
[image data]

> style @group:Services shadow:true
> style EventBus fill:#FFF3E0 stroke:#E65100
> badge PaymentService "PCI" position:top-right
> step_numbers APIGateway OrderService PaymentService OrderDB

ok: styled @group:Services shadow:true (3 shapes)
ok: styled EventBus fill:#FFF3E0
ok: badge PaymentService "PCI" top-right
ok: step_numbers 1:APIGateway 2:OrderService 3:PaymentService 4:OrderDB

> title "Order Processing - Microservices Architecture"
> legend "Service":"blue" "Database":"green" "Queue":"orange" "External":"gray"

ok: title added
ok: legend added (4 entries)

> save as:"./order-processing.drawio"
> export png path:"./order-processing.png"

ok: saved to ./order-processing.drawio (8 shapes, 7 edges)
ok: exported PNG to ./order-processing.png (1280x1040px)
```

---

## Appendix B: MCP Configuration

### Claude Code (`settings.json`)

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
| `DRAWIO_STUDIO_THEME` | `light` | Default theme (light, dark, blueprint, sketch) |
| `DRAWIO_STUDIO_GRID_SIZE` | `10` | Default grid size in pixels |
| `DRAWIO_STUDIO_MAX_SHAPES` | `500` | Maximum shapes per page (safety limit) |
| `DRAWIO_STUDIO_SCREENSHOT_SCALE` | `2` | Screenshot resolution multiplier |
| `DRAWIO_STUDIO_PERSIST_LOG` | `false` | If `true`, persists the event log to a `.jsonl` file for debugging. |

---

## Appendix C: Glossary

| Term | Definition |
|------|-----------|
| **Domain Brain** | An MCP tool that gives LLMs expert-level control over a complex domain format through intent-level commands |
| **Studio Language** | The compact DSL used by drawio-mcp-studio, optimized for minimal token usage |
| **Semantic Model** | The in-memory entity graph representing diagram structure (shapes, edges, groups, layers) |
| **Reference** | A label, selector, or variable that identifies one or more shapes in the diagram |
| **Selector** | A pattern-based reference (e.g., `@type:cylinder`) that matches multiple shapes |
| **Checkpoint** | A named snapshot of the event log position, enabling targeted undo |
| **Event Sourcing** | Recording all state changes as a sequence of immutable events |
| **Round-trip** | The ability to open a .drawio file, edit it, and save it without losing any information |
| **Intent Layer** | The MCP server layer that resolves references, infers defaults, and dispatches operations |
| **maxGraph** | The TypeScript successor to mxGraph, the rendering engine behind draw.io |
| **ELK.js** | Eclipse Layout Kernel compiled to JavaScript/WASM, used for automatic graph layout |
