import { describe, expect, it } from 'vitest';
import { campaignCalc } from './campaignCalc';

/** The original marketing-calculator site's search, kept here to prove the closed form gives the same answer. */
function siteImpressions(budget: number, margin: number, cpm: number): number {
  const target = budget * margin;
  const profitAt = (imp: number) => {
    const mc = cpm * (imp / 1000);
    return budget - (mc * 1.1 + mc * 0.045 + 0.8 * (imp / 1000));
  };
  let lo = 0;
  let hi = 100_000_000;
  let imp = 0;
  for (let i = 0; i < 60; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const p = profitAt(mid);
    if (Math.abs(p - target) < 0.001) {
      imp = mid;
      break;
    } else if (p > target) lo = mid;
    else hi = mid;
  }
  return imp === 0 ? Math.floor((lo + hi) / 2) : imp;
}

describe('Campaign Calculator', () => {
  it('matches the marketing-calculator site for the ACM example', () => {
    const r = campaignCalc({ budget: 150, margin: 0.75, clicks: 250, cpm: 1.1 });
    expect(r?.impressions).toBe(18208);
    expect(((r?.ctr ?? 0) * 100).toFixed(2)).toBe('1.37');
    expect(r?.media.toFixed(2)).toBe('20.03');
    expect(r?.inventory.toFixed(2)).toBe('22.03');
    expect(r?.fs.toFixed(2)).toBe('0.90');
    expect(r?.nova.toFixed(2)).toBe('14.57');
    expect(r?.profit.toFixed(2)).toBe('112.50');
    expect(r?.totalCost.toFixed(2)).toBe('37.50');
  });

  it('gives the same impressions as the site’s search for many budgets', () => {
    for (const [budget, margin, cpm] of [
      [300, 0.75, 0.9],
      [1200, 0.8, 1.35],
      [660, 0.6, 2.2],
      [2400, 0.75, 0.55],
    ] as const) {
      const r = campaignCalc({ budget, margin, clicks: 100, cpm });
      expect(Math.abs((r?.impressions ?? 0) - siteImpressions(budget, margin, cpm))).toBeLessThanOrEqual(1);
    }
  });

  it('returns nothing for empty or impossible inputs', () => {
    expect(campaignCalc({ budget: 0, margin: 0.75, clicks: 10, cpm: 1 })).toBeNull();
    expect(campaignCalc({ budget: 100, margin: 1, clicks: 10, cpm: 1 })).toBeNull();
    expect(campaignCalc({ budget: 100, margin: 0.75, clicks: 0, cpm: 1 })).toBeNull();
    expect(campaignCalc({ budget: 100, margin: 0.75, clicks: 10, cpm: Number.NaN })).toBeNull();
  });
});
