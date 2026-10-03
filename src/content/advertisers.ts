/**
 * Starting list until the Hub Data sheet is connected (phase 3). After that, advertisers are
 * read from Hub Data and edited from the app; this file is only the first-run seed.
 */

/** Where an advertiser's inputs and outputs live in Google. File IDs are not secrets; access is checked by Google. */
export interface ReportSources {
  /** Campaign Tracker spreadsheet that holds dates and click targets. */
  readonly trackerId: string;
  readonly trackerTab: string;
  /** Row number (1-based) of the header row: Campaign name, Start date, End date, Clicks Target. */
  readonly trackerHeaderRow: number;
  /** Spreadsheet whose "Formula" tab is copied into every report (same as the Apps Script). */
  readonly templateId: string;
  readonly templateTab: string;
  /** Drive folder that receives the reports. */
  readonly outputFolderId: string;
  /** Report file name = prefix + yyyy-mm-dd. */
  readonly reportPrefix: string;
}

export interface AdvertiserSummary {
  readonly id: string;
  readonly name: string;
  /** Rules module id from advertisers/registry.ts, or null while its module is being built. */
  readonly moduleId: string | null;
  readonly timeZone: string;
  readonly sources: ReportSources | null;
}

export const SEED_ADVERTISERS: readonly AdvertiserSummary[] = [
  {
    id: 'acm',
    name: 'ACM',
    moduleId: 'acm',
    timeZone: 'Australia/Sydney',
    sources: {
      trackerId: '157r8wGSMc11tV6jvRCny3JxUlHLxOose_HMikAm8BY8',
      trackerTab: 'ACM',
      trackerHeaderRow: 5,
      templateId: '1t26mKReD1iFmPyN6ok9CryfeQji6wyNoPIVmDwuV01A',
      templateTab: 'Formula',
      outputFolderId: '1Z_YVfaCfV4CnqB6uKJb_Blh3Fn0EE0PK',
      reportPrefix: 'ACM Optimization Report - ',
    },
  },
];
