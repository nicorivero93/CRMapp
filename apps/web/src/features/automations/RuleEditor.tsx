import { useEffect } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { addDoc, collection, doc, updateDoc, orderBy, where } from 'firebase/firestore';
import { X, Plus, Trash2, Mail, UserCheck, CheckSquare, ArrowRight, Bell, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useCollection } from '@/lib/useCollection';
import { AutomationRule, Stage, UserDoc } from '@/lib/types';

type ActionType = 'sendEmail' | 'assignOwner' | 'createTask' | 'moveStage' | 'notifyUser';
type TriggerType = 'contact.created' | 'deal.stageChanged' | 'deal.noActivityFor' | 'event.canceled';

type FormValues = {
  name: string;
  enabled: boolean;
  trigger: { type: TriggerType; params?: { stageId?: string; days?: number } };
  actions: { type: ActionType; params: Record<string, any> }[];
};

const TRIGGERS: { value: TriggerType; label: string }[] = [
  { value: 'contact.created', label: 'Contacto creado' },
  { value: 'deal.stageChanged', label: 'Deal cambia de etapa' },
  { value: 'deal.noActivityFor', label: 'Deal sin actividad por X días' },
  { value: 'event.canceled', label: 'Evento cancelado' },
];

const ACTION_META: Record<ActionType, { label: string; Icon: any }> = {
  sendEmail: { label: 'Enviar email', Icon: Mail },
  assignOwner: { label: 'Asignar owner', Icon: UserCheck },
  createTask: { label: 'Crear tarea', Icon: CheckSquare },
  moveStage: { label: 'Mover a etapa', Icon: ArrowRight },
  notifyUser: { label: 'Notificar usuario', Icon: Bell },
};

function defaultParamsFor(type: ActionType): Record<string, any> {
  switch (type) {
    case 'sendEmail': return { to: 'owner', subject: '', body: '' };
    case 'assignOwner': return { mode: 'round_robin', userId: '' };
    case 'createTask': return { title: '', dueInDays: 1 };
    case 'moveStage': return { stageId: '' };
    case 'notifyUser': return { userId: '', message: '' };
  }
}

