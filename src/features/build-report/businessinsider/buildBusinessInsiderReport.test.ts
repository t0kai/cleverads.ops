import { afterEach, describe, expect, it, vi } from 'vitest';
import { BI_COL, BUSINESS_INSIDER_DEFAULTS, calculateBusinessInsider, businessInsiderModule } from '@/advertisers/businessinsider';
import { serialFromYmd } from '@/engine/dates/serial';
import { ValidationError } from '@/shared/errors';
import { loadRunner } from '../runners';
import { buildBusinessInsiderReport } from './buildBusinessInsiderReport';
import { GRID_COLUMNS, buildBusinessInsiderRequests, settingsRows } from './sheetRequests';
import { findBusinessInsiderColumns, parseBusinessInsiderTargets } from './trackerTargets';

const ZONES = { trackerTimeZone: 'Australia/Sydney', reportTimeZone: 'Australia/Sydney' };
// The Business Insider tab's real header row (row 5); campaign names below are made up.
const HEADER = [
  'Client', 'Campaign Name', 'Advertiser Name', 'Brand (Vertical)', 'Click Target', 'Start Date', 'End Date', 'Budget (AUD)', 'Budget - Billing currency(USD)',
  'Impressions', 'Inventory cost (AUD)', 'DV360/FS platform fee (AUD)', 'Nova fee (AUD)', 'Net profit (AUD)', 'Net profit', 'Margin %', 'Buy CPC', 'Conversion Rate (USD - AUD)',
];
const trackerRow = (name: string, tgt: unknown, start: unknown, end: unknown, aud: unknown, bill: unknown, fx: unknown) =>
  ['Business Insider', name, 'Made Up Co', 'Finance', tgt, start, end, aud, bill, '', '', '', '', '', '', '', '', fx];

describe('Business Insider tracker tab', () => {
  it('finds every column by name', () => {
    expect(findBusinessInsiderColumns(HEADER)).toEqual({ name: 1, target: 4, start: 5, end: 6, budgetAud: 7, budgetUsd: 8, fx: 17 });
  });

  it('says which column is missing', () => {
    expect(() => findBusinessInsiderColumns(['Campaign Name', 'Click Target', 'Start Date', 'End Date'])).toThrow(ValidationError);
  });

  it('reads text dates, amounts with commas and symbols, and the rate', () => {
    const t = parseBusinessInsiderTargets(
      [HEADER, trackerRow('Harbour Tea Ascending', '1,000', '17/11/2026', '20/11/2026', '1,234.50', '$636.34', '1.94'), trackerRow('', 1, '', '', '', '', '')],
      ZONES,
    );
    expect(t.size).toBe(1);
    expect([...t.values()][0]).toEqual({ start: serialFromYmd(2026, 11, 17), end: serialFromYmd(2026, 11, 20), target: 1000, budgetAud: 1234.5, budgetUsd: 636.34, fx: 1.94 });
  });
});

describe('Settings tab and upload check', () => {
  it('lists the rates the report used', () => {
    const text = settingsRows(BUSINESS_INSIDER_DEFAULTS, 'Business Insider').flat().join(' ');
    expect(text).toContain('4.0909% of inventory cost');
    expect(text).toContain('0% by default');
    expect(text).toContain('1% and above, below 4%');
    expect(text).toContain('5 days or less');
  });
  it('counts follow-on IOs, with no orphans', async () => {
    const runner = await loadRunner('businessinsider');
    const rows = ['Harbour Tea Ascending IO 1', 'Harbour Tea Ascending 2 IO 1', 'Bay Rugs IO'].map((name) => ({ name, clicks: 0, impressions: 0, cost: 0, objective: '', status: '' }));
    expect(runner?.groupCheck?.(rows)).toEqual({ campaignsWithFollowOn: 1, orphanFollowOns: [] });
    expect(runner?.urgentDays).toBe(5);
  });
});

