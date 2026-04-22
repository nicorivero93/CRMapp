import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function Login() {
  const { loginEmail, user, loading, ownerExists } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const nav = useNavigate();

  if (!loading && user) return <Navigate to="/app" replace />;
  if (!loading && ownerExists === false) return <Navigate to="/signup" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await loginEmail(email, password);
      nav('/app');
    } catch (err: any) {
      toast.error(err.message ?? 'Error al iniciar sesión');
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
        <h1 className="mb-1 text-2xl font-semibold">Ingresá a tu CRM</h1>
        <p className="mb-6 text-sm text-text-dim">Autogestionado en tu oficina. Tus datos nunca salen de acá.</p>
        <form onSubmit={submit} className="space-y-3">
          <input
            className="input"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            className="input"
            placeholder="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-text-dim">
          ¿Primera vez? <Link to="/signup" className="text-brand-400 hover:underline">Configurar owner</Link>
        </p>
        <p className="mt-8 text-center text-[11px] text-text-faint">
          © 2026 ·{' '}
          <a
            href="https://tomerivero-dev.web.app"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brand-400"
          >
            tomerivero.dev
          </a>
        </p>
      </div>
    </div>
  );
}
