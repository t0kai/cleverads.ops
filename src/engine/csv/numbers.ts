/**
 * DV360 exports numbers as "1,147", "A$12.25", "12.25 AUD" or "".
 * Same rule as the Apps Script: keep digits, dot and minus; anything unreadable becomes 0.
 */
export function parseNumber(value: unknown): number {
  const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
