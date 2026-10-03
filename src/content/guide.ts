/** User guide text. Change the wording here; no other code needs to change. */
export const QUICK_START = [
  { title: 'Download from DV360', text: 'Insertion orders › Download the list as CSV.' },
  { title: 'Pick the advertiser', text: 'Advertisers › New report next to its name.' },
  { title: 'Upload and check', text: 'Drop the CSV in. Pick a type for any New campaign.' },
  { title: 'Build and open', text: 'Build the sheet, then open it or download it.' },
] as const;

export interface GuideTopic {
  readonly key: string;
  readonly title: string;
  readonly sub: string;
  readonly steps: readonly string[];
  readonly tip: string;
}

export const GUIDE_TOPICS: readonly GuideTopic[] = [
  {
    key: 'report',
    title: "Build today's report",
    sub: 'Upload the DV360 export and get the Google Sheet',
    steps: [
      'In DV360, open Insertion orders and download the list as CSV (Name, Impressions, Clicks, Revenue, Objective).',
      'Here, go to Advertisers and click New report next to the advertiser.',
      'Drag the CSV into the upload box, or click Browse files.',
      'Read the checks. Pick an ad type for any campaign marked New.',
      'Click Build optimization sheet. When it is ready, click Open in Google Sheets or Download.',
    ],
    tip: "Each advertiser uses only its own rules and rates, so one advertiser's settings never change another's report.",
  },
  {
    key: 'type',
    title: 'Pick an ad type for each campaign',
    sub: "Each campaign uses its own type's rates",
    steps: [
      'After uploading, the list Ad type for each campaign shows every campaign in the file.',
      'Campaigns from earlier runs already have their type and show Remembered.',
      'For a campaign marked New: pick a type, choose its ad type from the dropdown.',
      'Your choice is saved and used automatically next time. Change it any time from the same dropdown.',
    ],
    tip: 'A 2nd IO uses the same ad type as its main campaign unless you change it.',
  },
  {
    key: 'newtype',
    title: 'Create a new ad type',
    sub: 'Name it as agreed with the client and pick its parameters',
    steps: [
      'Go to Advertisers, click the gear next to the advertiser, then Add new ad type.',
      'Type its name, for example Native lead gen.',
      'Choose what it is billed per (click, 1,000 impressions, completed view and so on) and how campaigns get this type.',
      'Tick the parameters it needs. If the client agreed something extra, add a custom parameter and choose how it is used in the sheet.',
      'Click Add ad type. It appears as a new tab for that advertiser only.',
    ],
    tip: 'Ad types belong to one advertiser. Creating one for ACM does not add it anywhere else.',
  },
  {
    key: 'rates',
    title: 'Enter rates and numbers',
    sub: 'Client rate, fees, margin and healthy ranges',
    steps: [
      "Open the advertiser's settings with the gear button.",
      "Click the ad type's tab, then fill in each box: client rate, target buffer, FS fee, DV cost, Nova fee, minimum margin and healthy ranges.",
      'Type plain numbers. Percentages can be typed like 15%.',
      'Click Save changes.',
    ],
    tip: 'New numbers apply from the next report. Reports already built are not changed.',
  },
  {
    key: 'adv',
    title: 'Add a new advertiser',
    sub: 'Set it up once, then build reports every day',
    steps: [
      'In Advertisers, click Add advertiser.',
      'Fill in the name, DV360 advertiser ID, target sheet link and Drive folder.',
      'Choose Use an existing module if it works like ACM, or Needs its own rules if billing, columns or tabs are different.',
      'Add its ad types and their rates, then click Add advertiser.',
    ],
    tip: 'An advertiser that needs its own rules shows Waiting for module until the developer builds them.',
  },
  {
    key: 'remove',
    title: 'Archive or delete an advertiser',
    sub: 'Hide it for now, or remove it for good',
    steps: [
      'Open its settings with the gear button and scroll to Remove this advertiser.',
      'Archive hides it from the list. Its settings and history stay, and it can be brought back.',
      'Delete removes it and its settings after you confirm.',
    ],
    tip: 'Reports already saved in Google Drive are never deleted from here.',
  },
  {
    key: 'share',
    title: 'Download or share a report',
    sub: 'Excel, PDF or CSV, or a link',
    steps: [
      'On the ready screen, Open in Google Sheets opens the full report.',
      'Download gives Excel (all tabs), PDF (to print or share) or CSV (Report tab only).',
      'Copy link copies the sheet link to paste in chat or email.',
    ],
    tip: 'Every report you build is also listed in History, with Download and Open sheet buttons.',
  },
];

export const FIXES = [
  { problem: "Sign-in says the account isn't allowed", fix: 'Sign in with your @cleverads.com.au Google account, not a personal Gmail.' },
  { problem: 'The CSV is rejected or columns are missing', fix: "Download it again from DV360 › Insertion orders. Don't open and re-save it in Excel first; that can change the columns." },
  { problem: 'Required Clicks is blank for some rows', fix: "Those IOs have no target in the advertiser's target sheet. Add them there, then build again." },
  { problem: 'A campaign says New: pick a type', fix: 'It is a new campaign. Pick its ad type in the dropdown; it is remembered next time.' },
  { problem: 'Building stopped with an error', fix: 'Nothing half-finished is left in Drive. Click Build again. If it fails again, send the error message to the developer.' },
  { problem: 'The advertiser says Waiting for module', fix: 'Its own rules have not been built yet. Message the developer to have them added.' },
  { problem: "The sheet won't open or says no access", fix: 'Sign out and sign in again, and allow Sheets and Drive access when Google asks.' },
] as const;

export const PROBLEM_TYPES = [
  "Report won't build",
  'Numbers in the sheet look wrong',
  'Ad types or rates',
  'Sign-in or access',
  'Idea or request',
  'Something else',
] as const;
