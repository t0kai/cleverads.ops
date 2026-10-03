/**
 * Dates are kept as Google Sheets serial numbers (days since 1899-12-30, time as a fraction),
 * exactly as the Sheets API returns them with dateTimeRenderOption=SERIAL_NUMBER.
 * This keeps the engine free of time-zone surprises: "today" is passed in.
 */
const MS_PER_DAY = 86_400_000;
const EPOCH_UTC = Date.UTC(1899, 11, 30);

/** Serial for a calendar date (no time part). */
export function serialFromYmd(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - EPOCH_UTC) / MS_PER_DAY);
}

/** "dd/mm/yyyy" → serial, or null when the text is not a date. */
export function serialFromDmy(text: string): number | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  return serialFromYmd(Number(m[3]), Number(m[2]), Number(m[1]));
}

/** Today's serial (whole day) in a given IANA time zone, like Sheets TODAY() in that zone. */
export function todaySerial(timeZone: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return serialFromYmd(get('year'), get('month'), get('day'));
}

/** UTC offset of a time zone at an instant, in minutes (e.g. Asia/Dhaka → 360). */
export function zoneOffsetMinutes(timeZone: string, instantMs: number): number {
  const label =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(new Date(instantMs))
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(label);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/**
 * A serial read from a sheet in one time zone, as a sheet in another time zone holds the same moment.
 * This is what happens when Apps Script copies a date from the Campaign Tracker (Australia/Sydney)
 * into a report in Asia/Dhaka: 5 Sep 00:00 Sydney becomes 4 Sep 20:00 Dhaka.
 */
export function convertSerialZone(serial: number, fromZone: string, toZone: string): number {
  if (fromZone === toZone) return serial;
  const wallMs = EPOCH_UTC + Math.round(serial * MS_PER_DAY);
  // Two passes so a date next to a daylight-saving change gets the right offset.
  let instant = wallMs - zoneOffsetMinutes(fromZone, wallMs) * 60_000;
  instant = wallMs - zoneOffsetMinutes(fromZone, instant) * 60_000;
  const targetWall = instant + zoneOffsetMinutes(toZone, instant) * 60_000;
  return (targetWall - EPOCH_UTC) / MS_PER_DAY;
}

/** Serial → "dd/mm/yyyy" for display. */
export function formatSerialDmy(serial: number): string {
  const d = new Date(EPOCH_UTC + Math.floor(serial) * MS_PER_DAY);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}
