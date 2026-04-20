import { useMemo } from 'react';
import { where } from 'firebase/firestore';
import { Calendar, DollarSign, Target, TrendingUp } from 'lucide-react';
import { endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { useAuth } from '@/lib/auth';
import { useCollection } from '@/lib/useCollection';
import { Contact, Deal, EventDoc, Stage } from '@/lib/types';
import { KPICard } from '@/features/dashboard/KPICard';
import { RevenueChart } from '@/features/dashboard/RevenueChart';
import { ComparisonChart } from '@/features/dashboard/ComparisonChart';

function toDate(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function Dashboard() {
  const { profile } = useAuth();
  const teamId = profile!.teamId;

  const { data: deals } = useCollection<Deal>('deals', where('teamId', '==', teamId));
  const { data: contacts } = useCollection<Contact>('contacts', where('teamId', '==', teamId));
  const { data: events } = useCollection<EventDoc>('events', where('teamId', '==', teamId));
  const { data: stages } = useCollection<Stage>(`teams/${teamId}/stages`);

  const kpis = useMemo(() => {
    const now = new Date();
    const curStart = startOfMonth(now);
    const curEnd = endOfMonth(now);
    const prevRef = subMonths(now, 1);
    const prevStart = startOfMonth(prevRef);
    const prevEnd = endOfMonth(prevRef);

    const wonStageIds = new Set(stages.filter((s) => s.isClosedWon).map((s) => s.id));

    const inRange = (d: Date | null, start: Date, end: Date) =>
      !!d && d >= start && d <= end;

    // Leads del mes
    let leadsCur = 0;
    let leadsPrev = 0;
    for (const c of contacts) {
      const d = toDate(c.createdAt);
      if (inRange(d, curStart, curEnd)) leadsCur++;
      else if (inRange(d, prevStart, prevEnd)) leadsPrev++;
    }

    // Deals totales / cerrados por mes (basado en createdAt) + revenue (basado en closedAt)
    let dealsTotalCur = 0;
    let dealsTotalPrev = 0;
    let dealsClosedCur = 0;
    let dealsClosedPrev = 0;
    let revenueCur = 0;
    let revenuePrev = 0;

    for (const deal of deals) {
      const created = toDate(deal.createdAt);
      const closed = toDate(deal.closedAt);
      const isWon = wonStageIds.has(deal.stageId);

      if (inRange(created, curStart, curEnd)) dealsTotalCur++;
      else if (inRange(created, prevStart, prevEnd)) dealsTotalPrev++;

      if (isWon && inRange(closed, curStart, curEnd)) {
        dealsClosedCur++;
        revenueCur += Number(deal.value) || 0;
      } else if (isWon && inRange(closed, prevStart, prevEnd)) {
        dealsClosedPrev++;
        revenuePrev += Number(deal.value) || 0;
      }
    }

    const closeRateCur = dealsTotalCur > 0 ? (dealsClosedCur / dealsTotalCur) * 100 : 0;
    const closeRatePrev = dealsTotalPrev > 0 ? (dealsClosedPrev / dealsTotalPrev) * 100 : 0;

    // Reuniones agendadas (start >= hoy) vs últimos 30d como comparativa "anterior"
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyAgo = subMonths(today, 1);
    let meetingsUpcoming = 0;
    let meetingsPrev = 0;
    for (const e of events) {
      if (e.status === 'canceled') continue;
      const s = toDate(e.start);
      if (!s) continue;
      if (s >= today) meetingsUpcoming++;
      else if (s >= thirtyAgo && s < today) meetingsPrev++;
    }

    return {
      leadsCur,
      leadsPrev,
      closeRateCur,
      closeRatePrev,
      revenueCur,
      revenuePrev,
      meetingsUpcoming,
      meetingsPrev,
    };
  }, [deals, contacts, events, stages]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-text-dim">Todo en tiempo real</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Leads del mes"
          value={kpis.leadsCur}
          prev={kpis.leadsPrev}
          icon={TrendingUp}
          format="number"
        />
        <KPICard
          label="Tasa de cierre"
          value={kpis.closeRateCur}
          prev={kpis.closeRatePrev}
          icon={Target}
          format="percent"
        />
        <KPICard
          label="Revenue del mes"
          value={kpis.revenueCur}
          prev={kpis.revenuePrev}
          icon={DollarSign}
          format="currency"
        />
        <KPICard
          label="Reuniones agendadas"
          value={kpis.meetingsUpcoming}
          prev={kpis.meetingsPrev}
          icon={Calendar}
          format="number"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <RevenueChart deals={deals} stages={stages} />
        </div>
        <div className="md:col-span-2">
          <ComparisonChart deals={deals} contacts={contacts} stages={stages} />
        </div>
      </div>
    </div>
  );
}
