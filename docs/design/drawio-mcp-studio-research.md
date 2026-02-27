# drawio-mcp-studio — Research Findings

> Consolidated findings from 7+ research agents across 2 rounds of investigation.
> Date: 2026-02-25

---

## Table of Contents

1. [The Core Problem](#1-the-core-problem)
2. [How LLM Tool Calls Work](#2-how-llm-tool-calls-work)
3. [Draw.io XML Format Analysis](#3-drawio-xml-format-analysis)
4. [Prior Art: Existing Tools](#4-prior-art-existing-tools)
5. [Prior Art: Industry Approaches](#5-prior-art-industry-approaches)
6. [Navigation Patterns for Large Files](#6-navigation-patterns-for-large-files)
7. [Index / Glossary / TOC Concepts](#7-index--glossary--toc-concepts)
8. [Diagram DSLs and Layout Engines](#8-diagram-dsls-and-layout-engines)
9. [XML Generation Options](#9-xml-generation-options)
10. [Rendering and Visual Feedback](#10-rendering-and-visual-feedback)
11. [The "Domain Brain" Pattern](#11-the-domain-brain-pattern)
12. [Key Sources and URLs](#12-key-sources-and-urls)

---

## 1. The Core Problem

An LLM editing large structured files (e.g., 5000-line draw.io XML) faces:

- **Context bloat**: Reading a file costs ~50K tokens that stay in context for the rest of the conversation
- **No persistent state**: Each turn re-reads the entire conversation from scratch
- **Low information density**: Draw.io XML is 10-15% meaningful content, 85-90% boilerplate
- **High failure rate**: LLMs produce invalid draw.io XML ~42% of the time (missing foundation cells, orphaned refs, ID collisions, style syntax errors)

### Quantified waste

For a single vertex cell:
- Raw XML: ~60 tokens
- Meaningful content: ~9 tokens (ID, label, style class, position, parent)
- Information density: **14-16%**

For a single edge cell:
- Raw XML: ~55 tokens
- Meaningful content: ~4 tokens (ID, source, target, style)
- Information density: **7-9%**

---

## 2. How LLM Tool Calls Work

Each "turn" is one API round-trip:
1. LLM receives entire context (system prompt + conversation history + tool results)
2. LLM produces a response (text + tool calls)
3. Tool results get added to context permanently
4. Next turn re-processes everything

Key constraints:
- No persistent memory between turns
- Multiple parallel tool calls possible in one response, but no sequential dependency within a turn
- Every tool result inflates context for ALL subsequent turns
- LLM makes fresh decisions each turn based on full context

---

## 3. Draw.io XML Format Analysis

### Document structure

```
mxfile → diagram → mxGraphModel → root → [mxCell elements]
```

- Cell `id="0"`: mandatory root cell
- Cell `id="1"`: mandatory default layer, `parent="0"`
- Vertices: `vertex="1"`, contain `<mxGeometry>`
- Edges: `edge="1"`, `source` and `target` attributes reference vertex IDs
- Groups: containers where children set `parent` to the container's ID
- Layers: additional cells with `parent="0"`
- Styles: semicolon-delimited key=value strings (e.g., `rounded=1;fillColor=#dae8fc;`)

### Redundancy patterns in a 5000-line file

| Component | % of file | Token waste |
|-----------|-----------|-------------|
| Repeated style strings | 40-50% of cell tokens | Extreme (25 identical 85-char strings) |
| XML boilerplate (`<mxCell>`, `as="geometry"`, etc.) | 20-30% | High |
| Fixed attributes (`vertex="1"`, `edge="1"`, `relative="1"`) | ~10% | Moderate |
| Whitespace/indentation | 50-60% of lines | Significant |

### Common LLM failure modes (from drawio-ninja project)

1. Missing foundation cells (id="0", id="1") — file won't open
2. ID collisions — loses track during sequential generation
3. Orphaned edge references — edges point to nonexistent shapes
4. Invalid parent references — circular or missing parents
5. Style string syntax errors — missing semicolons, misspelled properties
6. ~58% first-attempt accuracy for diagram generation

### Compression potential

A compact notation achieves **4:1 compression**:
```
Raw:     <mxCell id="2" value="Auth Service" style="rounded=1;whiteSpace=wrap;..." vertex="1" parent="1">
           <mxGeometry x="100" y="200" width="120" height="60" as="geometry"/>
         </mxCell>

Compact: #2 "Auth Service" [svc] @(100,200 120x60)
```

---

## 4. Prior Art: Existing Tools

### jgraph/drawio-mcp (official, 745 stars)
- **URL**: https://github.com/jgraph/drawio-mcp
- **Approach**: LLM generates raw XML, CSV, or Mermaid. Tool opens it in draw.io editor.
- **Tools**: `open_drawio_xml`, `open_drawio_csv`, `open_drawio_mermaid`
- **Limitation**: Not an editor. LLM must produce complete diagram specification each time.
- **Useful**: Supports Mermaid-to-draw.io conversion.

### lgazo/drawio-mcp-server (723 stars)
- **URL**: https://github.com/lgazo/drawio-mcp-server
- **Approach**: Bridge to running Draw.io instance via WebSocket
- **Tools**: 13 fine-grained CRUD tools (add-rectangle, add-edge, edit-cell, delete-cell, etc.)
- **Architecture**: Stateful via Draw.io browser instance. No standalone mode.
- **v1.8.0**: Built-in editor (embeds Draw.io, no extension needed)
- **Limitations**: Needs browser, no auto-layout, raw style strings, no batch operations, no undo
- **Good patterns**: Shape library discovery (get-shape-categories, get-shapes-in-category), paginated model inspection

### yohasacura/drawio-mcp (PyPI, 1 star)
- **URL**: https://github.com/yohasacura/drawio-mcp
- **Approach**: Stateful Python MCP server, direct XML generation
- **Tools**: 5 tools with 40+ actions (diagram, draw, style, layout, inspect)
- **Features**: 310 shape presets, 44 edge styles, 21 color themes, Sugiyama layout, "polish" command
- **Limitations**: Very new (Feb 9 2026), single author, no community adoption, no custom shapes, no animations, no rendering, no DSL, verbose JSON parameters
- **Validates**: Stateful server + direct XML generation is the right pattern

### Sujimoshi/drawio-mcp (28 stars)
- **URL**: https://github.com/Sujimoshi/drawio-mcp
- **Approach**: Stateless TypeScript MCP, operates on `.drawio.svg` files
- **Features**: Basic shape creation (rectangles, ellipses, cylinders, clouds, actors), edge creation
- **Limitations**: Very basic, no layout, limited shapes

### drawpyo (Python library, 358 stars)
- **URL**: https://github.com/MerrimanInd/drawpyo
- **What it does**: Programmatic draw.io file creation in Python
- **Features**: Shape creation, edges, containers, TreeDiagram auto-layout, external library import (AWS/Azure/GCP), round-trip reading (v0.2.5)
- **Limitations**: Python only, tree-only layout, no animations, no image embedding, one maintainer
- **Version**: 0.2.5 (Dec 2025)

### maxGraph (mxGraph successor, 1,100 stars)
- **URL**: https://github.com/maxGraph/maxGraph
- **What it is**: Full TypeScript rewrite of mxGraph with modern API
- **API**: `graph.insertVertex({parent, position, size, value, style})` — typed objects instead of positional params
- **XML**: `ModelXmlSerializer` for import/export of mxGraphModel XML
- **Server-side?**: Requires DOM (jsdom). Fragile headless — SVG APIs (`createSVGMatrix`, `getBBox`) throw errors. NOT recommended for server-side XML generation.
- **Version**: 0.22.0 (pre-1.0, ~2 active maintainers)
- **Verdict**: Possible with jsdom for model-only operations, but fighting the architecture. Direct XML generation is simpler.

---

## 5. Prior Art: Industry Approaches

### Cursor's "Fast Apply"
- **URL**: https://cursor.com/blog/instant-apply
- Separates planning from application: frontier model produces "sketch" with `// ...existing code...` placeholders, specialized 70B model merges at 1000 tok/sec via speculative decoding
- The LLM never reads/emits the full file
- Source: https://fireworks.ai/blog/cursor

### Morph's Fast Apply
- **URL**: https://morphllm.com/fast-apply-model
- Same pattern as API: 4,500 tok/sec (v3-fast), 99.2% accuracy
- "Deterministic merge step" — takes intent, merges with structure awareness

### Aider's Edit Formats
- **URL**: https://aider.chat/docs/more/edit-formats.html
- Benchmarked: Whole file, SEARCH/REPLACE (most common), Unified diff (3x less "laziness")
- SEARCH/REPLACE breaks on ambiguous matches. 3 lines of context improves match rates.

### Edit-Guard (Ceaksan)
- **URL**: https://github.com/ceaksan/edit-guard
- Three failure modes: "Line drift" (3+ sequential edits), "Lost in the middle" (500+ line files), "Formatter mismatch"
- Script generation most efficient (6K tokens), Atomic write most expensive (43K tokens)

### Progressive Context Loading (William Zujkowski)
- **URL**: https://williamzujkowski.github.io/posts/from-150k-to-2k-tokens-how-progressive-context-loading-revolutionizes-llm-development-workflows/
- 150K → 2K tokens/session (98% reduction)
- Load relevant code on-demand, not the entire repo
- $4.50/session → $0.06/session

### Context Engineering (Anthropic)
- **URL**: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Four strategies: write, select, compress, and isolate
- "The delicate art of filling the context window with just the right information for the next step"

---

## 6. Navigation Patterns for Large Files

Research on patterns from editors, databases, and streaming systems:

### Priority ranking

| Priority | Pattern | Token savings | Cognitive fit | Impl cost |
|----------|---------|--------------|---------------|-----------|
| P0 | **Named marks** | High | Very high | Low |
| P0 | **Session diff** | Very high | Very high | Low |
| P0 | **Cursor with context window** | High | Medium | Low |
| P1 | **Registers/clipboards** | Very high | Medium-high | Medium |
| P1 | **Structural outline** | Very high | Very high | High |
| P2 | **Named viewports** | High | High | Medium |
| P3 | **Reactive subscriptions** | Medium | Low | High |

### Key insight: `session_state()` as re-orientation primitive

After context truncation, one ~500-token call returns all marks, registers, cursor position, pending edits. 99% cheaper than re-reading files.

### Key insight: Names over numbers

LLMs think in names, not line numbers. Named marks ("auth_handler") are the highest cognitive-fit pattern. Auto-adjustment on edits is non-negotiable.

---

## 7. Index / Glossary / TOC Concepts

### Progressive disclosure (multi-level zoom)

| Level | Content | Tokens |
|-------|---------|--------|
| L0 | File stats (element count, groups, types) | 5-10 |
| L1 | Section listing with summaries | 50-80 |
| L2 | Element listing within a section | 80-150 |
| L3 | Full element detail with all attributes | 30-80 |

Composable in single call: "L1 + L2 for backend_services + L3 for auth_service"

### Navigation cost comparison

- Full file read: ~50,000 tokens
- Progressive: L0 + L1 + L2 + L3 = ~250-400 tokens
- **10-20x reduction** with improved edit accuracy (focused context)

### Five interacting components

| Component | Purpose | Cost |
|-----------|---------|------|
| Glossary | "What's in this file?" | 100-200 tokens |
| TOC | "Where are things?" | 50-150 tokens/level |
| Index | "Which specific element?" | 40-60 tokens/entry |
| Concordance | "What matches this pattern?" | 10-20 tokens/match |
| Cross-references | "What connects to what?" | 20-40 tokens/element |

### Staleness management

Region-based invalidation: after an edit, shift line numbers below the edit, re-index only the affected region. Maps to Slipstream's existing conflict detection.

---

## 8. Diagram DSLs and Layout Engines

### DSL comparison

| DSL | Expressiveness | Layout | Output | As intermediate layer? |
|-----|---------------|--------|--------|----------------------|
| Mermaid.js | Limited (basic flows, sequences) | dagre (auto, no manual) | SVG | Possible but limited |
| D2 | Good (containers, classes, icons) | ELK/TALA (pluggable) | SVG/PNG/PDF | Best candidate but no draw.io output |
| PlantUML | Broad (UML, many types) | Graphviz | PNG/SVG | Verbose, Java dependency |
| Graphviz DOT | Graphs only | dot/neato/fdp/sfdp/circo | SVG/PNG/PDF | Good for layout, not for UX |

**None can produce editable .drawio files.** All produce final rendered output. This is why direct XML generation is necessary.

### ELK.js (Eclipse Layout Kernel)

- **URL**: https://github.com/kieler/elkjs (~2,000 stars)
- **Runs in Node.js**: Yes, natively. No DOM required.
- **API**: Input graph JSON → output graph JSON with x,y positions
- **Algorithms**: layered (Sugiyama), stress, force, mrtree, radial, box, rectpacking, disco
- **Compound graphs**: Full support via `elk.hierarchyHandling: 'INCLUDE_CHILDREN'`
- **Edge routing**: Orthogonal, polyline, splines
- **Config**: 140+ options for ELK Layered alone
- **Incremental**: NOT supported (full recompute each time). Fine for AI generation.
- **License**: EPL-2.0

### Other layout options

- **dagre.js**: Deprecated, no longer maintained. Successor: ELK.js
- **Graphviz**: Excellent algorithms but requires native binary
- **draw.io internal layouts**: Vertical tree, horizontal tree, radial, organic, circle, compact tree, flow

---

## 9. XML Generation Options

### Option A: maxGraph (NOT recommended for server-side)

- Requires DOM (jsdom) — `Graph` constructor needs a container element
- SVG APIs (`createSVGMatrix`, `getBBox`) throw in jsdom
- Possible for model-only operations but fragile
- Pre-1.0, ~2 maintainers

### Option B: drawpyo (possible but not ideal)

- Generates valid .drawio files directly
- Supports external shape libraries (AWS, Azure, GCP)
- But: Python dependency, subprocess management, limited features

### Option C: Direct XML generation (RECOMMENDED)

- Format is simple and stable since 2005
- Full control over every feature
- Zero dependencies — just TypeScript string/template construction
- A few hundred lines of code
- If it opens in draw.io, it works

The format is a flat list of `<mxCell>` elements wrapped in `<mxfile><diagram><mxGraphModel><root>`. Style strings are semicolon-delimited key=value pairs. The XML structure never changed in 20+ years.

---

## 10. Rendering and Visual Feedback

### Server-side rendering options

| Option | Fidelity | Speed | Weight |
|--------|----------|-------|--------|
| draw.io Desktop CLI | Perfect | 1-3s | Heavy (Electron) |
| Puppeteer + draw.io web | Perfect | 1-2s | Heavy (Chromium) |
| Custom SVG via mxGraph | Partial | ~100ms | Light |

**Recommendation**: draw.io CLI for accurate exports, with potential fast-path SVG for previews.

### LLM visual feedback

- Claude can read labels, identify shapes, trace connections, verify basic layout
- 1024x768 or 1200x900 sufficient for diagrams with readable fonts (12pt+)
- Token cost: ~1,600 tokens per image (~$0.008 at Opus pricing)
- 5-10 verification iterations: $0.04-$0.08 total — negligible
- Region screenshots more useful than full-page (focus LLM attention)

---

## 11. The "Domain Brain" Pattern

### The fundamental inversion

Traditional: LLM as brain, tool as hands
Studio: Tool as domain expert, LLM as intent expert

| Intelligence type | Owner | Examples |
|-------------------|-------|---------|
| **Structural validity** | Tool | Valid XML, ID uniqueness, referential integrity |
| **Spatial reasoning** | Tool | Layout, alignment, routing, collision avoidance |
| **Format encoding** | Tool | XML serialization, style strings, geometry |
| **Default inference** | Tool | "database" → cylinder, auto-sizing, auto-routing |
| **Semantic understanding** | LLM | What authentication involves, microservice patterns |
| **Creative decisions** | LLM | What shapes to create, how to organize |
| **Disambiguation** | LLM | "Which Auth Service did I mean?" |

### Design principle

**Smart about HOW, never about WHAT.** The tool never initiates creative decisions. It executes them with domain expertise. The "what" always comes from the LLM.

### Generalizability

The pattern applies beyond draw.io to any domain with:
- Complex serialization format
- Structural invariants
- Spatial/layout concerns
- Repetitive patterns
- The need for domain expertise the LLM shouldn't learn

Examples: Terraform, Kubernetes YAML, database schemas, CI/CD pipelines.

### The composability opportunity

Multiple Domain Brains coordinated by the LLM: "Create an architecture diagram that matches this Terraform configuration." The LLM reads Terraform state via one brain and generates diagram operations via another.

---

## 12. Key Sources and URLs

### Tools and Libraries
- Cursor Fast Apply: https://cursor.com/blog/instant-apply
- Morph Fast Apply: https://morphllm.com/fast-apply-model
- Aider Edit Formats: https://aider.chat/docs/more/edit-formats.html
- Edit-Guard: https://github.com/ceaksan/edit-guard
- drawio-ninja (LLM failure modes): https://github.com/simonpo/drawio-ninja
- jgraph/drawio-mcp: https://github.com/jgraph/drawio-mcp
- lgazo/drawio-mcp-server: https://github.com/lgazo/drawio-mcp-server
- yohasacura/drawio-mcp: https://github.com/yohasacura/drawio-mcp
- Sujimoshi/drawio-mcp: https://github.com/Sujimoshi/drawio-mcp
- drawpyo: https://github.com/MerrimanInd/drawpyo
- maxGraph: https://github.com/maxGraph/maxGraph
- ELK.js: https://github.com/kieler/elkjs
- D2 language: https://d2lang.com
- Python diagrams library: https://github.com/mingrammer/diagrams

### Research and Articles
- Progressive Context Loading: https://williamzujkowski.github.io/posts/from-150k-to-2k-tokens-how-progressive-context-loading-revolutionizes-llm-development-workflows/
- Context Engineering (Anthropic): https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Context Engineering (LangChain): https://blog.langchain.com/context-engineering-for-agents/
- The Edit Trick: https://waleedk.medium.com/the-edit-trick-efficient-llm-annotation-of-documents-d078429faf37
- GenAI-DrawIO-Creator (AWS): https://arxiv.org/abs/2601.05162
- Semantic Zoom: https://www.emergentmind.com/topics/semantic-zoom
- CompactPrompt: https://arxiv.org/abs/2510.18043
- PRISM (structured schemas): https://arxiv.org/pdf/2412.18914
- InkSync: https://people.ischool.berkeley.edu/~hearst/papers/laban_uist_2024.pdf
- Code Surgery: https://fabianhertwig.com/blog/coding-assistants-file-edits/

### Draw.io Format
- XML format: https://www.drawio.com/doc/faq/diagram-source-edit
- mxGraphModel API: https://jgraph.github.io/mxgraph/docs/js-api/files/model/mxGraphModel-js.html
- mxCell API: https://jgraph.github.io/mxgraph/docs/js-api/files/model/mxCell-js.html
- File format spec: https://docs.fileformat.com/web/drawio/
- Custom shape libraries: https://www.drawio.com/doc/faq/format-custom-shape-library
- Uncompressed XML: https://j2r2b.github.io/2019/08/01/drawio-decompressed-xml.html

### Layout and Rendering
- ELK documentation: https://eclipse.dev/elk/
- ELK options reference: https://www.eclipse.org/elk/reference/options.html
- ELK paper: https://arxiv.org/abs/2311.00533
- Virtual scrolling (HighTable): https://rednegra.net/blog/20260212-virtual-scroll/
- Hierarchical aggregation: https://inria.hal.science/hal-00696751v1/document
- AST-grep: https://ast-grep.github.io/
