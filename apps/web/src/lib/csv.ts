// Minimal CSV export helper — escapes fields, UTF-8 with BOM for Excel.
function escape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: Array<{ key: keyof T; label: string }>,
): string {
  const header = columns.map((c) => escape(c.label)).join(',');
  const body = rows
    .map((r) => columns.map((c) => escape(r[c.key])).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

export function downloadCsv(filename: string, content: string): void {
  const bom = '\ufeff';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
