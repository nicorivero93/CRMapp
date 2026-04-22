import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Search, Upload, Plus, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import type { ContactDTO } from '@mycrm/shared';
import { api, ApiError } from '@/lib/api';
import { ContactDrawer } from '@/components/ContactDrawer';

interface ListResponse {
  contacts: ContactDTO[];
  total: number;
  limit: number;
  offset: number;
}

interface ImportResponse {
  batchId: string | null;
  totalRows: number;
  imported: number;
  deduped: number;
  errors: number;
  errorsSample: string[];
}

export default function Contacts() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [industry, setIndustry] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const selectedId = params.get('id');

  const qs = new URLSearchParams();
  if (q.trim()) qs.set('q', q.trim());
  if (tag) qs.set('tag', tag);
  if (industry) qs.set('industry', industry);
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));

  const { data, isLoading, error } = useQuery<ListResponse>({
    queryKey: ['contacts', { q: q.trim(), tag, industry, offset, limit }],
    queryFn: () => api.get(`/api/contacts?${qs.toString()}`),
    placeholderData: (prev) => prev,
  });

  const industryOptions = useMemo(() => {
    const s = new Set<string>();
    (data?.contacts ?? []).forEach((c) => c.industry && s.add(c.industry));
    return Array.from(s).sort();
  }, [data?.contacts]);

  const tagOptions = useMemo(() => {
    const s = new Set<string>();
    (data?.contacts ?? []).forEach((c) => c.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [data?.contacts]);

  function openContact(id: string) {
    const p = new URLSearchParams(params);
    p.set('id', id);
    setParams(p, { replace: true });
  }
  function closeContact() {
    const p = new URLSearchParams(params);
    p.delete('id');
    setParams(p, { replace: true });
  }

  const total = data?.total ?? 0;
  const pageStart = offset + 1;
  const pageEnd = Math.min(offset + limit, total);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Users size={20} className="text-brand-400" /> Contactos
          </h1>
          <p className="text-sm text-text-dim">
            {isLoading ? 'Cargando…' : `${total} contacto${total === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={() => setImportOpen(true)}>
            <Upload size={14} /> Importar CSV
          </button>
          <button className="btn-primary" onClick={() => setNewOpen(true)}>
            <Plus size={14} /> Nuevo
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
          <input
            className="input pl-9"
            placeholder="Buscar por nombre, teléfono o email…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <select
          className="input max-w-[180px]"
          value={tag}
          onChange={(e) => {
            setTag(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">Todas las tags</option>
          {tagOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className="input max-w-[180px]"
          value={industry}
          onChange={(e) => {
            setIndustry(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">Todas las industrias</option>
          {industryOptions.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          Error cargando contactos
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-bg-soft">
        <table className="w-full text-sm">
          <thead className="bg-bg/50 text-xs uppercase tracking-wide text-text-faint">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Nombre</th>
              <th className="px-4 py-2 text-left font-medium">Teléfono</th>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Empresa</th>
              <th className="px-4 py-2 text-left font-medium">Industria</th>
              <th className="px-4 py-2 text-left font-medium">Tags</th>
              <th className="px-4 py-2 text-left font-medium">Creado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!isLoading && data?.contacts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-text-dim">
                  No hay contactos con estos filtros.{' '}
                  <button
                    onClick={() => setNewOpen(true)}
                    className="text-brand-400 hover:underline"
                  >
                    Crear uno
                  </button>{' '}
                  o importar CSV.
                </td>
              </tr>
            )}
            {data?.contacts.map((c) => (
              <tr key={c.id} className="hover:bg-bg/40">
                <td className="px-4 py-2">
                  <button
                    onClick={() => openContact(c.id)}
                    className="text-brand-400 hover:underline"
                  >
                    {c.name}
                  </button>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-text-dim">{c.phone}</td>
                <td className="px-4 py-2 text-xs text-text-dim">{c.email ?? '—'}</td>
                <td className="px-4 py-2 text-xs text-text-dim">{c.company ?? '—'}</td>
                <td className="px-4 py-2 text-xs text-text-dim">{c.industry ?? '—'}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {c.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-border px-1.5 py-0 text-[10px]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2 text-xs text-text-faint">
                  {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale: es })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > limit && (
        <div className="flex items-center justify-between text-xs text-text-dim">
          <div>
            {pageStart}–{pageEnd} de {total}
          </div>
          <div className="flex gap-2">
            <button
              className="btn-outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Anterior
            </button>
            <button
              className="btn-outline"
              disabled={pageEnd >= total}
              onClick={() => setOffset(offset + limit)}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {selectedId && <ContactDrawer contactId={selectedId} onClose={closeContact} />}
      {newOpen && <NewContactModal onClose={() => setNewOpen(false)} onCreated={(id) => openContact(id)} />}
      {importOpen && <ImportCsvModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function NewContactModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    industry: '',
    tags: '',
  });

  const create = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        company: form.company.trim() || null,
        industry: form.industry.trim() || null,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
      };
      return api.post<{ contact: ContactDTO }>('/api/contacts', body);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contacto creado');
      onClose();
      onCreated(res.contact.id);
    },
    onError: (err: any) => toast.error(err.message ?? 'Error al crear'),
  });

  return (
    <Modal title="Nuevo contacto" onClose={onClose}>
      <form
        className="space-y-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.name.trim() || !form.phone.trim()) {
            toast.error('Nombre y teléfono son obligatorios');
            return;
          }
          create.mutate();
        }}
      >
        <Input label="Nombre *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Input label="Teléfono *" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Input label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Input label="Empresa" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
        <Input label="Industria" value={form.industry} onChange={(v) => setForm({ ...form, industry: v })} />
        <Input
          label="Tags (separadas por coma)"
          value={form.tags}
          onChange={(v) => setForm({ ...form, tags: v })}
        />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportCsvModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportResponse | null>(null);

  async function submit(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const payload = await res.json();
      if (!res.ok) throw new ApiError(res.status, payload.code, payload.error ?? 'Import falló');
      setReport(payload as ImportResponse);
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast.success(`${payload.imported} contacto${payload.imported === 1 ? '' : 's'} importados`);
    } catch (err: any) {
      toast.error(err.message ?? 'Error al importar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Importar contactos desde CSV" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-text-dim">
          Columnas soportadas: <code>nombre</code>, <code>telefono</code>, <code>email</code>,{' '}
          <code>empresa</code>, <code>industria</code>, <code>tags</code> (separadas por coma).
          Se deduplica por teléfono normalizado.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          className="block w-full text-xs text-text-dim file:mr-3 file:rounded-md file:border-0 file:bg-brand-500/15 file:px-3 file:py-2 file:text-xs file:font-medium file:text-brand-400 hover:file:bg-brand-500/25"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void submit(f);
            e.target.value = '';
          }}
        />

        {report && (
          <div className="rounded-md border border-border bg-bg/40 p-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              <Stat label="Filas" value={report.totalRows} />
              <Stat label="Importados" value={report.imported} color="text-emerald-400" />
              <Stat label="Duplicados" value={report.deduped} color="text-amber-400" />
              <Stat label="Errores" value={report.errors} color="text-red-400" />
            </div>
            {report.errorsSample.length > 0 && (
              <details className="mt-3 text-xs text-text-dim">
                <summary className="cursor-pointer">Ver errores</summary>
                <ul className="mt-2 space-y-1 font-mono">
                  {report.errorsSample.map((e, i) => (
                    <li key={i} className="text-text-faint">• {e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button type="button" className="btn-outline" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-bg-soft p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-text-dim hover:bg-bg hover:text-text">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-text-faint">{label}</label>
      <input className="input" value={value} type={type} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-md border border-border bg-bg/40 p-2">
      <div className={`text-lg font-semibold ${color ?? 'text-text'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-text-faint">{label}</div>
    </div>
  );
}
