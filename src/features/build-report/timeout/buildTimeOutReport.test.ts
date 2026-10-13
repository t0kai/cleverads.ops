import { afterEach, describe, expect, it, vi } from 'vitest';
import { TIMEOUT_DEFAULTS, calculateTimeOut, timeOutModule } from '@/advertisers/timeout';
import { readDv360Csv } from '@/engine/csv/dv360';
import { serialFromYmd } from '@/engine/dates/serial';
import { ValidationError } from '@/shared/errors';
import { loadRunner } from '../runners';
import { buildTimeOutReport } from './buildTimeOutReport';
import { GRID_COLUMNS, buildTimeOutRequests, settingsRows } from './sheetRequests';
import { findTimeOutColumns, parseTimeOutTargets } from './trackerTargets';

const ZONES = { trackerTimeZone: 'Australia/Sydney', reportTimeZone: 'Asia/Dhaka' };
// The TimeOut tab as Google returns it from A1: notes in rows 1–4, header in row 5. Campaign names are made up.
const TAB = [
  ['Dashboard:', 'https://example.invalid', '', 'CPCV: $0.2', 'CPC: $0.3'],
  ['Campaign Built Request Form:'],
  [],
  ['', '', '', '', 'CAMPAIGN INFO'],
  ['Client', 'IO NUMBER', 'Campaign name', 'Region', 'Start date', 'End date', 'Impressions', 'Clicks/View Target', 'Budget', 'Inventory cost'],
  ['TimeOut', '', 'Harbour Gin | Launch GC', 'AUS', serialFromYmd(2026, 10, 2), serialFromYmd(2026, 10, 31), '', 3000],
  ['TimeOut', '', 'Coastal Stage | The Show STC', 'AUS', '02/10/2026', '27/10/2026', '', '6,900'],
  ['TimeOut', '', '', 'AUS'],
];

// Same shape as the DV360 insertion-order download (quoted, "18,716", "A$24.26"), made-up names.
const CSV = [
  'Entity Type,Campaign ID,Insertion Order ID,Line Item ID,Ad Group ID,Creative ID,Name,Status,Type,Budget,Pacing,Bid Strategy,Frequency Cap,Impressions,Clicks,Conversions,Revenue,Objective,Goal,CPM,CTR,CPC,CPA',
  '"Insertion Order","1","11","-","-","-","Harbour Gin | Launch GC 2nd IO","Active","Standard","300,000 impr.","$0.00/day Even","-","Show 5 times every 1 days","18,716","124","0","A$24.26","Click","0.01% CTR","A$1.30","0.663%","A$0.20","A$0.00"',
  '"Insertion Order","1","12","-","-","-","Harbour Gin | Launch GC 2nd IO 3rd","Active","Standard","300,000 impr.","$0.00/day Even","-","Show 10 times every 1 days","1,593","21","0","A$1.85","Click","0.01% CTR","A$1.16","1.318%","A$0.09","A$0.00"',
  '"Insertion Order","1","13","-","-","-","Harbour Gin | Launch GC IO","Active","Standard","300,000 impr.","$0.00/day Even","-","Show 5 times every 1 days","17,417","136","0","A$21.73","Click","0.01% CTR","A$1.25","0.781%","A$0.16","A$0.00"',
  '"Insertion Order","2","21","-","-","-","Coastal Stage | The Show STC 2nd IO","Active","Standard","690,000 impr.","$0.01/day Even","-","Show 5 times every 1 days","36,243","341","0","A$42.39","Click","0.01% CTR","A$1.17","0.941%","A$0.12","A$0.00"',
  '"Insertion Order","2","22","-","-","-","Coastal Stage | The Show STC 2nd IO 3rd","Active","Standard","690,000 impr.","$0.01/day Even","-","Show 10 times every 1 days","2,990","27","0","A$3.29","Click","0.01% CTR","A$1.10","0.903%","A$0.12","A$0.00"',
  '"Insertion Order","2","23","-","-","-","Coastal Stage | The Show STC IO","Active","Standard","690,000 impr.","$0.01/day Even","-","Show 5 times every 1 days","30,983","171","0","A$36.00","Click","0.01% CTR","A$1.16","0.552%","A$0.21","A$0.00"',
].join('\n');

