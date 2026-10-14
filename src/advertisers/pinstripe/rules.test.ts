import { describe, expect, it } from 'vitest';
import { serialFromYmd } from '@/engine/dates/serial';
import { ValidationError } from '@/shared/errors';
import { PINSTRIPE_DEFAULTS, parsePinstripeConfig } from './config';
import { calculatePinstripe, campaignHealth, campaignType, type PinstripeTarget } from './rules';
import { PINSTRIPE_HEADERS, PINSTRIPE_GROUP_KEY_COLUMN, buildPinstripeSheetSpec } from './sheet';
import { pinstripeModule } from './index';

// Made-up campaigns; numbers worked out by hand.
const day = (d: number) => serialFromYmd(2026, 10, d);
const io = (name: string, clicks: number, impressions: number, cost: number) => ({ name, clicks, impressions, cost, objective: '', status: '' });
const target = (t: Partial<PinstripeTarget>): PinstripeTarget => ({ start: day(1), end: day(30), target: null, budget: null, ...t });

describe('Pinstripe settings', () => {
  it('bills A$0.40 per click and treats 100,000+ targets as impression campaigns', () => {
    expect(PINSTRIPE_DEFAULTS.clientCpc).toBe(0.4);
    expect(PINSTRIPE_DEFAULTS.impressionTargetFrom).toBe(100_000);
    expect(PINSTRIPE_DEFAULTS).toMatchObject({ fsRate: 0.15, novaCpm: 0.8, minMargin: 0.75, urgentDays: 12, targetBuffer: 0.1 });
  });
  it('rejects bad settings', () => {
    expect(() => parsePinstripeConfig({ clientCpc: -1 })).toThrow(ValidationError);
    expect(() => parsePinstripeConfig({ ctrLow: 0.05, ctrHigh: 0.01 })).toThrow(ValidationError);
  });
  it('splits click and impression campaigns at the threshold', () => {
    expect(campaignType(99_999, PINSTRIPE_DEFAULTS)).toBe('Clicks');
    expect(campaignType(100_000, PINSTRIPE_DEFAULTS)).toBe('Impressions');
    expect(campaignType(null, PINSTRIPE_DEFAULTS)).toBe('Clicks');
  });
});

