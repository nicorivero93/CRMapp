import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { addDoc, collection, deleteDoc, doc, orderBy, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { X, Mail, Phone, Trash2, Edit2, Plus } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useCollection } from '@/lib/useCollection';
import { Contact } from '@/lib/types';

type Props = { contact: Contact; onClose: () => void };

type Activity = {
  id: string;
  contactId: string;
  teamId: string;
  type: 'note' | 'call' | 'email';
  content: string;
  createdAt: any;
  createdBy: string;
};

function tsToDate(x: any): Date | null {
  if (!x) return null;
  if (x instanceof Date) return x;
  if (typeof x?.toDate === 'function') return x.toDate();
  if (typeof x === 'string') return new Date(x);
  return null;
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export function ContactDrawer({ contact, onClose }: Props) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'info' | 'activity'>('info');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newActivity, setNewActivity] = useState<null | { type: Activity['type']; content: string }>(null);

  const { register, handleSubmit, reset } = useForm<Partial<Contact>>({ defaultValues: contact });

  const { data: activities } = useCollection<Activity>(
    'activities',
    where('contactId', '==', contact.id),
    orderBy('createdAt', 'desc'),
  );

  async function save(v: Partial<Contact>) {
    try {
      await updateDoc(doc(db, 'contacts', contact.id), {
        name: v.name,
        email: v.email ?? null,
        phone: v.phone ?? null,
        company: v.company ?? null,
        country: v.country ?? null,
        industry: v.industry ?? null,
      });
      toast.success('Contacto actualizado');
      setEditing(false);
      reset(v);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function del() {
    try {
      await deleteDoc(doc(db, 'contacts', contact.id));
      toast.success('Contacto eliminado');
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function addActivity() {
    if (!newActivity || !newActivity.content.trim()) return;
    try {
      await addDoc(collection(db, 'activities'), {
        contactId: contact.id,
        teamId: profile!.teamId,
        type: newActivity.type,
        content: newActivity.content.trim(),
        createdAt: serverTimestamp(),
        createdBy: profile!.uid,
      });
      await updateDoc(doc(db, 'contacts', contact.id), { lastContactAt: serverTimestamp() });
      toast.success('Actividad registrada');
      setNewActivity(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="fixed inset-0 z-30">
      <div className="absolute inset-0 bg-black/60 transition-opacity" onClick={onClose} />
      <div
        className="absolute right-0 top-0 flex h-full w-[420px] flex-col bg-bg-card shadow-2xl"
        style={{ animation: 'slideIn .2s ease-out' }}
      >
        <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        <div className="flex items-start justify-between border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/20 text-sm font-semibold text-brand-500">
              {initials(contact.name || '?')}
            </div>
            <div>
              <div className="text-lg font-semibold">{contact.name}</div>
              <div className="text-xs text-text-dim">{contact.company ?? 'Sin empresa'}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-text-dim hover:text-white"><X size={18} /></button>
        </div>

        <div className="flex border-b border-white/10">
          {(['info', 'activity'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-4 py-3 text-sm ${tab === t ? 'border-b-2 border-brand-500 text-white' : 'text-text-dim hover:text-white'}`}
            >
              {t === 'info' ? 'Info' : 'Actividad'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'info' && !editing && (
            <div className="space-y-3 text-sm">
              <Row label="Email" value={contact.email} icon={<Mail size={14} />} />
              <Row label="Teléfono" value={contact.phone} icon={<Phone size={14} />} />
              <Row label="Empresa" value={contact.company} />
              <Row label="País" value={contact.country} />
              <Row label="Industria" value={contact.industry} />
              <Row label="Owner" value={contact.ownerId} />
            </div>
          )}

          {tab === 'info' && editing && (
            <form onSubmit={handleSubmit(save)} className="space-y-3 text-sm">
              {(['name', 'email', 'phone', 'company', 'country', 'industry'] as const).map((f) => (
                <div key={f}>
                  <label className="mb-1 block text-xs text-text-dim capitalize">{f}</label>
                  <input className="input" {...register(f)} />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setEditing(false); reset(contact); }} className="btn-outline">Cancelar</button>
                <button type="submit" className="btn-primary">Guardar</button>
              </div>
            </form>
          )}

          {tab === 'activity' && (
            <div className="space-y-3">
              {newActivity && (
                <div className="card p-3">
                  <select
                    className="input mb-2"
                    value={newActivity.type}
                    onChange={(e) => setNewActivity({ ...newActivity, type: e.target.value as Activity['type'] })}
                  >
                    <option value="note">Nota</option>
                    <option value="call">Llamada</option>
                    <option value="email">Email</option>
                  </select>
                  <textarea
                    className="input min-h-[80px]"
                    placeholder="Describí la actividad…"
                    value={newActivity.content}
                    onChange={(e) => setNewActivity({ ...newActivity, content: e.target.value })}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button onClick={() => setNewActivity(null)} className="btn-outline">Cancelar</button>
                    <button onClick={addActivity} className="btn-primary">Guardar</button>
                  </div>
                </div>
              )}

              {activities.length === 0 && !newActivity && (
                <div className="text-sm text-text-dim">Sin actividad todavía.</div>
              )}

              {activities.map((a) => {
                const d = tsToDate(a.createdAt);
                return (
                  <div key={a.id} className="card p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="chip bg-white/10 text-text-dim">{a.type}</span>
                      <span className="text-xs text-text-dim">
                        {d ? formatDistanceToNow(d, { addSuffix: true, locale: es }) : ''}
                      </span>
                    </div>
                    <div className="text-sm">{a.content}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 p-4">
          {tab === 'activity' ? (
            <button onClick={() => setNewActivity({ type: 'note', content: '' })} className="btn-primary">
              <Plus size={14} /> Nueva actividad
            </button>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-outline">
              <Edit2 size={14} /> Editar
            </button>
          )}

          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-dim">¿Seguro?</span>
              <button onClick={() => setConfirmDelete(false)} className="btn-outline">No</button>
              <button onClick={del} className="btn-primary bg-warn text-black">Sí, eliminar</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="btn-outline text-warn">
              <Trash2 size={14} /> Eliminar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-2">
      <span className="flex items-center gap-2 text-xs text-text-dim">{icon}{label}</span>
      <span className="text-right">{value || '—'}</span>
    </div>
  );
}
