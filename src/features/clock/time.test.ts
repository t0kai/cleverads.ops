import { describe, expect, it } from 'vitest';
import { clockFace, isValidTimeZone } from './time';

describe('clockFace', () => {
  const instant = new Date('2026-10-03T04:37:15Z');
  it('shows Sydney time with AEST before daylight saving starts', () => {
    const f = clockFace(instant, 'Australia/Sydney');
    expect(f.hm).toBe('2:37');
    expect(f.seconds).toBe(':15');
    expect(f.ampm).toBe('PM');
    expect(f.zoneAbbr).toBe('AEST');
    expect(f.date).toBe('Sat, 3 Oct');
  });
  it('switches to AEDT after the first Sunday in October', () => {
    expect(clockFace(new Date('2026-10-05T04:00:00Z'), 'Australia/Sydney').zoneAbbr).toBe('AEDT');
  });
  it('rejects unknown zones', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('Asia/Dhaka')).toBe(true);
  });
});
