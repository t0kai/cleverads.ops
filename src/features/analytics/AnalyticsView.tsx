'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ui from '@/components/ui.module.css';
import { useAuth } from '@/features/auth/AuthProvider';
import { defaultWindows, growth } from '@/engine/analytics/growth';
import { addMonths, isMonthKey, monthName, monthRange } from '@/engine/analytics/periods';
import { totals } from '@/engine/analytics/totals';
import type { CostBasis, MonthRow, Rate } from '@/engine/analytics/types';
import s from './analytics.module.css';
import { ClientsSection } from './sections/ClientsSection';
import { CompareSection } from './sections/CompareSection';
import { CampaignLog, MonthByMonth } from './sections/LogSections';
import { GrowthSection, KpiStrip, RatesSection } from './sections/TopSections';
import { RefreshIcon, Seg } from './ui/bits';
import { SectionBoundary } from './ui/SectionBoundary';
import { useAnalyticsData, type LoadError } from './useAnalyticsData';

interface Filters {
  readonly advertiser: string;
  readonly from: string;
  readonly to: string;
  readonly basis: CostBasis;
  readonly rate: Rate;
}

/** Filters live in the address bar, so a view can be shared as a link and survives a reload. */
function readUrl(advertisers: readonly string[], first: string, last: string): Filters {
  const q = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const month = (v: string | null, fallback: string) => (v && isMonthKey(v) && v >= first && v <= last ? v : fallback);
  const from = month(q.get('from'), first);
  const to = month(q.get('to'), last);
  const adv = q.get('adv') ?? 'all';
  return {
    advertiser: advertisers.includes(adv) ? adv : 'all',
    from: from <= to ? from : first,
    to: from <= to ? to : last,
    basis: q.get('cost') === 'media' ? 'media' : 'total',
    rate: q.get('rate') === 'cpc' ? 'cpc' : 'cpm',
  };
}

function writeUrl(f: Filters, first: string, last: string): void {
  const q = new URLSearchParams();
  if (f.advertiser !== 'all') q.set('adv', f.advertiser);
  if (f.from !== first) q.set('from', f.from);
  if (f.to !== last) q.set('to', f.to);
  if (f.basis !== 'total') q.set('cost', f.basis);
  if (f.rate !== 'cpm') q.set('rate', f.rate);
  const qs = q.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', url);
}

