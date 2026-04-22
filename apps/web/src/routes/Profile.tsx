import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { User, Check, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Profile() {
  const { user, refresh } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState(user?.name ?? '');
  useEffect(() => { setName(user?.name ?? ''); }, [user?.name]);

  const save = useMutation({
    mutationFn: () => api.patch(`/api/users/${user!.id}`, { name: name.trim() }),
    onSuccess: async () => {
      toast.success('Perfil actualizado');
      await refresh();
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(err.message ?? 'No se pudo guardar'),
  });

  if (!user) return null;

  const initials = (user.name ?? 'U')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const canSave = name.trim().length >= 2 && name.trim() !== user.name && !save.isPending;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <User size={20} className="text-brand-400" /> Mi perfil
        </h1>
        <p className="text-sm text-text-dim">Tu información de usuario y cuenta.</p>
      </div>

      <section className="rounded-lg border border-border bg-bg-soft p-4">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-brand-500/20 text-xl font-semibold text-brand-400">
            {initials}
          </div>
          <div className="space-y-1 text-sm">
            <div className="text-base font-medium">{user.name}</div>
            <div className="text-text-dim">{user.email}</div>
            <div className="font-mono text-xs uppercase tracking-wide text-text-faint">
              Rol: {user.role}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-bg-soft p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-dim">Información</h2>
        <form
          onSubmit={(e) => { e.preventDefault(); if (canSave) save.mutate(); }}
          className="space-y-3"
        >
          <div>
            <label className="mb-1 block text-xs text-text-faint">Nombre</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre visible"
              maxLength={100}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-faint">Email</label>
            <input className="input" value={user.email} disabled />
            <p className="mt-1 text-xs text-text-faint">
              Para cambiar el email, pedile al owner que lo edite desde la API.
            </p>
          </div>
          <div>
            <button type="submit" className="btn-primary" disabled={!canSave}>
              <Check size={14} /> {save.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-bg-soft p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-dim">
          <Lock size={14} /> Contraseña
        </h2>
        <p className="text-xs text-text-dim">
          Podés cambiar tu contraseña desde{' '}
          <a href="/app/settings" className="text-brand-400 hover:underline">
            Configuración
          </a>{' '}
          → "Cambiar contraseña".
        </p>
      </section>
    </div>
  );
}
