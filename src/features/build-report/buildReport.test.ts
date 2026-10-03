import { afterEach, describe, expect, it, vi } from 'vitest';
import { acmModule } from '@/advertisers/acm';
import { serialFromYmd } from '@/engine/dates/serial';
import { ValidationError } from '@/shared/errors';
import { buildReportRequests, formatLastUpdated, isoDay, toCellData } from './acmSheetRequests';
import { buildAcmReport } from './buildAcmReport';
import { findTargetColumns, parseTargets } from './targets';

const ZONES = { trackerTimeZone: 'Australia/Sydney', reportTimeZone: 'Asia/Dhaka' };
const HEADER = ['Client', 'IO NUMBER', 'Campaign name', 'Region', 'Campaign Type', 'Start date', 'End date', 'Impressions', 'Clicks Target'];

describe('Campaign Tracker targets', () => {
  it('finds the columns by name, like the Apps Script', () => {
    expect(findTargetColumns(HEADER)).toEqual({ name: 2, start: 5, end: 6, clicks: 8 });
    expect(findTargetColumns(['  CAMPAIGN NAME ', 'start date', 'End Date', 'Clicks target'])).toEqual({ name: 0, start: 1, end: 2, clicks: 3 });
  });

  it('says which column is missing', () => {
    expect(() => findTargetColumns(['Campaign name', 'Start date', 'End date'])).toThrow(ValidationError);
    try {
      findTargetColumns(['Campaign name', 'Start']);
    } catch (e) {
      expect((e as ValidationError).issues[0]).toContain('"start date", "end date", "clicks target"');
    }
  });

  it('moves Sydney dates into the Dhaka report like Apps Script (5 Sep → 4 Sep 20:00)', () => {
    const sep5 = serialFromYmd(2026, 9, 5);
    const oct23 = serialFromYmd(2026, 10, 23);
    const { targets } = parseTargets(
      [
        HEADER,
        ['ACM', '', 'Campaign 01 IO - 9000001', 'AU', 'Branded', sep5, oct23, 15000, 250],
        ['ACM', '', '', 'AU'], // no name: skipped
        ['ACM', '', 'Campaign 02 - 9000002', 'AU', 'Branded', '24/09/2026', '', 1, '1,100'],
        ['ACM', '', 'Campaign 03 - 9000003', 'AU', 'Branded', '', '', 0, 0],
      ],
      ZONES,
    );
    expect(targets.size).toBe(3);
    const c1 = targets.get('campaign 01 - 9000001');
    expect(c1?.start).toBeCloseTo(sep5 - 4 / 24, 9);
    expect(c1?.end).toBeCloseTo(oct23 - 5 / 24, 9);
    expect(c1?.clicks).toBe(250);
    const c2 = targets.get('campaign 02 - 9000002');
    expect(c2?.start).toBeCloseTo(serialFromYmd(2026, 9, 24) - 4 / 24, 9);
    expect(c2?.end).toBeNull();
    expect(c2?.clicks).toBe(1100);
    expect(targets.get('campaign 03 - 9000003')).toEqual({ start: null, end: null, clicks: null });
  });

  it('lets a later row with the same name win', () => {
    const { targets } = parseTargets([HEADER, ['', '', 'Same', '', '', '', '', '', 100], ['', '', 'same', '', '', '', '', '', 200]], ZONES);
    expect(targets.get('same')?.clicks).toBe(200);
  });
});

