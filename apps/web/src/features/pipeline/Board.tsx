import { useMemo, useState } from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { collection, orderBy, query, where, doc, updateDoc, addDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Settings2, Plus } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useCollection } from '@/lib/useCollection';
import { Deal, Stage } from '@/lib/types';
import { DealCard } from './DealCard';
import { StageColumn } from './StageColumn';
import { StageEditor } from './StageEditor';
import { NewDealModal } from './NewDealModal';

export function Board() {
  const { profile } = useAuth();
  const teamId = profile!.teamId;

  const { data: stages } = useCollection<Stage>(`teams/${teamId}/stages`, orderBy('order'));
  const { data: deals } = useCollection<Deal>(
    'deals',
    where('teamId', '==', teamId),
    orderBy('createdAt', 'desc')
  );

  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [editingStages, setEditingStages] = useState(false);
  const [newDealStage, setNewDealStage] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const dealsByStage = useMemo(() => {
    const m = new Map<string, Deal[]>();
    stages.forEach((s) => m.set(s.id, []));
    deals.forEach((d) => { const arr = m.get(d.stageId); if (arr) arr.push(d); });
    return m;
  }, [deals, stages]);

  function onDragStart(e: DragStartEvent) {
    const d = deals.find((x) => x.id === e.active.id);
    if (d) setActiveDeal(d);
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveDeal(null);
    const { active, over } = e;
    if (!over) return;
    const deal = deals.find((d) => d.id === active.id);
    if (!deal) return;

    const overData = over.data.current as any;
    const targetStageId: string =
      overData?.type === 'stage' ? overData.stageId :
      overData?.type === 'deal' ? overData.stageId : deal.stageId;

    if (targetStageId === deal.stageId) return;

    const target = stages.find((s) => s.id === targetStageId);
    const patch: any = {
      stageId: targetStageId,
      stageHistory: arrayUnion({ stageId: targetStageId, at: new Date().toISOString() }),
    };
    if (target?.isClosedWon) patch.closedAt = serverTimestamp();

    try {
      await updateDoc(doc(db, 'deals', deal.id), patch);
      if (target?.isClosedWon) toast.success(`🎉 ${deal.title} cerrado. Se envía email de notificación.`);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleCreateDeal(stageId: string, data: { title: string; company: string; value: number }) {
    await addDoc(collection(db, 'deals'), {
      teamId,
      title: data.title,
      company: data.company,
      value: Number(data.value) || 0,
      currency: 'USD',
      stageId,
      ownerId: profile!.uid,
      createdAt: serverTimestamp(),
      stageHistory: [{ stageId, at: new Date().toISOString() }],
    });
    setNewDealStage(null);
    toast.success('Deal creado');
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pipeline</h1>
          <p className="text-sm text-text-dim">Arrastrá las tarjetas entre etapas. Al pasar a "Cerrado" se envía email automáticamente.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditingStages(true)} className="btn-outline"><Settings2 size={14}/> Etapas</button>
          <button onClick={() => setNewDealStage(stages[0]?.id ?? null)} className="btn-primary"><Plus size={14}/> Nuevo deal</button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-4">
          {stages.map((s) => (
            <StageColumn key={s.id} stage={s} deals={dealsByStage.get(s.id) ?? []} onAddDeal={setNewDealStage} />
          ))}
          {stages.length === 0 && <div className="text-sm text-text-dim">Creando etapas por defecto…</div>}
        </div>
        <DragOverlay>{activeDeal && <DealCard deal={activeDeal} overlay />}</DragOverlay>
      </DndContext>

      {editingStages && <StageEditor teamId={teamId} stages={stages} onClose={() => setEditingStages(false)} />}
      {newDealStage && (
        <NewDealModal
          stageName={stages.find((s) => s.id === newDealStage)?.name ?? ''}
          onClose={() => setNewDealStage(null)}
          onCreate={(d) => handleCreateDeal(newDealStage, d)}
        />
      )}
    </div>
  );
}
