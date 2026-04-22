import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  addWeeks,
  endOfWeek,
  format,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { EventDTO } from '@mycrm/shared';
import { api } from '@/lib/api';
import { WeekView } from '@/components/WeekView';
import { EventModal } from '@/components/EventModal';

interface ModalState {
  mode: 'create' | 'edit';
  event: EventDTO | null;
  defaultStart?: Date;
}

export default function Calendar() {
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [modal, setModal] = useState<ModalState | null>(null);

  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor]);
  const weekEnd = useMemo(() => endOfWeek(anchor, { weekStartsOn: 1 }), [anchor]);

  // from = weekStart 00:00 local, to = next Monday 00:00 (exclusive end).
  const fromIso = useMemo(() => weekStart.toISOString(), [weekStart]);
  const toIso = useMemo(() => addDays(weekStart, 7).toISOString(), [weekStart]);

  const eventsQ = useQuery({
    queryKey: ['events', fromIso, toIso],
    queryFn: () =>
      api.get<{ events: EventDTO[] }>(
        `/api/events?${new URLSearchParams({ from: fromIso, to: toIso }).toString()}`,
      ),
  });

  const events = eventsQ.data?.events ?? [];

  const label = useMemo(() => {
    const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
    if (sameMonth) {
      return `${format(weekStart, 'd', { locale: es })} – ${format(weekEnd, "d 'de' MMMM yyyy", { locale: es })}`;
    }
    return `${format(weekStart, "d MMM", { locale: es })} – ${format(weekEnd, "d MMM yyyy", { locale: es })}`;
  }, [weekStart, weekEnd]);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Calendario</h1>
          <p className="text-xs text-text-dim">Agendá reuniones, llamadas y tareas.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchor(subWeeks(anchor, 1))}
            className="btn-ghost !px-2"
            aria-label="Semana anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setAnchor(new Date())} className="btn-outline">
            Hoy
          </button>
          <button
            onClick={() => setAnchor(addWeeks(anchor, 1))}
            className="btn-ghost !px-2"
            aria-label="Semana siguiente"
          >
            <ChevronRight size={16} />
          </button>
          <div className="ml-2 min-w-[180px] text-sm text-text-dim">{label}</div>
          <button
            onClick={() => {
              const d = new Date();
              d.setHours(9, 0, 0, 0);
              setModal({ mode: 'create', event: null, defaultStart: d });
            }}
            className="btn-primary"
          >
            <Plus size={14} /> Nuevo evento
          </button>
        </div>
      </div>

      {eventsQ.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-text-dim">Cargando…</div>
      ) : eventsQ.isError ? (
        <div className="flex flex-1 items-center justify-center text-red-400">
          Error al cargar eventos
        </div>
      ) : (
        <WeekView
          events={events}
          weekStart={weekStart}
          onEventClick={(e) => setModal({ mode: 'edit', event: e })}
          onSlotClick={(start) => setModal({ mode: 'create', event: null, defaultStart: start })}
        />
      )}

      {modal && (
        <EventModal
          mode={modal.mode}
          event={modal.event}
          defaultStart={modal.defaultStart}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
