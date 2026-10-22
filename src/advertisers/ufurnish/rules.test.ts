import { describe, expect, it } from 'vitest';
import { serialFromYmd } from '@/engine/dates/serial';
import { ValidationError } from '@/shared/errors';
import { UFURNISH_DEFAULTS, parseUfurnishConfig } from './config';
import { groupUfurnishCampaigns, locateIo, parseBuyingType } from './names';
import { NO_TRACKER_COMMENT, NO_VIEWS_COMMENT, calculateUfurnish, type UfurnishTarget } from './rules';
import { UFURNISH_COL, UFURNISH_GROUP_KEY_COLUMN, UFURNISH_HEADERS, buildUfurnishSheetSpec } from './sheet';
import { ufurnishModule } from './index';

// Made-up campaigns shaped like the real Ufurnish export and tracker; numbers worked out by hand.
const day = (d: number) => serialFromYmd(2026, 10, d);
const io = (name: string, clicks: number, impressions: number, cost: number) => ({ name, clicks, impressions, cost, objective: 'Click', status: 'Active' });
const target = (t: Partial<UfurnishTarget>): UfurnishTarget => ({ start: day(1), end: day(30), target: null, budgetGbp: null, budgetAud: null, buyingType: 'CPC', ...t });

describe('Ufurnish settings', () => {
  it('£0.23 CPC, £0.04 CPCV, FS 15%, Nova A$0.80, 10% buffer, urgent 6 days, healthy CTR 1–4%', () => {
    expect(UFURNISH_DEFAULTS).toMatchObject({
      clientCpcGbp: 0.23, clientCpcvGbp: 0.04, fallbackCpcAud: 0.44, fallbackCpcvAud: 0.08,
      fsRate: 0.15, novaCpm: 0.8, minMargin: 0.75, targetBuffer: 0.1, urgentDays: 6, ctrLow: 0.01, ctrHigh: 0.04,
    });
  });
  it('rejects bad settings', () => {
    expect(() => parseUfurnishConfig({ clientCpcGbp: 0 })).toThrow(ValidationError);
    expect(() => parseUfurnishConfig({ ctrLow: 0.05, ctrHigh: 0.04 })).toThrow(ValidationError);
  });
});

describe('Ufurnish IO names', () => {
  it('reads the Buying Type', () => {
    expect([' cpcv ', 'CPC', '', 'CPM', null].map(parseBuyingType)).toEqual(['CPCV', 'CPC', null, null, null]);
  });
  it('"… IO" is the 1st IO, "… IO 2" the 2nd; a name ending in a year is not split', () => {
    const keys = ['harbour sofa q4 2026', 'spring'];
    expect(locateIo('Harbour Sofa Q4 2026 IO', keys)).toEqual({ key: 'harbour sofa q4 2026', order: 1, matched: true });
    expect(locateIo('Harbour Sofa Q4 2026 IO 2', keys)).toEqual({ key: 'harbour sofa q4 2026', order: 2, matched: true });
    // The CSV reader has already dropped "IO": "… 2026 3" is the 3rd IO.
    expect(locateIo('Harbour Sofa Q4 2026 3', keys)).toEqual({ key: 'harbour sofa q4 2026', order: 3, matched: true });
    expect(locateIo('Spring 12', keys)).toEqual({ key: 'spring', order: 12, matched: true });
    expect(locateIo('Tower 7', keys)).toEqual({ key: 'tower 7', order: 1, matched: false });
  });
  it('groups IO, IO 2, IO 3 in order, whatever order the CSV has', () => {
    const g = groupUfurnishCampaigns([{ name: 'Harbour Sofa Q4 2026 3' }, { name: 'Harbour Sofa Q4 2026' }, { name: 'Bay Rugs' }, { name: 'Harbour Sofa Q4 2026 2' }], ['harbour sofa q4 2026', 'bay rugs']);
    expect(g.map((x) => [x.key, x.members.map((m) => m.order)])).toEqual([
      ['harbour sofa q4 2026', [1, 2, 3]],
      ['bay rugs', [1]],
    ]);
  });
});

