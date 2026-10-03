/** Lowercase key used to match IO names to target-sheet rows and to group 2nd/3rd IOs. */
export function normalizeKey(name: string): string {
  return name.replace(/\bIO\b/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export interface SplitName {
  /** Name without the "2nd"/"3rd" suffix. */
  readonly base: string;
  /** 1 for the main IO, 2 for "2nd", 3 for "3rd" … */
  readonly order: number;
  /** "2nd", "3rd" … or "" for the main IO. */
  readonly label: string;
}

/** "Campaign 04 - 9000004 2nd" → { base: "Campaign 04 - 9000004", order: 2, label: "2nd" } */
export function splitName(name: string): SplitName {
  const trimmed = name.trim();
  const m = /^(.*?)\s+(\d+)(st|nd|rd|th)$/i.exec(trimmed);
  if (m && m[1] && m[2] && m[3] && Number(m[2]) >= 2) {
    return { base: m[1], order: Number(m[2]), label: m[2] + m[3].toLowerCase() };
  }
  return { base: trimmed, order: 1, label: '' };
}
