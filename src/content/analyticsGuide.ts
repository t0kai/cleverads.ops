/**
 * Performance Analytics user guide text. Change the wording here; no other code needs to change.
 * Step numbers match the numbered markers drawn on each screenshot in public/guide/analytics/.
 */

export interface MapPart {
  /** Marker number on the page map. */
  readonly no: string;
  readonly title: string;
  readonly text: string;
  /** id of the part card below, used for the jump link. */
  readonly target: string;
}

export const ANALYTICS_MAP: readonly MapPart[] = [
  { no: '1', title: 'Left menu', text: 'Click Performance Analytics to open the page.', target: 'ag-top' },
  { no: '2', title: 'Page header', text: 'Last update time, a link to this guide and the Refresh button.', target: 'ag-top' },
  { no: '3', title: 'Filters', text: 'Choose the advertiser, months and cost type. Everything below follows them.', target: 'ag-top' },
  { no: '4', title: 'Headline numbers', text: 'Cost, impressions, clicks, CTR, eCPM and eCPC for your choices.', target: 'ag-kpis' },
  { no: '5', title: 'Rates over time', text: 'eCPM or eCPC for every month, with the trend, highest and lowest month.', target: 'ag-rates' },
  { no: '6', title: 'Has eCPM gone up since the start?', text: 'Start of the period against now, for the same clients and for all clients.', target: 'ag-growth' },
  { no: '7', title: 'Compare', text: 'Put any two periods or two advertisers side by side.', target: 'ag-compare' },
  { no: '8', title: 'Clients', text: 'Every advertiser with cost, eCPM, change and a small trend line.', target: 'ag-clients' },
  { no: '9', title: 'Campaign log', text: 'Every row of the data sheet. Search, sort and download it.', target: 'ag-log' },
];

export interface GuidePart {
  readonly id: string;
  /** Marker number on the page map, shown as a badge. */
  readonly mapNo: string;
  readonly title: string;
  readonly image: string;
  readonly imageAlt: string;
  /** Width / height of the screenshot, so the page doesn't jump while it loads. */
  readonly width: number;
  readonly height: number;
  readonly shows: string;
  /** Step i matches marker i+1 on the screenshot. */
  readonly steps: readonly { readonly label: string; readonly text: string }[];
  readonly tip: string;
}

const IMG = '/guide/analytics/';

