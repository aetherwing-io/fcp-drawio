import type { ParsedOp, Verb, ArrowOperator } from "../types/index.js";
import type { TokenMeta } from "./tokenizer.js";
import { tokenizeWithMeta, isKeyValue, parseKeyValue, isArrow, isSelector } from "./tokenizer.js";

const VERBS = new Set<string>([
  "add", "remove", "define", "connect", "disconnect",
  "style", "label", "badge", "move", "resize", "swap",
  "layout", "orient", "group", "ungroup",
  "layer", "page", "checkpoint", "title", "load",
]);

/**
 * Parse an operation string into a structured ParsedOp.
 *
 * Every operation follows: VERB [TYPE] TARGET [key:value ...]
 * The verb determines how remaining tokens are interpreted.
 *
 * Uses tokenizeWithMeta() so quoted strings containing colons
 * (e.g., "threshold: 5 seconds") are not misclassified as key:value pairs.
 */
export function parseOp(input: string): ParsedOp | { error: string; raw: string } {
  const raw = input.trim();
  const metas = tokenizeWithMeta(raw);

  if (metas.length === 0) {
    return { error: "empty operation", raw };
  }

  const verb = metas[0].text.toLowerCase();
  if (!VERBS.has(verb)) {
    return { error: `unknown verb "${metas[0].text}"`, raw };
  }

  const rest = metas.slice(1);

  switch (verb) {
    case "add":
      return parseAdd(rest, raw);
    case "remove":
      return parseSimpleTarget(verb as Verb, rest, raw);
    case "define":
      return parseDefine(rest, raw);
    case "connect":
      return parseConnect(rest, raw);
    case "disconnect":
      return parseDisconnect(rest, raw);
    case "style":
      return parseTargetWithParams(verb as Verb, rest, raw);
    case "label":
      return parseLabel(rest, raw);
    case "badge":
      return parseBadge(rest, raw);
    case "move":
      return parseTargetWithParams("move", rest, raw);
    case "resize":
      return parseTargetWithParams("resize", rest, raw);
    case "swap":
      return parseSwap(rest, raw);
    case "group":
      return parseGroup(rest, raw);
    case "ungroup":
      return parseSimpleTarget("ungroup", rest, raw);
    case "layer":
      return parseSubcommand("layer", rest, raw);
    case "page":
      return parseSubcommand("page", rest, raw);
    case "checkpoint":
      return parseSimpleTarget("checkpoint", rest, raw);
    case "title":
      return parseSimpleTarget("title", rest, raw);
    case "layout":
      return parseTargetWithParams("layout", rest, raw);
    case "orient":
      return parseSimpleTarget("orient", rest, raw);
    case "load":
      return parseSimpleTarget("load", rest, raw);
    default:
      return { error: `unhandled verb "${verb}"`, raw };
  }
}

/** Check if a TokenMeta should be treated as a key:value pair (skip if quoted). */
function isTokenKV(t: TokenMeta): boolean {
  return !t.wasQuoted && isKeyValue(t.text);
}

// ── Verb-specific parsers ────────────────────────────────

/**
 * add TYPE LABEL [key:value]*
 * add LABEL [key:value]*  (type inferred from label)
 */
function parseAdd(tokens: TokenMeta[], raw: string): ParsedOp | { error: string; raw: string } {
  if (tokens.length < 1) {
    return { error: "add requires at least a label", raw };
  }

  const params = new Map<string, string>();
  const nonParams: string[] = [];

  for (const t of tokens) {
    if (isTokenKV(t)) {
      const { key, value } = parseKeyValue(t.text);
      params.set(key, value);
    } else if (isSelector(t.text)) {
      // selector as target
      nonParams.push(t.text);
    } else {
      nonParams.push(t.text);
    }
  }

  let type: string | undefined;
  let target: string;

  if (nonParams.length >= 2) {
    // First non-param could be a type or the label
    type = nonParams[0];
    target = nonParams[1];
  } else if (nonParams.length === 1) {
    target = nonParams[0];
  } else {
    return { error: "add requires a label", raw };
  }

  return {
    verb: "add",
    raw,
    type,
    target,
    params,
  };
}

/**
 * define NAME base:TYPE [theme:THEME] [badge:TEXT] [size:WxH]
 * define theme NAME fill:#HEX stroke:#HEX [font-color:#HEX]
 */
