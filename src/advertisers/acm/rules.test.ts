import { describe, expect, it } from 'vitest';
import { serialFromYmd } from '@/engine/dates/serial';
import { ACM_DEFAULTS, parseAcmConfig } from './config';
import { calculateAcm, campaignHealth, daysLeft, ioMargin } from './rules';
import { ValidationError } from '@/shared/errors';

const day = (d: number) => serialFromYmd(2026, 10, d);

describe('campaignHealth (column R)', () => {
  const start = day(1);
  const end = day(30); // 30-day flight
  it.each([
    [550, 600, 'Completed'],
    [550, 100, 'Ahead'],
    [550, 18, 'On Pace'],
    [550, 0, 'Behind'],
  ])('target %d, achieved %d on day 2 → %s', (target, achieved, word) => {
    expect(campaignHealth(start, end, target, achieved, day(2), ACM_DEFAULTS)).toContain(word);
  });
  it('is Critical when far behind, and shows clicks per day still needed', () => {
    // Day 10 of 30: about a third should be done; nothing is. 550 clicks over the 20 days left.
    expect(campaignHealth(start, end, 550, 0, day(10), ACM_DEFAULTS)).toBe('🔴 Critical | 28/day');
  });
  it('handles not started, ended and missing targets', () => {
    expect(campaignHealth(start, end, 550, 0, day(1) - 1, ACM_DEFAULTS)).toBe('Not Started');
    expect(campaignHealth(start, end, 550, 0, day(31), ACM_DEFAULTS)).toBe('Ended');
    expect(campaignHealth(start, end, null, 0, day(2), ACM_DEFAULTS)).toBe('');
  });
});

describe('daysLeft (column S)', () => {
  it('rounds part days up and never goes below 0', () => {
    expect(daysLeft(day(7) + 0.83, day(3))).toBe(5);
    expect(daysLeft(day(1), day(3))).toBe(0);
    expect(daysLeft(null, day(3))).toBeNull();
  });
});

describe('calculateAcm edge cases', () => {
  const base = { today: day(2) };
  it('a 2nd without its main gets a comment and no target', () => {
    const r = calculateAcm(
      { ...base, rows: [{ name: 'X 2nd', impressions: 100, clicks: 1, cost: 1, objective: '', status: '' }], targets: new Map() },
      ACM_DEFAULTS,
    );
    expect(r.rows[0]?.comment).toBe('Main campaign not in CSV – target not calculated');
    expect(r.rows[0]?.targetedClicks).toBeNull();
  });
  it('a 2nd starts on the main campaign start date, even if the tracker has its own start', () => {
    const r = calculateAcm(
      {
        ...base,
        rows: [
          { name: 'A', impressions: 1000, clicks: 10, cost: 1, objective: '', status: '' },
          { name: 'A 2nd', impressions: 1000, clicks: 10, cost: 1, objective: '', status: '' },
        ],
        targets: new Map([
          ['a', { start: day(1), end: day(30), clicks: 100 }],
          ['a 2nd', { start: day(5), end: null, clicks: null }],
        ]),
      },
      ACM_DEFAULTS,
    );
    expect(r.rows[1]?.start).toBe(day(1));
    expect(r.rows[1]?.end).toBe(day(30));
    expect(r.rows[1]?.targetedClicks).toBeNull(); // one target per campaign, on the main IO
    expect(r.rows[1]?.requiredClicks).toBe(80); // Total 100 − (10 + 10), shown on the last IO
  });
  it('zero impressions never divides by zero', () => {
    const r = calculateAcm(
      { ...base, rows: [{ name: 'Z', impressions: 0, clicks: 0, cost: 0, objective: '', status: '' }], targets: new Map([['z', { start: day(1), end: day(30), clicks: 300 }]]) },
      ACM_DEFAULTS,
    );
    expect(r.rows[0]?.ctr).toBeNull();
    expect(r.rows[0]?.projectedMargin).toBe(1);
  });
  it('warns when the target sheet has no row for a campaign', () => {
    const r = calculateAcm({ ...base, rows: [{ name: 'Q', impressions: 1, clicks: 0, cost: 0, objective: '', status: '' }], targets: new Map() }, ACM_DEFAULTS);
    expect(r.warnings).toHaveLength(1);
  });
});

describe('parseAcmConfig', () => {
  it('fills defaults', () => expect(parseAcmConfig({}).fsRate).toBe(0.15));
  it('rejects bad values with a readable message', () => {
    expect(() => parseAcmConfig({ fsRate: 'abc' })).toThrow(ValidationError);
    try {
      parseAcmConfig({ ctrLow: 0.05, ctrHigh: 0.01 });
      expect.unreachable();
    } catch (e) {
      expect((e as ValidationError).issues[0]).toMatch(/CTR/);
    }
  });
});

describe('one target per campaign, every IO live', () => {
  // Main and 2nd both running; numbers worked out by hand. CPC 0.60, FS 15%, Nova A$0.80 CPM.
  const r = calculateAcm(
    {
      today: day(3),
      rows: [
        { name: 'Alpha - 1', impressions: 10000, clicks: 100, cost: 10, objective: '', status: '' },
        { name: 'Alpha - 1 2nd', impressions: 5000, clicks: 40, cost: 5, objective: '', status: '' },
      ],
      targets: new Map([['alpha - 1', { start: day(1), end: day(20), clicks: 500 }]]),
    },
    ACM_DEFAULTS,
  );
  const [main, second] = r.rows;

  it('shows Targeted on the main IO and what is still needed (Total − all clicks) on the last IO', () => {
    expect(main).toMatchObject({ targetedClicks: 550, requiredClicks: null, impressionsNeeded: null, isLatest: false });
    expect(second).toMatchObject({ targetedClicks: null, requiredClicks: 360, isLatest: true }); // Total 500 − (100 + 40); no 10% buffer
  });

  it('shows the campaign health on every IO', () => {
    expect(main?.health).toBe(campaignHealth(day(1), day(20), 500, 140, day(3), ACM_DEFAULTS));
    expect(second?.health).toBe(main?.health);
    expect(main?.health).not.toContain('Running with');
  });

  it('gives each IO its own margin and the campaign an overall margin', () => {
    expect(main?.ioMargin).toBeCloseTo(40.5 / 60, 12); // (60 − 11.5 − 8) ÷ 60
    expect(second?.ioMargin).toBeCloseTo(14.25 / 24, 12); // (24 − 5.75 − 4) ÷ 24
    expect(main?.overallMargin).toBeCloseTo(54.75 / 84, 12);
    expect(second?.overallMargin).toBeNull();
    expect(ioMargin(0, 5, 1000, ACM_DEFAULTS)).toBeNull();
  });

  it('costs the clicks still to come only once, so the projected margin does not drop', () => {
    expect(main?.novaFee).toBeCloseTo(8, 12); // spent impressions only
    expect(main?.projectedMediaCost).toBe(10);
    expect(second?.impressionsNeeded).toBe(45000); // 360 ÷ 0.8% CTR
    expect(second?.novaFee).toBeCloseTo(40, 9); // (5,000 + 45,000) ÷ 1,000 × 0.8
    expect(second?.projectedMediaCost).toBeCloseTo(50, 9); // 5 ÷ 5,000 × 50,000
    expect(main?.projectedNetProfit).toBeCloseTo(300 - (10 + 50) * 1.15 - 48, 9);
  });
});
