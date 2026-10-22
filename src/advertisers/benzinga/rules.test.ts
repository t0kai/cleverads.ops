import { describe, expect, it } from 'vitest';
import { serialFromYmd } from '@/engine/dates/serial';
import { ValidationError } from '@/shared/errors';
import { BENZINGA_DEFAULTS, parseBenzingaConfig } from './config';
import { groupBenzingaCampaigns, monthlyBase, parseBuyingType, resolveTrackerKey, splitBenzingaName } from './names';
import { NO_TRACKER_COMMENT, NO_VIEWS_COMMENT, calculateBenzinga, mergeTargets, type BenzingaTarget } from './rules';
import { BENZINGA_COL, BENZINGA_GROUP_KEY_COLUMN, BENZINGA_HEADERS, buildBenzingaSheetSpec } from './sheet';
import { benzingaModule } from './index';

// Made-up campaigns shaped like the real Benzinga export and tracker; numbers worked out by hand.
const day = (d: number) => serialFromYmd(2026, 10, d);
const io = (name: string, clicks: number, impressions: number, cost: number) => ({ name, clicks, impressions, cost, objective: 'Click', status: 'Active' });
const target = (t: Partial<BenzingaTarget>): BenzingaTarget => ({ start: day(1), end: day(30), target: null, budgetUsd: null, fx: null, buyingType: 'CPC', ...t });
const fs = 0.045 / 1.1;

describe('Benzinga settings', () => {
  it('bills US$0.35 per click, 4.5% ÷ 1.1 platform fee, healthy CTR 1.4–4.5%', () => {
    expect(BENZINGA_DEFAULTS).toMatchObject({ clientCpcUsd: 0.35, novaCpm: 0.8, minMargin: 0.75, targetBuffer: 0.1, urgentDays: 12, ctrLow: 0.014, ctrHigh: 0.045 });
    expect(BENZINGA_DEFAULTS.fsRate).toBeCloseTo(0.0409090909, 9);
  });
  it('rejects bad settings', () => {
    expect(() => parseBenzingaConfig({ clientCpcUsd: 0 })).toThrow(ValidationError);
    expect(() => parseBenzingaConfig({ ctrLow: 0.05, ctrHigh: 0.04 })).toThrow(ValidationError);
  });
});

describe('Benzinga names', () => {
  it('reads the Buying Type', () => {
    expect([' cpcv ', 'CPM', 'CPC', '', 'Flat fee', null].map(parseBuyingType)).toEqual(['CPCV', 'CPM', 'CPC', null, null, null]);
  });
  it('drops "IO" and reads "#N" as the IO order', () => {
    expect(splitBenzingaName('Harbour Loans IO')).toEqual({ base: 'harbour loans', order: 1 });
    expect(splitBenzingaName('Harbour Display Campaign Regular IO 1')).toEqual({ base: 'harbour display campaign regular 1', order: 1 });
    expect(splitBenzingaName('Harbour Display Campaign Regular IO 1 #10')).toEqual({ base: 'harbour display campaign regular 1', order: 10 });
  });
  it('matches the longest tracker name an IO starts with, on whole words only', () => {
    const keys = ['harbour', 'harbour display campaign'];
    expect(resolveTrackerKey('harbour display campaign regular 1', keys)).toEqual({ key: 'harbour display campaign', matched: true });
    expect(resolveTrackerKey('harbour', keys)).toEqual({ key: 'harbour', matched: true });
    expect(resolveTrackerKey('harbourside offer', keys)).toEqual({ key: 'harbourside offer', matched: false });
  });
  it('groups IO 1, #2 … #10 in order, whatever order the CSV has', () => {
    const g = groupBenzingaCampaigns(
      [{ name: 'Harbour Display Campaign Regular IO 1 #10' }, { name: 'Harbour Loans IO' }, { name: 'Harbour Display Campaign Regular IO 1' }, { name: 'Harbour Display Campaign Regular IO 1 #2' }],
      ['harbour display campaign', 'harbour loans'],
    );
    expect(g.map((x) => [x.key, x.members.map((m) => m.order)])).toEqual([
      ['harbour display campaign', [1, 2, 10]],
      ['harbour loans', [1]],
    ]);
  });
  it('treats rows split by month as one campaign, but leaves a lone "… October" alone', () => {
    const keys = ['harbour display campaign', 'harbour display campaign october', 'boat 2 july', 'boat 2 august', 'spring october'];
    expect(keys.map((k) => monthlyBase(k, keys))).toEqual([null, 'harbour display campaign', 'boat 2', 'boat 2', null]);
  });
});

