import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Deal } from '@/lib/types';
import { Building2, DollarSign } from 'lucide-react';

export function DealCard({ deal, overlay }: { deal: Deal; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
    data: { type: 'deal', stageId: deal.stageId },
  });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.3 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`card cursor-grab p-3 active:cursor-grabbing ${overlay ? 'ring-1 ring-brand-500/50 shadow-xl' : ''}`}
    >
      <div className="mb-2 text-sm font-medium leading-tight">{deal.title}</div>
      {deal.company && (
        <div className="flex items-center gap-1.5 text-xs text-text-dim">
          <Building2 size={12} /> {deal.company}
        </div>
      )}
      <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-ok">
        <DollarSign size={12} />
        {deal.currency} {deal.value.toLocaleString('es-AR')}
      </div>
    </div>
  );
}
