import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, MessageCircle, AlertTriangle, Send, Check } from 'lucide-react';
import type { WhatsAppChannelKind, WhatsAppSettingsDTO } from '@mycrm/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const CHANNEL_LABELS: Record<WhatsAppChannelKind, string> = {
  manual: 'Manual (wa.me links, default)',
  'meta-cloud': 'Meta Cloud API (envío automático)',
};

const CHANNEL_DESCRIPTIONS: Record<WhatsAppChannelKind, string> = {
  manual:
    'La vendedora hace click y se abre WhatsApp Web o la app con el mensaje pre-armado. El CRM sólo registra que se abrió.',
  'meta-cloud':
    'Envío por API oficial de Meta Business. Registra respuestas automáticamente vía webhook. Requiere URL pública y costos por conversación marketing.',
};

interface TestState {
  to: string;
  body: string;
}

export default function SettingsWhatsApp() {
  const { user } = useAuth();
  const qc = useQueryClient();
  if (user && user.role !== 'owner') return <Navigate to="/app/settings" replace />;

  const { data, isLoading } = useQuery({
    queryKey: ['settings-whatsapp'],
    queryFn: () => api.get<{ settings: WhatsAppSettingsDTO }>('/api/settings/whatsapp'),
  });

  const s = data?.settings;

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<{ settings: WhatsAppSettingsDTO }>('/api/settings/whatsapp', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-whatsapp'] });
      toast.success('Config actualizada');
    },
    onError: (err: any) => toast.error(err.message ?? 'Error al actualizar'),
  });

  const testSend = useMutation({
    mutationFn: (t: TestState) => api.post<{ ok: boolean; providerMessageId: string }>(
      '/api/settings/whatsapp/test-send',
      t,
    ),
    onSuccess: (r) => toast.success(`Test enviado. id=${r.providerMessageId.slice(0, 16)}…`),
    onError: (err: any) => toast.error(err.message ?? 'Error al enviar test'),
  });

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link
          to="/app/settings"
          className="inline-flex items-center gap-1 text-sm text-text-dim hover:text-text"
        >
          <ArrowLeft size={14} /> Volver a configuración
        </Link>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <MessageCircle size={20} className="text-brand-400" /> WhatsApp
        </h1>
        <p className="text-sm text-text-dim">
          Cómo envía el CRM los mensajes: link manual o API oficial de Meta.
        </p>
      </div>

      {isLoading && <div className="text-sm text-text-dim">Cargando…</div>}

      {s && (
        <>
          <section className="rounded-lg border border-border bg-bg-soft p-4">
            <h2 className="mb-3 text-sm font-semibold text-text-dim">Canal activo</h2>
            <div className="space-y-2">
              {(Object.keys(CHANNEL_LABELS) as WhatsAppChannelKind[]).map((k) => (
                <label
                  key={k}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                    s.channel === k
                      ? 'border-brand-500/50 bg-brand-500/5'
                      : 'border-border hover:bg-bg-hover'
                  }`}
                >
                  <input
                    type="radio"
                    name="channel"
                    checked={s.channel === k}
                    onChange={() => patch.mutate({ channel: k })}
                    disabled={patch.isPending || (k === 'meta-cloud' && !s.meta.configured)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{CHANNEL_LABELS[k]}</div>
                    <div className="text-xs text-text-dim">{CHANNEL_DESCRIPTIONS[k]}</div>
                    {k === 'meta-cloud' && !s.meta.configured && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-amber-400">
                        <AlertTriangle size={11} /> Completá la config de abajo primero.
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </section>

          <MetaConfigForm
            current={s}
            onSave={(meta) => patch.mutate({ meta })}
            saving={patch.isPending}
          />

          <WebhookPanel url={s.webhookUrl} />

          {s.meta.configured && (
            <TestSendPanel onSend={(t) => testSend.mutate(t)} sending={testSend.isPending} />
          )}
        </>
      )}
    </div>
  );
}

function MetaConfigForm({
  current,
  onSave,
  saving,
}: {
  current: WhatsAppSettingsDTO;
  onSave: (meta: Record<string, string>) => void;
  saving: boolean;
}) {
  const [phoneNumberId, setPhoneNumberId] = useState(current.meta.phoneNumberId ?? '');
  const [businessId, setBusinessId] = useState(current.meta.businessId ?? '');
  const [accessToken, setAccessToken] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, string> = {};
    if (phoneNumberId !== (current.meta.phoneNumberId ?? '')) payload.phoneNumberId = phoneNumberId;
    if (businessId !== (current.meta.businessId ?? '')) payload.businessId = businessId;
    if (accessToken) payload.accessToken = accessToken;
    if (webhookVerifyToken) payload.webhookVerifyToken = webhookVerifyToken;
    if (Object.keys(payload).length === 0) return;
    onSave(payload);
    setAccessToken('');
    setWebhookVerifyToken('');
  }

  return (
    <section className="rounded-lg border border-border bg-bg-soft p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-dim">Credenciales Meta Business</h2>
      <p className="mb-3 text-xs text-text-dim">
        Sacá estos valores del <span className="font-mono">Meta Business Suite →</span> tu app de WhatsApp.
        Los campos <code>accessToken</code> y <code>webhookVerifyToken</code> se guardan encriptados
        y nunca se muestran de vuelta.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Field
          label="phoneNumberId"
          value={phoneNumberId}
          onChange={setPhoneNumberId}
          hint="Número WA Business → perfil → ID"
        />
        <Field
          label="businessId"
          value={businessId}
          onChange={setBusinessId}
          hint="WhatsApp Business Account ID"
        />
        <Field
          label="accessToken"
          value={accessToken}
          onChange={setAccessToken}
          password
          placeholder={
            current.meta.hasAccessToken ? '●●●●●●●● (cargado, dejá vacío para no cambiar)' : 'EAAG...'
          }
          hint="System user access token con permiso whatsapp_business_messaging"
        />
        <Field
          label="webhookVerifyToken"
          value={webhookVerifyToken}
          onChange={setWebhookVerifyToken}
          password
          placeholder={
            current.meta.hasWebhookVerifyToken ? '●●●●●●●● (cargado)' : 'cualquier string secreto'
          }
          hint="Inventado por vos. Lo ponés acá y en la config del webhook en Meta."
        />
        <button className="btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar credenciales'}
        </button>
      </form>

      {current.meta.configured && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-400">
          <Check size={12} /> Config completa. Podés activar "Meta Cloud API" arriba.
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  password,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  password?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-mono text-text-faint">{label}</label>
      <input
        type={password ? 'password' : 'text'}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {hint && <div className="mt-1 text-[11px] text-text-faint">{hint}</div>}
    </div>
  );
}

function WebhookPanel({ url }: { url: string }) {
  return (
    <section className="rounded-lg border border-border bg-bg-soft p-4">
      <h2 className="mb-2 text-sm font-semibold text-text-dim">Webhook</h2>
      <p className="mb-3 text-xs text-text-dim">
        Configurá esto en <span className="font-mono">Meta → WhatsApp → Configuration → Webhook</span>:
      </p>
      <div className="rounded-md border border-border bg-bg/40 p-2 font-mono text-xs">
        <div>
          <span className="text-text-faint">URL de callback: </span>
          <span className="text-brand-400">{url}</span>
        </div>
        <div className="mt-1">
          <span className="text-text-faint">Verify token: </span>
          <span>el que cargaste en webhookVerifyToken</span>
        </div>
        <div className="mt-1">
          <span className="text-text-faint">Campos a suscribirse: </span>
          <span>messages</span>
        </div>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-400">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <div>
          Meta necesita que <span className="font-mono">{url}</span> sea público. Si tu server está
          en LAN, usá <b>Cloudflare Tunnel</b> (gratis) o <b>ngrok</b> para exponerlo. Ver{' '}
          <code>docs/meta-cloud-setup.md</code>.
        </div>
      </div>
    </section>
  );
}

function TestSendPanel({
  onSend,
  sending,
}: {
  onSend: (t: TestState) => void;
  sending: boolean;
}) {
  const [to, setTo] = useState('');
  const [body, setBody] = useState('Probando MyCRM 🚀');

  return (
    <section className="rounded-lg border border-border bg-bg-soft p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-dim">Probar envío</h2>
      <p className="mb-3 text-xs text-text-dim">
        Mandate un mensaje a vos mismo (al número que usaste para registrar la app Meta) para
        validar que las credenciales funcionan.
      </p>
      <div className="space-y-2">
        <input
          className="input font-mono"
          placeholder="+5491122334455 (tu celular)"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <textarea
          className="input min-h-[70px] text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          className="btn-primary"
          disabled={!to || !body || sending}
          onClick={() => onSend({ to, body })}
        >
          <Send size={14} /> {sending ? 'Enviando…' : 'Enviar test'}
        </button>
      </div>
    </section>
  );
}
