import { monthRange } from './periods';
import type { MonthRow } from './types';

/**
 * Made-up data for preview mode and tests. Fictional advertiser names, deterministic numbers.
 * Real client data never goes into the code or into git.
 */
const CLIENTS = [
  { name: 'Northwind Media', from: '2024-08', to: '2026-08', imp: 1_800_000, cpm: 1.05, ctr: 0.022, drift: 0.004 },
  { name: 'Bluegum Travel', from: '2025-07', to: '2026-08', imp: 2_600_000, cpm: 1.2, ctr: 0.018, drift: 0.01 },
  { name: 'Harbour Lane', from: '2024-08', to: '2026-08', imp: 900_000, cpm: 2.4, ctr: 0.006, drift: 0.02 },
  { name: 'Kestrel Sports', from: '2024-10', to: '2026-06', imp: 1_100_000, cpm: 0.95, ctr: 0.027, drift: -0.003 },
  { name: 'Saltbush Living', from: '2024-08', to: '2025-12', imp: 450_000, cpm: 1.3, ctr: 0.012, drift: 0.002 },
  { name: 'Ridgeline Auto', from: '2025-01', to: '2026-08', imp: 700_000, cpm: 1.15, ctr: 0.019, drift: 0.006 },
  { name: 'Coral Bay News', from: '2024-08', to: '2026-08', imp: 1_400_000, cpm: 0.9, ctr: 0.024, drift: 0.008 },
  { name: 'Ironbark Finance', from: '2025-04', to: '2026-08', imp: 300_000, cpm: 3.1, ctr: 0.0006, drift: 0.0 },
  { name: 'Wattle Kids', from: '2025-09', to: '2026-08', imp: 520_000, cpm: 1.1, ctr: 0.021, drift: 0.004 },
  { name: 'Jacaranda Homes', from: '2024-11', to: '2026-03', imp: 380_000, cpm: 1.45, ctr: 0.009, drift: 0.012 },
] as const;

/** Small seeded random generator so the demo looks the same every time. */
function seeded(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoRows(): MonthRow[] {
  const rand = seeded(20261004);
  const rows: MonthRow[] = [];
  for (const c of CLIENTS) {
    monthRange(c.from, c.to).forEach((month, i) => {
      const impressions = Math.round(c.imp * (0.6 + rand() * 0.8));
      const clicks = Math.round(impressions * c.ctr * (0.8 + rand() * 0.4));
      const cpm = c.cpm * (1 + c.drift * i) * (0.85 + rand() * 0.3);
      const media = Math.round(((impressions * cpm) / 1000 / 1.145) * 100) / 100;
      const dv = Math.round(media * 0.1 * 100) / 100;
      const fs = Math.round(media * 0.045 * 100) / 100;
      rows.push({ advertiser: c.name, month, impressions, clicks, media, dv, fs, total: Math.round((media + dv + fs) * 100) / 100 });
    });
  }
  return rows.sort((a, b) => (a.month === b.month ? a.advertiser.localeCompare(b.advertiser) : a.month < b.month ? -1 : 1));
}
