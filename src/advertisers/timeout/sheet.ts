import type { SheetCell, SheetSpec } from '../types';
import type { TimeOutConfig } from './config';
import type { TimeOutResult, TimeOutRow } from './rules';

/**
 * The Time Out Report tab: values for inputs, real formulas for everything calculated,
 * so editing a number in the sheet still recalculates. Rates come from the Time Out config.
 *
 * A Campaign name · B Campaign Type · C Start · D End · E Total Clicks · F Targeted · G Achieved
 * H Required · I Required Clicks / Day · J CTR · K Impressions · L Impressions needed
 * M Required total impressions · N Inventory cost · O FS fee · P Nova fee · Q Budget · R Net profit
 * S Margin % · T Campaign Health · U Remaining Days · V Comment · W–Y Projected
 * AA Last Updated · AB Group Key (hidden)
 */
export const TIMEOUT_HEADERS = [
  'Campaign name', 'Campaign Type', 'Start date', 'End date', 'Total Clicks', 'Targeted Clicks', 'Achieved Clicks',
  'Required Clicks', 'Required Clicks / Day', 'Actual Average CTR', 'Impressions spent',
  'Impression needed for required clicks', 'Required Total Impression', 'Inventory cost', 'FS Service fee', 'Nova fee',
  'Budget', 'Net profit', 'Margin %', 'Campaign Health', 'Remaining Days', 'Comment', 'Projected Media Cost',
  'Projected Net Profit', 'Projected Margin %', '', 'Last Updated:', 'Group Key',
] as const;

/** Number of data columns (A–Y). */
export const TIMEOUT_DATA_COLUMNS = 25;
/** Column AB (28th) holds the group key and is hidden. */
export const TIMEOUT_GROUP_KEY_COLUMN = 28;

const pct = (rate: number) => `${+(rate * 100).toFixed(6)}%`;
const iferror = (f: string) => `=IFERROR(${f.replace(/^=/, '')},"")`;

function healthFormula(x: number, c: TimeOutConfig): string {
  const pace = `((TODAY()-C${x}+1)/(D${x}-C${x}+1))`;
  const perDay = `ROUND((F${x}-G${x})/MAX(1,D${x}-TODAY()),0)&"/day"`;
  return (
    `=IF(OR(F${x}="",C${x}="",D${x}=""),"",IF(G${x}>=F${x},"🟢 Completed",IF(TODAY()<C${x},"Not Started",IF(TODAY()>D${x},"Ended",` +
    `IF((G${x}/F${x})>=${pace}+${c.paceAhead},"🟢 Ahead | "&${perDay},` +
    `IF((G${x}/F${x})>=${pace}-${c.paceOnTrack},"🟢 On Pace | "&${perDay},` +
    `IF((G${x}/F${x})>=${pace}-${c.paceBehind},"🟡 Behind | "&${perDay},` +
    `"🔴 Critical | "&${perDay})))))))`
  );
}

function rowCells(r: TimeOutRow, x: number, c: TimeOutConfig): SheetCell[] {
  const wrap = (f: string) => (r.isChild ? iferror(f) : f);
  const sumIf = (col: string) => `SUMIF($AB$2:$AB,$AB${x},$${col}$2:$${col})`;
  const noBudget = `OR(Q${x}="",Q${x}=0)`;

  const F = !r.isChild
    ? `=IF(E${x}="","",ROUND(E${x}+(E${x}*${pct(c.clickBuffer)}),0))`
    : r.isHead
      ? null
      : `=MAX(F${x - 1}-G${x - 1},0)`;

  const cells: (string | number | null)[] = [
    r.name, // A
    r.campaignType, // B
    r.start, // C
    r.end, // D
    r.totalClicks, // E
    F, // F
    r.achievedClicks, // G
    r.superseded ? 0 : wrap(`=IF(OR(F${x}="",G${x}=""),"",MAX(F${x}-G${x},0))`), // H
    iferror(`=IF(OR(H${x}="",H${x}=0,D${x}=""),"",IF(TODAY()>D${x},"",ROUNDUP(H${x}/MAX(1,D${x}-MAX(TODAY(),C${x})),0)))`), // I
    wrap(`=IF(OR(G${x}="",K${x}="",K${x}=0),"",G${x}/K${x})`), // J
    r.impressions, // K
    wrap(`=IF(OR(H${x}="",J${x}="",J${x}=0),"",ROUND(H${x}/J${x},0))`), // L
    wrap(`=IF(OR(K${x}="",L${x}=""),"",K${x}+L${x})`), // M
    r.mediaCost, // N
    wrap(`=IF(N${x}="","",N${x}*${pct(c.fsRate)})`), // O
    wrap(`=IF(M${x}="","",(M${x}/1000)*${c.novaCpm})`), // P
    r.isChild ? null : `=IF(E${x}="","",E${x}*${c.clientCpc})`, // Q
    r.isHead ? `=IF(${noBudget},"",Q${x}-${sumIf('N')}-${sumIf('O')}-${sumIf('P')})` : null, // R
    r.isHead ? `=IF(R${x}="","",R${x}/Q${x})` : null, // S
    r.superseded ? `▶ Running with ${r.nextLabel}` : iferror(healthFormula(x, c)), // T
    wrap(`=MAX(0,ROUNDUP(D${x}-TODAY(),0))`), // U
    r.comment || null, // V
    `=IFERROR(IF(K${x}>0,N${x}/K${x}*M${x},N${x}),N${x})`, // W
    r.isHead ? `=IF(${noBudget},"",Q${x}-${sumIf('W')}*(1+${c.fsRate})-${sumIf('P')})` : null, // X
    r.isHead ? `=IF(X${x}="","",X${x}/Q${x})` : null, // Y
    null, // Z
    null, // AA
    r.groupKey, // AB
  ];
  return cells.map((value) => ({ value }));
}

export function buildTimeOutSheetSpec(result: TimeOutResult, config: TimeOutConfig, title = 'Report'): SheetSpec {
  return {
    title,
    headers: TIMEOUT_HEADERS,
    rows: result.rows.map((r, i) => rowCells(r, i + 2, config)),
    hiddenColumns: [TIMEOUT_GROUP_KEY_COLUMN],
  };
}
