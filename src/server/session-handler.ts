import { DiagramModel } from "../model/diagram-model.js";
import { tokenize, isKeyValue, parseKeyValue } from "../parser/tokenizer.js";
import { serializeDiagram } from "../serialization/serialize.js";
import { deserializeDiagram } from "../serialization/deserialize.js";
import { readFileSync, writeFileSync } from "node:fs";

export class SessionHandler {
  constructor(private model: DiagramModel) {}

  dispatch(action: string): string {
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
          const parts: string[] = [];
          parts.push(`ok: opened "${filePath}" (${this.model.diagram.pages.length} pages, ${page.shapes.size} shapes, ${page.edges.size} edges, ${page.groups.size} groups)`);

          // Canvas and flow info
          const canvasBounds = this.model.computeCanvasBounds();
          if (canvasBounds) {
            const flowDir = page.flowDirection ?? "TB";
            parts.push(`flow:${flowDir} canvas:${Math.round(canvasBounds.width)}x${Math.round(canvasBounds.height)}`);
          }

          // Group summary
          if (page.groups.size > 0) {
            const groupSummary = [...page.groups.values()]
              .map((g) => `${g.name}(${g.memberIds.size})`)
              .join(", ");
            parts.push(`groups: ${groupSummary}`);
          }

          // Ungrouped shapes
          const groupedIds = new Set<string>();
          for (const g of page.groups.values()) {
            for (const id of g.memberIds) groupedIds.add(id);
          }
          const ungroupedShapes = [...page.shapes.values()].filter((s) => !groupedIds.has(s.id));
          if (ungroupedShapes.length > 0 && page.groups.size > 0) {
            const ungroupedSummary = ungroupedShapes
              .map((s) => `${s.label}(${s.type})`)
              .join(", ");
            parts.push(`ungrouped: ${ungroupedSummary}`);
          }

          return parts.join("\n");
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
