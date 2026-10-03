import { describe, expect, it } from 'vitest';
import { parseCsv } from './parseCsv';
import { parseNumber } from './numbers';
import { readDv360Csv, cleanIoName } from './dv360';
import { ValidationError } from '@/shared/errors';

describe('parseCsv', () => {
  it('reads quotes, escaped quotes, commas and line breaks inside quotes', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n"x\ny",2,\n')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['x\ny', '2', ''],
    ]);
  });
  it('drops a UTF-8 BOM', () => {
    expect(parseCsv('﻿Name\nA')).toEqual([['Name'], ['A']]);
  });
});

describe('parseNumber', () => {
  it.each([
    ['1,147', 1147],
    ['A$12.25', 12.25],
    ['12.25 AUD', 12.25],
    ['', 0],
    ['n/a', 0],
    [undefined, 0],
  ])('%s → %d', (input, expected) => expect(parseNumber(input)).toBe(expected));
});

describe('readDv360Csv', () => {
  it('finds columns by name in any order and strips the word IO', () => {
    const res = readDv360Csv('Clicks,Revenue,Name,Impressions\n"1,147",A$12.25,Campaign 04 IO - 1,"89,124"\n,,,\n');
    expect(res.rows).toEqual([{ name: 'Campaign 04 - 1', impressions: 89124, clicks: 1147, cost: 12.25, objective: '', status: '' }]);
    expect(res.skippedBlankRows).toBe(1);
  });
  it('lists every missing column at once', () => {
    try {
      readDv360Csv('Name,Status\nA,Active');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).issues).toEqual(['Missing column: Impressions', 'Missing column: Clicks', 'Missing column: Revenue']);
    }
  });
  it('rejects an empty file', () => {
    expect(() => readDv360Csv('Name,Impressions,Clicks,Revenue\n')).toThrow(ValidationError);
  });
  it('cleans names like the Apps Script', () => {
    expect(cleanIoName('  Rabo  IO   - 03.09.26  ')).toBe('Rabo - 03.09.26');
    expect(cleanIoName('BIOTECH IO')).toBe('BIOTECH');
  });
});
