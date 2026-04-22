import { useState } from 'react';
import { where, doc, updateDoc, deleteDoc, addDoc, collection } from 'firebase/firestore';
import { Zap, Plus, Trash2, Copy, Edit2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useCollection } from '@/lib/useCollection';
import { AutomationRule } from '@/lib/types';
import { RULE_TEMPLATES } from './templates';

const TRIGGER_LABELS: Record<string, string> = {
  'contact.created': 'Contacto creado',
  'deal.stageChanged': 'Deal cambió de etapa',
  'deal.noActivityFor': 'Deal sin actividad',
  'event.canceled': 'Evento cancelado',
};

function triggerBadgeClass(type: string) {
  if (type.startsWith('contact')) return 'bg-brand/20 text-brand';
  if (type.startsWith('deal')) return 'bg-ok/20 text-ok';
  if (type.startsWith('event')) return 'bg-warn/20 text-warn';
  return 'bg-bg-card text-text-dim';
}

export function RulesList({ onNew, onEdit }: { onNew: () => void; onEdit: (rule: AutomationRule) => void }) {
  const { profile } = useAuth();
  const teamId = profile!.teamId;
  const { data: rules, loading } = useCollection<AutomationRule>('automations', where('teamId', '==', teamId));
  const [templatesOpen, setTemplatesOpen] = useState(false);

  async function toggle(rule: AutomationRule) {
    await updateDoc(doc(db, 'automations', rule.id), { enabled: !rule.enabled });
  }

  async function remove(rule: AutomationRule) {
    if (!confirm(`¿Eliminar la regla "${rule.name}"?`)) return;
    await deleteDoc(doc(db, 'automations', rule.id));
    toast.success('Regla eliminada');
  }

  async function duplicate(rule: AutomationRule) {
    const { id, ...rest } = rule;
    await addDoc(collection(db, 'automations'), { ...rest, name: `${rule.name} (copia)`, enabled: false });
    toast.success('Regla duplicada');
  }

  async function insertTemplate(idx: number) {
    const t = RULE_TEMPLATES[idx];
    const { description, ...rule } = t;
    await addDoc(collection(db, 'automations'), { ...rule, teamId });
    toast.success(`Plantilla "${t.name}" insertada`);
  }

  if (loading) return <div className="text-sm text-text-dim">Cargando reglas…</div>;

  return (
    <div className="space-y-4">
      <div className="card p-0 overflow-hidden">
        <button
          onClick={() => setTemplatesOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 hover:bg-bg-card/60"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-brand" />
            <span className="font-medium">Plantillas</span>
            <span className="text-xs text-text-dim">Arrancá con una regla pre-armada</span>
          </div>
          {templatesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {templatesOpen && (
          <div className="border-t border-border p-3 grid gap-2 md:grid-cols-3">
            {RULE_TEMPLATES.map((t, i) => (
              <div key={i} className="rounded-lg border border-border p-3 flex flex-col gap-2">
                <div className="font-medium text-sm">{t.name}</div>
                <div className="text-xs text-text-dim flex-1">{t.description}</div>
                <button className="btn-outline w-full justify-center" onClick={() => insertTemplate(i)}>
                  <Plus size={14} /> Insertar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {rules.length === 0 ? (
        <div className="card p-10 text-center">
          <Zap className="mx-auto mb-3 text-brand" size={32} />
          <div className="font-semibold mb-1">Todavía no hay reglas</div>
          <div className="text-sm text-text-dim mb-4">Creá tu primera regla para automatizar flujos 24/7.</div>
          <button onClick={onNew} className="btn-primary"><Plus size={14} /> Crear primera regla</button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-text-dim text-xs uppercase">
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 w-16">Activa</th>
                <th className="text-left px-4 py-3">Nombre</th>
                <th className="text-left px-4 py-3">Trigger</th>
                <th className="text-left px-4 py-3">Acciones</th>
                <th className="text-right px-4 py-3">—</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-border last:border-0 hover:bg-bg-card/40">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggle(rule)}
                      className={`relative h-5 w-9 rounded-full transition ${rule.enabled ? 'bg-brand' : 'bg-border'}`}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${rule.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium">{rule.name}</td>
                  <td className="px-4 py-3">
                    <span className={`chip ${triggerBadgeClass(rule.trigger.type)}`}>
                      {TRIGGER_LABELS[rule.trigger.type] ?? rule.trigger.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-dim">{rule.actions.length} acción{rule.actions.length !== 1 ? 'es' : ''}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost !p-2" onClick={() => onEdit(rule)} title="Editar"><Edit2 size={14} /></button>
                      <button className="btn-ghost !p-2" onClick={() => duplicate(rule)} title="Duplicar"><Copy size={14} /></button>
                      <button className="btn-ghost !p-2 text-bad" onClick={() => remove(rule)} title="Eliminar"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
