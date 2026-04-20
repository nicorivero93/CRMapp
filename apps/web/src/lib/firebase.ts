import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'AIzaSyDl1uFfASIk05sO6HxgMkcGBEtVAYai8w0',
  authDomain: 'crm-app-31a8f.firebaseapp.com',
  projectId: 'crm-app-31a8f',
  storageBucket: 'crm-app-31a8f.firebasestorage.app',
  messagingSenderId: '197272136862',
  appId: '1:197272136862:web:46e3bef4cee57cf4d65f8f',
  measurementId: 'G-C5FGHE1EHR',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const googleProvider = new GoogleAuthProvider();

isSupported().then((ok) => { if (ok) getAnalytics(app); }).catch(() => {});
