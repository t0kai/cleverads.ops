import { normalizeKey } from '@/engine/grouping/names';

/**
 * Benzinga IO names, as DV360 has them:
 *   "Perpetual Futures IO"                         → tracker row "Perpetual Futures"
 *   "Financial Display Campaign Regular IO 1"      → tracker row "Financial Display Campaign", 1st IO
 *   "Financial Display Campaign Regular IO 1 #10"  → the same campaign, 10th IO
 * normalizeKey already drops the word "IO". A trailing "#N" gives the IO's order. When the name is still not a
 * tracker row, the longest tracker name it starts with wins (so "… Regular 1" falls under "Financial Display Campaign").
 */

export type BuyingType = 'CPC' | 'CPM' | 'CPCV';

/** Tracker "Buying Type" → CPC / CPM / CPCV. Anything else (or blank) → null. */
export function parseBuyingType(value: unknown): BuyingType | null {
  const v = String(value ?? '').trim().toUpperCase();
  if (v.includes('CPCV')) return 'CPCV';
  if (v.includes('CPM')) return 'CPM';
  if (v.includes('CPC')) return 'CPC';
  return null;
}

export interface BenzingaName {
  /** normalizeKey(name) without the "#N" ending. */
  readonly base: string;
  /** 1 without "#N", otherwise N. */
  readonly order: number;
}

export function splitBenzingaName(name: string): BenzingaName {
  const key = normalizeKey(name);
  const m = /^(.*?)\s*#\s*(\d+)$/.exec(key);
  if (m && m[1] && m[2]) return { base: m[1].trim(), order: Number(m[2]) };
  return { base: key, order: 1 };
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

export interface BenzingaMember<T> {
  readonly item: T;
  readonly order: number;
}

export interface BenzingaGroup<T> {
  /** The tracker key (or the IO's own key when no tracker row matches). Hidden "Group Key" column. */
  readonly key: string;
  /** IOs in order: no "#N" first, then #2, #3 … */
  readonly members: readonly BenzingaMember<T>[];
  /** True when a tracker row was found for the campaign. */
  readonly matched: boolean;
}

/** Groups a campaign's IOs. Keeps the CSV's order of first appearance between campaigns. */
export function groupBenzingaCampaigns<T extends { readonly name: string }>(items: readonly T[], trackerKeys: readonly string[] = []): BenzingaGroup<T>[] {
  const byKey = new Map<string, { matched: boolean; members: (BenzingaMember<T> & { at: number })[] }>();
  items.forEach((item, at) => {
    const s = splitBenzingaName(item.name);
    const { key, matched } = resolveTrackerKey(s.base, trackerKeys);
    const group = byKey.get(key) ?? { matched, members: [] };
    if (!byKey.has(key)) byKey.set(key, group);
    group.members.push({ item, order: s.order, at });
  });
  return [...byKey.entries()].map(([key, g]) => ({
    key,
    matched: g.matched,
    members: [...g.members].sort((a, b) => a.order - b.order || a.at - b.at).map(({ item, order }) => ({ item, order })),
  }));
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
];
const MONTH_END = new RegExp(`^(.*\\S)\\s+(${MONTHS.join('|')})$`);

/**
 * Tracker rows that only split one campaign by month ("Financial Display Campaign" + "… October",
 * or "Vision Marine 2 July" + "… August") → the campaign's key. A lone "X October" with no other part stays as it is.
 */
export function monthlyBase(key: string, allKeys: readonly string[]): string | null {
  const m = MONTH_END.exec(key);
  if (!m || !m[1]) return null;
  const base = m[1];
  const siblings = allKeys.filter((k) => k === base || (k !== key && MONTH_END.exec(k)?.[1] === base));
  return siblings.length ? base : null;
}
