/**
 * CSV text for Excel / Google Sheets. Text cells that start with = + - @ (or a tab) get a leading
 * apostrophe so a spreadsheet shows them as text instead of running them as a formula.
 */
export type CsvCell = string | number | null;

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const cell = (v: CsvCell) => {
    if (v == null) return '';
    let t = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/** Starts a download in the browser. Returns false if the browser blocked it. */
export function downloadCsv(fileName: string, header: readonly string[], rows: readonly (readonly CsvCell[])[]): boolean {
  try {
    const url = URL.createObjectURL(new Blob(['﻿' + toCsv(header, rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.replace(/[^\w.-]+/g, '-');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/** "acm_2025-01_to_2025-12.csv" */
export function csvName(...parts: readonly string[]): string {
  return (
    parts
      .map((p) => p.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
      .filter(Boolean)
      .join('_') + '.csv'
  );
}
