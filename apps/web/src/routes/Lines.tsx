import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Phone, Plus, Trash2, CheckCircle2, Circle, AlertTriangle, Pencil } from 'lucide-react';
import type { LineDTO } from '@mycrm/shared';
import { api } from '@/lib/api';

export default function Lines() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LineDTO | null>(null);
  const [creating, setCreating] = useState(false);

  const linesQ = useQuery({
    queryKey: ['lines'],
    queryFn: () => api.get<{ lines: LineDTO[] }>('/api/lines'),
  });

  const activate = useMutation({
    mutationFn: (id: string) => api.post(`/api/lines/${id}/activate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lines'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Línea activada');
    },
    onError: (err: any) => toast.error(err.message ?? 'Error al activar'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/lines/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lines'] });
      toast.success('Línea eliminada');
    },
    onError: (err: any) => toast.error(err.message ?? 'Error al borrar'),
  });

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Phone size={20} className="text-brand-400" /> Mis líneas de WhatsApp
          </h1>
          <p className="text-sm text-text-dim">
            Cada vendedora maneja sus líneas y rota manualmente cuando WA las restringe.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> Nueva línea
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-bg-soft">
        <table className="w-full text-sm">
          <thead className="bg-bg/50 text-xs uppercase tracking-wide text-text-faint">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Activa</th>
              <th className="px-4 py-2 text-left font-medium">Teléfono</th>
              <th className="px-4 py-2 text-left font-medium">Label</th>
              <th className="px-4 py-2 text-left font-medium">Hoy</th>
              <th className="px-4 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!linesQ.isLoading && linesQ.data?.lines.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-text-dim">
                  No tenés líneas cargadas. Agregá una y activala para empezar a enviar.
                </td>
              </tr>
            )}
            {linesQ.data?.lines.map((line) => {
              const pct = line.dailyCapMessages > 0 ? line.dailyCount / line.dailyCapMessages : 0;
              const nearCap = pct >= 0.8;
              return (
                <tr key={line.id} className="hover:bg-bg/40">
                  <td className="px-4 py-2">
                    <button
                      onClick={() => !line.isActive && activate.mutate(line.id)}
                      disabled={activate.isPending}
                      className={`inline-flex items-center gap-2 text-xs ${
                        line.isActive ? 'text-emerald-400' : 'text-text-faint hover:text-text'
                      }`}
                    >
                      {line.isActive ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                      {line.isActive ? 'Activa' : 'Activar'}
                    </button>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{line.phone}</td>
                  <td className="px-4 py-2 text-xs text-text-dim">{line.label ?? '—'}</td>
                  <td className="px-4 py-2 text-xs">
                    <span className={nearCap ? 'text-amber-400' : 'text-text-dim'}>
                      {line.dailyCount} / {line.dailyCapMessages}
                    </span>
                    {nearCap && <AlertTriangle size={12} className="ml-1 inline text-amber-400" />}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      className="btn-ghost mr-1"
                      onClick={() => setEditing(line)}
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="btn-ghost text-red-400"
                      onClick={() => {
                        if (confirm(`¿Borrar la línea ${line.phone}?`)) remove.mutate(line.id);
                      }}
                      title="Borrar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <LineModal
          line={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['lines'] });
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function LineModal({
  line,
  onClose,
  onSaved,
}: {
  line: LineDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [phone, setPhone] = useState(line?.phone ?? '');
  const [label, setLabel] = useState(line?.label ?? '');
  const [cap, setCap] = useState(line?.dailyCapMessages ?? 250);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (line) {
        await api.patch(`/api/lines/${line.id}`, {
          phone,
          label: label || null,
          dailyCapMessages: cap,
        });
        toast.success('Línea actualizada');
      } else {
        await api.post('/api/lines', { phone, label: label || undefined, dailyCapMessages: cap });
        toast.success('Línea creada');
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.message ?? 'Error al guardar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-bg-soft p-5">
        <h2 className="mb-4 text-lg font-semibold">
          {line ? 'Editar línea' : 'Nueva línea de WhatsApp'}
        </h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-text-faint">Teléfono (E.164)</label>
            <input
              className="input"
              placeholder="+5491123456789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-faint">Label (opcional)</label>
            <input
              className="input"
              placeholder="Principal, Chip 2, etc."
              value={label ?? ''}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-faint">Cap diario de mensajes</label>
            <input
              type="number"
              min={1}
              max={10_000}
              className="input"
              value={cap}
              onChange={(e) => setCap(Number(e.target.value) || 250)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-outline" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
