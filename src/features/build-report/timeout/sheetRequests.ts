import { TIMEOUT_CAMPAIGN_TYPE, TIMEOUT_DATA_COLUMNS, TIMEOUT_GROUP_KEY_COLUMN, TIMEOUT_HEADERS, type TimeOutConfig, type TimeOutGroupResult, type TimeOutResult, type TimeOutRow } from '@/advertisers/timeout';
import type { SheetCell, SheetSpec } from '@/advertisers/types';

/**
 * Sheets batchUpdate requests that turn an empty spreadsheet into the Time Out report:
 * Report (formulas), Urgent and Margin Issue (values), Settings (the rates used).
 * Pure: no network, so every request can be tested. Time Out's own copy; shares nothing with other advertisers.
 */
export interface TimeOutSheetIds {
  readonly report: number;
  readonly urgent: number;
  readonly margin: number;
  readonly settings: number;
}

const LAST_DATA_COL = TIMEOUT_DATA_COLUMNS; // A–Z
const UPDATED_COL = 27; // AB (0-based)
const GROUP_COL = TIMEOUT_GROUP_KEY_COLUMN - 1; // AC (0-based)
/** A new spreadsheet has only 26 columns (A–Z); the report writes up to AC, so every tab is widened first. */
export const GRID_COLUMNS = TIMEOUT_HEADERS.length + 2;
const HEADER_BG = '#D9E1F2';
const HEADER_INK = '#1F2A44';

type CellData = { userEnteredValue?: { numberValue?: number; stringValue?: string; formulaValue?: string } };

export function toCellData(value: SheetCell['value']): CellData {
  if (value == null) return {};
  if (typeof value === 'number') return Number.isFinite(value) ? { userEnteredValue: { numberValue: value } } : {};
  if (value.startsWith('=')) return { userEnteredValue: { formulaValue: value } };
  return { userEnteredValue: { stringValue: value } };
}

const rgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
};

/** Open-ended column range from row 2 down, like "C2:C" in A1 notation. */
const colsFrom2 = (sheetId: number, startCol: number, endCol = startCol + 1) => ({ sheetId, startRowIndex: 1, startColumnIndex: startCol, endColumnIndex: endCol });

const cells = (sheetId: number, row: number, col: number, rows: readonly (readonly SheetCell['value'][])[]) => ({
  updateCells: {
    start: { sheetId, rowIndex: row, columnIndex: col },
    rows: rows.map((r) => ({ values: r.map(toCellData) })),
    fields: 'userEnteredValue',
  },
});

/** Bold header row with a light fill, wrapped text and a taller row; wide first column. */
function headerRow(sheetId: number, headers: readonly string[]): object[] {
  return [
    cells(sheetId, 0, 0, [headers]),
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
        cell: { userEnteredFormat: { backgroundColor: rgb(HEADER_BG), textFormat: { bold: true, foregroundColor: rgb(HEADER_INK) }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' } },
        fields: 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment)',
      },
    },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 42 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 300 }, fields: 'pixelSize' } },
  ];
}

function numberFormats(sheetId: number, rowCount: number): object[] {
  const fmt = (startCol: number, endCol: number, type: string, pattern: string) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 1 + Math.max(rowCount, 1), startColumnIndex: startCol, endColumnIndex: endCol },
      cell: { userEnteredFormat: { numberFormat: { type, pattern } } },
      fields: 'userEnteredFormat.numberFormat',
    },
  });
  return [
    fmt(2, 4, 'DATE', 'dd/MM/yyyy'), // C:D
    fmt(4, 8, 'NUMBER', '#,##0'), // E:H
    fmt(8, 9, 'PERCENT', '0.00%'), // I
    fmt(9, 12, 'NUMBER', '#,##0'), // J:L
    fmt(12, 17, 'NUMBER', '#,##0.00'), // M:Q
    fmt(17, 18, 'PERCENT', '0.00%'), // R
    fmt(21, 23, 'NUMBER', '#,##0.00'), // V:W
    fmt(23, 26, 'PERCENT', '0.00%'), // X:Z
  ];
}

