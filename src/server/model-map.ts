import type { CustomType, CustomTheme, ShapeType } from "../types/index.js";
import { NODE_TYPES } from "../lib/node-types.js";
import { THEMES } from "../lib/themes.js";
import type { ThemeName } from "../types/index.js";
import { getStencilPack, listStencilPacks } from "../lib/stencils/index.js";

/**
 * Generate the NODE TYPES section from the runtime registry.
 * Matches the existing compact format: "  shorthand    description"
 */
function generateNodeTypesSection(): string {
  const lines: string[] = [];
  for (const [name, def] of Object.entries(NODE_TYPES) as [ShapeType, typeof NODE_TYPES[ShapeType]][]) {
    lines.push(`  ${name.padEnd(10)} ${def.description.toLowerCase()}`);
  }
  return lines.join("\n");
}

/**
 * Generate the THEMES section from the runtime registry.
 * Pairs themes on the same line for compactness.
 */
function generateThemesSection(): string {
  const entries = Object.entries(THEMES) as [ThemeName, typeof THEMES[ThemeName]][];
  const lines: string[] = [];

  for (let i = 0; i < entries.length; i += 2) {
    const [name1, colors1] = entries[i];
    let line = `  ${name1.padEnd(10)} ${colors1.fill} / ${colors1.stroke}`;
    if (colors1.fontColor) line += ` (light text)`;

    if (i + 1 < entries.length) {
      const [name2, colors2] = entries[i + 1];
      line += `    ${name2.padEnd(8)} ${colors2.fill} / ${colors2.stroke}`;
      if (colors2.fontColor) line += ` (light text)`;
    }

    lines.push(line);
  }
  return lines.join("\n");
}

function buildModelMap(): string {
  return `DRAW.IO FCP — MODEL MAP

DOCUMENT: mxfile > diagram[name] > mxGraphModel > root > mxCell[]
  Cells 0,1 always present. Tool manages all XML structure and IDs.

NODE TYPES:
${generateNodeTypesSection()}

THEMES (fill / stroke):
${generateThemesSection()}

EDGE STYLES: solid, dashed (- - -), dotted (· · ·), animated, thick, curved, orthogonal
ARROWS: -> (directed), <-> (bidirectional), -- (undirected)
ARROW HEADS: arrow, open-arrow, diamond, circle, crow-foot, none

OPERATIONS:

ADD
  add TYPE LABEL [theme:T] [near:REF dir:DIR] [at:X,Y] [size:WxH] [label:"Display Name"]
  label: overrides display text (LABEL remains the ref until label: is set)
  Ex: add svc AuthService theme:blue near:Gateway dir:right
  Ex: add db Postgres label:"PostgreSQL 16" theme:blue

CONNECT
  connect SRC ARROW TGT [label:"text"] [style:STYLE] [exit:FACE entry:FACE]
  FACE = top | bottom | left | right
  Ex: connect AuthService -> UserDB label:queries style:dashed
  Ex: connect Client -> Server label:HTTPS style:solid exit:bottom entry:top

DISCONNECT
  disconnect SRC -> TGT
  Ex: disconnect AuthService -> UserDB

LABEL
  label REF "new text"              rename shape
  label SRC -> TGT "new text"       relabel edge
  Ex: label Gateway "API Gateway v2"
  Ex: label Auth -> DB "read/write"

STYLE
  style REF [fill:#HEX] [stroke:#HEX] [font:#HEX] [fontSize:N]
  style REF [bold] [italic] [underline] [no-bold] [no-italic] [no-underline]
  style REF [font-family:NAME] [align:left|center|right] [valign:top|middle|bottom]
  style @SELECTOR [same params]
  Ex: style AuthService fill:#ff0000 bold fontSize:16
  Ex: style @type:db font-family:Courier align:left

MOVE
  move REF to:X,Y | to:REGION | near:REF dir:DIR [strict:true]
  move @group:NAME to:REGION|X,Y
  Regions: top-left, top-center, top-right, middle-left, center,
           middle-right, bottom-left, bottom-center, bottom-right
  Collision prevention ON by default; strict:true disables it

RESIZE
  resize REF to:WxH
  Ex: resize AuthService to:200x80

REMOVE
  remove REF | remove @SELECTOR
  Ex: remove OldService

SWAP
  swap REF REF (exchange positions)

BADGE
  badge REF "text" [pos:POSITION]
  POSITION = top-left | top-right | bottom-left | bottom-right
  Ex: badge AuthService "v2" pos:top-right

GROUP / UNGROUP
  group REF REF ... as:"Group Name"
  ungroup "Group Name"
  Ex: group AuthService UserDB as:"Backend"

LAYOUT
  layout @all algo:layered|force|tree dir:TB|LR|BT|RL [spacing:N]
  Ex: layout @all algo:layered dir:TB spacing:60

ORIENT
  orient TB|LR|BT|RL (sets page flow direction)

DEFINE
  define NAME base:TYPE [theme:T] [badge:"text"] [size:WxH]
  Ex: define microservice base:svc theme:blue badge:μ

LOAD (stencil packs)
  load list                          show available stencil packs
  load PACK                          activate a stencil pack (aws, azure, gcp, k8s, cisco, ibm)
  Ex: load aws                       then: add lambda MyFunc

PAGE
  page add|switch|remove|list "Name"

LAYER
  layer create|switch|show|hide|list "Name"

CHECKPOINT
  checkpoint NAME (snapshot; undo to:NAME restores)

TITLE
  title "Diagram Title"

SNAPSHOT
  snapshot                           render diagram to PNG (works via drawio or drawio_query)
  snapshot width:800                 custom width (default 1200)
  snapshot page:2                    specific page (1-based)

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
  - Custom types (via define) are included in drawio_help after creation`;
}

