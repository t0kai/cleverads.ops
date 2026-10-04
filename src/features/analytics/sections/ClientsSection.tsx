'use client';

import { memo, useMemo, useState } from 'react';
import ui from '@/components/ui.module.css';
import { clientSummaries, type ClientSummary } from '@/engine/analytics/clients';
import { aud, compact, rateName, rateText } from '@/engine/analytics/format';
import { monthName } from '@/engine/analytics/periods';
import { rateOf } from '@/engine/analytics/totals';
import type { CostBasis, MonthRow, Rate } from '@/engine/analytics/types';
import s from '../analytics.module.css';
import { compareValues, Delta, SortHead, useSort } from '../ui/bits';
import { Sparkline } from '../ui/Sparkline';

type Key = 'name' | 'cost' | 'impressions' | 'rate' | 'change';

const span = (m: readonly string[]) => (m.length ? `${monthName(m[0] ?? '')} – ${monthName(m[m.length - 1] ?? '')}` : '');

/** Every client side by side: sortable, start price on hover, click to focus the page on one client. */
export const ClientsSection = memo(function ClientsSection({
  rows,
  range,
  base,
  curr,
  basis,
  rate,
  selected,
  onSelect,
}: {
  rows: readonly MonthRow[];
  range: readonly string[];
  base: readonly string[];
  curr: readonly string[];
  basis: CostBasis;
  rate: Rate;
  selected: string;
  onSelect: (name: string) => void;
}) {
  const [sort, onSort, setSort] = useSort<Key>('cost', 'desc', ['name']);
  const [all, setAll] = useState(false);
  const name = rateName(rate);
  const clients = useMemo(() => clientSummaries(rows, range, base, curr, basis, rate), [rows, range, base, curr, basis, rate]);

  const value = (c: ClientSummary, k: Key): string | number | null =>
    k === 'name' ? c.advertiser : k === 'cost' ? c.totals.cost : k === 'impressions' ? c.totals.impressions : k === 'rate' ? rateOf(c.totals, rate) : c.change;
  const sorted = [...clients].sort((a, b) => compareValues(value(a, sort.key), value(b, sort.key), sort.dir) || a.advertiser.localeCompare(b.advertiser));
  const shown = all ? sorted : sorted.slice(0, 8);

  return (
    <section className={`${ui.card} ${s.card}`} aria-labelledby="clients-title">
      <div className={s.cardHead}>
        <div>
          <h2 id="clients-title">Clients</h2>
          <p>Click a heading to sort. Hover a change to see the start and current price. Click a client to focus the page on it.</p>
        </div>
        <label className={s.mobileSort}>
          <span>Sort by</span>
          <select
            value={`${sort.key}:${sort.dir}`}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(':') as [Key, 'asc' | 'desc'];
              setSort({ key, dir });
            }}
          >
            <option value="cost:desc">Cost (high → low)</option>
            <option value="change:desc">{name} change (biggest rise)</option>
            <option value="change:asc">{name} change (biggest drop)</option>
            <option value="rate:desc">{name} (high → low)</option>
            <option value="impressions:desc">Impressions (high → low)</option>
            <option value="name:asc">Name (A → Z)</option>
          </select>
        </label>
      </div>

      {clients.length === 0 ? (
        <p className={s.emptyState}>No client had impressions in these months.</p>
      ) : (
        <div className={s.clientList} role="table" aria-label="Clients">
          <div className={`${s.clientRow} ${s.clientHead}`} role="row">
            <SortHead k="name" label="Advertiser" sort={sort} onSort={onSort} />
            <SortHead k="cost" label="Cost" sort={sort} onSort={onSort} />
            <SortHead k="impressions" label="Impressions" sort={sort} onSort={onSort} />
            <SortHead k="rate" label={name} sort={sort} onSort={onSort} />
            <SortHead k="change" label={`${name} change`} sort={sort} onSort={onSort} />
            <span role="columnheader">Trend</span>
          </div>
          {shown.map((c) => {
            const r = rateOf(c.totals, rate);
            return (
              <div
                key={c.advertiser}
                className={`${s.clientRow} ${s.clientClickable} ${selected === c.advertiser ? s.clientOn : ''}`}
                role="row"
                tabIndex={0}
                aria-selected={selected === c.advertiser}
                onClick={() => onSelect(c.advertiser)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(c.advertiser);
                  }
                }}
                title={`Show only ${c.advertiser}`}
              >
                <span className={s.cName} role="cell">
                  {c.advertiser}
                </span>
                <span className={`${s.cCost} mono`} role="cell">
                  {aud(c.totals.cost)}
                </span>
                <span className={`${s.cImpr} mono`} role="cell">
                  {compact(c.totals.impressions)}
                </span>
                <span className={`${s.cRate} mono`} role="cell">
                  <em>{name} </em>
                  {r == null ? '—' : rateText(rate, r)}
                </span>
                <span className={s.cChange} role="cell">
                  <span className={s.hoverTip} tabIndex={0} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <Delta value={c.change} lowerIsBetter empty={c.why} />
                    <span role="tooltip" className={`${s.tip} ${s.tipRight}`}>
                      <b>{name}: start → now</b>
                      <span className={s.tipLine}>
                        <span>Start · {span(base)}</span>
                        <strong>{c.start == null ? 'no data' : rateText(rate, c.start)}</strong>
                      </span>
                      <span className={s.tipLine}>
                        <span>Now · {span(curr)}</span>
                        <strong>{c.now == null ? 'no data' : rateText(rate, c.now)}</strong>
                      </span>
                    </span>
                  </span>
                </span>
                <span className={s.cSpark} role="cell">
                  <Sparkline values={c.spark} />
                </span>
              </div>
            );
          })}
        </div>
      )}
      {clients.length > 8 ? (
        <button type="button" className={s.more} onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? 'Show top 8' : `Show all ${clients.length}`}
        </button>
      ) : null}
    </section>
  );
});
