'use client';

import { memo, useMemo } from 'react';
import ui from '@/components/ui.module.css';
import { aud, percent, rateName, rateText, whole } from '@/engine/analytics/format';
import { monthName } from '@/engine/analytics/periods';
import { byMonth, change, costOf, rateOf } from '@/engine/analytics/totals';
import type { CostBasis, MonthRow, Rate, Totals } from '@/engine/analytics/types';
import s from '../analytics.module.css';
import { Delta } from '../ui/bits';
import { csvName } from '../ui/csv';
import { DataTable, type Column } from '../ui/DataTable';

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const rangeLabel = (range: readonly string[]) => `${monthName(range[0] ?? '')} – ${monthName(range[range.length - 1] ?? '')}`;

type MonthLine = Totals & { readonly month: string; readonly prevRate: number | null };

/** One client, month by month. Shown only when one advertiser is picked. */
export const MonthByMonth = memo(function MonthByMonth({ rows, advertiser, range, basis, rate, onClear }: { rows: readonly MonthRow[]; advertiser: string; range: readonly string[]; basis: CostBasis; rate: Rate; onClear: () => void }) {
  const data = useMemo<MonthLine[]>(() => {
    const months = byMonth(
      rows.filter((r) => r.advertiser === advertiser),
      range,
      basis,
    ).filter((m) => m.impressions > 0);
    return months.map((m, i) => ({ ...m, prevRate: i > 0 ? rateOf(months[i - 1] as Totals, rate) : null }));
  }, [rows, advertiser, range, basis, rate]);
  const name = rateName(rate);

  const columns: Column<MonthLine>[] = [
    { key: 'month', label: 'Month', primary: true, value: (m) => m.month, render: (m) => <b>{monthName(m.month)}</b> },
    { key: 'cost', label: basis === 'total' ? 'Total cost' : 'Media cost', align: 'right', value: (m) => round(m.cost), render: (m) => aud(m.cost) },
    { key: 'impressions', label: 'Impressions', align: 'right', value: (m) => m.impressions, render: (m) => whole(m.impressions) },
    { key: 'clicks', label: 'Clicks', align: 'right', value: (m) => m.clicks, render: (m) => whole(m.clicks) },
    { key: 'ctr', label: 'CTR', align: 'right', value: (m) => (m.ctr == null ? null : round(m.ctr * 100, 2)), render: (m) => (m.ctr == null ? '—' : percent(m.ctr)) },
    { key: 'cpm', label: 'eCPM', align: 'right', value: (m) => (m.cpm == null ? null : round(m.cpm, 2)), render: (m) => (m.cpm == null ? '—' : rateText('cpm', m.cpm)) },
    { key: 'cpc', label: 'eCPC', align: 'right', value: (m) => (m.cpc == null ? null : round(m.cpc, 3)), render: (m) => (m.cpc == null ? '—' : rateText('cpc', m.cpc)) },
    {
      key: 'vsPrev',
      label: `${name} vs last month`,
      value: (m) => change(m.prevRate, rateOf(m, rate)),
      render: (m) => <Delta value={change(m.prevRate, rateOf(m, rate))} lowerIsBetter empty={m.prevRate == null ? 'First month' : 'No data'} />,
    },
  ];

  return (
    <section className={`${ui.card} ${s.card} ${s.focusCard}`} aria-labelledby="month-title">
      <div className={s.cardHead}>
        <div>
          <h2 id="month-title">
            <span className={s.focusDot} /> {advertiser}, month by month
          </h2>
          <p>
            {rangeLabel(range)} · {data.length} {data.length === 1 ? 'month' : 'months'} with spend
          </p>
        </div>
        <button type="button" className={s.ghostBtn} onClick={onClear}>
          ✕ Back to all advertisers
        </button>
      </div>
      <DataTable columns={columns} rows={data} rowKey={(m) => m.month} initialSort="month" csvName={csvName(advertiser, range[0] ?? '', 'to', range[range.length - 1] ?? '')} pageSizes={[12, 24, 48]} empty={`${advertiser} had no spend in these months.`} />
    </section>
  );
});

