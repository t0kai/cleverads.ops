'use client';

import { useState } from 'react';

/** Rounded-up axis top and evenly spaced ticks from zero. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? raw;
  const top = Math.ceil(max / step - 1e-9) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/** A bar with only its top corners rounded, standing on the baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/**
 * Monthly bars with a dashed trend line. Highest and lowest months are labelled; every bar has a
 * readout on hover (mouse) or tap (touch). Bars always start at zero so heights compare honestly.
 */
export function BarChart({
  labels,
  values,
  trend,
  name,
  format,
  tickLabel,
  color = '#2447d6',
  height = 250,
  lowerIsBetter = true,
}: {
  labels: readonly string[];
  values: readonly (number | null)[];
  trend?: readonly (number | null)[] | undefined;
  name: string;
  format: (v: number) => string;
  tickLabel: (label: string) => string;
  color?: string;
  height?: number;
  lowerIsBetter?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) {
    return <div style={{ height, display: 'grid', placeItems: 'center', color: '#7a808a', fontSize: 14 }}>No {name} in these months.</div>;
  }
  const W = 720;
  const H = height;
  const L = 56;
  const R = 12;
  const T = 22;
  const B = 30;
  const trendNums = (trend ?? []).filter((v): v is number => v != null && Number.isFinite(v));
  const ticks = niceTicks(Math.max(...nums, ...trendNums));
  const top = ticks[ticks.length - 1] ?? 1;
  const slot = (W - L - R) / Math.max(1, labels.length);
  const bw = Math.max(3, Math.min(30, slot - 2));
  const cx = (i: number) => L + slot * i + slot / 2;
  const y = (v: number) => T + (1 - Math.max(0, Math.min(v, top)) / top) * (H - T - B);
  const hiI = values.indexOf(Math.max(...nums));
  const loI = values.indexOf(Math.min(...nums));
  const every = Math.ceil(labels.length / 8);
  const trendPath = trend ? trend.reduce<string>((d, v, i) => (v == null || !Number.isFinite(v) ? d : `${d}${d ? 'L' : 'M'}${cx(i).toFixed(1)},${y(v).toFixed(1)}`), '') : '';
  const hv = hover == null ? null : values[hover];
  const prev = hover != null && hover > 0 ? values[hover - 1] : null;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: '#5b6170', marginBottom: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} /> {name} per month
        </span>
        {trendPath ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="18" height="4" aria-hidden="true">
              <line x1="0" x2="18" y1="2" y2="2" stroke="#6c5ce7" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            Trend line
          </span>
        ) : null}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${name} by month, highest ${format(nums.reduce((a, b) => Math.max(a, b)))}, lowest ${format(nums.reduce((a, b) => Math.min(a, b)))}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#c9cfdb' : '#eceff5'} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#7a808a">
              {format(t)}
            </text>
          </g>
        ))}
        {values.map((v, i) =>
          v == null || !Number.isFinite(v) ? null : (
            <path key={labels[i]} d={barPath(cx(i) - bw / 2, y(v), bw, y(0) - y(v))} fill={color} opacity={hover == null || hover === i ? 1 : 0.45} style={{ transition: 'opacity 0.15s ease' }} />
          ),
        )}
        {trendPath ? <path d={trendPath} fill="none" stroke="#6c5ce7" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" /> : null}
        {[hiI, loI].map((i, k) => {
          const v = values[i];
          return i < 0 || hover === i || v == null ? null : (
            <text key={k} x={cx(i)} y={y(v) - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="#2a2f3a" stroke="#fff" strokeWidth="3" paintOrder="stroke">
              {format(v)}
            </text>
          );
        })}
        {labels.map((l, i) =>
          i % every === 0 || i === labels.length - 1 ? (
            <text key={l} x={cx(i)} y={H - 9} textAnchor="middle" fontSize="11" fill="#7a808a">
              {tickLabel(l)}
            </text>
          ) : null,
        )}
        {labels.map((l, i) => (
          <rect key={'h' + l} x={L + slot * i} y={T} width={slot} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover((h) => (h === i ? null : i))} />
        ))}
      </svg>
      {hover != null && hv != null ? (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: 26,
            left: `${(cx(hover) / W) * 100}%`,
            transform: `translateX(${hover > labels.length / 2 ? 'calc(-100% - 10px)' : '10px'})`,
            background: '#111318',
            color: '#fff',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 24px rgba(16,24,40,.25)',
          }}
        >
          <div style={{ opacity: 0.7 }}>{tickLabel(labels[hover] ?? '')}</div>
          <div>
            <span style={{ color: '#8fa6ff' }}>■</span> {name}: <b>{format(hv)}</b>
          </div>
          {prev != null && prev > 0 ? <PrevLine now={hv} prev={prev} lowerIsBetter={lowerIsBetter} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function PrevLine({ now, prev, lowerIsBetter }: { now: number; prev: number; lowerIsBetter: boolean }) {
  const d = (now / prev - 1) * 100;
  if (Math.abs(d) < 0.5) return <div style={{ marginTop: 2, color: '#c9cfdb' }}>● Same as last month</div>;
  const up = d > 0;
  return (
    <div style={{ marginTop: 2, color: up === lowerIsBetter ? '#ffb4a8' : '#8ee3b0' }}>
      {up ? '▲' : '▼'} {Math.abs(d).toFixed(1)}% {up ? 'higher' : 'lower'} than last month
    </div>
  );
}
