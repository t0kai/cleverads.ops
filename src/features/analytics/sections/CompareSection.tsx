'use client';

import { memo, useMemo, useState } from 'react';
import ui from '@/components/ui.module.css';
import { ALL_ADVERTISERS, advertisersIn, monthsWithData, periodsIn, sideTotals, whoChanged, type Side } from '@/engine/analytics/compare';
import { aud, percent, rateName, rateText, whole } from '@/engine/analytics/format';
import { GRAIN_MONTHS, periodName, periodSpan } from '@/engine/analytics/periods';
import { change } from '@/engine/analytics/totals';
import type { CostBasis, Grain, MonthRow, Rate, Totals } from '@/engine/analytics/types';
import s from '../analytics.module.css';
import { Delta, Seg } from '../ui/bits';

const GRAINS = [
  ['month', 'Month'],
  ['quarter', 'Quarter'],
  ['half', 'Half-year'],
  ['year', 'Year'],
] as const;

type Kind = 'neutral' | 'higher' | 'lower';
const METRICS: readonly (readonly [string, (t: Totals) => number | null, (v: number) => string, Kind])[] = [
  ['Cost', (t) => t.cost, (v) => aud(v), 'neutral'],
  ['Impressions', (t) => t.impressions, whole, 'neutral'],
  ['Clicks', (t) => t.clicks, whole, 'neutral'],
  ['CTR', (t) => t.ctr, (v) => percent(v), 'higher'],
  ['eCPM', (t) => t.cpm, (v) => rateText('cpm', v), 'lower'],
  ['eCPC', (t) => t.cpc, (v) => rateText('cpc', v), 'lower'],
];

/**
 * Two sides, each its own advertiser + period: the same client in two periods,
 * two clients in the same period, or all clients across two periods.
 */
