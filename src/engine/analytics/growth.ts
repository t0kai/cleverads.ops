import { monthRange } from './periods';
import { lineFit } from './trend';
import { byMonth, change, rateOf, totals } from './totals';
import type { CostBasis, MonthRow, Rate } from './types';

export interface Growth {
  /** Only advertisers active in both windows: the real price change. */
  readonly likeForLike: number | null;
  /** Everyone pooled: moves with client mix too. */
  readonly blended: number | null;
  /** Straight line through every month from the start of the baseline to the end of the current window. */
  readonly trend: number | null;
  readonly shared: number;
  /** Like-for-like split: price at fixed baseline weights… */
  readonly priceEffect: number | null;
  /** …and the rest, which is the shift in who spends. */
  readonly mixEffect: number | null;
}

/** Default windows: first and last six months of the range (or half each when shorter). */
export function defaultWindows(range: readonly string[]): { base: string[]; curr: string[] } {
  const half = Math.min(6, Math.floor(range.length / 2));
  if (half === 0) return { base: [], curr: [] };
  return { base: range.slice(0, half), curr: range.slice(-half) };
}

export function growth(rows: readonly MonthRow[], base: readonly string[], curr: readonly string[], basis: CostBasis, rate: Rate): Growth {
  const baseSet = new Set(base);
  const currSet = new Set(curr);
  const inA = rows.filter((r) => baseSet.has(r.month));
  const inB = rows.filter((r) => currSet.has(r.month));
  const advA = new Set(inA.map((r) => r.advertiser));
  const shared = new Set([...new Set(inB.map((r) => r.advertiser))].filter((a) => advA.has(a)));

  const lA = rateOf(totals(inA.filter((r) => shared.has(r.advertiser)), basis), rate);
  const lB = rateOf(totals(inB.filter((r) => shared.has(r.advertiser)), basis), rate);

  // Price vs mix: each shared client's current rate, weighted by its baseline volume.
  const vol = (t: ReturnType<typeof totals>) => (rate === 'cpm' ? t.impressions : t.clicks);
  let weight = 0;
  let weighted = 0;
  for (const adv of shared) {
    const ta = totals(inA.filter((r) => r.advertiser === adv), basis);
    const tb = totals(inB.filter((r) => r.advertiser === adv), basis);
    const rb = rateOf(tb, rate);
    if (rateOf(ta, rate) == null || rb == null) continue;
    weight += vol(ta);
    weighted += vol(ta) * rb;
  }
  const fixedMix = weight > 0 ? weighted / weight : null;

  const first = base[0];
  const last = curr[curr.length - 1];
  const span = first && last ? monthRange(first, last) : [];
  const fit = lineFit(byMonth(rows, span, basis).map((m) => rateOf(m, rate)));

  return {
    likeForLike: change(lA, lB),
    blended: change(rateOf(totals(inA, basis), rate), rateOf(totals(inB, basis), rate)),
    trend: fit?.pct ?? null,
    shared: shared.size,
    priceEffect: fixedMix != null && lA ? ((fixedMix - lA) / lA) * 100 : null,
    mixEffect: fixedMix != null && lA && lB != null ? ((lB - fixedMix) / lA) * 100 : null,
  };
}
