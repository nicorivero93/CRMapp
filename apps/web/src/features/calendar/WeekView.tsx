import { useMemo } from 'react';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { EventDoc } from '@/lib/types';

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6am..10pm
const ROW_H = 56;

function ownerColor(ownerId: string) {
  let hash = 0;
  for (let i = 0; i < ownerId.length; i++) hash = (hash * 31 + ownerId.charCodeAt(i)) | 0;
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 45%)`;
}

function toDate(v: any): Date {
  if (!v) return new Date();
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'string') return new Date(v);
  if (typeof v === 'number') return new Date(v);
  return new Date();
}

type Props = {
  events: EventDoc[];
  weekStart: Date;
  onEventClick: (e: EventDoc) => void;
  onSlotClick: (date: Date, hour: number) => void;
};

export function WeekView({ events, weekStart, onEventClick, onSlotClick }: Props) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const eventsByDay = useMemo(() => {
    const m = new Map<number, EventDoc[]>();
    days.forEach((_, i) => m.set(i, []));
    events.forEach((e) => {
      const s = toDate(e.start);
      const idx = days.findIndex((d) => isSameDay(d, s));
      if (idx >= 0) m.get(idx)!.push(e);
    });
    return m;
  }, [events, days]);

  return (
    <div className="flex-1 overflow-auto rounded-lg border border-white/5 bg-bg-card">
      <div className="grid min-w-[900px]" style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}>
        <div className="sticky top-0 z-10 border-b border-white/5 bg-bg-card" />
        {days.map((d, i) => {
          const isToday = isSameDay(d, new Date());
          return (
            <div
              key={i}
              className={`sticky top-0 z-10 border-b border-l border-white/5 bg-bg-card px-3 py-2 text-center ${isToday ? 'text-primary' : ''}`}
            >
              <div className="text-xs uppercase text-text-dim">{format(d, 'EEE', { locale: es })}</div>
              <div className="text-lg font-semibold">{format(d, 'd')}</div>
            </div>
          );
        })}

        {/* hours column */}
        <div className="border-r border-white/5">
          {HOURS.map((h) => (
            <div key={h} className="flex items-start justify-end pr-2 pt-1 text-[10px] text-text-dim" style={{ height: ROW_H }}>
              {h.toString().padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* day columns */}
        {days.map((d, i) => (
          <div key={i} className="relative border-l border-white/5" style={{ height: HOURS.length * ROW_H }}>
            {HOURS.map((h) => (
              <div
                key={h}
                onClick={() => onSlotClick(startOfDay(d), h)}
                className="cursor-pointer border-b border-white/5 hover:bg-white/5"
                style={{ height: ROW_H }}
              />
            ))}
            {(eventsByDay.get(i) ?? []).map((e) => {
              const s = toDate(e.start);
              const en = toDate(e.end);
              const startHour = s.getHours() + s.getMinutes() / 60;
              const durH = Math.max(0.5, (en.getTime() - s.getTime()) / 3600000);
              const top = (startHour - 6) * ROW_H;
              const height = durH * ROW_H;
              const bg = e.color ?? ownerColor(e.ownerId);
              const canceled = e.status === 'canceled';
              return (
                <button
                  key={e.id}
                  onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                  className="absolute left-1 right-1 overflow-hidden rounded-md px-2 py-1 text-left text-xs text-white shadow-md transition hover:brightness-110"
                  style={{
                    top,
                    height,
                    backgroundColor: bg,
                    opacity: canceled ? 0.4 : 0.95,
                    textDecoration: canceled ? 'line-through' : 'none',
                  }}
                  title={e.title}
                >
                  <div className="font-semibold leading-tight">{e.title}</div>
                  <div className="text-[10px] opacity-80">
                    {format(s, 'HH:mm')}–{format(en, 'HH:mm')}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
