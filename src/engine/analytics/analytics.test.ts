import { describe, expect, it } from 'vitest';
import { clientSummaries } from './clients';
import { ALL_ADVERTISERS, monthsWithData, periodsIn, sideTotals, whoChanged } from './compare';
import { demoRows } from './demoData';
import { aud, compact, percent, rateText } from './format';
import { defaultWindows, growth } from './growth';
import { addMonths, monthName, monthRange, monthShort, periodName, periodOf, periodSpan } from './periods';
import { byMonth, change, totals } from './totals';
import { lineFit, steadiness } from './trend';
import type { MonthRow } from './types';

const row = (advertiser: string, month: string, impressions: number, clicks: number, media: number): MonthRow => ({
  advertiser,
  month,
  impressions,
  clicks,
  media,
  dv: media * 0.1,
  fs: media * 0.045,
  total: media * 1.145,
});

describe('periods', () => {
  it('maps months to every grain', () => {
    expect(periodOf('2025-08', 'month')).toBe('2025-08');
    expect(periodOf('2025-08', 'quarter')).toBe('2025-Q3');
    expect(periodOf('2025-06', 'half')).toBe('2025-H1');
    expect(periodOf('2025-07', 'half')).toBe('2025-H2');
    expect(periodOf('2025-12', 'year')).toBe('2025');
  });
  it('walks months across years with no gaps', () => {
    expect(addMonths('2025-11', 3)).toBe('2026-02');
    expect(addMonths('2025-01', -1)).toBe('2024-12');
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthRange('2026-02', '2025-11')).toEqual([]);
  });
  it('names periods for people', () => {
    expect(monthName('2025-08')).toBe('Aug 2025');
    expect(monthShort('2025-08')).toBe('Aug ’25');
    expect(periodName('2025-Q3', 'quarter')).toBe('Q3 2025');
    expect(periodName('2026-H1', 'half')).toBe('H1 2026');
    expect(periodSpan('2025-Q3', 'quarter')).toBe('Jul–Sep');
    expect(periodSpan('2026-H2', 'half')).toBe('Jul–Dec');
  });
});

describe('totals', () => {
  const rows = [row('A', '2025-01', 1000, 10, 1), row('B', '2025-01', 3000, 30, 5)];
  it('works out rates from totals, not by averaging rates', () => {
    const t = totals(rows, 'media');
    expect(t.cost).toBe(6);
    expect(t.cpm).toBeCloseTo(1.5); // (6 / 4000) * 1000, not the average of 1 and 1.667
    expect(t.cpc).toBeCloseTo(0.15);
    expect(t.ctr).toBeCloseTo(0.01);
    expect(totals(rows, 'total').cost).toBeCloseTo(6 * 1.145);
  });
  it('gives null rates when there is nothing to divide by', () => {
    const t = totals([row('A', '2025-01', 0, 0, 0)], 'total');
    expect(t.cpm).toBeNull();
    expect(t.cpc).toBeNull();
    expect(t.ctr).toBeNull();
  });
  it('fills months with no data as zero totals', () => {
    const m = byMonth(rows, ['2024-12', '2025-01'], 'media');
    expect(m[0]?.impressions).toBe(0);
    expect(m[0]?.cpm).toBeNull();
    expect(m[1]?.impressions).toBe(4000);
  });
  it('change() refuses a zero or missing base', () => {
    expect(change(2, 3)).toBeCloseTo(50);
    expect(change(0, 3)).toBeNull();
    expect(change(null, 3)).toBeNull();
    expect(change(2, null)).toBeNull();
  });
});

describe('trend', () => {
  it('fits a straight line and reports start-to-end change', () => {
    const fit = lineFit([1, 2, 3, 4]);
    expect(fit?.slope).toBeCloseTo(1);
    expect(fit?.r2).toBeCloseTo(1);
    expect(fit?.pct).toBeCloseTo(300);
  });
  it('skips gaps and needs at least three points', () => {
    expect(lineFit([1, null, 2])).toBeNull();
    expect(lineFit([1, null, 2, 3])?.fitted).toHaveLength(4);
  });
  it('labels steadiness', () => {
    expect(steadiness(0.8)).toBe('Steady');
    expect(steadiness(0.3)).toBe('Fairly steady');
    expect(steadiness(0.1)).toBe('Bumpy, read with care');
  });
});

