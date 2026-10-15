import { afterEach, describe, expect, it, vi } from 'vitest';
import { BENZINGA_DEFAULTS, benzingaModule, calculateBenzinga } from '@/advertisers/benzinga';
import { serialFromYmd } from '@/engine/dates/serial';
import { ValidationError } from '@/shared/errors';
import { loadRunner } from '../runners';
import { buildBenzingaReport } from './buildBenzingaReport';
import { GRID_COLUMNS, buildBenzingaRequests, settingsRows } from './sheetRequests';
import { findBenzingaColumns, parseBenzingaTargets } from './trackerTargets';

const ZONES = { trackerTimeZone: 'Australia/Sydney', reportTimeZone: 'Australia/Sydney' };
// The Benzinga (US) tab's real header row (row 5); campaign names below are made up.
const HEADER = [
  'Client', 'Campaign Name', 'Advertiser Name', 'Brand (Vertical)', 'Buying Type', 'View/Click Target', 'Start Date', 'End Date',
  'Budget (AUD)', 'Budget/Billing currency (USD)', 'Impressions', 'Inventory cost (AUD)', 'DV360/FS platform fee (AUD)', 'Nova fee (AUD)',
  'Net profit (AUD)', 'Net profit (USD)', 'Margin %', 'Buy CPC', 'Conversion Rate (USD - AUD)', '', '', '', 'Format Placement', 'Geo', 'Rates',
];
const trackerRow = (name: string, type: string, tgt: unknown, start: unknown, end: unknown, usd: unknown, fx: unknown) =>
  ['Benzinga', name, 'Benzinga', 'Finance', type, tgt, start, end, '', usd, '', '', '', '', '', '', '', '', fx, '', '', '', '', 'US', '$0.35'];

describe('Benzinga (US) tracker tab', () => {
  it('finds every column by name', () => {
    expect(findBenzingaColumns(HEADER)).toEqual({ name: 1, type: 4, target: 5, start: 6, end: 7, budgetUsd: 9, fx: 18 });
  });

  it('says which column is missing', () => {
    try {
      findBenzingaColumns(['Campaign Name', 'Buying Type', 'View/Click Target', 'Start Date', 'End Date']);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).issues[0]).toContain('"budget/billing currency (usd)", "conversion rate (usd - aud)"');
    }
  });

  it('reads text dates, "$" amounts with commas and the rate', () => {
    const t = parseBenzingaTargets(
      [
        HEADER,
        trackerRow('Harbour Display Campaign', 'CPM', '25,334,278', '17/09/2026', '12/12/2026', '$65,869.12', 1.44),
        trackerRow('Harbour Loans', 'CPC', 1000, serialFromYmd(2026, 10, 9), serialFromYmd(2026, 10, 31), 350, '1.42'),
        trackerRow('', 'CPC', 1, '', '', '', ''),
      ],
      ZONES,
    );
    expect(t.size).toBe(2);
    expect(t.get('harbour display campaign')).toEqual({ start: serialFromYmd(2026, 9, 17), end: serialFromYmd(2026, 12, 12), target: 25334278, budgetUsd: 65869.12, fx: 1.44, buyingType: 'CPM' });
    expect(t.get('harbour loans')).toMatchObject({ target: 1000, budgetUsd: 350, fx: 1.42, buyingType: 'CPC' });
  });
});

describe('Settings tab', () => {
  it('lists the rates the report used', () => {
    const text = settingsRows(BENZINGA_DEFAULTS, 'Benzinga (US)').flat().join(' ');
    expect(text).toContain('US$0.35 per click');
    expect(text).toContain('4.0909% of inventory cost (4.5% ÷ 1.1)');
    expect(text).toContain('1.4%–4.5%');
    expect(text).toContain('CPCV');
  });
});

describe('upload check', () => {
  it('counts "#2 … #N" as follow-on IOs, with no orphans', async () => {
    const runner = await loadRunner('benzinga');
    const rows = ['Harbour Display Campaign Regular IO 1', 'Harbour Display Campaign Regular IO 1 #2', 'Harbour Display Campaign Regular IO 1 #3', 'Harbour Loans IO'].map((name) => ({ name, clicks: 0, impressions: 0, cost: 0, objective: '', status: '' }));
    expect(runner?.groupCheck?.(rows)).toEqual({ campaignsWithFollowOn: 1, orphanFollowOns: [] });
    expect(runner?.rates.find((r) => r.label === 'Client CPC')?.value).toBe('US$0.35');
  });
});

