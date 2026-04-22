import { useQuery } from '@tanstack/react-query';
import { api, type PublicUser } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Settings() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ users: PublicUser[] }>('/api/users'),
  });

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-sm text-text-dim">Tu cuenta, usuarios y preferencias de la instalación.</p>
      </div>

      <section className="rounded-lg border border-border bg-bg-soft p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-dim">Tu cuenta</h2>
        <div className="space-y-1 text-sm">
          <div><span className="text-text-faint">Nombre:</span> {user?.name}</div>
          <div><span className="text-text-faint">Email:</span> {user?.email}</div>
          <div><span className="text-text-faint">Rol:</span> <span className="font-mono text-xs">{user?.role}</span></div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-bg-soft p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-dim">Usuarios de la instalación</h2>
          <span className="text-xs text-text-faint">
            {data?.users.length ?? 0} usuario{data?.users.length === 1 ? '' : 's'}
          </span>
        </div>
        {isLoading && <div className="text-sm text-text-dim">Cargando…</div>}
        {error && <div className="text-sm text-red-400">Error cargando usuarios</div>}
        {data && (
          <div className="divide-y divide-border">
            {data.users.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div>{u.name}</div>
                  <div className="text-xs text-text-faint">{u.email}</div>
                </div>
                <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-dim">
                  {u.role}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-text-faint">
          Crear, editar y eliminar usuarios vía UI llega en L2.4 junto al assignment engine.
        </p>
      </section>
    </div>
  );
}
