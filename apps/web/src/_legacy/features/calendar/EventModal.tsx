import { useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, Timestamp, updateDoc, where, query, onSnapshot } from 'firebase/firestore';
import { useEffect } from 'react';
import { X, Check, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { EventDoc, UserDoc } from '@/lib/types';

type Props = {
  event?: EventDoc | null;
  defaultStart?: Date;
  onClose: () => void;
};

function toDate(v: any): Date {
  if (!v) return new Date();
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  return new Date(v);
}

function toInput(d: Date) {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export function EventModal({ event, defaultStart, onClose }: Props) {
  const { profile } = useAuth();
  const teamId = profile!.teamId;
  const isEdit = !!event;

  const initStart = event ? toDate(event.start) : defaultStart ?? new Date();
  const initEnd = event ? toDate(event.end) : new Date(initStart.getTime() + 60 * 60000);

  const [title, setTitle] = useState(event?.title ?? '');
  const [start, setStart] = useState(toInput(initStart));
  const [end, setEnd] = useState(toInput(initEnd));
  const [attendees, setAttendees] = useState<string[]>(event?.attendees ?? []);
  const [description, setDescription] = useState<string>((event as any)?.description ?? '');
  const [members, setMembers] = useState<UserDoc[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('teamId', '==', teamId));
    return onSnapshot(q, (snap) => {
      setMembers(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) })));
    });
  }, [teamId]);

  function toggleAttendee(uid: string) {
    setAttendees((prev) => prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]);
  }

  async function onSave() {
    if (!title.trim()) { toast.error('Poné un título'); return; }
    const s = new Date(start);
    const e = new Date(end);
    if (e <= s) { toast.error('El fin tiene que ser después del inicio'); return; }
    setSaving(true);
    try {
      if (isEdit && event) {
        await updateDoc(doc(db, 'events', event.id), {
          title,
          start: Timestamp.fromDate(s),
          end: Timestamp.fromDate(e),
          attendees,
          description,
        });
        toast.success('Evento actualizado');
      } else {
        await addDoc(collection(db, 'events'), {
          teamId,
          ownerId: profile!.uid,
          title,
          start: Timestamp.fromDate(s),
          end: Timestamp.fromDate(e),
          attendees,
          description,
          status: 'confirmed',
          createdAt: serverTimestamp(),
        });
        toast.success('Evento creado. Se notifica a los invitados.');
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function onCancelEvent() {
    if (!event) return;
    if (!confirm('¿Cancelar este evento? Se notifica a los invitados.')) return;
    try {
      await updateDoc(doc(db, 'events', event.id), { status: 'canceled' });
      toast.success('Evento cancelado. Se envía email.');
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isEdit ? 'Editar evento' : 'Nuevo evento'}</h2>
          <button onClick={onClose} className="text-text-dim hover:text-white"><X size={18}/></button>
        </div>

        {event?.googleEventId && (
          <div className="mb-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-400">
            <Check size={12}/> Sync con Google Calendar
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-text-dim">Título</label>
            <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-text-dim">Inicio</label>
              <input type="datetime-local" className="input w-full" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-dim">Fin</label>
              <input type="datetime-local" className="input w-full" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-text-dim"><Users size={12}/> Invitados</label>
            <div className="max-h-40 overflow-auto rounded-md border border-white/5 bg-bg p-2">
              {members.length === 0 && <div className="text-xs text-text-dim">No hay miembros.</div>}
              {members.map((m) => {
                const on = attendees.includes(m.uid);
                return (
                  <button
                    type="button"
                    key={m.uid}
                    onClick={() => toggleAttendee(m.uid)}
                    className={`mr-1 mb-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${on ? 'bg-primary text-white' : 'bg-white/5 text-text-dim'}`}
                  >
                    {on && <Check size={10}/>} {m.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-dim">Descripción</label>
            <textarea className="input w-full" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          {isEdit ? (
            <button onClick={onCancelEvent} className="btn-outline text-red-400">Cancelar evento</button>
          ) : <span/>}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-outline">Cerrar</button>
            <button onClick={onSave} disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