export const CompareSection = memo(function CompareSection({
  rows,
  dataMonths,
  range,
  advertisers,
  basis,
  rate,
  globalAdvertiser,
}: {
  rows: readonly MonthRow[];
  /** Every month that has any data (to tell complete from partial periods). */
  dataMonths: readonly string[];
  range: readonly string[];
  advertisers: readonly string[];
  basis: CostBasis;
  rate: Rate;
  globalAdvertiser: string;
}) {
  const [grain, setGrain] = useState<Grain>('quarter');
  const [aPick, setA] = useState<Partial<Side>>({});
  const [bPick, setB] = useState<Partial<Side>>({});
  const [showAll, setShowAll] = useState(false);

  const opts = useMemo(() => periodsIn(range, grain), [range, grain]);
  const partial = (p: string) => grain !== 'month' && monthsWithData(dataMonths, p, grain) < GRAIN_MONTHS[grain];
  const yearBack = 12 / GRAIN_MONTHS[grain];
  const latest = opts[opts.length - 1] ?? '';

  // Anything not picked follows the page filter, and defaults to "same period last year → latest".
  const A: Side = {
    advertiser: aPick.advertiser ?? globalAdvertiser,
    period: aPick.period && opts.includes(aPick.period) ? aPick.period : (opts[Math.max(0, opts.length - 1 - yearBack)] ?? ''),
  };
  const B: Side = { advertiser: bPick.advertiser ?? globalAdvertiser, period: bPick.period && opts.includes(bPick.period) ? bPick.period : latest };

  const ta = sideTotals(rows, A, grain, basis);
  const tb = sideTotals(rows, B, grain, basis);
  const activeIn = useMemo(() => new Map(opts.map((p) => [p, advertisersIn(rows, p, grain)])), [rows, opts, grain]);
  const hasData = (adv: string, p: string) => (adv === ALL_ADVERTISERS ? (activeIn.get(p)?.size ?? 0) > 0 : (activeIn.get(p)?.has(adv) ?? false));
  const label = (side: Side) => `${side.advertiser === ALL_ADVERTISERS ? 'All advertisers' : side.advertiser} · ${periodName(side.period, grain)}`;

  const showList = A.advertiser === ALL_ADVERTISERS && B.advertiser === ALL_ADVERTISERS && A.period !== B.period;
  const moves = useMemo(() => (showList ? whoChanged(rows, A.period, B.period, grain, basis, rate) : null), [showList, rows, A.period, B.period, grain, basis, rate]);

  if (opts.length === 0) {
    return (
      <section className={`${ui.card} ${s.card}`}>
        <h2>Compare</h2>
        <p className={s.emptyState}>Pick a date range with data to compare.</p>
      </section>
    );
  }

  let message: { title: string; body: string } | null = null;
  if (A.advertiser === B.advertiser && A.period === B.period) message = { title: 'Both sides are the same', body: 'Change the advertiser or the period on one side.' };
  else if (ta.impressions === 0 || tb.impressions === 0) {
    const who = ta.impressions === 0 ? A : B;
    message = {
      title: `No campaigns for ${label(who)}`,
      body: `${who.advertiser === ALL_ADVERTISERS ? 'No advertiser ran' : `${who.advertiser} had no campaigns`} in ${periodName(who.period, grain)}. Pick another period or advertiser; the lists mark the ones with no data.`,
    };
  }

  const picker = (tag: 'A' | 'B', side: Side, pick: Partial<Side>, set: (v: Partial<Side>) => void) => (
    <div className={`${s.sideCard} ${tag === 'A' ? s.sideA : s.sideB}`}>
      <div className={s.sideHead}>
        <span className={tag === 'A' ? s.tagA : s.tagB}>{tag}</span>
        <span className={s.sideName}>{label(side)}</span>
      </div>
      <label className={s.sideField}>
        <span>Advertiser</span>
        <select value={side.advertiser} onChange={(e) => set({ ...pick, advertiser: e.target.value })}>
          <option value={ALL_ADVERTISERS}>All advertisers</option>
          {advertisers.map((a) => (
            <option key={a} value={a}>
              {a}
              {hasData(a, side.period) ? '' : ' (no data in this period)'}
            </option>
          ))}
        </select>
      </label>
      <label className={s.sideField}>
        <span>{GRAINS.find(([g]) => g === grain)?.[1]}</span>
        <select value={side.period} onChange={(e) => set({ ...pick, period: e.target.value })}>
          {[...new Set(opts.map((o) => o.slice(0, 4)))].map((y) => (
            <optgroup key={y} label={y}>
              {opts
                .filter((o) => o.startsWith(y))
                .map((o) => (
                  <option key={o} value={o}>
                    {periodName(o, grain)}
                    {periodSpan(o, grain) ? ` (${periodSpan(o, grain)})` : ''}
                    {partial(o) ? ` · ${monthsWithData(dataMonths, o, grain)} of ${GRAIN_MONTHS[grain]} mo` : ''}
                    {hasData(side.advertiser, o) ? '' : ' · no data'}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <section className={`${ui.card} ${s.card}`} aria-labelledby="compare-title">
      <div className={s.cardHead}>
        <div>
          <h2 id="compare-title">Compare</h2>
          <p>Pick an advertiser and a period for each side: the same client in two periods, or two clients side by side.</p>
        </div>
        <Seg
          label="Compare by"
          value={grain}
          onChange={(g) => {
            setGrain(g);
            setA({ advertiser: aPick.advertiser });
            setB({ advertiser: bPick.advertiser });
          }}
          options={GRAINS}
        />
      </div>

      <div className={s.sides}>
        {picker('A', A, aPick, setA)}
        <button
          type="button"
          className={s.swapBtn}
          onClick={() => {
            setA({ ...B });
            setB({ ...A });
          }}
          title="Swap A and B"
          aria-label="Swap A and B"
        >
          ⇄
        </button>
        {picker('B', B, bPick, setB)}
      </div>

      {message ? (
        <div className={s.emptyState} role="status">
          <b>{message.title}</b>
          <br />
          {message.body}
        </div>
      ) : (
        <>
          <div className={s.cmpList} role="table" aria-label="A compared with B">
            <div className={`${s.cmpRow} ${s.cmpHead}`} role="row">
              <span role="columnheader">Metric</span>
              <span role="columnheader">A · {label(A)}</span>
              <span role="columnheader">B · {label(B)}</span>
              <span role="columnheader">Change from A to B</span>
            </div>
            {METRICS.map(([name, get, fmt, kind]) => {
              const va = get(ta);
              const vb = get(tb);
              return (
                <div key={name} className={s.cmpRow} role="row">
                  <span className={s.cmpLabel} role="cell">
                    {name}
                    {kind !== 'neutral' ? <small>{kind === 'lower' ? 'lower is better' : 'higher is better'}</small> : null}
                  </span>
                  <span className={`${s.cmpA} mono`} role="cell">
                    {va == null ? '—' : fmt(va)}
                  </span>
                  <span className={`${s.cmpB} mono`} role="cell">
                    {vb == null ? '—' : fmt(vb)}
                  </span>
                  <span className={s.cmpChange} role="cell">
                    <Delta value={change(va, vb)} lowerIsBetter={kind === 'lower'} neutral={kind === 'neutral'} empty="Can't compare" />
                  </span>
                </div>
              );
            })}
          </div>
          <div className={s.legend}>
            <span>
              <i className={s.dotGood} /> Better
            </span>
            <span>
              <i className={s.dotBad} /> Worse
            </span>
            <span>
              <i className={s.dotNeutral} /> Volume, neither good nor bad
            </span>
          </div>
          {partial(A.period) || partial(B.period) ? <p className={s.note}>A partial period has fewer months, so its Cost, Impressions and Clicks look smaller. CTR, eCPM and eCPC are still fair to compare.</p> : null}
          {A.advertiser !== B.advertiser && A.period !== B.period ? <p className={s.note}>Different advertiser and different period on each side, so the change mixes both. Keep one of them the same for a clean comparison.</p> : null}
        </>
      )}

      {moves ? (
        <div className={s.whoList}>
          <div className={s.whoHead}>
            <b>
              Who changed most · {rateName(rate)} {periodName(A.period, grain)} → {periodName(B.period, grain)}
            </b>
            <span>Click a client to compare just that client.</span>
          </div>
          {moves.both.length === 0 ? <p className={s.muted}>No client ran in both periods.</p> : null}
          <div className={s.whoGrid}>
            {(showAll ? moves.both : moves.both.slice(0, 8)).map((x) => (
              <button
                key={x.advertiser}
                type="button"
                className={s.whoItem}
                onClick={() => {
                  setA({ ...aPick, advertiser: x.advertiser });
                  setB({ ...bPick, advertiser: x.advertiser });
                }}
                title={`${rateName(rate)}: ${x.from == null ? '—' : rateText(rate, x.from)} → ${x.to == null ? '—' : rateText(rate, x.to)}`}
              >
                <span>{x.advertiser}</span>
                <Delta value={x.change} lowerIsBetter empty="No clicks" />
              </button>
            ))}
          </div>
          {moves.both.length > 8 ? (
            <button type="button" className={s.more} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? 'Show fewer' : `Show all ${moves.both.length} clients in both`}
            </button>
          ) : null}
          {moves.onlyA.length || moves.onlyB.length ? (
            <div className={s.onlyRow}>
              {moves.onlyA.length ? (
                <p>
                  <span className={s.tagMiniA}>Only in A</span> {moves.onlyA.join(', ')}
                </p>
              ) : null}
              {moves.onlyB.length ? (
                <p>
                  <span className={s.tagMiniB}>Only in B</span> {moves.onlyB.join(', ')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
});
