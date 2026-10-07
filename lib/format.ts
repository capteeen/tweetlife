export function compact(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function fullNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en').format(n);
}

export function relativeTime(iso: string | Date | null | undefined): string {
  if (!iso) return 'never';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60_000, 'second'],
    [3_600_000, 'minute'],
    [86_400_000, 'hour'],
    [604_800_000, 'day'],
    [2_629_800_000, 'week'],
    [31_557_600_000, 'month'],
    [Infinity, 'year'],
  ];
  let prev = 1;
  for (const [limit, unit] of units) {
    if (abs < limit) return rtf.format(Math.round(-diff / prev), unit);
    prev = limit;
  }
  return d.toLocaleDateString();
}

export function dateShort(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
}
