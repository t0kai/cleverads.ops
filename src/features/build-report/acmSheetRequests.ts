import type { AcmConfig, AcmGroupResult, AcmResult, AcmRow } from '@/advertisers/acm';
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

const LAST_DATA_COL = 23; // A–W
const GROUP_COL = 25; // Z (0-based)
const UPDATED_COL = 24; // Y (0-based)
const PROJECTED_HEADERS = ['Projected Media Cost', 'Projected Net Profit', 'Projected Margin %'];
const STOPPED_TEXT = 'Running with';

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

/** Number formats the Apps Script sets on data rows. */
function numberFormats(sheetId: number, rowCount: number): object[] {
  const fmt = (startCol: number, endCol: number, type: string, pattern: string) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 1 + Math.max(rowCount, 1), startColumnIndex: startCol, endColumnIndex: endCol },
      cell: { userEnteredFormat: { numberFormat: { type, pattern } } },
      fields: 'userEnteredFormat.numberFormat',
    },
  });
  return [
    fmt(1, 3, 'DATE', 'dd/MM/yyyy'), // B:C
    fmt(7, 8, 'PERCENT', '0.00%'), // H
    fmt(16, 17, 'PERCENT', '0.00%'), // Q
    fmt(20, 22, 'NUMBER', '#,##0.00'), // U:V
    fmt(22, 23, 'PERCENT', '0.00%'), // W
  ];
}

/** Same rules and order as applyFormatting_() in the Apps Script (first rule wins). */
export function conditionalRules(sheetId: number, c: AcmConfig): object[] {
  const custom = (formula: string, range: object, format: object) => ({ booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format }, ranges: [range] });
  const bg = (hex: string) => ({ backgroundColor: rgb(hex) });
  const rules = [
    custom(`=AND($B2<>"",INT($B2)>=TODAY()-${c.newCampaignDays},INT($B2)<=TODAY())`, colsFrom2(sheetId, 1), bg('#CFE2F3')),
    custom(`=AND($C2<>"",INT($C2)>=TODAY(),INT($C2)<=TODAY()+${c.endHighlightDays})`, colsFrom2(sheetId, 2), bg('#FFF2CC')),
    { booleanRule: { condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: '10' }] }, format: bg('#00B050') }, ranges: [colsFrom2(sheetId, 6)] },
    { booleanRule: { condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: '30' }] }, format: bg('#C6EFCE') }, ranges: [colsFrom2(sheetId, 6)] },
    custom(`=AND($H2<>"",OR($H2<${c.ctrLow},$H2>${c.ctrHigh}))`, colsFrom2(sheetId, 7), bg('#F4CCCC')),
    custom(`=AND(ISNUMBER($Q2),$Q2<${c.minMargin})`, colsFrom2(sheetId, 16), bg('#F4CCCC')),
    custom(`=AND(ISNUMBER($W2),$W2<${c.minMargin})`, colsFrom2(sheetId, 22), bg('#F4CCCC')),
    custom(`=AND(ISNUMBER($S2),$S2>0,$S2<=${c.daysRed})`, colsFrom2(sheetId, 18), bg('#F4CCCC')),
    custom(`=AND(ISNUMBER($S2),$S2>0,$S2<=${c.daysOrange})`, colsFrom2(sheetId, 18), bg('#FCE5CD')),
    custom(`=ISNUMBER(SEARCH("${STOPPED_TEXT}",$R2))`, colsFrom2(sheetId, 0, LAST_DATA_COL), { textFormat: { foregroundColor: rgb('#999999') } }),
  ];
  return rules.map((rule, index) => ({ addConditionalFormatRule: { rule, index } }));
}

/** Calculated values for the Urgent / Margin Issue tabs (the Apps Script copies values, not formulas). */
export function rowValues(r: AcmRow): (number | string | null)[] {
  return [
    r.name, r.start, r.end, r.totalClicks, r.targetedClicks, r.achievedClicks, r.requiredClicks, r.ctr, r.impressions,
    r.impressionsNeeded, r.impressionsTotal, r.mediaCost, r.fsFee, r.novaFee, r.budget, r.netProfit, r.margin,
    r.health || null, r.daysLeft, r.comment || null, r.projectedMediaCost, r.projectedNetProfit, r.projectedMargin,
  ];
}

function valuesTab(sheetId: number, reportId: number, groups: readonly AcmGroupResult[], c: AcmConfig): object[] {
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
    // Tabs: Report, Urgent, Margin Issue, Formula
    {
      updateSheetProperties: {
        properties: { sheetId: ids.report, title: 'Report', index: 0, gridProperties: frozen },
        fields: 'title,index,gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
      },
    },
    { addSheet: { properties: { sheetId: ids.urgent, title: 'Urgent', index: 1, gridProperties: frozen } } },
    { addSheet: { properties: { sheetId: ids.margin, title: 'Margin Issue', index: 2, gridProperties: frozen } } },
    { updateSheetProperties: { properties: { sheetId: ids.formula, title: 'Formula', index: 3 }, fields: 'title,index' } },

    // Report header: A–T from the template, U–W in the template's header style, Y/Z labels.
    {
      copyPaste: {
        source: { sheetId: ids.formula, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 20 },
        destination: { sheetId: ids.report, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 20 },
        pasteType: 'PASTE_NORMAL',
        pasteOrientation: 'NORMAL',
      },
    },
    {
      copyPaste: {
        source: { sheetId: ids.formula, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 19, endColumnIndex: 20 },
        destination: { sheetId: ids.report, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 20, endColumnIndex: 23 },
        pasteType: 'PASTE_FORMAT',
        pasteOrientation: 'NORMAL',
      },
    },
    cells(ids.report, 0, 20, [PROJECTED_HEADERS]),
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
    ...valuesTab(ids.urgent, ids.report, result.urgent, config),
    ...valuesTab(ids.margin, ids.report, result.marginIssues, config),
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