export const ANALYTICS_PARTS: readonly GuidePart[] = [
  {
    id: 'ag-top',
    mapNo: '2–3',
    title: 'Header and filters',
    image: `${IMG}top.webp`,
    imageAlt: 'The page header with the Advertiser, From, To and Cost filters, the update time, the guide link and the Refresh button, marked 1 to 8.',
    width: 1400,
    height: 276,
    shows: 'The filters decide what every other part of the page shows. Change one and the whole page updates at once.',
    steps: [
      { label: 'Advertiser', text: 'Pick one advertiser, or All advertisers to see the total. Picking one also adds a Month by month table.' },
      { label: 'From', text: 'The first month to include.' },
      { label: 'To', text: 'The last month to include. The newest month in the sheet is chosen when the page opens.' },
      { label: 'Cost', text: 'Total cost = media + DV fee + FS fee. Media cost = the DV360 media cost only. eCPM, eCPC and every cost figure follow this switch.' },
      { label: 'Reset filters', text: 'Appears only after you change something. Puts every filter back to the start.' },
      { label: 'Updated time', text: 'When the numbers were last read from the data sheet. In preview mode it shows Sample data instead.' },
      { label: 'How to use this page', text: 'Opens this guide.' },
      { label: 'Refresh', text: 'Reads the data sheet again. Use it after you paste a new month. Wait 30 seconds between presses.' },
    ],
    tip: 'The web address keeps your filters. Copy it from the address bar and anyone in the team opens exactly the same view.',
  },
  {
    id: 'ag-kpis',
    mapNo: '4',
    title: 'Headline numbers',
    image: `${IMG}kpis.webp`,
    imageAlt: 'Six number tiles: Cost, Impressions, Clicks, CTR, eCPM and eCPC, marked 1 to 3.',
    width: 1400,
    height: 229,
    shows: 'Six totals for the advertiser and months you picked: Cost, Impressions, Clicks, CTR, eCPM and eCPC.',
    steps: [
      { label: 'The number', text: 'The total for your choices. Cost follows the Total cost / Media cost switch.' },
      { label: 'Change pill', text: 'Compares with the same number of months just before your From month ("vs previous 6 mo"). Green is better, red is worse, grey is just volume. With no earlier months it shows how many months are included instead.' },
      { label: 'Rates', text: 'CTR, eCPM and eCPC are worked out from the totals (for example cost ÷ impressions × 1,000), never by averaging months.' },
    ],
    tip: 'To read one quarter, set From and To to its first and last month. The pill then compares it with the quarter before.',
  },
  {
    id: 'ag-rates',
    mapNo: '5',
    title: 'Rates over time',
    image: `${IMG}rates.webp`,
    imageAlt: 'A bar chart of eCPM by month with the eCPM / eCPC switch, a hover tooltip and three side cards, marked 1 to 5.',
    width: 1400,
    height: 573,
    shows: 'One bar per month for eCPM or eCPC, with a dashed line for the overall trend.',
    steps: [
      { label: 'eCPM / eCPC', text: 'Switch the chart between cost per 1,000 impressions and cost per click.' },
      { label: 'A bar', text: 'Hover over (or tap) a bar to see that month’s rate and how it changed from the month before.' },
      { label: 'Overall trend', text: 'How much the rate moved across the whole period, and whether it was steady or bumpy. Needs at least 3 months.' },
      { label: 'Highest month', text: 'The most expensive month in the period.' },
      { label: 'Lowest month', text: 'The cheapest month in the period.' },
    ],
    tip: 'For eCPM and eCPC lower is better, so a rise is shown in red.',
  },
  {
    id: 'ag-growth',
    mapNo: '6',
    title: 'Has eCPM gone up since the start?',
    image: `${IMG}growth.webp`,
    imageAlt: 'The growth card with the two periods, the Same clients, All clients and Overall trend cards and the Why it moved line, marked 1 to 6.',
    width: 1400,
    height: 386,
    shows: 'Compares the first months of your period ("start") with the last months ("now"). Up to 6 months each, or half the period if it is shorter.',
    steps: [
      { label: 'The two periods', text: 'Which months count as the start and which as now.' },
      { label: 'Same clients', text: 'Only advertisers that ran in both periods. This is the fairest answer, so read it first.' },
      { label: 'Info (i)', text: 'Click for a plain explanation of how the card is worked out.' },
      { label: 'All clients', text: 'Every advertiser, including new and stopped ones. It can move just because the mix of clients changed.' },
      { label: 'Overall trend', text: 'The month-by-month trend line across the whole period.' },
      { label: 'Why it moved', text: 'Splits the change into Price (the same clients paying more or less) and Client mix (more spend from dearer or cheaper clients).' },
    ],
    tip: 'If Same clients is flat but All clients is up, prices did not rise. Spend simply moved towards more expensive clients.',
  },
  {
    id: 'ag-compare',
    mapNo: '7',
    title: 'Compare',
    image: `${IMG}compare.webp`,
    imageAlt: 'The Compare section with Compare by, side A, Swap, side B, the results table and Who changed most, marked 1 to 6.',
    width: 1400,
    height: 1338,
    shows: 'Put any two periods, or two advertisers, side by side. The table shows every metric for A and B and the change from A to B.',
    steps: [
      { label: 'Compare by', text: 'Month, Quarter, Half-year or Year. The period lists below change to match.' },
      { label: 'Side A', text: 'Pick an advertiser (or All advertisers) and a period.' },
      { label: 'Swap', text: 'Swaps A and B.' },
      { label: 'Side B', text: 'Pick the second advertiser and period. Use the same period on both sides to compare two clients.' },
      { label: 'Results', text: 'Every metric for A and B, with the change from A to B. Green is better, red is worse.' },
      { label: 'Who changed most', text: 'Clients whose eCPM moved most between A and B. Click a client to compare just that client. Clients found on one side only are listed under Only in A / Only in B.' },
    ],
    tip: 'A period that is not finished yet shows a note such as "2 of 3 mo". Compare it with care, as it has fewer months.',
  },
  {
    id: 'ag-clients',
    mapNo: '8',
    title: 'Clients',
    image: `${IMG}clients.webp`,
    imageAlt: 'The Clients table with sortable headings, client names, eCPM change pills, trend lines and Show all, marked 1 to 5.',
    width: 1400,
    height: 769,
    shows: 'Every advertiser in your period with cost, impressions, eCPM, eCPM change and a small trend line. The top 8 by cost are shown first.',
    steps: [
      { label: 'Sort', text: 'Click any heading to sort by it. Click again to reverse. On a phone, use the Sort by list.' },
      { label: 'Client name', text: 'Click a client to focus the whole page on that client. The filter at the top changes too.' },
      { label: 'eCPM change', text: 'Start of the period against now. Hover to see both rates. "New since the start" means no spend at the start; "Not active lately" means no spend now.' },
      { label: 'Trend', text: 'A small line of the client’s eCPM month by month.' },
      { label: 'Show all', text: 'Shows every client. Click Show top 8 to shorten the list again.' },
    ],
    tip: 'Sort by eCPM change to see which clients pushed the average up.',
  },
  {
    id: 'ag-month',
    mapNo: '8b',
    title: 'Month by month (one advertiser)',
    image: `${IMG}month.webp`,
    imageAlt: 'The Month by month table for one advertiser with Back to all advertisers, sortable headings, Download CSV and the change pill, marked 1 to 5.',
    width: 1400,
    height: 1041,
    shows: 'Appears only when one advertiser is picked. One row per month with every metric.',
    steps: [
      { label: 'Title', text: 'Shows which advertiser you are looking at.' },
      { label: 'Back to all advertisers', text: 'Clears the advertiser filter and returns to the full view.' },
      { label: 'Sort', text: 'Click a heading to sort by it.' },
      { label: 'Download CSV', text: 'Saves this table as a file that opens in Excel or Google Sheets.' },
      { label: 'eCPM vs last month', text: 'How the rate moved from the month before.' },
    ],
    tip: 'Use Rows per page and the page arrows at the bottom to see older months.',
  },
  {
    id: 'ag-log',
    mapNo: '9',
    title: 'Campaign log',
    image: `${IMG}log.webp`,
    imageAlt: 'The Campaign log table with search, Download CSV, sortable Month heading, a fee tooltip on Total cost and the page controls, marked 1 to 5.',
    width: 1400,
    height: 871,
    shows: 'Every row from the data sheet that matches your filters: advertiser, month, impressions, clicks, CTR, media cost, total cost, eCPM and eCPC.',
    steps: [
      { label: 'Search', text: 'Type part of an advertiser name or a month, for example "Aug 2026".' },
      { label: 'Download CSV', text: 'Saves the rows you can see (after search and filters), including the DV fee and FS fee columns.' },
      { label: 'Sort', text: 'Click a heading to sort. Newest month is first by default.' },
      { label: 'Total cost', text: 'Hover over (or tap) a total to see how it splits into media, DV fee and FS fee.' },
      { label: 'Rows and pages', text: 'Choose how many rows to show and move between pages.' },
    ],
    tip: 'This is the quickest place to check one number against the data sheet.',
  },
];

