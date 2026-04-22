import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { ArrowLeft, MessageSquarePlus, Phone, ChevronDown, MessageCircle } from 'lucide-react';
import type { LeadDTO, LeadEventDTO, LeadStatus } from '@mycrm/shared';
import { api } from '@/lib/api';
import { WhatsAppLauncher } from '@/components/WhatsAppLauncher';

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Nuevo',
  assigned: 'Asignado',
  contacted: 'Contactado',
  responded: 'Respondió',
  qualified: 'Calificado',
  converted: 'Convertido',
  'no-response': 'No respondió',
  recycled: 'Reciclado',
  discarded: 'Descartado',
};

const EVENT_LABELS: Record<string, string> = {
  imported: 'Importado',
  assigned: 'Asignado',
  'wa-opened': 'WhatsApp abierto',
  'message-sent': 'Mensaje enviado',
  'response-received': 'Recibió respuesta',
  'status-changed': 'Cambio de estado',
  recycled: 'Reciclado',
  'note-added': 'Nota',
  converted: 'Convertido',
};

interface DetailResponse {
  lead: LeadDTO;
  events: LeadEventDTO[];
}

export default function LeadDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [waOpen, setWaOpen] = useState(false);

  const { data, isLoading, error } = useQuery<DetailResponse>({
    queryKey: ['lead', id],
    queryFn: () => api.get(`/api/leads/${id}`),
    enabled: !!id,
  });

  const patch = useMutation({
    mutationFn: (body: Partial<{ status: LeadStatus; notes: string }>) =>
      api.patch<{ lead: LeadDTO }>(`/api/leads/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (err: any) => toast.error(err.message ?? 'Error al actualizar'),
  });

  const addNote = useMutation({
    mutationFn: (text: string) =>
      api.post(`/api/leads/${id}/events`, { type: 'note-added', meta: { text } }),
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['lead', id] });
      toast.success('Nota agregada');
    },
    onError: (err: any) => toast.error(err.message ?? 'Error al agregar nota'),
  });

  if (isLoading) return <div className="text-sm text-text-dim">Cargando…</div>;
  if (error || !data) return <div className="text-sm text-red-400">No se pudo cargar el lead.</div>;

  const { lead, events } = data;

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <Link to="/app/leads" className="inline-flex items-center gap-1 text-sm text-text-dim hover:text-text">
          <ArrowLeft size={14} /> Volver a leads
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {lead.name || <span className="italic text-text-faint">Sin nombre</span>}
          </h1>
          <div className="mt-1 flex items-center gap-2 font-mono text-sm text-text-dim">
            <Phone size={14} /> {lead.phone}
            <span className="text-text-faint">({lead.phoneNormalized})</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWaOpen(true)} className="btn-primary">
            <MessageCircle size={14} /> WhatsApp
          </button>
          <div className="relative">
            <select
              className="input appearance-none pr-8"
              value={lead.status}
              onChange={(e) => patch.mutate({ status: e.target.value as LeadStatus })}
              disabled={patch.isPending}
            >
              {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-faint" />
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-[1fr_1.5fr]">
        <section className="space-y-3 rounded-lg border border-border bg-bg-soft p-4 text-sm">
          <Row label="Fuente" value={lead.source} />
          <Row label="Asignado a" value={lead.assignedTo ?? '— sin asignar —'} />
          <Row label="Creado" value={format(new Date(lead.createdAt), 'd MMM yyyy HH:mm', { locale: es })} />
          <Row label="Último contacto" value={lead.lastContactAt ? formatDistanceToNow(new Date(lead.lastContactAt), { locale: es, addSuffix: true }) : '—'} />
          <Row label="Reciclados" value={String(lead.recycledCount)} />
          {lead.tags.length > 0 && (
            <div>
              <div className="text-xs text-text-faint">Tags</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {lead.tags.map((t) => (
                  <span key={t} className="rounded-full border border-border px-2 py-0.5 text-[10px]">{t}</span>
                ))}
              </div>
            </div>
          )}
          {lead.notes && (
            <div>
              <div className="text-xs text-text-faint">Notas generales</div>
              <p className="mt-1 whitespace-pre-wrap text-xs text-text-dim">{lead.notes}</p>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-bg-soft p-4">
          <div className="mb-3 text-sm font-semibold">Timeline</div>
          <form
            className="mb-4 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (note.trim()) addNote.mutate(note.trim());
            }}
          >
            <textarea
              className="input min-h-[70px] text-sm"
              placeholder="Agregar una nota… (ej: la llamé a las 10, no atendió)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              type="submit"
              disabled={!note.trim() || addNote.isPending}
              className="btn-primary w-full"
            >
              <MessageSquarePlus size={14} /> {addNote.isPending ? 'Agregando…' : 'Agregar nota'}
            </button>
          </form>

          <div className="space-y-2">
            {events.length === 0 && <div className="text-xs text-text-faint">Sin eventos todavía.</div>}
            {events.map((e) => (
              <div key={e.id} className="rounded-md border border-border bg-bg/40 p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text">{EVENT_LABELS[e.type] ?? e.type}</span>
                  <span className="text-text-faint">
                    {formatDistanceToNow(new Date(e.at), { addSuffix: true, locale: es })}
                  </span>
                </div>
                {e.type === 'note-added' && e.meta && typeof (e.meta as any).text === 'string' && (
                  <div className="mt-1 whitespace-pre-wrap text-text-dim">{(e.meta as any).text}</div>
                )}
                {e.type === 'status-changed' && e.meta && (
                  <div className="mt-1 text-text-dim">
                    {String((e.meta as any).from)} → {String((e.meta as any).to)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {waOpen && <WhatsAppLauncher lead={lead} onClose={() => setWaOpen(false)} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-text-faint">{label}</span>
      <span className="text-right font-mono text-text">{value}</span>
    </div>
  );
}
