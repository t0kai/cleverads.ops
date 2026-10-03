import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkUpload } from './checkUpload';

describe('checkUpload', () => {
  it('summarises the golden CSV like the mockup: 49 IOs, 11 with a 2nd, 3 with no impressions', () => {
    const csv = readFileSync(new URL('../../../tests/fixtures/acm-2026-10-02/dv360.csv', import.meta.url), 'utf8');
    const c = checkUpload(csv);
    expect(c.ioCount).toBe(49);
    expect(c.campaignsWithFollowOn).toBe(11);
    expect(c.zeroImpressionIos).toHaveLength(3);
    expect(c.orphanFollowOns).toEqual([]);
    expect(c.columnsFound).toEqual(['name', 'impressions', 'clicks', 'revenue', 'objective', 'status']);
  });
});