export interface GuideTask {
  readonly key: string;
  readonly title: string;
  readonly steps: readonly string[];
}

export const ANALYTICS_TASKS: readonly GuideTask[] = [
  {
    key: 'quarter',
    title: 'See one client for one quarter',
    steps: ['In Advertiser, pick the client.', 'Set From to the first month of the quarter and To to the last month.', 'Read the headline numbers. The pills compare it with the quarter before.'],
  },
  {
    key: 'two-quarters',
    title: 'Compare two quarters',
    steps: ['Go to Compare and choose Quarter.', 'Pick the first quarter on side A and the second on side B.', 'Read the change column. Click a client under Who changed most to compare just that client.'],
  },
  {
    key: 'two-clients',
    title: 'Compare two clients',
    steps: ['Go to Compare.', 'On side A pick the first advertiser, on side B the second.', 'Choose the same period on both sides.'],
  },
  {
    key: 'why-up',
    title: 'Find which client made eCPM go up',
    steps: ['Read Has eCPM gone up since the start? and look at Why it moved.', 'In Clients, sort by eCPM change.', 'Or use Compare and read Who changed most.'],
  },
  {
    key: 'fees',
    title: 'See the fees for a month',
    steps: ['Go to Campaign log and search for the month, for example "Aug 2026".', 'Hover over a Total cost to see media, DV fee and FS fee.', 'Or click Download CSV to get the fee columns.'],
  },
  {
    key: 'excel',
    title: 'Download the data for Excel',
    steps: ['Set the filters you need.', 'Click Download CSV in Campaign log (all rows) or in Month by month (one advertiser).', 'Open the file in Excel or Google Sheets.'],
  },
  {
    key: 'share',
    title: 'Share exactly what you see',
    steps: ['Set the filters.', 'Copy the web address from the address bar.', 'Send it to a teammate. They need to sign in with a company Google account.'],
  },
  {
    key: 'media',
    title: 'See media cost only (no fees)',
    steps: ['In Cost at the top, click Media cost.', 'Every cost, eCPM and eCPC on the page now leaves out the DV and FS fees.'],
  },
  {
    key: 'new-month',
    title: 'Get the newest month after updating the sheet',
    steps: ['Paste the month into the data sheet (see Updating the data below).', 'Check that Row check shows ✓ OK for every new row.', 'Click Refresh. If the month is still missing, wait up to 5 minutes and refresh again.'],
  },
];

