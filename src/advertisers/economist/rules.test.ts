import { describe, expect, it } from 'vitest';
import { serialFromYmd } from '@/engine/dates/serial';
import { ValidationError } from '@/shared/errors';
import { ECONOMIST_DEFAULTS, parseEconomistConfig } from './config';
import { groupEconomistCampaigns, locateIo } from './names';
import { NO_TRACKER_COMMENT, calculateEconomist, type EconomistTarget } from './rules';
import { ECON_COL, ECON_GROUP_KEY_COLUMN, ECON_HEADERS, buildEconomistSheetSpec } from './sheet';
import { economistModule } from './index';

// Made-up campaigns shaped like the real Economist export and tracker (one tracker row per country); numbers by hand.
const day = (d: number) => serialFromYmd(2026, 10, d);
const io = (name: string, clicks: number, impressions: number, cost: number) => ({ name, clicks, impressions, cost, objective: 'Click', status: 'Active' });
const target = (t: Partial<EconomistTarget>): EconomistTarget => ({ start: day(1), end: day(30), target: null, budgetAud: null, budgetGbp: null, fx: null, ...t });
const fs = 0.045 / 1.1;

describe('The Economist settings', () => {
  it('platform fee (cost ÷ 1.1) × 4.5%, Nova 100% by default, urgent 5 days, CTR 1% to below 4%', () => {
    expect(ECONOMIST_DEFAULTS).toMatchObject({ novaCpm: 0.8, novaShare: 1, minMargin: 0.75, targetBuffer: 0.1, urgentDays: 5, ctrLow: 0.01, ctrHigh: 0.04 });
    expect(ECONOMIST_DEFAULTS.fsRate).toBeCloseTo(0.0409090909, 9);
    expect('clientCpcUsd' in ECONOMIST_DEFAULTS).toBe(false); // the CPC comes from each country's tracker row
  });
  it('rejects bad settings', () => {
    expect(() => parseEconomistConfig({ novaShare: -0.1 })).toThrow(ValidationError);
  });
});

describe('The Economist IO names', () => {
  const keys = ['acme x paper - atlantis', 'acme x paper - new zealand', 'acme x paper - new'];
  it('"… IO" is the 1st IO of its country, "… IO #2" the 2nd', () => {
    expect(locateIo('Acme x Paper - Atlantis IO', keys)).toEqual({ key: 'acme x paper - atlantis', order: 1, matched: true });
    expect(locateIo('Acme x Paper - Atlantis IO #2', keys)).toEqual({ key: 'acme x paper - atlantis', order: 2, matched: true });
    // As the CSV reader hands it over (the word "IO" already dropped):
    expect(locateIo('Acme x Paper - Atlantis #3', keys)).toEqual({ key: 'acme x paper - atlantis', order: 3, matched: true });
  });
  it('each country is its own campaign, even when one country name starts another', () => {
    expect(locateIo('Acme x Paper - New zealand IO #2', keys)).toEqual({ key: 'acme x paper - new zealand', order: 2, matched: true });
    expect(locateIo('Acme x Paper - New IO', keys)).toEqual({ key: 'acme x paper - new', order: 1, matched: true });
    expect(locateIo('Acme x Paper - Lemuria IO', keys)).toEqual({ key: 'acme x paper - lemuria', order: 1, matched: false });
  });
  it('groups each country\'s IOs in order', () => {
    const g = groupEconomistCampaigns([{ name: 'Acme x Paper - Atlantis IO #2' }, { name: 'Acme x Paper - New zealand IO' }, { name: 'Acme x Paper - Atlantis IO' }], keys);
    expect(g.map((x) => [x.key, x.members.map((m) => m.order)])).toEqual([
      ['acme x paper - atlantis', [1, 2]],
      ['acme x paper - new zealand', [1]],
    ]);
  });
});

