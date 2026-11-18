import {
  BI_COL, BI_DATA_COLUMNS, BI_GROUP_KEY_COLUMN, BI_HEADERS, BI_LETTER, businessInsiderRowValues,
  type BiColumn, type BusinessInsiderConfig, type BusinessInsiderGroupResult, type BusinessInsiderResult, type BusinessInsiderRow,
} from '@/advertisers/businessinsider';
import type { SheetCell, SheetSpec } from '@/advertisers/types';

/**
 * Sheets batchUpdate requests that turn an empty spreadsheet into the Business Insider report:
 * Report (formulas), Urgent and Margin Issue (values), Settings (the rates used).
 * Pure: no network, so every request can be tested. Business Insider's own copy; shares nothing with other advertisers.
 */
export interface BusinessInsiderSheetIds {
  readonly report: number;
  readonly urgent: number;
  readonly margin: number;
  readonly settings: number;
}

const LAST_DATA_COL = BI_DATA_COLUMNS; // A … Comment
const UPDATED_COL = BI_COL.updated; // 0-based
const GROUP_COL = BI_GROUP_KEY_COLUMN - 1; // AG (0-based)
/** A new spreadsheet has only 26 columns (A–Z); Business Insider writes up to AG, so every tab is widened first. */
export const GRID_COLUMNS = BI_HEADERS.length + 2;
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

/** Header cells that carry a hover note (e.g. Required Clicks: "without extra"). Writes the header text too. */
const headerNotes = (sheetId: number, spec: Pick<SheetSpec, 'headers' | 'headerNotes'>) =>
  Object.entries(spec.headerNotes ?? {}).map(([col, note]) => ({
    updateCells: {
      start: { sheetId, rowIndex: 0, columnIndex: Number(col) },
      rows: [{ values: [{ ...toCellData(spec.headers[Number(col)] ?? null), note }] }],
      fields: 'userEnteredValue,note',
    },
  }));

/** Bold header row with a light fill, wrapped text and a taller row. */
function headerRow(sheetId: number, headers: readonly string[]): object[] {
  return [
    cells(sheetId, 0, 0, [headers]),
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
        cell: {
          userEnteredFormat: {
            backgroundColor: rgb(HEADER_BG),
            textFormat: { bold: true, foregroundColor: rgb(HEADER_INK) },
            wrapStrategy: 'WRAP',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment)',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 42 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 280 },
        fields: 'pixelSize',
      },
    },
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
  const C = BI_COL;
  return [
    fmt(C.start, C.end + 1, 'DATE', 'dd/MM/yyyy'),
    fmt(C.total, C.required + 1, 'NUMBER', '#,##0'),
    fmt(C.ctr, C.ctr + 1, 'PERCENT', '0.00%'),
    fmt(C.impressions, C.nonNovaImpr + 1, 'NUMBER', '#,##0'),
    fmt(C.novaShare, C.novaShare + 1, 'PERCENT', '0%'),
    fmt(C.imprNeeded, C.imprTotal + 1, 'NUMBER', '#,##0'),
    fmt(C.margin, C.overallMargin + 1, 'PERCENT', '0.00%'), // the four margins, side by side
    fmt(C.media, C.budgetUsd + 1, 'NUMBER', '#,##0.00'),
    fmt(C.fx, C.fx + 1, 'NUMBER', '0.0000'),
    fmt(C.budgetAud, C.netUsd + 1, 'NUMBER', '#,##0.00'),
    fmt(C.projMedia, C.projNet + 1, 'NUMBER', '#,##0.00'),
  ];
}

/** Colour rules (first rule wins), the same ideas as the other reports, on Business Insider's columns. */
export function conditionalRules(sheetId: number, c: BusinessInsiderConfig): object[] {
  const custom = (formula: string, range: object, format: object) => ({ booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format }, ranges: [range] });
  const bg = (hex: string) => ({ backgroundColor: rgb(hex) });
  const L = BI_LETTER;
  const col = (k: BiColumn) => colsFrom2(sheetId, BI_COL[k]);
  const red = (k: BiColumn) => custom(`=AND(ISNUMBER($${L[k]}2),$${L[k]}2<${c.minMargin})`, col(k), bg('#F4CCCC'));
  const rules = [
    custom(`=AND($${L.start}2<>"",INT($${L.start}2)>=TODAY()-${c.newCampaignDays},INT($${L.start}2)<=TODAY())`, col('start'), bg('#CFE2F3')),
    custom(`=AND($${L.end}2<>"",INT($${L.end}2)>=TODAY(),INT($${L.end}2)<=TODAY()+${c.endHighlightDays})`, col('end'), bg('#FFF2CC')),
    custom(`=AND(ISNUMBER($${L.required}2),$${L.required}2<10)`, col('required'), bg('#00B050')),
    custom(`=AND(ISNUMBER($${L.required}2),$${L.required}2<30)`, col('required'), bg('#C6EFCE')),
    // Healthy CTR: at least ctrLow and below ctrHigh.
    custom(`=AND(ISNUMBER($${L.ctr}2),OR($${L.ctr}2<${c.ctrLow},$${L.ctr}2>=${c.ctrHigh}))`, col('ctr'), bg('#F4CCCC')),
    red('margin'),
    red('projMargin'),
    custom(`=AND(ISNUMBER($${L.days}2),$${L.days}2>0,$${L.days}2<=${c.daysRed})`, col('days'), bg('#F4CCCC')),
    custom(`=AND(ISNUMBER($${L.days}2),$${L.days}2>0,$${L.days}2<=${c.daysOrange})`, col('days'), bg('#FCE5CD')),
    custom(`=ISNUMBER($${L.novaShare}2)`, col('novaShare'), bg('#FFF2CC')), // the editable Nova % cell
    red('ioMargin'),
    red('overallMargin'),
  ];
  return rules.map((rule, index) => ({ addConditionalFormatRule: { rule, index } }));
}

