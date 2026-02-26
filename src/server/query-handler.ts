import type { Shape } from "../types/index.js";
import { DiagramModel } from "../model/diagram-model.js";
import { resolveRef } from "../parser/resolve-ref.js";
import { tokenize } from "../parser/tokenizer.js";
import {
  formatList, formatConnections, formatDescribe, formatStats,
  formatStatus, formatHistory, formatMap,
} from "./response-formatter.js";

export class QueryHandler {
  constructor(private model: DiagramModel) {}

  dispatch(query: string): string {
    const tokens = tokenize(query);
    if (tokens.length === 0) return "Empty query";

    const cmd = tokens[0].toLowerCase();

    switch (cmd) {
      case "list": return this.queryList(tokens.slice(1));
      case "describe": return this.queryDescribe(tokens.slice(1));
      case "connections": return this.queryConnections(tokens.slice(1));
      case "stats": return formatStats(this.model);
      case "status": return formatStatus(this.model);
      case "map": return formatMap(this.model);
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
}
