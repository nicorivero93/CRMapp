import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Zap, Target } from 'lucide-react';
import type { AppSettings, AssignmentMode } from '@mycrm/shared';
import { api, type PublicUser } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const MODE_LABELS: Record<AssignmentMode, string> = {
  'capacity-weighted': 'Capacidad ponderada (recomendado)',
  'round-robin': 'Round-robin simple',
  'manual-only': 'Solo manual',
};

const MODE_DESCRIPTIONS: Record<AssignmentMode, string> = {
  'capacity-weighted':
    'Al crear o importar, se asigna al vendedor con más capacidad restante hoy (target diario - asignados hoy). Desempata por menor carga absoluta.',
  'round-robin':
    'Misma lógica que capacity-weighted en esta versión. Queda como alias explícito.',
  'manual-only': 'Los leads entran sin asignar. Usá el botón de abajo para repartir.',
};

interface AssignReport {
  assigned: Array<{ leadId: string; userId: string }>;
  unassigned: string[];
  perUser: Record<string, number>;
  total: number;
}

export default function SettingsAssignment() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [runReport, setRunReport] = useState<AssignReport | null>(null);

  if (user && user.role !== 'owner') return <Navigate to="/app/settings" replace />;

  const settingsQ = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ settings: AppSettings }>('/api/settings'),
  });

  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ users: PublicUser[] }>('/api/users'),
  });

  const setMode = useMutation({
    mutationFn: (mode: AssignmentMode) =>
      api.patch<{ settings: AppSettings }>('/api/settings', { assignmentMode: mode }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Modo actualizado');
    },
    onError: (err: any) => toast.error(err.message ?? 'Error al actualizar'),
  });

  const setTarget = useMutation({
    mutationFn: ({ id, target }: { id: string; target: number }) =>
      api.patch(`/api/users/${id}`, { dailyLeadTarget: target }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Target actualizado');
    },
    onError: (err: any) => toast.error(err.message ?? 'Error al actualizar target'),
  });

  const runNow = useMutation({
    mutationFn: () => api.post<AssignReport>('/api/leads/assign', { allUnassigned: true }),
    onSuccess: (r) => {
      setRunReport(r);
      qc.invalidateQueries({ queryKey: ['leads'] });
      if (r.total === 0) toast('No había leads sin asignar');
      else toast.success(`${r.assigned.length} leads repartidos`);
    },
    onError: (err: any) => toast.error(err.message ?? 'Error al ejecutar reparto'),
  });

  const mode = settingsQ.data?.settings.assignmentMode ?? 'capacity-weighted';
  const salesUsers = (usersQ.data?.users ?? []).filter((u) => u.role === 'sales' || u.role === 'owner');

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link to="/app/settings" className="inline-flex items-center gap-1 text-sm text-text-dim hover:text-text">
          <ArrowLeft size={14} /> Volver a configuración
        </Link>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Zap size={20} className="text-brand-400" /> Asignación de leads
        </h1>
        <p className="text-sm text-text-dim">
          Cómo se reparten los leads al entrar y cómo correr un reparto manual.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-bg-soft p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-dim">Modo de asignación</h2>
        <div className="space-y-2">
          {(Object.keys(MODE_LABELS) as AssignmentMode[]).map((m) => (
            <label
              key={m}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                mode === m ? 'border-brand-500/50 bg-brand-500/5' : 'border-border hover:bg-bg-hover'
              }`}
            >
              <input
                type="radio"
                name="mode"
                checked={mode === m}
                onChange={() => setMode.mutate(m)}
                disabled={setMode.isPending}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-medium">{MODE_LABELS[m]}</div>
                <div className="text-xs text-text-dim">{MODE_DESCRIPTIONS[m]}</div>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-bg-soft p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-dim">
            <Target size={14} /> Targets diarios por vendedor
          </h2>
        </div>
        <div className="divide-y divide-border">
          {salesUsers.map((u) => (
            <TargetRow
              key={u.id}
              user={u}
              onSave={(target) => setTarget.mutate({ id: u.id, target })}
              saving={setTarget.isPending}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-text-faint">
          Total capacidad diaria: {salesUsers.reduce((s, u) => s + u.dailyLeadTarget, 0)} leads.
        </p>
      </section>

      <section className="rounded-lg border border-border bg-bg-soft p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-dim">Ejecutar reparto manual</h2>
        <p className="mb-3 text-xs text-text-dim">
          Reparte todos los leads con status <code>new</code> y sin asignar. Usá esto después de
          cambiar targets o cuando el modo esté en <code>manual-only</code>.
        </p>
        <button
          className="btn-primary"
          disabled={runNow.isPending}
          onClick={() => runNow.mutate()}
        >
          {runNow.isPending ? 'Repartiendo…' : 'Ejecutar reparto ahora'}
        </button>
        {runReport && (
          <div className="mt-4 rounded-md border border-border bg-bg/40 p-3 text-xs">
            <div className="mb-2 font-medium">Último reparto</div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Leads" value={runReport.total} />
              <Stat label="Asignados" value={runReport.assigned.length} color="text-emerald-400" />
              <Stat label="Sin asignar" value={runReport.unassigned.length} color="text-amber-400" />
            </div>
            {Object.keys(runReport.perUser).length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-text-faint">Por vendedor:</div>
                <ul className="space-y-0.5 font-mono">
                  {Object.entries(runReport.perUser).map(([uid, n]) => {
                    const u = salesUsers.find((x) => x.id === uid);
                    return (
                      <li key={uid}>
                        {u?.name ?? uid}: <span className="text-brand-400">{n}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function TargetRow({
  user,
  onSave,
  saving,
}: {
  user: PublicUser;
  onSave: (target: number) => void;
  saving: boolean;
}) {
  const [val, setVal] = useState(user.dailyLeadTarget);
  const dirty = val !== user.dailyLeadTarget;
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <div>
        <div>{user.name}</div>
        <div className="text-xs text-text-faint">
          {user.email} · {user.role}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={1000}
          className="input w-24 text-right"
          value={val}
          onChange={(e) => setVal(Number(e.target.value) || 0)}
        />
        <button
          className="btn-outline text-xs"
          disabled={!dirty || saving}
          onClick={() => onSave(val)}
        >
          Guardar
        </button>
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
