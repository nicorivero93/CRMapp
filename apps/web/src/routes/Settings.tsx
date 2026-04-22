import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Zap, ChevronRight, MessageSquare, Recycle, MessageCircle, Kanban, Download } from 'lucide-react';
import { api, type PublicUser } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { UpdaterStatusDTO } from '@mycrm/shared';

export default function Settings() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ users: PublicUser[] }>('/api/users'),
  });
  const updaterQ = useQuery({
    queryKey: ['updater-status'],
    queryFn: () => api.get<{ status: UpdaterStatusDTO }>('/api/updater/status'),
    enabled: user?.role === 'owner',
  });
  const hasUpdate = updaterQ.data?.status.hasUpdate ?? false;
  const latestVersion = updaterQ.data?.status.latestVersion;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-sm text-text-dim">Tu cuenta, usuarios y preferencias de la instalación.</p>
      </div>

      {user?.role === 'owner' && (
        <>
          <Link
            to="/app/settings/assignment"
            className="flex items-center justify-between rounded-lg border border-border bg-bg-soft p-4 transition-colors hover:bg-bg-hover"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15 text-brand-400">
                <Zap size={16} />
              </div>
              <div>
                <div className="text-sm font-medium">Asignación de leads</div>
                <div className="text-xs text-text-dim">Modo, targets diarios, reparto manual.</div>
              </div>
            </div>
            <ChevronRight size={16} className="text-text-faint" />
          </Link>
          <Link
            to="/app/settings/templates"
            className="flex items-center justify-between rounded-lg border border-border bg-bg-soft p-4 transition-colors hover:bg-bg-hover"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15 text-brand-400">
                <MessageSquare size={16} />
              </div>
              <div>
                <div className="text-sm font-medium">Templates de WhatsApp</div>
                <div className="text-xs text-text-dim">
                  Mensajes reusables con variables que las vendedoras eligen al enviar.
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-text-faint" />
          </Link>
          <Link
            to="/app/settings/updater"
            className="flex items-center justify-between rounded-lg border border-border bg-bg-soft p-4 transition-colors hover:bg-bg-hover"
          >
            <div className="flex items-center gap-3">
              <div className={`grid h-9 w-9 place-items-center rounded-lg ${hasUpdate ? 'bg-amber-500/20 text-amber-400' : 'bg-brand-500/15 text-brand-400'}`}>
                <Download size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  Actualizaciones
                  {hasUpdate && (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-400">
                      v{latestVersion} disponible
                    </span>
                  )}
                </div>
                <div className="text-xs text-text-dim">
                  {hasUpdate
                    ? 'Bajá la última versión con rollback automático si falla.'
                    : 'Chequeá nuevas versiones en GitHub. Backup + rollback automático.'}
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-text-faint" />
          </Link>
          <Link
            to="/app/settings/stages"
            className="flex items-center justify-between rounded-lg border border-border bg-bg-soft p-4 transition-colors hover:bg-bg-hover"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15 text-brand-400">
                <Kanban size={16} />
              </div>
              <div>
                <div className="text-sm font-medium">Etapas del Pipeline</div>
                <div className="text-xs text-text-dim">
                  Renombrar, reordenar o agregar etapas del kanban de deals.
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-text-faint" />
          </Link>
          <Link
            to="/app/settings/recycling"
            className="flex items-center justify-between rounded-lg border border-border bg-bg-soft p-4 transition-colors hover:bg-bg-hover"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15 text-brand-400">
                <Recycle size={16} />
              </div>
              <div>
                <div className="text-sm font-medium">Reciclaje de leads</div>
                <div className="text-xs text-text-dim">
                  Reglas para devolver al pool los leads sin contacto después de N días.
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-text-faint" />
          </Link>
          <Link
            to="/app/settings/whatsapp"
            className="flex items-center justify-between rounded-lg border border-border bg-bg-soft p-4 transition-colors hover:bg-bg-hover"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15 text-brand-400">
                <MessageCircle size={16} />
              </div>
              <div>
                <div className="text-sm font-medium">WhatsApp</div>
                <div className="text-xs text-text-dim">
                  Canal manual (wa.me) o Meta Cloud API con webhook entrante.
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-text-faint" />
          </Link>
        </>
      )}

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
