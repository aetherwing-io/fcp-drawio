import type { Shape } from "../types/index.js";
import type { SnapshotResult } from "../lib/drawio-cli.js";
import { renderSnapshot } from "../lib/drawio-cli.js";
import { DiagramModel } from "../model/diagram-model.js";
import { resolveRef } from "../parser/resolve-ref.js";
import { tokenize, isKeyValue, parseKeyValue } from "../parser/tokenizer.js";
import {
  formatList, formatConnections, formatDescribe, formatStats,
  formatStatus, formatHistory, formatMap,
} from "./response-formatter.js";
import { serializeDiagram } from "../serialization/serialize.js";

export interface QueryResult {
  text: string;
  image?: SnapshotResult;
}

export class QueryHandler {
  private drawioCliPath: string | null;

  constructor(private model: DiagramModel, drawioCliPath: string | null = null) {
    this.drawioCliPath = drawioCliPath;
  }

  dispatch(query: string): string | QueryResult | Promise<QueryResult> {
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
      case "snapshot": return this.querySnapshot(tokens.slice(1));
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

  private querySnapshot(args: string[]): string | Promise<QueryResult> {
    // Parse arguments first so we know which page is being requested
    let width = 1200;
    let pageNum = 1;
    for (const arg of args) {
      if (isKeyValue(arg)) {
        const { key, value } = parseKeyValue(arg);
        if (key === "width") width = parseInt(value, 10) || 1200;
        if (key === "page") pageNum = parseInt(value, 10) || 1;
      }
    }

    // Validate page number and get the requested page
    const pages = this.model.diagram.pages;
    if (pageNum < 1 || pageNum > pages.length) {
      return `snapshot: invalid page ${pageNum} — diagram has ${pages.length} page(s)`;
    }
    const requestedPage = pages[pageNum - 1];

    if (requestedPage.shapes.size === 0) {
      return "snapshot: empty diagram — add shapes first";
    }

    if (!this.drawioCliPath) {
      return "snapshot unavailable: draw.io desktop app not found. Install from https://drawio.com for visual review. Use 'map' query for text-based spatial summary.";
    }

    const xml = serializeDiagram(this.model.diagram);

    return renderSnapshot({
      cliPath: this.drawioCliPath,
      diagramXml: xml,
      width,
      page: pageNum,
    }).then((image) => {
      const pageCount = pages.length;
      const shapeCount = requestedPage.shapes.size;
      const edgeCount = requestedPage.edges.size;
      const groupCount = requestedPage.groups.size;
      const sizeKB = Math.round(image.sizeBytes / 1024);
      return {
        text: `snapshot: ${image.width}px ${sizeKB}KB [${shapeCount}s ${edgeCount}e ${groupCount}g p:${pageNum}/${pageCount}]`,
        image,
      } as QueryResult;
    });
  }
}