/** Colour rules (first rule wins), on Time Out's columns. */
export function conditionalRules(sheetId: number, c: TimeOutConfig): object[] {
  const custom = (formula: string, range: object, format: object) => ({ booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format }, ranges: [range] });
  const bg = (hex: string) => ({ backgroundColor: rgb(hex) });
  const rules = [
    custom(`=AND($C2<>"",INT($C2)>=TODAY()-${c.newCampaignDays},INT($C2)<=TODAY())`, colsFrom2(sheetId, 2), bg('#CFE2F3')),
    custom(`=AND($D2<>"",INT($D2)>=TODAY(),INT($D2)<=TODAY()+${c.endHighlightDays})`, colsFrom2(sheetId, 3), bg('#FFF2CC')),
    custom('=AND(ISNUMBER($H2),$H2<10)', colsFrom2(sheetId, 7), bg('#00B050')),
    custom('=AND(ISNUMBER($H2),$H2<30)', colsFrom2(sheetId, 7), bg('#C6EFCE')),
    custom(`=AND(ISNUMBER($I2),OR($I2<${c.ctrLow},$I2>${c.ctrHigh}))`, colsFrom2(sheetId, 8), bg('#F4CCCC')),
    custom(`=AND(ISNUMBER($R2),$R2<${c.minMargin})`, colsFrom2(sheetId, 17), bg('#F4CCCC')),
    custom(`=AND(ISNUMBER($X2),$X2<${c.minMargin})`, colsFrom2(sheetId, 23), bg('#F4CCCC')),
    custom(`=AND(ISNUMBER($T2),$T2>0,$T2<=${c.daysRed})`, colsFrom2(sheetId, 19), bg('#F4CCCC')),
    custom(`=AND(ISNUMBER($T2),$T2>0,$T2<=${c.daysOrange})`, colsFrom2(sheetId, 19), bg('#FCE5CD')),
    custom(`=AND(ISNUMBER($Y2),$Y2<${c.minMargin})`, colsFrom2(sheetId, 24), bg('#F4CCCC')),
    custom(`=AND(ISNUMBER($Z2),$Z2<${c.minMargin})`, colsFrom2(sheetId, 25), bg('#F4CCCC')),
  ];
  return rules.map((rule, index) => ({ addConditionalFormatRule: { rule, index } }));
}

/** Calculated values for the Urgent / Margin Issue tabs (values, not formulas). */
export function rowValues(r: TimeOutRow): (number | string | null)[] {
  return [
    r.name, r.campaignType, r.start, r.end, r.totalClicks, r.targetedClicks, r.achievedClicks, r.requiredClicks,
    r.ctr, r.impressions, r.impressionsNeeded, r.impressionsTotal, r.mediaCost, r.fsFee, r.novaFee, r.budget, r.netProfit,
    r.margin, r.health || null, r.daysLeft, r.comment || null, r.projectedMediaCost, r.projectedNetProfit, r.projectedMargin,
    r.ioMargin, r.overallMargin,
  ];
}

function valuesTab(sheetId: number, groups: readonly TimeOutGroupResult[], c: TimeOutConfig): object[] {
  const rows = groups.flatMap((g) => g.rows.map(rowValues));
  return [
    ...headerRow(sheetId, TIMEOUT_HEADERS.slice(0, LAST_DATA_COL)),
    rows.length ? cells(sheetId, 1, 0, rows) : cells(sheetId, 1, 0, [['No campaigns match.']]),
    ...(rows.length ? numberFormats(sheetId, rows.length) : []),
    ...conditionalRules(sheetId, c),
  ];
}

const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;

