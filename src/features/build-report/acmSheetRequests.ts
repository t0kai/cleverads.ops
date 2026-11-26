import { ACM_COL, ACM_COLUMNS, ACM_DATA_COLUMNS, ACM_LETTER, acmRowValues, type AcmColumn, type AcmConfig, type AcmGroupResult, type AcmResult, type AcmRow } from '@/advertisers/acm';
import type { SheetCell, SheetSpec } from '@/advertisers/types';

/**
 * Sheets batchUpdate requests that turn an empty spreadsheet into the ACM report, matching the
 * Apps Script v2 layout: Report (formulas), Urgent, Margin Issue (values), Formula (template copy).
 * Pure: no network, so every request can be tested.
 */
export interface ReportSheetIds {
  readonly report: number;
  readonly urgent: number;
  readonly margin: number;
  readonly formula: number;
}

const LAST_DATA_COL = ACM_DATA_COLUMNS; // A … Comment
const GROUP_COL = ACM_COL.groupKey; // 0-based
const UPDATED_COL = ACM_COL.updated; // 0-based
/** A new spreadsheet has 26 columns (A–Z); the Report writes up to the group key, so it is widened first. */
const GRID_COLUMNS = ACM_COLUMNS.length + 2;

/**
 * Where each column's header sits in the template's Formula tab (A–T), so a moved column keeps its header style.
 * Columns the template does not have use its last header (T) as their style, as before.
 */
const TEMPLATE_HEADER_COL: Partial<Record<AcmColumn, number>> = {
  name: 0, start: 1, end: 2, total: 3, targeted: 4, achieved: 5, required: 6, ctr: 7, impressions: 8, novaImpr: 8, nonNovaImpr: 8, novaShare: 8, imprNeeded: 9,
  imprTotal: 10, media: 11, fs: 12, nova: 13, budget: 14, netProfit: 15, margin: 16, health: 17, days: 18, comment: 19,
};
const TEMPLATE_LAST_HEADER = 19;

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

/** Open-ended column range from row 2 down, like "B2:B" in A1 notation. */
const colsFrom2 = (sheetId: number, startCol: number, endCol = startCol + 1) => ({
  sheetId,
  startRowIndex: 1,
  startColumnIndex: startCol,
  endColumnIndex: endCol,
});

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

/** Number formats the Apps Script sets on data rows. */
function numberFormats(sheetId: number, rowCount: number): object[] {
  const fmt = (startCol: number, endCol: number, type: string, pattern: string) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 1 + Math.max(rowCount, 1), startColumnIndex: startCol, endColumnIndex: endCol },
      cell: { userEnteredFormat: { numberFormat: { type, pattern } } },
      fields: 'userEnteredFormat.numberFormat',
    },
  });
  const one = (k: AcmColumn, type: string, pattern: string) => fmt(ACM_COL[k], ACM_COL[k] + 1, type, pattern);
  return [
    fmt(ACM_COL.start, ACM_COL.end + 1, 'DATE', 'dd/MM/yyyy'),
    one('ctr', 'PERCENT', '0.00%'),
    fmt(ACM_COL.novaImpr, ACM_COL.nonNovaImpr + 1, 'NUMBER', '#,##0'),
    one('novaShare', 'PERCENT', '0%'),
    fmt(ACM_COL.margin, ACM_COL.overallMargin + 1, 'PERCENT', '0.00%'), // the four margins, side by side
    one('projMedia', 'NUMBER', '#,##0.00'),
    one('projNet', 'NUMBER', '#,##0.00'),
  ];
}

/** Same rules and order as applyFormatting_() in the Apps Script (first rule wins). */
export function conditionalRules(sheetId: number, c: AcmConfig): object[] {
  const custom = (formula: string, range: object, format: object) => ({ booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format }, ranges: [range] });
  const bg = (hex: string) => ({ backgroundColor: rgb(hex) });
  const L = ACM_LETTER;
  const col = (k: AcmColumn) => colsFrom2(sheetId, ACM_COL[k]);
  const red = (k: AcmColumn) => custom(`=AND(ISNUMBER($${L[k]}2),$${L[k]}2<${c.minMargin})`, col(k), bg('#F4CCCC'));
  const rules = [
    custom(`=AND($${L.start}2<>"",INT($${L.start}2)>=TODAY()-${c.newCampaignDays},INT($${L.start}2)<=TODAY())`, col('start'), bg('#CFE2F3')),
    custom(`=AND($${L.end}2<>"",INT($${L.end}2)>=TODAY(),INT($${L.end}2)<=TODAY()+${c.endHighlightDays})`, col('end'), bg('#FFF2CC')),
    { booleanRule: { condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: '10' }] }, format: bg('#00B050') }, ranges: [col('required')] },
    { booleanRule: { condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: '30' }] }, format: bg('#C6EFCE') }, ranges: [col('required')] },
    custom(`=AND($${L.ctr}2<>"",OR($${L.ctr}2<${c.ctrLow},$${L.ctr}2>${c.ctrHigh}))`, col('ctr'), bg('#F4CCCC')),
    red('margin'),
    red('projMargin'),
    custom(`=AND(ISNUMBER($${L.days}2),$${L.days}2>0,$${L.days}2<=${c.daysRed})`, col('days'), bg('#F4CCCC')),
    custom(`=AND(ISNUMBER($${L.days}2),$${L.days}2>0,$${L.days}2<=${c.daysOrange})`, col('days'), bg('#FCE5CD')),
    red('ioMargin'),
    red('overallMargin'),
    custom(`=ISNUMBER($${L.novaShare}2)`, col('novaShare'), bg('#FFF2CC')), // the editable Nova % cell
  ];
  return rules.map((rule, index) => ({ addConditionalFormatRule: { rule, index } }));
}

