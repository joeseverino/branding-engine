// Narrowing helpers for data that crosses a trust boundary (JSON files, specs,
// CLI flags). Everything read from disk is `unknown` until one of these, or a
// validator built on them, says otherwise.

export type JsonObject = Record<string, unknown>;

export function parseJson(text: string): unknown {
  return JSON.parse(text);
}

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Unwrap a lookup that earlier validation guarantees; a miss is an engine bug, not bad input. */
export function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Internal error: ${what} is missing.`);
  return value;
}
