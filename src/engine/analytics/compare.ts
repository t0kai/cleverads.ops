import { periodOf } from './periods';
import { change, rateOf, totals } from './totals';
import type { CostBasis, Grain, MonthRow, Rate, Totals } from './types';

export const ALL_ADVERTISERS = 'all';

/** One side of a comparison: an advertiser (or all) in one period. */
export interface Side {
  readonly advertiser: string;
  readonly period: string;
}

export function sideRows(rows: readonly MonthRow[], side: Side, grain: Grain): MonthRow[] {
  return rows.filter((r) => (side.advertiser === ALL_ADVERTISERS || r.advertiser === side.advertiser) && periodOf(r.month, grain) === side.period);
}

export function sideTotals(rows: readonly MonthRow[], side: Side, grain: Grain, basis: CostBasis): Totals {
  return totals(sideRows(rows, side, grain), basis);
}

/** Periods (at this grain) that the given months fall into, oldest first, no repeats. */
export function periodsIn(months: readonly string[], grain: Grain): string[] {
  return [...new Set(months.map((m) => periodOf(m, grain)))].sort();
}

/** How many of a period's months have any data at all. */
export function monthsWithData(allMonths: readonly string[], period: string, grain: Grain): number {
  return allMonths.filter((m) => periodOf(m, grain) === period).length;
}

/** Advertisers with impressions in a period. */
export function advertisersIn(rows: readonly MonthRow[], period: string, grain: Grain): Set<string> {
  return new Set(rows.filter((r) => r.impressions > 0 && periodOf(r.month, grain) === period).map((r) => r.advertiser));
}

export interface ClientMove {
  readonly advertiser: string;
  readonly from: number | null;
  readonly to: number | null;
  readonly change: number | null;
}

/** Each advertiser's rate change between two periods, biggest moves first, plus who ran only on one side. */
export function whoChanged(rows: readonly MonthRow[], a: string, b: string, grain: Grain, basis: CostBasis, rate: Rate): { both: ClientMove[]; onlyA: string[]; onlyB: string[] } {
  const inA = advertisersIn(rows, a, grain);
  const inB = advertisersIn(rows, b, grain);
  const both = [...inA]
    .filter((x) => inB.has(x))
    .map((advertiser) => {
      const from = rateOf(sideTotals(rows, { advertiser, period: a }, grain, basis), rate);
      const to = rateOf(sideTotals(rows, { advertiser, period: b }, grain, basis), rate);
      return { advertiser, from, to, change: change(from, to) };
    })
    .sort((p, q) => Math.abs(q.change ?? 0) - Math.abs(p.change ?? 0) || p.advertiser.localeCompare(q.advertiser));
  const sortName = (x: string, y: string) => x.localeCompare(y);
  return {
    both,
    onlyA: [...inA].filter((x) => !inB.has(x)).sort(sortName),
    onlyB: [...inB].filter((x) => !inA.has(x)).sort(sortName),
  };
}
