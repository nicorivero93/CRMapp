import { useState } from 'react';
import { X, Filter, ChevronDown } from 'lucide-react';
import { orderBy } from 'firebase/firestore';
import { useAuth } from '@/lib/auth';
import { useCollection } from '@/lib/useCollection';
import { Stage } from '@/lib/types';
import { ContactFilters } from './ContactsTable';

type Props = {
  filters: ContactFilters;
  onChange: (next: ContactFilters) => void;
};

const COUNTRIES = ['Argentina', 'Chile', 'México', 'España', 'Uruguay', 'Colombia', 'USA'];
const INDUSTRIES = ['SaaS', 'E-commerce', 'Servicios', 'Educación', 'Salud', 'Finanzas', 'Otros'];
const LAST_CONTACT_LABELS: Record<NonNullable<ContactFilters['lastContact']>, string> = {
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  '90d': 'Últimos 90 días',
  none: 'Sin contacto',
};

export function Filters({ filters, onChange }: Props) {
  const { profile } = useAuth();
  const teamId = profile!.teamId;
  const { data: stages } = useCollection<Stage>(`teams/${teamId}/stages`, orderBy('order'));

  const [openMenu, setOpenMenu] = useState<null | 'root' | 'country' | 'industry' | 'stage' | 'lastContact'>(null);

  function clear<K extends keyof ContactFilters>(key: K) {
    const next = { ...filters };
    delete next[key];
    onChange(next);
  }

  function set<K extends keyof ContactFilters>(key: K, value: ContactFilters[K]) {
    onChange({ ...filters, [key]: value });
    setOpenMenu(null);
  }

  const chips: { key: keyof ContactFilters; label: string }[] = [];
  if (filters.country) chips.push({ key: 'country', label: `País: ${filters.country}` });
  if (filters.industry) chips.push({ key: 'industry', label: `Industria: ${filters.industry}` });
  if (filters.stageId) {
    const s = stages.find((x) => x.id === filters.stageId);
    chips.push({ key: 'stageId', label: `Etapa: ${s?.name ?? filters.stageId}` });
  }
  if (filters.lastContact) chips.push({ key: 'lastContact', label: LAST_CONTACT_LABELS[filters.lastContact] });

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={() => clear(c.key)}
          className="chip bg-brand-500/20 text-brand-500 hover:bg-brand-500/30"
        >
          {c.label}
          <X size={12} />
        </button>
      ))}

      <div className="relative">
        <button
          onClick={() => setOpenMenu(openMenu === 'root' ? null : 'root')}
          className="btn-outline"
        >
          <Filter size={14} /> Filtro <ChevronDown size={12} />
        </button>
        {openMenu === 'root' && (
          <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-md border border-white/10 bg-bg-card p-1 shadow-lg">
            {([
              ['country', 'País'],
              ['industry', 'Industria'],
              ['stage', 'Etapa'],
              ['lastContact', 'Último contacto'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setOpenMenu(k)}
                className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-white/5"
              >
                {label} <ChevronDown size={12} className="-rotate-90" />
              </button>
            ))}
          </div>
        )}

        {openMenu === 'country' && (
          <div className="absolute left-0 top-full z-20 mt-2 max-h-64 w-56 overflow-auto rounded-md border border-white/10 bg-bg-card p-1 shadow-lg">
            {COUNTRIES.map((c) => (
              <button key={c} onClick={() => set('country', c)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-white/5">
                {c}
              </button>
            ))}
          </div>
        )}

        {openMenu === 'industry' && (
          <div className="absolute left-0 top-full z-20 mt-2 max-h-64 w-56 overflow-auto rounded-md border border-white/10 bg-bg-card p-1 shadow-lg">
            {INDUSTRIES.map((c) => (
              <button key={c} onClick={() => set('industry', c)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-white/5">
                {c}
              </button>
            ))}
          </div>
        )}

        {openMenu === 'stage' && (
          <div className="absolute left-0 top-full z-20 mt-2 max-h-64 w-56 overflow-auto rounded-md border border-white/10 bg-bg-card p-1 shadow-lg">
            {stages.length === 0 && <div className="px-3 py-2 text-sm text-text-dim">Sin etapas</div>}
            {stages.map((s) => (
              <button key={s.id} onClick={() => set('stageId', s.id)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-white/5">
                {s.name}
              </button>
            ))}
          </div>
        )}

        {openMenu === 'lastContact' && (
          <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-md border border-white/10 bg-bg-card p-1 shadow-lg">
            {(Object.keys(LAST_CONTACT_LABELS) as Array<keyof typeof LAST_CONTACT_LABELS>).map((k) => (
              <button key={k} onClick={() => set('lastContact', k)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-white/5">
                {LAST_CONTACT_LABELS[k]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
