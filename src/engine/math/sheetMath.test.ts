import { describe, expect, it } from 'vitest';
import { sheetRound, sheetRoundUp, sumBlanks } from './sheetMath';
import { convertSerialZone, formatSerialDmy, serialFromDmy, serialFromYmd, todaySerial } from '../dates/serial';

describe('Sheets maths', () => {
  it('ROUND goes half away from zero', () => {
    expect(sheetRound(2.5)).toBe(3);
    expect(sheetRound(-2.5)).toBe(-3);
    expect(sheetRound(2.675, 2)).toBe(2.68);
    expect(sheetRound(87431.18)).toBe(87431);
  });
  it('ROUNDUP goes away from zero', () => {
    expect(sheetRoundUp(4.2)).toBe(5);
    expect(sheetRoundUp(-0.2)).toBe(-1);
    expect(sheetRoundUp(3)).toBe(3);
  });
  it('sums blanks as 0', () => expect(sumBlanks([1, null, 2.5])).toBe(3.5));
});

describe('serial dates', () => {
  it('matches Google Sheets serials', () => {
    expect(serialFromYmd(2026, 10, 2)).toBe(46297);
    expect(serialFromDmy('02/10/2026')).toBe(46297);
    expect(serialFromDmy('not a date')).toBeNull();
    expect(formatSerialDmy(46297.83)).toBe('02/10/2026');
  });
  it('uses the given time zone for TODAY()', () => {
    const instant = new Date('2026-10-02T15:30:00Z'); // 3 Oct 01:30 in Sydney, still 2 Oct in London
    expect(todaySerial('Australia/Sydney', instant)).toBe(46298);
    expect(todaySerial('Europe/London', instant)).toBe(46297);
  });
  it('uses Dhaka for TODAY() in the reports', () => {
    const instant = new Date('2026-10-02T19:00:00Z'); // 3 Oct 01:00 in Dhaka
    expect(todaySerial('Asia/Dhaka', instant)).toBe(46298);
  });
  it('moves a Sydney date into a Dhaka sheet like Apps Script does', () => {
    const sep5 = serialFromYmd(2026, 9, 5); // Sydney +10
    const oct23 = serialFromYmd(2026, 10, 23); // Sydney +11 (daylight saving from 4 Oct)
    expect(convertSerialZone(sep5, 'Australia/Sydney', 'Asia/Dhaka')).toBeCloseTo(sep5 - 4 / 24, 9);
    expect(convertSerialZone(oct23, 'Australia/Sydney', 'Asia/Dhaka')).toBeCloseTo(oct23 - 5 / 24, 9);
    expect(convertSerialZone(sep5, 'Asia/Dhaka', 'Asia/Dhaka')).toBe(sep5);
    expect(formatSerialDmy(convertSerialZone(sep5, 'Australia/Sydney', 'Asia/Dhaka'))).toBe('04/09/2026');
  });
});
