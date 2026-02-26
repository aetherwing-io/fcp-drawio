import type { Shape, Page, Group } from "../types/index.js";
import type { ReferenceRegistry } from "../model/reference-registry.js";
import type { DiagramModel } from "../model/diagram-model.js";

export type ResolveResult =
  | { kind: "single"; shape: Shape }
  | { kind: "multiple"; shapes: Shape[]; message: string }
  | { kind: "none"; message: string; suggestedLabel?: string };

/**
 * 5-level reference resolution cascade.
 *
 * 1. Exact label match (case-sensitive)
 * 2. Case-insensitive match
 * 3. Normalized match (strip hyphens, underscores, spaces)
 * 4. Prefix match
 * 5. Recency match (@recent)
 *
 * Short-circuits at the first level producing exactly one result.
 */
export function resolveRef(ref: string, registry: ReferenceRegistry, model: DiagramModel): ResolveResult {
  // Handle selectors
  if (ref.startsWith("@")) {
    return resolveSelector(ref, registry, model);
  }

  // Handle type-qualified references: db:UserDB
  if (ref.includes(":") && !ref.startsWith("#")) {
    const [typeHint, label] = ref.split(":", 2);
    const byType = registry.getByType(typeHint);
    const match = byType.filter((s) => s.label === label);
    if (match.length === 1) return { kind: "single", shape: match[0] };
    if (match.length > 1) {
      return { kind: "multiple", shapes: match, message: `"${ref}" matches ${match.length} shapes` };
    }
    // Fall through to normal resolution with just the label part
    return resolveRef(label, registry, model);
  }

  // Handle group-qualified references: Backend/AuthService
  if (ref.includes("/")) {
    const [groupName, label] = ref.split("/", 2);
    const group = model.getGroupByName(groupName);
    if (group) {
      const page = model.getActivePage();
      for (const memberId of group.memberIds) {
        const shape = page.shapes.get(memberId);
        if (shape && shape.label === label) {
          return { kind: "single", shape };
        }
      }
    }
  }

  // Level 1: Exact label match
  const exact = registry.getByExactLabel(ref);
  if (exact.length === 1) return { kind: "single", shape: exact[0] };
  if (exact.length > 1) {
    return {
      kind: "multiple",
      shapes: exact,
      message: `"${ref}" matches ${exact.length}: ${exact.map(s => `${s.label}(${s.type})`).join(", ")}. Qualify with type (e.g., db:${ref}) or group (e.g., Backend/${ref})`,
    };
  }

  // Level 2: Case-insensitive match
  const ci = registry.getByCaseInsensitiveLabel(ref);
  if (ci.length === 1) return { kind: "single", shape: ci[0] };
  if (ci.length > 1) {
    return {
      kind: "multiple",
      shapes: ci,
      message: `"${ref}" matches ${ci.length}: ${ci.map(s => s.label).join(", ")}`,
    };
  }

  // Level 3: Normalized match
  const norm = registry.getByNormalizedLabel(ref);
  if (norm.length === 1) return { kind: "single", shape: norm[0] };
  if (norm.length > 1) {
    return {
      kind: "multiple",
      shapes: norm,
      message: `"${ref}" matches ${norm.length}: ${norm.map(s => s.label).join(", ")}`,
    };
  }

  // Level 4: Prefix match
  const prefix = registry.getByPrefixLabel(ref);
  if (prefix.length === 1) return { kind: "single", shape: prefix[0] };
  if (prefix.length > 1) {
    return {
      kind: "multiple",
      shapes: prefix,
      message: `"${ref}" matches ${prefix.length}: ${prefix.map(s => s.label).join(", ")}`,
    };
  }

  // Level 5: Nothing found — suggest similar labels
  const all = registry.getAllShapes();
  const suggestions = findSimilar(ref, all.map((s) => s.label));

  if (suggestions.length > 0) {
    return {
      kind: "none",
      message: `unknown ref "${ref}". Did you mean "${suggestions[0]}"?`,
      suggestedLabel: suggestions[0],
    };
  }

  return {
    kind: "none",
    message: `unknown ref "${ref}". No shapes on this page.`,
  };
}

/**
 * Resolve a selector to matching shapes.
 */
