import { describe, expect, it } from 'vitest';
import { serialFromYmd } from '@/engine/dates/serial';
import { ValidationError } from '@/shared/errors';
import { TIMEOUT_DEFAULTS, parseTimeOutConfig } from './config';
import { groupTimeOutCampaigns, splitTimeOutName } from './names';
import { calculateTimeOut, requiredPerDay, type TimeOutTarget } from './rules';
import { TIMEOUT_GROUP_KEY_COLUMN, TIMEOUT_HEADERS, buildTimeOutSheetSpec } from './sheet';

// Made-up campaigns shaped like the real Time Out export; numbers worked out by hand.
const day = (d: number) => serialFromYmd(2026, 10, d);
const io = (name: string, clicks: number, impressions: number, cost: number) => ({ name, clicks, impressions, cost, objective: 'Click', status: 'Active' });
const target = (t: Partial<TimeOutTarget>): TimeOutTarget => ({ start: day(2), end: day(31), clicks: null, ...t });

describe('Time Out settings', () => {
  it('bills A$0.30 per click with a 1.5–3% healthy CTR and ACM-style fees', () => {
    expect(TIMEOUT_DEFAULTS).toMatchObject({ clientCpc: 0.3, clientCpm: 1.5, ctrLow: 0.015, ctrHigh: 0.03, fsRate: 0.15, novaCpm: 0.8, minMargin: 0.75, clickBuffer: 0.1, urgentDays: 12 });
  });
  it('rejects bad settings', () => {
    expect(() => parseTimeOutConfig({ clientCpc: 0 })).toThrow(ValidationError);
    expect(() => parseTimeOutConfig({ ctrLow: 0.04, ctrHigh: 0.03 })).toThrow(ValidationError);
  });
});

describe('Time Out IO names', () => {
  it('reads "X 2nd 3rd" (from "X 2nd IO 3rd") as the 3rd IO of X', () => {
    expect(splitTimeOutName('Harbour Gin | Launch GC')).toEqual({ base: 'Harbour Gin | Launch GC', order: 1, label: '' });
    expect(splitTimeOutName('Harbour Gin | Launch GC 2nd')).toEqual({ base: 'Harbour Gin | Launch GC', order: 2, label: '2nd' });
    expect(splitTimeOutName('Harbour Gin | Launch GC 2nd 3rd')).toEqual({ base: 'Harbour Gin | Launch GC', order: 3, label: '3rd' });
    expect(splitTimeOutName('Harbour Gin | Launch GC 3rd')).toEqual({ base: 'Harbour Gin | Launch GC', order: 3, label: '3rd' });
  });
  it('keeps a campaign whose name ends in "1st" whole', () => {
    expect(splitTimeOutName('Spring Sale 1st')).toEqual({ base: 'Spring Sale 1st', order: 1, label: '' });
  });
  it('groups main, 2nd and 3rd in order, whatever order the CSV has', () => {
    const g = groupTimeOutCampaigns([{ name: 'A 2nd' }, { name: 'A 2nd 3rd' }, { name: 'A' }, { name: 'B 2nd' }]);
    expect(g.map((x) => [x.key, x.members.map((m) => m.label), x.hasMain])).toEqual([
      ['a', ['', '2nd', '3rd'], true],
      ['b', ['2nd'], false],
    ]);
  });
});

describe('Required Clicks / Day', () => {
  it('divides what is left by the days left, rounding up', () => {
    expect(requiredPerDay(3019, day(2), day(31), day(12))).toBe(159);
    expect(requiredPerDay(10, day(2), day(31), day(31))).toBe(10); // last day: at least one day
  });
  it('counts from the start date before the campaign starts', () => {
    expect(requiredPerDay(100, day(20), day(30), day(12))).toBe(10);
  });
  it('is blank when nothing is needed or the campaign has ended', () => {
    expect(requiredPerDay(0, day(2), day(31), day(12))).toBeNull();
    expect(requiredPerDay(null, day(2), day(31), day(12))).toBeNull();
    expect(requiredPerDay(50, day(2), day(10), day(12))).toBeNull();
    expect(requiredPerDay(50, day(2), null, day(12))).toBeNull();
  });
});

