/** Tiny trend line for a table row. Gaps (months with no data) are skipped. */
export function Sparkline({ values, color = '#2447d6', width = 96, height = 26 }: { values: readonly (number | null)[]; color?: string; width?: number; height?: number }) {
  const v = values.filter((n): n is number => n != null && Number.isFinite(n));
  if (v.length < 2) return <span style={{ color: '#9aa0aa', fontSize: 12 }}>—</span>;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const pts = values
    .map((n, i) => (n == null || !Number.isFinite(n) ? null : `${(i * step).toFixed(1)},${(height - 3 - ((n - min) / (max - min || 1)) * (height - 6)).toFixed(1)}`))
    .filter((p): p is string => p !== null)
    .join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
