import type { CustomType, CustomTheme, ShapeType } from "../types/index.js";
import { NODE_TYPES } from "../lib/node-types.js";
import { THEMES } from "../lib/themes.js";
import type { ThemeName } from "../types/index.js";

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
  return `DRAW.IO STUDIO — MODEL MAP

DOCUMENT: mxfile > diagram[name] > mxGraphModel > root > mxCell[]
  Cells 0,1 always present. Tool manages all XML structure and IDs.

NODE TYPES:
${generateNodeTypesSection()}

THEMES (fill / stroke):
${generateThemesSection()}

EDGE STYLES: solid, dashed, dotted, animated, thick, curved, orthogonal
ARROWS: -> (directed), <-> (bidirectional), -- (undirected)
ARROW HEADS: arrow, open-arrow, diamond, circle, crow-foot, none

OPERATIONS: add, connect, disconnect, style, move, resize, swap, label, badge,
            group, ungroup, remove, layout, orient, define,
            page, layer, checkpoint, title

LAYOUT: layout @all algo:layered|force|tree dir:TB|LR|BT|RL [spacing:N]
ORIENT: orient TB|LR|BT|RL (sets page flow direction)
MOVE: move REF to:X,Y | to:REGION | near:REF dir:DIR [strict:true]
  Regions: top-left, top-center, top-right, middle-left, center,
           middle-right, bottom-left, bottom-center, bottom-right
  move @group:NAME to:REGION|X,Y (moves entire group)
  Collision prevention ON by default, strict:true to disable
DISCONNECT: disconnect REF -> REF (removes edge between two shapes)
CHECKPOINT: checkpoint NAME (named snapshot for undo to:NAME)
TITLE: title "Diagram Title" (sets diagram title)
PAGE: page add|switch|remove|list "Name"
LAYER: layer create|switch|show|hide|list "Name"

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
  - Custom types (via define) are included in studio_help after creation`;
}

const MODEL_MAP_BASE = buildModelMap();

export function getModelMap(customTypes: Map<string, CustomType>, customThemes?: Map<string, CustomTheme>): string {
  let result = MODEL_MAP_BASE;

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