describe('calculateTimeOut', () => {
  const today = day(12);
  const rows = [
    io('Harbour Gin | Launch GC 2nd', 124, 18716, 24.26),
    io('Harbour Gin | Launch GC 2nd 3rd', 21, 1593, 1.85),
    io('Harbour Gin | Launch GC', 136, 17417, 21.73),
  ];
  const r = calculateTimeOut({ today, rows, targets: new Map([['harbour gin | launch gc', target({ clicks: 3000 })]]) }, TIMEOUT_DEFAULTS);

  it('keeps main, 2nd and 3rd together with one budget = target × A$0.30', () => {
    expect(r.groups).toHaveLength(1);
    const [main, second, third] = r.rows;
    expect(main).toMatchObject({ campaignType: 'CPC', totalClicks: 3000, targetedClicks: 3300, requiredClicks: 0, budget: 900, superseded: true, health: '▶ Running with 2nd' });
    expect(second).toMatchObject({ isChild: true, targetedClicks: 3164, requiredClicks: 0, budget: null, health: '▶ Running with 3rd' });
    expect(third).toMatchObject({ isChild: true, targetedClicks: 3040, requiredClicks: 3019, requiredPerDay: 159, health: '🔴 Critical | 159/day' });
    expect(main?.requiredPerDay).toBeNull();
  });

  it('works out the group margin on the main row', () => {
    const main = r.rows[0];
    const media = 21.73 + 24.26 + 1.85;
    expect(main?.netProfit).toBeCloseTo(900 - media - media * 0.15 - r.rows.reduce((s, x) => s + (x.novaFee ?? 0), 0), 9);
    expect(main?.margin).toBeCloseTo((main?.netProfit ?? 0) / 900, 12);
    expect(r.warnings).toEqual([]);
  });

  it('warns when the tracker has no target, and comments a lone 2nd IO', () => {
    const lone = calculateTimeOut({ today, rows: [io('Solo 2nd', 1, 100, 1), io('Missing', 1, 100, 1)], targets: new Map() }, TIMEOUT_DEFAULTS);
    expect(lone.rows[0]?.comment).toBe('Main campaign not in CSV – target not calculated');
    expect(lone.warnings).toEqual(['No Clicks/View Target in the Campaign Tracker for "Missing".']);
  });
});

describe('Time Out Report tab', () => {
  const r = calculateTimeOut(
    {
      today: day(12),
      rows: [io('Harbour Gin | Launch GC', 136, 17417, 21.73), io('Harbour Gin | Launch GC 2nd', 124, 18716, 24.26), io('Coastal Stage | Show', 50, 4000, 6)],
      targets: new Map([
        ['harbour gin | launch gc', target({ clicks: 3000 })],
        ['coastal stage | show', target({ clicks: 6900 })],
      ]),
    },
    TIMEOUT_DEFAULTS,
  );
  const spec = buildTimeOutSheetSpec(r, TIMEOUT_DEFAULTS);
  const cell = (row: number, col: number) => spec.rows[row]?.[col]?.value;

  it('has Campaign Type and Required Clicks / Day next to the click columns, group key hidden in AB', () => {
    expect(spec.headers[1]).toBe('Campaign Type');
    expect(spec.headers[8]).toBe('Required Clicks / Day');
    expect(spec.headers[TIMEOUT_GROUP_KEY_COLUMN - 1]).toBe('Group Key');
    expect(spec.hiddenColumns).toEqual([TIMEOUT_GROUP_KEY_COLUMN]);
    expect(spec.rows.every((row) => row.length === TIMEOUT_HEADERS.length)).toBe(true);
    expect(spec.rows.every((row) => row[1]?.value === 'CPC')).toBe(true);
  });

  it('uses Time Out rates in the formulas', () => {
    expect(cell(0, 16)).toBe('=IF(E2="","",E2*0.3)');
    expect(cell(2, 8)).toBe('=IFERROR(IF(OR(H4="",H4=0,D4=""),"",IF(TODAY()>D4,"",ROUNDUP(H4/MAX(1,D4-MAX(TODAY(),C4)),0))),"")');
    expect(String(cell(0, 17))).toContain('SUMIF($AB$2:$AB,$AB2,$N$2:$N)');
  });

  it('every formula has balanced brackets and quotes', () => {
    const formulas = spec.rows.flat().map((c) => c.value).filter((v): v is string => typeof v === 'string' && v.startsWith('='));
    expect(formulas.length).toBeGreaterThan(30);
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
