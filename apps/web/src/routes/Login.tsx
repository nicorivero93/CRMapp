import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function Login() {
  const { loginEmail, loginGoogle, loginDemo, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const demoTriggered = useRef(false);

  async function demo() {
    setLoading(true);
    try {
      await loginDemo();
      toast.success('Demo listo. Explorá libremente.');
      nav('/app');
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo iniciar el demo');
    } finally { setLoading(false); }
  }

  // Auto-trigger demo when landing with ?demo=1 (portfolio iframe flow)
  useEffect(() => {
    if (params.get('demo') === '1' && !user && !demoTriggered.current) {
      demoTriggered.current = true;
      demo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try { await loginEmail(email, password); nav('/app'); }
    catch (err: any) { toast.error(err.message ?? 'Error al iniciar sesión'); }
    finally { setLoading(false); }
  }

  async function google() {
    setLoading(true);
    try { await loginGoogle(); nav('/app'); }
    catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }

  const isDemo = params.get('demo') === '1';

  if (isDemo) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
            <Sparkles size={24} />
          </div>
          <div>
            <div className="text-xl font-semibold">Preparando demo de MyCRM…</div>
            <div className="mt-1 text-sm text-text-dim">Cargando contactos, deals y eventos de ejemplo.</div>
          </div>
          <div className="h-1 w-40 overflow-hidden rounded-full bg-border">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-500" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15 text-brand-400"><Sparkles size={20} /></div>
          <div className="text-xl font-semibold tracking-tight">MyCRM</div>
        </div>
        <h1 className="mb-1 text-2xl font-semibold">Bienvenido de vuelta</h1>
        <p className="mb-6 text-sm text-text-dim">Ingresá con tu cuenta para seguir.</p>
        <form onSubmit={submit} className="space-y-3">
          <input className="input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" placeholder="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button disabled={loading} className="btn-primary w-full">{loading ? 'Ingresando…' : 'Ingresar'}</button>
        </form>
        <div className="my-4 flex items-center gap-3 text-xs text-text-faint">
          <div className="h-px flex-1 bg-border" /> o <div className="h-px flex-1 bg-border" />
        </div>
        <button onClick={google} className="btn-outline w-full">Continuar con Google</button>
        <p className="mt-6 text-center text-sm text-text-dim">
          ¿No tenés cuenta? <Link to="/signup" className="text-brand-400 hover:underline">Crear una</Link>
        </p>
      </div>
    </div>
  );
}
