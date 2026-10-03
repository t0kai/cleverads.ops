/**
 * Starting list until the Hub Data sheet is connected (phase 3). After that, advertisers are
 * read from Hub Data and edited from the app; this file is only the first-run seed.
 */
export interface AdvertiserSummary {
  readonly id: string;
  readonly name: string;
  /** Rules module id from advertisers/registry.ts, or null while its module is being built. */
  readonly moduleId: string | null;
  readonly timeZone: string;
}

export const SEED_ADVERTISERS: readonly AdvertiserSummary[] = [
  { id: 'acm', name: 'ACM', moduleId: 'acm', timeZone: 'Australia/Sydney' },
];
