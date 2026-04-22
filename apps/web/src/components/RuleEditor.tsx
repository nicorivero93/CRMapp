import { useEffect, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { X, Plus, Trash2, Zap, PlayCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  AutomationAction,
  AutomationCondition,
  AutomationDTO,
  AutomationTestResult,
  AutomationTrigger,
  LeadSource,
  LeadStatus,
} from '@mycrm/shared';
import { api } from '@/lib/api';

type TriggerType = AutomationTrigger['type'];
type ActionType = AutomationAction['type'];
type ConditionOp = AutomationCondition['op'];

const TRIGGERS: { value: TriggerType; label: string }[] = [
  { value: 'lead.created', label: 'Cuando se crea un lead' },
  { value: 'lead.status-changed', label: 'Cuando cambia el estado de un lead' },
  { value: 'deal.stage-changed', label: 'Cuando un deal cambia de etapa' },
  { value: 'contact.created', label: 'Cuando se crea un contacto' },
  { value: 'event.canceled', label: 'Cuando se cancela un evento' },
];

const ACTIONS: { value: ActionType; label: string }[] = [
  { value: 'add-tag', label: 'Agregar tag' },
  { value: 'assign-owner', label: 'Asignar a vendedor' },
  { value: 'move-stage', label: 'Mover a etapa (deal)' },
  { value: 'notify-user', label: 'Notificar usuario (nota)' },
  { value: 'update-field', label: 'Actualizar campo del lead' },
];

const OPS: { value: ConditionOp; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'contains', label: 'contiene' },
  { value: 'not-contains', label: 'no contiene' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'in', label: 'en lista' },
  { value: 'exists', label: 'existe' },
];

const LEAD_SOURCES: LeadSource[] = [
  'instagram',
  'facebook',
  'tiktok',
  'meta-lead-ads',
  'public-form',
  'csv-import',
  'sheets-import',
  'excel-import',
  'manual',
  'bulk-paste',
  'whatsapp-inbound',
];

const LEAD_STATUSES: LeadStatus[] = [
  'new',
  'assigned',
  'contacted',
  'responded',
  'qualified',
  'converted',
  'no-response',
  'recycled',
  'discarded',
];

type FormValues = {
  name: string;
  enabled: boolean;
  triggerType: TriggerType;
  triggerParams: {
    source?: string;
    from?: string;
    to?: string;
    fromStageId?: string;
    toStageId?: string;
  };
  conditions: { field: string; op: ConditionOp; value: string }[];
  actions: { type: ActionType; params: Record<string, string> }[];
};

function defaultActionParams(type: ActionType): Record<string, string> {
  switch (type) {
    case 'add-tag':
      return { tag: '' };
    case 'assign-owner':
      return { userId: '' };
    case 'move-stage':
      return { stageId: '' };
    case 'notify-user':
      return { userId: '', message: '' };
    case 'update-field':
      return { field: 'notes', value: '' };
  }
}

function buildDummyEntity(triggerType: TriggerType): Record<string, unknown> {
  switch (triggerType) {
    case 'lead.created':
      return { id: 'dummy-lead', source: 'instagram', status: 'new', tags: [], name: 'Ana' };
    case 'lead.status-changed':
      return { id: 'dummy-lead', status: 'assigned', tags: [] };
    case 'deal.stage-changed':
      return { id: 'dummy-deal', stageId: 'stage-1', value: 0 };
    case 'contact.created':
      return { id: 'dummy-contact', tags: [] };
    case 'event.canceled':
      return { id: 'dummy-event', status: 'canceled' };
  }
}

function buildDummyTriggerParams(values: FormValues): Record<string, unknown> {
  const p = values.triggerParams;
  switch (values.triggerType) {
    case 'lead.created':
      return { source: p.source || 'instagram' };
    case 'lead.status-changed':
      return { from: p.from || 'new', to: p.to || 'assigned' };
    case 'deal.stage-changed':
      return { fromStageId: p.fromStageId || 'stage-0', toStageId: p.toStageId || 'stage-1' };
    case 'contact.created':
    case 'event.canceled':
      return {};
  }
}

