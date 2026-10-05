import { afterEach, describe, expect, it, vi } from 'vitest';
import { PINSTRIPE_DEFAULTS } from '@/advertisers/pinstripe';
import { serialFromYmd } from '@/engine/dates/serial';
import { ValidationError } from '@/shared/errors';
import { buildPinstripeReport } from './buildPinstripeReport';
import { settingsRows } from './sheetRequests';
import { findPinstripeColumns, parsePinstripeTargets } from './trackerTargets';

const ZONES = { trackerTimeZone: 'Australia/Sydney', reportTimeZone: 'Asia/Dhaka' };
// The Pinstripe tab's real header row (row 5); campaign names below are made up.
const HEADER = ['Client', 'Campaign Name', 'Advertiser Name', 'Brand (Vertical)', 'Click Target', 'Start Date', 'End Date', 'Budget (AUD)', 'Impressions', 'Inventory cost (AUD)'];

describe('Pinstripe tracker tab', () => {
  it('finds Click Target and Budget (AUD) by name', () => {
    expect(findPinstripeColumns(HEADER)).toEqual({ name: 1, start: 5, end: 6, target: 4, budget: 7 });
    expect(findPinstripeColumns(['campaign name', 'start date', 'end date', 'Clicks Target', 'Budget'])).toEqual({ name: 0, start: 1, end: 2, target: 3, budget: 4 });
  });

  it('says which column is missing', () => {
    try {
      findPinstripeColumns(['Campaign Name', 'Start Date', 'End Date']);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).issues[0]).toContain('"click target", "budget (aud)"');
    }
  });

  it('reads text dates (dd/mm/yyyy and d/m/yyyy), targets and budgets', () => {
    const t = parsePinstripeTargets(
      [
        HEADER,
        ['Pinstripe', 'Harbour Tea - Launch', 'Harbour Tea', 'Startup Daily', 1250, '17/6/2025', '04/07/2025', 500, 103371, 116.65],
        ['Pinstripe', 'Nordic Home - Lights', 'Nordic Home', 'Business Builder', '350,000', serialFromYmd(2025, 7, 3), serialFromYmd(2025, 8, 8), '2,000'],
        ['Pinstripe', '', 'skipped'],
        ['Pinstripe', 'No Numbers Yet', '', '', '', '', '', ''],
      ],
      ZONES,
    );
    expect(t.size).toBe(3);
    const a = t.get('harbour tea - launch');
    expect(a?.target).toBe(1250);
    expect(a?.budget).toBe(500);
    expect(a?.start).toBeCloseTo(serialFromYmd(2025, 6, 17) - 4 / 24, 9); // Sydney → Dhaka, like the ACM report
    const b = t.get('nordic home - lights');
    expect(b).toMatchObject({ target: 350000, budget: 2000 });
    expect(t.get('no numbers yet')).toEqual({ start: null, end: null, target: null, budget: null });
  });
});

describe('Settings tab', () => {
  it('lists the rates the report used', () => {
    const rows = settingsRows(PINSTRIPE_DEFAULTS, 'Private Media Operations (Pinstripe)');
    expect(rows[1]?.[1]).toContain('A$0.40');
    expect(rows.flat().join(' ')).toContain('100,000');
  });
});

describe('buildPinstripeReport against a fake Google', () => {
  afterEach(() => vi.unstubAllGlobals());

  const sources = {
    trackerId: 'TRACKER',
    trackerTab: 'Private Media Operations (Pinstripe)',
    trackerHeaderRow: 5,
    outputFolderId: 'FOLDER',
    reportPrefix: 'Pinstripe Optimization Report - ',
  };
  const rows = [
    { name: 'Harbour Tea - Launch', impressions: 25000, clicks: 400, cost: 30, objective: '', status: '' },
    { name: 'Nordic Home - Lights', impressions: 200000, clicks: 300, cost: 120, objective: '', status: '' },
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
              ['Pinstripe', 'Harbour Tea - Launch', '', '', 1250, serialFromYmd(2026, 10, 1), serialFromYmd(2026, 10, 30), 500],
              ['Pinstripe', 'Nordic Home - Lights', '', '', 350000, serialFromYmd(2026, 10, 1), serialFromYmd(2026, 10, 30), 2000],
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

  it('reads the tracker only, then creates and fills the Pinstripe report', async () => {
    const calls = fakeGoogle();
    const steps: string[] = [];
    const res = await buildPinstripeReport({
      token: 't',
      rows,
      sources,
      config: PINSTRIPE_DEFAULTS,
      reportTimeZone: 'Asia/Dhaka',
      now: new Date('2026-10-11T04:00:00Z'),
      onStep: (s) => steps.push(s),
    });
    expect(steps).toEqual(['targets', 'calculate', 'create', 'write']);
    expect(res).toMatchObject({ name: 'Pinstripe Optimization Report - 2026-10-11', inResultsFolder: true, ioCount: 2, breakdown: '1 click · 1 impression campaigns' });

    // The tracker is only ever read: every call to it is a GET.
    const trackerCalls = calls.filter((c) => c.url.includes('/TRACKER'));
    expect(trackerCalls.length).toBe(2);
    expect(trackerCalls.every((c) => c.method === 'GET')).toBe(true);
    expect(decodeURIComponent(trackerCalls[1]?.url ?? '')).toContain("'Private Media Operations (Pinstripe)'!A5:AZ");

    // No template is copied; the report has its own Settings tab.
    expect(calls.some((c) => c.url.includes(':copyTo'))).toBe(false);
    const batch = calls.find((c) => c.url.endsWith('NEW:batchUpdate'))?.body as { requests: Record<string, any>[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const titles = batch.requests.flatMap((r) => [r.addSheet?.properties.title, r.updateSheetProperties?.properties.title]).filter(Boolean);
    expect(titles).toEqual(['Report', 'Urgent', 'Margin Issue', 'Settings']);

    // Click row budget is a CPC formula; impression row budget is the tracker number.
    const data = batch.requests.find((r) => r.updateCells?.start.sheetId === 0 && r.updateCells.start.rowIndex === 1 && r.updateCells.start.columnIndex === 0);
    expect(data?.updateCells.rows[0].values[16].userEnteredValue.formulaValue).toBe('=IF(E2="","",E2*0.4)');
    expect(data?.updateCells.rows[1].values[1].userEnteredValue.stringValue).toBe('Impressions');
    expect(data?.updateCells.rows[1].values[16].userEnteredValue.numberValue).toBe(2000);
  });

  it('names the tracker when there is no access to it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    await expect(buildPinstripeReport({ token: 't', rows, sources, config: PINSTRIPE_DEFAULTS, reportTimeZone: 'Asia/Dhaka' })).rejects.toMatchObject({
      kind: 'access',
      userMessage: 'No access to the Campaign Tracker.',
    });
  });
});