describe('mergeTargets', () => {
  it('adds month rows together, each US$ at its own rate', () => {
    const m = mergeTargets(
      new Map([
        ['harbour display campaign', target({ buyingType: 'CPM', target: 1_000_000, budgetUsd: 3000, fx: 1.4 })],
        ['harbour display campaign october', target({ buyingType: 'CPM', target: 1_000_000, budgetUsd: 2000, fx: 1.5, end: serialFromYmd(2026, 11, 29) })],
        ['boat 2 july', target({ target: 1205, fx: 1.42 })],
        ['boat 2 august', target({ target: 3795, fx: 1.39 })],
      ]),
      BENZINGA_DEFAULTS,
    );
    expect(m.get('harbour display campaign')).toMatchObject({ type: 'CPM', target: 2_000_000, budgetUsd: 5000, budgetAud: 7200, fx: 1.44, parts: 2, start: day(1), end: serialFromYmd(2026, 11, 29) });
    // CPC: US$ = clicks × 0.35 per row.
    const boat = m.get('boat 2');
    expect(boat?.budgetUsd).toBeCloseTo(5000 * 0.35, 9);
    expect(boat?.budgetAud).toBeCloseTo(1205 * 0.35 * 1.42 + 3795 * 0.35 * 1.39, 9);
    expect(m.has('harbour display campaign october')).toBe(false);
  });
});

