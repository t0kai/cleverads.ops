import { afterEach, describe, expect, it, vi } from 'vitest';
import { UFURNISH_COL, UFURNISH_DEFAULTS, calculateUfurnish, ufurnishModule } from '@/advertisers/ufurnish';
import { serialFromYmd } from '@/engine/dates/serial';
import { ValidationError } from '@/shared/errors';
import { loadRunner } from '../runners';
import { buildUfurnishReport } from './buildUfurnishReport';
import { GRID_COLUMNS, buildUfurnishRequests, settingsRows } from './sheetRequests';
import { findUfurnishColumns, parseUfurnishTargets } from './trackerTargets';

const ZONES = { trackerTimeZone: 'Australia/Sydney', reportTimeZone: 'Australia/Sydney' };
// The Ufurnish tab's real header row (row 5); campaign names below are made up.
const HEADER = [
  'Client', 'IO NUMBER', 'Campaign name', 'Advertiser Name', 'Start date', 'End date', 'Buying Type', 'Impressions', 'Clicks / Views Target',
  'Budget (GBP)', 'Budget (AUD)', 'Inventory cost', 'FS Service fee', 'Nova fee', 'Net profit', 'Margin %', '', 'Client Invoiced/Paid',
];
const trackerRow = (name: string, type: string, tgt: unknown, start: unknown, end: unknown, gbp: unknown, aud: unknown) =>
  ['Ufurnish', '', name, 'Made Up Co', start, end, type, '', tgt, gbp, aud, '', '', '', '', ''];

describe('Ufurnish tracker tab', () => {
  it('finds every column by name', () => {
    expect(findUfurnishColumns(HEADER)).toEqual({ name: 2, type: 6, target: 8, start: 4, end: 5, budgetGbp: 9, budgetAud: 10 });
  });

  it('says which column is missing', () => {
    try {
      findUfurnishColumns(['Campaign name', 'Buying Type', 'Clicks / Views Target', 'Start date', 'End date']);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).issues[0]).toContain('"budget (gbp)", "budget (aud)"');
    }
  });

  it('reads text dates, "£" amounts with commas and the A$ budget', () => {
    const t = parseUfurnishTargets(
      [
        HEADER,
        trackerRow('Harbour Sofa Q4 2026', 'CPC', '2,174', '15/10/2026', '31/10/2026', '£500.02', 948.837952),
        trackerRow('Home Tour video', 'CPCV', 12500, serialFromYmd(2026, 10, 15), serialFromYmd(2026, 10, 19), 500, '948.80'),
        trackerRow('', 'CPC', 1, '', '', '', ''),
      ],
      ZONES,
    );
    expect(t.size).toBe(2);
    expect(t.get('harbour sofa q4 2026')).toEqual({ start: serialFromYmd(2026, 10, 15), end: serialFromYmd(2026, 10, 31), target: 2174, budgetGbp: 500.02, budgetAud: 948.837952, buyingType: 'CPC' });
    expect(t.get('home tour video')).toMatchObject({ target: 12500, budgetAud: 948.8, buyingType: 'CPCV' });
  });
});

describe('Settings tab', () => {
  it('lists the rates the report used', () => {
    const text = settingsRows(UFURNISH_DEFAULTS, 'Ufurnish').flat().join(' ');
    expect(text).toContain('£0.23 per click');
    expect(text).toContain('£0.04 per view');
    expect(text).toContain('Budget (AUD) from the Campaign Tracker');
    expect(text).toContain('1%–4%');
    expect(text).toContain('6 days');
  });
});

describe('upload check', () => {
  it('counts "IO 2", "IO 3" as follow-on IOs, with no orphans', async () => {
    const runner = await loadRunner('ufurnish');
    const rows = ['Harbour Sofa Q4 2026', 'Harbour Sofa Q4 2026 2', 'Harbour Sofa Q4 2026 3', 'Bay Rugs Q4 2026'].map((name) => ({ name, clicks: 0, impressions: 0, cost: 0, objective: '', status: '' }));
    expect(runner?.groupCheck?.(rows)).toEqual({ campaignsWithFollowOn: 1, orphanFollowOns: [] });
    expect(runner?.rates.find((r) => r.label === 'Client CPC')?.value).toBe('£0.23');
    expect(runner?.urgentDays).toBe(6);
  });
});

