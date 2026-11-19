/** Lowercase key used to match IO names to target-sheet rows and to group 2nd/3rd IOs. */
export function normalizeKey(name: string): string {
  return name
    .replace(/\bIO\b/gi, '')
    // "A-B", "A -B", "A - B" and en/em dashes all become "A - B", so DV360 and tracker spellings match.
    .replace(/\s*[-\u2013\u2014]\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface SplitName {
  /** Name without the "2nd"/"3rd" suffix. */
  readonly base: string;
  /** 1 for the main IO, 2 for "2nd", 3 for "3rd" … */
  readonly order: number;
  /** "2nd", "3rd" … or "" for the main IO. */
  readonly label: string;
}

function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return n + (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
}

/**
 * "Campaign 04 - 9000004 2nd" → { base: "Campaign 04 - 9000004", order: 2, label: "2nd" }.
 * "… 2nd #2" counts as "2nd" too.
 *
 * With `isKnown` (does the tracker have this normalised name?), two weaker endings are also read as the IO's
 * order: "… #2" and a bare "… 2" (1–2 digits, separated by a space). They count only when the name without
 * the ending is in the tracker and the full name is not, so a number that belongs to the name stays put.
 */
export function splitName(name: string, isKnown?: (key: string) => boolean): SplitName {
  const trimmed = name.trim();
  const m = /^(.*?)\s+(\d+)(st|nd|rd|th)(?:\s*#\s*\d+)?$/i.exec(trimmed);
  if (m && m[1] && m[2] && m[3] && Number(m[2]) >= 2) {
    return { base: m[1], order: Number(m[2]), label: m[2] + m[3].toLowerCase() };
  }
  if (isKnown && !isKnown(normalizeKey(trimmed))) {
    const w = /^(.*?)\s*#\s*(\d{1,2})$/.exec(trimmed) ?? /^(.*\S)\s+(\d{1,2})$/.exec(trimmed);
    const order = Number(w?.[2]);
    if (w?.[1] && order >= 2 && isKnown(normalizeKey(w[1]))) {
      return { base: w[1].trim(), order, label: ordinal(order) };
    }
  }
  return { base: trimmed, order: 1, label: '' };
}