/** The rates this report used, so anyone reading the sheet can check them. */
export function settingsRows(c: TimeOutConfig, trackerTab: string): string[][] {
  return [
    ['Setting', 'Value'],
    ['Campaign type', `${TIMEOUT_CAMPAIGN_TYPE} for every campaign for now (a CPC / CPCV choice per campaign is planned)`],
    ['Client CPC', `A$${c.clientCpc.toFixed(2)} per click (Budget = Clicks/View Target × CPC)`],
    ['Client CPM', `A$${c.clientCpm.toFixed(2)} per 1,000 impressions (for CPM campaigns, once the campaign type choice is added)`],
    ['Click buffer', pct(c.clickBuffer)],
    ['FS service fee', `${pct(c.fsRate)} of media cost`],
    ['Nova fee', `A$${c.novaCpm.toFixed(2)} per 1,000 impressions`],
    ['Minimum margin', pct(c.minMargin)],
    ['Urgent window', `${c.urgentDays} days`],
    ['Healthy CTR', `${pct(c.ctrLow)}–${pct(c.ctrHigh)}`],
    ['IO Margin %', 'Each IO on the clicks it has delivered: (clicks × CPC − media − FS fee − Nova fee) ÷ (clicks × CPC)'],
    ['Overall Margin %', 'The same for all IOs of a campaign together (first row of the campaign)'],
    ['Campaign Tracker tab', trackerTab],
  ];
}

export interface TimeOutRequestInput {
  readonly ids: TimeOutSheetIds;
  readonly spec: SheetSpec;
  readonly result: TimeOutResult;
  readonly config: TimeOutConfig;
  readonly trackerTab: string;
  /** "03 Oct 2026 04:05 PM" in the report's time zone. */
  readonly lastUpdated: string;
}

export function buildTimeOutRequests({ ids, spec, result, config, trackerTab, lastUpdated }: TimeOutRequestInput): object[] {
  const n = spec.rows.length;
  const settings = settingsRows(config, trackerTab);
  // Size every tab before writing: Google rejects cells outside the grid.
  const grid = (rows: number) => ({ frozenRowCount: 1, frozenColumnCount: 1, columnCount: GRID_COLUMNS, rowCount: Math.max(1000, rows + 1) });
  const rowsIn = (groups: readonly TimeOutGroupResult[]) => groups.reduce((s, g) => s + g.rows.length, 0);
  return [
    // Tabs: Report, Urgent, Margin Issue, Settings
    {
      updateSheetProperties: {
        properties: { sheetId: ids.report, title: 'Report', index: 0, gridProperties: grid(n) },
        fields: 'title,index,gridProperties.frozenRowCount,gridProperties.frozenColumnCount,gridProperties.columnCount,gridProperties.rowCount',
      },
    },
    { addSheet: { properties: { sheetId: ids.urgent, title: 'Urgent', index: 1, gridProperties: grid(rowsIn(result.urgent)) } } },
    { addSheet: { properties: { sheetId: ids.margin, title: 'Margin Issue', index: 2, gridProperties: grid(rowsIn(result.marginIssues)) } } },
    { addSheet: { properties: { sheetId: ids.settings, title: 'Settings', index: 3, gridProperties: { frozenRowCount: 1 } } } },

    // Report: header, rows (inputs as values, everything calculated as live formulas), last-updated stamp.
    ...headerRow(ids.report, spec.headers),
    cells(ids.report, 1, 0, spec.rows.map((r) => r.map((cell) => cell.value))),
    cells(ids.report, 1, UPDATED_COL, [[lastUpdated]]),
    ...numberFormats(ids.report, n),
    ...conditionalRules(ids.report, config),
    {
      updateDimensionProperties: {
        range: { sheetId: ids.report, dimension: 'COLUMNS', startIndex: GROUP_COL, endIndex: GROUP_COL + 1 },
        properties: { hiddenByUser: true },
        fields: 'hiddenByUser',
      },
    },

    // Urgent: ending soonest first. Margin Issue: lowest projected margin first.
    ...valuesTab(ids.urgent, result.urgent, config),
    ...valuesTab(ids.margin, result.marginIssues, config),

    // Settings
    ...headerRow(ids.settings, settings[0] ?? []),
    cells(ids.settings, 1, 0, settings.slice(1)),
    { updateDimensionProperties: { range: { sheetId: ids.settings, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 520 }, fields: 'pixelSize' } },
  ];
}

/** "dd MMM yyyy hh:mm a" in a time zone. */
export function formatLastUpdated(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
}

/** "yyyy-MM-dd" in a time zone, for the report file name. */
export function isoDay(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
