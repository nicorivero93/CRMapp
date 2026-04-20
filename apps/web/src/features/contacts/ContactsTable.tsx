import { useMemo } from 'react';
import { orderBy, where } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/lib/auth';
import { useCollection } from '@/lib/useCollection';
import { Contact } from '@/lib/types';

export type ContactFilters = {
  country?: string;
  industry?: string;
  stageId?: string;
  lastContact?: '7d' | '30d' | '90d' | 'none';
};

type Props = {
  filters: ContactFilters;
  onSelect: (c: Contact) => void;
};

function tsToDate(x: any): Date | null {
  if (!x) return null;
  if (x instanceof Date) return x;
  if (typeof x?.toDate === 'function') return x.toDate();
  if (typeof x === 'string') return new Date(x);
  return null;
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function statusClass(status?: Contact['status']) {
  if (status === 'complete') return 'bg-brand-500/20 text-brand-500';
  if (status === 'respond') return 'bg-warn/20 text-warn';
  return 'bg-ok/20 text-ok';
}

export function ContactsTable({ filters, onSelect }: Props) {
  const { profile } = useAuth();
  const teamId = profile!.teamId;

  const { data: contacts, loading } = useCollection<Contact>(
    'contacts',
    where('teamId', '==', teamId),
    orderBy('createdAt', 'desc'),
  );

  const filtered = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    return contacts.filter((c) => {
      if (filters.country && c.country !== filters.country) return false;
      if (filters.industry && c.industry !== filters.industry) return false;
      if (filters.stageId && c.stageId !== filters.stageId) return false;
      if (filters.lastContact) {
        const d = tsToDate(c.lastContactAt);
        if (filters.lastContact === 'none') {
          if (d) return false;
        } else {
          if (!d) return false;
          const days = filters.lastContact === '7d' ? 7 : filters.lastContact === '30d' ? 30 : 90;
          if (now - d.getTime() > days * dayMs) return false;
        }
      }
      return true;
    });
  }, [contacts, filters]);

  if (loading) {
    return <div className="card p-6 text-sm text-text-dim">Cargando contactos…</div>;
  }

  if (!filtered.length) {
    return (
      <div className="card p-8 text-center text-sm text-text-dim">
        No hay contactos que coincidan con los filtros. Importá un CSV o creá uno nuevo.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-text-dim">
          <tr>
            <th className="px-4 py-3">Nombre</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">País</th>
            <th className="px-4 py-3">Industria</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3">Último contacto</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => {
            const d = tsToDate(c.lastContactAt);
            return (
              <tr
                key={c.id}
                onClick={() => onSelect(c)}
                className="cursor-pointer border-t border-white/5 hover:bg-white/5"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/20 text-xs font-semibold text-brand-500">
                      {initials(c.name || '?')}
                    </div>
                    <span className="font-medium">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-text-dim">{c.email ?? '—'}</td>
                <td className="px-4 py-3 text-text-dim">{c.country ?? '—'}</td>
                <td className="px-4 py-3 text-text-dim">{c.industry ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`chip ${statusClass(c.status)}`}>{c.status ?? 'active'}</span>
                </td>
                <td className="px-4 py-3 text-text-dim">
                  {d ? formatDistanceToNow(d, { addSuffix: true, locale: es }) : 'Sin contacto'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
