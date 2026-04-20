import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { doc, updateDoc, collection, where, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import { User, Users, Mail, Trash2 } from 'lucide-react';
import { db, functions } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useCollection } from '@/lib/useCollection';

type Tab = 'profile' | 'team' | 'invite';

type ProfileForm = { name: string; avatarUrl: string };
type TeamForm = { name: string };
type InviteForm = { email: string; role: 'sales' | 'member' };

type TeamDoc = { id: string; name: string; ownerId: string; members: string[] };
type Member = { id: string; name: string; email: string; role: 'owner' | 'sales' | 'member' };
type Invite = { id: string; email: string; role: string; teamId: string; status: string; createdAt?: any };

export default function Settings() {
  const { profile, user } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');

  if (!profile || !user) return null;
  const isOwner = profile.role === 'owner';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-text-dim">Configurá tu perfil, tu equipo e invitá miembros.</p>
      </div>

      <div className="mb-4 flex gap-1 border-b border-white/5">
        <TabBtn active={tab === 'profile'} onClick={() => setTab('profile')} icon={<User size={14}/>}>Perfil</TabBtn>
        <TabBtn active={tab === 'team'} onClick={() => setTab('team')} icon={<Users size={14}/>}>Equipo</TabBtn>
        <TabBtn active={tab === 'invite'} onClick={() => setTab('invite')} icon={<Mail size={14}/>}>Invitar miembros</TabBtn>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'profile' && <ProfileTab />}
        {tab === 'team' && <TeamTab isOwner={isOwner} />}
        {tab === 'invite' && <InviteTab isOwner={isOwner} />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px transition ${
        active ? 'border-indigo-500 text-white' : 'border-transparent text-text-dim hover:text-white'
      }`}
    >
      {icon} {children}
    </button>
  );
}

function ProfileTab() {
  const { profile, user } = useAuth();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<ProfileForm>({
    defaultValues: { name: profile?.name ?? '', avatarUrl: profile?.avatarUrl ?? '' },
  });

  async function onSubmit(data: ProfileForm) {
    try {
      await updateDoc(doc(db, 'users', user!.uid), {
        name: data.name,
        avatarUrl: data.avatarUrl || null,
      });
      toast.success('Perfil actualizado');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card max-w-xl space-y-4 p-6">
      <div>
        <label className="mb-1 block text-sm text-text-dim">Nombre</label>
        <input className="input" {...register('name', { required: true })} />
      </div>
      <div>
        <label className="mb-1 block text-sm text-text-dim">Avatar URL</label>
        <input className="input" placeholder="https://..." {...register('avatarUrl')} />
      </div>
      <div>
        <label className="mb-1 block text-sm text-text-dim">Email</label>
        <input className="input opacity-60" value={profile?.email ?? ''} disabled />
      </div>
      <div className="flex items-center justify-between pt-2">
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" disabled className="btn-outline opacity-40 cursor-not-allowed">
          <Trash2 size={14}/> Eliminar cuenta
        </button>
      </div>
    </form>
  );
}

function TeamTab({ isOwner }: { isOwner: boolean }) {
  const { profile } = useAuth();
  const teamId = profile!.teamId;
  const { data: teams } = useCollection<TeamDoc>('teams', where('__name__', '==', teamId));
  const team = teams[0];
  const { data: members } = useCollection<Member>('users', where('teamId', '==', teamId));

  const { register, handleSubmit, formState: { isSubmitting }, reset } = useForm<TeamForm>({
    defaultValues: { name: team?.name ?? '' },
  });

  if (team && !isSubmitting) {
    // keep form in sync when team loads
    // (react-hook-form default values only apply on mount)
  }

  async function onSubmit(data: TeamForm) {
    try {
      await updateDoc(doc(db, 'teams', teamId), { name: data.name });
      toast.success('Equipo actualizado');
      reset(data);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} className="card max-w-xl space-y-4 p-6">
        <div>
          <label className="mb-1 block text-sm text-text-dim">Nombre del equipo</label>
          <input
            className="input"
            disabled={!isOwner}
            defaultValue={team?.name ?? ''}
            {...register('name', { required: true })}
          />
          {!isOwner && <p className="mt-1 text-xs text-text-dim">Solo el owner puede editar el nombre del equipo.</p>}
        </div>
        {isOwner && (
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? 'Guardando…' : 'Guardar'}
          </button>
        )}
      </form>

      <div className="card max-w-2xl p-6">
        <h3 className="mb-3 text-sm font-medium">Miembros ({members.length})</h3>
        <ul className="divide-y divide-white/5">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm">{m.name}</div>
                <div className="text-xs text-text-dim">{m.email}</div>
              </div>
              <span className="chip">{m.role}</span>
            </li>
          ))}
          {members.length === 0 && <li className="py-3 text-sm text-text-dim">Sin miembros todavía.</li>}
        </ul>
      </div>
    </div>
  );
}

function InviteTab({ isOwner }: { isOwner: boolean }) {
  const { profile } = useAuth();
  const teamId = profile!.teamId;
  const { data: invites } = useCollection<Invite>('invites', where('teamId', '==', teamId));

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<InviteForm>({
    defaultValues: { email: '', role: 'sales' },
  });

  async function onSubmit(data: InviteForm) {
    try {
      const createInvite = httpsCallable(functions, 'createInvite');
      await createInvite({ email: data.email, role: data.role, teamId });
      toast.success(`Invitación enviada a ${data.email}`);
      reset({ email: '', role: 'sales' });
    } catch (err: any) {
      toast.error(err.message ?? 'Error al enviar invitación');
    }
  }

  if (!isOwner) {
    return (
      <div className="card max-w-xl p-6 text-sm text-text-dim">
        Solo el owner del equipo puede invitar miembros.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} className="card max-w-xl space-y-4 p-6">
        <h3 className="text-sm font-medium">Enviar invitación</h3>
        <div className="grid grid-cols-[1fr_160px] gap-3">
          <input className="input" placeholder="email@empresa.com" type="email" {...register('email', { required: true })} />
          <select className="input" {...register('role')}>
            <option value="sales">sales</option>
            <option value="member">member</option>
          </select>
        </div>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          <Mail size={14}/> {isSubmitting ? 'Enviando…' : 'Enviar invitación'}
        </button>
      </form>

      <div className="card max-w-2xl p-6">
        <h3 className="mb-3 text-sm font-medium">Invitaciones pendientes ({invites.filter(i => i.status === 'pending').length})</h3>
        <ul className="divide-y divide-white/5">
          {invites.map((i) => (
            <li key={i.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm">{i.email}</div>
                <div className="text-xs text-text-dim">rol: {i.role}</div>
              </div>
              <span className="chip">{i.status}</span>
            </li>
          ))}
          {invites.length === 0 && <li className="py-3 text-sm text-text-dim">Sin invitaciones.</li>}
        </ul>
      </div>
    </div>
  );
}
