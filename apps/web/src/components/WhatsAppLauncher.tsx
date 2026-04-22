import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MessageCircle, Send, X, AlertTriangle } from 'lucide-react';
import type { LeadDTO, LineDTO, SendWhatsAppResponse, TemplateDTO } from '@mycrm/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Props {
  lead: LeadDTO;
  onClose: () => void;
}

const DEMO_TODAY = new Date().toLocaleDateString('es-AR');

function interpolatePreview(body: string, vars: Record<string, string | null>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => {
    const v = vars[k];
    return v == null ? '' : v;
  });
}

export function WhatsAppLauncher({ lead, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [templateId, setTemplateId] = useState<string | ''>('');
  const [freeform, setFreeform] = useState('');

  const templatesQ = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<{ templates: TemplateDTO[] }>('/api/templates'),
  });
  const linesQ = useQuery({
    queryKey: ['lines'],
    queryFn: () => api.get<{ lines: LineDTO[] }>('/api/lines'),
  });

  const activeTemplates = templatesQ.data?.templates.filter((t) => t.isActive) ?? [];
  const activeLine = linesQ.data?.lines.find((l) => l.isActive);

  const vars: Record<string, string | null> = useMemo(
    () => ({
      name: lead.name,
      phone: lead.phone,
      sellerName: user?.name ?? '',
      today: DEMO_TODAY,
    }),
    [lead, user],
  );

  const selectedTemplate = activeTemplates.find((t) => t.id === templateId) ?? null;
  const previewText = selectedTemplate
    ? interpolatePreview(selectedTemplate.body, vars)
    : freeform;

  const send = useMutation({
    mutationFn: async () => {
      const payload = selectedTemplate
        ? { templateId: selectedTemplate.id }
        : { body: freeform };
      return api.post<SendWhatsAppResponse>(`/api/leads/${lead.id}/whatsapp`, payload);
    },
    onSuccess: (r) => {
      window.open(r.url, '_blank', 'noopener,noreferrer');
      toast.success('Abrimos WhatsApp en una pestaña nueva');
      qc.invalidateQueries({ queryKey: ['lead', lead.id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lines'] });
      onClose();
    },
    onError: (err: any) => toast.error(err.message ?? 'Error al enviar'),
  });

  const canSend = !!activeLine && (selectedTemplate || freeform.trim().length > 0) && !send.isPending;
  const nearCap =
    activeLine && activeLine.dailyCapMessages > 0 && activeLine.dailyCount >= activeLine.dailyCapMessages * 0.9;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-bg-soft p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <MessageCircle size={18} className="text-brand-400" /> Enviar WhatsApp
            </h2>
            <p className="text-xs text-text-dim">
              A {lead.name || 'este lead'} · <span className="font-mono">{lead.phone}</span>
            </p>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {!activeLine ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <div className="mb-2 flex items-center gap-2 text-amber-400">
              <AlertTriangle size={14} /> No tenés una línea activa
            </div>
            <p className="mb-3 text-xs text-text-dim">
              Configurá al menos una línea y activala para empezar a enviar.
            </p>
            <Link to="/app/lines" className="btn-primary text-xs">
              Configurar mis líneas
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-3 rounded-md border border-border bg-bg/40 p-2 text-xs text-text-dim">
              Línea activa: <span className="font-mono text-text">{activeLine.phone}</span>{' '}
              {activeLine.label && <>({activeLine.label})</>} ·{' '}
              <span className={nearCap ? 'text-amber-400' : ''}>
                {activeLine.dailyCount}/{activeLine.dailyCapMessages} hoy
              </span>
            </div>

            {nearCap && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-400">
                <AlertTriangle size={14} /> Cerca del cap diario — considerá rotar de línea.
              </div>
            )}

            <div className="mb-3">
              <label className="mb-1 block text-xs text-text-faint">Template</label>
              <select
                className="input"
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  setFreeform('');
                }}
              >
                <option value="">— Mensaje libre —</option>
                {activeTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {!selectedTemplate && (
              <textarea
                className="input mb-3 min-h-[120px] text-sm"
                placeholder="Escribí tu mensaje…"
                value={freeform}
                onChange={(e) => setFreeform(e.target.value)}
              />
            )}

            <div className="mb-4 rounded-md border-l-2 border-brand-500/30 bg-bg/40 p-3">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-text-faint">Preview</div>
              <div className="whitespace-pre-wrap text-sm">
                {previewText || <span className="text-text-faint">(vacío)</span>}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-outline" onClick={onClose}>
                Cancelar
              </button>
              <button
                disabled={!canSend}
                onClick={() => send.mutate()}
                className="btn-primary"
              >
                <Send size={14} /> {send.isPending ? 'Abriendo…' : 'Enviar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
