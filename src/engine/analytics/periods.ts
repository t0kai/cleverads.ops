import type { Grain } from './types';

/** Months per comparison grain. Every grain is built by adding up whole months. */
export const GRAIN_MONTHS: Readonly<Record<Grain, number>> = { month: 1, quarter: 3, half: 6, year: 12 };

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const QUARTER_SPAN = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'] as const;
const MONTH_KEY = /^(\d{4})-(\d{2})$/;

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function splitMonth(key: string): { year: number; month: number } {
  const m = MONTH_KEY.exec(key);
  if (!m) throw new Error(`Not a month key: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function isMonthKey(key: string): boolean {
  const m = MONTH_KEY.exec(key);
  return m !== null && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

export function addMonths(key: string, n: number): string {
  const { year, month } = splitMonth(key);
  const i = year * 12 + (month - 1) + n;
  return monthKey(Math.floor(i / 12), (i % 12) + 1);
}

/** Every month from `from` to `to`, inclusive, with no gaps. Empty when from > to. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 1200; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Sortable period key: "2025-08", "2025-Q3", "2025-H2", "2025". */
export function periodOf(month: string, grain: Grain): string {
  const { year, month: mm } = splitMonth(month);
  switch (grain) {
    case 'month':
      return month;
    case 'quarter':
      return `${year}-Q${Math.ceil(mm / 3)}`;
    case 'half':
      return `${year}-H${mm <= 6 ? 1 : 2}`;
    case 'year':
      return String(year);
  }
}

/** "Aug 2025" */
export function monthName(month: string): string {
  const { year, month: mm } = splitMonth(month);
  return `${MONTH_NAMES[mm - 1]} ${year}`;
}

/** "Aug ’25" for chart axes. */
export function monthShort(month: string): string {
  const { year, month: mm } = splitMonth(month);
  return `${MONTH_NAMES[mm - 1]} ’${String(year).slice(2)}`;
}

/** "Aug 2025", "Q3 2025", "H1 2026", "2025". */
export function periodName(key: string, grain: Grain): string {
  if (grain === 'month') return monthName(key);
  if (grain === 'year') return key;
  const [year, part] = key.split('-');
  return `${part} ${year}`;
}

/** The calendar months a period covers, e.g. "(Jul–Sep)". Empty for months and years. */
export function periodSpan(key: string, grain: Grain): string {
  if (grain === 'quarter') return QUARTER_SPAN[Number(key.slice(-1)) - 1] ?? '';
  if (grain === 'half') return key.endsWith('H1') ? 'Jan–Jun' : 'Jul–Dec';
  return '';
}
