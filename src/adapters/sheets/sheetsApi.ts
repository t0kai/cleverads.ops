import { googleFetch } from '@/adapters/google/http';

/**
 * Google Sheets REST v4. Dates come back as serial numbers (days since 1899-12-30) so the engine
 * never parses date text. Only the calls the app needs; each one is a single request.
 */
const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const id = (s: string) => encodeURIComponent(s);

export interface SheetProps {
  readonly sheetId: number;
  readonly title: string;
  readonly index: number;
}

export interface SpreadsheetMeta {
  readonly spreadsheetId: string;
  readonly title: string;
  readonly timeZone: string;
  readonly locale: string;
  readonly url: string;
  readonly sheets: readonly SheetProps[];
}

interface RawMeta {
  spreadsheetId: string;
  spreadsheetUrl?: string;
  properties?: { title?: string; timeZone?: string; locale?: string };
  sheets?: { properties?: Partial<SheetProps> }[];
}

const toMeta = (r: RawMeta): SpreadsheetMeta => ({
  spreadsheetId: r.spreadsheetId,
  title: r.properties?.title ?? '',
  timeZone: r.properties?.timeZone ?? '',
  locale: r.properties?.locale ?? '',
  url: r.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${r.spreadsheetId}/edit`,
  sheets: (r.sheets ?? []).map((s) => ({
    sheetId: s.properties?.sheetId ?? 0,
    title: s.properties?.title ?? '',
    index: s.properties?.index ?? 0,
  })),
});

const META_FIELDS = 'spreadsheetId,spreadsheetUrl,properties(title,timeZone,locale),sheets(properties(sheetId,title,index))';

export async function getSpreadsheetMeta(token: string, spreadsheetId: string): Promise<SpreadsheetMeta> {
  const raw = await googleFetch<RawMeta>(`${BASE}/${id(spreadsheetId)}?fields=${encodeURIComponent(META_FIELDS)}`, token);
  return toMeta(raw);
}

/** Raw cell values (numbers stay numbers, dates are serials). Trailing empty cells are left out by Google. */
export async function getValues(token: string, spreadsheetId: string, a1Range: string): Promise<unknown[][]> {
  const q = 'valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=ROWS';
  const res = await googleFetch<{ values?: unknown[][] }>(`${BASE}/${id(spreadsheetId)}/values/${encodeURIComponent(a1Range)}?${q}`, token);
  return res.values ?? [];
}

/** New spreadsheet in the user's Drive, with its time zone set before any formula runs. */
export async function createSpreadsheet(token: string, title: string, timeZone: string, locale: string): Promise<SpreadsheetMeta> {
  const raw = await googleFetch<RawMeta>(`${BASE}?fields=${encodeURIComponent(META_FIELDS)}`, token, {
    method: 'POST',
    body: { properties: { title, timeZone, locale } },
    retries: 0, // never create two files because a retry raced a slow first attempt
  });
  return toMeta(raw);
}

/** Copies one tab (with its formulas and formats) into another spreadsheet. Returns the new tab. */
export async function copySheetTo(token: string, fromSpreadsheetId: string, sheetId: number, toSpreadsheetId: string): Promise<SheetProps> {
  const raw = await googleFetch<Partial<SheetProps>>(`${BASE}/${id(fromSpreadsheetId)}/sheets/${sheetId}:copyTo`, token, {
    method: 'POST',
    body: { destinationSpreadsheetId: toSpreadsheetId },
  });
  return { sheetId: raw.sheetId ?? 0, title: raw.title ?? '', index: raw.index ?? 0 };
}

/** Applies all requests in order, as one change. */
export async function batchUpdate(token: string, spreadsheetId: string, requests: readonly object[]): Promise<void> {
  if (!requests.length) return;
  await googleFetch<unknown>(`${BASE}/${id(spreadsheetId)}:batchUpdate`, token, {
    method: 'POST',
    body: { requests, includeSpreadsheetInResponse: false },
  });
}

/** Links that download a spreadsheet straight from Google (the browser is already signed in). */
export function exportLinks(spreadsheetId: string, sheetId: number) {
  const base = `https://docs.google.com/spreadsheets/d/${id(spreadsheetId)}/export`;
  return {
    xlsx: `${base}?format=xlsx`,
    pdf: `${base}?format=pdf&gid=${sheetId}&portrait=false&fitw=true&gridlines=false`,
    csv: `${base}?format=csv&gid=${sheetId}`,
  };
}
