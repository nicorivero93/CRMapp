import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Inbox, Target } from 'lucide-react';
import { formatDistanceToNow, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type { LeadDTO, LeadStatus } from '@mycrm/shared';
import { api, type PublicUser } from '@/lib/api';
import { useAuth } from '@/lib/auth';

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

const FILTERS: Array<{ value: '' | 'active' | 'pending' | 'closed'; label: string }> = [
  { value: 'active', label: 'Activos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'closed', label: 'Cerrados' },
  { value: '', label: 'Todos' },
];

const FILTER_STATUSES: Record<string, LeadStatus[]> = {
  active: ['assigned', 'contacted', 'responded', 'qualified'],
  pending: ['assigned'],
  closed: ['converted', 'no-response', 'discarded', 'recycled'],
};

export default function MyLeads() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<'' | 'active' | 'pending' | 'closed'>('active');

  const params = new URLSearchParams();
  params.set('assignedTo', 'me');
  params.set('limit', '200');

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ['leads', 'mine', filter],
    queryFn: () => api.get(`/api/leads?${params.toString()}`),
    placeholderData: (prev) => prev,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!filter) return data.leads;
    const allowed = new Set(FILTER_STATUSES[filter]);
    return data.leads.filter((l) => allowed.has(l.status));
  }, [data, filter]);

  const assignedToday = useMemo(() => {
    if (!data) return 0;
    const today = new Date();
    return data.leads.filter((l) => l.assignedAt && isSameDay(new Date(l.assignedAt), today)).length;
  }, [data]);

  const target = (user as PublicUser | null)?.dailyLeadTarget ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Inbox size={20} className="text-brand-400" /> Mis leads
          </h1>
          <p className="text-sm text-text-dim">
            Los leads que tenés asignados. Trabajá de arriba hacia abajo.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg-soft px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-text-faint">
            <Target size={12} /> Hoy
          </div>
          <div className="mt-1 text-2xl font-semibold">
            {assignedToday}
            <span className="text-sm text-text-faint"> / {target}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === f.value
                ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                : 'border-border text-text-dim hover:bg-bg-hover'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-bg-soft">
        <table className="w-full text-sm">
          <thead className="bg-bg/50 text-xs uppercase tracking-wide text-text-faint">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Nombre</th>
              <th className="px-4 py-2 text-left font-medium">Teléfono</th>
              <th className="px-4 py-2 text-left font-medium">Estado</th>
              <th className="px-4 py-2 text-left font-medium">Asignado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-text-dim">
                  No hay leads con este filtro.
                </td>
              </tr>
            )}
            {filtered.map((lead) => (
              <tr key={lead.id} className="hover:bg-bg/40">
                <td className="px-4 py-2">
                  <Link to={`/app/leads/${lead.id}`} className="text-brand-400 hover:underline">
                    {lead.name || <span className="italic text-text-faint">Sin nombre</span>}
                  </Link>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-text-dim">{lead.phone}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLES[lead.status]}`}>
                    {lead.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-text-faint">
                  {lead.assignedAt
                    ? formatDistanceToNow(new Date(lead.assignedAt), { addSuffix: true, locale: es })
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
