import { byMonth, change, rateOf, totals } from './totals';
import type { CostBasis, MonthRow, Rate, Totals } from './types';

export interface ClientSummary {
  readonly advertiser: string;
  readonly totals: Totals;
  /** Rate in the baseline and current windows. */
  readonly start: number | null;
  readonly now: number | null;
  readonly change: number | null;
  /** Why there is no change figure, in plain words. */
  readonly why: string;
  /** Monthly rate across the range, for the small trend line. */
  readonly spark: readonly (number | null)[];
}

/** One summary per advertiser that had impressions in the range. Not sorted. */
export function clientSummaries(rows: readonly MonthRow[], range: readonly string[], base: readonly string[], curr: readonly string[], basis: CostBasis, rate: Rate): ClientSummary[] {
  const inRange = new Set(range);
  const baseSet = new Set(base);
  const currSet = new Set(curr);
  const byClient = new Map<string, MonthRow[]>();
  for (const r of rows) {
    if (!inRange.has(r.month)) continue;
    const list = byClient.get(r.advertiser);
    if (list) list.push(r);
    else byClient.set(r.advertiser, [r]);
  }
  const out: ClientSummary[] = [];
  for (const [advertiser, mine] of byClient) {
    const t = totals(mine, basis);
    if (t.impressions <= 0) continue;
    const start = rateOf(totals(mine.filter((r) => baseSet.has(r.month)), basis), rate);
    const now = rateOf(totals(mine.filter((r) => currSet.has(r.month)), basis), rate);
    const why = start == null && now != null ? 'New since the start' : start != null && now == null ? 'Not active lately' : start == null && now == null ? 'Not in either window' : '';
    out.push({ advertiser, totals: t, start, now, change: change(start, now), why, spark: byMonth(mine, range, basis).map((m) => rateOf(m, rate)) });
  }
  return out;
}