export const UPDATE_STEPS: readonly { readonly title: string; readonly text: string }[] = [
  { title: 'Download from DV360', text: "Last month's report with these 7 columns, in this order: Advertiser · Year · Month · Partner Currency · Impressions · Clicks · Media Cost (Partner Currency). Use the AUD (Partner Currency) report." },
  { title: 'Paste on the Data tab', text: 'Open the CleverAds Performance Data sheet. Click column A in the first empty row under the data and paste (⌘⇧V / Ctrl+Shift+V pastes values only). Heading, total and "Report Time" lines are ignored.' },
  { title: 'Check the Row check column', text: 'Every new row should say ✓ OK. Don’t type in columns H to Q: they fill in by themselves.' },
  { title: 'Refresh the page', text: 'Open Performance Analytics and click Refresh. Without a refresh, the new month shows within 5 minutes.' },
];

export const ROW_CHECKS: readonly { readonly value: string; readonly meaning: string; readonly kind: 'ok' | 'warn' | 'bad' }[] = [
  { value: '✓ OK', meaning: 'All good. The row shows on the page.', kind: 'ok' },
  { value: 'New advertiser – add to Advertisers tab', meaning: 'Add the name on the Advertisers tab exactly as DV360 writes it, with its DV fee % and FS fee %. Until then 10% and 4.5% are used.', kind: 'warn' },
  { value: 'Fix: pasted twice', meaning: 'The same advertiser and month is there twice. Delete one of the rows.', kind: 'bad' },
  { value: 'Fix: month (use 2026/09)', meaning: 'The Month must look like DV360’s: year/month, for example 2026/09.', kind: 'bad' },
  { value: 'Fix: numbers', meaning: 'Impressions, Clicks or Media Cost is empty or not a number.', kind: 'bad' },
  { value: 'Fix: not AUD', meaning: 'The row is in another currency. Use the AUD (Partner Currency) report.', kind: 'bad' },
  { value: 'Not data – delete row', meaning: 'A heading, total or "Report Time" line from DV360. The page ignores it; delete it to keep things tidy.', kind: 'warn' },
];

export const ANALYTICS_WORDS: readonly { readonly word: string; readonly meaning: string }[] = [
  { word: 'Media cost', meaning: 'What DV360 charged for the ads, before fees.' },
  { word: 'DV fee / FS fee', meaning: 'Each advertiser’s fee %, set on the Advertisers tab of the data sheet (usually 10% and 4.5%). Changing it there updates all of that advertiser’s months.' },
  { word: 'Total cost', meaning: 'Media cost + DV fee + FS fee.' },
  { word: 'CTR', meaning: 'Clicks ÷ impressions. Higher is better.' },
  { word: 'eCPM', meaning: 'Cost for 1,000 impressions. Lower is better.' },
  { word: 'eCPC', meaning: 'Cost for one click. Lower is better.' },
  { word: 'Start / now', meaning: 'The first months and the last months of the period you picked.' },
];

export const ANALYTICS_FIXES: readonly { readonly problem: string; readonly fix: string }[] = [
  { problem: 'Google says Error 400: origin_mismatch', fix: 'Open the app from https://cleverads-ops.vercel.app, not from a different Vercel link.' },
  { problem: 'Signed in with the wrong account', fix: 'Sign out from the left menu and sign in with your @cleverads.com.au account.' },
  { problem: 'The page says it can’t open the data sheet', fix: 'Ask the developer to check the sheet is still shared with the app.' },
  { problem: 'The new month is missing', fix: 'Check Row check shows ✓ OK in the data sheet, click Refresh, and wait up to 5 minutes.' },
  { problem: 'Too many refreshes', fix: 'Wait 30 seconds and click Refresh again.' },
  { problem: 'A yellow banner says some rows were skipped', fix: 'Click See which. Fix those rows in the data sheet, then click Refresh.' },
  { problem: 'One part says it couldn’t load', fix: 'Click Try again in that part. The rest of the page keeps working.' },
];