describe('calculatePinstripe', () => {
  const today = day(11);

  it('click campaign: budget = Click Target × A$0.40', () => {
    const r = calculatePinstripe(
      { today, rows: [io('Harbour Tea - Launch', 400, 25000, 30)], targets: new Map([['harbour tea - launch', target({ target: 1250, budget: 999 })]]) },
      PINSTRIPE_DEFAULTS,
    );
    const row = r.rows[0];
    // Still needed = Total 1,250 − 400 = 850 (Targeted keeps its 10% buffer for display only).
    expect(row).toMatchObject({ type: 'Clicks', totalTarget: 1250, targeted: 1375, achieved: 400, required: 850, impressionsNeeded: 53125, impressionsTotal: 78125, budget: 500 });
    expect(row?.ctr).toBeCloseTo(0.016, 9);
    expect(row?.fsFee).toBeCloseTo(4.5, 9);
    expect(row?.novaFee).toBeCloseTo(62.5, 9);
    expect(row?.netProfit).toBeCloseTo(403, 9);
    expect(row?.projectedMediaCost).toBeCloseTo(93.75, 9);
    expect(row?.projectedNetProfit).toBeCloseTo(329.6875, 9);
    expect(row?.health).toBe(campaignHealth(day(1), day(30), 1250, 400, today, PINSTRIPE_DEFAULTS));
    expect(row?.health).toMatch(/\| 45\/day$/); // 850 ÷ 19 days
    expect(r.clickCampaigns).toBe(1);
    expect(r.marginIssues.map((g) => g.key)).toEqual(['harbour tea - launch']);
  });

  it('impression campaign: pace on impressions, budget from the tracker', () => {
    const r = calculatePinstripe(
      { today, rows: [io('Nordic Home - Lights', 300, 200000, 120)], targets: new Map([['nordic home - lights', target({ target: 350000, budget: 2000 })]]) },
      PINSTRIPE_DEFAULTS,
    );
    const row = r.rows[0];
    expect(row).toMatchObject({ type: 'Impressions', targeted: 385000, achieved: 200000, required: 150000, impressionsNeeded: 150000, impressionsTotal: 350000, budget: 2000 });
    expect(row?.novaFee).toBeCloseTo(280, 9);
    expect(row?.netProfit).toBeCloseTo(1582, 9);
    expect(row?.projectedNetProfit).toBeCloseTo(1478.5, 9);
    expect(row?.projectedMargin).toBeCloseTo(0.73925, 9);
    expect(r.impressionCampaigns).toBe(1);
    expect(r.warnings).toEqual([]);
    // Impression IO margin: revenue at the budget rate, 200,000 × 2,000 ÷ 350,000.
    const revenue = (200000 * 2000) / 350000;
    expect(row?.ioMargin).toBeCloseTo((revenue - 138 - 160) / revenue, 12);
    expect(row?.overallMargin).toBeCloseTo((revenue - 138 - 160) / revenue, 12);
  });

  it('impression campaign without a tracker budget: warns and leaves margin blank', () => {
    const r = calculatePinstripe(
      { today, rows: [io('Nordic Home - Lights', 300, 200000, 120)], targets: new Map([['nordic home - lights', target({ target: 350000 })]]) },
      PINSTRIPE_DEFAULTS,
    );
    expect(r.rows[0]?.budget).toBeNull();
    expect(r.rows[0]?.projectedMargin).toBeNull();
    expect(r.warnings[0]).toContain('No budget');
  });

  it('a 2nd IO takes over the rest of the target and shares the main budget', () => {
    const r = calculatePinstripe(
      {
        today,
        rows: [io('Coastal Bank - Q4', 900, 60000, 40), io('Coastal Bank - Q4 2nd', 100, 5000, 5)],
        targets: new Map([['coastal bank - q4', target({ target: 1250 })]]),
      },
      PINSTRIPE_DEFAULTS,
    );
    const [main, second] = r.rows;
    // One target, on the main IO; what is still needed (Total 1,250 − 900 − 100) on the last IO; campaign health on both.
    expect(main).toMatchObject({ isLatest: false, targeted: 1375, required: null, impressionsNeeded: null, budget: 500 });
    expect(second).toMatchObject({ isChild: true, isLatest: true, targeted: null, achieved: 100, required: 250, budget: null, start: day(1), end: day(30) });
    expect(main?.health).toBe(campaignHealth(day(1), day(30), 1250, 1000, day(11), PINSTRIPE_DEFAULTS));
    expect(second?.health).toBe(main?.health);
    expect(r.groups).toHaveLength(1);
    // Each IO's own margin on clicks delivered (CPC 0.40), and the campaign overall.
    expect(main?.ioMargin).toBeCloseTo((360 - 46 - 48) / 360, 12);
    expect(second?.ioMargin).toBeCloseTo((40 - 5.75 - 4) / 40, 12);
    expect(main?.overallMargin).toBeCloseTo((400 - 51.75 - 52) / 400, 12);
    // Earlier IO is costed on what it spent; the rest is costed once, on the 2nd.
    expect(main?.novaFee).toBeCloseTo(48, 12);
    expect(main?.projectedMediaCost).toBe(40);
  });

  it('warns when the tracker has no target', () => {
    const r = calculatePinstripe({ today, rows: [io('Unknown Co', 1, 100, 1)], targets: new Map() }, PINSTRIPE_DEFAULTS);
    expect(r.warnings[0]).toContain('No target');
    expect(r.rows[0]?.type).toBe('Clicks');
  });

  it('the module also accepts the shared input shape', () => {
    const r = pinstripeModule.calculate({ today, rows: [io('A', 10, 1000, 1)], targets: new Map([['a', { start: day(1), end: day(30), clicks: 1250 }]]) }, PINSTRIPE_DEFAULTS);
    expect(r.rows[0]?.budget).toBe(500);
  });
});

