let shapeCounter = 0;
let edgeCounter = 0;
let groupCounter = 0;
let pageCounter = 0;
let layerCounter = 0;
let sequenceCounter = 0;

export function nextShapeId(): string {
  return `s_${++shapeCounter}`;
}

export function nextEdgeId(): string {
  return `e_${++edgeCounter}`;
}

export function nextGroupId(): string {
  return `g_${++groupCounter}`;
}

export function nextPageId(): string {
  return `p_${++pageCounter}`;
}

export function nextLayerId(): string {
  return `l_${++layerCounter}`;
}

/** Monotonic sequence for ordering (avoids Date.now() ties). */
export function nextSequence(): number {
  return ++sequenceCounter;
}

/** Reset all counters (for testing only). */
export function resetIdCounters(): void {
  shapeCounter = 0;
  edgeCounter = 0;
  groupCounter = 0;
  pageCounter = 0;
  layerCounter = 0;
  sequenceCounter = 0;
}
