'use client';

import { useState, type ReactNode } from 'react';
import s from '../analytics.module.css';

function Arrow({ dir }: { dir: 'up' | 'down' | 'flat' }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      {dir === 'flat' ? <path d="M1 5h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : <path d={dir === 'up' ? 'M5 1.5 9 7.5H1z' : 'M5 8.5 1 2.5h8z'} fill="currentColor" />}
    </svg>
  );
}

/**
 * A change in words, never colour alone: arrow + "12.3% increase".
 * Green = good for us, red = bad, grey = volume (neither good nor bad).
 */
export function Delta({ value, lowerIsBetter, neutral, big, empty = 'No earlier data' }: { value: number | null; lowerIsBetter?: boolean; neutral?: boolean; big?: boolean; empty?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className={`${s.pill} ${s.pillNone}`}>{empty}</span>;
  const flat = Math.abs(value) < 0.5;
  const tone = flat || neutral ? s.pillNeutral : (lowerIsBetter ? value < 0 : value > 0) ? s.pillGood : s.pillBad;
  const word = flat ? 'No change' : value > 0 ? 'increase' : 'decrease';
  return (
    <span className={`${s.pill} ${tone} ${big ? s.pillBig : ''}`} aria-label={flat ? 'No change' : `${Math.abs(value).toFixed(1)}% ${word}`}>
      <Arrow dir={flat ? 'flat' : value > 0 ? 'up' : 'down'} />
      {flat ? (
        <span>No change</span>
      ) : (
        <>
          <b>{Math.abs(value).toFixed(1)}%</b>
          <span>{word}</span>
        </>
      )}
    </span>
  );
}

/** Small "i": the explanation shows on hover, keyboard focus or tap. */
export function Info({ label, children, align = 'left' }: { label: string; children: ReactNode; align?: 'left' | 'right' }) {
  return (
    <span className={s.info}>
      <button type="button" className={s.infoBtn} aria-label={`What is ${label}?`}>
        i
      </button>
      <span role="tooltip" className={`${s.tip} ${align === 'right' ? s.tipRight : ''}`}>
        <b>{label}</b>
        {children}
      </span>
    </span>
  );
}

/** Segmented switch (tabs). */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className={s.seg} role="tablist" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} className={value === v ? s.segOn : undefined} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/* ---------- Sorting ---------- */
export type SortDir = 'asc' | 'desc';
export interface SortState<K extends string> {
  readonly key: K;
  readonly dir: SortDir;
}

/** Click a heading to sort, again to flip. Text starts A→Z, numbers start biggest first. */
export function useSort<K extends string>(initial: K, initialDir: SortDir = 'desc', textKeys: readonly K[] = []) {
  const [sort, setSort] = useState<SortState<K>>({ key: initial, dir: initialDir });
  const toggle = (key: K) => setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: textKeys.includes(key) ? 'asc' : 'desc' }));
  return [sort, toggle, setSort] as const;
}

/** Empty values always go to the bottom, whichever way the column is sorted. */
export function compareValues(a: string | number | null, b: string | number | null, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const r = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : Number(a) - Number(b);
  return dir === 'asc' ? r : -r;
}

export function SortHead<K extends string>({ k, label, sort, onSort, align = 'left' }: { k: K; label: string; sort: SortState<K>; onSort: (k: K) => void; align?: 'left' | 'right' }) {
  const on = sort.key === k;
  return (
    <button
      type="button"
      className={`${s.sortHead} ${on ? s.sortOn : ''} ${align === 'right' ? s.sortRight : ''}`}
      onClick={() => onSort(k)}
      aria-label={`Sort by ${label}${on ? (sort.dir === 'asc' ? ', now lowest first' : ', now highest first') : ''}`}
    >
      {label}
      <span className={s.sortIcon} aria-hidden="true">
        {on ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </button>
  );
}

export function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12m0 0 5-5m-5 5-5-5M4 19h16" />
    </svg>
  );
}

export function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg className={spinning ? s.spin : undefined} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 4v5h-5" />
    </svg>
  );
}