describe('TimeOut tracker tab', () => {
  it('finds "Clicks/View Target" by name', () => {
    expect(findTimeOutColumns(TAB[4] ?? [])).toEqual({ name: 2, start: 4, end: 5, clicks: 7 });
  });
  it('says which column is missing', () => {
    expect(() => findTimeOutColumns(['Campaign name', 'Start date', 'End date'])).toThrow(ValidationError);
  });
  it('reads from the header row down, with number and text dates', () => {
    const t = parseTimeOutTargets(TAB, 5, ZONES);
    expect(t.size).toBe(2);
    expect(t.get('harbour gin | launch gc')?.clicks).toBe(3000);
    expect(t.get('coastal stage | the show stc')?.clicks).toBe(6900);
    expect(t.get('coastal stage | the show stc')?.start).toBeCloseTo(serialFromYmd(2026, 10, 2) - 4 / 24, 9);
  });
  it('explains an empty header row', () => {
    expect(() => parseTimeOutTargets([[]], 5, ZONES)).toThrow(ValidationError);
  });
});

describe('a real-shaped Time Out export', () => {
  const { rows } = readDv360Csv(CSV);
  const targets = parseTimeOutTargets(TAB, 5, ZONES);
  const r = calculateTimeOut({ rows, targets, today: serialFromYmd(2026, 10, 12) }, TIMEOUT_DEFAULTS);

  it('makes two campaigns of three IOs each, main → 2nd → 3rd', () => {
    expect(r.groups.map((g) => g.rows.map((x) => x.name))).toEqual([
      ['Harbour Gin | Launch GC', 'Harbour Gin | Launch GC 2nd', 'Harbour Gin | Launch GC 2nd 3rd'],
      ['Coastal Stage | The Show STC', 'Coastal Stage | The Show STC 2nd', 'Coastal Stage | The Show STC 2nd 3rd'],
    ]);
    expect(r.warnings).toEqual([]);
  });
  it('bills the target at A$0.30, one target per campaign, health on every IO', () => {
    const [gin, stage] = r.groups;
    expect(gin?.head.budget).toBe(900);
    expect(stage?.head.budget).toBeCloseTo(2070, 9);
    expect(gin?.rows[2]?.requiredClicks).toBe(3000 - 136 - 124 - 21); // Total Clicks − all three IOs
    expect(gin?.rows[0]?.requiredClicks).toBeNull(); // what is still needed shows on the last IO only
    expect(gin?.rows[0]?.health).toBe(gin?.rows[2]?.health); // campaign health on every IO
    expect(gin?.head.overallMargin).not.toBeNull();
    expect(stage?.rows[2]?.requiredClicks).toBe(6900 - 171 - 341 - 27);
  });
});

describe('Settings tab', () => {
  it('records that every campaign is CPC for now', () => {
    const text = settingsRows(TIMEOUT_DEFAULTS, 'TimeOut').flat().join(' ');
    expect(text).toContain('CPC for every campaign for now');
    expect(text).toContain('A$0.30');
    expect(text).toContain('A$1.50 per 1,000 impressions');
    expect(text).toContain('1.5%–3%');
  });
});