/** Calculated values for the Urgent / Margin Issue tabs (the Apps Script copies values, not formulas), in the Report's column order. */
export function rowValues(r: AcmRow): (number | string | null)[] {
  return acmRowValues(r);
}

function valuesTab(sheetId: number, reportId: number, groups: readonly AcmGroupResult[], c: AcmConfig, spec: SheetSpec): object[] {
  const rows = groups.flatMap((g) => g.rows.map(rowValues));
  return [
    // Header with the Report's look (template formats).
    {
      copyPaste: {
        source: { sheetId: reportId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: LAST_DATA_COL },
        destination: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: LAST_DATA_COL },
        pasteType: 'PASTE_NORMAL',
        pasteOrientation: 'NORMAL',
      },
    },
    ...headerNotes(sheetId, spec),
    rows.length ? cells(sheetId, 1, 0, rows) : cells(sheetId, 1, 0, [['No campaigns match.']]),
    ...(rows.length ? numberFormats(sheetId, rows.length) : []),
    ...conditionalRules(sheetId, c),
  ];
}

export interface ReportRequestInput {
  readonly ids: ReportSheetIds;
  readonly spec: SheetSpec;
  readonly result: AcmResult;
  readonly config: AcmConfig;
  /** "03 Oct 2026 04:05 PM" in the report's time zone. */
  readonly lastUpdated: string;
}

export function buildReportRequests({ ids, spec, result, config, lastUpdated }: ReportRequestInput): object[] {
  const n = spec.rows.length;
  const frozen = { frozenRowCount: 1, frozenColumnCount: 1 };
  return [
    // Tabs: Report, Urgent, Margin Issue, Formula. The Report is widened first: Google rejects cells outside the grid.
    {
      updateSheetProperties: {
        properties: { sheetId: ids.report, title: 'Report', index: 0, gridProperties: { ...frozen, columnCount: GRID_COLUMNS, rowCount: Math.max(1000, n + 1) } },
        fields: 'title,index,gridProperties.frozenRowCount,gridProperties.frozenColumnCount,gridProperties.columnCount,gridProperties.rowCount',
      },
    },
    { addSheet: { properties: { sheetId: ids.urgent, title: 'Urgent', index: 1, gridProperties: { ...frozen, columnCount: GRID_COLUMNS } } } },
    { addSheet: { properties: { sheetId: ids.margin, title: 'Margin Issue', index: 2, gridProperties: { ...frozen, columnCount: GRID_COLUMNS } } } },
    { updateSheetProperties: { properties: { sheetId: ids.formula, title: 'Formula', index: 3 }, fields: 'title,index' } },

    // Report header: each column takes the header style of the same column in the template (the order differs since
    // Oct 2026), then the header text is written from the spec, with the hover notes. The template is untouched.
    ...ACM_COLUMNS.slice(0, LAST_DATA_COL).map(([k], i) => {
      const from = TEMPLATE_HEADER_COL[k] ?? TEMPLATE_LAST_HEADER;
      return {
        copyPaste: {
          source: { sheetId: ids.formula, startRowIndex: 0, endRowIndex: 1, startColumnIndex: from, endColumnIndex: from + 1 },
          destination: { sheetId: ids.report, startRowIndex: 0, endRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 },
          pasteType: 'PASTE_FORMAT',
          pasteOrientation: 'NORMAL',
        },
      };
    }),
    cells(ids.report, 0, 0, [spec.headers.slice(0, LAST_DATA_COL)]),
    ...headerNotes(ids.report, spec),
    cells(ids.report, 0, UPDATED_COL, [['Last Updated:', 'Group Key']]),

    // Report rows: inputs as values, everything calculated as live formulas.
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
    ...valuesTab(ids.urgent, ids.report, result.urgent, config, spec),
    ...valuesTab(ids.margin, ids.report, result.marginIssues, config, spec),
  ];
}

/** "dd MMM yyyy hh:mm a", like Utilities.formatDate in the Apps Script. */
export function formatLastUpdated(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
}

/** "yyyy-MM-dd" in a time zone, for the report file name. */
export function isoDay(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
