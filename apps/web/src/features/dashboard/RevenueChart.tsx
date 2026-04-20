import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { Deal, Stage } from '@/lib/types';

type Props = {
  deals: Deal[];
  stages: Stage[];
};

function toDate(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function RevenueChart({ deals, stages }: Props) {
  const data = useMemo(() => {
    const wonStageIds = new Set(stages.filter((s) => s.isClosedWon).map((s) => s.id));
    const now = new Date();

    const months = Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(now, 11 - i);
      return {
        start: startOfMonth(d),
        end: endOfMonth(d),
        label: format(d, 'MMM', { locale: es }),
        revenue: 0,
      };
    });

    for (const deal of deals) {
      if (!wonStageIds.has(deal.stageId)) continue;
      const closed = toDate(deal.closedAt);
      if (!closed) continue;
      for (const m of months) {
        if (closed >= m.start && closed <= m.end) {
          m.revenue += Number(deal.value) || 0;
          break;
        }
      }
    }

    return months.map((m) => ({ month: m.label, revenue: m.revenue }));
  }, [deals, stages]);

  return (
    <div className="card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text">Evolución de revenue</h3>
        <p className="text-xs text-text-dim">Últimos 12 meses · deals ganados</p>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#26262c" vertical={false} />
            <XAxis dataKey="month" stroke="#8a8a94" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis
              stroke="#8a8a94"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${Number(v).toLocaleString('es-AR')}`}
            />
            <Tooltip
              contentStyle={{ background: '#16161a', border: '1px solid #26262c', borderRadius: 8 }}
              labelStyle={{ color: '#e5e5ea' }}
              formatter={(v: number) => [`$${v.toLocaleString('es-AR')}`, 'Revenue']}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#revenueGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
