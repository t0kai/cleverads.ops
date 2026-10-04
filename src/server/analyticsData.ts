import { parseDataTab, SheetFormatError } from '@/engine/analytics/parseSheet';
import type { AnalyticsPayload } from '@/engine/analytics/types';

/**
 * Reads the Data tab once and keeps the result for a few minutes, so many people opening the page
 * at once cost one Google call. Concurrent requests share the same in-flight read.
 */
export const CACHE_MS = 5 * 60 * 1000;
/** "Refresh" can force a new read, but not more often than this. */
export const MIN_REFRESH_MS = 30 * 1000;

export class SheetAccessError extends Error {}

export interface SheetSource {
  readonly sheetId: string;
  readonly sheetTab: string;
}

type Reader = (source: SheetSource) => Promise<unknown[][]>;

let cached: { payload: AnalyticsPayload; at: number; sourceKey: string } | undefined;
let inFlight: Promise<AnalyticsPayload> | undefined;

export function clearAnalyticsCache(): void {
  cached = undefined;
  inFlight = undefined;
}

export async function loadAnalytics(source: SheetSource, read: Reader, opts: { refresh?: boolean; now?: number } = {}): Promise<AnalyticsPayload> {
  const now = opts.now ?? Date.now();
  const sourceKey = `${source.sheetId}|${source.sheetTab}`;
  if (cached && cached.sourceKey === sourceKey) {
    const age = now - cached.at;
    if (age < CACHE_MS && !(opts.refresh && age >= MIN_REFRESH_MS)) return cached.payload;
  }
  inFlight ??= (async () => {
    try {
      const values = await read(source);
      const { rows, warnings } = parseDataTab(values);
      const payload: AnalyticsPayload = { rows, warnings: warnings.slice(0, 50), fetchedAt: new Date(now).toISOString() };
      cached = { payload, at: now, sourceKey };
      return payload;
    } finally {
      inFlight = undefined;
    }
  })();
  return inFlight;
}

/** Real reader: Sheets API, raw numbers and date serials (no display formatting). */
export function sheetsReader(getToken: () => Promise<string>, fetchImpl: typeof fetch = fetch): Reader {
  return async ({ sheetId, sheetTab }) => {
    const range = encodeURIComponent(`'${sheetTab.replace(/'/g, "''")}'!A1:Z`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=ROWS`;
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${await getToken()}` }, cache: 'no-store' });
      if (res.ok) {
        const body = (await res.json()) as { values?: unknown[][] };
        return body.values ?? [];
      }
      if (res.status === 403 || res.status === 404) throw new SheetAccessError('The app cannot open the data sheet.');
      if (res.status === 400) throw new SheetFormatError(`The sheet has no tab called "${sheetTab}".`);
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        continue;
      }
      throw new Error(`Google Sheets returned ${res.status}`);
    }
  };
}