function parseDefine(tokens: TokenMeta[], raw: string): ParsedOp | { error: string; raw: string } {
  if (tokens.length < 1) {
    return { error: "define requires a name", raw };
  }

  const params = new Map<string, string>();
  const nonParams: string[] = [];

  for (const t of tokens) {
    if (isTokenKV(t)) {
      const { key, value } = parseKeyValue(t.text);
      params.set(key, value);
    } else {
      nonParams.push(t.text);
    }
  }

  if (nonParams.length === 0) {
    return { error: "define requires a name", raw };
  }

  return {
    verb: "define",
    raw,
    target: nonParams[0],
    targets: nonParams,
    params,
  };
}

/**
 * connect REF ARROW REF [ARROW REF]* [key:value]*
 */
function parseConnect(tokens: TokenMeta[], raw: string): ParsedOp | { error: string; raw: string } {
  const params = new Map<string, string>();
  const targets: string[] = [];
  const arrows: ArrowOperator[] = [];

  for (const t of tokens) {
    if (isTokenKV(t)) {
      const { key, value } = parseKeyValue(t.text);
      params.set(key, value);
    } else if (isArrow(t.text)) {
      arrows.push(t.text as ArrowOperator);
    } else {
      targets.push(t.text);
    }
  }

  if (targets.length < 2 || arrows.length < 1) {
    return { error: "connect requires at least REF ARROW REF", raw };
  }

  return {
    verb: "connect",
    raw,
    target: targets[0],
    targets,
    arrows,
    params,
  };
}

/**
 * disconnect REF ARROW REF
 */
function parseDisconnect(tokens: TokenMeta[], raw: string): ParsedOp | { error: string; raw: string } {
  const targets: string[] = [];
  const arrows: ArrowOperator[] = [];

  for (const t of tokens) {
    if (isArrow(t.text)) {
      arrows.push(t.text as ArrowOperator);
    } else if (!isTokenKV(t)) {
      targets.push(t.text);
    }
  }

  if (targets.length < 2) {
    return { error: "disconnect requires REF ARROW REF", raw };
  }

  return {
    verb: "disconnect",
    raw,
    target: targets[0],
    targets,
    arrows,
    params: new Map(),
  };
}

/**
 * label REF "new text"
 * label SRC -> TGT "new text"
 */
function parseLabel(tokens: TokenMeta[], raw: string): ParsedOp | { error: string; raw: string } {
  if (tokens.length < 2) {
    return { error: "label requires REF and text", raw };
  }

  const params = new Map<string, string>();
  const nonParams: string[] = [];
  const arrows: ArrowOperator[] = [];

  for (const t of tokens) {
    if (isTokenKV(t)) {
      const { key, value } = parseKeyValue(t.text);
      params.set(key, value);
    } else if (isArrow(t.text)) {
      arrows.push(t.text as ArrowOperator);
    } else {
      nonParams.push(t.text);
    }
  }

  // Edge form: label A -> B "text"
  if (arrows.length > 0) {
    if (nonParams.length < 3) {
      return { error: 'label edge requires: label SRC -> TGT "text"', raw };
    }
    params.set("text", nonParams[2]);
    return {
      verb: "label",
      raw,
      target: nonParams[0],
      targets: [nonParams[0], nonParams[1]],
      arrows,
      params,
    };
  }

  // Shape form: label REF "text"
  if (nonParams.length < 2) {
    return { error: "label requires REF and text", raw };
  }

  params.set("text", nonParams[1]);

  return {
    verb: "label",
    raw,
    target: nonParams[0],
    params,
  };
}

/**
 * badge REF "text" [pos:POSITION]
 */
function parseBadge(tokens: TokenMeta[], raw: string): ParsedOp | { error: string; raw: string } {
  if (tokens.length < 2) {
    return { error: "badge requires REF and text", raw };
  }

  const params = new Map<string, string>();
  const nonParams: string[] = [];

  for (const t of tokens) {
    if (isTokenKV(t)) {
      const { key, value } = parseKeyValue(t.text);
      params.set(key, value);
    } else {
      nonParams.push(t.text);
    }
  }

  if (nonParams.length < 2) {
    return { error: "badge requires REF and text", raw };
  }

  params.set("text", nonParams[1]);

  return {
    verb: "badge",
    raw,
    target: nonParams[0],
    params,
  };
}

