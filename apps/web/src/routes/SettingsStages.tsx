import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, GripVertical, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { StageDTO } from '@mycrm/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const COLOR_PRESETS = ['#6366f1', '#f59e0b', '#10b981', '#22c55e', '#ef4444', '#8b5cf6'];

function StageRow({
  stage,
  onChange,
  onDelete,
}: {
  stage: StageDTO;
  onChange: (patch: Partial<StageDTO>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border bg-bg-soft p-3"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-text-faint hover:text-text active:cursor-grabbing"
        title="Arrastrar para reordenar"
      >
        <GripVertical size={16} />
      </button>
      <input
        className="input flex-1"
        value={stage.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <select
        className="input w-24"
        value={stage.color ?? COLOR_PRESETS[0]}
        onChange={(e) => onChange({ color: e.target.value })}
        style={{ color: stage.color ?? undefined }}
      >
        {COLOR_PRESETS.map((c) => (
          <option key={c} value={c} style={{ color: c }}>
            {c}
          </option>
        ))}
      </select>
      <label className="flex shrink-0 items-center gap-1 text-xs text-text-dim">
        <input
          type="checkbox"
          checked={stage.isClosedWon}
          onChange={(e) => onChange({ isClosedWon: e.target.checked })}
        />
        Ganado
      </label>
      <button
        onClick={onDelete}
        className="btn-ghost !p-1 text-red-400 hover:bg-red-500/10"
        title="Eliminar stage"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function SettingsStages() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [local, setLocal] = useState<StageDTO[]>([]);

  const stagesQ = useQuery({
    queryKey: ['stages'],
    queryFn: () => api.get<{ stages: StageDTO[] }>('/api/stages'),
  });

  useEffect(() => {
    if (stagesQ.data) setLocal(stagesQ.data.stages);
  }, [stagesQ.data]);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ stage: StageDTO }>('/api/stages', {
        name: 'Nueva etapa',
        color: COLOR_PRESETS[0],
        isClosedWon: false,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stages'] });
      toast.success('Stage creada');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Error'),
  });

  const patch = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<StageDTO> }) =>
      api.patch<{ stage: StageDTO }>(`/api/stages/${vars.id}`, vars.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stages'] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/stages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stages'] });
      toast.success('Stage eliminada');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Error'),
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ stages: StageDTO[] }>('/api/stages/reorder', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stages'] }),
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Error reordenando');
      qc.invalidateQueries({ queryKey: ['stages'] });
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = local.findIndex((s) => s.id === active.id);
    const newIndex = local.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(local, oldIndex, newIndex);
    setLocal(next);
    reorder.mutate(next.map((s) => s.id));
  }

  if (user && user.role !== 'owner') return <Navigate to="/app/settings" replace />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link to="/app/settings" className="mb-2 inline-flex items-center gap-1 text-xs text-text-dim hover:text-brand-400">
          <ArrowLeft size={12} /> Volver a Configuración
        </Link>
        <h1 className="text-2xl font-semibold">Stages del Pipeline</h1>
        <p className="text-sm text-text-dim">
          Definí las etapas de tu pipeline. Arrastrá para reordenar. Una etapa marcada como "Ganado" registra el cierre de los deals que la alcancen.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => create.mutate()}
          className="btn-primary"
          disabled={create.isPending}
        >
          <Plus size={14} /> Nueva stage
        </button>
      </div>

      {stagesQ.isLoading ? (
        <div className="text-sm text-text-dim">Cargando…</div>
      ) : local.length === 0 ? (
        <div className="rounded-lg border border-border bg-bg-soft p-6 text-center text-sm text-text-dim">
          No hay stages. Creá la primera.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={local.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {local.map((s) => (
                <StageRow
                  key={s.id}
                  stage={s}
                  onChange={(p) => {
                    setLocal((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...p } : x)));
                    patch.mutate({ id: s.id, patch: p });
                  }}
                  onDelete={() => {
                    if (confirm(`¿Eliminar la stage "${s.name}"?`)) remove.mutate(s.id);
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
