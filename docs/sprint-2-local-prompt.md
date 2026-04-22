# Sprint 2 — MyCRM Local Edition (self-hosted, sin Firebase)

> **Cómo usar este doc**: es un prompt completo, self-contained, paste-ready para Claude Code. Incluye contexto del cliente, arquitectura, stack, modelo de datos, plan de entrega y el prompt literal al final. La versión Cloud (Firebase) vive en `sprint-2-prompt.md`; esta es la variante **self-hosted**.

---

## 1. Contexto del producto

**MyCRM** tiene dos ediciones:

- **Cloud Edition** (rama `main` del repo, este codebase actual): multi-tenant SaaS en Firebase. Stack: React + TS + Firestore + Cloud Functions + Auth custom claims.
- **Local Edition** (esta variante, rama nueva `local`): **instalación por cliente en sus propias PCs, sin Firebase, sin cloud**. Cada empresa cliente tiene su propia instancia corriendo en una PC de su oficina. Todas las vendedoras de esa empresa se conectan por LAN.

Las dos ediciones **comparten el mismo frontend React** — lo que cambia es la capa de backend y el modelo de deployment. El feature set funcional es idéntico al de `sprint-2-prompt.md`.

---

## 2. Brief del cliente (paráfrasis de nota de voz del 2026-04-20)

Empresa mayorista. Hoy trabajan así:

- Una persona copia y pega leads de **Instagram, Facebook y TikTok** en un Excel de Google compartido.
- **3 vendedoras** tocan la misma planilla, marcan manualmente si contactaron o no.
- **Problema 1**: distribución despareja (30–50 vs 15 leads por vendedora).
- **Problema 2**: múltiples líneas de WhatsApp por vendedora porque WhatsApp les restringe las líneas por volumen. Cambian chips/celulares mid-shift. En hot sale suman más.
- **Problema 3**: leads no-contactados se pierden. Quieren reciclaje automático tras N días.
- **Problema 4**: datos históricos del 2024 se usan. No deben borrarse.
- **Canal primario**: WhatsApp personal de cada vendedora.
- **"No queremos cole, queremos atención por WhatsApp"**: 1-a-1 con el lead, no call center centralizado.

Transcripción completa: `docs/client-voice-note.md`.

### Por qué este cliente encaja mejor con Local Edition

- No tienen equipo técnico → quieren "que funcione" sin configurar cuentas cloud.
- Datos sensibles de clientes → prefieren que vivan en su oficina.
- Presupuesto ajustado → "no es una empresa que gastan fortunas" (textual del audio).
- No necesitan acceso remoto desde casa (al menos en v1) → LAN alcanza.

---

## 3. Arquitectura

### Modelo de deployment

```
┌─────────────────────────────────────────────┐
│  PC HOST (oficina del cliente)              │
│  ┌──────────────────────────────────────┐   │
│  │  MyCRM Server (Windows Service)      │   │
│  │  - Node.js 20 + Fastify              │   │
│  │  - SQLite (WAL mode)                 │   │
│  │  - WhatsApp Cloud API client (opt)   │   │
│  │  - Schedulers (recycling, cron)      │   │
│  │  Escuchando en :3180                 │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
           ▲           ▲           ▲
           │           │           │  LAN (HTTP/SSE)
           │           │           │
  ┌────────┴──┐ ┌──────┴────┐ ┌────┴──────┐
  │ Vendedora1│ │Vendedora2 │ │ Vendedora3│
  │ Tauri app │ │Tauri app  │ │ Tauri app │
  │ o browser │ │o browser  │ │ o browser │
  └───────────┘ └───────────┘ └───────────┘
```

### Piezas