describe('calculateUfurnish', () => {
  const today = day(15);
  const r = calculateUfurnish(
    {
      today,
      rows: [
        io('Harbour Sofa Q4 2026 IO 2', 50, 5000, 6),
        io('Harbour Sofa Q4 2026 IO', 200, 20000, 20),
        io('Home Tour video IO', 10, 8000, 12),
        io('Mystery Offer IO', 5, 1000, 1),
      ],
      targets: new Map([
        ['harbour sofa q4 2026', target({ target: 1000, budgetGbp: 230, budgetAud: 436.48 })],
        ['home tour video', target({ buyingType: 'CPCV', target: 12500, budgetGbp: 500, budgetAud: 948.8 })],
      ]),
    },
    UFURNISH_DEFAULTS,
  );
  const group = (key: string) => r.groups.find((g) => g.key === key);

  it('CPC: one budget (from the tracker, A$), each IO its own Total, still needed on the last IO', () => {
    const [main, second] = group('harbour sofa q4 2026')?.rows ?? [];
    expect(main).toMatchObject({ type: 'CPC', totalTarget: 1000, targeted: 1100, achieved: 200, required: null, budgetGbp: 230, budgetAud: 436.48, isLatest: false });
    // 2nd: 1,000 − 200 = 800 left for it (+10% = 880); still needed 800 − 50 = 750.
    expect(second).toMatchObject({ totalTarget: 800, targeted: 880, achieved: 50, required: 750, impressionsNeeded: 75000, impressionsTotal: 80000, budgetGbp: null, budgetAud: null, isLatest: true });
    expect(main?.novaFee).toBeCloseTo(16, 12); // spent
    expect(second?.novaFee).toBeCloseTo(64, 12); // what it will have spent
    expect(main?.netProfit).toBeCloseTo(436.48 - 26 - 3.9 - 80, 9);
    expect(main?.margin).toBeCloseTo((436.48 - 26 - 3.9 - 80) / 436.48, 12);
    expect(second?.projectedMediaCost).toBeCloseTo(96, 9); // 6 ÷ 5,000 × 80,000
    expect(main?.projectedNetProfit).toBeCloseTo(436.48 - (20 + 96) * 1.15 - 80, 9);
    // Revenue per click: A$436.48 ÷ 1,000 = A$0.43648.
    expect(main?.ioMargin).toBeCloseTo((87.296 - 23 - 16) / 87.296, 12);
    expect(second?.ioMargin).toBeCloseTo((21.824 - 6.9 - 4) / 21.824, 12);
    expect(main?.overallMargin).toBeCloseTo((109.12 - 29.9 - 20) / 109.12, 12);
    expect(main?.health).toBe('🔴 Critical | 50/day'); // 750 still needed over 15 days
    expect(second?.health).toBe(main?.health);
  });

  it('CPCV: costs and profit, but no pacing (views are not in the CSV)', () => {
    const row = group('home tour video')?.rows[0];
    expect(row).toMatchObject({ type: 'CPCV', achieved: null, required: null, health: '', comment: NO_VIEWS_COMMENT, ioMargin: null, budgetAud: 948.8 });
    expect(row?.novaFee).toBeCloseTo(6.4, 12);
    expect(row?.netProfit).toBeCloseTo(948.8 - 12 - 1.8 - 6.4, 9);
    expect(r.warnings.some((w) => w.includes('CPCV'))).toBe(true);
  });

  it('an IO with no tracker row: comment and warning, money left blank', () => {
    const row = group('mystery offer')?.rows[0];
    expect(row).toMatchObject({ comment: NO_TRACKER_COMMENT, totalTarget: null, budgetAud: null, netProfit: null, health: '' });
    expect(r.warnings).toContain('No row in the Ufurnish tab for "Mystery Offer IO". Its target and budget are left blank.');
    expect(r.counts).toEqual({ CPC: 2, CPCV: 1 });
  });

  it('no Budget (AUD) in the tracker: target × A$0.44 (CPC), with a warning', () => {
    const w = calculateUfurnish({ today, rows: [io('Plain Promo IO', 1, 100, 1)], targets: new Map([['plain promo', target({ target: 1000, budgetGbp: 230 })]]) }, UFURNISH_DEFAULTS);
    expect(w.rows[0]?.budgetAud).toBeCloseTo(440, 9);
    expect(w.warnings).toEqual(['No Budget (AUD) in the tracker for "Plain Promo IO"; used 1000 × A$0.44.']);
  });

  it('the module also accepts the shared input shape', () => {
    const m = ufurnishModule.calculate({ today, rows: [io('A IO', 10, 1000, 1)], targets: new Map([['a', { start: day(1), end: day(30), clicks: 500 }]]) }, UFURNISH_DEFAULTS);
    expect(m.rows[0]).toMatchObject({ type: 'CPC', totalTarget: 500, budgetAud: 220 });
  });

  describe('Report tab', () => {
    const spec = buildUfurnishSheetSpec(r, UFURNISH_DEFAULTS);
    const at = (row: number, k: keyof typeof UFURNISH_COL) => spec.rows[row]?.[UFURNISH_COL[k]]?.value;
    // Rows: 2 Harbour Sofa IO · 3 Harbour Sofa IO 2 · 4 Home Tour video · 5 Mystery Offer

    it('Health and days after the impressions, the four margins side by side, then costs, £/A$ and Comment last', () => {
      expect(spec.headers.slice(12, 28)).toEqual([
        'Required Total Impression', 'Campaign Health', 'Remaining Days', 'Margin %', 'Projected Margin %', 'IO Margin %', 'Overall Margin %',
        'Inventory cost (AUD)', 'FS Service fee (AUD)', 'Nova fee (AUD)', 'Budget (GBP)', 'Budget (AUD)', 'Net profit (AUD)',
        'Projected Media Cost (AUD)', 'Projected Net Profit (AUD)', 'Comment',
      ]);
      expect(spec.headers[7]).toBe('Required (without extra)');
      expect(spec.headers[UFURNISH_GROUP_KEY_COLUMN - 1]).toBe('Group Key');
      expect(spec.hiddenColumns).toEqual([31]);
      expect(spec.rows.every((row) => row.length === UFURNISH_HEADERS.length)).toBe(true);
    });

    it('notes: Required, the A$ budget, and what each margin shows', () => {
      const notes = spec.headerNotes ?? {};
      expect(Object.keys(notes).map(Number).sort((a, b) => a - b)).toEqual([7, 15, 16, 17, 18, 23]);
      expect(notes[UFURNISH_COL.ioMargin]).toContain('A$ per click = Budget (AUD) ÷ click target');
      expect(notes[UFURNISH_COL.projMargin]).toContain('Below 75% → Margin Issue tab');
      for (const k of ['margin', 'projMargin', 'ioMargin', 'overallMargin'] as const) expect(notes[UFURNISH_COL[k]]).toMatch(/^Shows: .*\nFormula: .*\nWhen to use: /s);
    });

    it('budgets from the tracker on the first IO; margins from Net profit ÷ Budget (AUD)', () => {
      expect(at(0, 'budgetGbp')).toBe(230);
      expect(at(0, 'budgetAud')).toBe(436.48);
      expect(at(1, 'budgetAud')).toBeNull();
      expect(at(0, 'margin')).toBe('=IF(Y2="","",Y2/X2)');
      expect(at(0, 'projMargin')).toBe('=IF(AA2="","",AA2/X2)');
      expect(at(0, 'fs')).toBe('=T2*15%');
    });

    it("the 2nd IO's own Total and Targeted; still needed on the last IO; Nova on the latest IO falls back to spend", () => {
      expect(at(1, 'total')).toBe('=IF($E$2="","",MAX($E$2-SUM($G$2:G2),0))');
      expect(at(1, 'targeted')).toBe('=IF(E3="","",ROUND(E3+(E3*10%),0))');
      expect(at(0, 'required')).toBeNull();
      expect(at(1, 'required')).toBe('=IFERROR(IF(OR($B3="CPCV",$E$2=""),"",MAX($E$2-SUMIF($AE$2:$AE,$AE3,$G$2:$G),0)),"")');
      expect(at(1, 'nova')).toBe('=(IF(M3="",J3,M3)/1000)*0.8');
      expect(at(0, 'nova')).toBe('=(J2/1000)*0.8');
      expect(at(0, 'achieved')).toBe('=IF($B2="CPC",I2,"")');
    });

    it('revenue per click = Budget (AUD) ÷ click target; CPCV has no health', () => {
      expect(String(at(1, 'ioMargin'))).toContain('I3*$X$2/$E$2');
      expect(String(at(0, 'overallMargin'))).toContain('SUMIF($AE$2:$AE,$AE2,$I$2:$I)*$X$2/$E$2');
      expect(at(2, 'health')).toBeNull();
      expect(at(2, 'comment')).toBe(NO_VIEWS_COMMENT);
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
