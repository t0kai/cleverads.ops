import { moveToFolder } from '@/adapters/drive/driveApi';
import { batchUpdate, createSpreadsheet, exportLinks, getSpreadsheetMeta, getValues } from '@/adapters/sheets/sheetsApi';
import { calculateTimeOut, timeOutModule, type TimeOutConfig, type TimeOutResult } from '@/advertisers/timeout';
import type { TrackerSources } from '@/content/advertisers';
import type { Dv360Row } from '@/engine/csv/dv360';
import { todaySerial } from '@/engine/dates/serial';
import { AccessError, AppError, ModuleError, ValidationError } from '@/shared/errors';
import { newRunId } from '@/shared/ids';
import type { BuildStep, ReportBuildResult } from '../runTypes';
import { buildTimeOutRequests, formatLastUpdated, isoDay } from './sheetRequests';
import { parseTimeOutTargets } from './trackerTargets';

/**
 * One click of "Build optimization sheet" for Time Out: tracker (read only) → maths → new spreadsheet
 * in the Results folder. Nothing is written to Google until the maths has finished without errors.
 */
export interface TimeOutBuildInput {
  readonly token: string;
  readonly rows: readonly Dv360Row[];
  readonly sources: TrackerSources;
  readonly config: TimeOutConfig;
  readonly reportTimeZone: string;
  readonly now?: Date;
  readonly onStep?: (step: BuildStep) => void;
}

const SHEET_IDS = { urgent: 3001, margin: 3002, settings: 3003 } as const;

/** Re-label access errors so the user knows which file is the problem. */
async function step<T>(what: string, url: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof AccessError) throw new AccessError(`No access to ${what}.`, url, e);
    throw e;
  }
}

export async function buildTimeOutReport(input: TimeOutBuildInput): Promise<ReportBuildResult> {
  const { token, rows, sources, config, reportTimeZone, onStep } = input;
  const now = input.now ?? new Date();
  const runId = newRunId();
  if (!rows.length) throw new ValidationError('The CSV has no insertion orders.');

  // 1. Dates and targets from the Campaign Tracker (read only). The whole tab is read, so the
  //    request never reaches past the tab's last column.
  onStep?.('targets');
  const trackerUrl = `https://docs.google.com/spreadsheets/d/${sources.trackerId}/edit`;
  const trackerMeta = await step('the Campaign Tracker', trackerUrl, () => getSpreadsheetMeta(token, sources.trackerId));
  if (!trackerMeta.sheets.some((s) => s.title === sources.trackerTab)) {
    throw new ValidationError(`The Campaign Tracker has no "${sources.trackerTab}" tab.`, [], 'Check the tab name in the Campaign Tracker.');
  }
  const values = await step('the Campaign Tracker', trackerUrl, () => getValues(token, sources.trackerId, `'${sources.trackerTab.replace(/'/g, "''")}'`));
  const targets = parseTimeOutTargets(values, sources.trackerHeaderRow, { trackerTimeZone: trackerMeta.timeZone || 'Australia/Sydney', reportTimeZone });

  // 2. Maths (pure; a bug here stops before anything is written)
  onStep?.('calculate');
  const today = todaySerial(reportTimeZone, now);
  let result: TimeOutResult;
  let spec: ReturnType<typeof timeOutModule.buildSheetSpec>;
  try {
    result = calculateTimeOut({ rows, targets, today }, config);
    spec = timeOutModule.buildSheetSpec(result, config);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new ModuleError('timeout', runId, e);
  }

  // 3. New spreadsheet in the Results folder
  onStep?.('create');
  const name = sources.reportPrefix + isoDay(now, reportTimeZone);
  const created = await createSpreadsheet(token, name, reportTimeZone, 'en_GB');
  const reportTab = created.sheets[0];
  if (!reportTab) throw new ValidationError('Google created the spreadsheet without a tab.', [], 'Try again.');

  let inResultsFolder = true;
  try {
    await moveToFolder(token, created.spreadsheetId, sources.outputFolderId);
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
    inResultsFolder = false;
  }

  // 4. Write every tab in one change
  onStep?.('write');
  await batchUpdate(
    token,
    created.spreadsheetId,
    buildTimeOutRequests({
      ids: { report: reportTab.sheetId, ...SHEET_IDS },
      spec,
      result,
      config,
      trackerTab: sources.trackerTab,
      lastUpdated: formatLastUpdated(now, reportTimeZone),
    }),
  );

  return {
    runId,
    spreadsheetId: created.spreadsheetId,
    name,
    url: created.url,
    downloads: exportLinks(created.spreadsheetId, reportTab.sheetId),
    ioCount: result.rows.length,
    urgentCampaigns: result.urgent.length,
    marginCampaigns: result.marginIssues.length,
    lowestMargin: result.marginIssues[0]?.head.projectedMargin ?? null,
    inResultsFolder,
    warnings: result.warnings,
    breakdown: `${result.groups.length} ${result.groups.length === 1 ? 'campaign' : 'campaigns'} · all counted as CPC for now`,
  };
}
