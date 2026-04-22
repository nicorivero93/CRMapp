import { NavLink } from 'react-router-dom';
import { LayoutDashboard, KanbanSquare, Users, Calendar, Zap, Settings, Sparkles, Inbox, Upload, Target, Phone } from 'lucide-react';
import clsx from 'clsx';

const items = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/leads/mine', label: 'Mis leads', icon: Target, end: true },
  { to: '/app/leads', label: 'Todos los leads', icon: Inbox, end: true },
  { to: '/app/leads/import', label: 'Importar', icon: Upload, end: true },
  { to: '/app/lines', label: 'Mis líneas', icon: Phone, end: true },
  { to: '/app/pipeline', label: 'Pipeline', icon: KanbanSquare, end: true },
  { to: '/app/contacts', label: 'Contactos', icon: Users, end: true },
  { to: '/app/calendar', label: 'Calendario', icon: Calendar, end: true },
  { to: '/app/automations', label: 'Automatizaciones', icon: Zap, end: true },
  { to: '/app/settings', label: 'Configuración', icon: Settings, end: false },
];

export function Sidebar() {
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
      <div className="px-5 py-4 text-[11px] text-text-faint">v0.1 · Built with Claude Code</div>
    </aside>
  );
}
