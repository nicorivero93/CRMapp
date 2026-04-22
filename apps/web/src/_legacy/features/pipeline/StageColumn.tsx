import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, MoreVertical } from 'lucide-react';
import { Deal, Stage } from '@/lib/types';
import { DealCard } from './DealCard';

export function StageColumn({
  stage, deals, onAddDeal,
}: {
  stage: Stage;
  deals: Deal[];
  onAddDeal: (stageId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { type: 'stage', stageId: stage.id } });
  const total = deals.reduce((s, d) => s + (d.value || 0), 0);
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-bg-soft/60 p-1">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: stage.color }} />
          <span className="text-sm font-medium">{stage.name}</span>
          <span className="chip">{deals.length}</span>
        </div>
        <button className="btn-ghost !p-1" onClick={() => onAddDeal(stage.id)} title="Nuevo deal"><Plus size={14} /></button>
      </div>
      <div className="px-3 pb-2 text-[11px] text-text-faint">${total.toLocaleString('es-AR')} total</div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[400px] flex-1 flex-col gap-2 rounded-lg p-2 transition-colors ${isOver ? 'bg-brand-500/5' : ''}`}
      >
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          {deals.map((d) => <DealCard key={d.id} deal={d} />)}
        </SortableContext>
        {deals.length === 0 && (
          <button onClick={() => onAddDeal(stage.id)} className="mt-1 flex items-center justify-center gap-1 rounded-lg border border-dashed border-border py-8 text-xs text-text-faint hover:border-brand-500/50 hover:text-brand-400">
            <Plus size={14} /> Agregar deal
          </button>
        )}
      </div>
    </div>
  );
}
