import type {
  OpResult, ParsedOp, Shape, Edge, ArrowType, EdgeStyleSet,
  ShapeType, ThemeName, Badge,
} from "../types/index.js";
import { DiagramModel } from "../model/diagram-model.js";
import { parseOp, isParseError } from "../parser/parse-op.js";
import { resolveRef } from "../parser/resolve-ref.js";
import { isShapeType, inferTypeFromLabel, computeDefaultSize } from "../lib/node-types.js";
import { isThemeName, resolveColor } from "../lib/themes.js";
import { nextLayerId } from "../model/id.js";
import { getModelMap } from "./model-map.js";
import {
  formatShapeCreated, formatEdgeCreated, formatShapeModified,
  formatShapeDeleted, formatGroupCreated, formatStatus,
  formatList, formatConnections, formatDescribe, formatStats,
  formatHistory,
} from "./response-formatter.js";
import { tokenize, isKeyValue, parseKeyValue } from "../parser/tokenizer.js";
import { serializeDiagram } from "../serialization/serialize.js";
import { deserializeDiagram } from "../serialization/deserialize.js";
import { readFileSync, writeFileSync } from "node:fs";
import { runElkLayout } from "../layout/elk-layout.js";
import type { LayoutOptions } from "../layout/elk-layout.js";

export class IntentLayer {
  model: DiagramModel;

  constructor() {
    this.model = new DiagramModel();
  }

  // ── Suggestion helpers ──────────────────────────────────

  /** Build a suggestion by replacing a bad ref with the suggested label in the raw op string. */
  private buildTypoSuggestion(raw: string, badRef: string, suggestedLabel: string): string {
    return raw.replace(badRef, suggestedLabel);
  }

  /** Build a type-qualified suggestion for ambiguous references. */
  private buildAmbiguousSuggestion(raw: string, badRef: string, shapes: Shape[]): string {
    const first = shapes[0];
    const qualified = `${first.type}:${badRef}`;
    return raw.replace(badRef, qualified);
  }

  // ── Main entry points ──────────────────────────────────

  async executeOps(ops: string[]): Promise<OpResult[]> {
    const results: OpResult[] = [];
    for (const op of ops) {
      results.push(await this.executeSingleOp(op));
    }
    return results;
  }

