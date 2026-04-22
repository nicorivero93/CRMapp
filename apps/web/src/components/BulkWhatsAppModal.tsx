import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, MessageCircle, Check, AlertTriangle, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import type { LeadDTO, TemplateDTO, SendWhatsAppResponse } from '@mycrm/shared';
import { api } from '@/lib/api';

interface Props {
  leads: LeadDTO[];
  onClose: () => void;
}

type Status = 'idle' | 'pending' | 'sent' | 'error';
interface Row {
  lead: LeadDTO;
  status: Status;
  url: string | null;
  error: string | null;
}

const DELAY_MS = 800;

export function BulkWhatsAppModal({ leads, onClose }: Props) {
  const qc = useQueryClient();
  const [templateId, setTemplateId] = useState('');
  const [rows, setRows] = useState<Row[]>(
    leads.map((l) => ({ lead: l, status: 'idle', url: null, error: null })),
  );
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const templatesQ = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<{ templates: TemplateDTO[] }>('/api/templates'),
  });
  const templates = templatesQ.data?.templates.filter((t) => t.isActive) ?? [];
  const selectedTemplate = templates.find((t) => t.id === templateId);

  async function run() {
    if (!templateId) {
      toast.error('Elegí un template primero');
      return;
    }
    setRunning(true);
    for (let i = 0; i < rows.length; i++) {
      setRows((rs) => rs.map((r, j) => (j === i ? { ...r, status: 'pending' } : r)));
      try {
        const res = await api.post<SendWhatsAppResponse>(
          `/api/leads/${rows[i].lead.id}/whatsapp`,
          { templateId },
        );
        setRows((rs) =>
          rs.map((r, j) =>
            j === i ? { ...r, status: 'sent', url: res.url, error: null } : r,
          ),
        );
      } catch (err: any) {
        setRows((rs) =>
          rs.map((r, j) =>
            j === i
              ? { ...r, status: 'error', error: err?.message ?? 'Error', url: null }
              : r,
          ),
        );
      }
      if (i < rows.length - 1) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }
    setRunning(false);
    setDone(true);
    qc.invalidateQueries({ queryKey: ['leads'] });
  }

  function openAllPending() {
    const urls = rows.filter((r) => r.status === 'sent' && r.url).map((r) => r.url!);
    if (urls.length === 0) return;
    urls.forEach((u, i) => {
      setTimeout(() => window.open(u, '_blank', 'noopener'), i * 300);
    });
    toast(`Abriendo ${urls.length} pestañas de WhatsApp…`);
  }

  const sentCount = rows.filter((r) => r.status === 'sent').length;
  const errorCount = rows.filter((r) => r.status === 'error').length;
  const progress = done ? 100 : Math.round((sentCount + errorCount) / rows.length * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-bg-soft shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <MessageCircle size={18} className="text-brand-400" />
            Enviar WhatsApp a {leads.length} lead{leads.length === 1 ? '' : 's'}
          </h2>
          <button onClick={onClose} className="btn-ghost !p-1" disabled={running}>
            <X size={16} />
          </button>
        </header>

        <div className="space-y-4 overflow-auto p-5">
          <div>
            <label className="mb-1 block text-xs text-text-faint">Template</label>
            <select
              className="input"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              disabled={running || done}
            >
              <option value="">— elegí un template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.category ? `(${t.category})` : ''}
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-bg/40 p-2 font-mono text-[11px] text-text-dim">
                {selectedTemplate.body}
              </pre>
            )}
          </div>

          {(running || done) && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-text-dim">
                <span>
                  {sentCount} enviado{sentCount === 1 ? '' : 's'} · {errorCount} error{errorCount === 1 ? '' : 'es'}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
                <div
                  className="h-full bg-brand-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="max-h-72 overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-bg-soft text-xs uppercase text-text-faint">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Lead</th>
                  <th className="px-3 py-2 text-left font-medium">Teléfono</th>
                  <th className="px-3 py-2 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.lead.id}>
                    <td className="px-3 py-1.5">{r.lead.name ?? <span className="italic text-text-faint">Sin nombre</span>}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-text-dim">{r.lead.phone}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.status === 'idle' && <span className="text-text-faint">—</span>}
                      {r.status === 'pending' && <span className="text-amber-400">Enviando…</span>}
                      {r.status === 'sent' && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <Check size={12} /> OK
                        </span>
                      )}
                      {r.status === 'error' && (
                        <span className="flex items-center gap-1 text-red-400" title={r.error ?? ''}>
                          <AlertTriangle size={12} /> Error
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {done && sentCount > 0 && (
            <div className="rounded-md border border-brand-500/30 bg-brand-500/5 p-3 text-xs">
              <p className="mb-2 text-text-dim">
                Si estás en modo <b>manual</b> (wa.me), los mensajes aún no se
                enviaron — abrí cada link para disparar WhatsApp Web/mobile:
              </p>
              <button onClick={openAllPending} className="btn-outline text-xs">
                <ExternalLink size={12} /> Abrir {sentCount} pestaña{sentCount === 1 ? '' : 's'}
              </button>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="btn-ghost" disabled={running}>
            {done ? 'Cerrar' : 'Cancelar'}
          </button>
          {!done && (
            <button
              onClick={run}
              className="btn-primary"
              disabled={running || !templateId || rows.length === 0}
            >
              {running ? 'Enviando…' : `Enviar a ${rows.length}`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
