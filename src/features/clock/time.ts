/** Time zones offered in the Home clock. Sydney first: CleverAds works for Australian clients. */
export const CLOCK_ZONES = [
  { id: 'Australia/Sydney', city: 'Sydney / Canberra' },
  { id: 'Australia/Melbourne', city: 'Melbourne' },
  { id: 'Australia/Brisbane', city: 'Brisbane' },
  { id: 'Australia/Adelaide', city: 'Adelaide' },
  { id: 'Australia/Perth', city: 'Perth' },
  { id: 'Pacific/Auckland', city: 'Auckland' },
  { id: 'Asia/Dhaka', city: 'Dhaka' },
  { id: 'Asia/Singapore', city: 'Singapore' },
  { id: 'Europe/London', city: 'London' },
  { id: 'America/New_York', city: 'New York' },
  { id: 'UTC', city: 'UTC' },
] as const;

export interface ClockFace {
  readonly hm: string;
  readonly seconds: string;
  readonly ampm: string;
  readonly zoneAbbr: string;
  readonly date: string;
  readonly longDate: string;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function clockFace(now: Date, timeZone: string): ClockFace {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    hm: `${get('hour')}:${get('minute')}`,
    seconds: `:${get('second')}`,
    ampm: get('dayPeriod').toUpperCase(),
    zoneAbbr: get('timeZoneName'),
    date: new Intl.DateTimeFormat('en-AU', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(now),
    longDate: new Intl.DateTimeFormat('en-AU', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now),
  };
}

export function shortTime(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(now);
}
