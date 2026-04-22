import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Trash2, Pencil, Zap, Power } from 'lucide-react';
import type { AutomationDTO, AutomationTrigger } from '@mycrm/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { RuleEditor } from '@/components/RuleEditor';

function triggerLabel(trigger: AutomationTrigger): string {
  const p = trigger.params as Record<string, string | undefined>;
  switch (trigger.type) {
    case 'lead.created':
      return p.source ? `Nuevo lead de ${p.source}` : 'Nuevo lead (cualquier fuente)';
    case 'lead.status-changed': {
      const from = p.from ?? '*';
      const to = p.to ?? '*';
      return `Lead pasa de ${from} → ${to}`;
    }
    case 'deal.stage-changed':
      return 'Deal cambia de etapa';
    case 'contact.created':
      return 'Nuevo contacto';
    case 'event.canceled':
      return 'Evento cancelado';
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-AR');
  } catch {
    return '—';
  }
}

export default function Automations() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AutomationDTO | null>(null);
  const [creating, setCreating] = useState(false);

  if (user && user.role !== 'owner') return <Navigate to="/app/settings" replace />;

  const rulesQ = useQuery({
    queryKey: ['automations'],
    queryFn: () => api.get<{ automations: AutomationDTO[] }>('/api/automations'),
  });

  const toggle = useMutation({
    mutationFn: (rule: AutomationDTO) =>
      api.patch(`/api/automations/${rule.id}`, { enabled: !rule.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
    onError: (err: any) => toast.error(err?.message ?? 'Error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/automations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automations'] });
      toast.success('Regla eliminada');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Error al borrar'),
  });

  const rules = rulesQ.data?.automations ?? [];

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Zap size={20} className="text-brand-400" /> Automatizaciones
          </h1>
          <p className="text-sm text-text-dim">
            Cuando pasa algo en tu CRM, corré acciones sin tocar nada. SI → Y → ENTONCES.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> Nueva
        </button>
      </div>

      {rulesQ.isLoading && <div className="text-sm text-text-dim">Cargando…</div>}

      {!rulesQ.isLoading && rules.length === 0 && (
        <div className="rounded-lg border border-border bg-bg-soft p-6 text-center text-sm text-text-dim">
          No hay reglas todavía. Creá la primera para automatizar tu flujo.
        </div>
      )}

      <div className="space-y-2">
        {rules.map((r) => (
          <div
            key={r.id}
            className="group rounded-lg border border-border bg-bg-soft p-4 transition hover:border-brand-500/40"
          >
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                className="flex-1 text-left"
                onClick={() => setEditing(r)}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  {!r.enabled && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-amber-400">
                      pausada
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-text-dim">{triggerLabel(r.trigger)}</div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-text-faint">
                  <span>{r.conditions.length} condición(es)</span>
                  <span>·</span>
                  <span>{r.actions.length} acción(es)</span>
                  <span>·</span>
                  <span>Último run: {formatDate(r.lastRunAt)}</span>
                  <span>·</span>
                  <span>{r.runCount} ejecuciones</span>
                </div>
              </button>

              <div className="flex gap-1">
                <button
                  className={`btn-ghost !p-2 ${r.enabled ? 'text-green-400' : 'text-text-faint'}`}
                  onClick={() => toggle.mutate(r)}
                  title={r.enabled ? 'Pausar' : 'Activar'}
                >
                  <Power size={14} />
                </button>
                <button className="btn-ghost !p-2" onClick={() => setEditing(r)} title="Editar">
                  <Pencil size={14} />
                </button>
                <button
                  className="btn-ghost !p-2 text-red-400"
                  onClick={() => {
                    if (confirm(`¿Borrar la regla "${r.name}"?`)) remove.mutate(r.id);
                  }}
                  title="Borrar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <RuleEditor
          rule={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['automations'] });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
