import { PINSTRIPE_DATA_COLUMNS, PINSTRIPE_GROUP_KEY_COLUMN, PINSTRIPE_HEADERS, type PinstripeConfig, type PinstripeGroupResult, type PinstripeResult, type PinstripeRow } from '@/advertisers/pinstripe';
import type { SheetCell, SheetSpec } from '@/advertisers/types';

/**
 * Sheets batchUpdate requests that turn an empty spreadsheet into the Pinstripe report:
 * Report (formulas), Urgent and Margin Issue (values), Settings (the rates used).
 * Pure: no network, so every request can be tested. Pinstripe's own copy; shares nothing with other advertisers.
 */
export interface PinstripeSheetIds {
  readonly report: number;
  readonly urgent: number;
  readonly margin: number;
  readonly settings: number;
}

const LAST_DATA_COL = PINSTRIPE_DATA_COLUMNS; // A–Y
const UPDATED_COL = 26; // AA (0-based)
const GROUP_COL = PINSTRIPE_GROUP_KEY_COLUMN - 1; // AB (0-based)
const STOPPED_TEXT = 'Running with';
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
  return [
    fmt(2, 4, 'DATE', 'dd/MM/yyyy'), // C:D
    fmt(4, 10, 'NUMBER', '#,##0'), // E:J
    fmt(10, 11, 'PERCENT', '0.00%'), // K
    fmt(11, 13, 'NUMBER', '#,##0'), // L:M
    fmt(13, 18, 'NUMBER', '#,##0.00'), // N:R
    fmt(18, 19, 'PERCENT', '0.00%'), // S
    fmt(22, 24, 'NUMBER', '#,##0.00'), // W:X
    fmt(24, 25, 'PERCENT', '0.00%'), // Y
  ];
}

/** Colour rules (first rule wins), the same ideas as the other reports, on Pinstripe's columns. */
export function conditionalRules(sheetId: number, c: PinstripeConfig): object[] {
  const custom = (formula: string, range: object, format: object) => ({ booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format }, ranges: [range] });
  const bg = (hex: string) => ({ backgroundColor: rgb(hex) });
  const rules = [
    custom(`=AND($C2<>"",INT($C2)>=TODAY()-${c.newCampaignDays},INT($C2)<=TODAY())`, colsFrom2(sheetId, 2), bg('#CFE2F3')),
    custom(`=AND($D2<>"",INT($D2)>=TODAY(),INT($D2)<=TODAY()+${c.endHighlightDays})`, colsFrom2(sheetId, 3), bg('#FFF2CC')),
    custom(`=AND($B2="Clicks",ISNUMBER($H2),$H2<10)`, colsFrom2(sheetId, 7), bg('#00B050')),
    custom(`=AND($B2="Clicks",ISNUMBER($H2),$H2<30)`, colsFrom2(sheetId, 7), bg('#C6EFCE')),
    custom(`=AND(ISNUMBER($K2),OR($K2<${c.ctrLow},$K2>${c.ctrHigh}))`, colsFrom2(sheetId, 10), bg('#F4CCCC')),
    custom(`=AND(ISNUMBER($S2),$S2<${c.minMargin})`, colsFrom2(sheetId, 18), bg('#F4CCCC')),
    custom(`=AND(ISNUMBER($Y2),$Y2<${c.minMargin})`, colsFrom2(sheetId, 24), bg('#F4CCCC')),
    custom(`=AND(ISNUMBER($U2),$U2>0,$U2<=${c.daysRed})`, colsFrom2(sheetId, 20), bg('#F4CCCC')),
    custom(`=AND(ISNUMBER($U2),$U2>0,$U2<=${c.daysOrange})`, colsFrom2(sheetId, 20), bg('#FCE5CD')),
    custom(`=$B2="Impressions"`, colsFrom2(sheetId, 1), bg('#EDE7F6')),
    custom(`=ISNUMBER(SEARCH("${STOPPED_TEXT}",$T2))`, colsFrom2(sheetId, 0, LAST_DATA_COL), { textFormat: { foregroundColor: rgb('#999999') } }),
  ];
  return rules.map((rule, index) => ({ addConditionalFormatRule: { rule, index } }));
}

/** Calculated values for the Urgent / Margin Issue tabs (values, not formulas). */
export function rowValues(r: PinstripeRow): (number | string | null)[] {
  return [
    r.name, r.type, r.start, r.end, r.totalTarget, r.targeted, r.achieved, r.required, r.clicks, r.impressions, r.ctr,
    r.impressionsNeeded, r.impressionsTotal, r.mediaCost, r.fsFee, r.novaFee, r.budget, r.netProfit, r.margin,
    r.health || null, r.daysLeft, r.comment || null, r.projectedMediaCost, r.projectedNetProfit, r.projectedMargin,
  ];
}

function valuesTab(sheetId: number, groups: readonly PinstripeGroupResult[], c: PinstripeConfig): object[] {
  const rows = groups.flatMap((g) => g.rows.map(rowValues));
  return [
    ...headerRow(sheetId, PINSTRIPE_HEADERS.slice(0, LAST_DATA_COL)),
    rows.length ? cells(sheetId, 1, 0, rows) : cells(sheetId, 1, 0, [['No campaigns match.']]),
    ...(rows.length ? numberFormats(sheetId, rows.length) : []),
    ...conditionalRules(sheetId, c),
  ];
}

const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;

/** The rates this report used, so anyone reading the sheet can check them. */
export function settingsRows(c: PinstripeConfig, trackerTab: string): string[][] {
  return [
    ['Setting', 'Value'],
    ['Click campaigns: client CPC', `A$${c.clientCpc.toFixed(2)} per click (Budget = Click Target × CPC)`],
    ['Impression campaigns', `Click Target of ${c.impressionTargetFrom.toLocaleString('en-AU')} or more`],
    ['Impression campaigns: budget', 'Budget (AUD) from the Campaign Tracker'],
    ['Target buffer', pct(c.targetBuffer)],
    ['FS service fee', `${pct(c.fsRate)} of media cost`],
    ['Nova fee', `A$${c.novaCpm.toFixed(2)} per 1,000 impressions`],
    ['Minimum margin', pct(c.minMargin)],
    ['Urgent window', `${c.urgentDays} days`],
    ['Healthy CTR', `${pct(c.ctrLow)}–${pct(c.ctrHigh)}`],
    ['Campaign Tracker tab', trackerTab],
  ];
}

export interface PinstripeRequestInput {
  readonly ids: PinstripeSheetIds;
  readonly spec: SheetSpec;
  readonly result: PinstripeResult;
  readonly config: PinstripeConfig;
  readonly trackerTab: string;
  /** "03 Oct 2026 04:05 PM" in the report's time zone. */
  readonly lastUpdated: string;
}

export function buildPinstripeRequests({ ids, spec, result, config, trackerTab, lastUpdated }: PinstripeRequestInput): object[] {
  const n = spec.rows.length;
  const frozen = { frozenRowCount: 1, frozenColumnCount: 1 };
  const settings = settingsRows(config, trackerTab);
  return [
    // Tabs: Report, Urgent, Margin Issue, Settings
    {
      updateSheetProperties: {
        properties: { sheetId: ids.report, title: 'Report', index: 0, gridProperties: frozen },
        fields: 'title,index,gridProperties.frozenRowCount,gridProperties.frozenColumnCount',
      },
    },
    { addSheet: { properties: { sheetId: ids.urgent, title: 'Urgent', index: 1, gridProperties: frozen } } },
    { addSheet: { properties: { sheetId: ids.margin, title: 'Margin Issue', index: 2, gridProperties: frozen } } },
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
