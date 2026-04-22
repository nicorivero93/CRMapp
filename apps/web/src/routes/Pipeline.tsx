import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Settings2, Kanban } from 'lucide-react';
import toast from 'react-hot-toast';
import type { DealDTO, StageDTO } from '@mycrm/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DealModal } from '@/components/DealModal';

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString('es-AR')}`;
  }
}

function DealCard({
  deal,
  onClick,
  overlay = false,
}: {
  deal: DealDTO;
  onClick?: () => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
    data: { type: 'deal', stageId: deal.stageId },
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Only trigger click when not dragging.
        if (!isDragging && onClick) onClick();
        e.stopPropagation();
      }}
      className={`card cursor-grab p-3 text-left active:cursor-grabbing ${
        overlay ? 'shadow-xl ring-1 ring-brand-500/50' : ''
      }`}
    >
      <div className="mb-1 text-sm font-medium leading-tight">{deal.title}</div>
      <div className="text-xs font-semibold text-emerald-400">{formatMoney(deal.value, deal.currency)}</div>
      {deal.ownerId && (
        <div className="mt-2 inline-block rounded-full bg-bg/60 px-2 py-0.5 text-[10px] text-text-faint">
          {deal.ownerId.slice(0, 6)}
        </div>
      )}
    </div>
  );
}

function StageColumn({
  stage,
  deals,
  onAddDeal,
  onDealClick,
}: {
  stage: StageDTO;
  deals: DealDTO[];
  onAddDeal: (stageId: string) => void;
  onDealClick: (deal: DealDTO) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage:${stage.id}`,
    data: { type: 'stage', stageId: stage.id },
  });
  const total = deals.reduce((s, d) => s + (d.value || 0), 0);
  const currency = deals[0]?.currency ?? 'ARS';
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-bg-soft/60 p-1">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: stage.color ?? '#6b7280' }}
          />
          <span className="text-sm font-medium">{stage.name}</span>
          <span className="chip">{deals.length}</span>
        </div>
        <button
          className="btn-ghost !p-1"
          onClick={() => onAddDeal(stage.id)}
          title="Nuevo deal"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="px-3 pb-2 text-[11px] text-text-faint">
        {deals.length > 0 ? `${formatMoney(total, currency)} total` : '—'}
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[400px] flex-1 flex-col gap-2 rounded-lg p-2 transition-colors ${
          isOver ? 'bg-brand-500/5' : ''
        }`}
      >
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          {deals.map((d) => (
            <DealCard key={d.id} deal={d} onClick={() => onDealClick(d)} />
          ))}
        </SortableContext>
        {deals.length === 0 && (
          <button
            onClick={() => onAddDeal(stage.id)}
            className="mt-1 flex items-center justify-center gap-1 rounded-lg border border-dashed border-border py-8 text-xs text-text-faint hover:border-brand-500/50 hover:text-brand-400"
          >
            <Plus size={14} /> Agregar deal
          </button>
        )}
      </div>
    </div>
  );
}

export default function Pipeline() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeDeal, setActiveDeal] = useState<DealDTO | null>(null);
  const [newDealStage, setNewDealStage] = useState<string | null>(null);
  const [editDeal, setEditDeal] = useState<DealDTO | null>(null);

  const stagesQ = useQuery({
    queryKey: ['stages'],
    queryFn: () => api.get<{ stages: StageDTO[] }>('/api/stages'),
  });

  const dealsQ = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.get<{ deals: DealDTO[]; total: number }>('/api/deals?limit=500'),
  });

  const move = useMutation({
    mutationFn: (vars: { id: string; stageId: string }) =>
      api.post<{ deal: DealDTO }>(`/api/deals/${vars.id}/move`, { stageId: vars.stageId }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['deals'] });
      const prev = qc.getQueryData<{ deals: DealDTO[]; total: number }>(['deals']);
      if (prev) {
        qc.setQueryData(['deals'], {
          ...prev,
          deals: prev.deals.map((d) => (d.id === vars.id ? { ...d, stageId: vars.stageId } : d)),
        });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['deals'], ctx.prev);
      toast.error(err instanceof ApiError ? err.message : 'Error moviendo deal');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  });

  const stages = stagesQ.data?.stages ?? [];
  const deals = dealsQ.data?.deals ?? [];

  const dealsByStage = useMemo(() => {
    const m = new Map<string, DealDTO[]>();
    for (const s of stages) m.set(s.id, []);
    for (const d of deals) {
      const arr = m.get(d.stageId);
      if (arr) arr.push(d);
    }
    return m;
  }, [stages, deals]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragStart(e: DragStartEvent) {
    const d = deals.find((x) => x.id === e.active.id);
    if (d) setActiveDeal(d);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveDeal(null);
    const { active, over } = e;
    if (!over) return;
    const deal = deals.find((d) => d.id === active.id);
    if (!deal) return;
    const overData = over.data.current as { type?: string; stageId?: string } | undefined;
    const targetStageId =
      overData?.type === 'stage'
        ? overData.stageId
        : overData?.type === 'deal'
          ? overData.stageId
          : deal.stageId;
    if (!targetStageId || targetStageId === deal.stageId) return;
    move.mutate({ id: deal.id, stageId: targetStageId });
  }

  const isOwner = user?.role === 'owner';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Kanban size={20} className="text-brand-400" /> Pipeline
          </h1>
          <p className="text-sm text-text-dim">
            Arrastrá las tarjetas entre etapas. Al pasar a una etapa "Cerrado-Ganado" se marca el cierre.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && (
            <Link to="/app/settings/stages" className="btn-outline">
              <Settings2 size={14} /> Configurar stages
            </Link>
          )}
          <button
            onClick={() => setNewDealStage(stages[0]?.id ?? null)}
            className="btn-primary"
            disabled={stages.length === 0}
          >
            <Plus size={14} /> Nuevo deal
          </button>
        </div>
      </div>

      {stagesQ.isLoading || dealsQ.isLoading ? (
        <div className="text-sm text-text-dim">Cargando…</div>
      ) : stages.length === 0 ? (
        <div className="rounded-lg border border-border bg-bg-soft p-6 text-sm text-text-dim">
          No hay stages configurados.{' '}
          {isOwner && (
            <Link to="/app/settings/stages" className="text-brand-400 hover:underline">
              Creá uno
            </Link>
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-4">
            {stages.map((s) => (
              <StageColumn
                key={s.id}
                stage={s}
                deals={dealsByStage.get(s.id) ?? []}
                onAddDeal={(id) => setNewDealStage(id)}
                onDealClick={(d) => setEditDeal(d)}
              />
            ))}
          </div>
          <DragOverlay>{activeDeal && <DealCard deal={activeDeal} overlay />}</DragOverlay>
        </DndContext>
      )}

      {newDealStage && (
        <DealModal
          mode="create"
          stageId={newDealStage}
          stages={stages}
          onClose={() => setNewDealStage(null)}
        />
      )}
      {editDeal && (
        <DealModal mode="edit" deal={editDeal} stages={stages} onClose={() => setEditDeal(null)} />
      )}
    </div>
  );
}
