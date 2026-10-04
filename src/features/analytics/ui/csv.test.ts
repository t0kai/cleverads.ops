import { describe, expect, it } from 'vitest';
import { csvName, toCsv } from './csv';

describe('toCsv', () => {
  it('quotes commas, quotes and new lines', () => {
    expect(toCsv(['A', 'B'], [['x,y', 'say "hi"'], ['line\nbreak', 3]])).toBe('A,B\r\n"x,y","say ""hi"""\r\n"line\nbreak",3');
  });
  it('stops spreadsheet formulas from running (CSV injection)', () => {
    expect(toCsv(['A'], [['=HYPERLINK("x")'], ['+1'], ['-2'], ['@SUM(A1)']])).toBe('A\r\n"\'=HYPERLINK(""x"")"\r\n\'+1\r\n\'-2\r\n\'@SUM(A1)');
  });
  it('leaves real negative numbers alone and blanks empty cells', () => {
    expect(toCsv(['A', 'B'], [[-5, null]])).toBe('A,B\r\n-5,');
  });
});

describe('csvName', () => {
  it('makes a safe file name', () => {
    expect(csvName('Ironbark Finance - Brand', '2025-01', 'to', '2025-12')).toBe('ironbark-finance-brand_2025-01_to_2025-12.csv');
    expect(csvName('../../etc/passwd')).toBe('etc-passwd.csv');
  });
});