/** Mounts its children only when scrolled near, so the long tables never slow the first paint. */
function WhenVisible({ children, minHeight }: { children: ReactNode; minHeight: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (typeof IntersectionObserver === 'undefined') return setShow(true);
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setShow(true), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return show ? <>{children}</> : <div ref={ref} className={`${ui.card} ${s.skeleton}`} style={{ minHeight }} aria-hidden="true" />;
}

function Header({ fetchedAt, refreshing, onRefresh, demo }: { fetchedAt?: string; refreshing?: boolean; onRefresh?: () => void; demo?: boolean }) {
  const time = fetchedAt ? new Date(fetchedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) : null;
  return (
    <div className={s.head}>
      <div>
        <h1 className={ui.pageTitle}>Performance Analytics</h1>
        <p className={s.lead}>DV360 cost and rates by advertiser, month by month · AUD</p>
      </div>
      {onRefresh ? (
        <div className={s.headActions}>
          {demo ? <span className={s.demoChip}>Sample data (preview mode)</span> : time ? <span className={s.updated}>Updated {time}</span> : null}
          <button type="button" className={s.ghostBtn} onClick={onRefresh} disabled={refreshing} aria-busy={refreshing}>
            <RefreshIcon spinning={refreshing} /> {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Skeleton() {
  return (
    <div className={s.page} aria-busy="true" aria-label="Loading Performance Analytics">
      <Header />
      <div className={`${s.filters} ${s.skeleton}`} style={{ height: 74 }} />
      <div className={s.kpis}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`${s.kpi} ${s.skeleton}`} style={{ height: 96 }} />
        ))}
      </div>
      <div className={`${ui.card} ${s.skeleton}`} style={{ height: 330 }} />
      <div className={`${ui.card} ${s.skeleton}`} style={{ height: 220 }} />
      <p className={s.loadingText} role="status">
        Loading the latest numbers…
      </p>
    </div>
  );
}

function ErrorCard({ error, onRetry }: { error: LoadError; onRetry: () => void }) {
  const { signOut } = useAuth();
  return (
    <div className={s.page}>
      <Header />
      <div className={`${ui.card} ${s.card} ${s.errorCard}`} role="alert">
        <div className={s.errorIcon} aria-hidden="true">
          !
        </div>
        <h2>{error.title}</h2>
        <p>{error.action}</p>
        <div className={s.errorActions}>
          {error.signIn ? (
            <button type="button" className={s.primaryBtn} onClick={() => void signOut()}>
              Sign in again
            </button>
          ) : (
            <button type="button" className={s.primaryBtn} onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AnalyticsView() {
  const data = useAnalyticsData();
  if (data.status === 'loading') return <Skeleton />;
  if (data.status === 'error') return <ErrorCard error={data.error} onRetry={() => data.reload(false)} />;
  return <Dashboard rows={data.data.rows} warnings={data.data.warnings} fetchedAt={data.data.fetchedAt} refreshing={data.refreshing} refreshError={data.refreshError} onRefresh={() => data.reload(true)} />;
}

function Dashboard({
  rows,
  warnings,
  fetchedAt,
  refreshing,
  refreshError,
  onRefresh,
}: {
  rows: readonly MonthRow[];
  warnings: readonly { row: number; message: string }[];
  fetchedAt: string;
  refreshing: boolean;
  refreshError: LoadError | null;
  onRefresh: () => void;
}) {
  const { demo } = useAuth();
  const advertisers = useMemo(() => [...new Set(rows.map((r) => r.advertiser))].sort((a, b) => a.localeCompare(b)), [rows]);
  const dataMonths = useMemo(() => [...new Set(rows.map((r) => r.month))].sort(), [rows]);
  const first = dataMonths[0] ?? '';
  const last = dataMonths[dataMonths.length - 1] ?? '';
  const allMonths = useMemo(() => (first ? monthRange(first, last) : []), [first, last]);

  const [f, setF] = useState<Filters>(() => readUrl(advertisers, first, last));
  useEffect(() => {
    if (first) writeUrl(f, first, last);
  }, [f, first, last]);
  // If a refresh removes the picked advertiser or months, fall back safely.
  const filters: Filters = {
    ...f,
    advertiser: f.advertiser === 'all' || advertisers.includes(f.advertiser) ? f.advertiser : 'all',
    from: f.from >= first && f.from <= last ? f.from : first,
    to: f.to >= first && f.to <= last ? f.to : last,
  };
  const set = useCallback((patch: Partial<Filters>) => setF((cur) => ({ ...cur, ...patch })), []);
  const setAdvertiser = useCallback((advertiser: string) => set({ advertiser }), [set]);
  const setRate = useCallback((rate: Rate) => set({ rate }), [set]);

  // Toast for refresh results.
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const prevRefreshing = useRef(refreshing);
  useEffect(() => {
    if (prevRefreshing.current && !refreshing) setToast(refreshError ? { text: `${refreshError.title} ${refreshError.action}`, tone: 'bad' } : { text: 'Data is up to date.', tone: 'ok' });
    prevRefreshing.current = refreshing;
  }, [refreshing, refreshError]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const range = useMemo(() => monthRange(filters.from, filters.to), [filters.from, filters.to]);
  const mine = useMemo(() => (filters.advertiser === 'all' ? rows : rows.filter((r) => r.advertiser === filters.advertiser)), [rows, filters.advertiser]);
  const scoped = useMemo(() => {
    const set = new Set(range);
    return mine.filter((r) => set.has(r.month));
  }, [mine, range]);
  const kpiNow = useMemo(() => totals(scoped, filters.basis), [scoped, filters.basis]);
  const kpiBefore = useMemo(() => {
    const before = new Set(monthRange(addMonths(filters.from, -range.length), addMonths(filters.from, -1)));
    return totals(
      mine.filter((r) => before.has(r.month)),
      filters.basis,
    );
  }, [mine, filters.from, filters.basis, range.length]);
  const { base, curr } = useMemo(() => defaultWindows(range), [range]);
  const g = useMemo(() => (base.length ? growth(mine, base, curr, filters.basis, filters.rate) : null), [mine, base, curr, filters.basis, filters.rate]);

  if (rows.length === 0) {
    return (
      <div className={s.page}>
        <Header fetchedAt={fetchedAt} refreshing={refreshing} onRefresh={onRefresh} demo={demo} />
        <div className={`${ui.card} ${s.card} ${s.errorCard}`}>
          <h2>The data sheet has no rows yet</h2>
          <p>Paste the DV360 monthly report into the Data tab (see its How to update tab), then press Refresh.</p>
        </div>
      </div>
    );
  }

  const resetKey = `${filters.advertiser}|${filters.from}|${filters.to}|${filters.basis}|${filters.rate}`;
  return (
    <div className={s.page}>
      <Header fetchedAt={fetchedAt} refreshing={refreshing} onRefresh={onRefresh} demo={demo} />

      {warnings.length ? (
        <details className={s.sheetWarn}>
          <summary>
            {warnings.length} {warnings.length === 1 ? 'row' : 'rows'} in the data sheet {warnings.length === 1 ? 'was' : 'were'} skipped. Everything else is correct. <u>See which</u>
          </summary>
          <ul>
            {warnings.map((w) => (
              <li key={`${w.row}-${w.message}`}>{w.message}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className={s.filters} role="group" aria-label="Filters">
        <label>
          <span>Advertiser</span>
          <select value={filters.advertiser} onChange={(e) => set({ advertiser: e.target.value })}>
            <option value="all">All advertisers ({advertisers.length})</option>
            {advertisers.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>From</span>
          <select value={filters.from} onChange={(e) => set({ from: e.target.value })}>
            {allMonths
              .filter((m) => m <= filters.to)
              .map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>To</span>
          <select value={filters.to} onChange={(e) => set({ to: e.target.value })}>
            {allMonths
              .filter((m) => m >= filters.from)
              .map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>Cost</span>
          <Seg
            label="Cost"
            value={filters.basis}
            onChange={(basis) => set({ basis })}
            options={
              [
                ['total', 'Total cost'],
                ['media', 'Media cost'],
              ] as const
            }
          />
        </label>
        {filters.advertiser !== 'all' || filters.from !== first || filters.to !== last || filters.basis !== 'total' ? (
          <button type="button" className={s.resetBtn} onClick={() => setF({ advertiser: 'all', from: first, to: last, basis: 'total', rate: filters.rate })}>
            Reset filters
          </button>
        ) : null}
      </div>

      <SectionBoundary name="Headline numbers" resetKey={resetKey}>
        <KpiStrip now={kpiNow} before={kpiBefore} months={range.length} />
      </SectionBoundary>
      <SectionBoundary name="Rates over time" resetKey={resetKey}>
        <RatesSection rows={scoped} range={range} basis={filters.basis} rate={filters.rate} onRate={setRate} />
      </SectionBoundary>
      <SectionBoundary name="Price change since the start" resetKey={resetKey}>
        <GrowthSection growth={g} base={base} curr={curr} rate={filters.rate} />
      </SectionBoundary>
      <SectionBoundary name="Compare" resetKey={resetKey}>
        <CompareSection rows={rows} dataMonths={dataMonths} range={range} advertisers={advertisers} basis={filters.basis} rate={filters.rate} globalAdvertiser={filters.advertiser} />
      </SectionBoundary>
      <SectionBoundary name="Clients" resetKey={resetKey}>
        <ClientsSection rows={rows} range={range} base={base} curr={curr} basis={filters.basis} rate={filters.rate} selected={filters.advertiser} onSelect={setAdvertiser} />
      </SectionBoundary>
      {filters.advertiser !== 'all' ? (
        <SectionBoundary name="Month by month" resetKey={resetKey}>
          <MonthByMonth rows={rows} advertiser={filters.advertiser} range={range} basis={filters.basis} rate={filters.rate} onClear={() => setAdvertiser('all')} />
        </SectionBoundary>
      ) : null}
      <SectionBoundary name="Campaign log" resetKey={resetKey}>
        <WhenVisible minHeight={420}>
          <CampaignLog rows={rows} advertiser={filters.advertiser} range={range} basis={filters.basis} />
        </WhenVisible>
      </SectionBoundary>

      <div className={s.toastRegion} role="status" aria-live="polite">
        {toast ? <div className={`${s.toast} ${toast.tone === 'bad' ? s.toastBad : ''}`}>{toast.text}</div> : null}
      </div>
    </div>
  );
}
