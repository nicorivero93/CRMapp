import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Inbox, Search, Upload, Download } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { LeadDTO, LeadSource, LeadStatus } from '@mycrm/shared';
import { api, type PublicUser } from '@/lib/api';
import { toCsv, downloadCsv } from '@/lib/csv';

const STATUS_OPTIONS: Array<{ value: LeadStatus | ''; label: string }> = [
  { value: '', label: 'Todos los estados' },
  { value: 'new', label: 'Nuevo' },
  { value: 'assigned', label: 'Asignado' },
  { value: 'contacted', label: 'Contactado' },
  { value: 'responded', label: 'Respondió' },
  { value: 'qualified', label: 'Calificado' },
  { value: 'converted', label: 'Convertido' },
  { value: 'no-response', label: 'No respondió' },
  { value: 'recycled', label: 'Reciclado' },
  { value: 'discarded', label: 'Descartado' },
];

const SOURCE_OPTIONS: Array<{ value: LeadSource | ''; label: string }> = [
  { value: '', label: 'Todas las fuentes' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'meta-lead-ads', label: 'Meta Lead Ads' },
  { value: 'csv-import', label: 'CSV' },
  { value: 'sheets-import', label: 'Google Sheets' },
  { value: 'bulk-paste', label: 'Pegado' },
  { value: 'manual', label: 'Manual' },
  { value: 'whatsapp-inbound', label: 'WhatsApp' },
];

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: 'bg-brand-500/10 text-brand-400 border-brand-500/30',
  assigned: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  contacted: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  responded: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  qualified: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  converted: 'bg-green-500/10 text-green-400 border-green-500/30',
  'no-response': 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
  recycled: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  discarded: 'bg-red-500/10 text-red-400 border-red-500/30',
};

interface ListResponse {
  leads: LeadDTO[];
  total: number;
  limit: number;
  offset: number;
}

export default function Leads() {
  const [status, setStatus] = useState<LeadStatus | ''>('');
  const [source, setSource] = useState<LeadSource | ''>('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (source) params.set('source', source);
  if (q.trim()) params.set('q', q.trim());
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  const { data, isLoading, error } = useQuery<ListResponse>({
    queryKey: ['leads', { status, source, q: q.trim(), offset, limit }],
    queryFn: () => api.get(`/api/leads?${params.toString()}`),
    placeholderData: (prev) => prev,
  });

  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ users: PublicUser[] }>('/api/users'),
  });
  const userName = (id: string | null): string => {
    if (!id) return '—';
    return usersQ.data?.users.find((u) => u.id === id)?.name ?? id.slice(0, 6);
  };

  async function exportCsv() {
    try {
      const exportParams = new URLSearchParams(params);
      exportParams.set('limit', '10000');
      exportParams.set('offset', '0');
      const all = await api.get<ListResponse>(`/api/leads?${exportParams.toString()}`);
      if (all.leads.length === 0) {
        toast('No hay leads para exportar con estos filtros');
        return;
      }
      const csv = toCsv(
        all.leads.map((l) => ({
          nombre: l.name ?? '',
          telefono: l.phone,
          estado: l.status,
          fuente: l.source,
          asignado: userName(l.assignedTo),
          notas: l.notes ?? '',
          creado: l.createdAt,
        })),
        [
          { key: 'nombre', label: 'Nombre' },
          { key: 'telefono', label: 'Teléfono' },
          { key: 'estado', label: 'Estado' },
          { key: 'fuente', label: 'Fuente' },
          { key: 'asignado', label: 'Asignado a' },
          { key: 'notas', label: 'Notas' },
          { key: 'creado', label: 'Creado' },
        ],
      );
      const ts = new Date().toISOString().slice(0, 10);
      downloadCsv(`leads-${ts}.csv`, csv);
      toast.success(`${all.leads.length} leads exportados`);
    } catch (err: any) {
      toast.error(err.message ?? 'Error exportando');
    }
  }

  const total = data?.total ?? 0;
  const pageStart = offset + 1;
  const pageEnd = Math.min(offset + limit, total);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Inbox size={20} className="text-brand-400" /> Leads
          </h1>
          <p className="text-sm text-text-dim">
            {isLoading ? 'Cargando…' : `${total} lead${total === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="btn-outline" disabled={total === 0}>
            <Download size={14} /> Exportar CSV
          </button>
          <Link to="/app/leads/import" className="btn-primary">
            <Upload size={14} /> Importar
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
          <input
            className="input pl-9"
            placeholder="Buscar por nombre o teléfono…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <select
          className="input max-w-[180px]"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as LeadStatus | '');
            setOffset(0);
          }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="input max-w-[180px]"
          value={source}
          onChange={(e) => {
            setSource(e.target.value as LeadSource | '');
            setOffset(0);
          }}
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">Error cargando leads</div>}

      <div className="overflow-hidden rounded-lg border border-border bg-bg-soft">
        <table className="w-full text-sm">
          <thead className="bg-bg/50 text-xs uppercase tracking-wide text-text-faint">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Nombre</th>
              <th className="px-4 py-2 text-left font-medium">Teléfono</th>
              <th className="px-4 py-2 text-left font-medium">Estado</th>
              <th className="px-4 py-2 text-left font-medium">Asignado a</th>
              <th className="px-4 py-2 text-left font-medium">Fuente</th>
              <th className="px-4 py-2 text-left font-medium">Creado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!isLoading && data?.leads.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-text-dim">
                  No hay leads con estos filtros. <Link to="/app/leads/import" className="text-brand-400 hover:underline">Importá CSV</Link> o pegá una lista.
                </td>
              </tr>
            )}
            {data?.leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-bg/40">
                <td className="px-4 py-2">
                  <Link to={`/app/leads/${lead.id}`} className="text-brand-400 hover:underline">
                    {lead.name || <span className="text-text-faint italic">Sin nombre</span>}
                  </Link>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-text-dim">{lead.phone}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLES[lead.status]}`}>
                    {lead.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-text-dim">{userName(lead.assignedTo)}</td>
                <td className="px-4 py-2 text-xs text-text-dim">{lead.source}</td>
                <td className="px-4 py-2 text-xs text-text-faint">
                  {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true, locale: es })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > limit && (
        <div className="flex items-center justify-between text-xs text-text-dim">
          <div>
            {pageStart}–{pageEnd} de {total}
          </div>
          <div className="flex gap-2">
            <button
              className="btn-outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Anterior
            </button>
            <button
              className="btn-outline"
              disabled={pageEnd >= total}
              onClick={() => setOffset(offset + limit)}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