/**
 * swap REF REF
 */
function parseSwap(tokens: TokenMeta[], raw: string): ParsedOp | { error: string; raw: string } {
  const nonParams = tokens.filter((t) => !isTokenKV(t)).map((t) => t.text);
  if (nonParams.length < 2) {
    return { error: "swap requires two REFs", raw };
  }

  return {
    verb: "swap",
    raw,
    target: nonParams[0],
    targets: [nonParams[0], nonParams[1]],
    params: new Map(),
  };
}

/**
 * group REF [REF]* as:NAME
 */
function parseGroup(tokens: TokenMeta[], raw: string): ParsedOp | { error: string; raw: string } {
  const params = new Map<string, string>();
  const targets: string[] = [];

  for (const t of tokens) {
    if (isTokenKV(t)) {
      const { key, value } = parseKeyValue(t.text);
      params.set(key, value);
    } else {
      targets.push(t.text);
    }
  }

  if (targets.length < 1) {
    return { error: "group requires at least one REF", raw };
  }

  if (!params.has("as")) {
    return { error: 'group requires as:NAME parameter', raw };
  }

  return {
    verb: "group",
    raw,
    target: targets[0],
    targets,
    params,
  };
}

/**
 * Generic: VERB TARGET [key:value]*
 * Used for style, move, resize, layout
 */
function parseTargetWithParams(verb: Verb, tokens: TokenMeta[], raw: string): ParsedOp | { error: string; raw: string } {
  if (tokens.length < 1) {
    return { error: `${verb} requires a target`, raw };
  }

  const params = new Map<string, string>();
  let target: string | undefined;
  let selector: string | undefined;

  for (const t of tokens) {
    if (isTokenKV(t)) {
      const { key, value } = parseKeyValue(t.text);
      params.set(key, value);
    } else if (isSelector(t.text) && !target) {
      target = t.text;
      selector = t.text;
    } else if (!target) {
      target = t.text;
    } else {
      // Bare token after target — treat as boolean flag (e.g., bold, italic, no-bold)
      params.set(t.text, "true");
    }
  }

  if (target == null) {
    return { error: `${verb} requires a target`, raw };
  }

  return {
    verb,
    raw,
    target,
    selector,
    params,
  };
}

/**
 * Generic simple target: VERB TARGET
 * Used for remove, ungroup, checkpoint, title
 */
function parseSimpleTarget(verb: Verb, tokens: TokenMeta[], raw: string): ParsedOp | { error: string; raw: string } {
  if (tokens.length < 1) {
    return { error: `${verb} requires a target`, raw };
  }

  // Collect params and non-param tokens
  const params = new Map<string, string>();
  const nonParams: string[] = [];

  for (const t of tokens) {
    if (isTokenKV(t)) {
      const { key, value } = parseKeyValue(t.text);
      params.set(key, value);
    } else {
      nonParams.push(t.text);
    }
  }

  const target = nonParams[0];
  if (target == null) {
    return { error: `${verb} requires a target`, raw };
  }

  return {
    verb,
    raw,
    target,
    selector: isSelector(target) ? target : undefined,
    params,
  };
}

/**
 * Subcommand: VERB SUBCOMMAND [args]*
 * Used for page and layer operations.
 */
function parseSubcommand(verb: Verb, tokens: TokenMeta[], raw: string): ParsedOp | { error: string; raw: string } {
  if (tokens.length < 1) {
    return { error: `${verb} requires a subcommand`, raw };
  }

  const subcommand = tokens[0].text.toLowerCase();
  const rest = tokens.slice(1);
  const params = new Map<string, string>();
  const nonParams: string[] = [];

  for (const t of rest) {
    if (isTokenKV(t)) {
      const { key, value } = parseKeyValue(t.text);
      params.set(key, value);
    } else {
      nonParams.push(t.text);
    }
  }

  return {
    verb,
    raw,
    subcommand,
    target: nonParams[0],
    targets: nonParams.length > 0 ? nonParams : undefined,
    params,
  };
}

export function isParseError(result: ParsedOp | { error: string; raw: string }): result is { error: string; raw: string } {
  return "error" in result;
}