| Capa | Tecnología | Por qué |
|---|---|---|
| Backend | **Node.js 20 + Fastify 5** | Liviano, tipado, 2-3× más rápido que Express. |
| ORM | **Drizzle** | TypeScript-first, migrations versionadas, tipos compartidos con el front. |
| DB | **SQLite via better-sqlite3 + WAL mode** | Un archivo, zero-config, soporta 10+ usuarios concurrentes sin problemas. |
| Realtime | **Server-Sent Events (SSE)** | Más simple que Socket.io para este caso (1-way server→cliente), compatible con proxies. |
| Auth | **Lucia Auth + argon2** | Sesión en DB, sin dependencias cloud, cookies HttpOnly. |
| Desktop wrapper | **Tauri 2** | 10 MB vs Electron 100 MB+, Rust-based, auto-update built-in. |
| Packaging | **tauri-bundler** genera `.msi` / `.dmg` / `.deb` / `.AppImage` | Un comando, un instalador por plataforma. |
| Logs | **pino** | Fast structured logging. |
| Validación | **Zod** | Compartido con el front. |

### Puertos y acceso

- Backend HTTP: `http://<host-ip>:3180`
- Backend SSE: `http://<host-ip>:3180/api/stream`
- Acceso por hostname mDNS: `http://mycrm.local:3180` (resuelve dentro de la LAN en macOS/Linux/Windows 10+)
- Para acceso remoto (fuera de la oficina): recomendar **Tailscale** — docs aparte, sin código nuestro.

### Multi-tenant por instalación, NO por team

En la Cloud Edition hay `teamId` en cada doc. En la Local Edition **una instalación = un cliente**. Cada empresa corre su propia instancia, sus datos nunca se mezclan porque físicamente están en otra DB. Esto simplifica todo el schema.

---

## 4. Modelo de datos (SQLite + Drizzle)

