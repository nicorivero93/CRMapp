import { useMemo } from 'react';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { EventDTO } from '@mycrm/shared';

interface Props {
  events: EventDTO[];
  weekStart: Date; // Monday 00:00 local.
  onEventClick: (e: EventDTO) => void;
  onSlotClick: (start: Date) => void;
}

const HOUR_START = 0;
const HOUR_END = 24;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START);
const ROW_H = 48; // height per hour.
const DEFAULT_COLOR = '#6366f1';

interface Layout {
  event: EventDTO;
  top: number;
  height: number;
  col: number;
  cols: number;
}

/**
 * Compute side-by-side layout for overlapping events within a single day's event list.
 * Greedy column packing.
 */
function layoutDay(dayStart: Date, events: EventDTO[]): Layout[] {
  const sorted = [...events].sort((a, b) => +new Date(a.start) - +new Date(b.start));
  type Col = { endMs: number };
  const cols: Col[] = [];
  const assigned: Array<{ ev: EventDTO; colIdx: number; startMs: number; endMs: number }> = [];

  for (const ev of sorted) {
    const startMs = +new Date(ev.start);
    const endMs = +new Date(ev.end);
    let placed = -1;
    for (let i = 0; i < cols.length; i++) {
      if (cols[i]!.endMs <= startMs) {
        cols[i] = { endMs };
        placed = i;
        break;
      }
    }
    if (placed < 0) {
      cols.push({ endMs });
      placed = cols.length - 1;
    }
    assigned.push({ ev, colIdx: placed, startMs, endMs });
  }

  // For each event, determine total cols in its overlap cluster.
  const layouts: Layout[] = assigned.map((a) => {
    let maxCol = a.colIdx;
    for (const other of assigned) {
      if (other === a) continue;
      const overlap = !(other.endMs <= a.startMs || other.startMs >= a.endMs);
      if (overlap && other.colIdx > maxCol) maxCol = other.colIdx;
    }
    const cols = maxCol + 1;
    const dayStartMs = dayStart.getTime();
    const startHour = (a.startMs - dayStartMs) / 3_600_000;
    const durHours = (a.endMs - a.startMs) / 3_600_000;
    const top = (startHour - HOUR_START) * ROW_H;
    const height = Math.max(20, durHours * ROW_H);
    return { event: a.ev, top, height, col: a.colIdx, cols };
  });

  return layouts;
}

export function WeekView({ events, weekStart, onEventClick, onSlotClick }: Props) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const byDay = useMemo(() => {
    const m = new Map<number, EventDTO[]>();
    days.forEach((_, i) => m.set(i, []));
    for (const e of events) {
      const s = new Date(e.start);
      const idx = days.findIndex((d) => isSameDay(d, s));
      if (idx >= 0) m.get(idx)!.push(e);
    }
    return m;
  }, [events, days]);

  const layoutsByDay = useMemo(() => {
    const m = new Map<number, Layout[]>();
    days.forEach((d, i) => {
      m.set(i, layoutDay(startOfDay(d), byDay.get(i) ?? []));
    });
    return m;
  }, [days, byDay]);

  return (
    <div className="flex-1 overflow-auto rounded-xl border border-border bg-bg-soft">
      <div
        className="grid min-w-[900px]"
        style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}
      >
        {/* header row */}
        <div className="sticky top-0 z-20 border-b border-border bg-bg-soft" />
        {days.map((d, i) => {
          const today = isSameDay(d, new Date());
          return (
            <div
              key={i}
              className={`sticky top-0 z-20 border-b border-l border-border bg-bg-soft px-3 py-2 text-center ${
                today ? 'text-brand-400' : ''
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider text-text-dim">
                {format(d, 'EEE', { locale: es })}
              </div>
              <div className="text-lg font-semibold">{format(d, 'd')}</div>
            </div>
          );
        })}

        {/* hours column */}
        <div className="border-r border-border">
          {HOURS.map((h) => (
            <div
              key={h}
              className="flex items-start justify-end pr-2 pt-1 text-[10px] text-text-dim"
              style={{ height: ROW_H }}
            >
              {h.toString().padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* day columns */}
        {days.map((d, dayIdx) => {
          const layouts = layoutsByDay.get(dayIdx) ?? [];
          const dStart = startOfDay(d);
          return (
            <div
              key={dayIdx}
              className="relative border-l border-border"
              style={{ height: HOURS.length * ROW_H }}
            >
              {/* hour slots (clickable in 30-min halves) */}
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="border-b border-border/50"
                  style={{ height: ROW_H }}
                >
                  <div
                    onClick={() => {
                      const at = new Date(dStart);
                      at.setHours(h, 0, 0, 0);
                      onSlotClick(at);
                    }}
                    className="h-1/2 cursor-pointer hover:bg-white/5"
                  />
                  <div
                    onClick={() => {
                      const at = new Date(dStart);
                      at.setHours(h, 30, 0, 0);
                      onSlotClick(at);
                    }}
                    className="h-1/2 cursor-pointer hover:bg-white/5"
                  />
                </div>
              ))}

              {/* events */}
              {layouts.map(({ event, top, height, col, cols }) => {
                const widthPct = 100 / cols;
                const leftPct = widthPct * col;
                const bg = event.color ?? DEFAULT_COLOR;
                const canceled = event.status === 'canceled';
                const s = new Date(event.start);
                const e = new Date(event.end);
                return (
                  <button
                    key={event.id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onEventClick(event);
                    }}
                    className="absolute overflow-hidden rounded-md px-2 py-1 text-left text-xs text-white shadow-md transition hover:brightness-110"
                    style={{
                      top,
                      height,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      backgroundColor: bg,
                      opacity: canceled ? 0.4 : 0.95,
                      textDecoration: canceled ? 'line-through' : 'none',
                    }}
                    title={event.title}
                  >
                    <div className="truncate font-semibold leading-tight">{event.title}</div>
                    <div className="text-[10px] opacity-80">
                      {format(s, 'HH:mm')}–{format(e, 'HH:mm')}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