describe('report sheet requests', () => {
  const header = 'Campaign name,Impressions,Clicks,Revenue (Adv Currency)\n';
  const csv =
    header +
    'Alpha - 1,10000,100,10\n' +
    'Alpha - 1 2nd,5000,40,5\n' +
    'Beta - 2,2000,10,3\n';
  const config = acmModule.parseConfig({});
  const today = serialFromYmd(2026, 10, 3);
  const targets = new Map([
    ['alpha - 1', { start: serialFromYmd(2026, 9, 20), end: serialFromYmd(2026, 10, 10), clicks: 500 }],
    ['beta - 2', { start: serialFromYmd(2026, 9, 1), end: serialFromYmd(2026, 11, 30), clicks: 100 }],
  ]);
  const rows = csv
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => {
      const [name, imps, clicks, cost] = l.split(',');
      return { name: name ?? '', impressions: Number(imps), clicks: Number(clicks), cost: Number(cost), objective: '', status: '' };
    });
  const result = acmModule.calculate({ rows, targets, today }, config);
  const spec = acmModule.buildSheetSpec(result, config);
  const ids = { report: 0, urgent: 1001, margin: 1002, formula: 77 };
  const requests = buildReportRequests({ ids, spec, result, config, lastUpdated: '03 Oct 2026 04:05 PM' }) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('orders the tabs Report, Urgent, Margin Issue, Formula', () => {
    expect(requests[0]?.updateSheetProperties.properties).toMatchObject({ sheetId: 0, title: 'Report', index: 0 });
    expect(requests[1]?.addSheet.properties).toMatchObject({ sheetId: 1001, title: 'Urgent', index: 1 });
    expect(requests[2]?.addSheet.properties).toMatchObject({ sheetId: 1002, title: 'Margin Issue', index: 2 });
    expect(requests[3]?.updateSheetProperties.properties).toMatchObject({ sheetId: 77, title: 'Formula', index: 3 });
  });

  it('writes values as values, formulas as formulas, blanks as blanks', () => {
    expect(toCellData(12.5)).toEqual({ userEnteredValue: { numberValue: 12.5 } });
    expect(toCellData('=A1+1')).toEqual({ userEnteredValue: { formulaValue: '=A1+1' } });
    expect(toCellData('▶ Running with 2nd')).toEqual({ userEnteredValue: { stringValue: '▶ Running with 2nd' } });
    expect(toCellData(null)).toEqual({});
    expect(toCellData(Number.NaN)).toEqual({});
  });

  it('puts every Report row in place with the main IO stopped and the 2nd taking over', () => {
    const data = requests.find((r) => r.updateCells?.start.sheetId === 0 && r.updateCells.start.rowIndex === 1 && r.updateCells.start.columnIndex === 0);
    const out = data?.updateCells.rows as { values: { userEnteredValue?: Record<string, unknown> }[] }[];
    expect(out).toHaveLength(3);
    expect(out[0]?.values).toHaveLength(26);
    expect(out[0]?.values[0]?.userEnteredValue).toEqual({ stringValue: 'Alpha - 1' });
    expect(out[0]?.values[6]?.userEnteredValue).toEqual({ numberValue: 0 }); // G: main stopped
    expect(out[0]?.values[17]?.userEnteredValue).toEqual({ stringValue: '▶ Running with 2nd' });
    expect(out[1]?.values[4]?.userEnteredValue).toEqual({ formulaValue: '=MAX(E2-F2,0)' }); // 2nd target
    expect(out[1]?.values[25]?.userEnteredValue).toEqual({ stringValue: 'alpha - 1' }); // hidden group key
  });

  it('greys rows with "Running with" and hides the group key column', () => {
    const grey = requests.filter((r) => r.addConditionalFormatRule?.rule.booleanRule.format.textFormat);
    expect(grey).toHaveLength(3); // Report, Urgent, Margin Issue
    expect(grey[0]?.addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue).toBe('=ISNUMBER(SEARCH("Running with",$R2))');
    expect(requests.some((r) => r.updateDimensionProperties?.range.startIndex === 25 && r.updateDimensionProperties.properties.hiddenByUser)).toBe(true);
  });

  it('fills Urgent with values and writes "No campaigns match." on an empty tab', () => {
    const urgentRows = requests.find((r) => r.updateCells?.start.sheetId === 1001)?.updateCells.rows;
    expect(urgentRows).toHaveLength(2); // Alpha ends in 7 days: main + 2nd
    expect(urgentRows[0].values[17]).toEqual({ userEnteredValue: { stringValue: '▶ Running with 2nd' } });
    const marginRows = requests.find((r) => r.updateCells?.start.sheetId === 1002)?.updateCells.rows;
    expect(result.marginIssues.length ? marginRows.length : marginRows[0].values[0]).toEqual(
      result.marginIssues.length ? result.marginIssues.reduce((n, g) => n + g.rows.length, 0) : { userEnteredValue: { stringValue: 'No campaigns match.' } },
    );
  });

  it('formats the timestamp and file date in Dhaka time', () => {
    const at = new Date('2026-10-03T10:05:00Z');
    expect(formatLastUpdated(at, 'Asia/Dhaka')).toBe('03 Oct 2026 04:05 PM');
    expect(isoDay(new Date('2026-10-02T19:00:00Z'), 'Asia/Dhaka')).toBe('2026-10-03');
  });
});