Archivo `packages/db/schema.ts`:

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),            // cuid2
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['owner', 'sales', 'viewer'] }).notNull().default('sales'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  dailyLeadTarget: integer('daily_lead_target').notNull().default(30),
  activeLineId: text('active_line_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({ userIdIdx: index('sessions_user_id').on(t.userId) }));

export const whatsappLines = sqliteTable('whatsapp_lines', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  phone: text('phone').notNull(),          // E.164
  label: text('label'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  dailyCapMessages: integer('daily_cap_messages').notNull().default(250),
  dailyCount: integer('daily_count').notNull().default(0),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  restrictedAt: integer('restricted_at', { mode: 'timestamp' }),
});

export const leads = sqliteTable('leads', {
  id: text('id').primaryKey(),
  name: text('name'),
  phone: text('phone').notNull(),
  phoneNormalized: text('phone_normalized').notNull(),
  source: text('source', {
    enum: ['instagram', 'facebook', 'tiktok', 'meta-lead-ads', 'public-form',
           'csv-import', 'sheets-import', 'excel-import', 'manual', 'bulk-paste', 'whatsapp-inbound']
  }).notNull(),
  sourceMeta: text('source_meta', { mode: 'json' }),
  importBatchId: text('import_batch_id'),
  status: text('status', {
    enum: ['new', 'assigned', 'contacted', 'responded', 'qualified',
           'converted', 'no-response', 'recycled', 'discarded']
  }).notNull().default('new'),
  assignedTo: text('assigned_to').references(() => users.id),
  assignedAt: integer('assigned_at', { mode: 'timestamp' }),
  firstContactAt: integer('first_contact_at', { mode: 'timestamp' }),
  lastContactAt: integer('last_contact_at', { mode: 'timestamp' }),
  responseCount: integer('response_count').notNull().default(0),
  noResponseCount: integer('no_response_count').notNull().default(0),
  recycledCount: integer('recycled_count').notNull().default(0),
  lastRecycledAt: integer('last_recycled_at', { mode: 'timestamp' }),
  convertedContactId: text('converted_contact_id'),
  convertedDealId: text('converted_deal_id'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  createdBy: text('created_by').notNull(),
}, (t) => ({
  phoneNormIdx: index('leads_phone_norm').on(t.phoneNormalized),
  statusAssignedIdx: index('leads_status_assigned').on(t.status, t.assignedTo),
  lastContactIdx: index('leads_last_contact').on(t.lastContactAt),
  sourceIdx: index('leads_source_created').on(t.source, t.createdAt),
}));

export const leadEvents = sqliteTable('lead_events', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  at: integer('at', { mode: 'timestamp' }).notNull(),
  type: text('type', {
    enum: ['imported', 'assigned', 'wa-opened', 'message-sent', 'response-received',
           'status-changed', 'recycled', 'note-added', 'converted']
  }).notNull(),
  byUserId: text('by_user_id'),           // null = system
  meta: text('meta', { mode: 'json' }),
}, (t) => ({ leadAtIdx: index('events_lead_at').on(t.leadId, t.at) }));

export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').references(() => leads.id),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  company: text('company'),
  industry: text('industry'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  ownerId: text('owner_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const deals = sqliteTable('deals', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').references(() => contacts.id),
  leadId: text('lead_id').references(() => leads.id),
  title: text('title').notNull(),
  value: integer('value').notNull().default(0),
  currency: text('currency').notNull().default('ARS'),
  stageId: text('stage_id').notNull(),
  ownerId: text('owner_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  closedAt: integer('closed_at', { mode: 'timestamp' }),
});

export const stages = sqliteTable('stages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  order: integer('order').notNull(),
  color: text('color'),
  isClosedWon: integer('is_closed_won', { mode: 'boolean' }).notNull().default(false),
});

export const importBatches = sqliteTable('import_batches', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  fileName: text('file_name'),
  totalRows: integer('total_rows').notNull(),
  imported: integer('imported').notNull(),
  deduped: integer('deduped').notNull(),
  errors: integer('errors').notNull(),
  errorsSample: text('errors_sample', { mode: 'json' }).$type<string[]>(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const recyclingRules = sqliteTable('recycling_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  statusIn: text('status_in', { mode: 'json' }).$type<string[]>().notNull(),
  daysSinceLastContact: integer('days_since_last_contact').notNull(),
  action: text('action', {
    enum: ['return-to-pool', 'reassign-to-different-user', 'escalate-to-owner']
  }).notNull(),
  maxRecyclesPerLead: integer('max_recycles_per_lead').notNull().default(3),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const messageTemplates = sqliteTable('message_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  body: text('body').notNull(),          // soporta {{name}} y otras variables
  category: text('category'),            // "primer contacto", "reengagement", etc.
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
});
```

Settings guardados en `appSettings`:
- `assignmentMode`: `'round-robin' | 'capacity-weighted' | 'manual-only'`
- `defaultRecyclingDays`: número
- `timezone`: string (default `America/Argentina/Buenos_Aires`)
- `whatsappChannel`: `'manual' | 'meta-cloud'`
- `metaCloudConfig`: `{ phoneNumberId, accessToken, businessId }` (encriptado con clave del SO)

---

## 5. Estructura del monorepo

Mantener npm workspaces, agregar `apps/server` y `apps/desktop`:

```
CRMapp/
├── apps/
│   ├── web/               # React + Vite (existente, se adapta)
│   ├── server/            # NUEVO — Fastify + Drizzle + SQLite
│   │   ├── src/
│   │   │   ├── index.ts           # entry, crea server + registra rutas
│   │   │   ├── config.ts          # env, paths, ports
│   │   │   ├── db/
│   │   │   │   ├── client.ts      # better-sqlite3 instance
│   │   │   │   └── migrate.ts     # runs drizzle migrations on boot
│   │   │   ├── auth/
│   │   │   │   ├── lucia.ts
│   │   │   │   ├── routes.ts      # POST /auth/login, /logout, /signup-owner (one-shot)
│   │   │   │   └── middleware.ts
│   │   │   ├── leads/
│   │   │   │   ├── routes.ts
│   │   │   │   ├── ingestion.ts   # parsers CSV / Sheets / paste
│   │   │   │   ├── assignment.ts  # round-robin ponderado
│   │   │   │   └── recycling.ts
│   │   │   ├── whatsapp/
│   │   │   │   ├── channel.ts     # interface
│   │   │   │   ├── manual.ts      # impl para wa.me links
│   │   │   │   └── metaCloud.ts   # stub con TODOs + feature flag
│   │   │   ├── lines/
│   │   │   ├── deals/
│   │   │   ├── contacts/
│   │   │   ├── stream/            # SSE broadcaster
│   │   │   ├── scheduler/
│   │   │   │   ├── daily.ts       # reset lines count, run recycling
│   │   │   │   └── index.ts
│   │   │   └── lib/
│   │   │       ├── phone.ts       # normalize E.164
│   │   │       ├── crypto.ts      # encrypt secrets con key del SO
│   │   │       └── errors.ts
│   │   ├── drizzle/              # migrations generadas
│   │   ├── drizzle.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── desktop/          # NUEVO — Tauri wrapper
│       ├── src-tauri/
│       │   ├── src/main.rs       # inicia el sidecar server si no corre, abre webview
│       │   ├── Cargo.toml
│       │   ├── tauri.conf.json
│       │   └── build.rs
│       ├── package.json
│       └── scripts/
│           └── bundle-server.ts  # empaqueta apps/server como sidecar binario
├── packages/
│   ├── shared/           # tipos + Zod schemas (existente, se amplía)
│   └── db/               # NUEVO — drizzle schema compartido
│       ├── src/
│       │   ├── schema.ts
│       │   └── index.ts
│       └── package.json
├── installer/            # NUEVO — scripts de packaging
│   ├── windows/
│   │   ├── mycrm-server.nsi     # NSIS script que instala como Windows Service
│   │   └── service.xml          # definición del service (via winsw)
│   └── README.md
└── (resto del repo existente)
```

### Qué cambia en `apps/web/`

- `apps/web/src/lib/firebase.ts` → reemplazado por `apps/web/src/lib/api.ts` (fetch al backend local).
- `apps/web/src/lib/auth.tsx` → se adapta a cookie-session del server (sin Firebase Auth).
- `apps/web/src/lib/useCollection.ts` → se adapta a **Tanstack Query** + SSE para realtime.
- Todas las rutas y features siguen igual estructuralmente.

### Build target dual

El mismo código de `apps/web` se buildea una vez y se sirve tanto desde el server Fastify (endpoint `GET /`) como desde la app Tauri. El desktop es solo un "browser container" apuntando a `http://localhost:3180`.

---

## 6. API REST del backend

Todos los endpoints devuelven JSON, auth por cookie `sessionId`. Errores con status apropiado + body `{ error: string, code?: string }`.

### Auth
- `POST /api/auth/signup-owner` — solo se permite UNA vez, cuando la DB está vacía. Crea el primer user con role `owner`.
- `POST /api/auth/login` — email + password → setea cookie.
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Users
- `GET /api/users` — owner o sales ven a todos.
- `POST /api/users` — owner crea vendedoras (rol `sales` por default).
- `PATCH /api/users/:id` — owner actualiza roles/targets. User actualiza su propio `activeLineId`.
- `DELETE /api/users/:id` — owner.

### Leads
- `GET /api/leads` — query params: `?status=...&assignedTo=me&source=...&cursor=...`
- `GET /api/leads/:id` — incluye timeline.
- `POST /api/leads/import` — multipart: file + source metadata.
- `POST /api/leads/paste` — body: `{ text: string, source: string }`
- `POST /api/leads/:id/events` — registra evento manual (note, status-change).
- `PATCH /api/leads/:id` — update status, notes, assignment.
- `POST /api/leads/assign` — batch reassignment (owner only).
- `POST /api/leads/:id/convert` — lead → contact + deal.

### Lines
- `GET /api/lines` — scoped al user logueado (cada uno ve las suyas).
- `POST /api/lines`, `PATCH /api/lines/:id`, `DELETE /api/lines/:id`
- `POST /api/lines/:id/activate` — marca como activa y desactiva las otras del mismo user.

### Recycling
- `GET /api/recycling-rules`, `POST`, `PATCH`, `DELETE` (owner only)
- `POST /api/recycling/run-now` — ejecuta manualmente el ciclo (debug).

### Sources & Dashboard
- `GET /api/analytics/sources?from=...&to=...`
- `GET /api/analytics/dashboard` — KPIs del home.

### Stream (SSE)
- `GET /api/stream` — suscripción al feed de eventos. Filtra por permisos del user.
  - Eventos: `lead.created`, `lead.assigned`, `lead.updated`, `line.restricted`, etc.

### Settings (owner only)
- `GET /api/settings`, `PATCH /api/settings`

### Health
- `GET /api/health` — `{ status: 'ok', version: '...', db: 'ok', uptime: ... }`

---

## 7. Assignment engine

Idéntico al de la Cloud Edition pero implementado server-side en Node puro. Spec:

```ts
// apps/server/src/leads/assignment.ts
interface User {
  id: string;
  dailyLeadTarget: number;
  assignedToday: number;     // calculado on-the-fly contra leads
}

function roundRobinWeighted(users: User[], leadIds: string[]): Map<string, string[]> {
  // 1. Filtrar users con dailyTarget > 0 && assignedToday < dailyTarget && isActive && role in ['sales','owner']
  // 2. capacity[u] = dailyTarget - assignedToday
  // 3. Weighted round-robin: cada pasada reparte 1 lead al user con mayor capacity restante
  //    Tiebreak: menor assignedToday absoluto. Si empate, id lexicográfico.
  // 4. Parar cuando no hay más leads o nadie tiene capacity.
  //    Si quedan leads sin asignar, retornar { unassigned: [...ids] }.
  // 5. Para reciclaje: excluir el user previo del lead.
}
```

Tests unitarios obligatorios (Vitest):
- 3 users (50/30/15) + 95 leads → reparte 50/30/15 exacto.
- 3 users + 100 leads → reparte 50/30/15 y devuelve 5 `unassigned`.
- Empate capacity → orden determinístico.
- Capacity 0 → excluido.

---

## 8. Recycling engine

Cron diario (6:00 ART por default) ejecutado por `node-cron` dentro del proceso server.

```ts
// apps/server/src/leads/recycling.ts
async function runRecyclingCycle(now = new Date()): Promise<Report> {
  // 1. Leer appSettings.timezone
  // 2. Por cada recyclingRule enabled:
  //    a. Query leads where status in rule.statusIn AND lastContactAt < now - rule.days
  //    b. Para cada lead:
  //       - Si recycledCount >= rule.maxRecyclesPerLead → status='discarded', event, skip
  //       - Sino:
  //         rule.action === 'return-to-pool': unset assignedTo, status='recycled'
  //         rule.action === 'reassign-to-different-user': invocar assignment excluyendo prev
  //         rule.action === 'escalate-to-owner': assignedTo = owner
  //       - Incrementar recycledCount, lastRecycledAt=now
  //       - Registrar event 'recycled'
  // 3. Retornar report { evaluated, recycled, discarded }
}
```

Tests con `vi.useFakeTimers()` para simular el paso del tiempo.

---

## 9. WhatsApp channel abstraction

```ts
// apps/server/src/whatsapp/channel.ts
export interface WhatsAppChannel {
  // Abre / genera link. Para manual devuelve wa.me URL. Para MetaCloud envía mensaje real.
  send(params: { to: string; templateId?: string; body?: string; vars?: Record<string, string> }): Promise<SendResult>;
  // Listener de respuestas entrantes (solo MetaCloud). Manual = no-op.
  startInboundListener?(): Promise<void>;
}

// Impl por default: manual
export class ManualChannel implements WhatsAppChannel {
  async send({ to, body }) {
    return { type: 'link', url: `https://wa.me/${toDigits(to)}?text=${encodeURIComponent(body ?? '')}` };
  }
}

// Stub Meta Cloud API (sprint 2.6)
export class MetaCloudChannel implements WhatsAppChannel {
  constructor(private config: MetaCloudConfig) {}
  async send(params) { throw new Error('Not implemented yet'); }
  async startInboundListener() { /* webhook handler + ngrok/tunnel */ }
}
```

Selección vía `appSettings.whatsappChannel`. Default: `'manual'`.

**Cuando se habilite Meta Cloud**:
- Secrets encriptados en DB con clave derivada del OS keychain (Windows Credential Manager / macOS Keychain / libsecret).
- Webhook entrante requiere que el server sea accesible públicamente → docs recomendando Cloudflare Tunnel gratis.
- Costos: conversaciones marketing ~$0.05 USD/conv en AR. Service (iniciadas por cliente, ventana 24h) gratis.

---

## 10. Packaging y distribución

### Desktop (Tauri)

Cada vendedora instala la app Tauri en su PC. La app:
1. Al abrir, intenta conectar a `http://localhost:3180`.
2. Si no responde, pide el IP/hostname del server (ej. `192.168.0.50` o `mycrm.local`).
3. Guarda la config en el local del OS (`%APPDATA%/MyCRM/config.json` en Windows).
4. Una vez conectada, abre la webview con la UI.

Build: `npm run tauri build` → genera `.msi` (Win), `.dmg` (Mac), `.AppImage` (Linux).

### Server (instalador Windows)

Un `.msi` o `.exe` generado con NSIS que:
1. Copia el binario del server + sus dependencias a `C:\Program Files\MyCRM\`.
2. Copia `mycrm.db.template` a `C:\ProgramData\MyCRM\data\mycrm.db` (solo si no existe).
3. Instala el servicio Windows usando [WinSW](https://github.com/winsw/winsw) — corre como `Local Service` en boot.
4. Abre el puerto 3180 en el firewall de Windows.
5. Imprime el IP local + URL de signup en un README post-install.

Similar para macOS (`launchd` plist) y Linux (systemd unit).

### Bundling del backend como binario único

Usar **`@vercel/ncc`** o **`pkg`** (o Bun si querés experimentar) para compilar `apps/server` + node_modules en un único `.exe` de ~60 MB. Simplifica la instalación: sin dependencia de Node en la máquina cliente.

---

## 11. Primer run (onboarding)

1. Instala el server como Service → queda corriendo.
2. Instala la app desktop en la PC del dueño primero.
3. Abre la app → detecta DB vacía → muestra wizard:
   - Paso 1: crea el usuario owner (email + password).
   - Paso 2: setea timezone, horarios, moneda.
   - Paso 3: crea los stages del pipeline (defaults: Nuevo / Contactado / Propuesta / Ganado / Perdido).
   - Paso 4: crea 1-2 templates de mensaje WhatsApp.
4. Owner invita vendedoras: `/users/new` genera un link con token de un uso → se lo pasa por WA o email.
5. Cada vendedora usa ese link → crea su password → agrega sus líneas de WhatsApp.
6. Ready.

---

## 12. Plan de entrega por fases

### Fase L2.1 — Infra base y auth (2 sesiones)

- [ ] Crear `packages/db` con schema Drizzle.
- [ ] Crear `apps/server` con Fastify + better-sqlite3 + Lucia auth.
- [ ] Implementar migrations autosync al boot.
- [ ] Endpoints `/auth/*` + `/users/*` + `/health`.
- [ ] Test manual: arranca el server, crea owner via curl, loguea.

**Done cuando**: `npm run dev:server` levanta el backend en `:3180`, podés hacer signup del owner, login, y `GET /api/auth/me` devuelve tus datos.

### Fase L2.2 — Frontend adaptado (2 sesiones)

- [ ] Reemplazar `lib/firebase.ts` por `lib/api.ts` (fetch client).
- [ ] Portar `lib/auth.tsx` a cookie sessions.
- [ ] Portar `useCollection.ts` a Tanstack Query + endpoint REST.
- [ ] Portar Login/Signup/Settings a la nueva API.
- [ ] Vite proxy `/api` → `localhost:3180` en dev.

**Done cuando**: corrés `npm run dev` (web + server en paralelo), podés hacer login desde la UI, ves el user en el header.

### Fase L2.3 — Leads + ingestion (2-3 sesiones)

- [ ] Modelo leads/events + endpoints REST.
- [ ] Ingestion CSV y bulk paste.
- [ ] UI `/leads`, `/leads/import`, `/leads/:id`.
- [ ] SSE broadcast on lead create.

**Done cuando**: subís un CSV de 100 leads, aparecen en la tabla, entrás al detalle de uno, agregás nota.

### Fase L2.4 — Assignment + My Leads (1-2 sesiones)

- [ ] Algoritmo round-robin ponderado.
- [ ] Endpoint batch + auto-assign on lead create.
- [ ] UI `/leads/mine` + `/settings/assignment`.
- [ ] Tests unitarios del algoritmo.

**Done cuando**: 3 users + 100 leads se reparten 50/30/15 según targets y cada uno ve los suyos.

### Fase L2.5 — WhatsApp Workspace + Lines (1-2 sesiones)

- [ ] `WhatsAppLauncher` + `ManualChannel` backend.
- [ ] Lines CRUD + cron daily reset.
- [ ] Templates CRUD.
- [ ] UI `/lines` + botón "WhatsApp" en LeadCard.

**Done cuando**: vendedora abre un lead, click WhatsApp con template → abre `wa.me/...?text=...` → event en timeline.

### Fase L2.6 — Recycling + Sources analytics (1-2 sesiones)

- [ ] Recycling engine + cron + tests.
- [ ] `/settings/recycling` CRUD.
- [ ] `/sources` dashboard con Recharts.
- [ ] Widget "Leads para reciclar" en home.

**Done cuando**: con leads viejos, correr cycle manual los recicla y re-asigna. `/sources` muestra breakdown correcto.

### Fase L2.7 — Tauri + installers (2 sesiones)

- [ ] Setup Tauri con webview que apunta al server local.
- [ ] Wizard de primera conexión (IP/hostname).
- [ ] Bundle `apps/server` como binario standalone con `pkg` o `@vercel/ncc`.
- [ ] Script NSIS para Windows service install.
- [ ] Smoke test: instalar en 2 VMs Windows, que se vean en LAN.

**Done cuando**: un instalador `.msi` instala server como service + app desktop. Otra PC con la app conecta al server vía IP de LAN.

### Fase L2.8 — Meta Cloud API (opcional, post-MVP)

- [ ] Implementar `MetaCloudChannel.send` real.
- [ ] Webhook handler para respuestas entrantes.
- [ ] Encriptación de tokens con OS keychain.
- [ ] Docs `/docs/meta-cloud-setup.md` con pasos + costos.

---

## 13. Convenciones

- **TypeScript strict** en todos los packages.
- **Zod** para validar inputs de cada endpoint. Schemas compartidos en `packages/shared/schemas/`.
- **pino** para logging con niveles (trace/debug/info/warn/error).
- **Errores tipados**: `AppError(code, message, status)`. El `errorHandler` de Fastify los convierte a responses.
- **Nombres de tablas en snake_case plural**, columnas `snake_case`. En código TS todo `camelCase` (Drizzle mapea auto).
- **Fechas**: UTC en DB, convertir a `America/Argentina/Buenos_Aires` en UI.
- **Secrets**: encriptados en `appSettings` con key del OS keychain. Nunca plain text en DB ni en config files.
- **Testing**: Vitest para unit + integration. Playwright para E2E (post-MVP).
- **Commits**: conventional commits (`feat:`, `fix:`, `chore:`, etc.). Un commit por feature, no megacommits.
- **No tocar la rama Cloud** salvo para portar mejoras genéricas del front. El codebase local vive en rama `local`.

---

## 14. Criterio de aceptación del sprint completo

1. Tome instala el `.msi` en una VM Windows limpia. El server arranca como service.
2. En otra VM (misma LAN), instala la app desktop. Conecta vía `mycrm.local:3180` o IP.
3. Signup del owner. Invita 3 vendedoras. Configura targets (50/30/15).
4. Sube 100 leads por CSV con mix de sources.
5. Sistema reparte parejo, cada vendedora ve los suyos.
6. Vendedora abre lead → click WhatsApp → abre wa.me en su celu/navegador.
7. Al día siguiente, cron de reciclaje devuelve al pool leads viejos y los re-asigna.
8. `/sources` muestra analytics correctos.
9. Apagar el internet de las PCs → todo sigue funcionando en LAN.
10. Backup: `copy mycrm.db mycrm.backup.db` en caliente (WAL permite hot-copy). Restaurar en otra PC.

---

## 15. Fuera de scope de este sprint

- Envío real vía Meta Cloud API (Fase L2.8, opcional).
- Sync entre instalaciones (multi-office). Si un cliente tiene 2 oficinas, compran 2 licencias — sin federación.
- App mobile nativa. PWA vía la misma UI web sí funciona.
- Billing / pricing. La Local Edition se vende como licencia one-off + soporte mensual — lógica comercial, no del código.
- Multi-tenant en una sola instalación. Una instalación = un cliente.

---

## PROMPT PARA CLAUDE CODE

```
Leé docs/sprint-2-local-prompt.md completo. Es el brief del sprint para la variante
"Local Edition" del CRM (sin Firebase, self-hosted, instalable en la PC del cliente).

Arrancamos por la **Fase L2.1** (infra base + auth local con Lucia + SQLite + Fastify).

Plan:
1. Crear rama `local` desde `main` para aislar el trabajo del codebase Cloud.
2. Explorá primero el repo actual (apps/web, packages/shared, functions/) para entender qué tipos y utilidades podemos reusar.
3. Proponeme un plan de implementación con:
   - Qué packages/apps creás nuevos (apps/server, packages/db).
   - Qué archivos del frontend tocás en esta fase (ninguno todavía, es fase backend-only).
   - Dependencias npm que vas a instalar.
   - Estructura de carpetas final.
   Esperá mi aprobación antes de tocar código.
4. Ejecutá commiteando por feature (un commit por endpoint + migration + test correspondiente).
5. Cuando termines:
   - Corré `npm run build --workspace apps/server` y `npm run test --workspace apps/server`.
   - Documentá en el README cómo levantar el server en dev (`npm run dev:server`).
   - Mostrame un curl de signup + login + me.

Respetá esto:
- TypeScript strict en packages/db y apps/server.
- Zod validation en todos los endpoints (schemas en packages/shared).
- Lucia Auth para sesiones (cookies HttpOnly).
- argon2id para passwords.
- Drizzle para ORM, migrations versionadas.
- better-sqlite3 con WAL mode.
- pino para logging.
- Errores tipados con AppError.

Qué NO hagas en esta fase:
- No toques el frontend todavía (fase L2.2).
- No implementes leads/assignment/recycling (fases L2.3-L2.6).
- No empaquetes nada con Tauri (fase L2.7).
- No implementes Meta Cloud API (fase L2.8).

Cuando estés listo para empezar, mostrame tu plan y esperá aprobación.
```

---

**Última actualización**: 2026-04-21
**Autor**: Lucas (Tome)
**Referencia Cloud Edition**: `docs/sprint-2-prompt.md`
**Brief del cliente**: `docs/client-voice-note.md`
