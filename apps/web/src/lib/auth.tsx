import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { seedDemoTeam } from './demoSeed';

type Profile = {
  uid: string;
  name: string;
  email: string;
  avatarUrl?: string;
  teamId: string;
  role: 'owner' | 'sales' | 'member';
};

type Ctx = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signupEmail: (email: string, password: string, name: string, teamName: string) => Promise<void>;
  loginEmail: (email: string, password: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  loginDemo: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }
      if (u) {
        // Subscribe so that when bootstrapTeam finishes writing users/{uid}
        // (which may happen AFTER this handler runs), profile populates.
        unsubProfile = onSnapshot(
          doc(db, 'users', u.uid),
          (snap) => {
            if (snap.exists()) setProfile({ uid: u.uid, ...(snap.data() as any) });
            else setProfile(null);
            setLoading(false);
          },
          () => setLoading(false),
        );
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => { unsubAuth(); if (unsubProfile) unsubProfile(); };
  }, []);

  async function bootstrapTeam(u: User, name: string, teamName: string) {
    const teamId = u.uid;
    await setDoc(doc(db, 'teams', teamId), {
      name: teamName,
      ownerId: u.uid,
      members: [u.uid],
      plan: 'free',
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'users', u.uid), {
      name,
      email: u.email,
      teamId,
      role: 'owner',
      avatarUrl: u.photoURL ?? null,
      createdAt: serverTimestamp(),
    });

    const stages = [
      { name: 'Nuevo lead', order: 0, color: '#6366f1', isClosedWon: false },
      { name: 'Contactado', order: 1, color: '#f59e0b', isClosedWon: false },
      { name: 'Propuesta enviada', order: 2, color: '#10b981', isClosedWon: false },
      { name: 'Cerrado', order: 3, color: '#22c55e', isClosedWon: true },
    ];
    for (let i = 0; i < stages.length; i++) {
      await setDoc(doc(db, 'teams', teamId, 'stages', `s${i}`), stages[i]);
    }
  }

  async function waitForClaims(u: User, expectTeamId: string) {
    // onUserDocCreated (Cloud Function) sets custom claims after users/{uid}
    // is written. Poll the idToken until teamId claim shows up (max ~8s).
    for (let i = 0; i < 8; i++) {
      const r = await u.getIdTokenResult(true);
      if ((r.claims as any).teamId === expectTeamId) return;
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  async function signupEmail(email: string, password: string, name: string, teamName: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await bootstrapTeam(cred.user, name, teamName);
    await waitForClaims(cred.user, cred.user.uid);
  }

  async function loginEmail(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // Force token refresh in case claims were updated since last login
    await cred.user.getIdToken(true);
  }

  async function loginGoogle() {
    const cred = await signInWithPopup(auth, googleProvider);
    const existing = await getDoc(doc(db, 'users', cred.user.uid));
    if (!existing.exists()) {
      await bootstrapTeam(cred.user, cred.user.displayName ?? 'Usuario', `${cred.user.displayName ?? 'Mi'} CRM`);
      await waitForClaims(cred.user, cred.user.uid);
    } else {
      await cred.user.getIdToken(true);
    }
  }

  async function loginDemo() {
    const cred = await signInAnonymously(auth);
    const existing = await getDoc(doc(db, 'users', cred.user.uid));
    if (!existing.exists()) {
      await bootstrapTeam(cred.user, 'Usuario Demo', 'Demo CRM');
      await waitForClaims(cred.user, cred.user.uid);
      // Populate with sample data so the demo feels alive from second 1.
      try { await seedDemoTeam(cred.user.uid, cred.user.uid); } catch (e) { console.warn('demo seed failed', e); }
    } else {
      await cred.user.getIdToken(true);
    }
  }

  async function logout() { await signOut(auth); }

  return (
    <AuthCtx.Provider value={{ user, profile, loading, signupEmail, loginEmail, loginGoogle, loginDemo, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
