import { normalizeKey } from '@/engine/grouping/names';

/**
 * The Economist IO names, as DV360 has them (the CSV reader already drops the word "IO"):
 *   "GCash x Economist Enterprise - Australia IO"     → tracker row "GCash x Economist Enterprise - Australia", 1st IO
 *   "GCash x Economist Enterprise - Australia IO #2"  → the same country, 2nd IO
 * Each country is its own tracker row (its own CPC and budget). An exact tracker name always wins; otherwise the
 * longest tracker name the IO starts with wins.
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

/** Where one IO belongs: its campaign's key and its order (1 for "… IO", N for "… IO #N"). */
export function locateIo(name: string, trackerKeys: readonly string[]): { key: string; order: number; matched: boolean } {
  const full = normalizeKey(name);
  if (trackerKeys.includes(full)) return { key: full, order: 1, matched: true };
  const m = /^(.*?)\s*#\s*(\d+)$/.exec(full);
  const base = m && m[1] ? m[1].trim() : full;
  return { ...resolveTrackerKey(base, trackerKeys), order: m && m[2] ? Math.max(1, Number(m[2])) : 1 };
}

export interface EconMember<T> {
  readonly item: T;
  readonly order: number;
}

export interface EconGroup<T> {
  /** The tracker key (or the IO's own key when no tracker row matches). Hidden "Group Key" column. */
  readonly key: string;
  /** IOs in order: "IO", "IO #2", "IO #3" … */
  readonly members: readonly EconMember<T>[];
  /** True when a tracker row was found for the campaign. */
  readonly matched: boolean;
}

/** Groups a campaign's IOs. Keeps the CSV's order of first appearance between campaigns. */
export function groupEconomistCampaigns<T extends { readonly name: string }>(items: readonly T[], trackerKeys: readonly string[] = []): EconGroup<T>[] {
  const byKey = new Map<string, { matched: boolean; members: (EconMember<T> & { at: number })[] }>();
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
