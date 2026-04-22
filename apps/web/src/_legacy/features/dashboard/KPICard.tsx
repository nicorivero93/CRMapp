import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, LucideIcon } from 'lucide-react';

type Format = 'number' | 'currency' | 'percent';

type Props = {
  label: string;
  value: string | number;
  prev?: number;
  icon: LucideIcon;
  format?: Format;
};

function formatValue(v: string | number, format: Format): string {
  if (typeof v === 'string') return v;
  if (format === 'currency') return `$${v.toLocaleString('es-AR')}`;
  if (format === 'percent') return `${v.toFixed(1)}%`;
  return v.toLocaleString('es-AR');
}

function computeDelta(current: number, prev: number): number | null {
  if (prev === 0) {
    if (current === 0) return 0;
    return null; // no comparable
  }
  return ((current - prev) / prev) * 100;
}

export function KPICard({ label, value, prev, icon: Icon, format = 'number' }: Props) {
  const numericCurrent = typeof value === 'number' ? value : Number(value);
  const delta = typeof prev === 'number' && !Number.isNaN(numericCurrent)
    ? computeDelta(numericCurrent, prev)
    : null;

  const isUp = delta !== null && delta >= 0;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-text-dim">{label}</div>
          <div className="mt-2 text-3xl font-semibold text-text">
            {formatValue(value, format)}
          </div>
        </div>
        <div className="rounded-lg bg-bg-soft p-2 text-brand-500">
          <Icon size={18} />
        </div>
      </div>

      {delta !== null ? (
        <div
          className={clsx(
            'mt-3 inline-flex items-center gap-1 text-xs font-medium',
            isUp ? 'text-emerald-400' : 'text-red-400'
          )}
        >
          {isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {Math.abs(delta).toFixed(1)}% vs período anterior
        </div>
      ) : (
        <div className="mt-3 text-xs text-text-dim">Sin datos previos</div>
      )}
    </div>
  );
}
