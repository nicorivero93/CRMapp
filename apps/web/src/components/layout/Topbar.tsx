import { Search, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export function Topbar() {
  const { user, logout } = useAuth();
  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-bg-soft/60 px-4 backdrop-blur">
      <div className="relative max-w-md flex-1">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
        <input placeholder="Buscar contactos, leads, deals…" className="input pl-9" />
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
