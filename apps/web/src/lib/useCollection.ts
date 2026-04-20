import { useEffect, useState } from 'react';
import { Query, onSnapshot, QueryConstraint, collection, query } from 'firebase/firestore';
import { db } from './firebase';

export function useCollection<T = any>(path: string, ...constraints: QueryConstraint[]) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q: Query = constraints.length ? query(collection(db, path), ...constraints) : collection(db, path);
    const unsub = onSnapshot(q, (snap) => {
      setData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as T[]);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, JSON.stringify(constraints.map((c: any) => c._method ?? c.type ?? ''))]);
  return { data, loading };
}
