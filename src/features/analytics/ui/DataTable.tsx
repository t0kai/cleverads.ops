'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { compareValues, DownloadIcon, SortHead, useSort } from './bits';
import { downloadCsv } from './csv';
import s from '../analytics.module.css';

export interface Column<T> {
  readonly key: string;
  readonly label: string;
  /** What is shown in the cell. */
  readonly render: (row: T) => ReactNode;
  /** Used for sorting and for the CSV. */
  readonly value: (row: T) => string | number | null;
  readonly align?: 'left' | 'right';
  /** On phones, primary columns form the card title; the rest become label/value pairs. */
  readonly primary?: boolean;
  /** Only in the CSV download, not on screen (keeps the table narrow). */
  readonly csvOnly?: boolean;
}

/**
 * Sortable, searchable, paged table with CSV export.
 * Desktop: a normal table. Phones: one small card per row, so nothing runs off the screen.
 */
export function DataTable<T>({
  columns: allColumns,
  rows,
  rowKey,
  initialSort,
  initialDir = 'desc',
  searchText,
  searchPlaceholder = 'Search…',
  csvName,
  pageSizes = [10, 25, 50],
  empty = 'Nothing to show for these filters.',
}: {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  initialSort: string;
  initialDir?: 'asc' | 'desc';
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  csvName?: string;
  pageSizes?: readonly number[];
  empty?: string;
}) {
  const columns = allColumns.filter((c) => !c.csvOnly);
  const first = rows[0];
  const textKeys = first === undefined ? [] : columns.filter((c) => typeof c.value(first) === 'string').map((c) => c.key);
  const [sort, onSort, setSort] = useSort<string>(initialSort, initialDir, textKeys);
  const [query, setQuery] = useState('');
  const [size, setSize] = useState(pageSizes[0] ?? 10);
  const [page, setPage] = useState(1);
  const [saved, setSaved] = useState<'idle' | 'done' | 'failed'>('idle');
  useEffect(() => {
    if (saved === 'idle') return;
    const t = setTimeout(() => setSaved('idle'), 2200);
    return () => clearTimeout(t);
  }, [saved]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q && searchText ? rows.filter((r) => searchText(r).toLowerCase().includes(q)) : [...rows];
    const col = columns.find((c) => c.key === sort.key) ?? columns[0];
    return col ? list.sort((a, b) => compareValues(col.value(a), col.value(b), sort.dir)) : list;
  }, [rows, columns, query, searchText, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / size));
  // Back to page 1 when the search, page size or the filtered data changes (not on every render).
  const resetKey = `${query}|${size}|${rows.length}|${first === undefined ? '' : rowKey(first)}`;
  useEffect(() => setPage(1), [resetKey]);
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * size, current * size);
  const from = filtered.length ? (current - 1) * size + 1 : 0;
  const primary = columns.filter((c) => c.primary);
  const rest = columns.filter((c) => !c.primary);

  return (
    <div className={s.dt}>
      <div className={s.dtBar}>
        {searchText ? (
          <label className={s.search}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
          </label>
        ) : (
          <span />
        )}
        <label className={s.mobileSort}>
          <span>Sort by</span>
          <select value={`${sort.key}:${sort.dir}`} onChange={(e) => {
            const [key, dir] = e.target.value.split(':') as [string, 'asc' | 'desc'];
            setSort({ key, dir });
          }}>
            {columns.flatMap((c) => [
              <option key={c.key + 'd'} value={`${c.key}:desc`}>
                {c.label} {c.key === 'month' ? '(newest first)' : textKeys.includes(c.key) ? 'Z→A' : '(high → low)'}
              </option>,
              <option key={c.key + 'a'} value={`${c.key}:asc`}>
                {c.label} {c.key === 'month' ? '(oldest first)' : textKeys.includes(c.key) ? 'A→Z' : '(low → high)'}
              </option>,
            ])}
          </select>
        </label>
        {csvName ? (
          <button
            type="button"
            className={`${s.ghostBtn} ${saved === 'done' ? s.btnDone : ''}`}
            disabled={filtered.length === 0}
            onClick={() =>
              setSaved(
                downloadCsv(
                  csvName,
                  allColumns.map((c) => c.label),
                  filtered.map((r) => allColumns.map((c) => c.value(r))),
                )
                  ? 'done'
                  : 'failed',
              )
            }
          >
            {saved === 'done' ? (
              <>✓ Downloaded {filtered.length.toLocaleString('en-AU')} rows</>
            ) : saved === 'failed' ? (
              <>Download blocked by the browser</>
            ) : (
              <>
                <DownloadIcon /> Download CSV
              </>
            )}
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className={s.emptyState}>{empty}</p>
      ) : (
        <>
          <div className={s.dtScroll}>
            <table className={s.dtTable}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className={c.align === 'right' ? s.right : undefined}>
                      <SortHead k={c.key} label={c.label} sort={sort} onSort={onSort} align={c.align} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={rowKey(r)}>
                    {columns.map((c) => (
                      <td key={c.key} className={c.align === 'right' ? `${s.right} mono` : undefined}>
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className={s.dtCards}>
            {visible.map((r) => (
              <li key={rowKey(r)} className={s.dtCard}>
                <div className={s.dtCardHead}>
                  {primary.map((c) => (
                    <span key={c.key}>{c.render(r)}</span>
                  ))}
                </div>
                <dl>
                  {rest.map((c) => (
                    <div key={c.key}>
                      <dt>{c.label}</dt>
                      <dd className={c.align === 'right' ? 'mono' : undefined}>{c.render(r)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>

          <div className={s.pager}>
            <span>
              Showing <b>{from.toLocaleString('en-AU')}–{Math.min(current * size, filtered.length).toLocaleString('en-AU')}</b> of <b>{filtered.length.toLocaleString('en-AU')}</b>
            </span>
            <div className={s.pagerRight}>
              <label className={s.pageSize}>
                Rows
                <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
                  {pageSizes.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <button type="button" className={s.pageBtn} disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page">
                ‹
              </button>
              <span className={s.pageNum}>
                {current} / {pages}
              </span>
              <button type="button" className={s.pageBtn} disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page">
                ›
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