/** The full log: one row per advertiser per month, straight from the sheet. Follows the page filters. */
export const CampaignLog = memo(function CampaignLog({ rows, advertiser, range, basis }: { rows: readonly MonthRow[]; advertiser: string; range: readonly string[]; basis: CostBasis }) {
  const data = useMemo(() => {
    const inRange = new Set(range);
    return rows.filter((r) => (advertiser === 'all' || r.advertiser === advertiser) && inRange.has(r.month) && r.impressions > 0);
  }, [rows, advertiser, range]);
  const cpm = (r: MonthRow) => (r.impressions ? (costOf(r, basis) / r.impressions) * 1000 : null);
  const cpc = (r: MonthRow) => (r.clicks ? costOf(r, basis) / r.clicks : null);

  const columns: Column<MonthRow>[] = [
    { key: 'advertiser', label: 'Advertiser', primary: true, value: (r) => r.advertiser, render: (r) => <b>{r.advertiser}</b> },
    { key: 'month', label: 'Month', primary: true, value: (r) => r.month, render: (r) => <span className={s.muted}>{monthName(r.month)}</span> },
    { key: 'impressions', label: 'Impressions', align: 'right', value: (r) => r.impressions, render: (r) => whole(r.impressions) },
    { key: 'clicks', label: 'Clicks', align: 'right', value: (r) => r.clicks, render: (r) => whole(r.clicks) },
    { key: 'ctr', label: 'CTR', align: 'right', value: (r) => (r.impressions ? round((r.clicks / r.impressions) * 100, 2) : null), render: (r) => (r.impressions ? percent(r.clicks / r.impressions) : '—') },
    { key: 'media', label: 'Media cost', align: 'right', value: (r) => round(r.media), render: (r) => aud(r.media, 2) },
    {
      key: 'total',
      label: 'Total cost',
      align: 'right',
      value: (r) => round(r.total),
      render: (r) => (
        <span className={s.hoverTip} tabIndex={0}>
          <b className={s.dotted}>{aud(r.total, 2)}</b>
          <span role="tooltip" className={`${s.tip} ${s.tipRight}`}>
            <b>Where the cost comes from</b>
            <span className={s.tipLine}>
              <span>Media</span>
              <strong>{aud(r.media, 2)}</strong>
            </span>
            <span className={s.tipLine}>
              <span>DV fee</span>
              <strong>{aud(r.dv, 2)}</strong>
            </span>
            <span className={s.tipLine}>
              <span>FS fee</span>
              <strong>{aud(r.fs, 2)}</strong>
            </span>
          </span>
        </span>
      ),
    },
    { key: 'dv', label: 'DV fee', csvOnly: true, value: (r) => round(r.dv), render: () => null },
    { key: 'fs', label: 'FS fee', csvOnly: true, value: (r) => round(r.fs), render: () => null },
    { key: 'cpm', label: 'eCPM', align: 'right', value: (r) => (cpm(r) == null ? null : round(cpm(r) ?? 0, 2)), render: (r) => (cpm(r) == null ? '—' : rateText('cpm', cpm(r) ?? 0)) },
    { key: 'cpc', label: 'eCPC', align: 'right', value: (r) => (cpc(r) == null ? null : round(cpc(r) ?? 0, 3)), render: (r) => (cpc(r) == null ? '—' : rateText('cpc', cpc(r) ?? 0)) },
  ];

  return (
    <section className={`${ui.card} ${s.card}`} aria-labelledby="log-title">
      <div className={s.cardHead}>
        <div>
          <h2 id="log-title">Campaign log</h2>
          <p>Every advertiser, every month, as it is in the sheet. Hover a total cost to see the DV and FS fees. eCPM and eCPC use {basis === 'total' ? 'total' : 'media'} cost.</p>
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={data}
        rowKey={(r) => `${r.advertiser}|${r.month}`}
        initialSort="month"
        searchText={(r) => `${r.advertiser} ${monthName(r.month)}`}
        searchPlaceholder="Search advertiser or month"
        csvName={csvName('campaign-log', range[0] ?? '', 'to', range[range.length - 1] ?? '')}
        empty="No rows match."
      />
    </section>
  );
});
