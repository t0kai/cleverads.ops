import type { SheetCell, SheetSpec } from '../types';
import type { AcmConfig } from './config';
import type { AcmResult, AcmRow } from './rules';

/**
 * The Report tab as the sheet will hold it: values for inputs, real formulas for everything calculated,
 * so editing a number in the sheet still recalculates. Formulas are the template's (Formula tab),
 * with the rates taken from config instead of being typed in.
 */
export const ACM_HEADERS = [
  'Campaign name', 'Start date', 'End date', 'Total Clicks', 'Targeted Clicks', 'Achieved Clicks',
  'Required Clicks', 'Actual Average CTR', 'Impressions spent', 'Impression needed for required clicks',
  'Required Total Impression', 'Inventory cost', 'FS Service fee', 'Nova fee', 'Budget', 'Net profit',
  'Margin %', 'Campaign Health', 'Remaing Days', 'Comment', 'Projected Media Cost', 'Projected Net Profit',
  'Projected Margin %', '', 'Last Updated:', 'Group Key',
] as const;

/** Column Z (26th) holds the group key and is hidden. */
export const GROUP_KEY_COLUMN = 26;

const pct = (rate: number) => `${+(rate * 100).toFixed(6)}%`;
const iferror = (f: string) => `=IFERROR(${f.replace(/^=/, '')},"")`;

function healthFormula(x: number, c: AcmConfig): string {
  const pace = `((TODAY()-B${x}+1)/(C${x}-B${x}+1))`;
  const perDay = `ROUND((E${x}-F${x})/MAX(1,C${x}-TODAY()),0)&"/day"`;
  return (
    `=IF(F${x}>=E${x},"🟢 Completed",IF(TODAY()<B${x},"Not Started",IF(TODAY()>C${x},"Ended",` +
    `IF((F${x}/E${x})>=${pace}+${c.paceAhead},"🟢 Ahead | "&${perDay},` +
    `IF((F${x}/E${x})>=${pace}-${c.paceOnTrack},"🟢 On Pace | "&${perDay},` +
    `IF((F${x}/E${x})>=${pace}-${c.paceBehind},"🟡 Behind | "&${perDay},` +
    `"🔴 Critical | "&${perDay}))))))`
  );
}

function rowCells(r: AcmRow, x: number, c: AcmConfig): SheetCell[] {
  const wrap = (f: string) => (r.isChild ? iferror(f) : f);
  const sumIf = (col: string) => `SUMIF($Z$2:$Z,$Z${x},$${col}$2:$${col})`;
  const noBudget = `OR(O${x}="",O${x}=0)`;

  const E = !r.isChild
    ? `=IF(D${x}="","",ROUND(D${x}+(D${x}*${pct(c.clickBuffer)}),0))`
    : r.isHead
      ? null
      : `=MAX(E${x - 1}-F${x - 1},0)`;

  const cells: (string | number | null)[] = [
    r.name,
    r.start,
    r.end,
    r.totalClicks,
    E,
    r.achievedClicks,
    r.superseded ? 0 : wrap(`=IF(OR(E${x}="",F${x}=""),"",MAX(E${x}-F${x},0))`),
    wrap(`=IF(OR(F${x}="",I${x}="",I${x}=0),"",F${x}/I${x})`),
    r.impressions,
    wrap(`=IF(OR(G${x}="",H${x}="",H${x}=0),"",ROUND(G${x}/H${x},0))`),
    wrap(`=IF(OR(I${x}="",J${x}=""),"",I${x}+J${x})`),
    r.mediaCost,
    wrap(`=IF(L${x}="","",L${x}*${pct(c.fsRate)})`),
    wrap(`=IF(K${x}="","",(K${x}/1000)*${c.novaCpm})`),
    r.isChild ? null : `=IF(D${x}="","",D${x}*${c.clientCpc})`,
    r.isHead ? `=IF(${noBudget},"",O${x}-${sumIf('L')}-${sumIf('M')}-${sumIf('N')})` : null,
    r.isHead ? `=IF(P${x}="","",P${x}/O${x})` : null,
    r.superseded ? `▶ Running with ${r.nextLabel}` : wrap(healthFormula(x, c)),
    wrap(`=MAX(0,ROUNDUP(C${x}-TODAY(),0))`),
    r.comment || null,
    `=IFERROR(IF(I${x}>0,L${x}/I${x}*K${x},L${x}),L${x})`,
    r.isHead ? `=IF(${noBudget},"",O${x}-${sumIf('U')}*(1+${c.fsRate})-${sumIf('N')})` : null,
    r.isHead ? `=IF(V${x}="","",V${x}/O${x})` : null,
    null,
    null,
    r.groupKey,
  ];
  return cells.map((value) => ({ value }));
}

export function buildAcmSheetSpec(result: AcmResult, config: AcmConfig, title = 'Report'): SheetSpec {
  return {
    title,
    headers: ACM_HEADERS,
    rows: result.rows.map((r, i) => rowCells(r, i + 2, config)),
    hiddenColumns: [GROUP_KEY_COLUMN],
  };
}
