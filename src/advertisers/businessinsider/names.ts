import { normalizeKey } from '@/engine/grouping/names';

/**
 * Business Insider IO names, as DV360 has them (the CSV reader already drops the word "IO"):
 *   "PMI Ascending IO 1"     → "PMI Ascending 1"    → tracker row "PMI Ascending", 1st IO
 *   "PMI Ascending 2 IO 1"   → "PMI Ascending 2 1"  → the same campaign, 2nd IO
 *   "PMI Established IO"     → "PMI Established"    → tracker row "PMI Established", 1st IO
 *   "PMI Established 3 IO"   → "PMI Established 3"  → the same campaign, 3rd IO
 * The IO's order is the number in front of "IO". An exact tracker name always wins, so a campaign whose own
 * name ends in a number is not split; otherwise the longest tracker name the IO starts with wins.
 */

/** The tracker key an IO belongs to: exact name, else the longest tracker name it starts with, else its own name. */
export function resolveTrackerKey(base: string, trackerKeys: readonly string[]): { key: string; matched: boolean } {
  if (trackerKeys.includes(base)) return { key: base, matched: true };
  let best = '';
  for (const k of trackerKeys) {
    if (k.length > best.length && base.startsWith(`${k} `)) best = k;
  }
  return best ? { key: best, matched: true } : { key: base, matched: false };
}

/** Where one IO belongs: its campaign's key and its order (1 for the first IO). */
export function locateIo(name: string, trackerKeys: readonly string[]): { key: string; order: number; matched: boolean } {
  const full = normalizeKey(name);
  if (trackerKeys.includes(full)) return { key: full, order: 1, matched: true };
  const fits = (base: string) => trackerKeys.length === 0 || trackerKeys.includes(base);
  // "<campaign> <order> <IO number>", e.g. "pmi ascending 2 1"
  const two = /^(.*\S)\s+(\d{1,2})\s+(\d{1,2})$/.exec(full);
  if (two && two[1] && fits(two[1])) return { key: two[1], order: Math.max(1, Number(two[2])), matched: trackerKeys.length > 0 };
  // "<campaign> <order>" or "<campaign> <IO number>", e.g. "pmi established 2" / "pmi ascending 1"
  const one = /^(.*\S)\s+(\d{1,2})$/.exec(full);
  if (one && one[1] && fits(one[1])) return { key: one[1], order: Math.max(1, Number(one[2])), matched: trackerKeys.length > 0 };
  return { ...resolveTrackerKey(full, trackerKeys), order: 1 };
}

export interface BiMember<T> {
  readonly item: T;
  readonly order: number;
}

export interface BiGroup<T> {
  /** The tracker key (or the IO's own key when no tracker row matches). Hidden "Group Key" column. */
  readonly key: string;
  /** IOs in order: 1st, 2nd, 3rd … */
  readonly members: readonly BiMember<T>[];
  /** True when a tracker row was found for the campaign. */
  readonly matched: boolean;
}

/** Groups a campaign's IOs. Keeps the CSV's order of first appearance between campaigns. */
export function groupBusinessInsiderCampaigns<T extends { readonly name: string }>(items: readonly T[], trackerKeys: readonly string[] = []): BiGroup<T>[] {
  const byKey = new Map<string, { matched: boolean; members: (BiMember<T> & { at: number })[] }>();
  items.forEach((item, at) => {
    const { key, order, matched } = locateIo(item.name, trackerKeys);
    const group = byKey.get(key) ?? { matched, members: [] };
    if (!byKey.has(key)) byKey.set(key, group);
    group.members.push({ item, order, at });
  });
  return [...byKey.entries()].map(([key, g]) => ({
    key,
    matched: g.matched,
    members: [...g.members].sort((a, b) => a.order - b.order || a.at - b.at).map(({ item, order }) => ({ item, order })),
  }));
}
