import { normalizeKey } from '@/engine/grouping/names';

/**
 * Time Out names its IOs "X IO", "X 2nd IO", "X 2nd IO 3rd" (the 3rd IO is a copy of the 2nd).
 * After "IO" is removed that is "X", "X 2nd", "X 2nd 3rd". Every trailing ordinal is stripped,
 * and the last one gives the order, so "X 2nd 3rd" is the 3rd IO of "X".
 */
export interface TimeOutName {
  readonly base: string;
  /** 1 = main IO, 2 = 2nd, 3 = 3rd … */
  readonly order: number;
  /** "2nd", "3rd" … or "" for the main IO. */
  readonly label: string;
}

const TRAILING_ORDINAL = /\s+(\d+)(st|nd|rd|th)$/i;

export function splitTimeOutName(name: string): TimeOutName {
  let base = name.trim();
  let order = 1;
  let label = '';
  for (let m = TRAILING_ORDINAL.exec(base); m && Number(m[1]) >= 2; m = TRAILING_ORDINAL.exec(base)) {
    if (order === 1) {
      // The last ordinal in the name decides the order.
      order = Number(m[1]);
      label = `${m[1]}${(m[2] ?? '').toLowerCase()}`;
    }
    base = base.slice(0, m.index).trim();
  }
  return { base, order, label };
}

export interface TimeOutGroup<T> {
  /** normalizeKey(base name); also the key used to find the campaign in the tracker. */
  readonly key: string;
  /** main → 2nd → 3rd. */
  readonly members: readonly { readonly item: T; readonly order: number; readonly label: string }[];
  /** False when only a 2nd/3rd IO is in the CSV. */
  readonly hasMain: boolean;
}

/** Groups main + 2nd/3rd IOs, keeping the CSV's order of first appearance. */
export function groupTimeOutCampaigns<T extends { readonly name: string }>(items: readonly T[]): TimeOutGroup<T>[] {
  const byKey = new Map<string, { item: T; order: number; label: string }[]>();
  for (const item of items) {
    const s = splitTimeOutName(item.name);
    const key = normalizeKey(s.base);
    const list = byKey.get(key);
    if (list) list.push({ item, order: s.order, label: s.label });
    else byKey.set(key, [{ item, order: s.order, label: s.label }]);
  }
  return [...byKey.entries()].map(([key, members]) => {
    const sorted = [...members].sort((a, b) => a.order - b.order);
    return { key, members: sorted, hasMain: sorted[0]?.order === 1 };
  });
}
