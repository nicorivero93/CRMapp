import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, LogOut, Users, Inbox } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { LeadDTO, ContactDTO } from '@mycrm/shared';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

interface SearchState {
  leads: LeadDTO[];
  contacts: ContactDTO[];
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(q.trim(), 200);
  const boxRef = useRef<HTMLDivElement>(null);

  const searchQ = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: async (): Promise<SearchState> => {
      const qs = `q=${encodeURIComponent(debounced)}&limit=5`;
      const [leadsRes, contactsRes] = await Promise.all([
        api.get<{ leads: LeadDTO[] }>(`/api/leads?${qs}`),
        api.get<{ contacts: ContactDTO[] }>(`/api/contacts?${qs}`),
      ]);
      return { leads: leadsRes.leads, contacts: contactsRes.contacts };
    },
    enabled: debounced.length >= 2,
    staleTime: 10_000,
  });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function goTo(path: string) {
    setOpen(false);
    setQ('');
    navigate(path);
  }

  const results = searchQ.data;
  const showResults = open && debounced.length >= 2;
  const empty = showResults && !searchQ.isLoading && results &&
    results.leads.length === 0 && results.contacts.length === 0;

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-bg-soft/60 px-4 backdrop-blur">
      <div className="relative max-w-md flex-1" ref={boxRef}>
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
        <input
          placeholder="Buscar leads o contactos…"
          className="input pl-9"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Enter' && debounced.length >= 2) {
              goTo(`/app/leads?q=${encodeURIComponent(debounced)}`);
            }
          }}
        />
        {showResults && (
          <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-96 overflow-auto rounded-lg border border-border bg-bg-soft shadow-lg">
            {searchQ.isLoading && (
              <div className="px-4 py-3 text-xs text-text-dim">Buscando…</div>
            )}
            {empty && (
              <div className="px-4 py-3 text-xs text-text-dim">Sin resultados para "{debounced}"</div>
            )}
            {results && results.leads.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Leads</div>
                {results.leads.map((l) => (
                  <Link
                    key={l.id}
                    to={`/app/leads/${l.id}`}
                    onClick={() => { setOpen(false); setQ(''); }}
                    className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-bg-hover"
                  >
                    <Inbox size={14} className="text-brand-400 shrink-0" />
                    <span className="flex-1 truncate">{l.name ?? <span className="italic text-text-faint">Sin nombre</span>}</span>
                    <span className="font-mono text-xs text-text-faint">{l.phone}</span>
                  </Link>
                ))}
              </div>
            )}
            {results && results.contacts.length > 0 && (
              <div className="border-t border-border">
                <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Contactos</div>
                {results.contacts.map((c) => (
                  <Link
                    key={c.id}
                    to={`/app/contacts?id=${c.id}`}
                    onClick={() => { setOpen(false); setQ(''); }}
                    className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-bg-hover"
                  >
                    <Users size={14} className="text-brand-400 shrink-0" />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="font-mono text-xs text-text-faint">{c.phone}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right text-xs">
          <div className="font-medium">{user?.name}</div>
          <div className="text-text-faint">{user?.email}</div>
        </div>
        <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-500/20 text-xs font-semibold text-brand-400">
          {initials}
        </div>
        <button onClick={() => void logout()} className="btn-ghost" title="Salir">
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}
