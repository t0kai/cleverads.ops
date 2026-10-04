import type { CostBasis, MonthRow, Rate, Totals } from './types';

export const costOf = (r: MonthRow, basis: CostBasis): number => (basis === 'total' ? r.total : r.media);

/** Adds rows up, then works out the rates from the totals (never an average of averages). */
export function totals(rows: readonly MonthRow[], basis: CostBasis): Totals {
  let cost = 0;
  let media = 0;
  let impressions = 0;
  let clicks = 0;
  for (const r of rows) {
    cost += costOf(r, basis);
    media += r.media;
    impressions += r.impressions;
    clicks += r.clicks;
  }
  return {
    cost,
    media,
    impressions,
    clicks,
    cpm: impressions > 0 ? (cost / impressions) * 1000 : null,
    cpc: clicks > 0 ? cost / clicks : null,
    ctr: impressions > 0 ? clicks / impressions : null,
  };
}

export const EMPTY_TOTALS: Totals = totals([], 'total');

export const rateOf = (t: Totals, rate: Rate): number | null => (rate === 'cpm' ? t.cpm : t.cpc);

/** One Totals per month, in the order given. Months with no rows give zero totals and null rates. */
export function byMonth(rows: readonly MonthRow[], months: readonly string[], basis: CostBasis): (Totals & { readonly month: string })[] {
  const groups = new Map<string, MonthRow[]>();
  for (const r of rows) {
    const g = groups.get(r.month);
    if (g) g.push(r);
    else groups.set(r.month, [r]);
  }
  return months.map((month) => ({ month, ...totals(groups.get(month) ?? [], basis) }));
}

/** % change from a to b. null when either side is missing or a is 0. */
export function change(a: number | null, b: number | null): number | null {
  if (a == null || b == null || a === 0 || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (b / a - 1) * 100;
}
