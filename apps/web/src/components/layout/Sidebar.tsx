import { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, KanbanSquare, Users, Calendar, Zap, Settings, Sparkles, Inbox, Upload, Target, Phone, BarChart3 } from 'lucide-react';
import clsx from 'clsx';
import { api, type PublicUser } from '@/lib/api';

interface Item {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end: boolean;
  /** If set, item only renders when predicate on {users} returns true. */
  showIf?: (ctx: { users: PublicUser[] }) => boolean;
}

const ALL_ITEMS: Item[] = [
  { to: '/app/dashboard', label: 'Inicio', icon: LayoutDashboard, end: true },
  // Only useful when there's more than one user (leads can be assigned to
  // someone other than you). In a single-user install this just mirrors
  // "Todos los leads" so we hide it.
  {
    to: '/app/leads/mine',
    label: 'Mis leads',
    icon: Target,
    end: true,
    showIf: ({ users }) => users.length > 1,
  },
  { to: '/app/leads', label: 'Todos los leads', icon: Inbox, end: true },
  { to: '/app/leads/import', label: 'Importar', icon: Upload, end: true },
  { to: '/app/lines', label: 'Mis líneas', icon: Phone, end: true },
  { to: '/app/sources', label: 'Fuentes', icon: BarChart3, end: true },
  { to: '/app/pipeline', label: 'Pipeline', icon: KanbanSquare, end: true },
  { to: '/app/contacts', label: 'Contactos', icon: Users, end: true },
  { to: '/app/calendar', label: 'Calendario', icon: Calendar, end: true },
  { to: '/app/automations', label: 'Automatizaciones', icon: Zap, end: true },
  { to: '/app/settings', label: 'Configuración', icon: Settings, end: false },
];

export function Sidebar() {
  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ users: PublicUser[] }>('/api/users'),
  });
  const users = usersQ.data?.users ?? [];

  const items = useMemo(
    () => ALL_ITEMS.filter((i) => !i.showIf || i.showIf({ users })),
    [users],
  );

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-bg-soft">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/15 text-brand-400">
          <Sparkles size={18} />
        </div>
        <div className="font-semibold tracking-tight">MyCRM</div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive ? 'bg-brand-500/10 text-brand-400' : 'text-text-dim hover:bg-bg-hover hover:text-text'
              )
            }
          >
            <Icon size={16} /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-4 text-[11px] text-text-faint">
        © 2026 ·{' '}
        <a
          href="https://tomerivero-dev.web.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-dim hover:text-brand-400"
        >
          tomerivero.dev
        </a>
      </div>
    </aside>
  );
}
