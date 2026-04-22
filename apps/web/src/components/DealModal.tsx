import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { ContactDTO, DealDTO, StageDTO } from '@mycrm/shared';
import { api, ApiError } from '@/lib/api';

interface Props {
  mode: 'create' | 'edit';
  stageId?: string | null;
  deal?: DealDTO | null;
  stages: StageDTO[];
  onClose: () => void;
}

const CURRENCY_OPTIONS = ['ARS', 'USD', 'EUR', 'BRL', 'CLP', 'MXN'];

export function DealModal({ mode, stageId, deal, stages, onClose }: Props) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(deal?.title ?? '');
  const [value, setValue] = useState<string>(deal ? String(deal.value) : '0');
  const [currency, setCurrency] = useState(deal?.currency ?? 'ARS');
  const [stageSel, setStageSel] = useState(deal?.stageId ?? stageId ?? stages[0]?.id ?? '');
  const [contactSearch, setContactSearch] = useState('');
  const [contactId, setContactId] = useState<string | null>(deal?.contactId ?? null);
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => {
    if (deal) {
      setTitle(deal.title);
      setValue(String(deal.value));
      setCurrency(deal.currency);
      setStageSel(deal.stageId);
      setContactId(deal.contactId ?? null);
    }
  }, [deal]);

  const contactsQ = useQuery({
    queryKey: ['contacts-search', contactSearch],
    queryFn: () =>
      api.get<{ contacts: ContactDTO[] }>(
        `/api/contacts?${new URLSearchParams({ q: contactSearch, limit: '10' }).toString()}`,
      ),
    enabled: contactOpen,
  });

  const selectedContactQ = useQuery({
    queryKey: ['contact', contactId],
    queryFn: () => api.get<{ contact: ContactDTO }>(`/api/contacts/${contactId}`),
    enabled: !!contactId,
  });

  const save = useMutation({
    mutationFn: async () => {
      const v = Number.parseInt(value || '0', 10);
      if (!Number.isFinite(v) || v < 0) throw new Error('Valor inválido');
      const payload = {
        title: title.trim(),
        value: v,
        currency,
        stageId: stageSel,
        contactId: contactId ?? null,
      };
      if (!payload.title) throw new Error('El título es obligatorio');
      if (mode === 'create') {
        return api.post<{ deal: DealDTO }>('/api/deals', payload);
      }
      return api.patch<{ deal: DealDTO }>(`/api/deals/${deal!.id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      toast.success(mode === 'create' ? 'Deal creado' : 'Deal actualizado');
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/api/deals/${deal!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal eliminado');
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-bg-soft p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{mode === 'create' ? 'Nuevo deal' : 'Editar deal'}</h2>
          <button onClick={onClose} className="btn-ghost !p-1">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-text-dim">Título</label>
            <input
              className="input w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nombre del deal"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-text-dim">Valor</label>
              <input
                className="input w-full"
                type="number"
                min="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-dim">Moneda</label>
              <select className="input w-full" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-text-dim">Stage</label>
            <select className="input w-full" value={stageSel} onChange={(e) => setStageSel(e.target.value)}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-text-dim">Contacto (opcional)</label>
            {contactId && selectedContactQ.data ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-bg/40 px-3 py-2 text-sm">
                <span>{selectedContactQ.data.contact.name}</span>
                <button
                  onClick={() => {
                    setContactId(null);
                    setContactOpen(false);
                  }}
                  className="text-xs text-text-dim hover:text-red-400"
                >
                  Quitar
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  className="input w-full"
                  placeholder="Buscar contacto…"
                  value={contactSearch}
                  onChange={(e) => {
                    setContactSearch(e.target.value);
                    setContactOpen(true);
                  }}
                  onFocus={() => setContactOpen(true)}
                />
                {contactOpen && contactsQ.data && contactsQ.data.contacts.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-bg-soft shadow-xl">
                    {contactsQ.data.contacts.map((c) => (
                      <li
                        key={c.id}
                        onClick={() => {
                          setContactId(c.id);
                          setContactOpen(false);
                          setContactSearch('');
                        }}
                        className="cursor-pointer px-3 py-2 text-sm hover:bg-bg/50"
                      >
                        <div>{c.name}</div>
                        <div className="font-mono text-[10px] text-text-faint">{c.phone}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          {mode === 'edit' ? (
            <button
              onClick={() => {
                if (confirm('¿Eliminar este deal?')) remove.mutate();
              }}
              className="btn-ghost text-red-400 hover:bg-red-500/10"
              disabled={remove.isPending}
            >
              <Trash2 size={14} /> Eliminar
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-outline">
              Cancelar
            </button>
            <button
              onClick={() => save.mutate()}
              className="btn-primary"
              disabled={save.isPending || !title.trim() || !stageSel}
            >
              {mode === 'create' ? 'Crear' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
