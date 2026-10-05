import type { SheetCell, SheetSpec } from '../types';
import type { PinstripeConfig } from './config';
import type { PinstripeResult, PinstripeRow } from './rules';

/**
 * The Pinstripe Report tab: values for inputs, real formulas for everything calculated,
 * so editing a number in the sheet still recalculates. Rates come from the Pinstripe config.
 *
 * A Campaign name · B Type · C Start · D End · E Total target · F Targeted · G Achieved · H Required
 * I Clicks · J Impressions · K CTR · L Impressions needed · M Required total impressions
 * N Inventory cost · O FS fee · P Nova fee · Q Budget · R Net profit · S Margin %
 * T Campaign Health · U Remaining days · V Comment · W–Y Projected · AA Last Updated · AB Group Key (hidden)
 */
export const PINSTRIPE_HEADERS = [
  'Campaign name', 'Type', 'Start date', 'End date', 'Total target', 'Targeted', 'Achieved', 'Required',
  'Clicks', 'Impressions spent', 'Actual Average CTR', 'Impressions needed', 'Required Total Impression',
  'Inventory cost', 'FS Service fee', 'Nova fee', 'Budget', 'Net profit', 'Margin %', 'Campaign Health',
  'Remaining Days', 'Comment', 'Projected Media Cost', 'Projected Net Profit', 'Projected Margin %', '',
  'Last Updated:', 'Group Key',
] as const;

/** Number of data columns (A–Y). */
export const PINSTRIPE_DATA_COLUMNS = 25;
/** Column AB (28th) holds the group key and is hidden. */
export const PINSTRIPE_GROUP_KEY_COLUMN = 28;

const pct = (rate: number) => `${+(rate * 100).toFixed(6)}%`;
const iferror = (f: string) => `=IFERROR(${f.replace(/^=/, '')},"")`;

function healthFormula(x: number, c: PinstripeConfig): string {
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

function budgetCell(r: PinstripeRow, x: number, c: PinstripeConfig): string | number | null {
  if (r.isChild) return null;
  // Click campaigns: Click Target × CPC. Impression campaigns: the budget typed into the tracker.
  return r.type === 'Clicks' ? `=IF(E${x}="","",E${x}*${c.clientCpc})` : r.budget;
}

function rowCells(r: PinstripeRow, x: number, c: PinstripeConfig): SheetCell[] {
  const sumIf = (col: string) => `SUMIF($AB$2:$AB,$AB${x},$${col}$2:$${col})`;
  const noBudget = `OR(Q${x}="",Q${x}=0)`;

  const F = !r.isChild
    ? `=IF(E${x}="","",ROUND(E${x}+(E${x}*${pct(c.targetBuffer)}),0))`
    : r.isHead
      ? null
      : `=MAX(F${x - 1}-G${x - 1},0)`;

  const cells: (string | number | null)[] = [
    r.name, // A
    r.type, // B
    r.start, // C
    r.end, // D
    r.totalTarget, // E
    F, // F
    `=IF($B${x}="Impressions",J${x},I${x})`, // G
    r.superseded ? 0 : iferror(`=IF(OR(F${x}="",G${x}=""),"",MAX(F${x}-G${x},0))`), // H
    r.clicks, // I
    r.impressions, // J
    iferror(`=IF(OR(I${x}="",J${x}="",J${x}=0),"",I${x}/J${x})`), // K
    iferror(`=IF(H${x}="","",IF($B${x}="Impressions",H${x},IF(OR(K${x}="",K${x}=0),"",ROUND(H${x}/K${x},0))))`), // L
    iferror(`=IF(OR(J${x}="",L${x}=""),"",J${x}+L${x})`), // M
    r.mediaCost, // N
    iferror(`=IF(N${x}="","",N${x}*${pct(c.fsRate)})`), // O
    iferror(`=IF(M${x}="","",(M${x}/1000)*${c.novaCpm})`), // P
    budgetCell(r, x, c), // Q
    r.isHead ? `=IF(${noBudget},"",Q${x}-${sumIf('N')}-${sumIf('O')}-${sumIf('P')})` : null, // R
    r.isHead ? `=IF(R${x}="","",R${x}/Q${x})` : null, // S
    r.superseded ? `▶ Running with ${r.nextLabel}` : iferror(healthFormula(x, c)), // T
    iferror(`=MAX(0,ROUNDUP(D${x}-TODAY(),0))`), // U
    r.comment || null, // V
    `=IFERROR(IF(J${x}>0,N${x}/J${x}*M${x},N${x}),N${x})`, // W
    r.isHead ? `=IF(${noBudget},"",Q${x}-${sumIf('W')}*(1+${c.fsRate})-${sumIf('P')})` : null, // X
    r.isHead ? `=IF(X${x}="","",X${x}/Q${x})` : null, // Y
    null, // Z
    null, // AA
    r.groupKey, // AB
  ];
  return cells.map((value) => ({ value }));
}

export function buildPinstripeSheetSpec(result: PinstripeResult, config: PinstripeConfig, title = 'Report'): SheetSpec {
  return {
    title,
    headers: PINSTRIPE_HEADERS,
    rows: result.rows.map((r, i) => rowCells(r, i + 2, config)),
    hiddenColumns: [PINSTRIPE_GROUP_KEY_COLUMN],
  };
}
