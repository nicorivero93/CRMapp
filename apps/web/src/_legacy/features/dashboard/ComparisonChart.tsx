import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { subDays } from 'date-fns';
import { Contact, Deal, Stage } from '@/lib/types';

type Props = {
  deals: Deal[];
  contacts: Contact[];
  stages: Stage[];
};

function toDate(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function ComparisonChart({ deals, contacts, stages }: Props) {
  const data = useMemo(() => {
    const wonStageIds = new Set(stages.filter((s) => s.isClosedWon).map((s) => s.id));
    const now = new Date();
    const currentStart = subDays(now, 30);
    const prevStart = subDays(now, 60);
    const prevEnd = currentStart;

    const inRange = (d: Date | null, start: Date, end: Date) =>
      !!d && d >= start && d < end;

    let leadsCurrent = 0;
    let leadsPrev = 0;
    for (const c of contacts) {
      const d = toDate(c.createdAt);
      if (inRange(d, currentStart, now)) leadsCurrent++;
      else if (inRange(d, prevStart, prevEnd)) leadsPrev++;
    }

    let dealsCurrent = 0;
    let dealsPrev = 0;
    let revenueCurrent = 0;
    let revenuePrev = 0;
    for (const deal of deals) {
      if (!wonStageIds.has(deal.stageId)) continue;
      const d = toDate(deal.closedAt);
      if (inRange(d, currentStart, now)) {
        dealsCurrent++;
        revenueCurrent += Number(deal.value) || 0;
      } else if (inRange(d, prevStart, prevEnd)) {
        dealsPrev++;
        revenuePrev += Number(deal.value) || 0;
      }
    }

    return [
      { metric: 'Leads nuevos', actual: leadsCurrent, anterior: leadsPrev },
      { metric: 'Deals cerrados', actual: dealsCurrent, anterior: dealsPrev },
      { metric: 'Revenue', actual: revenueCurrent, anterior: revenuePrev },
    ];
  }, [deals, contacts, stages]);

  return (
    <div className="card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text">Comparativa 30 días</h3>
        <p className="text-xs text-text-dim">Actual vs período anterior</p>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#26262c" vertical={false} />
            <XAxis dataKey="metric" stroke="#8a8a94" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#8a8a94" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: '#16161a', border: '1px solid #26262c', borderRadius: 8 }}
              labelStyle={{ color: '#e5e5ea' }}
              cursor={{ fill: 'rgba(99,102,241,0.08)' }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#8a8a94' }} />
            <Bar dataKey="anterior" name="Anterior" fill="#3f3f46" radius={[4, 4, 0, 0]} />
            <Bar dataKey="actual" name="Actual" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
