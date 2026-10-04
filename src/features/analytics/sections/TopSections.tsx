'use client';

import { memo, useMemo } from 'react';
import ui from '@/components/ui.module.css';
import { aud, compact, percent, rateName, rateText } from '@/engine/analytics/format';
import type { Growth } from '@/engine/analytics/growth';
import { monthName, monthShort } from '@/engine/analytics/periods';
import { byMonth, change, rateOf } from '@/engine/analytics/totals';
import { lineFit, steadiness } from '@/engine/analytics/trend';
import type { CostBasis, MonthRow, Rate, Totals } from '@/engine/analytics/types';
import s from '../analytics.module.css';
import { Delta, Info, Seg } from '../ui/bits';
import { BarChart } from '../ui/BarChart';

/** Six headline numbers, each with its change against the same number of months just before. */
export const KpiStrip = memo(function KpiStrip({ now, before, months }: { now: Totals; before: Totals; months: number }) {
  const hasBefore = before.impressions > 0;
  const tiles: readonly [string, string, number | null, boolean, boolean][] = [
    ['Cost', aud(now.cost), change(before.cost, now.cost), false, true],
    ['Impressions', compact(now.impressions), change(before.impressions, now.impressions), false, true],
    ['Clicks', compact(now.clicks), change(before.clicks, now.clicks), false, true],
    ['CTR', now.ctr == null ? '—' : percent(now.ctr), change(before.ctr, now.ctr), false, false],
    ['eCPM', now.cpm == null ? '—' : rateText('cpm', now.cpm), change(before.cpm, now.cpm), true, false],
    ['eCPC', now.cpc == null ? '—' : rateText('cpc', now.cpc), change(before.cpc, now.cpc), true, false],
  ];
  return (
    <div className={s.kpis}>
      {tiles.map(([label, value, d, lower, neutral]) => (
        <div key={label} className={s.kpi}>
          <div className={s.kpiLabel}>{label}</div>
          <div className={s.kpiValue}>{value}</div>
          <div className={s.kpiDelta}>
            {hasBefore ? (
              <>
                <Delta value={d} lowerIsBetter={lower} neutral={neutral} />
                <span>vs previous {months} mo</span>
              </>
            ) : (
              <span>
                {months} {months === 1 ? 'month' : 'months'}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
});

/** Rates over time: monthly bars, trend line, highest and lowest month. */
export const RatesSection = memo(function RatesSection({ rows, range, basis, rate, onRate }: { rows: readonly MonthRow[]; range: readonly string[]; basis: CostBasis; rate: Rate; onRate: (r: Rate) => void }) {
  const monthly = useMemo(() => byMonth(rows, range, basis), [rows, range, basis]);
  const series = monthly.map((m) => rateOf(m, rate));
  const fit = lineFit(series);
  const withData = monthly.filter((m) => rateOf(m, rate) != null);
  const pick = (better: (a: number, b: number) => boolean) => withData.reduce<(typeof withData)[number] | undefined>((acc, m) => (acc && better(rateOf(acc, rate) ?? 0, rateOf(m, rate) ?? 0) ? acc : m), undefined);
  const hi = pick((a, b) => a >= b);
  const lo = pick((a, b) => a <= b);
  const fmt = (v: number) => rateText(rate, v);

  return (
    <section className={`${ui.card} ${s.card}`} aria-labelledby="rates-title">
      <div className={s.cardHead}>
        <div>
          <h2 id="rates-title">Rates over time</h2>
          <p>Is the price going up or down, month by month?</p>
        </div>
        <Seg label="Rate" value={rate} onChange={onRate} options={[['cpm', 'eCPM'], ['cpc', 'eCPC']] as const} />
      </div>
      <div className={s.trendGrid}>
        <BarChart labels={range} values={series} trend={fit?.fitted} name={rateName(rate)} format={fmt} tickLabel={monthShort} />
        <div className={s.facts}>
          <div>
            <span className={s.labelRow}>
              Overall trend
              <Info label="Overall trend" align="right">
                The dashed line in the chart, from the first month to the last. One unusual month can’t swing it. “Steady” means the months follow the line closely; “Bumpy” means they jump around a lot.
              </Info>
            </span>
            <Delta value={fit?.pct ?? null} lowerIsBetter big empty="Needs 3+ months" />
            <em>{fit ? steadiness(fit.r2) : ''}</em>
          </div>
          <div>
            <span>Highest month</span>
            <strong>{hi ? fmt(rateOf(hi, rate) ?? 0) : '—'}</strong>
            <em>{hi ? monthName(hi.month) : ''}</em>
          </div>
          <div>
            <span>Lowest month</span>
            <strong>{lo ? fmt(rateOf(lo, rate) ?? 0) : '—'}</strong>
            <em>{lo ? monthName(lo.month) : ''}</em>
          </div>
        </div>
      </div>
    </section>
  );
});

/** Has the price gone up since the start? Same clients / all clients / trend, plus why it moved. */
export const GrowthSection = memo(function GrowthSection({ growth: g, base, curr, rate }: { growth: Growth | null; base: readonly string[]; curr: readonly string[]; rate: Rate }) {
  const name = rateName(rate);
  const unit = rate === 'cpm' ? 'impression' : 'click';
  const span = (m: readonly string[]) => `${monthName(m[0] ?? '')}–${monthName(m[m.length - 1] ?? '')}`;
  const disagree = g != null && g.likeForLike != null && g.blended != null && Math.abs(g.likeForLike) >= 0.5 && Math.abs(g.blended) >= 0.5 && Math.sign(g.likeForLike) !== Math.sign(g.blended);

  return (
    <section className={`${ui.card} ${s.card}`} aria-labelledby="growth-title">
      <div className={s.cardHead}>
        <div>
          <h2 id="growth-title">Has {name} gone up since the start?</h2>
          {g ? (
            <p>
              {span(base)} <span className={s.arrowSep}>→</span> {span(curr)}
            </p>
          ) : null}
        </div>
      </div>
      {g == null ? (
        <p className={s.emptyState}>Pick at least 2 months to see how the price moved.</p>
      ) : (
        <>
          <div className={s.growth}>
            <div className={`${s.gCard} ${s.gMain}`}>
              <span className={s.labelRow}>
                Same clients
                <Info label="Same clients (like-for-like)">
                  Only the {g.shared} {g.shared === 1 ? 'client' : 'clients'} that ran in both periods. New or stopped clients can’t skew it, so this is the real price change. Use this one first.
                </Info>
                <i className={s.badge}>Most reliable</i>
              </span>
              <Delta value={g.likeForLike} lowerIsBetter big empty="No client in both" />
            </div>
            <div className={s.gCard}>
              <span className={s.labelRow}>
                All clients
                <Info label="All clients (blended)">Every client added together. It also moves when the client mix changes, for example a big low-price client joining, even if nobody’s price changed.</Info>
              </span>
              <Delta value={g.blended} lowerIsBetter big />
            </div>
            <div className={s.gCard}>
              <span className={s.labelRow}>
                Overall trend
                <Info label="Overall trend" align="right">
                  A straight line through every month from the start to now, so one unusual month can’t swing the result.
                </Info>
              </span>
              <Delta value={g.trend} lowerIsBetter big empty="Needs 3+ months" />
            </div>
          </div>
          {g.priceEffect != null && g.mixEffect != null ? (
            <div className={s.split}>
              <span className={s.labelRow}>
                Why it moved
                <Info label="Why it moved">
                  Splits the Same-clients change in two. Price: clients paying more or less per {unit}. Client mix: more budget going to clients that are pricier or cheaper.
                </Info>
              </span>
              <span className={s.splitPart}>
                Price <Delta value={g.priceEffect} lowerIsBetter />
              </span>
              <span className={s.plus}>+</span>
              <span className={s.splitPart}>
                Client mix <Delta value={g.mixEffect} lowerIsBetter />
              </span>
            </div>
          ) : null}
          {disagree ? <div className={s.warn}>Same clients and All clients point different ways because the client mix changed. Go by Same clients.</div> : null}
        </>
      )}
    </section>
  );
});
