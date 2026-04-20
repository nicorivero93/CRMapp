import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Calendar, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

export function GoogleConnect() {
  const { profile } = useAuth();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!profile) return;
    return onSnapshot(doc(db, 'users', profile.uid), (snap) => {
      const data = snap.data() as any;
      setConnected(!!data?.googleTokens);
    });
  }, [profile?.uid]);

  function onConnect() {
    if (!profile) return;
    const url = `https://us-central1-crm-app-31a8f.cloudfunctions.net/googleOAuthStart?uid=${profile.uid}`;
    window.location.href = url;
  }

  async function onDisconnect() {
    if (!profile) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), { googleTokens: null });
      toast.success('Google Calendar desconectado');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="card flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/5">
          <Calendar size={18} className="text-primary" />
        </div>
        <div>
          <div className="text-sm font-medium">Google Calendar</div>
          <div className="text-xs text-text-dim">Sincronizá tus eventos con tu cuenta de Google.</div>
        </div>
      </div>
      {connected ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-400">
            <Check size={12}/> Conectado
          </span>
          <button onClick={onDisconnect} className="btn-outline">Desconectar</button>
        </div>
      ) : (
        <button onClick={onConnect} className="btn-primary">Conectar Google Calendar</button>
      )}
    </div>
  );
}
