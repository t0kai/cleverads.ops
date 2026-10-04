/** Straight-line (least squares) fit through the points that have a value. */
export interface LineFit {
  readonly slope: number;
  readonly intercept: number;
  /** 0–1: how closely the months follow the line. */
  readonly r2: number;
  /** The line's value at every position (null where there are too few points). */
  readonly fitted: readonly (number | null)[];
  /** % change of the line from the first to the last month with data. */
  readonly pct: number | null;
}

export function lineFit(values: readonly (number | null)[]): LineFit | null {
  const pts: [number, number][] = [];
  values.forEach((v, x) => {
    if (v != null && Number.isFinite(v)) pts.push([x, v]);
  });
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pts) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  const firstX = pts[0]?.[0] ?? 0;
  const lastX = pts[n - 1]?.[0] ?? 0;
  const first = intercept + slope * firstX;
  const last = intercept + slope * lastX;
  return {
    slope,
    intercept,
    r2: sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0,
    fitted: values.map((_, x) => intercept + slope * x),
    pct: first > 0 ? (last / first - 1) * 100 : null,
  };
}

/** Plain-English label for how steady the trend is. */
export function steadiness(r2: number): 'Steady' | 'Fairly steady' | 'Bumpy, read with care' {
  if (r2 >= 0.5) return 'Steady';
  if (r2 >= 0.25) return 'Fairly steady';
  return 'Bumpy, read with care';
}