describe('buildBusinessInsiderReport against a fake Google', () => {
  afterEach(() => vi.unstubAllGlobals());

  const sources = { trackerId: 'TRACKER', trackerTab: 'Business Insider', trackerHeaderRow: 5, outputFolderId: 'FOLDER', reportPrefix: 'Business Insider Optimization Report - ' };
  const rows = [
    { name: 'Harbour Tea Ascending 1', impressions: 10000, clicks: 100, cost: 20, objective: '', status: '' },
    { name: 'Harbour Tea Ascending 2 1', impressions: 5000, clicks: 50, cost: 8, objective: '', status: '' },
  ];

  function fakeGoogle() {
    const calls: { method: string; url: string; body: unknown }[] = [];
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method, url, body });
        const u = new URL(url);
        if (u.pathname === '/v4/spreadsheets/TRACKER') return json(200, { spreadsheetId: 'TRACKER', properties: { timeZone: 'Australia/Sydney' }, sheets: [{ properties: { sheetId: 7, title: sources.trackerTab } }] });
        if (u.pathname.startsWith('/v4/spreadsheets/TRACKER/values/')) {
          return json(200, { values: [HEADER, trackerRow('Harbour Tea Ascending', 1000, serialFromYmd(2026, 11, 1), serialFromYmd(2026, 11, 30), 388, 200, 1.94)] });
        }
        if (u.pathname === '/v4/spreadsheets' && method === 'POST') return json(200, { spreadsheetId: 'NEW', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/NEW/edit', properties: body.properties, sheets: [{ properties: { sheetId: 0, title: 'Sheet1', index: 0 } }] });
        if (u.pathname === '/drive/v3/files/NEW' && method === 'GET') return json(200, { parents: ['ROOT'] });
        if (u.pathname === '/drive/v3/files/NEW' && method === 'PATCH') return json(200, { id: 'NEW' });
        if (u.pathname === '/v4/spreadsheets/NEW:batchUpdate') return json(200, { replies: [] });
        return json(500, { error: 'unexpected ' + method + ' ' + url });
      }),
    );
    return calls;
  }

  it('reads the tracker only, then creates and fills the report', async () => {
    const calls = fakeGoogle();
    const steps: string[] = [];
    const res = await buildBusinessInsiderReport({ token: 't', rows, sources, config: BUSINESS_INSIDER_DEFAULTS, reportTimeZone: 'Australia/Sydney', now: new Date('2026-11-18T01:00:00Z'), onStep: (s) => steps.push(s) });
    expect(steps).toEqual(['targets', 'calculate', 'create', 'write']);
    expect(res).toMatchObject({ name: 'Business Insider Optimization Report - 2026-11-18', inResultsFolder: true, ioCount: 2, breakdown: '1 CPC campaign', warnings: [] });
    const trackerCalls = calls.filter((c) => c.url.includes('/TRACKER'));
    expect(trackerCalls.length).toBe(2);
    expect(trackerCalls.every((c) => c.method === 'GET')).toBe(true); // the tracker is only ever read
    expect(decodeURIComponent(trackerCalls[1]?.url ?? '')).toContain("'Business Insider'!A5:AZ");
    const batch = calls.find((c) => c.url.endsWith('NEW:batchUpdate'))?.body as { requests: Record<string, any>[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const titles = batch.requests.flatMap((r) => [r.addSheet?.properties.title, r.updateSheetProperties?.properties.title]).filter(Boolean);
    expect(titles).toEqual(['Report', 'Urgent', 'Margin Issue', 'Settings']);
    const data = batch.requests.find((r) => r.updateCells?.start.sheetId === 0 && r.updateCells.start.rowIndex === 1 && r.updateCells.start.columnIndex === 0);
    expect(data?.updateCells.rows[0].values[BI_COL.budgetAud].userEnteredValue.numberValue).toBe(388);
    expect(data?.updateCells.rows[0].values[BI_COL.novaShare].userEnteredValue.numberValue).toBe(0);
    expect(data?.updateCells.rows[1].values[BI_COL.total].userEnteredValue.formulaValue).toBe('=IF($D$2="","",MAX($D$2-SUM($F$2:F2),0))');
  });

  it('names the tracker when there is no access to it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    await expect(buildBusinessInsiderReport({ token: 't', rows, sources, config: BUSINESS_INSIDER_DEFAULTS, reportTimeZone: 'Australia/Sydney' })).rejects.toMatchObject({ kind: 'access', userMessage: 'No access to the Campaign Tracker.' });
  });
});

/**
 * Google rejects any cell or range outside a tab's grid. A new spreadsheet's first tab and every added tab
 * start at 26 columns × 1000 rows unless the request says otherwise. This replays the requests in order
 * with those rules, so a layout that grows past column Z fails here instead of in Google.
 */