describe('calculateBenzinga', () => {
  const today = day(15);
  const r = calculateBenzinga(
    {
      today,
      rows: [
        io('Harbour Loans IO', 150, 10000, 12),
        io('Harbour Display Campaign Regular IO 1 #2', 600, 300000, 150),
        io('Harbour Display Campaign Regular IO 1', 400, 200000, 100),
        io('River ETF Views IO', 50, 20000, 40),
        io('Mystery Offer IO', 5, 1000, 1),
      ],
      targets: new Map([
        ['harbour loans', target({ target: 1000, budgetUsd: 350, fx: 1.5 })],
        ['harbour display campaign', target({ buyingType: 'CPM', target: 1_000_000, budgetUsd: 3000, fx: 1.4 })],
        ['harbour display campaign october', target({ buyingType: 'CPM', target: 1_000_000, budgetUsd: 2000, fx: 1.5, end: serialFromYmd(2026, 11, 29) })],
        ['river etf views', target({ buyingType: 'CPCV', target: 5000, budgetUsd: 750, fx: 1.45 })],
      ]),
    },
    BENZINGA_DEFAULTS,
  );
  const group = (key: string) => r.groups.find((g) => g.key === key);

  it('CPC: US$ budget × the tracker rate, still needed = Total − clicks', () => {
    const row = group('harbour loans')?.rows[0];
    expect(row).toMatchObject({ type: 'CPC', totalTarget: 1000, targeted: 1100, achieved: 150, required: 850, impressionsNeeded: 56667, impressionsTotal: 66667, budgetUsd: 350, fx: 1.5, budgetAud: 525 });
    expect(row?.ctr).toBeCloseTo(0.015, 12);
    expect(row?.fsFee).toBeCloseTo(12 * fs, 12);
    expect(row?.novaFee).toBeCloseTo(53.3336, 9);
    expect(row?.netProfitAud).toBeCloseTo(525 - 12 - 12 * fs - 53.3336, 9);
    expect(row?.netProfitUsd).toBeCloseTo((525 - 12 - 12 * fs - 53.3336) / 1.5, 9);
    expect(row?.projectedMediaCost).toBeCloseTo(80.0004, 9);
    expect(row?.projectedNetProfit).toBeCloseTo(525 - 80.0004 * (1 + fs) - 53.3336, 9);
    // Revenue so far: 150 clicks × US$0.35 × 1.5 = A$78.75.
    expect(row?.ioMargin).toBeCloseTo((78.75 - 12 * (1 + fs) - 8) / 78.75, 12);
    expect(row?.health).toBe('🔴 Critical | 57/day'); // 850 still needed over 15 days
  });

  it('CPM: month rows and IOs "1", "#2" make one campaign; impressions still needed on the last IO', () => {
    const g = group('harbour display campaign');
    const [main, second] = g?.rows ?? [];
    expect(g?.rows.map((x) => x.name)).toEqual(['Harbour Display Campaign Regular IO 1', 'Harbour Display Campaign Regular IO 1 #2']);
    expect(main).toMatchObject({ type: 'CPM', totalTarget: 2_000_000, targeted: 2_200_000, achieved: 200000, required: null, budgetUsd: 5000, fx: 1.44, isLatest: false });
    expect(main?.budgetAud).toBeCloseTo(7200, 9);
    // #2's own Total: 2,000,000 − 200,000 delivered by IO 1 = 1,800,000 (+10% = 1,980,000).
    expect(second).toMatchObject({ totalTarget: 1_800_000, targeted: 1_980_000, achieved: 300000, required: 1_500_000, impressionsNeeded: 1_500_000, impressionsTotal: 1_800_000, budgetUsd: null, isLatest: true });
    expect(main?.novaFee).toBeCloseTo(160, 9); // spent
    expect(second?.novaFee).toBeCloseTo(1440, 9); // what it will have spent
    expect(main?.netProfitAud).toBeCloseTo(7200 - 250 - 250 * fs - 1600, 9);
    expect(main?.projectedNetProfit).toBeCloseTo(7200 - (100 + 900) * (1 + fs) - 1600, 9);
    // Revenue at A$7,200 ÷ 2,000,000 impressions = A$0.0036 each.
    expect(main?.ioMargin).toBeCloseTo((720 - 100 * (1 + fs) - 160) / 720, 12);
    expect(second?.ioMargin).toBeCloseTo((1080 - 150 * (1 + fs) - 240) / 1080, 12);
    expect(main?.overallMargin).toBeCloseTo((1800 - 250 * (1 + fs) - 400) / 1800, 12);
    expect(main?.end).toBe(serialFromYmd(2026, 11, 29));
    expect(second?.health).toBe(main?.health);
  });

  it('CPCV: costs and profit, but no pacing (views are not in the CSV)', () => {
    const row = group('river etf views')?.rows[0];
    expect(row).toMatchObject({ type: 'CPCV', achieved: null, required: null, health: '', comment: NO_VIEWS_COMMENT, ioMargin: null, budgetUsd: 750 });
    expect(row?.budgetAud).toBeCloseTo(1087.5, 9);
    expect(row?.novaFee).toBeCloseTo(16, 12); // spent impressions
    expect(row?.netProfitAud).toBeCloseTo(1087.5 - 40 - 40 * fs - 16, 9);
    expect(r.warnings.some((w) => w.includes('CPCV'))).toBe(true);
  });

  it('an IO with no tracker row: comment and warning, money left blank', () => {
    const row = group('mystery offer')?.rows[0];
    expect(row).toMatchObject({ comment: NO_TRACKER_COMMENT, totalTarget: null, budgetUsd: null, budgetAud: null, netProfitAud: null, health: '' });
    expect(r.warnings).toContain('No row in the Benzinga (US) tab for "Mystery Offer IO". Its target and budget are left blank.');
  });

  it('counts campaigns by type', () => {
    expect(r.counts).toEqual({ CPC: 2, CPM: 1, CPCV: 1 });
  });

  it('warns about a missing rate or Buying Type', () => {
    const w = calculateBenzinga(
      {
        today,
        rows: [io('Plain Promo IO', 1, 100, 1), io('Untyped Promo IO', 1, 100, 1)],
        targets: new Map([
          ['plain promo', target({ target: 1000 })],
          ['untyped promo', target({ target: 1000, fx: 1.4, buyingType: null })],
        ]),
      },
      BENZINGA_DEFAULTS,
    );
    expect(w.rows[0]?.budgetAud).toBeNull();
    expect(w.warnings).toEqual(['No USD → AUD rate in the tracker for "Plain Promo IO". Margin is not calculated.', 'No Buying Type in the tracker for "Untyped Promo IO"; treated as CPC.']);
  });

  it('the module also accepts the shared input shape', () => {
    const m = benzingaModule.calculate({ today, rows: [io('A IO', 10, 1000, 1)], targets: new Map([['a', { start: day(1), end: day(30), clicks: 500 }]]) }, BENZINGA_DEFAULTS);
    expect(m.rows[0]).toMatchObject({ type: 'CPC', totalTarget: 500, budgetUsd: 175 });
  });

  describe('Report tab', () => {
    const spec = buildBenzingaSheetSpec(r, BENZINGA_DEFAULTS);
    const at = (row: number, k: keyof typeof BENZINGA_COL) => spec.rows[row]?.[BENZINGA_COL[k]]?.value;
    // Rows: 2 Harbour Loans · 3 Display IO 1 · 4 Display #2 · 5 River ETF Views · 6 Mystery Offer

    it('Health and days after the impressions, the four margins side by side, then costs, US$/A$ and Comment last', () => {
      expect(spec.headers).toBe(BENZINGA_HEADERS);
      expect(spec.headers.slice(12, 30)).toEqual([
        'Required Total Impression', 'Campaign Health', 'Remaining Days', 'Margin %', 'Projected Margin %', 'IO Margin %', 'Overall Margin %',
        'Inventory cost (AUD)', 'DV360/FS platform fee (AUD)', 'Nova fee (AUD)', 'Budget (USD)', 'USD → AUD rate', 'Budget (AUD)',
        'Net profit (AUD)', 'Net profit (USD)', 'Projected Media Cost (AUD)', 'Projected Net Profit (AUD)', 'Comment',
      ]);
      expect(spec.headers[7]).toBe('Required (without extra)');
      expect(spec.headers[BENZINGA_GROUP_KEY_COLUMN - 1]).toBe('Group Key');
      expect(spec.hiddenColumns).toEqual([33]);
      expect(spec.rows.every((row) => row.length === BENZINGA_HEADERS.length)).toBe(true);
    });

    it('notes: Required, the fee, the rate, and what each margin shows', () => {
      const notes = spec.headerNotes ?? {};
      expect(Object.keys(notes).map(Number).sort((a, b) => a - b)).toEqual([7, 15, 16, 17, 18, 20, 23]);
      expect(notes[BENZINGA_COL.ioMargin]).toContain('clicks × US$0.35 × USD → AUD rate');
      expect(notes[BENZINGA_COL.projMargin]).toContain('projected media × 1.0409');
      for (const k of ['margin', 'projMargin', 'ioMargin', 'overallMargin'] as const) expect(notes[BENZINGA_COL[k]]).toMatch(/^Shows: .*\nFormula: .*\nWhen to use: /s);
    });

    it('CPC budget is a formula; CPM budget the tracker number; A$ = US$ × rate', () => {
      expect(at(0, 'budgetUsd')).toBe('=IF(E2="","",E2*0.35)');
      expect(at(0, 'fx')).toBe(1.5);
      expect(at(0, 'budgetAud')).toBe('=IF(OR(W2="",X2=""),"",W2*X2)');
      expect(at(1, 'budgetUsd')).toBe(5000);
      expect(at(1, 'fx')).toBeCloseTo(1.44, 12);
      expect(at(2, 'budgetUsd')).toBeNull();
      expect(at(0, 'netUsd')).toBe('=IF(OR(Z2="",X2="",X2=0),"",Z2/X2)');
      expect(at(0, 'margin')).toBe('=IF(Z2="","",Z2/Y2)');
      expect(at(0, 'projMargin')).toBe('=IF(AC2="","",AC2/Y2)');
    });

    it("still needed: Total − every IO, on the last IO only; #2's own Total; Nova on the latest IO falls back to spend", () => {
      expect(at(1, 'required')).toBeNull();
      expect(at(2, 'required')).toBe('=IFERROR(IF(OR($B4="CPCV",$E$3=""),"",MAX($E$3-SUMIF($AG$2:$AG,$AG4,$G$2:$G),0)),"")');
      expect(at(2, 'total')).toBe('=IF($E$3="","",MAX($E$3-SUM($G$3:G3),0))');
      expect(at(2, 'targeted')).toBe('=IF(E4="","",ROUND(E4+(E4*10%),0))');
      expect(at(2, 'nova')).toBe('=(IF(M4="",J4,M4)/1000)*0.8');
      expect(at(1, 'nova')).toBe('=(J3/1000)*0.8');
      expect(at(1, 'achieved')).toBe('=IF($B3="CPM",J3,IF($B3="CPC",I3,""))');
    });

    it('revenue: CPC in US$ × rate, CPM at the A$ rate per impression', () => {
      expect(String(at(0, 'ioMargin'))).toContain('I2*0.35*$X$2');
      expect(String(at(2, 'ioMargin'))).toContain('J4*$Y$3/$E$3');
      expect(at(3, 'health')).toBeNull(); // CPCV: no health
      expect(at(3, 'comment')).toBe(NO_VIEWS_COMMENT);
    });

    it('every formula has balanced brackets and quotes', () => {
      const formulas = spec.rows.flat().map((c) => c.value).filter((v): v is string => typeof v === 'string' && v.startsWith('='));
      expect(formulas.length).toBeGreaterThan(60);
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
