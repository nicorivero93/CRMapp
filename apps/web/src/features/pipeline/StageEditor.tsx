import { useState } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { X, Plus, Trash2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { Stage } from '@/lib/types';

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#22c55e', '#ef4444', '#06b6d4', '#a855f7'];

export function StageEditor({ teamId, stages, onClose }: { teamId: string; stages: Stage[]; onClose: () => void }) {
  const [local, setLocal] = useState<Stage[]>(stages.map((s) => ({ ...s })));

  function update(id: string, patch: Partial<Stage>) {
    setLocal((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function add() {
    const id = `s${Date.now()}`;
    setLocal((p) => [...p, { id, name: 'Nueva etapa', order: p.length, color: COLORS[p.length % COLORS.length], isClosedWon: false }]);
  }

  async function save() {
    await Promise.all(local.map((s, i) => setDoc(doc(db, 'teams', teamId, 'stages', s.id), { ...s, order: i }, { merge: true })));
    const removed = stages.filter((s) => !local.find((l) => l.id === s.id));
    await Promise.all(removed.map((s) => deleteDoc(doc(db, 'teams', teamId, 'stages', s.id))));
    toast.success('Etapas guardadas');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4">
      <div className="card w-full max-w-md p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Configurar etapas</h2>
          <button onClick={onClose} className="btn-ghost !p-1"><X size={16} /></button>
        </div>
        <div className="space-y-2">
          {local.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
              <div className="relative">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: s.color }} />
                <select value={s.color} onChange={(e) => update(s.id, { color: e.target.value })} className="absolute inset-0 opacity-0">
                  {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <input value={s.name} onChange={(e) => update(s.id, { name: e.target.value })} className="input !py-1" />
              <label className="flex items-center gap-1 text-xs text-text-dim" title="Marca esta etapa como cierre ganado (dispara email)">
                <input type="checkbox" checked={s.isClosedWon} onChange={(e) => update(s.id, { isClosedWon: e.target.checked })} />
                Cierre
              </label>
              <button onClick={() => setLocal((p) => p.filter((x) => x.id !== s.id))} className="btn-ghost !p-1 text-bad"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <button onClick={add} className="btn-outline mt-3 w-full"><Plus size={14} /> Agregar etapa</button>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={save} className="btn-primary"><Check size={14} /> Guardar</button>
        </div>
      </div>
    </div>
  );
}
