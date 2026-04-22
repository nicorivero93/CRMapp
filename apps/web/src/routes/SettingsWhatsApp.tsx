import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, MessageCircle, AlertTriangle, Send, Check, BookOpen, ExternalLink } from 'lucide-react';
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

          <SetupGuide webhookUrl={s.webhookUrl} />

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

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-brand-400 hover:underline"
    >
      {children}
      <ExternalLink size={11} />
    </a>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-md border border-border bg-bg/40 p-3 pl-10">
      <div className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-brand-500/20 text-xs font-semibold text-brand-400">
        {n}
      </div>
      <div className="mb-1 text-sm font-medium">{title}</div>
      <div className="space-y-1 text-xs text-text-dim">{children}</div>
    </div>
  );
}

function SetupGuide({ webhookUrl }: { webhookUrl: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-border bg-bg-soft">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15 text-brand-400">
            <BookOpen size={16} />
          </div>
          <div>
            <div className="text-sm font-medium">Cómo obtener las credenciales de Meta</div>
            <div className="text-xs text-text-dim">
              Guía paso a paso — abrí esto antes de completar el form de abajo.
            </div>
          </div>
        </div>
        <span className="text-xs text-text-faint">{open ? 'Cerrar ▲' : 'Abrir ▼'}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border p-4">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <div className="mb-1 font-medium">Antes de arrancar:</div>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                La aprobación inicial de Meta tarda <b>1 a 2 semanas</b>. Planeá con tiempo.
              </li>
              <li>
                Necesitás un <b>número de teléfono nuevo</b>, no el mismo de tu WhatsApp personal.
              </li>
              <li>
                El server donde corre MyCRM necesita ser <b>accesible desde internet</b>{' '}
                (URL pública). Abajo explicamos cómo.
              </li>
              <li>
                Costos Argentina 2026: conversaciones <b>service</b> (lead escribe primero, ventana
                24 h) → <b>gratis</b>. Marketing (template) → ~0.05 USD/conversación.
              </li>
            </ul>
          </div>

          <Step n={1} title="Crear la WhatsApp Business Account (WABA)">
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                Entrá a{' '}
                <ExtLink href="https://business.facebook.com/">business.facebook.com</ExtLink> y
                logueate con la cuenta de Facebook que va a administrar.
              </li>
              <li>
                Configuración del negocio → Cuentas → <b>Cuentas de WhatsApp</b> → Agregar.
              </li>
              <li>
                Registrás un <b>número nuevo</b> (Meta manda SMS/llamada para verificar).
              </li>
              <li>
                Agregás método de pago (tarjeta). Sólo se cobra por mensajes facturables.
              </li>
            </ol>
          </Step>

          <Step n={2} title="Crear la App en Meta for Developers">
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                Entrá a{' '}
                <ExtLink href="https://developers.facebook.com/apps">
                  developers.facebook.com/apps
                </ExtLink>{' '}
                → Create App → tipo <b>Business</b>.
              </li>
              <li>Asociás la app con tu WABA del paso 1.</li>
              <li>En el sidebar agregás el producto <b>WhatsApp</b>.</li>
              <li>
                En la sección WhatsApp vas a ver arriba los valores que necesitás:
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>
                    <code className="text-text">phone_number_id</code> — lo copiás y pegás en el
                    campo <b>phoneNumberId</b> del form de abajo.
                  </li>
                  <li>
                    <code className="text-text">WhatsApp Business Account ID</code> → campo{' '}
                    <b>businessId</b>.
                  </li>
                </ul>
              </li>
            </ol>
          </Step>

          <Step n={3} title="Obtener un Access Token permanente">
            <p>
              Meta te da un token temporal (24 h) para probar. Para producción necesitás un{' '}
              <b>System User token sin expiración</b>:
            </p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                Meta Business → Configuración → Usuarios →{' '}
                <b>Usuarios del sistema</b> → Crear.
              </li>
              <li>
                Asignale tu app con permisos{' '}
                <code className="text-text">whatsapp_business_messaging</code> +{' '}
                <code className="text-text">whatsapp_business_management</code>.
              </li>
              <li>
                Generá un token <b>sin expiración</b>.
              </li>
              <li>
                Copiás ese valor y lo pegás en el campo <b>accessToken</b> del form.
              </li>
            </ol>
          </Step>

          <Step n={4} title="Exponer el server a internet (webhook)">
            <p>
              Meta necesita hacer POST a tu server cuando llega un mensaje. Tu server corre en
              localhost, así que necesitás un "túnel" que le dé una URL pública. Recomendadas:
            </p>
            <div className="mt-2 space-y-2">
              <div className="rounded border border-border bg-bg/40 p-2">
                <div className="mb-1 font-medium text-text">
                  Cloudflare Tunnel (gratis, recomendado)
                </div>
                <ol className="list-decimal space-y-0.5 pl-4">
                  <li>Necesitás un dominio (~USD 10/año o gratis con Cloudflare Zero Trust).</li>
                  <li>
                    <ExtLink href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/">
                      Instalar cloudflared
                    </ExtLink>{' '}
                    (<code>winget install Cloudflare.cloudflared</code>).
                  </li>
                  <li>
                    <code className="text-text">cloudflared tunnel login</code>
                  </li>
                  <li>
                    <code className="text-text">cloudflared tunnel create mycrm</code>
                  </li>
                  <li>
                    <code className="text-text">
                      cloudflared tunnel route dns mycrm mycrm.tudominio.com
                    </code>
                  </li>
                  <li>
                    <code className="text-text">
                      cloudflared tunnel run mycrm --url http://localhost:3180
                    </code>
                  </li>
                </ol>
              </div>
              <div className="rounded border border-border bg-bg/40 p-2">
                <div className="mb-1 font-medium text-text">ngrok (rápido para probar)</div>
                <ol className="list-decimal space-y-0.5 pl-4">
                  <li>
                    <ExtLink href="https://ngrok.com/download">Bajar ngrok</ExtLink> y crear cuenta.
                  </li>
                  <li>
                    <code className="text-text">ngrok http 3180</code> → te da una URL{' '}
                    <code>https://xxxx.ngrok-free.app</code>.
                  </li>
                  <li>
                    En plan gratis la URL cambia cada vez que reiniciás ngrok (mala para producción,
                    OK para probar).
                  </li>
                </ol>
              </div>
              <div className="rounded border border-border bg-bg/40 p-2">
                <div className="mb-1 font-medium text-text">Tailscale Funnel (alternativa)</div>
                <div>
                  Similar a Cloudflare pero sin dominio propio —{' '}
                  <ExtLink href="https://tailscale.com/kb/1223/funnel">docs</ExtLink>.
                </div>
              </div>
            </div>
          </Step>

          <Step n={5} title="Configurar el webhook en Meta">
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                Inventá un <b>verify token</b>: cualquier string secreta (ej.{' '}
                <code className="text-text">mycrm-verify-xyz123</code>). Copiala en el campo{' '}
                <b>webhookVerifyToken</b> del form de abajo.
              </li>
              <li>
                En Meta → app → WhatsApp → Configuration → Webhooks → <b>Edit</b>:
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>
                    Callback URL:{' '}
                    <code className="break-all text-text">
                      {webhookUrl || 'https://TU-DOMINIO-PUBLICO/api/whatsapp/webhook'}
                    </code>
                  </li>
                  <li>Verify token: el mismo string de arriba.</li>
                  <li>
                    Fields: subscribí <b>messages</b>.
                  </li>
                </ul>
              </li>
              <li>
                Meta te hace un GET con el token → MyCRM lo compara y devuelve OK. Si pasa, queda
                verificado.
              </li>
            </ol>
          </Step>

          <Step n={6} title="Activar Meta Cloud en MyCRM">
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                Completá los 4 campos del form de abajo (Guardar credenciales).
              </li>
              <li>
                Una vez que aparece el check verde "Config completa", en la card{' '}
                <b>"Canal activo"</b> (arriba) clickeás <b>"Meta Cloud API"</b>.
              </li>
              <li>
                Probá el envío real desde la sección <b>"Probar envío"</b> — mandate un mensaje a
                tu propio celular para validar.
              </li>
              <li>
                A partir de ese momento, cada click en "WhatsApp" dentro de un lead envía vía Meta
                Cloud y las respuestas se registran solas en el timeline.
              </li>
            </ol>
          </Step>

          <div className="rounded-md border border-border bg-bg/40 p-3 text-xs text-text-dim">
            <div className="mb-1 font-medium text-text">Templates (opcional, avanzado)</div>
            Fuera de la ventana de 24 h, Meta sólo permite mensajes con <b>templates aprobados</b>.
            Esta versión de MyCRM envía siempre como "texto libre" — funciona bien dentro de la
            ventana pero falla si intentás iniciar una conversación. Cuando necesites templates
            (marketing outbound), pasame el caso y lo agregamos.
          </div>
        </div>
      )}
    </section>
  );
}
