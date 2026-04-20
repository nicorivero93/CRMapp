import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function Signup() {
  const { signupEmail, loginGoogle } = useAuth();
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await signupEmail(email, password, name, teamName || `${name} CRM`);
      toast.success('Cuenta creada. ¡A vender!');
      nav('/app');
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15 text-brand-400"><Sparkles size={20} /></div>
          <div className="text-xl font-semibold tracking-tight">MyCRM</div>
        </div>
        <h1 className="mb-1 text-2xl font-semibold">Crear tu cuenta</h1>
        <p className="mb-6 text-sm text-text-dim">Reemplazá GHL en menos de una hora.</p>
        <form onSubmit={submit} className="space-y-3">
          <input className="input" placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="input" placeholder="Nombre del equipo / empresa" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
          <input className="input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" placeholder="Contraseña (mín. 6)" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button disabled={loading} className="btn-primary w-full">{loading ? 'Creando…' : 'Crear cuenta'}</button>
        </form>
        <div className="my-4 flex items-center gap-3 text-xs text-text-faint">
          <div className="h-px flex-1 bg-border" /> o <div className="h-px flex-1 bg-border" />
        </div>
        <button onClick={() => loginGoogle().then(() => nav('/app')).catch((e) => toast.error(e.message))} className="btn-outline w-full">Continuar con Google</button>
        <p className="mt-6 text-center text-sm text-text-dim">
          ¿Ya tenés cuenta? <Link to="/login" className="text-brand-400 hover:underline">Ingresá</Link>
        </p>
      </div>
    </div>
  );
}
