import type { CustomType } from "../types/index.js";

const MODEL_MAP_BASE = `DRAW.IO STUDIO — MODEL MAP

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
            group, ungroup, remove, layout, orient, define, page, layer

LAYOUT: layout @all algo:layered|force|tree dir:TB|LR|BT|RL [spacing:N]
ORIENT: orient TB|LR|BT|RL (sets page flow direction)
MOVE: move REF to:X,Y | to:REGION | near:REF dir:DIR [strict:true]
  Regions: top-left, top-center, top-right, middle-left, center,
           middle-right, bottom-left, bottom-center, bottom-right
  move @group:NAME to:REGION|X,Y (moves entire group)
  Collision prevention ON by default, strict:true to disable

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

export function getModelMap(customTypes: Map<string, CustomType>): string {
  if (customTypes.size === 0) {
    return MODEL_MAP_BASE;
  }

  const lines: string[] = [];
  for (const [name, ct] of customTypes) {
    const parts = [`  ${name.padEnd(10)} based on ${ct.base}`];
    if (ct.theme) parts.push(ct.theme);
    if (ct.badge) parts.push(`badge:${ct.badge}`);
    if (ct.defaultSize) parts.push(`${ct.defaultSize.width}x${ct.defaultSize.height}`);
    lines.push(parts.join(", "));
  }

  return MODEL_MAP_BASE + "\n\nCUSTOM TYPES:\n" + lines.join("\n");
}
