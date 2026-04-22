import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { X, Save, Mail, Phone, Building2, Tag, Calendar as CalIcon, Briefcase } from 'lucide-react';
import type { ContactDTO } from '@mycrm/shared';
import { api } from '@/lib/api';

interface DealLite {
  id: string;
  title: string;
  value: number;
  currency: string;
  stageId: string;
  createdAt: string;
  closedAt: string | null;
}

interface EventLite {
  id: string;
  title: string;
  start: string;
  end: string;
  status: 'confirmed' | 'canceled';
}

interface DetailResponse {
  contact: ContactDTO;
  deals: DealLite[];
  events: EventLite[];
}

type Tab = 'info' | 'deals' | 'agenda';

interface Props {
  contactId: string;
  onClose: () => void;
}

export function ContactDrawer({ contactId, onClose }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('info');
  const [form, setForm] = useState<Partial<ContactDTO>>({});
  const [tagsText, setTagsText] = useState('');

  const { data, isLoading, error } = useQuery<DetailResponse>({
    queryKey: ['contact', contactId],
    queryFn: () => api.get(`/api/contacts/${contactId}`),
    enabled: !!contactId,
  });

  useEffect(() => {
    if (data?.contact) {
      setForm(data.contact);
      setTagsText((data.contact.tags ?? []).join(', '));
    }
  }, [data?.contact]);

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<{ contact: ContactDTO }>(`/api/contacts/${contactId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contactId] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contacto actualizado');
    },
    onError: (err: any) => toast.error(err.message ?? 'Error al actualizar'),
  });

  function save() {
    const body: Record<string, unknown> = {
      name: form.name,
      phone: form.phone,
      email: form.email || null,
      company: form.company || null,
      industry: form.industry || null,
      tags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    };
    patch.mutate(body);
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <aside className="flex h-full w-full max-w-xl flex-col border-l border-border bg-bg-soft shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">
              {data?.contact.name ?? (isLoading ? 'Cargando…' : 'Contacto')}
            </div>
            {data?.contact.phone && (
              <div className="truncate font-mono text-xs text-text-dim">{data.contact.phone}</div>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 text-text-dim hover:bg-bg hover:text-text">
            <X size={18} />
          </button>
        </header>

        <nav className="flex gap-1 border-b border-border px-2 pt-2">
          {(['info', 'deals', 'agenda'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-medium uppercase tracking-wide ${
                tab === t ? 'border-b-2 border-brand-400 text-text' : 'text-text-dim hover:text-text'
              }`}
            >
              {t === 'info' ? 'Info' : t === 'deals' ? 'Deals' : 'Agenda'}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-4">
          {error && <div className="text-sm text-red-400">Error cargando contacto</div>}
          {isLoading && <div className="text-sm text-text-dim">Cargando…</div>}
          {data && tab === 'info' && (
            <div className="space-y-3 text-sm">
              <Field label="Nombre" icon={<Briefcase size={14} />}>
                <input
                  className="input"
                  value={form.name ?? ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Teléfono" icon={<Phone size={14} />}>
                <input
                  className="input font-mono"
                  value={form.phone ?? ''}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Field>
              <Field label="Email" icon={<Mail size={14} />}>
                <input
                  className="input"
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Empresa" icon={<Building2 size={14} />}>
                <input
                  className="input"
                  value={form.company ?? ''}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </Field>
              <Field label="Industria" icon={<Briefcase size={14} />}>
                <input
                  className="input"
                  value={form.industry ?? ''}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                />
              </Field>
              <Field label="Tags (separadas por coma)" icon={<Tag size={14} />}>
                <input
                  className="input"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="vip, ar, frio"
                />
              </Field>
              <div className="pt-2 text-xs text-text-faint">
                Creado {format(new Date(data.contact.createdAt), 'd MMM yyyy HH:mm', { locale: es })}
              </div>
              <button onClick={save} disabled={patch.isPending} className="btn-primary w-full">
                <Save size={14} /> {patch.isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          )}

          {data && tab === 'deals' && (
            <div className="space-y-2 text-sm">
              {data.deals.length === 0 && (
                <div className="text-xs text-text-faint">Este contacto todavía no tiene deals.</div>
              )}
              {data.deals.map((d) => (
                <a
                  key={d.id}
                  href={`/app/pipeline?deal=${d.id}`}
                  className="block rounded-md border border-border bg-bg/40 p-3 hover:border-brand-500/40"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{d.title}</div>
                    <div className="font-mono text-xs text-text-dim">
                      {d.currency} {d.value.toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-text-faint">
                    Creado {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true, locale: es })}
                    {d.closedAt ? ' · Cerrado' : ''}
                  </div>
                </a>
              ))}
            </div>
          )}

          {data && tab === 'agenda' && (
            <div className="space-y-2 text-sm">
              {data.events.length === 0 && (
                <div className="text-xs text-text-faint">Sin eventos programados.</div>
              )}
              {data.events.map((e) => (
                <div key={e.id} className="rounded-md border border-border bg-bg/40 p-3">
                  <div className="flex items-center gap-2">
                    <CalIcon size={14} className="text-brand-400" />
                    <span className="font-medium">{e.title}</span>
                    {e.status === 'canceled' && (
                      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0 text-[10px] text-red-400">
                        cancelado
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-text-faint">
                    {format(new Date(e.start), 'd MMM HH:mm', { locale: es })} —{' '}
                    {format(new Date(e.end), 'HH:mm', { locale: es })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-xs text-text-faint">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}
