import { describe, expect, it } from 'vitest';
import { serialFromYmd } from '@/engine/dates/serial';
import { ValidationError } from '@/shared/errors';
import { BUSINESS_INSIDER_DEFAULTS, parseBusinessInsiderConfig } from './config';
import { groupBusinessInsiderCampaigns, locateIo } from './names';
import { NO_TRACKER_COMMENT, calculateBusinessInsider, type BusinessInsiderTarget } from './rules';
import { BI_COL, BI_GROUP_KEY_COLUMN, BI_HEADERS, buildBusinessInsiderSheetSpec } from './sheet';
import { businessInsiderModule } from './index';

// Made-up campaigns shaped like the real Business Insider export and tracker; numbers worked out by hand.
const day = (d: number) => serialFromYmd(2026, 10, d);
const io = (name: string, clicks: number, impressions: number, cost: number) => ({ name, clicks, impressions, cost, objective: 'Click', status: 'Active' });
const target = (t: Partial<BusinessInsiderTarget>): BusinessInsiderTarget => ({ start: day(1), end: day(30), target: null, budgetAud: null, budgetUsd: null, fx: null, ...t });
const fs = 0.045 / 1.1;

describe('Business Insider settings', () => {
  it('US$0.08 CPC, platform fee (cost ÷ 1.1) × 4.5%, Nova 0% by default, urgent 5 days, CTR 1% to below 4%', () => {
    expect(BUSINESS_INSIDER_DEFAULTS).toMatchObject({ clientCpcUsd: 0.08, novaCpm: 0.8, novaShare: 0, minMargin: 0.75, targetBuffer: 0.1, urgentDays: 5, ctrLow: 0.01, ctrHigh: 0.04 });
    expect(BUSINESS_INSIDER_DEFAULTS.fsRate).toBeCloseTo(0.0409090909, 9);
  });
  it('rejects bad settings', () => {
    expect(() => parseBusinessInsiderConfig({ novaShare: 1.5 })).toThrow(ValidationError);
    expect(() => parseBusinessInsiderConfig({ ctrLow: 0.05, ctrHigh: 0.04 })).toThrow(ValidationError);
  });
});

describe('Business Insider IO names', () => {
  const keys = ['harbour tea ascending', 'harbour tea established'];
  it('the number in front of "IO" is the IO order', () => {
    expect(locateIo('Harbour Tea Ascending IO 1', keys)).toEqual({ key: 'harbour tea ascending', order: 1, matched: true });
    expect(locateIo('Harbour Tea Ascending 2 IO 1', keys)).toEqual({ key: 'harbour tea ascending', order: 2, matched: true });
    expect(locateIo('Harbour Tea Established IO', keys)).toEqual({ key: 'harbour tea established', order: 1, matched: true });
    expect(locateIo('Harbour Tea Established 3 IO', keys)).toEqual({ key: 'harbour tea established', order: 3, matched: true });
    // As the CSV reader hands them over (the word "IO" already dropped):
    expect(locateIo('Harbour Tea Ascending 5 1', keys)).toEqual({ key: 'harbour tea ascending', order: 5, matched: true });
    expect(locateIo('Unknown Promo IO', keys)).toEqual({ key: 'unknown promo', order: 1, matched: false });
  });
  it('an exact tracker name wins, so a campaign whose name ends in a number is not split', () => {
    expect(locateIo('Spring Sale 2026 IO', ['spring sale 2026'])).toEqual({ key: 'spring sale 2026', order: 1, matched: true });
  });
  it('groups the IOs of a campaign in order, whatever order the CSV has', () => {
    const g = groupBusinessInsiderCampaigns([{ name: 'Harbour Tea Ascending 3 IO 1' }, { name: 'Harbour Tea Established IO' }, { name: 'Harbour Tea Ascending IO 1' }, { name: 'Harbour Tea Ascending 2 IO 1' }], keys);
    expect(g.map((x) => [x.key, x.members.map((m) => m.order)])).toEqual([
      ['harbour tea ascending', [1, 2, 3]],
      ['harbour tea established', [1]],
    ]);
  });
});