export function RuleEditor({ rule, onClose }: { rule: AutomationRule | null; onClose: () => void }) {
  const { profile } = useAuth();
  const teamId = profile!.teamId;
  const { data: stages } = useCollection<Stage>(`teams/${teamId}/stages`, orderBy('order'));
  const { data: users } = useCollection<UserDoc>('users', where('teamId', '==', teamId));

  const { register, control, handleSubmit, watch, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: {
      name: '',
      enabled: true,
      trigger: { type: 'contact.created', params: {} },
      actions: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'actions' });

  useEffect(() => {
    if (rule) {
      reset({
        name: rule.name,
        enabled: rule.enabled,
        trigger: { type: rule.trigger.type as TriggerType, params: rule.trigger.params ?? {} },
        actions: rule.actions.map((a) => ({ type: a.type as ActionType, params: a.params })),
      });
    } else {
      reset({ name: '', enabled: true, trigger: { type: 'contact.created', params: {} }, actions: [] });
    }
  }, [rule, reset]);

  const triggerType = watch('trigger.type');

  async function onSubmit(values: FormValues) {
    const payload = {
      teamId,
      name: values.name.trim() || 'Regla sin nombre',
      enabled: values.enabled,
      trigger: { type: values.trigger.type, params: values.trigger.params ?? {} },
      actions: values.actions,
    };
    if (rule) {
      await updateDoc(doc(db, 'automations', rule.id), payload as any);
      toast.success('Regla actualizada');
    } else {
      await addDoc(collection(db, 'automations'), payload);
      toast.success('Regla creada');
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="h-full w-full max-w-[560px] overflow-y-auto bg-bg-card border-l border-border p-6 flex flex-col gap-5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-brand" />
            <h2 className="font-semibold">{rule ? 'Editar regla' : 'Nueva regla'}</h2>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost !p-2"><X size={16} /></button>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-text-dim">Nombre</label>
          <input className="input w-full" placeholder="Ej: Bienvenida a nuevos leads" {...register('name', { required: true })} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register('enabled')} />
          <span>Regla activa</span>
        </label>

        <div className="card p-4 space-y-3">
          <div className="text-xs uppercase text-text-dim">Trigger</div>
          <select className="input w-full" {...register('trigger.type')}>
            {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          {triggerType === 'deal.stageChanged' && (
            <div>
              <label className="text-xs text-text-dim">Etapa</label>
              <select className="input w-full" {...register('trigger.params.stageId' as const)}>
                <option value="">Cualquier etapa</option>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {triggerType === 'deal.noActivityFor' && (
            <div>
              <label className="text-xs text-text-dim">Días sin actividad</label>
              <input
                type="number"
                min={1}
                className="input w-full"
                {...register('trigger.params.days' as const, { valueAsNumber: true })}
              />
            </div>
          )}
        </div>

        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase text-text-dim">Acciones</div>
            <span className="text-xs text-text-dim">{fields.length} configurada{fields.length !== 1 ? 's' : ''}</span>
          </div>

          {fields.length === 0 && (
            <div className="text-sm text-text-dim">Agregá al menos una acción para que la regla haga algo.</div>
          )}

          {fields.map((field, idx) => (
            <ActionRow
              key={field.id}
              idx={idx}
              control={control}
              register={register}
              watch={watch}
              stages={stages}
              users={users}
              onRemove={() => remove(idx)}
            />
          ))}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            {(Object.keys(ACTION_META) as ActionType[]).map((t) => {
              const { label, Icon } = ACTION_META[t];
              return (
                <button
                  key={t}
                  type="button"
                  className="btn-outline"
                  onClick={() => append({ type: t, params: defaultParamsFor(t) })}
                >
                  <Icon size={14} /> {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-auto flex justify-end gap-2 pt-4 border-t border-border">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {rule ? 'Guardar cambios' : 'Crear regla'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ActionRow({
  idx, control, register, watch, stages, users, onRemove,
}: {
  idx: number;
  control: any;
  register: any;
  watch: any;
  stages: Stage[];
  users: UserDoc[];
  onRemove: () => void;
}) {
  const type = watch(`actions.${idx}.type`) as ActionType;
  const { Icon, label } = ACTION_META[type] ?? ACTION_META.sendEmail;

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-brand" />
        <Controller
          control={control}
          name={`actions.${idx}.type`}
          render={({ field }) => (
            <select
              {...field}
              className="input !py-1 flex-1"
              onChange={(e) => {
                field.onChange(e);
                // reset params when type changes
                const newType = e.target.value as ActionType;
                control._formValues.actions[idx].params = defaultParamsFor(newType);
              }}
            >
              {(Object.keys(ACTION_META) as ActionType[]).map((t) => (
                <option key={t} value={t}>{ACTION_META[t].label}</option>
              ))}
            </select>
          )}
        />
        <span className="sr-only">{label}</span>
        <button type="button" onClick={onRemove} className="btn-ghost !p-2 text-bad" title="Quitar"><Trash2 size={14} /></button>
      </div>

      {type === 'sendEmail' && (
        <div className="space-y-2">
          <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
            <label className="text-xs text-text-dim">Para</label>
            <select className="input !py-1" {...register(`actions.${idx}.params.to`)}>
              <option value="owner">Owner del deal/contacto</option>
              <option value="contact">Contacto</option>
              <option value="team">Todo el equipo</option>
            </select>
          </div>
          <input className="input w-full" placeholder="Asunto" {...register(`actions.${idx}.params.subject`)} />
          <textarea className="input w-full min-h-[90px]" placeholder="Cuerpo del email" {...register(`actions.${idx}.params.body`)} />
        </div>
      )}

      {type === 'assignOwner' && (
        <div className="space-y-2">
          <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
            <label className="text-xs text-text-dim">Modo</label>
            <select className="input !py-1" {...register(`actions.${idx}.params.mode`)}>
              <option value="round_robin">Round robin</option>
              <option value="specific">Usuario específico</option>
            </select>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
            <label className="text-xs text-text-dim">Usuario</label>
            <select className="input !py-1" {...register(`actions.${idx}.params.userId`)}>
              <option value="">—</option>
              {users.map((u) => <option key={u.uid} value={u.uid}>{u.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {type === 'createTask' && (
        <div className="space-y-2">
          <input className="input w-full" placeholder="Título de la tarea" {...register(`actions.${idx}.params.title`)} />
          <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
            <label className="text-xs text-text-dim">Vence en (días)</label>
            <input type="number" min={0} className="input !py-1" {...register(`actions.${idx}.params.dueInDays`, { valueAsNumber: true })} />
          </div>
        </div>
      )}

      {type === 'moveStage' && (
        <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
          <label className="text-xs text-text-dim">Etapa destino</label>
          <select className="input !py-1" {...register(`actions.${idx}.params.stageId`)}>
            <option value="">—</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {type === 'notifyUser' && (
        <div className="space-y-2">
          <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
            <label className="text-xs text-text-dim">Usuario</label>
            <select className="input !py-1" {...register(`actions.${idx}.params.userId`)}>
              <option value="">—</option>
              {users.map((u) => <option key={u.uid} value={u.uid}>{u.name}</option>)}
            </select>
          </div>
          <input className="input w-full" placeholder="Mensaje" {...register(`actions.${idx}.params.message`)} />
        </div>
      )}
    </div>
  );
}