describe('calculateEconomist', () => {
  const today = day(15);
  const r = calculateEconomist(
    {
      today,
      rows: [io('Acme x Paper - Atlantis IO', 10, 2000, 2), io('Acme x Paper - Atlantis IO #2', 5, 1000, 1), io('Mystery Offer IO', 5, 1000, 1)],
      targets: new Map([['acme x paper - atlantis', target({ target: 1000, budgetGbp: 200, budgetAud: 388, fx: 1.94 })]]),
    },
    ECONOMIST_DEFAULTS,
  );
  const [main, second] = r.groups[0]?.rows ?? [];

  it('each country has its own £ CPC and A$ budget; Nova on every impression by default', () => {
    expect(main).toMatchObject({ totalClicks: 1000, targetedClicks: 1100, cpcGbp: 0.2, budgetGbp: 200, fx: 1.94, budgetAud: 388, novaShare: 1, novaImpressions: 2000, nonNovaImpressions: 0 });
    // #2: 1,000 − 10 = 990 left for it; still needed 990 − 5 = 985; CTR 0.5% → 197,000 more impressions.
    expect(second).toMatchObject({ totalClicks: 990, targetedClicks: 1089, requiredClicks: 985, impressionsNeeded: 197000, impressionsTotal: 198000, cpcGbp: null, budgetAud: null });
    expect(main?.novaFee).toBeCloseTo(1.6, 12);
    expect(second?.novaFee).toBeCloseTo(158.4, 9);
    expect(main?.netProfitAud).toBeCloseTo(388 - 3 - 3 * fs - 160, 9);
    expect(main?.netProfitGbp).toBeCloseTo((388 - 3 - 3 * fs - 160) / 1.94, 9);
    // Revenue per click: A$388 ÷ 1,000 = A$0.388.
    expect(main?.ioMargin).toBeCloseTo((3.88 - 2 * (1 + fs) - 1.6) / 3.88, 12);
    expect(main?.overallMargin).toBeCloseTo((5.82 - 3 * (1 + fs) - 2.4) / 5.82, 12);
  });

  it('an IO with no tracker row: comment and warning', () => {
    expect(r.groups[1]?.rows[0]).toMatchObject({ comment: NO_TRACKER_COMMENT, budgetAud: null, netProfitAud: null });
    expect(r.warnings).toEqual(['No row in The Economist tab for "Mystery Offer IO". Its target and budget are left blank.']);
  });

  it('the module also accepts the shared input shape', () => {
    const m = economistModule.calculate({ today, rows: [io('A IO', 10, 1000, 1)], targets: new Map([['a', { start: day(1), end: day(30), clicks: 500 }]]) }, ECONOMIST_DEFAULTS);
    expect(m.rows[0]).toMatchObject({ totalClicks: 500, budgetGbp: null, budgetAud: null });
  });

  describe('Report tab', () => {
    const spec = buildEconomistSheetSpec(r, ECONOMIST_DEFAULTS);
    const at = (row: number, k: keyof typeof ECON_COL) => spec.rows[row]?.[ECON_COL[k]]?.value;

    it('has the country CPC next to the £ budget, and the same layout as Business Insider otherwise', () => {
      expect(spec.headers.slice(20, 32)).toEqual([
        'Inventory cost (AUD)', 'DV360/FS platform fee (AUD)', 'Nova fee (AUD)', 'Client CPC (GBP)', 'Budget (GBP)', 'GBP → AUD rate',
        'Budget (AUD)', 'Net profit (AUD)', 'Net profit (GBP)', 'Projected Media Cost (AUD)', 'Projected Net Profit (AUD)', 'Comment',
      ]);
      expect(spec.headers[ECON_COL.novaShare]).toBe('Nova %');
      expect(spec.headers[ECON_GROUP_KEY_COLUMN - 1]).toBe('Group Key');
      expect(spec.hiddenColumns).toEqual([35]);
      expect(spec.rows.every((row) => row.length === ECON_HEADERS.length)).toBe(true);
    });

    it('CPC = Budget (GBP) ÷ Total Clicks on the first row; revenue per click from the country\'s A$ budget', () => {
      expect(at(0, 'cpc')).toBe('=IF(OR(Y2="",D2="",D2=0),"",Y2/D2)');
      expect(at(1, 'cpc')).toBeNull();
      expect(at(0, 'novaShare')).toBe(1);
      expect(String(at(1, 'ioMargin'))).toContain('F3*$AA$2/$D$2');
      expect(at(1, 'nova')).toBe('=(IF(N3="",I3,N3)*N($L$2)/1000)*0.8');
      expect(at(0, 'margin')).toBe('=IF(AB2="","",AB2/AA2)');
      const notes = spec.headerNotes ?? {};
      expect(notes[ECON_COL.cpc]).toContain('Every country has its own');
      expect(notes[ECON_COL.novaShare]).toContain('Default 100%');
    });

    it('every formula has balanced brackets and quotes', () => {
      const formulas = spec.rows.flat().map((c) => c.value).filter((v): v is string => typeof v === 'string' && v.startsWith('='));
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