describe('calculateBusinessInsider', () => {
  const today = day(15);
  const targets = new Map([['harbour tea ascending', target({ target: 1000, budgetUsd: 80, budgetAud: 118.8, fx: 1.485 })]]);
  const rows = [io('Harbour Tea Ascending 2 IO 1', 50, 5000, 8), io('Harbour Tea Ascending IO 1', 100, 10000, 20), io('Mystery Offer IO', 5, 1000, 1)];
  const r = calculateBusinessInsider({ today, rows, targets }, BUSINESS_INSIDER_DEFAULTS);
  const group = (key: string) => r.groups.find((g) => g.key === key);

  it('one A$ budget from the tracker, each IO its own Total, still needed on the last IO, no Nova fee by default', () => {
    const [main, second] = group('harbour tea ascending')?.rows ?? [];
    expect(main).toMatchObject({ totalClicks: 1000, targetedClicks: 1100, achievedClicks: 100, requiredClicks: null, budgetUsd: 80, fx: 1.485, budgetAud: 118.8, novaShare: 0, novaImpressions: 0, nonNovaImpressions: 10000 });
    // 2nd: 1,000 − 100 = 900 left for it (+10% = 990); still needed 900 − 50 = 850; CTR 1% → 85,000 more impressions.
    expect(second).toMatchObject({ totalClicks: 900, targetedClicks: 990, requiredClicks: 850, impressionsNeeded: 85000, impressionsTotal: 90000, budgetAud: null, novaShare: null, isLatest: true });
    expect(main?.novaFee).toBe(0);
    expect(second?.novaFee).toBe(0);
    expect(main?.netProfitAud).toBeCloseTo(118.8 - 28 - 28 * fs, 9);
    expect(main?.netProfitUsd).toBeCloseTo((118.8 - 28 - 28 * fs) / 1.485, 9);
    expect(second?.projectedMediaCost).toBeCloseTo(144, 9); // 8 ÷ 5,000 × 90,000
    expect(main?.projectedNetProfit).toBeCloseTo(118.8 - (20 + 144) * (1 + fs), 9);
    // Revenue per click: A$118.80 ÷ 1,000 = A$0.1188.
    expect(main?.ioMargin).toBeCloseTo((11.88 - 20 * (1 + fs)) / 11.88, 12);
    expect(main?.overallMargin).toBeCloseTo((17.82 - 28 * (1 + fs)) / 17.82, 12);
    expect(main?.health).toBe('🔴 Critical | 57/day'); // 850 still needed over 15 days
  });

  it('a Nova % puts the Nova fee on that share only, also on the impressions still to come', () => {
    const half = calculateBusinessInsider({ today, rows, targets }, parseBusinessInsiderConfig({ novaShare: 0.5 }));
    const [main, second] = half.groups[0]?.rows ?? [];
    expect(main).toMatchObject({ novaShare: 0.5, novaImpressions: 5000, nonNovaImpressions: 5000 });
    expect(main?.novaFee).toBeCloseTo(4, 12); // 5,000 Nova impressions spent
    expect(second?.novaFee).toBeCloseTo(36, 12); // half of 90,000
    expect(main?.ioMargin).toBeCloseTo((11.88 - 20 * (1 + fs) - 4) / 11.88, 12);
  });

  it('an IO with no tracker row: comment and warning, money left blank', () => {
    const row = group('mystery offer')?.rows[0];
    expect(row).toMatchObject({ comment: NO_TRACKER_COMMENT, totalClicks: null, budgetAud: null, netProfitAud: null, health: '' });
    expect(r.warnings).toEqual(['No row in the Business Insider tab for "Mystery Offer IO". Its target and budget are left blank.']);
  });

  it('no Budget (AUD) in the tracker: US$ budget × rate, with a warning', () => {
    const w = calculateBusinessInsider({ today, rows: [io('Plain Promo IO', 1, 100, 1)], targets: new Map([['plain promo', target({ target: 1000, budgetUsd: 80, fx: 1.5 })]]) }, BUSINESS_INSIDER_DEFAULTS);
    expect(w.rows[0]?.budgetAud).toBeCloseTo(120, 9);
    expect(w.warnings).toEqual(['No Budget (AUD) in the tracker for "Plain Promo IO"; used US$ budget × rate.']);
  });

  it('the module also accepts the shared input shape', () => {
    const m = businessInsiderModule.calculate({ today, rows: [io('A IO', 10, 1000, 1)], targets: new Map([['a', { start: day(1), end: day(30), clicks: 500 }]]) }, BUSINESS_INSIDER_DEFAULTS);
    expect(m.rows[0]).toMatchObject({ totalClicks: 500, budgetUsd: 40, budgetAud: null });
  });

  describe('Report tab', () => {
    const spec = buildBusinessInsiderSheetSpec(r, BUSINESS_INSIDER_DEFAULTS);
    const at = (row: number, k: keyof typeof BI_COL) => spec.rows[row]?.[BI_COL[k]]?.value;
    // Rows: 2 Ascending IO 1 · 3 Ascending 2 IO 1 · 4 Mystery Offer

    it('impressions split into total, Nova and non-Nova with an editable Nova %; Health and days; four margins side by side; Comment last', () => {
      expect(spec.headers.slice(7, 20)).toEqual([
        'Actual Average CTR', 'Total Impressions', 'Nova Impressions', 'Non-Nova Impressions', 'Nova %', 'Impression needed for required clicks',
        'Required Total Impression', 'Campaign Health', 'Remaining Days', 'Margin %', 'Projected Margin %', 'IO Margin %', 'Overall Margin %',
      ]);
      expect(spec.headers.slice(20, 31)).toEqual([
        'Inventory cost (AUD)', 'DV360/FS platform fee (AUD)', 'Nova fee (AUD)', 'Budget (USD)', 'USD → AUD rate', 'Budget (AUD)',
        'Net profit (AUD)', 'Net profit (USD)', 'Projected Media Cost (AUD)', 'Projected Net Profit (AUD)', 'Comment',
      ]);
      expect(spec.headers[BI_GROUP_KEY_COLUMN - 1]).toBe('Group Key');
      expect(spec.hiddenColumns).toEqual([34]);
      expect(spec.rows.every((row) => row.length === BI_HEADERS.length)).toBe(true);
    });

    it('notes: Required, Nova %, the fee, the A$ budget, and what each margin shows', () => {
      const notes = spec.headerNotes ?? {};
      expect(Object.keys(notes).map(Number).sort((a, b) => a - b)).toEqual([6, 11, 16, 17, 18, 19, 21, 25]);
      expect(notes[BI_COL.novaShare]).toContain('Change it on the campaign');
      expect(notes[BI_COL.ioMargin]).toContain('Nova impressions ÷ 1000 × A$0.80');
      for (const k of ['margin', 'projMargin', 'ioMargin', 'overallMargin'] as const) expect(notes[BI_COL[k]]).toMatch(/^Shows: .*\nFormula: .*\nWhen to use: /s);
    });

    it('Nova impressions and fee follow the Nova % on the first row', () => {
      expect(at(0, 'novaShare')).toBe(0);
      expect(at(1, 'novaShare')).toBeNull();
      expect(at(1, 'novaImpr')).toBe('=I3*N($L$2)');
      expect(at(1, 'nonNovaImpr')).toBe('=I3-J3');
      expect(at(0, 'nova')).toBe('=(I2*N($L$2)/1000)*0.8');
      expect(at(1, 'nova')).toBe('=(IF(N3="",I3,N3)*N($L$2)/1000)*0.8');
      expect(at(1, 'ioMargin')).toBe(`=IFERROR((F3*$Z$2/$D$2-U3*(1+${BUSINESS_INSIDER_DEFAULTS.fsRate})-(J3/1000)*0.8)/(F3*$Z$2/$D$2),"")`);
    });

    it("the 2nd IO's own Total; budgets on the first IO; margins from Net profit ÷ Budget (AUD)", () => {
      expect(at(1, 'total')).toBe('=IF($D$2="","",MAX($D$2-SUM($F$2:F2),0))');
      expect(at(1, 'targeted')).toBe('=IF(D3="","",ROUND(D3+(D3*10%),0))');
      expect(at(1, 'required')).toBe('=IFERROR(IF($D$2="","",MAX($D$2-SUMIF($AH$2:$AH,$AH3,$F$2:$F),0)),"")');
      expect([at(0, 'budgetUsd'), at(0, 'fx'), at(0, 'budgetAud'), at(1, 'budgetAud')]).toEqual([80, 1.485, 118.8, null]);
      expect(at(0, 'margin')).toBe('=IF(AA2="","",AA2/Z2)');
      expect(at(0, 'netUsd')).toBe('=IF(OR(AA2="",Y2="",Y2=0),"",AA2/Y2)');
    });

    it('every formula has balanced brackets and quotes', () => {
      const formulas = spec.rows.flat().map((c) => c.value).filter((v): v is string => typeof v === 'string' && v.startsWith('='));
      expect(formulas.length).toBeGreaterThan(40);
      for (const f of formulas) {
        expect((f.match(/"/g) ?? []).length % 2, f).toBe(0);
        let depth = 0;
        for (const ch of f.replace(/"[^"]*"/g, '')) {
          if (ch === '(') depth++;
          if (ch === ')') depth--;
          expect(depth, f).toBeGreaterThanOrEqual(0);
        }
        expect(depth, f).toBe(0);
      }
    });
  });
});