describe('Pinstripe Report tab', () => {
  const r = calculatePinstripe(
    {
      today: day(11),
      rows: [io('Harbour Tea - Launch', 400, 25000, 30), io('Nordic Home - Lights', 300, 200000, 120)],
      targets: new Map([
        ['harbour tea - launch', target({ target: 1250 })],
        ['nordic home - lights', target({ target: 350000, budget: 2000 })],
      ]),
    },
    PINSTRIPE_DEFAULTS,
  );
  const spec = buildPinstripeSheetSpec(r, PINSTRIPE_DEFAULTS);
  const cell = (row: number, col: number) => spec.rows[row]?.[col]?.value;

  it('has the Type column and a hidden group key in AB', () => {
    expect(spec.headers).toBe(PINSTRIPE_HEADERS);
    expect(spec.headers[1]).toBe('Type');
    expect(spec.headers[7]).toBe('Required (without extra)');
    expect(spec.headerNotes?.[7]).toContain('Total target − every IO');
    expect(spec.headers[PINSTRIPE_GROUP_KEY_COLUMN - 1]).toBe('Group Key');
    expect(spec.hiddenColumns).toEqual([PINSTRIPE_GROUP_KEY_COLUMN]);
    expect(spec.rows.every((row) => row.length === PINSTRIPE_HEADERS.length)).toBe(true);
  });

  it('click rows get a CPC budget formula, impression rows the tracker budget', () => {
    expect(cell(0, 1)).toBe('Clicks');
    expect(cell(0, 16)).toBe('=IF(E2="","",E2*0.4)');
    expect(cell(1, 1)).toBe('Impressions');
    expect(cell(1, 16)).toBe(2000);
  });

  it('Achieved follows the Type column', () => {
    expect(cell(0, 6)).toBe('=IF($B2="Impressions",J2,I2)');
    expect(cell(0, 5)).toBe('=IF(E2="","",ROUND(E2+(E2*10%),0))');
    expect(String(cell(0, 17))).toContain('SUMIF($AD$2:$AD,$AD2,$N$2:$N)');
    // Still needed: Total target (E, no buffer) − every IO's delivery.
    expect(cell(0, 7)).toBe('=IFERROR(IF($E$2="","",MAX($E$2-SUMIF($AD$2:$AD,$AD2,$G$2:$G),0)),"")');
  });

  it('IO and overall margin columns, with the impression rate taken from the first IO', () => {
    expect(spec.headers[25]).toBe('IO Margin %');
    expect(spec.headers[26]).toBe('Overall Margin %');
    expect(cell(1, 25)).toBe('=IFERROR((IF($B3="Impressions",J3*$Q$3/$E$3,I3*0.4)-N3*(1+0.15)-(J3/1000)*0.8)/(IF($B3="Impressions",J3*$Q$3/$E$3,I3*0.4)),"")');
    expect(String(cell(0, 26))).toContain('SUMIF($AD$2:$AD,$AD2,$I$2:$I)*0.4');
  });
});

describe('Pinstripe formulas', () => {
  it('every formula has balanced brackets and quotes', () => {
    const r = calculatePinstripe(
      {
        today: day(11),
        rows: [io('Harbour Tea - Launch', 400, 25000, 30), io('Harbour Tea - Launch 2nd', 5, 500, 1), io('Nordic Home - Lights', 300, 200000, 120)],
        targets: new Map([
          ['harbour tea - launch', target({ target: 1250 })],
          ['nordic home - lights', target({ target: 350000, budget: 2000 })],
        ]),
      },
      PINSTRIPE_DEFAULTS,
    );
    const formulas = buildPinstripeSheetSpec(r, PINSTRIPE_DEFAULTS)
      .rows.flat()
      .map((c) => c.value)
      .filter((v): v is string => typeof v === 'string' && v.startsWith('='));
    expect(formulas.length).toBeGreaterThan(30);
    for (const f of formulas) {
      expect((f.match(/"/g) ?? []).length % 2, f).toBe(0);
      const outside = f.replace(/"[^"]*"/g, '');
      let depth = 0;
      for (const ch of outside) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        expect(depth, f).toBeGreaterThanOrEqual(0);
      }
      expect(depth, f).toBe(0);
    }
  });
});
