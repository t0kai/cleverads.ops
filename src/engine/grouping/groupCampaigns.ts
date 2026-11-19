import { normalizeKey, splitName } from './names';

export interface GroupMember<T> {
  readonly item: T;
  readonly order: number;
  readonly label: string;
}

export interface CampaignGroup<T> {
  /** normalizeKey(base name); the hidden "Group Key" column in the sheet. */
  readonly key: string;
  /** Members sorted main → 2nd → 3rd. */
  readonly members: readonly GroupMember<T>[];
  /** False when only a 2nd/3rd IO is in the CSV (its main is missing). */
  readonly hasMain: boolean;
}

/**
 * Groups main + 2nd/3rd IOs. Keeps the CSV's order of first appearance.
 * Pass the tracker's names (`known`) to also read "… #2" and "… 2" endings — see splitName.
 */
export function groupCampaigns<T extends { readonly name: string }>(
  items: readonly T[],
  known?: { has(key: string): boolean },
): CampaignGroup<T>[] {
  const isKnown = known ? (key: string) => known.has(key) : undefined;
  const byKey = new Map<string, GroupMember<T>[]>();
  for (const item of items) {
    const s = splitName(item.name, isKnown);
    const key = normalizeKey(s.base);
    const list = byKey.get(key) ?? [];
    if (!byKey.has(key)) byKey.set(key, list);
    list.push({ item, order: s.order, label: s.label });
  }
  return [...byKey.entries()].map(([key, members]) => {
    const sorted = [...members].sort((a, b) => a.order - b.order);
    return { key, members: sorted, hasMain: sorted[0]?.order === 1 };
  });
}
