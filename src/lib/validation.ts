export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Characters that have a special meaning inside a PostgREST .or() filter
export function sanitizeSearch(input: string): string {
  return input.replace(/[,()%*\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
