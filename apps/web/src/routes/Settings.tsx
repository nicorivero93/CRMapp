import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Zap, ChevronRight, MessageSquare, Recycle, MessageCircle, Kanban, Download, Lock, Check, Database } from 'lucide-react';
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

      {user?.role === 'owner' && <BackupCard />}

      <section className="rounded-lg border border-border bg-bg-soft p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-dim">Tu cuenta</h2>
        <div className="space-y-1 text-sm">
          <div><span className="text-text-faint">Nombre:</span> {user?.name}</div>
          <div><span className="text-text-faint">Email:</span> {user?.email}</div>
          <div><span className="text-text-faint">Rol:</span> <span className="font-mono text-xs">{user?.role}</span></div>
        </div>
      </section>

      {user && <ChangePasswordCard userId={user.id} />}

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

function BackupCard() {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const res = await fetch('/api/backup', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `mycrm-backup-${Date.now()}.db.gz`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Backup descargado');
    } catch (err: any) {
      toast.error(err.message ?? 'Error descargando backup');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-lg border border-border bg-bg-soft p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-dim">
        <Database size={14} /> Backup manual
      </h2>
      <p className="mb-3 text-xs text-text-faint">
        Descarga un snapshot consistente de la DB (SQLite online backup + gzip).
        Guardalo en otro disco/servicio para poder restaurar si se rompe la PC.
      </p>
      <button onClick={download} disabled={busy} className="btn-outline">
        <Download size={14} /> {busy ? 'Generando…' : 'Descargar backup'}
      </button>
    </section>
  );
}

function ChangePasswordCard({ userId }: { userId: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const changePw = useMutation({
    mutationFn: () =>
      api.patch(`/api/users/${userId}`, {
        password: next,
        currentPassword: current,
      }),
    onSuccess: () => {
      toast.success('Contraseña actualizada');
      setCurrent('');
      setNext('');
      setConfirm('');
    },
    onError: (err: any) => {
      if (err?.code === 'INVALID_CREDENTIALS') {
        toast.error('La contraseña actual no coincide');
      } else if (err?.code === 'CURRENT_PASSWORD_REQUIRED') {
        toast.error('Ingresá tu contraseña actual.');
      } else {
        toast.error(err?.message ?? 'No se pudo cambiar la contraseña');
      }
    },
  });

  const pwMismatch = confirm.length > 0 && next !== confirm;
  const pwShort = next.length > 0 && next.length < 8;
  const canSubmit =
    current.length > 0 && next.length >= 8 && next === confirm && !changePw.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    changePw.mutate();
  }

  return (
    <section className="rounded-lg border border-border bg-bg-soft p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-dim">
        <Lock size={14} /> Cambiar contraseña
      </h2>
      <form onSubmit={submit} className="space-y-3 max-w-md">
        <div>
          <label className="mb-1 block text-xs text-text-faint">Contraseña actual</label>
          <div className="flex gap-2">
            <input
              type={showCurrent ? 'text' : 'password'}
              className="input flex-1"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="btn-ghost text-xs"
              tabIndex={-1}
            >
              {showCurrent ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-faint">Contraseña nueva (mín. 8)</label>
          <div className="flex gap-2">
            <input
              type={showNext ? 'text' : 'password'}
              className="input flex-1"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowNext(!showNext)}
              className="btn-ghost text-xs"
              tabIndex={-1}
            >
              {showNext ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          {pwShort && (
            <div className="mt-1 text-xs text-amber-400">Necesitás al menos 8 caracteres.</div>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-faint">Confirmar contraseña nueva</label>
          <input
            type={showNext ? 'text' : 'password'}
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          {pwMismatch && (
            <div className="mt-1 text-xs text-red-400">No coincide con la nueva contraseña.</div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={!canSubmit}>
            <Check size={14} /> {changePw.isPending ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
          <span className="text-xs text-text-faint">
            Tu sesión actual se mantiene activa después de cambiarla.
          </span>
        </div>
      </form>
    </section>
  );
}
