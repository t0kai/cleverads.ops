import { normalizeKey } from '@/engine/grouping/names';

/**
 * Ufurnish IO names, as DV360 has them (the CSV reader already drops the word "IO"):
 *   "Bed Kingdom Q4 2026 campaign IO"    → "… campaign"    → tracker row "Bed Kingdom Q4 2026 campaign", 1st IO
 *   "Bed Kingdom Q4 2026 campaign IO 2"  → "… campaign 2"  → the same campaign, 2nd IO
 * A campaign name can itself end in a number ("Shutterly Fabulous Q4 2026"), so: an exact tracker name wins; otherwise
 * a trailing 1–2 digit number is the IO order when the rest of the name is a tracker campaign. When the name is still
 * not a tracker row, the longest tracker name it starts with wins.
 */

export type BuyingType = 'CPC' | 'CPCV';

/** Tracker "Buying Type" → CPC / CPCV. Anything else (or blank) → null. */
export function parseBuyingType(value: unknown): BuyingType | null {
  const v = String(value ?? '').trim().toUpperCase();
  if (v.includes('CPCV')) return 'CPCV';
  if (v.includes('CPC')) return 'CPC';
  return null;
}

/** The tracker key an IO belongs to: exact name, else the longest tracker name it starts with, else its own name. */
export function resolveTrackerKey(base: string, trackerKeys: readonly string[]): { key: string; matched: boolean } {
  if (trackerKeys.includes(base)) return { key: base, matched: true };
  let best = '';
  for (const k of trackerKeys) {
    if (k.length > best.length && base.startsWith(`${k} `)) best = k;
  }
  return best ? { key: best, matched: true } : { key: base, matched: false };
}

/** Where one IO belongs: its campaign's key and its order (1 for "… IO", N for "… IO N"). */
export function locateIo(name: string, trackerKeys: readonly string[]): { key: string; order: number; matched: boolean } {
  const full = normalizeKey(name);
  if (trackerKeys.includes(full)) return { key: full, order: 1, matched: true };
  const m = /^(.*\S)\s+(\d{1,2})$/.exec(full);
  if (m && m[1] && Number(m[2]) >= 2) {
    const r = resolveTrackerKey(m[1], trackerKeys);
    if (r.matched || trackerKeys.length === 0) return { key: r.key, order: Number(m[2]), matched: r.matched };
  }
  return { ...resolveTrackerKey(full, trackerKeys), order: 1 };
}

export interface UfurnishMember<T> {
  readonly item: T;
  readonly order: number;
}

export interface UfurnishGroup<T> {
  /** The tracker key (or the IO's own key when no tracker row matches). Hidden "Group Key" column. */
  readonly key: string;
  /** IOs in order: "IO", "IO 2", "IO 3" … */
  readonly members: readonly UfurnishMember<T>[];
  /** True when a tracker row was found for the campaign. */
  readonly matched: boolean;
}

/** Groups a campaign's IOs. Keeps the CSV's order of first appearance between campaigns. */
export function groupUfurnishCampaigns<T extends { readonly name: string }>(items: readonly T[], trackerKeys: readonly string[] = []): UfurnishGroup<T>[] {
  const byKey = new Map<string, { matched: boolean; members: (UfurnishMember<T> & { at: number })[] }>();
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
