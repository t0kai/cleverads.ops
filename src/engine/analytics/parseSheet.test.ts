import { describe, expect, it } from 'vitest';
import { findColumns, parseDataTab, readMonth, readNumber, SheetFormatError } from './parseSheet';

const HEADER = ['Month', 'Advertiser', 'Impressions', 'Clicks', 'Media cost (AUD)', 'DV fee %', 'FS fee %', 'DV fee (AUD)', 'FS fee (AUD)', 'Total cost (AUD)', 'Note'];
// 46266 = 1 Sep 2026 as a Sheets serial
const SEP_2026 = 46266;

describe('readMonth', () => {
  it('reads serials and the text formats people type', () => {
    expect(readMonth(SEP_2026)).toBe('2026-09');
    expect(readMonth('2026-09')).toBe('2026-09');
    expect(readMonth('2026/9')).toBe('2026-09');
    expect(readMonth('2026-09-01')).toBe('2026-09');
    expect(readMonth('1/9/2026')).toBe('2026-09');
    expect(readMonth('Sept')).toBeNull();
    expect(readMonth('2026-13')).toBeNull();
    expect(readMonth('')).toBeNull();
  });
});

describe('readNumber', () => {
  it('accepts numbers, commas, A$ and %', () => {
    expect(readNumber(12.5)).toBe(12.5);
    expect(readNumber('1,234')).toBe(1234);
    expect(readNumber('A$12.25')).toBe(12.25);
    expect(readNumber('10%')).toBeCloseTo(0.1);
    expect(readNumber('')).toBeNull();
    expect(readNumber(null)).toBeNull();
  });
  it('refuses text', () => {
    expect(() => readNumber('n/a')).toThrow();
  });
});

describe('findColumns', () => {
  it('finds columns by heading, in any order and case', () => {
    const c = findColumns(['advertiser', 'MONTH', 'Clicks', 'Impressions', 'Media cost', 'DV fee', 'FS fee']);
    expect(c.month).toBe(1);
    expect(c.advertiser).toBe(0);
    expect(c.dvPct).toBe(-1);
  });
  it('names the headings that are missing', () => {
    expect(() => findColumns(['Month', 'Advertiser'])).toThrow(SheetFormatError);
    expect(() => findColumns(['Month', 'Advertiser'])).toThrow(/impressions, clicks, media cost/);
  });
});

describe('parseDataTab', () => {
  it('reads good rows and works out fees from the % when the amount is blank', () => {
    const { rows, warnings } = parseDataTab([HEADER, [SEP_2026, ' ACM ', 1000, 20, 100, 0.1, 0.045, '', '', '', '']]);
    expect(warnings).toEqual([]);
    expect(rows[0]).toMatchObject({ advertiser: 'ACM', month: '2026-09', impressions: 1000, clicks: 20, media: 100 });
    expect(rows[0]?.dv).toBeCloseTo(10);
    expect(rows[0]?.fs).toBeCloseTo(4.5);
    expect(rows[0]?.total).toBeCloseTo(114.5);
  });
  it('prefers the fee amount when the sheet has calculated it', () => {
    const { rows } = parseDataTab([HEADER, [SEP_2026, 'ACM', 1000, 20, 100, 0.1, 0.045, 3.73, 4.5, 108.23]]);
    expect(rows[0]?.dv).toBe(3.73);
  });
  it('skips blank rows silently and bad rows with a clear warning', () => {
    const { rows, warnings } = parseDataTab([
      HEADER,
      ['', '', '', '', '', '', '', '', '', ''],
      [SEP_2026, 'ACM', 1000, '', 100, 0.1, 0.045],
      [SEP_2026, '', 1000, 10, 100, 0.1, 0.045],
      ['Sept', 'Bluegum Travel', 1000, 10, 100, 0.1, 0.045],
      [SEP_2026, 'Harbour Lane', -5, 10, 100, 0.1, 0.045],
      [SEP_2026, 'Coral Bay News', 'lots', 10, 100, 0.1, 0.045],
      [SEP_2026, 'Wattle Kids', 500, 10, 50, 0.1, 0.045],
    ]);
    expect(rows.map((r) => r.advertiser)).toEqual(['Wattle Kids']);
    expect(warnings.map((w) => w.row)).toEqual([3, 4, 5, 6, 7]);
    expect(warnings[0]?.message).toMatch(/Row 3 has no Clicks/);
    expect(warnings[2]?.message).toMatch(/no valid month/);
    expect(warnings[3]?.message).toMatch(/negative Impressions/);
  });
  it('keeps the first of two rows for the same advertiser and month', () => {
    const { rows, warnings } = parseDataTab([HEADER, [SEP_2026, 'ACM', 1000, 20, 100, 0.1, 0.045], [SEP_2026, 'acm', 9, 9, 9, 0.1, 0.045]]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.impressions).toBe(1000);
    expect(warnings[0]?.message).toMatch(/already has a row/);
  });
  it('sorts rows by month then advertiser', () => {
    const { rows } = parseDataTab([HEADER, ['2026-09', 'B', 1, 0, 1, 0.1, 0.045], ['2026-08', 'Z', 1, 0, 1, 0.1, 0.045], ['2026-09', 'A', 1, 0, 1, 0.1, 0.045]]);
    expect(rows.map((r) => `${r.month} ${r.advertiser}`)).toEqual(['2026-08 Z', '2026-09 A', '2026-09 B']);
  });
  it('refuses an empty tab', () => {
    expect(() => parseDataTab([])).toThrow(SheetFormatError);
  });
});

