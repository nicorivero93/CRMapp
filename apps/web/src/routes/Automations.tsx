import { useState } from 'react';
import { Plus, Zap } from 'lucide-react';
import { RulesList } from '@/features/automations/RulesList';
import { RuleEditor } from '@/features/automations/RuleEditor';
import { AutomationRule } from '@/lib/types';

export default function Automations() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationRule | null>(null);

  function openNew() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(rule: AutomationRule) {
    setEditing(rule);
    setEditorOpen(true);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Zap className="text-brand" size={22} /> Automatizaciones
          </h1>
          <p className="text-sm text-text-dim">Reglas que corren en tu Firestore 24/7.</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus size={14} /> Nueva regla</button>
      </div>

      <RulesList onNew={openNew} onEdit={openEdit} />

      {editorOpen && <RuleEditor rule={editing} onClose={() => setEditorOpen(false)} />}
    </div>
  );
}
