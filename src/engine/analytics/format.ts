import type { Rate } from './types';

/** "A$1,234" or "A$1,234.56" */
export function aud(n: number, decimals = 0): string {
  return 'A$' + n.toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** eCPM to the cent, eCPC to a tenth of a cent. */
export function rateText(rate: Rate, value: number): string {
  return aud(value, rate === 'cpm' ? 2 : 3);
}

/** 192.1M, 3.1M, 835.8K, 412 */
export function compact(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

export function whole(n: number): string {
  return Math.round(n).toLocaleString('en-AU');
}

/** 0.0163 → "1.63%" */
export function percent(fraction: number, decimals = 2): string {
  return `${(fraction * 100).toFixed(decimals)}%`;
}

export const rateName = (rate: Rate): 'eCPM' | 'eCPC' => (rate === 'cpm' ? 'eCPM' : 'eCPC');