const MODEL_MAP_BASE = buildModelMap();

/**
 * Build domain-specific sections for the VerbRegistry reference card.
 * Used by createFcpServer() to append drawio-specific reference material
 * after the verb listing.
 */
export function buildReferenceCardSections(snapshotAvailable: boolean): Record<string, string> {
  const sections: Record<string, string> = {};

  sections["Node Types"] = generateNodeTypesSection();

  sections["Themes (fill / stroke)"] = generateThemesSection();

  sections["Edge Styles"] = `  solid, dashed (- - -), dotted (· · ·), animated, thick, curved, orthogonal
  Arrows: -> (directed), <-> (bidirectional), -- (undirected)
  Arrow heads: arrow, open-arrow, diamond, circle, crow-foot, none`;

  sections["Selectors"] = `  @type:TYPE, @group:NAME, @connected:REF, @recent, @recent:N,
  @all, @orphan, @page:NAME, @layer:NAME`;

  sections["Response Prefixes"] = `  +  shape created       ~  edge created/modified
  *  shape modified      -  shape/edge removed
  !  group operation     @  layout/position change`;

  sections["Conventions"] = `  - Labels are unique identifiers - no ID management needed
  - Position auto-computed if omitted (near last created shape)
  - near:REF dir:DIRECTION places relative to existing shape
  - All XML structure, IDs, and geometry handled by the tool
  - Call drawio_help for full reference with examples`;

  if (snapshotAvailable) {
    sections["Snapshot"] = `  snapshot                           render diagram to PNG for visual review
  snapshot width:800                 custom width (default 1200)
  snapshot page:2                    specific page (1-based)`;
  }

  return sections;
}

export function getModelMap(
  customTypes: Map<string, CustomType>,
  customThemes?: Map<string, CustomTheme>,
  loadedStencilPacks?: Set<string>,
  snapshotAvailable?: boolean,
): string {
  let result = MODEL_MAP_BASE;

  // Always show stencil loading instructions
  const availablePacks = listStencilPacks().map(p => p.id).join(", ");
  result += `\n\nSTENCILS:
  load list                          show available stencil packs
  load PACK                          activate a stencil pack (${availablePacks})`;

  // Show loaded stencil pack details
  if (loadedStencilPacks && loadedStencilPacks.size > 0) {
    for (const packId of loadedStencilPacks) {
      const pack = getStencilPack(packId);
      if (!pack) continue;

      // Group entries by category
      const categories = new Map<string, string[]>();
      for (const entry of pack.entries) {
        const cat = categories.get(entry.category) ?? [];
        cat.push(entry.id);
        categories.set(entry.category, cat);
      }

      const catLines = [...categories.entries()].map(
        ([cat, ids]) => `  ${(cat + ":").padEnd(14)} ${ids.join(", ")}`
      );

      result += `\n\nSTENCILS (${packId}):\n` + catLines.join("\n");
    }
  }

  if (snapshotAvailable) {
    result += `\n\nSNAPSHOT:
  snapshot                           render diagram to PNG for visual review
  snapshot width:800                 custom width (default 1200)
  snapshot page:2                    specific page (1-based)`;
  }

  if (customThemes && customThemes.size > 0) {
    const lines: string[] = [];
    for (const [name, ct] of customThemes) {
      lines.push(`  ${name.padEnd(10)} ${ct.fill} / ${ct.stroke}${ct.fontColor ? `  font:${ct.fontColor}` : ""}`);
    }
    result += "\n\nCUSTOM THEMES:\n" + lines.join("\n");
  }

  if (customTypes.size > 0) {
    const lines: string[] = [];
    for (const [name, ct] of customTypes) {
      const parts = [`  ${name.padEnd(10)} based on ${ct.base}`];
      if (ct.theme) parts.push(ct.theme);
      if (ct.badge) parts.push(`badge:${ct.badge}`);
      if (ct.defaultSize) parts.push(`${ct.defaultSize.width}x${ct.defaultSize.height}`);
      lines.push(parts.join(", "));
    }
    result += "\n\nCUSTOM TYPES:\n" + lines.join("\n");
  }

  return result;
}
