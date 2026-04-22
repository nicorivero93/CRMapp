import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Download, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ApplyUpdateResponse, UpdaterStatusDTO } from '@mycrm/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function SettingsUpdater() {
  const { user } = useAuth();
  if (user && user.role !== 'owner') return <Navigate to="/app/settings" replace />;

  const statusQ = useQuery({
    queryKey: ['updater-status'],
    queryFn: () => api.get<{ status: UpdaterStatusDTO }>('/api/updater/status'),
    refetchInterval: 15000,
  });

  const check = useMutation({
    mutationFn: () => api.post<{ status: UpdaterStatusDTO }>('/api/updater/check'),
    onSuccess: (r) => {
      statusQ.refetch();
      if (r.status.hasUpdate) toast.success(`Versión ${r.status.latestVersion} disponible`);
      else toast('Ya estás en la última versión');
    },
    onError: (err: any) => toast.error(err.message ?? 'Error al chequear'),
  });

  const apply = useMutation({
    mutationFn: () => api.post<ApplyUpdateResponse>('/api/updater/apply', {}),
    onSuccess: (r) => {
      if (r.status === 'initiated') {
        toast.success('Actualización iniciada. El servidor se está reiniciando…');
      } else {
        toast(r.message);
      }
    },
    onError: (err: any) => toast.error(err.message ?? 'Error al iniciar update'),
  });

  const s = statusQ.data?.status;

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link
          to="/app/settings"
          className="inline-flex items-center gap-1 text-sm text-text-dim hover:text-text"
        >
          <ArrowLeft size={14} /> Volver a configuración
        </Link>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Download size={20} className="text-brand-400" /> Actualizaciones
        </h1>
        <p className="text-sm text-text-dim">
          Bajá nuevas versiones de MyCRM directo desde GitHub Releases. Backup
          automático + rollback si la versión nueva no arranca.
        </p>
      </div>

      {statusQ.isLoading && <div className="text-sm text-text-dim">Consultando…</div>}

      {s && (
        <>
          <section className="rounded-lg border border-border bg-bg-soft p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-dim">Estado</h2>
              <button
                onClick={() => check.mutate()}
                disabled={check.isPending || s.checking}
                className="btn-outline text-xs"
              >
                <RefreshCw size={12} className={check.isPending || s.checking ? 'animate-spin' : ''} />
                {check.isPending || s.checking ? 'Chequeando…' : 'Chequear ahora'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-border bg-bg/40 p-3">
                <div className="text-xs uppercase tracking-wide text-text-faint">Instalada</div>
                <div className="mt-1 font-mono text-lg">v{s.currentVersion}</div>
              </div>
              <div className="rounded-md border border-border bg-bg/40 p-3">
                <div className="text-xs uppercase tracking-wide text-text-faint">Última release</div>
                <div className="mt-1 font-mono text-lg">
                  {s.latestVersion ? `v${s.latestVersion}` : '—'}
                </div>
              </div>
            </div>
            {s.lastCheckedAt && (
              <div className="mt-3 text-xs text-text-faint">
                Último chequeo: {new Date(s.lastCheckedAt).toLocaleString('es-AR')}
              </div>
            )}
            {s.error && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div className="font-mono">{s.error}</div>
              </div>
            )}
          </section>

          {s.hasUpdate && (
            <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
              <div className="mb-3 flex items-start gap-2">
                <AlertTriangle size={18} className="mt-1 shrink-0 text-amber-400" />
                <div>
                  <div className="text-base font-semibold">
                    Nueva versión v{s.latestVersion} disponible
                  </div>
                  <p className="text-xs text-text-dim">
                    Durante la actualización el servicio se detiene por ~30s. Si algo
                    falla, rollback automático a v{s.currentVersion}.
                  </p>
                </div>
              </div>
              {s.releaseNotes && (
                <details className="mb-3 text-xs text-text-dim">
                  <summary className="cursor-pointer font-medium">Release notes</summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded bg-bg/40 p-3 font-mono text-[11px]">
                    {s.releaseNotes}
                  </pre>
                </details>
              )}
              <button
                onClick={() => {
                  if (
                    confirm(
                      `¿Actualizar a v${s.latestVersion} ahora? El servicio se va a reiniciar.`,
                    )
                  ) {
                    apply.mutate();
                  }
                }}
                disabled={apply.isPending}
                className="btn-primary"
              >
                <Download size={14} /> {apply.isPending ? 'Iniciando…' : 'Actualizar ahora'}
              </button>
            </section>
          )}

          {!s.hasUpdate && s.latestVersion && (
            <section className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-400">
              <CheckCircle2 size={16} /> Estás en la última versión.
            </section>
          )}
        </>
      )}
    </div>
  );
}