describe('buildBenzingaReport against a fake Google', () => {
  afterEach(() => vi.unstubAllGlobals());

  const sources = { trackerId: 'TRACKER', trackerTab: 'Benzinga (US)', trackerHeaderRow: 5, outputFolderId: 'FOLDER', reportPrefix: 'Benzinga Optimization Report - ' };
  const rows = [
    { name: 'Harbour Loans IO', impressions: 10000, clicks: 150, cost: 12, objective: '', status: '' },
    { name: 'Harbour Display Campaign Regular IO 1', impressions: 200000, clicks: 400, cost: 100, objective: '', status: '' },
    { name: 'Harbour Display Campaign Regular IO 1 #2', impressions: 300000, clicks: 600, cost: 150, objective: '', status: '' },
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
              trackerRow('Harbour Loans', 'CPC', 1000, serialFromYmd(2026, 10, 1), serialFromYmd(2026, 10, 30), 350, 1.5),
              trackerRow('Harbour Display Campaign', 'CPM', 1_000_000, serialFromYmd(2026, 10, 1), serialFromYmd(2026, 10, 30), 3000, 1.4),
              trackerRow('Harbour Display Campaign October', 'CPM', 1_000_000, serialFromYmd(2026, 10, 1), serialFromYmd(2026, 11, 29), 2000, 1.5),
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

  it('reads the tracker only, then creates and fills the Benzinga report', async () => {
    const calls = fakeGoogle();
    const steps: string[] = [];
    const res = await buildBenzingaReport({ token: 't', rows, sources, config: BENZINGA_DEFAULTS, reportTimeZone: 'Australia/Sydney', now: new Date('2026-10-15T01:00:00Z'), onStep: (s) => steps.push(s) });
    expect(steps).toEqual(['targets', 'calculate', 'create', 'write']);
    expect(res).toMatchObject({ name: 'Benzinga Optimization Report - 2026-10-15', inResultsFolder: true, ioCount: 3, breakdown: '1 CPC · 1 CPM · 0 CPCV campaigns', warnings: [] });

    // The tracker is only ever read: every call to it is a GET.
    const trackerCalls = calls.filter((c) => c.url.includes('/TRACKER'));
    expect(trackerCalls.length).toBe(2);
    expect(trackerCalls.every((c) => c.method === 'GET')).toBe(true);
    expect(decodeURIComponent(trackerCalls[1]?.url ?? '')).toContain("'Benzinga (US)'!A5:AZ");

    const batch = calls.find((c) => c.url.endsWith('NEW:batchUpdate'))?.body as { requests: Record<string, any>[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const titles = batch.requests.flatMap((r) => [r.addSheet?.properties.title, r.updateSheetProperties?.properties.title]).filter(Boolean);
    expect(titles).toEqual(['Report', 'Urgent', 'Margin Issue', 'Settings']);
    const data = batch.requests.find((r) => r.updateCells?.start.sheetId === 0 && r.updateCells.start.rowIndex === 1 && r.updateCells.start.columnIndex === 0);
    expect(data?.updateCells.rows).toHaveLength(3);
    expect(data?.updateCells.rows[1].values[1].userEnteredValue.stringValue).toBe('CPM');
    expect(data?.updateCells.rows[1].values[4].userEnteredValue.numberValue).toBe(2_000_000); // both month rows
    expect(data?.updateCells.rows[1].values[16].userEnteredValue.numberValue).toBe(5000);
  });

  it('names the tracker when there is no access to it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    await expect(buildBenzingaReport({ token: 't', rows, sources, config: BENZINGA_DEFAULTS, reportTimeZone: 'Australia/Sydney' })).rejects.toMatchObject({
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
  const result = calculateBenzinga(
    {
      today: day(25),
      rows: [io('Harbour Loans IO', 150, 10000, 120), io('Harbour Display Campaign Regular IO 1', 400, 200000, 900), io('Harbour Display Campaign Regular IO 1 #2', 600, 300000, 1500), io('River ETF Views IO', 50, 20000, 40)],
      targets: new Map([
        ['harbour loans', { start: day(1), end: day(30), target: 1000, budgetUsd: 350, fx: 1.5, buyingType: 'CPC' as const }],
        ['harbour display campaign', { start: day(1), end: day(30), target: 1_000_000, budgetUsd: 3000, fx: 1.4, buyingType: 'CPM' as const }],
        ['river etf views', { start: day(1), end: day(30), target: 5000, budgetUsd: 750, fx: 1.45, buyingType: 'CPCV' as const }],
      ]),
    },
    BENZINGA_DEFAULTS,
  );
  const requests = buildBenzingaRequests({
    ids: { report: 0, urgent: 4001, margin: 4002, settings: 4003 },
    spec: benzingaModule.buildSheetSpec(result, BENZINGA_DEFAULTS),
    result,
    config: BENZINGA_DEFAULTS,
    trackerTab: 'Benzinga (US)',
    lastUpdated: '15 Oct 2026 12:00 PM',
  }) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('has urgent and margin rows to write (so those tabs are checked too)', () => {
    expect(result.urgent.length).toBeGreaterThan(0);
    expect(result.marginIssues.length).toBeGreaterThan(0);
    expect(GRID_COLUMNS).toBeGreaterThanOrEqual(33);
  });
  it('never writes outside a tab', () => {
    expect(checkGrid(requests)).toEqual([]);
  });
  it('labels Required "(without extra)", the fee and the rate with hover notes on every tab', () => {
    const notes = requests.filter((r) => r.updateCells?.start.rowIndex === 0 && r.updateCells.fields === 'userEnteredValue,note');
    expect(notes.map((r) => `${r.updateCells.start.sheetId}:${r.updateCells.start.columnIndex}`).sort()).toEqual(
      ['0:14', '0:17', '0:7', '4001:14', '4001:17', '4001:7', '4002:14', '4002:17', '4002:7'],
    );
    const required = notes.find((r) => r.updateCells.start.sheetId === 0 && r.updateCells.start.columnIndex === 7)?.updateCells.rows[0].values[0];
    expect(required.userEnteredValue).toEqual({ stringValue: 'Required (without extra)' });
    expect(required.note).toContain('Does not include the 10% extra');
  });
});