function resolveSelector(selector: string, registry: ReferenceRegistry, model: DiagramModel): ResolveResult {
  const page = model.getActivePage();

  if (selector === "@all") {
    const shapes = registry.getAllShapes();
    if (shapes.length === 0) return { kind: "none", message: "@all matched 0 shapes" };
    return { kind: "multiple", shapes, message: `@all: ${shapes.length} shapes` };
  }

  if (selector === "@recent") {
    const recent = registry.getMostRecent(1);
    if (recent.length === 0) return { kind: "none", message: "no recent shapes" };
    return { kind: "single", shape: recent[0] };
  }

  if (selector.startsWith("@recent:")) {
    const count = parseInt(selector.slice(8), 10);
    if (isNaN(count) || count <= 0) return { kind: "none", message: `invalid count in "${selector}"` };
    const recent = registry.getMostRecent(count);
    if (recent.length === 0) return { kind: "none", message: "no recent shapes" };
    return { kind: "multiple", shapes: recent, message: `@recent:${count}: ${recent.length} shapes` };
  }

  if (selector === "@orphan") {
    const orphans = registry.getOrphans(page);
    if (orphans.length === 0) return { kind: "none", message: "@orphan matched 0 shapes" };
    return { kind: "multiple", shapes: orphans, message: `@orphan: ${orphans.length} shapes` };
  }

  if (selector.startsWith("@type:")) {
    const type = selector.slice(6);
    const shapes = registry.getByType(type);
    if (shapes.length === 0) {
      const allTypes = new Map<string, number>();
      for (const s of registry.getAllShapes()) {
        allTypes.set(s.type, (allTypes.get(s.type) ?? 0) + 1);
      }
      const available = [...allTypes.entries()].map(([t, c]) => `${c} ${t}`).join(", ");
      return { kind: "none", message: `@type:${type} matched 0 shapes (page has: ${available || "no shapes"})` };
    }
    return { kind: "multiple", shapes, message: `@type:${type}: ${shapes.length} shapes` };
  }

  if (selector.startsWith("@group:")) {
    const groupName = selector.slice(7);
    const group = model.getGroupByName(groupName);
    if (!group) return { kind: "none", message: `unknown group "${groupName}"` };
    const shapes: Shape[] = [];
    for (const id of group.memberIds) {
      const shape = page.shapes.get(id);
      if (shape) shapes.push(shape);
    }
    if (shapes.length === 0) return { kind: "none", message: `@group:${groupName} has 0 members` };
    return { kind: "multiple", shapes, message: `@group:${groupName}: ${shapes.length} shapes` };
  }

  if (selector.startsWith("@page:")) {
    const pageName = selector.slice(6);
    const targetPage = model.getPageByName(pageName);
    if (!targetPage) return { kind: "none", message: `unknown page "${pageName}"` };
    const shapes = [...targetPage.shapes.values()];
    if (shapes.length === 0) return { kind: "none", message: `@page:${pageName} has 0 shapes` };
    return { kind: "multiple", shapes, message: `@page:${pageName}: ${shapes.length} shapes` };
  }

  if (selector.startsWith("@layer:")) {
    const layerName = selector.slice(7);
    const shapes = registry.getAllShapes().filter((s) => {
      const layer = page.layers.find((l) => l.id === s.layer);
      return layer && layer.name === layerName;
    });
    if (shapes.length === 0) return { kind: "none", message: `@layer:${layerName} matched 0 shapes` };
    return { kind: "multiple", shapes, message: `@layer:${layerName}: ${shapes.length} shapes` };
  }

  if (selector.startsWith("@connected:")) {
    const innerRef = selector.slice(11);
    // Resolve the inner reference to find the anchor shape
    const innerResult = resolveRef(innerRef, registry, model);
    if (innerResult.kind === "none") {
      return { kind: "none", message: `@connected:${innerRef} — ${innerResult.message}` };
    }
    if (innerResult.kind === "multiple") {
      return { kind: "none", message: `@connected:${innerRef} — ambiguous: ${innerResult.message}` };
    }
    // innerResult.kind === "single" or "group"
    if (innerResult.kind === "group") {
      return { kind: "none", message: `@connected:${innerRef} — cannot use group as anchor` };
    }
    const connected = registry.getConnectedShapes(innerResult.shape.id, page);
    if (connected.length === 0) return { kind: "none", message: `@connected:${innerRef} matched 0 shapes` };
    return { kind: "multiple", shapes: connected, message: `@connected:${innerRef}: ${connected.length} shapes` };
  }

  return { kind: "none", message: `unknown selector "${selector}"` };
}

/**
 * Find similar labels using simple edit distance.
 * Returns up to 3 suggestions sorted by similarity.
 */
function findSimilar(target: string, candidates: string[]): string[] {
  const lower = target.toLowerCase();
  const scored = candidates
    .map((c) => ({ label: c, distance: levenshtein(lower, c.toLowerCase()) }))
    .filter((s) => s.distance <= Math.max(3, Math.floor(target.length / 2)))
    .sort((a, b) => a.distance - b.distance);
  return scored.slice(0, 3).map((s) => s.label);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