function toCreatePayload(values: FormValues): unknown {
  const trigger: AutomationTrigger = (() => {
    const tp = values.triggerParams;
    switch (values.triggerType) {
      case 'lead.created':
        return { type: 'lead.created', params: tp.source ? { source: tp.source as LeadSource } : {} };
      case 'lead.status-changed':
        return {
          type: 'lead.status-changed',
          params: {
            ...(tp.from ? { from: tp.from as LeadStatus } : {}),
            ...(tp.to ? { to: tp.to as LeadStatus } : {}),
          },
        };
      case 'deal.stage-changed':
        return {
          type: 'deal.stage-changed',
          params: {
            ...(tp.fromStageId ? { fromStageId: tp.fromStageId } : {}),
            ...(tp.toStageId ? { toStageId: tp.toStageId } : {}),
          },
        };
      case 'contact.created':
        return { type: 'contact.created', params: {} };
      case 'event.canceled':
        return { type: 'event.canceled', params: {} };
    }
  })();

  const conditions: AutomationCondition[] = values.conditions
    .filter((c) => c.field.trim() !== '')
    .map((c) => {
      let parsedValue: unknown = c.value;
      if (c.op === 'in') {
        parsedValue = c.value.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (c.op === 'exists') {
        parsedValue = c.value === 'false' ? false : true;
      } else if (['gt', 'lt', 'gte', 'lte'].includes(c.op)) {
        const n = Number(c.value);
        if (!Number.isNaN(n)) parsedValue = n;
      }
      return { field: c.field, op: c.op, value: parsedValue };
    });

  const actions: AutomationAction[] = values.actions.map((a) => {
    switch (a.type) {
      case 'add-tag':
        return { type: 'add-tag', params: { tag: a.params.tag } };
      case 'assign-owner':
        return { type: 'assign-owner', params: { userId: a.params.userId } };
      case 'move-stage':
        return { type: 'move-stage', params: { stageId: a.params.stageId } };
      case 'notify-user':
        return {
          type: 'notify-user',
          params: {
            ...(a.params.userId ? { userId: a.params.userId } : {}),
            message: a.params.message,
          },
        };
      case 'update-field':
        return {
          type: 'update-field',
          params: {
            field: (a.params.field as 'name' | 'notes' | 'status') ?? 'notes',
            value: a.params.value ?? '',
          },
        };
    }
  });

  return {
    name: values.name.trim(),
    enabled: values.enabled,
    trigger,
    conditions,
    actions,
  };
}

export function RuleEditor({
  rule,
  onClose,
  onSaved,
}: {
  rule: AutomationDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [testResult, setTestResult] = useState<AutomationTestResult | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    getValues,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      name: '',
      enabled: true,
      triggerType: 'lead.created',
      triggerParams: {},
      conditions: [],
      actions: [{ type: 'add-tag', params: { tag: '' } }],
    },
  });

  const conditionsArr = useFieldArray({ control, name: 'conditions' });
  const actionsArr = useFieldArray({ control, name: 'actions' });

  useEffect(() => {
    if (rule) {
      const tp = (rule.trigger.params ?? {}) as Record<string, string | undefined>;
      reset({
        name: rule.name,
        enabled: rule.enabled,
        triggerType: rule.trigger.type,
        triggerParams: {
          source: tp.source,
          from: tp.from,
          to: tp.to,
          fromStageId: tp.fromStageId,
          toStageId: tp.toStageId,
        },
        conditions: rule.conditions.map((c) => ({
          field: c.field,
          op: c.op,
          value: Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? ''),
        })),
        actions: rule.actions.map((a) => {
          const params: Record<string, string> = {};
          for (const [k, v] of Object.entries(a.params as Record<string, unknown>)) {
            params[k] = v == null ? '' : String(v);
          }
          return { type: a.type, params };
        }),
      });
    }
  }, [rule, reset]);

  const triggerType = watch('triggerType');

  async function onSubmit(values: FormValues) {
    const payload = toCreatePayload(values);
    try {
      if (rule) {
        await api.patch(`/api/automations/${rule.id}`, payload);
        toast.success('Regla actualizada');
      } else {
        await api.post('/api/automations', payload);
        toast.success('Regla creada');
      }
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al guardar');
    }
  }

  async function onTest() {
    if (!rule) {
      toast('Guardá la regla primero para poder probarla.', { icon: 'ℹ️' });
      return;
    }
    const values = getValues();
    try {
      const res = await api.post<{ result: AutomationTestResult }>(
        `/api/automations/${rule.id}/test`,
        {
          entity: buildDummyEntity(values.triggerType),
          triggerParams: buildDummyTriggerParams(values),
        },
      );
      setTestResult(res.result);
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al probar');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex h-full w-full max-w-[620px] flex-col gap-5 overflow-y-auto border-l border-border bg-bg-soft p-6"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-brand-400" />
            <h2 className="text-lg font-semibold">{rule ? 'Editar regla' : 'Nueva regla'}</h2>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost !p-2">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-text-dim">Nombre</label>
          <input
            className="input w-full"
            placeholder="Ej: Taggear leads de Instagram"
            {...register('name', { required: true })}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register('enabled')} />
          <span>Activa</span>
        </label>

        {/* --------- TRIGGER --------- */}
        <section className="rounded-lg border border-border bg-bg p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-text-faint">SI (trigger)</div>
          <select className="input w-full" {...register('triggerType')}>
            {TRIGGERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {triggerType === 'lead.created' && (
            <div className="mt-3">
              <label className="text-xs text-text-dim">Fuente (opcional)</label>
              <select className="input w-full" {...register('triggerParams.source')}>
                <option value="">Cualquiera</option>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {triggerType === 'lead.status-changed' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-dim">De</label>
                <select className="input w-full" {...register('triggerParams.from')}>
                  <option value="">Cualquiera</option>
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-dim">A</label>
                <select className="input w-full" {...register('triggerParams.to')}>
                  <option value="">Cualquiera</option>
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {triggerType === 'deal.stage-changed' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-dim">De etapa (id)</label>
                <input className="input w-full" {...register('triggerParams.fromStageId')} />
              </div>
              <div>
                <label className="text-xs text-text-dim">A etapa (id)</label>
                <input className="input w-full" {...register('triggerParams.toStageId')} />
              </div>
            </div>
          )}
        </section>

        {/* --------- CONDITIONS --------- */}
        <section className="rounded-lg border border-border bg-bg p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-text-faint">Y (condiciones)</div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => conditionsArr.append({ field: '', op: 'eq', value: '' })}
            >
              <Plus size={14} /> condición
            </button>
          </div>

          {conditionsArr.fields.length === 0 && (
            <div className="text-sm text-text-dim">
              Sin condiciones — la regla aplica siempre que el trigger dispare.
            </div>
          )}

          <div className="space-y-2">
            {conditionsArr.fields.map((f, idx) => (
              <div key={f.id} className="grid grid-cols-[1fr_110px_1fr_auto] gap-2">
                <input
                  className="input"
                  placeholder="campo (ej. source)"
                  {...register(`conditions.${idx}.field`)}
                />
                <select className="input" {...register(`conditions.${idx}.op`)}>
                  {OPS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  placeholder="valor"
                  {...register(`conditions.${idx}.value`)}
                />
                <button
                  type="button"
                  onClick={() => conditionsArr.remove(idx)}
                  className="btn-ghost !p-2 text-red-400"
                  title="Quitar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* --------- ACTIONS --------- */}
        <section className="rounded-lg border border-border bg-bg p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-text-faint">ENTONCES (acciones)</div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() =>
                actionsArr.append({ type: 'add-tag', params: defaultActionParams('add-tag') })
              }
            >
              <Plus size={14} /> acción
            </button>
          </div>

          {actionsArr.fields.length === 0 && (
            <div className="text-sm text-text-dim">Agregá al menos una acción.</div>
          )}

          <div className="space-y-3">
            {actionsArr.fields.map((f, idx) => (
              <ActionRow
                key={f.id}
                idx={idx}
                control={control}
                register={register}
                watch={watch}
                onRemove={() => actionsArr.remove(idx)}
              />
            ))}
          </div>
        </section>

        {testResult && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              testResult.matched
                ? 'border-green-700 bg-green-900/20 text-green-200'
                : 'border-amber-700 bg-amber-900/20 text-amber-200'
            }`}
          >
            <div className="font-medium">
              {testResult.matched ? 'La regla dispararía.' : 'No dispara.'}
            </div>
            {testResult.reason && <div className="text-xs opacity-80">motivo: {testResult.reason}</div>}
            {testResult.matched && (
              <div className="mt-1 text-xs opacity-80">
                {testResult.wouldExecute.length} acción(es) se ejecutarían.
              </div>
            )}
          </div>
        )}

        <div className="mt-auto flex justify-end gap-2 border-t border-border pt-4">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button type="button" onClick={onTest} className="btn-outline">
            <PlayCircle size={14} /> Probar
          </button>
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {rule ? 'Guardar cambios' : 'Crear regla'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ActionRow({
  idx,
  control,
  register,
  watch,
  onRemove,
}: {
  idx: number;
  control: any;
  register: any;
  watch: any;
  onRemove: () => void;
}) {
  const type = watch(`actions.${idx}.type`) as ActionType;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name={`actions.${idx}.type`}
          render={({ field }) => (
            <select
              className="input flex-1"
              {...field}
              onChange={(e) => {
                field.onChange(e);
                const newType = e.target.value as ActionType;
                const rhf = (control as { _formValues: FormValues })._formValues;
                rhf.actions[idx]!.params = defaultActionParams(newType);
              }}
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
        />
        <button type="button" onClick={onRemove} className="btn-ghost !p-2 text-red-400" title="Quitar">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="mt-2 space-y-2">
        {type === 'add-tag' && (
          <input className="input w-full" placeholder="Tag" {...register(`actions.${idx}.params.tag`)} />
        )}

        {type === 'assign-owner' && (
          <input
            className="input w-full"
            placeholder="User ID del vendedor"
            {...register(`actions.${idx}.params.userId`)}
          />
        )}

        {type === 'move-stage' && (
          <input
            className="input w-full"
            placeholder="Stage ID destino"
            {...register(`actions.${idx}.params.stageId`)}
          />
        )}

        {type === 'notify-user' && (
          <>
            <input
              className="input w-full"
              placeholder="User ID (opcional)"
              {...register(`actions.${idx}.params.userId`)}
            />
            <input
              className="input w-full"
              placeholder="Mensaje"
              {...register(`actions.${idx}.params.message`)}
            />
          </>
        )}

        {type === 'update-field' && (
          <>
            <select className="input w-full" {...register(`actions.${idx}.params.field`)}>
              <option value="name">name</option>
              <option value="notes">notes</option>
              <option value="status">status</option>
            </select>
            <input
              className="input w-full"
              placeholder="Nuevo valor"
              {...register(`actions.${idx}.params.value`)}
            />
          </>
        )}
      </div>
    </div>
  );
}