describe('parseDataTab with a pasted DV360 report', () => {
  // The Data tab: DV360's 7 columns, then the sheet's own worked-out columns.
  const DV360 = ['Advertiser', 'Year', 'Month', 'Partner Currency', 'Impressions', 'Clicks', 'Media Cost (Partner Currency)',
    'Row check', 'Month (read as)', 'DV fee %', 'FS fee %', 'DV fee (AUD)', 'FS fee (AUD)', 'Total cost (AUD)', 'CTR', 'eCPM (AUD)', 'eCPC (AUD)', 'Note'];

  it('reads rows exactly as DV360 exports them, with the fees the sheet worked out', () => {
    const { rows, warnings } = parseDataTab([
      DV360,
      ['Northwind Media', 2026, '2026/09', 'AUD', 146873, 2634, 162.201496, '✓ OK', SEP_2026, 0.1, 0.045, 16.2201496, 7.29906732, 185.7207129],
      ['Bluegum Travel', 2026, SEP_2026, 'AUD', '1,603,520', '22,392', '1,273.48', '✓ OK', SEP_2026, 0.0373, 0.045, 47.500804, 57.3066],
    ]);
    expect(warnings).toEqual([]);
    expect(rows.map((r) => r.advertiser)).toEqual(['Bluegum Travel', 'Northwind Media']);
    expect(rows[1]).toMatchObject({ month: '2026-09', impressions: 146873, clicks: 2634 });
    expect(rows[1]?.total).toBeCloseTo(185.7207129);
    expect(rows[0]).toMatchObject({ impressions: 1603520, clicks: 22392, media: 1273.48, dv: 47.500804 });
  });

  it('quietly skips a pasted heading row, the totals row and the DV360 footer lines', () => {
    const { rows, warnings } = parseDataTab([
      DV360,
      ['Northwind Media', 2026, '2026/09', 'AUD', 1000, 20, 100, '', '', 0.1, 0.045, 10, 4.5],
      ['Advertiser', 'Year', 'Month', 'Partner Currency', 'Impressions', 'Clicks', 'Media Cost (Partner Currency)'],
      ['', '', '', '', 5000, 90, 600],
      ['Report Time:', '2026/10/01 09:15 AEST'],
      ['Date Range:', '2026/09/01 to 2026/09/30'],
      ['Group By:', 'Advertiser'],
      ['MRC Accredited Metrics'],
    ]);
    expect(rows).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('still warns about a real row with a month it cannot read, or a currency other than AUD', () => {
    const { rows, warnings } = parseDataTab([
      DV360,
      ['Northwind Media', 2026, 'September', 'AUD', 1000, 20, 100, '', '', 0.1, 0.045, 10, 4.5],
      ['Harbour Lane', 2026, '2026/09', 'USD', 1000, 20, 100, '', '', 0.1, 0.045, 10, 4.5],
    ]);
    expect(rows).toEqual([]);
    expect(warnings.map((w) => w.message)).toEqual([
      expect.stringMatching(/Row 2 has no valid month \(use the DV360 format, e.g. 2026\/09\)/),
      expect.stringMatching(/Row 3 is in USD, not AUD/),
    ]);
  });
});