describe('buildUfurnishReport against a fake Google', () => {
  afterEach(() => vi.unstubAllGlobals());

  const sources = { trackerId: 'TRACKER', trackerTab: 'Ufurnish', trackerHeaderRow: 5, outputFolderId: 'FOLDER', reportPrefix: 'Ufurnish Optimization Report - ' };
  const rows = [
    { name: 'Harbour Sofa Q4 2026', impressions: 20000, clicks: 200, cost: 20, objective: '', status: '' },
    { name: 'Harbour Sofa Q4 2026 2', impressions: 5000, clicks: 50, cost: 6, objective: '', status: '' },
    { name: 'Home Tour video', impressions: 8000, clicks: 10, cost: 12, objective: '', status: '' },
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
          return json(200, {
            values: [
              HEADER,
              trackerRow('Harbour Sofa Q4 2026', 'CPC', 1000, serialFromYmd(2026, 10, 1), serialFromYmd(2026, 10, 30), 230, 436.48),
              trackerRow('Home Tour video', 'CPCV', 12500, serialFromYmd(2026, 10, 1), serialFromYmd(2026, 10, 30), 500, 948.8),
            ],
          });
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

  it('reads the tracker only, then creates and fills the Ufurnish report', async () => {
    const calls = fakeGoogle();
    const steps: string[] = [];
    const res = await buildUfurnishReport({ token: 't', rows, sources, config: UFURNISH_DEFAULTS, reportTimeZone: 'Australia/Sydney', now: new Date('2026-10-22T01:00:00Z'), onStep: (s) => steps.push(s) });
    expect(steps).toEqual(['targets', 'calculate', 'create', 'write']);
    expect(res).toMatchObject({ name: 'Ufurnish Optimization Report - 2026-10-22', inResultsFolder: true, ioCount: 3, breakdown: '1 CPC · 1 CPCV campaigns' });

    // The tracker is only ever read: every call to it is a GET.
    const trackerCalls = calls.filter((c) => c.url.includes('/TRACKER'));
    expect(trackerCalls.length).toBe(2);
    expect(trackerCalls.every((c) => c.method === 'GET')).toBe(true);
    expect(decodeURIComponent(trackerCalls[1]?.url ?? '')).toContain("'Ufurnish'!A5:AZ");

    const batch = calls.find((c) => c.url.endsWith('NEW:batchUpdate'))?.body as { requests: Record<string, any>[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const titles = batch.requests.flatMap((r) => [r.addSheet?.properties.title, r.updateSheetProperties?.properties.title]).filter(Boolean);
    expect(titles).toEqual(['Report', 'Urgent', 'Margin Issue', 'Settings']);
    const data = batch.requests.find((r) => r.updateCells?.start.sheetId === 0 && r.updateCells.start.rowIndex === 1 && r.updateCells.start.columnIndex === 0);
    expect(data?.updateCells.rows).toHaveLength(3);
    expect(data?.updateCells.rows[0].values[UFURNISH_COL.budgetAud].userEnteredValue.numberValue).toBe(436.48);
    expect(data?.updateCells.rows[1].values[UFURNISH_COL.total].userEnteredValue.formulaValue).toBe('=IF($E$2="","",MAX($E$2-SUM($G$2:G2),0))');
    expect(data?.updateCells.rows[2].values[UFURNISH_COL.type].userEnteredValue.stringValue).toBe('CPCV');
  });

  it('names the tracker when there is no access to it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    await expect(buildUfurnishReport({ token: 't', rows, sources, config: UFURNISH_DEFAULTS, reportTimeZone: 'Australia/Sydney' })).rejects.toMatchObject({
      kind: 'access',
      userMessage: 'No access to the Campaign Tracker.',
    });
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
  const day = (d: number) => serialFromYmd(2026, 10, d);
  const io = (name: string, clicks: number, impressions: number, cost: number) => ({ name, clicks, impressions, cost, objective: '', status: '' });
  const result = calculateUfurnish(
    {
      today: day(26),
      rows: [io('Harbour Sofa Q4 2026', 200, 20000, 300), io('Harbour Sofa Q4 2026 2', 50, 5000, 90), io('Home Tour video', 10, 8000, 12)],
      targets: new Map([
        ['harbour sofa q4 2026', { start: day(1), end: day(30), target: 1000, budgetGbp: 230, budgetAud: 436.48, buyingType: 'CPC' as const }],
        ['home tour video', { start: day(1), end: day(30), target: 12500, budgetGbp: 500, budgetAud: 948.8, buyingType: 'CPCV' as const }],
      ]),
    },
    UFURNISH_DEFAULTS,
  );
  const requests = buildUfurnishRequests({
    ids: { report: 0, urgent: 5001, margin: 5002, settings: 5003 },
    spec: ufurnishModule.buildSheetSpec(result, UFURNISH_DEFAULTS),
    result,
    config: UFURNISH_DEFAULTS,
    trackerTab: 'Ufurnish',
    lastUpdated: '22 Oct 2026 12:00 PM',
  }) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('has urgent and margin rows to write (so those tabs are checked too)', () => {
    expect(result.urgent.length).toBeGreaterThan(0);
    expect(result.marginIssues.length).toBeGreaterThan(0);
    expect(GRID_COLUMNS).toBeGreaterThanOrEqual(31);
  });
  it('never writes outside a tab', () => {
    expect(checkGrid(requests)).toEqual([]);
  });
  it('labels Required "(without extra)", the A$ budget and the four margins with hover notes on every tab', () => {
    const notes = requests.filter((r) => r.updateCells?.start.rowIndex === 0 && r.updateCells.fields === 'userEnteredValue,note');
    const cols = ['required', 'margin', 'projMargin', 'ioMargin', 'overallMargin', 'budgetAud'] as const;
    for (const sheetId of [0, 5001, 5002]) {
      const here = notes.filter((r) => r.updateCells.start.sheetId === sheetId).map((r) => r.updateCells.start.columnIndex);
      expect(here.sort((a: number, b: number) => a - b)).toEqual(cols.map((k) => UFURNISH_COL[k]).sort((a, b) => a - b));
    }
    const required = notes.find((r) => r.updateCells.start.sheetId === 0 && r.updateCells.start.columnIndex === UFURNISH_COL.required)?.updateCells.rows[0].values[0];
    expect(required.userEnteredValue).toEqual({ stringValue: 'Required (without extra)' });
    expect(required.note).toContain('Does not include the 10% extra');
  });
});
