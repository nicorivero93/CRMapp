import { useMemo, useState } from 'react';
import { addDays, format, startOfWeek, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { where, Timestamp } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useCollection } from '@/lib/useCollection';
import { EventDoc } from '@/lib/types';
import { WeekView } from '@/features/calendar/WeekView';
import { EventModal } from '@/features/calendar/EventModal';
import { GoogleConnect } from '@/features/calendar/GoogleConnect';
import { TeamPanel } from '@/features/calendar/TeamPanel';

function toDate(v: any): Date {
  if (!v) return new Date();
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  return new Date(v);
}

export default function Calendar() {
  const { profile } = useAuth();
  const teamId = profile!.teamId;

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1, locale: es }));
  const [view, setView] = useState<'week' | 'day'>('week');
  const [editing, setEditing] = useState<EventDoc | null>(null);
  const [creating, setCreating] = useState<{ start: Date } | null>(null);

  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1, locale: es }), [weekStart]);

  const { data: allEvents } = useCollection<EventDoc>('events', where('teamId', '==', teamId));

  const events = useMemo(() => {
    const ws = weekStart.getTime();
    const we = weekEnd.getTime();
    return allEvents.filter((e) => {
      const s = toDate(e.start).getTime();
      return s >= ws && s <= we;
    });
  }, [allEvents, weekStart, weekEnd]);

  function prev() { setWeekStart((d) => addDays(d, -7)); }
  function next() { setWeekStart((d) => addDays(d, 7)); }
  function today() { setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1, locale: es })); }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Calendario</h1>
          <p className="text-sm text-text-dim">
            Semana del {format(weekStart, "d 'de' MMM", { locale: es })} al {format(weekEnd, "d 'de' MMM yyyy", { locale: es })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-white/10">
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1.5 text-xs ${view === 'week' ? 'bg-primary text-white' : 'text-text-dim hover:bg-white/5'}`}
            >Semanal</button>
            <button
              onClick={() => setView('day')}
              disabled
              className="px-3 py-1.5 text-xs text-text-dim/50"
              title="Próximamente"
            >Diario</button>
          </div>
          <button onClick={today} className="btn-outline">Hoy</button>
          <button onClick={prev} className="btn-outline"><ChevronLeft size={14}/></button>
          <button onClick={next} className="btn-outline"><ChevronRight size={14}/></button>
          <button onClick={() => setCreating({ start: new Date() })} className="btn-primary"><Plus size={14}/> Nuevo evento</button>
        </div>
      </div>

      <div className="mb-4">
        <GoogleConnect />
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <WeekView
          events={events}
          weekStart={weekStart}
          onEventClick={(e) => setEditing(e)}
          onSlotClick={(date, hour) => {
            const s = new Date(date);
            s.setHours(hour, 0, 0, 0);
            setCreating({ start: s });
          }}
        />
        <TeamPanel />
      </div>

      {editing && <EventModal event={editing} onClose={() => setEditing(null)} />}
      {creating && <EventModal defaultStart={creating.start} onClose={() => setCreating(null)} />}
    </div>
  );
}
