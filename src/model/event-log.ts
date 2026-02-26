import type { DiagramEvent, EventLog } from "../types/index.js";

export function createEventLog(): EventLog {
  return {
    events: [],
    cursor: 0,
    checkpoints: new Map(),
  };
}

/**
 * Append an event, truncating any redo history beyond the cursor.
 */
export function appendEvent(log: EventLog, event: DiagramEvent): void {
  // Discard any events after the current cursor (redo history lost on new mutation)
  if (log.cursor < log.events.length) {
    log.events.length = log.cursor;
    // Remove checkpoints pointing beyond new length
    for (const [name, idx] of log.checkpoints) {
      if (idx > log.cursor) {
        log.checkpoints.delete(name);
      }
    }
  }
  log.events.push(event);
  log.cursor = log.events.length;
}

/**
 * Create a named checkpoint at the current cursor position.
 */
export function createCheckpoint(log: EventLog, name: string): void {
  log.checkpoints.set(name, log.cursor);
  appendEvent(log, { type: "checkpoint", name, eventIndex: log.cursor });
}

/**
 * Get events to undo (from cursor backward by count steps, skipping checkpoint events).
 * Returns events in reverse order (most recent first).
 */
export function getUndoEvents(log: EventLog, count: number = 1): DiagramEvent[] {
  const events: DiagramEvent[] = [];
  let pos = log.cursor - 1;
  let undone = 0;

  while (pos >= 0 && undone < count) {
    const event = log.events[pos];
    if (event.type !== "checkpoint") {
      events.push(event);
      undone++;
    }
    pos--;
  }

  // Move cursor back
  log.cursor = pos + 1;
  return events;
}

/**
 * Undo to a named checkpoint. Returns events in reverse order.
 */
export function undoToCheckpoint(log: EventLog, name: string): DiagramEvent[] | null {
  const target = log.checkpoints.get(name);
  if (target === undefined || target >= log.cursor) return null;

  const events: DiagramEvent[] = [];
  for (let i = log.cursor - 1; i >= target; i--) {
    const event = log.events[i];
    if (event.type !== "checkpoint") {
      events.push(event);
    }
  }
  log.cursor = target;
  return events;
}

/**
 * Get events to redo (from cursor forward by count steps, skipping checkpoint events).
 * Returns events in forward order.
 */
export function getRedoEvents(log: EventLog, count: number = 1): DiagramEvent[] {
  const events: DiagramEvent[] = [];
  let pos = log.cursor;
  let redone = 0;

  while (pos < log.events.length && redone < count) {
    const event = log.events[pos];
    if (event.type !== "checkpoint") {
      events.push(event);
      redone++;
    }
    pos++;
  }

  log.cursor = pos;
  return events;
}

/**
 * Get the last N non-checkpoint events (for history query).
 */
export function getRecentEvents(log: EventLog, count: number): DiagramEvent[] {
  const events: DiagramEvent[] = [];
  for (let i = log.cursor - 1; i >= 0 && events.length < count; i--) {
    const event = log.events[i];
    if (event.type !== "checkpoint") {
      events.push(event);
    }
  }
  return events.reverse();
}

export function canUndo(log: EventLog): boolean {
  // Check if there are any non-checkpoint events before cursor
  for (let i = log.cursor - 1; i >= 0; i--) {
    if (log.events[i].type !== "checkpoint") return true;
  }
  return false;
}

export function canRedo(log: EventLog): boolean {
  return log.cursor < log.events.length;
}