function checkGrid(requests: Record<string, any>[]): string[] { // eslint-disable-line @typescript-eslint/no-explicit-any
  const grids = new Map<number, { cols: number; rows: number }>([[0, { cols: 26, rows: 1000 }]]);
  const problems: string[] = [];
  const need = (sheetId: number, endCol: number, endRow: number, what: string) => {
    const g = grids.get(sheetId);
    if (!g) return problems.push(`${what}: unknown tab ${sheetId}`);
    if (endCol > g.cols) problems.push(`${what}: column ${endCol} > ${g.cols} on tab ${sheetId}`);
    if (endRow > g.rows) problems.push(`${what}: row ${endRow} > ${g.rows} on tab ${sheetId}`);
  };
  requests.forEach((r, i) => {
    const gp = r.updateSheetProperties?.properties.gridProperties ?? r.addSheet?.properties.gridProperties;
    const id = r.updateSheetProperties?.properties.sheetId ?? r.addSheet?.properties.sheetId;
    if (id != null) {
      const prev = grids.get(id) ?? { cols: 26, rows: 1000 };
      grids.set(id, { cols: gp?.columnCount ?? prev.cols, rows: gp?.rowCount ?? prev.rows });
    }
    if (r.updateCells) {
      const { start, rows } = r.updateCells;
      const width = Math.max(...rows.map((x: { values: unknown[] }) => x.values.length));
      need(start.sheetId, start.columnIndex + width, start.rowIndex + rows.length, `request ${i} updateCells`);
    }
    const ranges = [r.repeatCell?.range, ...(r.addConditionalFormatRule?.rule.ranges ?? [])].filter(Boolean);
    for (const rg of ranges) need(rg.sheetId, rg.endColumnIndex ?? 0, rg.endRowIndex ?? 0, `request ${i} range`);
    const dim = r.updateDimensionProperties?.range;
    if (dim) need(dim.sheetId, dim.dimension === 'COLUMNS' ? dim.endIndex : 0, dim.dimension === 'ROWS' ? dim.endIndex : 0, `request ${i} dimension`);
  });
  return problems;
}

describe('every write fits inside the tabs', () => {
  const day = (d: number) => serialFromYmd(2026, 11, d);
  const result = calculateBusinessInsider(
    {
      today: day(27),
      rows: [
    { name: 'Harbour Tea Ascending 1', impressions: 10000, clicks: 100, cost: 20, objective: '', status: '' },
    { name: 'Harbour Tea Ascending 2 1', impressions: 5000, clicks: 50, cost: 8, objective: '', status: '' },
  ].map((r) => ({ ...r, cost: r.cost * 30 })),
      targets: new Map([['harbour tea ascending', { start: day(1), end: day(30), target: 1000, budgetAud: 388, budgetUsd: 200, fx: 1.94 }]]),
    },
    BUSINESS_INSIDER_DEFAULTS,
  );
  const requests = buildBusinessInsiderRequests({
    ids: { report: 0, urgent: 6001, margin: 6002, settings: 6003 },
    spec: businessInsiderModule.buildSheetSpec(result, BUSINESS_INSIDER_DEFAULTS),
    result,
    config: BUSINESS_INSIDER_DEFAULTS,
    trackerTab: 'Business Insider',
    lastUpdated: '18 Nov 2026 12:00 PM',
  }) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('has urgent and margin rows to write (so those tabs are checked too)', () => {
    expect(result.urgent.length).toBeGreaterThan(0);
    expect(result.marginIssues.length).toBeGreaterThan(0);
    expect(GRID_COLUMNS).toBeGreaterThanOrEqual(34);
  });
  it('never writes outside a tab', () => {
    expect(checkGrid(requests)).toEqual([]);
  });
  it('puts the header notes (Required, Nova %, the margins …) on every tab', () => {
    const notes = requests.filter((r) => r.updateCells?.start.rowIndex === 0 && r.updateCells.fields === 'userEnteredValue,note');
    const cols = ['required', 'novaShare', 'margin', 'projMargin', 'ioMargin', 'overallMargin', 'fs', 'budgetAud'] as const;
    for (const sheetId of [0, 6001, 6002]) {
      const here = notes.filter((r) => r.updateCells.start.sheetId === sheetId).map((r) => r.updateCells.start.columnIndex);
      for (const k of cols) expect(here).toContain(BI_COL[k]);
    }
  });
});