describe('growth', () => {
  // A's price doubles; B (cheap) only exists in the current window and drags the blended rate down.
  const rows = [
    row('A', '2025-01', 1000, 10, 1),
    row('A', '2025-02', 1000, 10, 1),
    row('A', '2025-03', 1000, 10, 2),
    row('A', '2025-04', 1000, 10, 2),
    row('B', '2025-03', 9000, 90, 0.9),
    row('B', '2025-04', 9000, 90, 0.9),
  ];
  const g = growth(rows, ['2025-01', '2025-02'], ['2025-03', '2025-04'], 'media', 'cpm');
  it('like-for-like only counts clients in both windows', () => {
    expect(g.shared).toBe(1);
    expect(g.likeForLike).toBeCloseTo(100);
  });
  it('blended is moved by the new cheap client', () => {
    // base: 2/2000*1000 = 1.00; current: (4 + 1.8) / 20000 * 1000 = 0.29
    expect(g.blended).toBeCloseTo(-71);
  });
  it('splits like-for-like into price and mix that add up', () => {
    expect((g.priceEffect ?? 0) + (g.mixEffect ?? 0)).toBeCloseTo(g.likeForLike ?? 0);
  });
  it('picks first and last six months by default', () => {
    const range = monthRange('2025-01', '2025-12');
    const w = defaultWindows(range);
    expect(w.base).toEqual(range.slice(0, 6));
    expect(w.curr).toEqual(range.slice(6));
    expect(defaultWindows(['2025-01'])).toEqual({ base: [], curr: [] });
  });
});

describe('compare', () => {
  const rows = [row('A', '2025-01', 1000, 10, 1), row('A', '2025-04', 1000, 10, 2), row('B', '2025-01', 1000, 10, 1), row('C', '2025-05', 500, 5, 1)];
  it('totals one side: an advertiser (or all) in one period', () => {
    expect(sideTotals(rows, { advertiser: ALL_ADVERTISERS, period: '2025-Q1' }, 'quarter', 'media').impressions).toBe(2000);
    expect(sideTotals(rows, { advertiser: 'A', period: '2025-Q2' }, 'quarter', 'media').cost).toBe(2);
    expect(sideTotals(rows, { advertiser: 'B', period: '2025-Q2' }, 'quarter', 'media').impressions).toBe(0);
  });
  it('lists periods and how complete they are', () => {
    expect(periodsIn(['2025-01', '2025-02', '2025-04'], 'quarter')).toEqual(['2025-Q1', '2025-Q2']);
    expect(monthsWithData(['2025-01', '2025-02', '2025-04'], '2025-Q1', 'quarter')).toBe(2);
  });
  it('finds who changed most and who ran on one side only', () => {
    const w = whoChanged(rows, '2025-Q1', '2025-Q2', 'quarter', 'media', 'cpm');
    expect(w.both.map((x) => x.advertiser)).toEqual(['A']);
    expect(w.both[0]?.change).toBeCloseTo(100);
    expect(w.onlyA).toEqual(['B']);
    expect(w.onlyB).toEqual(['C']);
  });
});

describe('clients', () => {
  it('summarises each client and explains a missing change', () => {
    const rows = [row('A', '2025-01', 1000, 10, 1), row('A', '2025-04', 1000, 10, 2), row('N', '2025-04', 1000, 10, 1)];
    const list = clientSummaries(rows, monthRange('2025-01', '2025-04'), ['2025-01', '2025-02'], ['2025-03', '2025-04'], 'media', 'cpm');
    const a = list.find((c) => c.advertiser === 'A');
    const n = list.find((c) => c.advertiser === 'N');
    expect(a?.change).toBeCloseTo(100);
    expect(a?.spark).toHaveLength(4);
    expect(n?.change).toBeNull();
    expect(n?.why).toBe('New since the start');
  });
});

describe('format', () => {
  it('formats money, rates and counts the Australian way', () => {
    expect(aud(1234.5, 2)).toBe('A$1,234.50');
    expect(rateText('cpm', 1.5)).toBe('A$1.50');
    expect(rateText('cpc', 0.0975)).toBe('A$0.098');
    expect(compact(192_100_000)).toBe('192.1M');
    expect(compact(835_800)).toBe('835.8K');
    expect(percent(0.0163)).toBe('1.63%');
  });
});

describe('demo data', () => {
  it('is made-up, stable and internally consistent', () => {
    const a = demoRows();
    expect(a).toEqual(demoRows());
    expect(a.length).toBeGreaterThan(150);
    for (const r of a) {
      expect(r.clicks).toBeLessThanOrEqual(r.impressions);
      expect(r.total).toBeCloseTo(r.media + r.dv + r.fs, 1);
    }
  });
});
