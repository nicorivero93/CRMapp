import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import type { ContactDTO, DealDTO, EventDTO, LeadDTO } from '@mycrm/shared';
import { api, ApiError } from '@/lib/api';

type LinkType = 'none' | 'lead' | 'contact' | 'deal';

interface Props {
  mode: 'create' | 'edit';
  event?: EventDTO | null;
  defaultStart?: Date;
  onClose: () => void;
}

const COLOR_PRESETS = [
  { value: '#6366f1', label: 'Indigo' },
  { value: '#10b981', label: 'Verde' },
  { value: '#f59e0b', label: 'Ámbar' },
  { value: '#ef4444', label: 'Rojo' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#a855f7', label: 'Violeta' },
];

function toInputLocal(d: Date): string {
  // YYYY-MM-DDTHH:mm (local).
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

function fromInputLocal(s: string): Date {
  // Treat as local time.
  return new Date(s);
}

export function EventModal({ mode, event, defaultStart, onClose }: Props) {
  const qc = useQueryClient();
  const isEdit = mode === 'edit' && !!event;

  const initStart = useMemo(() => {
    if (event) return new Date(event.start);
    if (defaultStart) return defaultStart;
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  }, [event, defaultStart]);

  const initEnd = useMemo(() => {
    if (event) return new Date(event.end);
    return new Date(initStart.getTime() + 30 * 60_000);
  }, [event, initStart]);

  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState<string>(event?.description ?? '');
  const [start, setStart] = useState(toInputLocal(initStart));
  const [end, setEnd] = useState(toInputLocal(initEnd));
  const [status, setStatus] = useState<'confirmed' | 'canceled'>(event?.status ?? 'confirmed');

  const initialLink: LinkType = event?.leadId
    ? 'lead'
    : event?.contactId
      ? 'contact'
      : event?.dealId
        ? 'deal'
        : 'none';
  const [linkType, setLinkType] = useState<LinkType>(initialLink);
  const [leadId, setLeadId] = useState<string | null>(event?.leadId ?? null);
  const [contactId, setContactId] = useState<string | null>(event?.contactId ?? null);
  const [dealId, setDealId] = useState<string | null>(event?.dealId ?? null);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);

  const [attendees, setAttendees] = useState<string[]>(event?.attendees ?? []);
  const [attendeeDraft, setAttendeeDraft] = useState('');
  const [color, setColor] = useState<string>(event?.color ?? COLOR_PRESETS[0]!.value);

  useEffect(() => {
    setLinkSearch('');
    setLinkOpen(false);
  }, [linkType]);

  const leadsQ = useQuery({
    queryKey: ['events-link-leads', linkSearch],
    queryFn: () =>
      api.get<{ leads: LeadDTO[] }>(
        `/api/leads?${new URLSearchParams({ q: linkSearch, limit: '10' }).toString()}`,
      ),
    enabled: linkType === 'lead' && linkOpen,
  });
  const contactsQ = useQuery({
    queryKey: ['events-link-contacts', linkSearch],
    queryFn: () =>
      api.get<{ contacts: ContactDTO[] }>(
        `/api/contacts?${new URLSearchParams({ q: linkSearch, limit: '10' }).toString()}`,
      ),
    enabled: linkType === 'contact' && linkOpen,
  });
  const dealsQ = useQuery({
    queryKey: ['events-link-deals'],
    queryFn: () => api.get<{ deals: DealDTO[] }>(`/api/deals?limit=20`),
    enabled: linkType === 'deal' && linkOpen,
  });

  const selectedLeadQ = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => api.get<{ lead: LeadDTO }>(`/api/leads/${leadId}`),
    enabled: !!leadId && linkType === 'lead',
  });
  const selectedContactQ = useQuery({
    queryKey: ['contact', contactId],
    queryFn: () => api.get<{ contact: ContactDTO }>(`/api/contacts/${contactId}`),
    enabled: !!contactId && linkType === 'contact',
  });
  const selectedDealQ = useQuery({
    queryKey: ['deal', dealId],
    queryFn: () => api.get<{ deal: DealDTO }>(`/api/deals/${dealId}`),
    enabled: !!dealId && linkType === 'deal',
  });

  function addAttendee() {
    const v = attendeeDraft.trim();
    if (!v) return;
    if (attendees.includes(v)) {
      setAttendeeDraft('');
      return;
    }
    setAttendees([...attendees, v]);
    setAttendeeDraft('');
  }

  const save = useMutation({
    mutationFn: async () => {
      const s = fromInputLocal(start);
      const e = fromInputLocal(end);
      if (!title.trim()) throw new Error('El título es obligatorio');
      if (!(s.getTime() < e.getTime())) throw new Error('El fin debe ser posterior al inicio');

      const payload = {
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        start: s.toISOString(),
        end: e.toISOString(),
        leadId: linkType === 'lead' ? leadId : null,
        contactId: linkType === 'contact' ? contactId : null,
        dealId: linkType === 'deal' ? dealId : null,
        attendees,
        color,
      };

      if (isEdit) {
        return api.patch<{ event: EventDTO }>(`/api/events/${event!.id}`, {
          ...payload,
          status,
        });
      }
      return api.post<{ event: EventDTO }>('/api/events', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] });
      toast.success(isEdit ? 'Evento actualizado' : 'Evento creado');
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/api/events/${event!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] });
      toast.success('Evento cancelado');
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-bg-soft p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isEdit ? 'Editar evento' : 'Nuevo evento'}
          </h2>
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
              placeholder="Ej: Reunión con cliente"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-text-dim">Descripción</label>
            <textarea
              className="input w-full"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notas, agenda, links…"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-text-dim">Inicio</label>
              <input
                type="datetime-local"
                className="input w-full"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  // Auto-adjust end to be start + 30min if end <= start.
                  try {
                    const s = fromInputLocal(e.target.value);
                    const cur = fromInputLocal(end);
                    if (!(s.getTime() < cur.getTime())) {
                      setEnd(toInputLocal(new Date(s.getTime() + 30 * 60_000)));
                    }
                  } catch {
                    /* ignore */
                  }
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-dim">Fin</label>
              <input
                type="datetime-local"
                className="input w-full"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          {isEdit && (
            <div>
              <label className="mb-1 block text-xs text-text-dim">Estado</label>
              <select
                className="input w-full"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'confirmed' | 'canceled')}
              >
                <option value="confirmed">Confirmado</option>
                <option value="canceled">Cancelado</option>
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-text-dim">Asociar a</label>
            <div className="mb-2 flex flex-wrap gap-2 text-xs">
              {(['none', 'lead', 'contact', 'deal'] as LinkType[]).map((t) => (
                <label
                  key={t}
                  className={`cursor-pointer rounded-full border px-3 py-1 ${
                    linkType === t
                      ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                      : 'border-border text-text-dim hover:bg-bg/40'
                  }`}
                >
                  <input
                    type="radio"
                    className="hidden"
                    name="linkType"
                    checked={linkType === t}
                    onChange={() => setLinkType(t)}
                  />
                  {t === 'none' && 'Ninguno'}
                  {t === 'lead' && 'Lead'}
                  {t === 'contact' && 'Contacto'}
                  {t === 'deal' && 'Deal'}
                </label>
              ))}
            </div>

            {linkType === 'lead' && (
              <LinkPicker
                label="lead"
                selectedLabel={selectedLeadQ.data?.lead.name ?? selectedLeadQ.data?.lead.phone ?? null}
                selectedId={leadId}
                onClear={() => setLeadId(null)}
                onOpen={() => setLinkOpen(true)}
                search={linkSearch}
                setSearch={setLinkSearch}
                open={linkOpen}
                onPick={(id, label) => {
                  setLeadId(id);
                  setLinkOpen(false);
                  setLinkSearch('');
                  void label;
                }}
                items={
                  leadsQ.data?.leads.map((l) => ({
                    id: l.id,
                    label: l.name ?? l.phone,
                    sub: l.phone ?? '',
                  })) ?? []
                }
              />
            )}

            {linkType === 'contact' && (
              <LinkPicker
                label="contacto"
                selectedLabel={selectedContactQ.data?.contact.name ?? null}
                selectedId={contactId}
                onClear={() => setContactId(null)}
                onOpen={() => setLinkOpen(true)}
                search={linkSearch}
                setSearch={setLinkSearch}
                open={linkOpen}
                onPick={(id) => {
                  setContactId(id);
                  setLinkOpen(false);
                  setLinkSearch('');
                }}
                items={
                  contactsQ.data?.contacts.map((c) => ({
                    id: c.id,
                    label: c.name,
                    sub: c.phone ?? '',
                  })) ?? []
                }
              />
            )}

            {linkType === 'deal' && (
              <LinkPicker
                label="deal"
                selectedLabel={selectedDealQ.data?.deal.title ?? null}
                selectedId={dealId}
                onClear={() => setDealId(null)}
                onOpen={() => setLinkOpen(true)}
                search={linkSearch}
                setSearch={setLinkSearch}
                open={linkOpen}
                onPick={(id) => {
                  setDealId(id);
                  setLinkOpen(false);
                  setLinkSearch('');
                }}
                items={
                  dealsQ.data?.deals
                    .filter((d) =>
                      !linkSearch
                        ? true
                        : d.title.toLowerCase().includes(linkSearch.toLowerCase()),
                    )
                    .map((d) => ({
                      id: d.id,
                      label: d.title,
                      sub: `${d.value} ${d.currency}`,
                    })) ?? []
                }
              />
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-text-dim">Invitados</label>
            <div className="mb-1 flex flex-wrap gap-1">
              {attendees.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 rounded-full bg-bg/40 px-2 py-1 text-xs"
                >
                  {a}
                  <button
                    type="button"
                    onClick={() => setAttendees(attendees.filter((x) => x !== a))}
                    className="text-text-dim hover:text-red-400"
                    aria-label={`Quitar ${a}`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="input w-full"
                placeholder="Email o nombre y Enter"
                value={attendeeDraft}
                onChange={(e) => setAttendeeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addAttendee();
                  }
                }}
              />
              <button type="button" onClick={addAttendee} className="btn-outline whitespace-nowrap">
                Agregar
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-text-dim">Color</label>
            <div className="flex gap-2">
              {COLOR_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.value}
                  onClick={() => setColor(p.value)}
                  className={`h-7 w-7 rounded-full border-2 transition ${
                    color === p.value ? 'border-white' : 'border-transparent opacity-70'
                  }`}
                  style={{ backgroundColor: p.value }}
                  title={p.label}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          {isEdit ? (
            <button
              onClick={() => {
                if (confirm('¿Cancelar este evento?')) remove.mutate();
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
              disabled={save.isPending || !title.trim()}
            >
              {isEdit ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface LinkPickerProps {
  label: string;
  selectedId: string | null;
  selectedLabel: string | null;
  onClear: () => void;
  onOpen: () => void;
  open: boolean;
  search: string;
  setSearch: (v: string) => void;
  items: Array<{ id: string; label: string; sub: string }>;
  onPick: (id: string, label: string) => void;
}

function LinkPicker({
  label,
  selectedId,
  selectedLabel,
  onClear,
  onOpen,
  open,
  search,
  setSearch,
  items,
  onPick,
}: LinkPickerProps) {
  if (selectedId && selectedLabel) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border bg-bg/40 px-3 py-2 text-sm">
        <span>{selectedLabel}</span>
        <button onClick={onClear} className="text-xs text-text-dim hover:text-red-400">
          Quitar
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        className="input w-full"
        placeholder={`Buscar ${label}…`}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          onOpen();
        }}
        onFocus={onOpen}
      />
      {open && items.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-bg-soft shadow-xl">
          {items.map((it) => (
            <li
              key={it.id}
              onClick={() => onPick(it.id, it.label)}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-bg/50"
            >
              <div>{it.label}</div>
              {it.sub && <div className="font-mono text-[10px] text-text-faint">{it.sub}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