  executeQuery(query: string): string {
    try {
      return this.dispatchQuery(query.trim());
    } catch (err: unknown) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  executeSession(action: string): string {
    try {
      return this.dispatchSession(action.trim());
    } catch (err: unknown) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  getHelp(): string {
    return getModelMap(this.model.diagram.customTypes);
  }

  // ── Single op execution ────────────────────────────────

  private async executeSingleOp(opStr: string): Promise<OpResult> {
    const parsed = parseOp(opStr);
    if (isParseError(parsed)) {
      return { success: false, message: parsed.error };
    }

    try {
      return await this.dispatchOp(parsed);
    } catch (err: unknown) {
      return {
        success: false,
        message: `Error executing "${parsed.verb}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async dispatchOp(op: ParsedOp): Promise<OpResult> {
    switch (op.verb) {
      case "add": return this.handleAdd(op);
      case "connect": return this.handleConnect(op);
      case "disconnect": return this.handleDisconnect(op);
      case "style": return this.handleStyle(op);
      case "remove": return this.handleRemove(op);
      case "label": return this.handleLabel(op);
      case "badge": return this.handleBadge(op);
      case "move": return this.handleMove(op);
      case "resize": return this.handleResize(op);
      case "swap": return this.handleSwap(op);
      case "group": return this.handleGroup(op);
      case "ungroup": return this.handleUngroup(op);
      case "define": return this.handleDefine(op);
      case "checkpoint": return this.handleCheckpoint(op);
      case "title": return this.handleTitle(op);
      case "page": return this.handlePage(op);
      case "layer": return this.handleLayer(op);
      case "layout": return this.handleLayout(op);
      default:
        return { success: false, message: `Unhandled verb: ${op.verb}` };
    }
  }

  // ── Add ────────────────────────────────────────────────

  private handleAdd(op: ParsedOp): OpResult {
    const count = op.params.get("count") ? parseInt(op.params.get("count")!, 10) : 1;
    if (isNaN(count) || count < 1) {
      return { success: false, message: "Invalid count" };
    }

    // Resolve type
    let resolvedType: ShapeType;
    const customTypes = this.model.diagram.customTypes;
    let theme: ThemeName | undefined = op.params.get("theme") as ThemeName | undefined;
    let badgeText: string | undefined;

    if (op.type) {
      // Check custom types first
      const ct = customTypes.get(op.type);
      if (ct) {
        resolvedType = ct.base;
        if (!theme && ct.theme) theme = ct.theme;
        if (ct.badge) badgeText = ct.badge;
      } else if (isShapeType(op.type)) {
        resolvedType = op.type;
      } else {
        // Unknown type — treat as label, shift: type becomes part of the label
        const inferred = inferTypeFromLabel(op.type);
        if (inferred) {
          resolvedType = inferred;
        } else {
          resolvedType = "svc";
        }
      }
    } else {
      // No type specified — infer from label
      const target = op.target ?? "Untitled";
      const inferred = inferTypeFromLabel(target);
      resolvedType = inferred ?? "svc";
    }

    // Validate theme
    if (theme && !isThemeName(theme)) {
      return { success: false, message: `Unknown theme "${theme}"` };
    }

    // Resolve near reference
    let nearId: string | undefined;
    const nearRef = op.params.get("near");
    if (nearRef) {
      const resolved = resolveRef(nearRef, this.model.registry, this.model);
      if (resolved.kind === "single") {
        nearId = resolved.shape.id;
      } else if (resolved.kind === "none") {
        const suggestion = resolved.suggestedLabel
          ? this.buildTypoSuggestion(op.raw, nearRef, resolved.suggestedLabel)
          : undefined;
        return { success: false, message: resolved.message, suggestion };
      } else {
        const suggestion = this.buildAmbiguousSuggestion(op.raw, nearRef, resolved.shapes);
        return { success: false, message: resolved.message, suggestion };
      }
    }

    // Parse at:X,Y
    let at: { x: number; y: number } | undefined;
    const atParam = op.params.get("at");
    if (atParam) {
      const parts = atParam.split(",");
      if (parts.length === 2) {
        at = { x: parseFloat(parts[0]), y: parseFloat(parts[1]) };
      }
    }

    // Parse size:WxH
    let size: { width: number; height: number } | undefined;
    const sizeParam = op.params.get("size");
    if (sizeParam) {
      const parts = sizeParam.toLowerCase().split("x");
      if (parts.length === 2) {
        size = { width: parseFloat(parts[0]), height: parseFloat(parts[1]) };
      }
    }

    // Resolve in: group
    let inGroup: string | undefined;
    const inRef = op.params.get("in");
    if (inRef) {
      const group = this.model.getGroupByName(inRef);
      if (group) {
        inGroup = group.id;
      }
    }

    const dir = op.params.get("dir");

    const results: string[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < count; i++) {
      const label = count > 1
        ? `${op.target}${i + 1}`
        : (op.target ?? "Untitled");

      const shape = this.model.addShape(label, resolvedType, {
        theme,
        near: nearId,
        dir: dir ?? undefined,
        at,
        inGroup,
        size,
      });

      // Apply badge from custom type
      if (badgeText) {
        const badges: Badge[] = [{ text: badgeText, position: "top-right" }];
        this.model.modifyShape(shape.id, { metadata: { ...shape.metadata, badges } });
      }

      results.push(formatShapeCreated(shape));

      // For batch, subsequent shapes position near the previous one
      if (count > 1) {
        nearId = shape.id;
      }
    }

    return {
      success: true,
      message: results.join("\n"),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // ── Connect ────────────────────────────────────────────

  private handleConnect(op: ParsedOp): OpResult {
    const targets = op.targets;
    const arrows = op.arrows;
    if (!targets || !arrows || targets.length < 2 || arrows.length < 1) {
      return { success: false, message: "connect requires at least REF ARROW REF" };
    }

    // Parse optional params
    const label = op.params.get("label");
    const styleParam = op.params.get("style");
    const sourceArrowParam = op.params.get("source-arrow");
    const targetArrowParam = op.params.get("target-arrow");

    const results: string[] = [];
    const warnings: string[] = [];

    // Connect consecutive pairs: A -> B -> C creates A->B and B->C
    for (let i = 0; i < arrows.length; i++) {
      const srcRef = targets[i];
      const tgtRef = targets[i + 1];
      if (!srcRef || !tgtRef) break;

      const arrow = arrows[i];

      // Resolve source
      const srcResult = resolveRef(srcRef, this.model.registry, this.model);
      if (srcResult.kind === "none") {
        const suggestion = srcResult.suggestedLabel
          ? this.buildTypoSuggestion(op.raw, srcRef, srcResult.suggestedLabel)
          : undefined;
        return { success: false, message: srcResult.message, suggestion };
      }
      if (srcResult.kind === "multiple") {
        const suggestion = this.buildAmbiguousSuggestion(op.raw, srcRef, srcResult.shapes);
        return { success: false, message: srcResult.message, suggestion };
      }

      // Resolve target
      const tgtResult = resolveRef(tgtRef, this.model.registry, this.model);
      if (tgtResult.kind === "none") {
        const suggestion = tgtResult.suggestedLabel
          ? this.buildTypoSuggestion(op.raw, tgtRef, tgtResult.suggestedLabel)
          : undefined;
        return { success: false, message: tgtResult.message, suggestion };
      }
      if (tgtResult.kind === "multiple") {
        const suggestion = this.buildAmbiguousSuggestion(op.raw, tgtRef, tgtResult.shapes);
        return { success: false, message: tgtResult.message, suggestion };
      }

      // Determine arrow types based on operator
      let sourceArrow: ArrowType = "none";
      let targetArrow: ArrowType = "arrow";

      if (arrow === "<->") {
        sourceArrow = "arrow";
        targetArrow = "arrow";
      } else if (arrow === "--") {
        sourceArrow = "none";
        targetArrow = "none";
      }

      // Override with explicit params
      if (sourceArrowParam) sourceArrow = sourceArrowParam as ArrowType;
      if (targetArrowParam) targetArrow = targetArrowParam as ArrowType;

      // Build edge style
      const edgeStyleOverrides: Partial<EdgeStyleSet> = {};
      if (styleParam) {
        switch (styleParam) {
          case "dashed": edgeStyleOverrides.dashed = true; break;
          case "dotted": edgeStyleOverrides.dashed = true; break;
          case "animated": edgeStyleOverrides.flowAnimation = true; break;
          case "curved": edgeStyleOverrides.curved = true; break;
          case "thick": break; // handled at render time
          case "orthogonal": edgeStyleOverrides.edgeStyle = "orthogonalEdgeStyle"; break;
        }
      }

      const edge = this.model.addEdge(srcResult.shape.id, tgtResult.shape.id, {
        label: label ?? undefined,
        style: edgeStyleOverrides,
        sourceArrow,
        targetArrow,
      });

      if (!edge) {
        return { success: false, message: `Failed to create edge ${srcRef}->${tgtRef}` };
      }

      results.push(formatEdgeCreated(edge, srcResult.shape.label, tgtResult.shape.label));
    }

    return {
      success: true,
      message: results.join("\n"),
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // ── Disconnect ─────────────────────────────────────────

  private handleDisconnect(op: ParsedOp): OpResult {
    const targets = op.targets;
    if (!targets || targets.length < 2) {
      return { success: false, message: "disconnect requires REF ARROW REF" };
    }

    const srcResult = resolveRef(targets[0], this.model.registry, this.model);
    if (srcResult.kind !== "single") {
      if (srcResult.kind === "none") {
        const suggestion = srcResult.suggestedLabel
          ? this.buildTypoSuggestion(op.raw, targets[0], srcResult.suggestedLabel)
          : undefined;
        return { success: false, message: srcResult.message, suggestion };
      }
      const suggestion = this.buildAmbiguousSuggestion(op.raw, targets[0], srcResult.shapes);
      return { success: false, message: srcResult.message, suggestion };
    }

    const tgtResult = resolveRef(targets[1], this.model.registry, this.model);
    if (tgtResult.kind !== "single") {
      if (tgtResult.kind === "none") {
        const suggestion = tgtResult.suggestedLabel
          ? this.buildTypoSuggestion(op.raw, targets[1], tgtResult.suggestedLabel)
          : undefined;
        return { success: false, message: tgtResult.message, suggestion };
      }
      const suggestion = this.buildAmbiguousSuggestion(op.raw, targets[1], tgtResult.shapes);
      return { success: false, message: tgtResult.message, suggestion };
    }

    const edge = this.model.findEdge(srcResult.shape.id, tgtResult.shape.id);
    if (!edge) {
      return { success: false, message: `No edge from ${targets[0]} to ${targets[1]}` };
    }

    this.model.removeEdge(edge.id);
    return { success: true, message: `-edge ${srcResult.shape.label}->${tgtResult.shape.label}` };
  }

  // ── Style ──────────────────────────────────────────────

  private handleStyle(op: ParsedOp): OpResult {
    if (!op.target) {
      return { success: false, message: "style requires a target" };
    }

    const resolved = resolveRef(op.target, this.model.registry, this.model);
    if (resolved.kind === "none") {
      const suggestion = resolved.suggestedLabel
        ? this.buildTypoSuggestion(op.raw, op.target!, resolved.suggestedLabel)
        : undefined;
      return { success: false, message: resolved.message, suggestion };
    }

    // Ambiguous non-selector reference is an error
    const isSelector = op.target.startsWith("@");
    if (resolved.kind === "multiple" && !isSelector) {
      const suggestion = this.buildAmbiguousSuggestion(op.raw, op.target!, resolved.shapes);
      return { success: false, message: `error: ${resolved.message}`, suggestion };
    }

    const shapes = resolved.kind === "single" ? [resolved.shape] : resolved.shapes;

    // Map style params
    const styleChanges: Partial<import("../types/index.js").StyleSet> = {};
    for (const [key, value] of op.params) {
      switch (key) {
        case "fill": {
          const color = resolveColor(value);
          if (color) styleChanges.fillColor = color;
          break;
        }
        case "stroke": {
          const color = resolveColor(value);
          if (color) styleChanges.strokeColor = color;
          break;
        }
        case "font-size":
          styleChanges.fontSize = parseInt(value, 10);
          break;
        case "font-color": {
          const color = resolveColor(value);
          if (color) styleChanges.fontColor = color;
          break;
        }
        case "opacity":
          styleChanges.opacity = parseInt(value, 10);
          break;
        case "rounded":
          styleChanges.rounded = value === "true" || value === "1";
          break;
        case "dashed":
          styleChanges.dashed = value === "true" || value === "1";
          break;
        case "shadow":
          styleChanges.shadow = value === "true" || value === "1";
          break;
      }
    }

    let modifiedCount = 0;
    for (const shape of shapes) {
      const newStyle = { ...shape.style, ...styleChanges };
      const result = this.model.modifyShape(shape.id, { style: newStyle });
      if (result) modifiedCount++;
    }

    const propList = [...op.params.entries()]
      .filter(([k]) => k !== "theme")
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");

    return {
      success: true,
      message: `*styled ${op.target} ${propList} (${modifiedCount} shape${modifiedCount !== 1 ? "s" : ""})`,
    };
  }

  // ── Remove ─────────────────────────────────────────────

  private handleRemove(op: ParsedOp): OpResult {
    if (!op.target) {
      return { success: false, message: "remove requires a target" };
    }

    const resolved = resolveRef(op.target, this.model.registry, this.model);
    if (resolved.kind === "none") {
      const suggestion = resolved.suggestedLabel
        ? this.buildTypoSuggestion(op.raw, op.target!, resolved.suggestedLabel)
        : undefined;
      return { success: false, message: resolved.message, suggestion };
    }

    const shapes = resolved.kind === "single" ? [resolved.shape] : resolved.shapes;
    const results: string[] = [];

    for (const shape of shapes) {
      const removed = this.model.removeShape(shape.id);
      if (removed) results.push(formatShapeDeleted(removed));
    }

    return { success: true, message: results.join("\n") };
  }

  // ── Label ──────────────────────────────────────────────

  private handleLabel(op: ParsedOp): OpResult {
    if (!op.target) {
      return { success: false, message: "label requires a target" };
    }

    const newText = op.params.get("text");
    if (!newText) {
      return { success: false, message: "label requires new text" };
    }

    const resolved = resolveRef(op.target, this.model.registry, this.model);
    if (resolved.kind !== "single") {
      if (resolved.kind === "none") {
        const suggestion = resolved.suggestedLabel
          ? this.buildTypoSuggestion(op.raw, op.target!, resolved.suggestedLabel)
          : undefined;
        return { success: false, message: resolved.message, suggestion };
      }
      const suggestion = this.buildAmbiguousSuggestion(op.raw, op.target!, resolved.shapes);
      return { success: false, message: resolved.message, suggestion };
    }

    const result = this.model.modifyShape(resolved.shape.id, { label: newText });
    if (!result) {
      return { success: false, message: `Failed to relabel ${op.target}` };
    }

    return { success: true, message: formatShapeModified(result, `labeled "${newText}"`) };
  }

  // ── Badge ──────────────────────────────────────────────

  private handleBadge(op: ParsedOp): OpResult {
    if (!op.target) {
      return { success: false, message: "badge requires a target" };
    }

    const text = op.params.get("text");
    if (!text) {
      return { success: false, message: "badge requires text" };
    }

    const position = (op.params.get("pos") ?? "top-right") as Badge["position"];

    const resolved = resolveRef(op.target, this.model.registry, this.model);
    if (resolved.kind !== "single") {
      if (resolved.kind === "none") {
        const suggestion = resolved.suggestedLabel
          ? this.buildTypoSuggestion(op.raw, op.target!, resolved.suggestedLabel)
          : undefined;
        return { success: false, message: resolved.message, suggestion };
      }
      const suggestion = this.buildAmbiguousSuggestion(op.raw, op.target!, resolved.shapes);
      return { success: false, message: resolved.message, suggestion };
    }

    const shape = resolved.shape;
    const existingBadges = shape.metadata.badges ?? [];
    const newBadge: Badge = { text, position };
    const badges = [...existingBadges, newBadge];

    const result = this.model.modifyShape(shape.id, {
      metadata: { ...shape.metadata, badges },
    });

    if (!result) {
      return { success: false, message: `Failed to badge ${op.target}` };
    }

    return { success: true, message: formatShapeModified(result, `badge "${text}"`) };
  }

  // ── Move ───────────────────────────────────────────────

  private handleMove(op: ParsedOp): OpResult {
    if (!op.target) {
      return { success: false, message: "move requires a target" };
    }

    const resolved = resolveRef(op.target, this.model.registry, this.model);
    if (resolved.kind !== "single") {
      if (resolved.kind === "none") {
        const suggestion = resolved.suggestedLabel
          ? this.buildTypoSuggestion(op.raw, op.target!, resolved.suggestedLabel)
          : undefined;
        return { success: false, message: resolved.message, suggestion };
      }
      const suggestion = this.buildAmbiguousSuggestion(op.raw, op.target!, resolved.shapes);
      return { success: false, message: resolved.message, suggestion };
    }

    const shape = resolved.shape;
    let newX = shape.bounds.x;
    let newY = shape.bounds.y;

    // to:X,Y
    const toParam = op.params.get("to");
    if (toParam) {
      const parts = toParam.split(",");
      if (parts.length === 2) {
        newX = parseFloat(parts[0]);
        newY = parseFloat(parts[1]);
      }
    }

    // near:REF dir:DIR
    const nearRef = op.params.get("near");
    if (nearRef) {
      const nearResolved = resolveRef(nearRef, this.model.registry, this.model);
      if (nearResolved.kind === "single") {
        const refBounds = nearResolved.shape.bounds;
        const dir = op.params.get("dir") ?? "below";
        const gap = 60;
        const refCx = refBounds.x + refBounds.width / 2;
        const refCy = refBounds.y + refBounds.height / 2;

        switch (dir) {
          case "below":
            newX = refCx - shape.bounds.width / 2;
            newY = refBounds.y + refBounds.height + gap;
            break;
          case "above":
            newX = refCx - shape.bounds.width / 2;
            newY = refBounds.y - gap - shape.bounds.height;
            break;
          case "right":
            newX = refBounds.x + refBounds.width + gap;
            newY = refCy - shape.bounds.height / 2;
            break;
          case "left":
            newX = refBounds.x - gap - shape.bounds.width;
            newY = refCy - shape.bounds.height / 2;
            break;
        }
      }
    }

    const result = this.model.modifyShape(shape.id, {
      bounds: { ...shape.bounds, x: newX, y: newY },
    });

    if (!result) {
      return { success: false, message: `Failed to move ${op.target}` };
    }

    return { success: true, message: `@moved ${result.label} to (${newX},${newY})` };
  }

  // ── Resize ─────────────────────────────────────────────

  private handleResize(op: ParsedOp): OpResult {
    if (!op.target) {
      return { success: false, message: "resize requires a target" };
    }

    const resolved = resolveRef(op.target, this.model.registry, this.model);
    if (resolved.kind !== "single") {
      if (resolved.kind === "none") {
        const suggestion = resolved.suggestedLabel
          ? this.buildTypoSuggestion(op.raw, op.target!, resolved.suggestedLabel)
          : undefined;
        return { success: false, message: resolved.message, suggestion };
      }
      const suggestion = this.buildAmbiguousSuggestion(op.raw, op.target!, resolved.shapes);
      return { success: false, message: resolved.message, suggestion };
    }

    const shape = resolved.shape;
    const toParam = op.params.get("to");
    if (!toParam) {
      return { success: false, message: "resize requires to:WxH" };
    }

    const parts = toParam.toLowerCase().split("x");
    if (parts.length !== 2) {
      return { success: false, message: `Invalid size format: ${toParam}` };
    }

    const width = parseFloat(parts[0]);
    const height = parseFloat(parts[1]);

    const result = this.model.modifyShape(shape.id, {
      bounds: { ...shape.bounds, width, height },
    });

    if (!result) {
      return { success: false, message: `Failed to resize ${op.target}` };
    }

    return { success: true, message: `*resized ${result.label} to ${width}x${height}` };
  }

  // ── Swap ───────────────────────────────────────────────

  private handleSwap(op: ParsedOp): OpResult {
    const targets = op.targets;
    if (!targets || targets.length < 2) {
      return { success: false, message: "swap requires two targets" };
    }

    const r1 = resolveRef(targets[0], this.model.registry, this.model);
    const r2 = resolveRef(targets[1], this.model.registry, this.model);

    if (r1.kind !== "single") {
      if (r1.kind === "none") {
        const suggestion = r1.suggestedLabel
          ? this.buildTypoSuggestion(op.raw, targets[0], r1.suggestedLabel)
          : undefined;
        return { success: false, message: r1.message, suggestion };
      }
      const suggestion = this.buildAmbiguousSuggestion(op.raw, targets[0], r1.shapes);
      return { success: false, message: r1.message, suggestion };
    }
    if (r2.kind !== "single") {
      if (r2.kind === "none") {
        const suggestion = r2.suggestedLabel
          ? this.buildTypoSuggestion(op.raw, targets[1], r2.suggestedLabel)
          : undefined;
        return { success: false, message: r2.message, suggestion };
      }
      const suggestion = this.buildAmbiguousSuggestion(op.raw, targets[1], r2.shapes);
      return { success: false, message: r2.message, suggestion };
    }

    const bounds1 = { ...r1.shape.bounds };
    const bounds2 = { ...r2.shape.bounds };

    this.model.modifyShape(r1.shape.id, { bounds: bounds2 });
    this.model.modifyShape(r2.shape.id, { bounds: bounds1 });

    return {
      success: true,
      message: `@swapped ${r1.shape.label} <-> ${r2.shape.label}`,
    };
  }

  // ── Group ──────────────────────────────────────────────

  private handleGroup(op: ParsedOp): OpResult {
    const targets = op.targets;
    if (!targets || targets.length === 0) {
      return { success: false, message: "group requires targets" };
    }

    const name = op.params.get("as");
    if (!name) {
      return { success: false, message: "group requires as:NAME" };
    }

    // Resolve all targets to shape IDs
    const memberIds: string[] = [];
    for (const ref of targets) {
      const resolved = resolveRef(ref, this.model.registry, this.model);
      if (resolved.kind === "single") {
        memberIds.push(resolved.shape.id);
      } else if (resolved.kind === "multiple") {
        for (const s of resolved.shapes) {
          memberIds.push(s.id);
        }
      } else {
        const suggestion = resolved.suggestedLabel
          ? this.buildTypoSuggestion(op.raw, ref, resolved.suggestedLabel)
          : undefined;
        return { success: false, message: resolved.message, suggestion };
      }
    }

    const group = this.model.createGroup(name, memberIds);
    if (!group) {
      return { success: false, message: "Failed to create group" };
    }

    return { success: true, message: formatGroupCreated(group) };
  }

  // ── Ungroup ────────────────────────────────────────────

  private handleUngroup(op: ParsedOp): OpResult {
    if (!op.target) {
      return { success: false, message: "ungroup requires a group name" };
    }

    const group = this.model.getGroupByName(op.target);
    if (!group) {
      return { success: false, message: `Unknown group "${op.target}"` };
    }

    const dissolved = this.model.dissolveGroup(group.id);
    if (!dissolved) {
      return { success: false, message: `Failed to ungroup "${op.target}"` };
    }

    return { success: true, message: `!ungrouped ${dissolved.name} (${dissolved.memberIds.size} shapes)` };
  }

  // ── Define ─────────────────────────────────────────────

  private handleDefine(op: ParsedOp): OpResult {
    if (!op.target) {
      return { success: false, message: "define requires a name" };
    }

    const baseName = op.params.get("base");
    if (!baseName || !isShapeType(baseName)) {
      return { success: false, message: `define requires base:TYPE (got "${baseName ?? "none"}")` };
    }

    const theme = op.params.get("theme") as ThemeName | undefined;
    const badge = op.params.get("badge");
    let size: { width: number; height: number } | undefined;
    const sizeParam = op.params.get("size");
    if (sizeParam) {
      const parts = sizeParam.toLowerCase().split("x");
      if (parts.length === 2) {
        size = { width: parseFloat(parts[0]), height: parseFloat(parts[1]) };
      }
    }

    const ct = this.model.defineCustomType(op.target, baseName, { theme, badge, size });
    return {
      success: true,
      message: `defined ${ct.name} (base:${ct.base}${ct.theme ? ` theme:${ct.theme}` : ""}${ct.badge ? ` badge:${ct.badge}` : ""})`,
    };
  }

  // ── Checkpoint ─────────────────────────────────────────

  private handleCheckpoint(op: ParsedOp): OpResult {
    if (!op.target) {
      return { success: false, message: "checkpoint requires a name" };
    }
    this.model.checkpoint(op.target);
    return { success: true, message: `checkpoint "${op.target}" created` };
  }

  // ── Title ──────────────────────────────────────────────

  private handleTitle(op: ParsedOp): OpResult {
    if (!op.target) {
      return { success: false, message: "title requires a name" };
    }
    this.model.diagram.title = op.target;
    return { success: true, message: `title set to "${op.target}"` };
  }

  // ── Page ───────────────────────────────────────────────

  private handlePage(op: ParsedOp): OpResult {
    const sub = op.subcommand;
    if (!sub) {
      return { success: false, message: "page requires a subcommand" };
    }

    switch (sub) {
      case "add": {
        const name = op.target;
        if (!name) return { success: false, message: "page add requires a name" };
        const page = this.model.addPage(name);
        return { success: true, message: `+page ${page.name}` };
      }
      case "switch": {
        const name = op.target;
        if (!name) return { success: false, message: "page switch requires a name" };
        const page = this.model.switchPage(name);
        if (!page) return { success: false, message: `Unknown page "${name}"` };
        return { success: true, message: `switched to page ${page.name}` };
      }
      case "remove": {
        const name = op.target;
        if (!name) return { success: false, message: "page remove requires a name" };
        const ok = this.model.removePage(name);
        if (!ok) return { success: false, message: `Cannot remove page "${name}"` };
        return { success: true, message: `-page ${name}` };
      }
      case "duplicate": {
        // Stub — not implemented in model yet
        return { success: false, message: "page duplicate not yet implemented" };
      }
      default:
        return { success: false, message: `Unknown page subcommand "${sub}"` };
    }
  }

  // ── Layer ──────────────────────────────────────────────

  private handleLayer(op: ParsedOp): OpResult {
    const sub = op.subcommand;
    if (!sub) {
      return { success: false, message: "layer requires a subcommand" };
    }

    const page = this.model.getActivePage();

    switch (sub) {
      case "create": {
        const name = op.target;
        if (!name) return { success: false, message: "layer create requires a name" };
        const layerId = nextLayerId();
        const order = page.layers.length;
        page.layers.push({ id: layerId, name, visible: true, locked: false, order });
        return { success: true, message: `+layer ${name}` };
      }
      case "show": {
        const name = op.target;
        if (!name) return { success: false, message: "layer show requires a name" };
        const layer = page.layers.find((l) => l.name === name);
        if (!layer) return { success: false, message: `Unknown layer "${name}"` };
        layer.visible = true;
        return { success: true, message: `layer ${name} visible` };
      }
      case "hide": {
        const name = op.target;
        if (!name) return { success: false, message: "layer hide requires a name" };
        const layer = page.layers.find((l) => l.name === name);
        if (!layer) return { success: false, message: `Unknown layer "${name}"` };
        layer.visible = false;
        return { success: true, message: `layer ${name} hidden` };
      }
      case "move": {
        // Stub for moving shapes between layers
        return { success: false, message: "layer move not yet implemented" };
      }
      default:
        return { success: false, message: `Unknown layer subcommand "${sub}"` };
    }
  }

  // ── Layout ─────────────────────────────────────────────

  private async handleLayout(op: ParsedOp): Promise<OpResult> {
    // Parse algorithm (default: layered)
    const algoParam = op.params.get("algo") ?? "layered";
    const validAlgos = new Set(["layered", "force", "tree"]);
    if (!validAlgos.has(algoParam)) {
      return { success: false, message: `Unknown algorithm "${algoParam}". Use: layered, force, tree` };
    }

    // Parse direction (default: TB)
    const dirParam = (op.params.get("dir") ?? "TB").toUpperCase();
    const validDirs = new Set(["TB", "LR", "BT", "RL"]);
    if (!validDirs.has(dirParam)) {
      return { success: false, message: `Unknown direction "${dirParam}". Use: TB, LR, BT, RL` };
    }

    // Parse spacing
    const spacing = op.params.has("spacing") ? parseInt(op.params.get("spacing")!, 10) : undefined;

    const options: LayoutOptions = {
      algorithm: algoParam as LayoutOptions["algorithm"],
      direction: dirParam as LayoutOptions["direction"],
      spacing,
    };

    try {
      const page = this.model.getActivePage();
      const result = await runElkLayout(page, options);
      const count = this.model.applyLayout(result);

      return {
        success: true,
        message: `@layout ${algoParam} ${dirParam} — repositioned ${count} shapes`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        message: `Layout failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ── Query dispatch ─────────────────────────────────────

  private dispatchQuery(query: string): string {
    const tokens = tokenize(query);
    if (tokens.length === 0) return "Empty query";

    const cmd = tokens[0].toLowerCase();

    switch (cmd) {
      case "list": return this.queryList(tokens.slice(1));
      case "describe": return this.queryDescribe(tokens.slice(1));
      case "connections": return this.queryConnections(tokens.slice(1));
      case "stats": return formatStats(this.model);
      case "status": return formatStatus(this.model);
      case "find": return this.queryFind(tokens.slice(1));
      case "diff": return this.queryDiff(tokens.slice(1));
      case "history": return this.queryHistory(tokens.slice(1));
      default: return `Unknown query command "${cmd}"`;
    }
  }

  private queryList(args: string[]): string {
    const page = this.model.getActivePage();

    if (args.length > 0 && args[0].startsWith("@")) {
      // Selector-based filter
      const resolved = resolveRef(args[0], this.model.registry, this.model);
      if (resolved.kind === "none") return resolved.message;
      const shapes = resolved.kind === "single" ? [resolved.shape] : resolved.shapes;
      return formatList(shapes);
    }

    return formatList([...page.shapes.values()]);
  }

  private queryDescribe(args: string[]): string {
    if (args.length === 0) return "describe requires a reference";
    const resolved = resolveRef(args[0], this.model.registry, this.model);
    if (resolved.kind !== "single") {
      return resolved.kind === "none" ? resolved.message : resolved.message;
    }
    return formatDescribe(resolved.shape, this.model);
  }

  private queryConnections(args: string[]): string {
    if (args.length === 0) return "connections requires a reference";
    const resolved = resolveRef(args[0], this.model.registry, this.model);
    if (resolved.kind !== "single") {
      return resolved.kind === "none" ? resolved.message : resolved.message;
    }

    const page = this.model.getActivePage();
    const { incoming, outgoing } = this.model.registry.getEdgesForShape(resolved.shape.id, page);
    return formatConnections(resolved.shape, incoming, outgoing, this.model);
  }

  private queryFind(args: string[]): string {
    if (args.length === 0) return "find requires a search term";
    const term = args.join(" ").toLowerCase();
    const page = this.model.getActivePage();
    const matches: Shape[] = [];

    for (const shape of page.shapes.values()) {
      if (shape.label.toLowerCase().includes(term)) {
        matches.push(shape);
      }
    }

    if (matches.length === 0) return `No shapes matching "${args.join(" ")}"`;
    return formatList(matches);
  }

  private queryDiff(args: string[]): string {
    if (args.length === 0) return "diff requires checkpoint:NAME";
    const param = args[0];
    let cpName: string;
    if (param.startsWith("checkpoint:")) {
      cpName = param.slice(11);
    } else {
      cpName = param;
    }

    const cpIndex = this.model.eventLog.checkpoints.get(cpName);
    if (cpIndex === undefined) {
      return `Unknown checkpoint "${cpName}"`;
    }

    const events = this.model.eventLog.events.slice(cpIndex);
    const nonCheckpoint = events.filter((e) => e.type !== "checkpoint");
    if (nonCheckpoint.length === 0) return `No changes since checkpoint "${cpName}"`;

    return `${nonCheckpoint.length} changes since "${cpName}":\n` + formatHistory(nonCheckpoint);
  }

  private queryHistory(args: string[]): string {
    const count = args.length > 0 ? parseInt(args[0], 10) : 10;
    const events = this.model.getHistory(isNaN(count) ? 10 : count);
    return formatHistory(events);
  }

  // ── Session dispatch ───────────────────────────────────

  private dispatchSession(action: string): string {
    const tokens = tokenize(action);
    if (tokens.length === 0) return "Empty action";

    const cmd = tokens[0].toLowerCase();

    switch (cmd) {
      case "new": {
        const title = tokens[1] ?? "Untitled";
        this.model.createNew(title);
        return `new diagram "${title}" created`;
      }
      case "open": {
        const filePath = tokens[1];
        if (!filePath) return "open requires a file path";
        try {
          const xml = readFileSync(filePath, "utf-8");
          this.model.diagram = deserializeDiagram(xml);
          this.model.diagram.filePath = filePath;
          if (this.model.diagram.pages.length > 0) {
            this.model.diagram.activePage = this.model.diagram.pages[0].id;
          }
          this.model.rebuildRegistry();
          const page = this.model.getActivePage();
          return `ok: opened "${filePath}" (${this.model.diagram.pages.length} pages, ${page.shapes.size} shapes, ${page.edges.size} edges, ${page.groups.size} groups)`;
        } catch (e: any) {
          return `error: ${e.message}`;
        }
      }
      case "save": {
        // Parse "as:PATH" param
        let savePath = this.model.diagram.filePath;
        for (const token of tokens.slice(1)) {
          if (isKeyValue(token)) {
            const { key, value } = parseKeyValue(token);
            if (key === "as") savePath = value;
          }
        }
        if (!savePath) return "error: no file path. Use save as:./file.drawio";
        try {
          const xml = serializeDiagram(this.model.diagram);
          writeFileSync(savePath, xml, "utf-8");
          this.model.diagram.filePath = savePath;
          const page = this.model.getActivePage();
          return `ok: saved ${savePath} (${page.shapes.size} shapes, ${page.edges.size} edges, ${page.groups.size} groups)`;
        } catch (e: any) {
          return `error: ${e.message}`;
        }
      }
      case "export":
        return "export not yet implemented (requires draw.io Desktop)";
      case "checkpoint": {
        const name = tokens[1];
        if (!name) return "checkpoint requires a name";
        this.model.checkpoint(name);
        return `checkpoint "${name}" created`;
      }
      case "undo": {
        if (tokens[1] === "to:" || (tokens.length >= 2 && tokens[1].startsWith("to:"))) {
          // undo to:NAME
          const name = tokens[1].startsWith("to:") ? tokens[1].slice(3) : tokens[2];
          if (!name) return "undo to: requires a checkpoint name";
          const events = this.model.undoTo(name);
          if (!events) return `Cannot undo to "${name}"`;
          return `undone ${events.length} events to checkpoint "${name}"`;
        }
        if (!this.model.canUndo()) return "nothing to undo";
        const events = this.model.undo();
        return `undone ${events.length} event${events.length !== 1 ? "s" : ""}`;
      }
      case "redo": {
        if (!this.model.canRedo()) return "nothing to redo";
        const events = this.model.redo();
        return `redone ${events.length} event${events.length !== 1 ? "s" : ""}`;
      }
      default:
        return `Unknown session action "${cmd}"`;
    }
  }
}

