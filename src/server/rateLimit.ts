/**
 * Small per-user limit (per server instance) so a stuck browser tab cannot hammer Google.
 * 30 requests a minute is far above normal use: the page makes one call per load or refresh.
 */
const WINDOW_MS = 60_000;
const LIMIT = 30;
const hits = new Map<string, number[]>();

export function allowRequest(user: string, now = Date.now()): boolean {
  const recent = (hits.get(user) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(user, recent);
    return false;
  }
  recent.push(now);
  hits.set(user, recent);
  if (hits.size > 1000) hits.delete(hits.keys().next().value as string);
  return true;
}

export function resetRateLimit(): void {
  hits.clear();
}
