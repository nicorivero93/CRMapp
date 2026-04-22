import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Sparkles, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function Signup() {
  const { signupOwner, user, loading, ownerExists } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const nav = useNavigate();

  if (!loading && user) return <Navigate to="/app" replace />;
  if (!loading && ownerExists === true) return <Navigate to="/login" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signupOwner(email, password, name);
      toast.success('Cuenta del dueño creada. A configurar.');
      nav('/app');
    } catch (err: any) {
      toast.error(err.message ?? 'Error al crear la cuenta');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15 text-brand-400">
            <Sparkles size={20} />
          </div>
          <div className="text-xl font-semibold tracking-tight">MyCRM <span className="text-xs text-text-faint">Local</span></div>
        </div>
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-brand-500/30 bg-brand-500/5 p-3 text-xs text-text-dim">
          <Lock size={14} className="mt-0.5 shrink-0 text-brand-400" />
          <div>
            Primer arranque. Esta cuenta es el <b>dueño</b> de la instalación. Después podés crear vendedoras desde Settings.
          </div>
        </div>
        <h1 className="mb-1 text-2xl font-semibold">Configurar owner</h1>
        <p className="mb-6 text-sm text-text-dim">Se crea una sola vez, cuando la DB está vacía.</p>
        <form onSubmit={submit} className="space-y-3">
          <input
            className="input"
            placeholder="Tu nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <input
            className="input"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Contraseña (mín. 8)"
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Creando…' : 'Crear cuenta de dueño'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-text-dim">
          ¿Ya está configurado? <Link to="/login" className="text-brand-400 hover:underline">Ingresá</Link>
        </p>
      </div>
    </div>
  );
}