describe('buildAcmReport against a fake Google', () => {
  afterEach(() => vi.unstubAllGlobals());

  const sources = {
    trackerId: 'TRACKER',
    trackerTab: 'ACM',
    trackerHeaderRow: 5,
    templateId: 'TEMPLATE',
    templateTab: 'Formula',
    outputFolderId: 'FOLDER',
    reportPrefix: 'ACM Optimization Report - ',
  };
  const rows = [
    { name: 'Alpha - 1', impressions: 10000, clicks: 100, cost: 10, objective: '', status: '' },
    { name: 'Alpha - 1 2nd', impressions: 5000, clicks: 40, cost: 5, objective: '', status: '' },
  ];

  function fakeGoogle(opts: { folderDenied?: boolean } = {}) {
    const calls: { method: string; url: string; body: unknown }[] = [];
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      const u = new URL(url);
      if (u.pathname === '/v4/spreadsheets/TRACKER') return json(200, { spreadsheetId: 'TRACKER', properties: { timeZone: 'Australia/Sydney' }, sheets: [{ properties: { sheetId: 5, title: 'ACM' } }] });
      if (u.pathname.startsWith('/v4/spreadsheets/TRACKER/values/')) {
        return json(200, { values: [HEADER, ['ACM', '', 'Alpha - 1', 'AU', 'B', serialFromYmd(2026, 9, 20), serialFromYmd(2026, 10, 10), 1, 500]] });
      }
      if (u.pathname === '/v4/spreadsheets/TEMPLATE') return json(200, { spreadsheetId: 'TEMPLATE', properties: {}, sheets: [{ properties: { sheetId: 9, title: 'Formula' } }] });
      if (u.pathname === '/v4/spreadsheets' && method === 'POST') return json(200, { spreadsheetId: 'NEW', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/NEW/edit', properties: body.properties, sheets: [{ properties: { sheetId: 0, title: 'Sheet1', index: 0 } }] });
      if (u.pathname === '/v4/spreadsheets/TEMPLATE/sheets/9:copyTo') return json(200, { sheetId: 555, title: 'Copy of Formula', index: 1 });
      if (u.pathname === '/drive/v3/files/NEW' && method === 'GET') return json(200, { parents: ['ROOT'] });
      if (u.pathname === '/drive/v3/files/NEW' && method === 'PATCH') return opts.folderDenied ? json(403, { error: { code: 403 } }) : json(200, { id: 'NEW' });
      if (u.pathname === '/v4/spreadsheets/NEW:batchUpdate') return json(200, { replies: [] });
      return json(500, { error: 'unexpected ' + method + ' ' + url });
    });
    vi.stubGlobal('fetch', fetchMock);
    return calls;
  }

  it('reads, calculates, then creates and fills the report in the Results folder', async () => {
    const calls = fakeGoogle();
    const steps: string[] = [];
    const res = await buildAcmReport({
      token: 't',
      rows,
      sources,
      config: acmModule.parseConfig({}),
      reportTimeZone: 'Asia/Dhaka',
      now: new Date('2026-10-03T10:05:00Z'),
      onStep: (s) => steps.push(s),
    });
    expect(steps).toEqual(['targets', 'calculate', 'create', 'write']);
    expect(res).toMatchObject({ spreadsheetId: 'NEW', name: 'ACM Optimization Report - 2026-10-03', inResultsFolder: true, ioCount: 2 });
    expect(res.downloads.xlsx).toBe('https://docs.google.com/spreadsheets/d/NEW/export?format=xlsx');

    const create = calls.find((c) => c.method === 'POST' && c.url.startsWith('https://sheets.googleapis.com/v4/spreadsheets?'));
    expect(create?.body).toEqual({ properties: { title: 'ACM Optimization Report - 2026-10-03', timeZone: 'Asia/Dhaka', locale: 'en_GB' } });
    const move = calls.find((c) => c.method === 'PATCH');
    expect(move?.url).toContain('addParents=FOLDER');
    expect(move?.url).toContain('removeParents=ROOT');
    const tracker = calls.find((c) => c.url.includes('/TRACKER/values/'));
    expect(decodeURIComponent(tracker?.url ?? '')).toContain("'ACM'!A5:AZ");
    expect(tracker?.url).toContain('dateTimeRenderOption=SERIAL_NUMBER');

    // The 2nd IO starts on the main campaign's start date (20 Sep Sydney = 19 Sep 20:00 Dhaka).
    const batch = calls.find((c) => c.url.endsWith('NEW:batchUpdate'))?.body as { requests: Record<string, any>[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const data = batch.requests.find((r) => r.updateCells?.start.sheetId === 0 && r.updateCells.start.rowIndex === 1 && r.updateCells.start.columnIndex === 0);
    const mainStart = data?.updateCells.rows[0].values[1].userEnteredValue.numberValue;
    expect(mainStart).toBeCloseTo(serialFromYmd(2026, 9, 20) - 4 / 24, 9);
    expect(data?.updateCells.rows[1].values[1].userEnteredValue.numberValue).toBe(mainStart);
    // Nothing is created before the tracker has been read.
    expect(calls.findIndex((c) => c.url.includes('/TRACKER/values/'))).toBeLessThan(calls.findIndex((c) => c === create));
  });

  it('keeps the report in My Drive and says so when the Results folder refuses the file', async () => {
    fakeGoogle({ folderDenied: true });
    const res = await buildAcmReport({ token: 't', rows, sources, config: acmModule.parseConfig({}), reportTimeZone: 'Asia/Dhaka', now: new Date('2026-10-03T10:05:00Z') });
    expect(res.inResultsFolder).toBe(false);
  });

  it('names the tracker when there is no access to it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    await expect(buildAcmReport({ token: 't', rows, sources, config: acmModule.parseConfig({}), reportTimeZone: 'Asia/Dhaka' })).rejects.toMatchObject({
      kind: 'access',
      userMessage: 'No access to the Campaign Tracker.',
      resourceUrl: 'https://docs.google.com/spreadsheets/d/TRACKER/edit',
    });
  });
});
