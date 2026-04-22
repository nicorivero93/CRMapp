import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Recycle, Plus, Trash2, Pencil, Play } from 'lucide-react';
import type {
  LeadStatus,
  RecyclingAction,
  RecyclingReport,
  RecyclingRuleDTO,
} from '@mycrm/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const ACTION_LABELS: Record<RecyclingAction, string> = {
  'return-to-pool': 'Devolver al pool (sin asignar)',
  'reassign-to-different-user': 'Reasignar a otra vendedora',
  'escalate-to-owner': 'Escalar al dueño',
};

const STATUS_OPTIONS: LeadStatus[] = [
  'new',
  'assigned',
  'contacted',
  'responded',
  'qualified',
  'no-response',
  'recycled',
];

export default function SettingsRecycling() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RecyclingRuleDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [lastReport, setLastReport] = useState<RecyclingReport | null>(null);

  if (user && user.role !== 'owner') return <Navigate to="/app/settings" replace />;

  const rulesQ = useQuery({
    queryKey: ['recycling-rules'],
    queryFn: () => api.get<{ rules: RecyclingRuleDTO[] }>('/api/recycling-rules'),
  });

  const previewQ = useQuery({
    queryKey: ['recycling-preview'],
    queryFn: () => api.get<{ candidates: any[] }>('/api/recycling/preview'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/recycling-rules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recycling-rules'] });
      qc.invalidateQueries({ queryKey: ['recycling-preview'] });
      toast.success('Regla eliminada');
    },
    onError: (err: any) => toast.error(err.message ?? 'Error al borrar'),
  });

  const runNow = useMutation({
    mutationFn: () => api.post<{ report: RecyclingReport }>('/api/recycling/run-now'),
    onSuccess: (r) => {
      setLastReport(r.report);
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['recycling-preview'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (r.report.evaluated === 0) toast('No había nada para reciclar');
      else toast.success(`Ciclo: ${r.report.recycled} reciclados, ${r.report.discarded} descartados`);
    },
    onError: (err: any) => toast.error(err.message ?? 'Error'),
  });

  const candidates = previewQ.data?.candidates ?? [];

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <Link
          to="/app/settings"
          className="inline-flex items-center gap-1 text-sm text-text-dim hover:text-text"
        >
          <ArrowLeft size={14} /> Volver a configuración
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Recycle size={20} className="text-brand-400" /> Reciclaje de leads
          </h1>
          <p className="text-sm text-text-dim">
            Leads sin contactar vuelven al pool después de N días. Corre automático todos los días
            a medianoche.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> Nueva regla
        </button>
      </div>

      <section className="rounded-lg border border-border bg-bg-soft p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-dim">Reglas activas</h2>
        {rulesQ.isLoading && <div className="text-sm text-text-dim">Cargando…</div>}
        {rulesQ.data?.rules.length === 0 && (
          <div className="text-sm text-text-dim">
            Sin reglas. Creá la primera — por ejemplo "asignados sin contacto en 7 días → devolver
            al pool".
          </div>
        )}
        <div className="divide-y divide-border">
          {rulesQ.data?.rules.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{r.name}</span>
                  {!r.enabled && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-amber-400">
                      deshabilitada
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-text-dim">
                  Si <span className="font-mono">{r.statusIn.join(', ')}</span> y pasaron{' '}
                  <span className="font-mono">{r.daysSinceLastContact}d</span> sin contacto →{' '}
                  <span className="text-brand-400">{ACTION_LABELS[r.action]}</span>. Máx{' '}
                  {r.maxRecyclesPerLead} ciclos por lead.
                </div>
              </div>
              <div className="flex gap-1">
                <button className="btn-ghost" onClick={() => setEditing(r)} title="Editar">
                  <Pencil size={14} />
                </button>
                <button
                  className="btn-ghost text-red-400"
                  onClick={() => {
                    if (confirm(`¿Borrar "${r.name}"?`)) remove.mutate(r.id);
                  }}
                  title="Borrar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-bg-soft p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-dim">Ejecutar ciclo manual</h2>
          <span className="text-xs text-text-faint">
            {candidates.length} lead{candidates.length === 1 ? '' : 's'} en cola
          </span>
        </div>
        <p className="mb-3 text-xs text-text-dim">
          Revisá los candidatos y corré el ciclo manualmente. El cron automático corre igual a las
          00:00 TZ.
        </p>
        <button
          className="btn-primary"
          disabled={runNow.isPending || candidates.length === 0}
          onClick={() => runNow.mutate()}
        >
          <Play size={14} /> {runNow.isPending ? 'Ejecutando…' : 'Ejecutar ciclo ahora'}
        </button>

        {candidates.length > 0 && (
          <div className="mt-4 max-h-64 overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-bg/50 text-text-faint">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Lead</th>
                  <th className="px-3 py-1.5 text-left font-medium">Regla</th>
                  <th className="px-3 py-1.5 text-left font-medium">Última actividad</th>
                  <th className="px-3 py-1.5 text-left font-medium">Acción prevista</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {candidates.map((c) => (
                  <tr key={c.leadId}>
                    <td className="px-3 py-1.5">
                      <Link to={`/app/leads/${c.leadId}`} className="text-brand-400 hover:underline">
                        {c.name ?? c.phone}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-text-dim">{c.ruleName}</td>
                    <td className="px-3 py-1.5 font-mono text-text-faint">
                      {c.lastActivityAt.slice(0, 10)}
                    </td>
                    <td className="px-3 py-1.5">
                      {c.willDiscard ? (
                        <span className="text-red-400">descartar</span>
                      ) : (
                        <span className="text-amber-400">reciclar</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lastReport && (
          <div className="mt-4 rounded-md border border-border bg-bg/40 p-3 text-xs">
            <div className="mb-2 font-medium">Último ciclo</div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <Stat label="Evaluados" value={lastReport.evaluated} />
              <Stat label="Reciclados" value={lastReport.recycled} color="text-emerald-400" />
              <Stat label="Descartados" value={lastReport.discarded} color="text-red-400" />
              <Stat label="Reasignados" value={lastReport.reassigned} color="text-brand-400" />
            </div>
          </div>
        )}
      </section>

      {(creating || editing) && (
        <RuleModal
          rule={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['recycling-rules'] });
            qc.invalidateQueries({ queryKey: ['recycling-preview'] });
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function RuleModal({
  rule,
  onClose,
  onSaved,
}: {
  rule: RecyclingRuleDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? '');
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [statusIn, setStatusIn] = useState<LeadStatus[]>(
    (rule?.statusIn as LeadStatus[]) ?? ['assigned'],
  );
  const [days, setDays] = useState(rule?.daysSinceLastContact ?? 7);
  const [action, setAction] = useState<RecyclingAction>(rule?.action ?? 'return-to-pool');
  const [maxRecycles, setMaxRecycles] = useState(rule?.maxRecyclesPerLead ?? 3);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (statusIn.length === 0) {
      toast.error('Seleccioná al menos un status');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name,
        enabled,
        statusIn,
        daysSinceLastContact: days,
        action,
        maxRecyclesPerLead: maxRecycles,
      };
      if (rule) await api.patch(`/api/recycling-rules/${rule.id}`, payload);
      else await api.post('/api/recycling-rules', payload);
      toast.success('Regla guardada');
      onSaved();
    } catch (err: any) {
      toast.error(err.message ?? 'Error al guardar');
    } finally {
      setBusy(false);
    }
  }

  function toggleStatus(s: LeadStatus) {
    setStatusIn((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-bg-soft p-5">
        <h2 className="mb-4 text-lg font-semibold">{rule ? 'Editar regla' : 'Nueva regla'}</h2>
        <form onSubmit={submit} className="space-y-3">
          <input
            className="input"
            placeholder='Nombre (ej. "Asignados sin contacto 7d")'
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <div>
            <label className="mb-1 block text-xs text-text-faint">Status a vigilar</label>
            <div className="flex flex-wrap gap-1">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    statusIn.includes(s)
                      ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                      : 'border-border text-text-dim hover:bg-bg-hover'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-text-faint">Días sin contacto</label>
              <input
                type="number"
                min={1}
                max={365}
                className="input"
                value={days}
                onChange={(e) => setDays(Number(e.target.value) || 1)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-faint">Máx reciclos por lead</label>
              <input
                type="number"
                min={1}
                max={20}
                className="input"
                value={maxRecycles}
                onChange={(e) => setMaxRecycles(Number(e.target.value) || 3)}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-faint">Acción</label>
            <select
              className="input"
              value={action}
              onChange={(e) => setAction(e.target.value as RecyclingAction)}
            >
              {(Object.keys(ACTION_LABELS) as RecyclingAction[]).map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABELS[a]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Regla activa
          </label>
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

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-md border border-border bg-bg/60 p-2">
      <div className={`text-lg font-semibold ${color ?? 'text-text'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-text-faint">{label}</div>
    </div>
  );
}