/** Calculated values for the Urgent / Margin Issue tabs (values, not formulas). */
export function rowValues(r: BusinessInsiderRow): (number | string | null)[] {
  return businessInsiderRowValues(r);
}

function valuesTab(sheetId: number, groups: readonly BusinessInsiderGroupResult[], c: BusinessInsiderConfig, spec: SheetSpec): object[] {
  const rows = groups.flatMap((g) => g.rows.map(rowValues));
  return [
    ...headerRow(sheetId, BI_HEADERS.slice(0, LAST_DATA_COL)),
    ...headerNotes(sheetId, spec),
    rows.length ? cells(sheetId, 1, 0, rows) : cells(sheetId, 1, 0, [['No campaigns match.']]),
    ...(rows.length ? numberFormats(sheetId, rows.length) : []),
    ...conditionalRules(sheetId, c),
  ];
}

const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;

/** The rates this report used, so anyone reading the sheet can check them. */
export function settingsRows(c: BusinessInsiderConfig, trackerTab: string): string[][] {
  return [
    ['Setting', 'Value'],
    ['Billing currency', 'US$ (DV360 costs are A$)'],
    ['Client CPC', `US$${c.clientCpcUsd.toFixed(2)} per click`],
    ['A$ budget', 'Budget (AUD) from the Campaign Tracker (US$ budget × USD → AUD rate)'],
    ['Revenue per click (A$)', 'Budget (AUD) ÷ Click Target'],
    ['Nova %', `${pct(c.novaShare)} by default (DV360 creatives). Change it on a campaign's first row; the Nova fee and margins follow`],
    ['IO grouping', '"<campaign> IO", "<campaign> 2 IO", "<campaign> 3 IO" … count as one campaign'],
    ['Target buffer (Targeted column only)', pct(c.targetBuffer)],
    ['DV360/FS platform fee', `${+(c.fsRate * 100).toFixed(4)}% of inventory cost ((cost ÷ 1.1) × 4.5%)`],
    ['Nova fee', `A$${c.novaCpm.toFixed(2)} per 1,000 Nova impressions`],
    ['Minimum margin', pct(c.minMargin)],
    ['Urgent window', `${c.urgentDays} days or less`],
    ['Healthy CTR', `${pct(c.ctrLow)} and above, below ${pct(c.ctrHigh)}`],
    ['Campaign Tracker tab', trackerTab],
  ];
}

export interface BusinessInsiderRequestInput {
  readonly ids: BusinessInsiderSheetIds;
  readonly spec: SheetSpec;
  readonly result: BusinessInsiderResult;
  readonly config: BusinessInsiderConfig;
  readonly trackerTab: string;
  /** "03 Oct 2026 04:05 PM" in the report's time zone. */
  readonly lastUpdated: string;
}

export function buildBusinessInsiderRequests({ ids, spec, result, config, trackerTab, lastUpdated }: BusinessInsiderRequestInput): object[] {
  const n = spec.rows.length;
  const settings = settingsRows(config, trackerTab);
  // Size every tab before writing: Google rejects cells outside the grid.
  const grid = (rows: number) => ({ frozenRowCount: 1, frozenColumnCount: 1, columnCount: GRID_COLUMNS, rowCount: Math.max(1000, rows + 1) });
  return [
    // Tabs: Report, Urgent, Margin Issue, Settings
    {
      updateSheetProperties: {
        properties: { sheetId: ids.report, title: 'Report', index: 0, gridProperties: grid(n) },
        fields: 'title,index,gridProperties.frozenRowCount,gridProperties.frozenColumnCount,gridProperties.columnCount,gridProperties.rowCount',
      },
    },
    { addSheet: { properties: { sheetId: ids.urgent, title: 'Urgent', index: 1, gridProperties: grid(result.urgent.flatMap((g) => g.rows).length) } } },
    { addSheet: { properties: { sheetId: ids.margin, title: 'Margin Issue', index: 2, gridProperties: grid(result.marginIssues.flatMap((g) => g.rows).length) } } },
    { addSheet: { properties: { sheetId: ids.settings, title: 'Settings', index: 3, gridProperties: { frozenRowCount: 1 } } } },

    // Report: header, rows (inputs as values, everything calculated as live formulas), last-updated stamp.
    ...headerRow(ids.report, spec.headers),
    ...headerNotes(ids.report, spec),
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
    ...valuesTab(ids.urgent, result.urgent, config, spec),
    ...valuesTab(ids.margin, result.marginIssues, config, spec),

    // Settings
    ...headerRow(ids.settings, settings[0] ?? []),
    cells(ids.settings, 1, 0, settings.slice(1)),
    {
      updateDimensionProperties: {
        range: { sheetId: ids.settings, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 420 },
        fields: 'pixelSize',
      },
    },
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
