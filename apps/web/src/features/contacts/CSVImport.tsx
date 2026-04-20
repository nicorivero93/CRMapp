import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { httpsCallable } from 'firebase/functions';
import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Upload, X } from 'lucide-react';
import { db, functions } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { UserDoc } from '@/lib/types';

type Props = { onClose: () => void };

const FIELDS = ['name', 'email', 'phone', 'company', 'country', 'industry'] as const;
type Field = (typeof FIELDS)[number] | '';

export function CSVImport({ onClose }: Props) {
  const { profile } = useAuth();
  const teamId = profile!.teamId;

  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, Field>>({});
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Subí un archivo .csv');
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hdrs = res.meta.fields ?? [];
        setHeaders(hdrs);
        setRows(res.data);
        // auto-mapear por coincidencia exacta/lowercase
        const auto: Record<string, Field> = {};
        for (const h of hdrs) {
          const hl = h.toLowerCase().trim();
          const match = FIELDS.find((f) => f === hl || hl.includes(f));
          auto[h] = (match ?? '') as Field;
        }
        setMapping(auto);
      },
      error: (e) => toast.error(e.message),
    });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  function mappedRows() {
    return rows.map((r) => {
      const out: Record<string, any> = {};
      for (const [csvCol, field] of Object.entries(mapping)) {
        if (!field) continue;
        const v = r[csvCol];
        if (v != null && v !== '') out[field] = String(v).trim();
      }
      return out;
    }).filter((r) => r.name || r.email);
  }

  async function handleImport() {
    const data = mappedRows();
    if (!data.length) {
      toast.error('No hay filas válidas. Mapeá al menos "name" o "email".');
      return;
    }
    setImporting(true);
    setProgress(0);

    try {
      const callable = httpsCallable(functions, 'importContactsCsv');
      await callable({ teamId, rows: data });
      toast.success(`${data.length} contactos importados`);
      onClose();
    } catch (err: any) {
      // Fallback cliente: addDoc + round-robin entre sales
      try {
        const salesSnap = await getDocs(
          query(collection(db, 'users'), where('teamId', '==', teamId), where('role', '==', 'sales')),
        );
        const sales = salesSnap.docs.map((d) => ({ ...(d.data() as UserDoc), uid: d.id }));
        const owners = sales.length ? sales.map((s) => s.uid) : [profile!.uid];

        for (let i = 0; i < data.length; i++) {
          const ownerId = owners[i % owners.length];
          await addDoc(collection(db, 'contacts'), {
            ...data[i],
            teamId,
            ownerId,
            status: 'active',
            source: 'csv',
            createdAt: serverTimestamp(),
          });
          setProgress(Math.round(((i + 1) / data.length) * 100));
        }
        toast.success(`${data.length} contactos importados (fallback)`);
        onClose();
      } catch (e: any) {
        toast.error(e.message ?? 'Falló la importación');
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="card w-full max-w-3xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold">Importar contactos desde CSV</h2>
          <button onClick={onClose} className="text-text-dim hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-5">
          {rows.length === 0 ? (
            <label
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition ${
                dragging ? 'border-brand-500 bg-brand-500/10' : 'border-white/15 hover:border-white/30'
              }`}
            >
              <Upload size={28} className="text-text-dim" />
              <div className="text-sm">Arrastrá un .csv o hacé click para seleccionar</div>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          ) : (
            <>
              <div className="mb-3 text-sm text-text-dim">{rows.length} filas detectadas. Mapeá las columnas:</div>
              <div className="mb-4 overflow-x-auto rounded-md border border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-white/5">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="px-3 py-2 text-left">
                          <div className="mb-1 font-medium">{h}</div>
                          <select
                            className="input h-7 text-xs"
                            value={mapping[h] ?? ''}
                            onChange={(e) => setMapping({ ...mapping, [h]: e.target.value as Field })}
                          >
                            <option value="">(ignorar)</option>
                            {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} className="border-t border-white/5">
                        {headers.map((h) => (
                          <td key={h} className="px-3 py-2 text-text-dim">{r[h]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {importing && (
                <div className="mb-3">
                  <div className="h-2 w-full overflow-hidden rounded bg-white/10">
                    <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-text-dim">Importando… {progress}%</div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button onClick={onClose} disabled={importing} className="btn-outline">Cancelar</button>
                <button onClick={handleImport} disabled={importing} className="btn-primary">
                  {importing ? 'Importando…' : `Importar ${rows.length}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
