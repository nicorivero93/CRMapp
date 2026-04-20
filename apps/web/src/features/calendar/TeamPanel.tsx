import { collection, query, where } from 'firebase/firestore';
import { Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useCollection } from '@/lib/useCollection';
import { UserDoc } from '@/lib/types';

function isOnline(lastSeenAt: any): boolean {
  if (!lastSeenAt) return false;
  const d = typeof lastSeenAt.toDate === 'function' ? lastSeenAt.toDate() : new Date(lastSeenAt);
  return Date.now() - d.getTime() < 2 * 60 * 1000;
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function TeamPanel() {
  const { profile } = useAuth();
  const teamId = profile!.teamId;
  const { data: members } = useCollection<UserDoc & { lastSeenAt?: any }>(
    'users',
    where('teamId', '==', teamId)
  );

  return (
    <aside className="flex w-[260px] shrink-0 flex-col rounded-lg border border-white/5 bg-bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Users size={16}/> Equipo
        <span className="ml-auto text-xs text-text-dim">{members.length}</span>
      </div>
      <div className="flex flex-col gap-2 overflow-auto">
        {members.map((m) => {
          const online = isOnline(m.lastSeenAt);
          return (
            <div key={m.uid} className="flex items-center gap-3 rounded-md p-2 hover:bg-white/5">
              <div className="relative">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} alt={m.name} className="h-9 w-9 rounded-full object-cover" />
                  ) : initials(m.name ?? '?')}
                </div>
                <span
                  className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-bg-card ${online ? 'bg-emerald-500' : 'bg-gray-500'}`}
                  title={online ? 'Online' : 'Offline'}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{m.name}</div>
                <div className="truncate text-[11px] uppercase text-text-dim">{m.role}</div>
              </div>
            </div>
          );
        })}
        {members.length === 0 && <div className="text-xs text-text-dim">Sin miembros todavía.</div>}
      </div>
    </aside>
  );
}
