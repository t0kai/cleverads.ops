/**
 * Starting list until the Hub Data sheet is connected (phase 3). After that, advertisers are
 * read from Hub Data and edited from the app; this file is only the first-run seed.
 */

/** Where an advertiser's inputs and outputs live in Google. File IDs are not secrets; access is checked by Google. */
export interface TrackerSources {
  /** Campaign Tracker spreadsheet that holds dates and targets. The app only reads it. */
  readonly trackerId: string;
  readonly trackerTab: string;
  /** Row number (1-based) of the header row: Campaign name, Start date, End date, target column. */
  readonly trackerHeaderRow: number;
  /** Drive folder that receives the reports. */
  readonly outputFolderId: string;
  /** Report file name = prefix + yyyy-mm-dd. */
  readonly reportPrefix: string;
}

/** ACM also copies a template's "Formula" tab into every report (same as the Apps Script). */
export interface ReportSources extends TrackerSources {
  readonly templateId: string;
  readonly templateTab: string;
}

export interface AdvertiserSummary {
  readonly id: string;
  readonly name: string;
  /** Rules module id from advertisers/registry.ts, or null while its module is being built. */
  readonly moduleId: string | null;
  /** Shown next to the module name, e.g. "v2". */
  readonly rulesVersion?: string;
  readonly timeZone: string;
  readonly sources: ReportSources | TrackerSources | null;
}

export const SEED_ADVERTISERS: readonly AdvertiserSummary[] = [
  {
    id: 'acm',
    name: 'ACM',
    moduleId: 'acm',
    rulesVersion: 'v2',
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
  {
    id: 'pinstripe',
    name: 'Pinstripe',
    moduleId: 'pinstripe',
    rulesVersion: 'v1',
    timeZone: 'Australia/Sydney',
    sources: {
      // Same CAMPAIGN TRACKER GLOBAL file as ACM, Pinstripe's own tab. Read only.
      trackerId: '157r8wGSMc11tV6jvRCny3JxUlHLxOose_HMikAm8BY8',
      trackerTab: 'Private Media Operations (Pinstripe)',
      trackerHeaderRow: 5,
      // Same Results folder as ACM.
      outputFolderId: '1Z_YVfaCfV4CnqB6uKJb_Blh3Fn0EE0PK',
      reportPrefix: 'Pinstripe Optimization Report - ',
    },
  },
];
