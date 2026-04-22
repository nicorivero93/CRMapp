import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, MessageSquare, Plus, Trash2, Pencil } from 'lucide-react';
import type { TemplateDTO } from '@mycrm/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const DEMO_VARS = {
  name: 'Ana',
  phone: '+5491122334455',
  sellerName: 'Vos',
  today: new Date().toLocaleDateString('es-AR'),
};

function preview(body: string): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) =>
    String((DEMO_VARS as Record<string, string | undefined>)[k] ?? `{{${k}}}`),
  );
}

export default function Templates() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<TemplateDTO | null>(null);
  const [creating, setCreating] = useState(false);

  if (user && user.role !== 'owner' && user.role !== 'sales') return <Navigate to="/app" replace />;

  const templatesQ = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<{ templates: TemplateDTO[] }>('/api/templates'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template eliminado');
    },
    onError: (err: any) => toast.error(err.message ?? 'Error al borrar'),
  });

  const isOwner = user?.role === 'owner';

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link to="/app/settings" className="inline-flex items-center gap-1 text-sm text-text-dim hover:text-text">
          <ArrowLeft size={14} /> Volver a configuración
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <MessageSquare size={20} className="text-brand-400" /> Templates de WhatsApp
          </h1>
          <p className="text-sm text-text-dim">
            Variables: <code>{'{{name}}'}</code>, <code>{'{{phone}}'}</code>,{' '}
            <code>{'{{sellerName}}'}</code>, <code>{'{{today}}'}</code>.
          </p>
        </div>
        {isOwner && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> Nuevo template
          </button>
        )}
      </div>

      <div className="space-y-2">
        {!templatesQ.isLoading && templatesQ.data?.templates.length === 0 && (
          <div className="rounded-lg border border-border bg-bg-soft p-6 text-center text-sm text-text-dim">
            {isOwner
              ? 'No hay templates todavía. Creá el primero para que las vendedoras los usen.'
              : 'El dueño todavía no creó templates.'}
          </div>
        )}
        {templatesQ.data?.templates.map((t) => (
          <div key={t.id} className="rounded-lg border border-border bg-bg-soft p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t.name}</span>
                  {t.category && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-text-faint">
                      {t.category}
                    </span>
                  )}
                  {!t.isActive && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-amber-400">
                      inactivo
                    </span>
                  )}
                </div>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-text-dim">
                  {t.body}
                </pre>
                <div className="mt-2 border-l-2 border-brand-500/30 pl-3 text-xs text-text-faint">
                  <div className="mb-1 uppercase tracking-wide">Preview</div>
                  <div>{preview(t.body)}</div>
                </div>
              </div>
              {isOwner && (
                <div className="flex gap-1">
                  <button className="btn-ghost" onClick={() => setEditing(t)} title="Editar">
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn-ghost text-red-400"
                    onClick={() => {
                      if (confirm(`¿Borrar "${t.name}"?`)) remove.mutate(t.id);
                    }}
                    title="Borrar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {isOwner && (creating || editing) && (
        <TemplateModal
          template={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['templates'] });
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function TemplateModal({
  template,
  onClose,
  onSaved,
}: {
  template: TemplateDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [body, setBody] = useState(template?.body ?? 'Hola {{name}}, te escribe {{sellerName}}.');
  const [category, setCategory] = useState(template?.category ?? '');
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (template) {
        await api.patch(`/api/templates/${template.id}`, {
          name,
          body,
          category: category || null,
          isActive,
        });
      } else {
        await api.post('/api/templates', {
          name,
          body,
          category: category || undefined,
          isActive,
        });
      }
      toast.success('Template guardado');
      onSaved();
    } catch (err: any) {
      toast.error(err.message ?? 'Error al guardar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-bg-soft p-5">
        <h2 className="mb-4 text-lg font-semibold">
          {template ? 'Editar template' : 'Nuevo template'}
        </h2>
        <form onSubmit={submit} className="space-y-3">
          <input
            className="input"
            placeholder="Nombre (ej. Primer contacto)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <input
            className="input"
            placeholder="Categoría (opcional)"
            value={category ?? ''}
            onChange={(e) => setCategory(e.target.value)}
          />
          <textarea
            className="input min-h-[140px] font-sans text-sm"
            placeholder="Cuerpo del mensaje"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
          <div className="rounded-md border-l-2 border-brand-500/30 bg-bg/40 p-3 text-xs text-text-dim">
            <div className="mb-1 uppercase tracking-wide text-text-faint">Preview</div>
            <div>{preview(body)}</div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Activo (aparece en el launcher)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-outline" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