/**
 * Google rejects any cell or range outside a tab's grid. New tabs start at 26 columns × 1000 rows unless the
 * request says otherwise. This replays the requests in order with those rules.
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
    for (const rg of [r.repeatCell?.range, ...(r.addConditionalFormatRule?.rule.ranges ?? [])].filter(Boolean)) need(rg.sheetId, rg.endColumnIndex ?? 0, rg.endRowIndex ?? 0, `request ${i} range`);
    const dim = r.updateDimensionProperties?.range;
    if (dim) need(dim.sheetId, dim.dimension === 'COLUMNS' ? dim.endIndex : 0, dim.dimension === 'ROWS' ? dim.endIndex : 0, `request ${i} dimension`);
  });
  return problems;
}

describe('every write fits inside the tabs', () => {
  const { rows } = readDv360Csv(CSV);
  const result = calculateTimeOut({ rows, targets: parseTimeOutTargets(TAB, 5, ZONES), today: serialFromYmd(2026, 10, 25) }, TIMEOUT_DEFAULTS);
  const requests = buildTimeOutRequests({
    ids: { report: 0, urgent: 3001, margin: 3002, settings: 3003 },
    spec: timeOutModule.buildSheetSpec(result, TIMEOUT_DEFAULTS),
    result,
    config: TIMEOUT_DEFAULTS,
    trackerTab: 'TimeOut',
    lastUpdated: '25 Oct 2026 10:00 AM',
  }) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('has rows on every tab, so each is checked', () => {
    expect(result.urgent.length).toBeGreaterThan(0);
    expect(result.marginIssues.length).toBeGreaterThan(0);
    expect(GRID_COLUMNS).toBeGreaterThanOrEqual(28);
  });
  it('never writes outside a tab', () => {
    expect(checkGrid(requests)).toEqual([]);
  });
});

describe('buildTimeOutReport against a fake Google', () => {
  afterEach(() => vi.unstubAllGlobals());

  const sources = { trackerId: 'TRACKER', trackerTab: 'TimeOut', trackerHeaderRow: 5, outputFolderId: 'FOLDER', reportPrefix: 'Time Out Optimization Report - ' };

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
        if (u.pathname === '/v4/spreadsheets/TRACKER') return json(200, { spreadsheetId: 'TRACKER', properties: { timeZone: 'Australia/Sydney' }, sheets: [{ properties: { sheetId: 9, title: 'TimeOut' } }] });
        if (u.pathname.startsWith('/v4/spreadsheets/TRACKER/values/')) return json(200, { values: TAB });
        if (u.pathname === '/v4/spreadsheets' && method === 'POST') return json(200, { spreadsheetId: 'NEW', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/NEW/edit', properties: body.properties, sheets: [{ properties: { sheetId: 0, title: 'Sheet1', index: 0 } }] });
        if (u.pathname === '/drive/v3/files/NEW' && method === 'GET') return json(200, { parents: ['ROOT'] });
        if (u.pathname === '/drive/v3/files/NEW' && method === 'PATCH') return json(200, { id: 'NEW' });
        if (u.pathname === '/v4/spreadsheets/NEW:batchUpdate') return json(200, { replies: [] });
        return json(500, { error: 'unexpected ' + method + ' ' + url });
      }),
    );
    return calls;
  }

  it('reads the whole TimeOut tab only, then creates and fills the report', async () => {
    const calls = fakeGoogle();
    const steps: string[] = [];
    const res = await buildTimeOutReport({
      token: 't',
      rows: readDv360Csv(CSV).rows,
      sources,
      config: TIMEOUT_DEFAULTS,
      reportTimeZone: 'Asia/Dhaka',
      now: new Date('2026-10-12T04:00:00Z'),
      onStep: (s) => steps.push(s),
    });
    expect(steps).toEqual(['targets', 'calculate', 'create', 'write']);
    expect(res).toMatchObject({ name: 'Time Out Optimization Report - 2026-10-12', inResultsFolder: true, ioCount: 6, breakdown: '2 campaigns · all counted as CPC for now' });

    const trackerCalls = calls.filter((c) => c.url.includes('/TRACKER'));
    expect(trackerCalls.every((c) => c.method === 'GET')).toBe(true);
    expect(decodeURIComponent(trackerCalls[1]?.url ?? '')).toMatch(/\/values\/'TimeOut'\?/);

    const batch = calls.find((c) => c.url.endsWith('NEW:batchUpdate'))?.body as { requests: Record<string, any>[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(checkGrid(batch.requests)).toEqual([]);
    const titles = batch.requests.flatMap((r) => [r.addSheet?.properties.title, r.updateSheetProperties?.properties.title]).filter(Boolean);
    expect(titles).toEqual(['Report', 'Urgent', 'Margin Issue', 'Settings']);
  });

  it('names the tracker when there is no access to it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    await expect(buildTimeOutReport({ token: 't', rows: readDv360Csv(CSV).rows, sources, config: TIMEOUT_DEFAULTS, reportTimeZone: 'Asia/Dhaka' })).rejects.toMatchObject({
      kind: 'access',
      userMessage: 'No access to the Campaign Tracker.',
    });
  });
});

describe('upload check on the report page', () => {
  it('uses the Time Out naming rule, so "2nd IO 3rd" is not a lone 2nd IO', async () => {
    const runner = await loadRunner('timeout');
    const info = runner?.groupCheck?.(readDv360Csv(CSV).rows);
    expect(info).toEqual({ campaignsWithFollowOn: 2, orphanFollowOns: [] });
  });
  it('other advertisers keep the general check', async () => {
    expect((await loadRunner('acm'))?.groupCheck).toBeUndefined();
    expect((await loadRunner('pinstripe'))?.groupCheck).toBeUndefined();
  });
});
