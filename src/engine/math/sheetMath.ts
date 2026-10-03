/**
 * Google Sheets arithmetic, reproduced exactly so the numbers on screen match the sheet.
 * Blank cells are `null`.
 */

/** Sheets ROUND: half away from zero, with a tiny epsilon for binary floats (2.675 → 2.68). */
export function sheetRound(value: number, digits = 0): number {
  const f = 10 ** digits;
  const scaled = Math.abs(value) * f;
  const rounded = Math.round(scaled + Number.EPSILON * Math.max(1, scaled) * 4) / f;
  return Math.sign(value) * rounded;
}

/** Sheets ROUNDUP: away from zero. */
export function sheetRoundUp(value: number, digits = 0): number {
  const f = 10 ** digits;
  const scaled = value * f;
  const eps = 1e-9;
  return (scaled >= 0 ? Math.ceil(scaled - eps) : Math.floor(scaled + eps)) / f;
}

/** Sum that treats blanks as 0, like SUMIF over empty cells. */
export function sumBlanks(values: readonly (number | null)[]): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}
