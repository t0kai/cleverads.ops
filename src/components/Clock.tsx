'use client';

import { useEffect, useState } from 'react';
import { CLOCK_ZONES, clockFace, isValidTimeZone, shortTime } from '@/features/clock/time';
import s from './Clock.module.css';

const STORAGE_KEY = 'clock-zone';

function readSaved(fallback: string): string {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && isValidTimeZone(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/** Live digital clock. Default zone from config (Australia/Sydney); the viewer's pick is remembered on this computer only. */
export function Clock({ defaultZone }: { defaultZone: string }) {
  const [now, setNow] = useState<Date | null>(null);
  const [zone, setZone] = useState(defaultZone);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setZone(readSaved(defaultZone));
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [defaultZone]);

  const pick = (id: string) => {
    setZone(id);
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* private window: the pick lasts until reload */
    }
  };

  if (!now) return null; // avoid a server/client time mismatch on first paint
  const face = clockFace(now, zone);
  const city = CLOCK_ZONES.find((z) => z.id === zone)?.city ?? zone;

  return (
    <div className={s.wrap}>
      <button type="button" className={s.face} aria-expanded={open} aria-label={`Clock, ${city}. Change time zone`} onClick={() => setOpen(!open)}>
        <span className={s.time}>
          <span className={s.hm}>{face.hm}</span>
          <span className={s.sec}>{face.seconds}</span>
          <span className={s.ampm}>{face.ampm}</span>
        </span>
        <span className={s.meta}>
          <span className={s.live} />
          {city} · {face.zoneAbbr} · {face.date}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E8ECFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open ? (
        <div role="menu" aria-label="Time zone" className={s.menu}>
          <div className={s.menuTitle}>Time zone</div>
          {CLOCK_ZONES.map((z) => (
            <button
              key={z.id}
              type="button"
              role="menuitemradio"
              aria-checked={z.id === zone}
              className={`${s.zone} ${z.id === zone ? s.zoneOn : ''}`}
              onClick={() => pick(z.id)}
            >
              <span>{z.city}</span>
              <span className={s.zoneTime}>{shortTime(now, z.id)}</span>
            </button>
          ))}
          <button type="button" className={s.reset} onClick={() => pick(defaultZone)}>
            Back to Sydney time (default)
          </button>
        </div>
      ) : null}
    </div>
  );
}
