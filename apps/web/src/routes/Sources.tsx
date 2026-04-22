import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BarChart3 } from 'lucide-react';
import type { SourcesReport } from '@mycrm/shared';
import { api } from '@/lib/api';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#f43f5e', '#84cc16', '#a855f7', '#14b8a6', '#fb923c'];

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

const RANGES = [
  { label: 'Últimos 7 días', days: 7 },
  { label: 'Últimos 30 días', days: 30 },
  { label: 'Últimos 90 días', days: 90 },
  { label: 'Todo', days: null },
];

export default function Sources() {
  const [rangeDays, setRangeDays] = useState<number | null>(30);

  const params = new URLSearchParams();
  if (rangeDays !== null) params.set('from', daysAgoISO(rangeDays));

  const { data, isLoading } = useQuery({
    queryKey: ['sources', rangeDays],
    queryFn: () =>
      api.get<{ report: SourcesReport }>(
        '/api/analytics/sources' + (params.toString() ? '?' + params.toString() : ''),
      ),
  });

  const report = data?.report;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <BarChart3 size={20} className="text-brand-400" /> Fuentes
          </h1>
          <p className="text-sm text-text-dim">
            Breakdown de leads por fuente, con conversiones y descarte.
          </p>
        </div>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRangeDays(r.days)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                rangeDays === r.days
                  ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                  : 'border-border text-text-dim hover:bg-bg-hover'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {report && (
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Leads totales" value={report.totals.total} />
          <Kpi label="Convertidos" value={report.totals.converted} color="text-emerald-400" />
          <Kpi label="Descartados" value={report.totals.discarded} color="text-red-400" />
        </div>
      )}

      <section className="rounded-lg border border-border bg-bg-soft p-4">
        <h2 className="mb-4 text-sm font-semibold text-text-dim">Volumen por fuente</h2>
        {isLoading && <div className="text-sm text-text-dim">Cargando…</div>}
        {report && report.rows.length === 0 && (
          <div className="py-10 text-center text-sm text-text-dim">Sin datos en este rango.</div>
        )}
        {report && report.rows.length > 0 && (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.rows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <XAxis
                  dataKey="source"
                  stroke="#71717a"
                  tick={{ fontSize: 11 }}
                />
                <YAxis stroke="#71717a" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: '#16161a',
                    border: '1px solid #26262c',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {report.rows.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {report && report.rows.length > 0 && (
        <section className="rounded-lg border border-border bg-bg-soft p-4">
          <h2 className="mb-3 text-sm font-semibold text-text-dim">Detalle por status</h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg/50 text-xs uppercase tracking-wide text-text-faint">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Fuente</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">Nuevos</th>
                  <th className="px-3 py-2 text-right font-medium">Asignados</th>
                  <th className="px-3 py-2 text-right font-medium">Contactados</th>
                  <th className="px-3 py-2 text-right font-medium">Convertidos</th>
                  <th className="px-3 py-2 text-right font-medium">Descartados</th>
                  <th className="px-3 py-2 text-right font-medium">Conv. %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.rows.map((r) => (
                  <tr key={r.source}>
                    <td className="px-3 py-2 text-text">{r.source}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.total}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-dim">{r.byStatus.new ?? 0}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-dim">{r.byStatus.assigned ?? 0}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-dim">{r.byStatus.contacted ?? 0}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-400">
                      {r.byStatus.converted ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-red-400">
                      {r.byStatus.discarded ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {(r.conversionRate * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-soft p-4">
      <div className="text-xs uppercase tracking-wide text-text-faint">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color ?? 'text-text'}`}>{value}</div>
    </div>
  );
}
