# Sprint 2 — Adaptación del CRM al caso "mayorista WhatsApp-first"

> **Cómo usar este doc**: pegale este archivo completo a Claude Code como contexto del próximo sprint. Hay un bloque `## PROMPT PARA CLAUDE CODE` al final que es lo que podés pegar literal; el resto son anexos que Claude puede leer desde el repo (`/docs/sprint-2-prompt.md`).

---

## 1. Contexto del producto

`MyCRM` (este repo) hoy es un CRM genérico multi-tenant estilo GoHighLevel, construido con la serie de 8 prompts de @soynicolassosa. Base funcional ya incluye:

- **Pipeline** kanban drag & drop con stages configurables
- **Contactos** con filtros, import CSV, tagging
- **Dashboard** de KPIs (leads, win rate, revenue)
- **Automatizaciones** trigger → conditions → actions
- **Calendar** multi-usuario con sync Google Calendar
- **Auth** Firebase + custom claims `{ teamId, role }`

Sprint 2 adapta esta base al **primer cliente real: una empresa mayorista que vende vía WhatsApp**. El producto sigue siendo **SaaS multi-tenant** (este cliente es el primer `teamId`, pero la arquitectura debe permitir onboarding de otros mayoristas).

---

## 2. Brief del cliente (paráfrasis fiel de nota de voz del 20/04/2026)

Empresa mayorista. Hoy trabajan así:

- Una persona copia y pega leads de **Instagram, Facebook y TikTok** en un **Excel de Google compartido**.
- **3 vendedoras** tocan la misma planilla: escriben su nombre al lado del lead y marcan si contactaron o no.
- **Problema 1 — distribución despareja**: una vendedora puede tocar 30-50 leads y otra 15. Quieren que el sistema reparta parejo.
- **Problema 2 — múltiples líneas de WhatsApp**: entre tanto mensaje/llamado, WhatsApp les restringe la línea. Tienen que cambiar de celular/chip mid-shift. En el próximo hot sale sumarán más celulares con más chips para cubrir más gente.
- **Problema 3 — pérdida de leads no contactados**: si un lead no responde o la vendedora tenía la línea caída, ese lead queda "quemado". Quieren un **reciclaje** para volver a contactarlos después de X días.
- **Problema 4 — datos históricos**: usa contactos del 2024 para hacer negocio. No quiere que el sistema los borre.
- **Canal primario**: WhatsApp. Email no es un canal relevante acá.
- **Observación del usuario**: "no queremos cole[ctivo], queremos atención por WhatsApp" → cada vendedora trabaja 1-a-1 con el lead; no es un call center con colas centralizadas.

Transcripción completa de la nota de voz: ver `/docs/client-voice-note.md` si existe, o pedirla a Tome.

---

## 3. Objetivos del sprint

Sumar al CRM base las capacidades específicas de este caso de uso, **sin romper lo que ya funciona**. Seguimos con TypeScript + React 18 + Firebase, respetando patrones del repo.

### Nuevos módulos

| Módulo | Qué hace |
|---|---|
| **Leads** | Pool de leads crudos antes de convertirse en `contact`+`deal`. Modelo separado de `contacts/` para distinguir frío/no-contactado de contacto real. |
| **Ingestion Hub** | Importación multi-fuente: CSV, Google Sheets, Excel, pegado manual, bulk paste desde WhatsApp, formulario público, webhook de Meta Lead Ads. Dedupe por teléfono. |
| **Assignment Engine** | Distribución pareja de leads entrantes entre los vendedores activos del team. Round-robin ponderado por capacidad diaria. |
| **WhatsApp Workspace** | Vista por vendedora con sus leads asignados, click-to-WhatsApp (links `wa.me/`), plantillas de mensaje, checklist de estado. Sin enviar vía API — solo abre el WhatsApp del celular. |
| **Multi-line Manager** | Cada vendedora declara sus líneas (`+54911xxxx`) y marca cuál usa hoy. El sistema trackea volumen por línea y avisa cuando se acerca al umbral de restricción. |
| **Recycling Rules** | Engine de reglas que devuelve al pool leads con `status=no-response` tras N días, y los re-asigna (evitando que caigan en la misma vendedora). |
| **Sources Analytics** | Dashboard con breakdown por fuente (IG/FB/TT/orgánico/referido), conversion rate por vendedora, tiempo medio a primer contacto. |

### Preparado pero NO implementado este sprint

- **WhatsApp Business Cloud API** (Meta oficial). Dejar la capa de abstracción `whatsappChannel.ts` con dos implementations: `ManualChannel` (actual) y `MetaCloudChannel` (stub con TODOs + feature flag `enableMetaCloud`). Meta cobra por conversación marketing (~$0.05 USD/conversación en AR) salvo las "service conversations" iniciadas por el cliente (gratis). No asumir gratuidad.

---

## 4. Modelo de datos — delta sobre el existente

### Colecciones nuevas

```ts
// leads/{id} — leads crudos antes de ser contactos
interface Lead {
  id: string
  teamId: string
  // identidad
  name?: string
  phone: string                     // E.164, único por teamId
  phoneNormalized: string            // solo dígitos, para dedupe
  // procedencia
  source: 'instagram' | 'facebook' | 'tiktok' | 'meta-lead-ads' | 'public-form' | 'csv-import' | 'sheets-import' | 'manual' | 'bulk-paste'
  sourceMeta?: Record<string, unknown>   // ej: { adId, campaignId, postUrl }
  importBatchId?: string
  // ciclo de vida
  status: 'new' | 'assigned' | 'contacted' | 'responded' | 'qualified' | 'converted' | 'no-response' | 'recycled' | 'discarded'
  assignedTo?: string                // uid de la vendedora
  assignedAt?: Timestamp
  firstContactAt?: Timestamp
  lastContactAt?: Timestamp
  responseCount: number
  noResponseCount: number
  // reciclaje
  recycledCount: number
  lastRecycledAt?: Timestamp
  // conversion
  convertedContactId?: string        // cuando se convierte, apunta a contacts/
  convertedDealId?: string
  // auditoría
  tags: string[]
  notes?: string
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: 'system' | string       // uid o 'system'
}

// leads/{id}/events/{eventId} — timeline por lead
interface LeadEvent {
  at: Timestamp
  type: 'imported' | 'assigned' | 'wa-opened' | 'message-sent' | 'response-received' | 'status-changed' | 'recycled' | 'note-added'
  byUid: string | 'system'
  meta: Record<string, unknown>
}

// lines/{id} — líneas de WhatsApp por usuario
interface WhatsAppLine {
  id: string
  teamId: string
  ownerId: string                    // uid de la vendedora
  phone: string                      // E.164
  label?: string                     // "celu 1", "chip Personal", etc.
  isActive: boolean                  // la que usa ahora
  dailyCapMessages: number           // default 250
  dailyCount: number                 // reset diario
  lastUsedAt?: Timestamp
  restrictedAt?: Timestamp           // si la vendedora marcó "me restringieron"
}

// importBatches/{id} — auditoría de cada import
interface ImportBatch {
  id: string
  teamId: string
  source: Lead['source']
  fileName?: string
  totalRows: number
  imported: number
  deduped: number
  errors: number
  errorsSample: string[]
  createdBy: string
  createdAt: Timestamp
}

// recyclingRules/{id} — reglas configurables por team
interface RecyclingRule {
  id: string
  teamId: string
  name: string
  enabled: boolean
  // trigger
  statusIn: Array<'no-response' | 'contacted'>
  daysSinceLastContact: number        // min días sin respuesta
  // action
  action: 'return-to-pool' | 'reassign-to-different-user' | 'escalate-to-owner'
  maxRecyclesPerLead: number          // default 3
  createdAt: Timestamp
}

// teamSettings/{teamId} — config del team (si no existe ya)
interface TeamSettings {
  assignmentMode: 'round-robin' | 'capacity-weighted' | 'manual-only'
  defaultRecyclingDays: number
  timezone: string                    // 'America/Argentina/Buenos_Aires'
  // WhatsApp channel
  whatsappChannel: 'manual' | 'meta-cloud'
  metaCloudPhoneNumberId?: string
  metaCloudAccessTokenRef?: string    // ref a secret manager
}
```

### Cambios sobre colecciones existentes

- `users/{uid}`: sumar `capacity: { dailyLeadTarget: number, workingDays: string[] }` y `activeLineId?: string`.
- `contacts/{id}`: sumar `sourceLeadId?: string` (link al lead original si provino de conversión).
- `deals/{id}`: sumar `sourceLeadId?: string`.

### Firestore indexes a agregar

```json
{ "collectionGroup": "leads", "fields": [
  {"fieldPath": "teamId", "order": "ASCENDING"},
  {"fieldPath": "status", "order": "ASCENDING"},
  {"fieldPath": "assignedTo", "order": "ASCENDING"},
  {"fieldPath": "lastContactAt", "order": "DESCENDING"}
]},
{ "collectionGroup": "leads", "fields": [
  {"fieldPath": "teamId", "order": "ASCENDING"},
  {"fieldPath": "phoneNormalized", "order": "ASCENDING"}
]},
{ "collectionGroup": "leads", "fields": [
  {"fieldPath": "teamId", "order": "ASCENDING"},
  {"fieldPath": "status", "order": "ASCENDING"},
  {"fieldPath": "createdAt", "order": "DESCENDING"}
]},
{ "collectionGroup": "leads", "fields": [
  {"fieldPath": "teamId", "order": "ASCENDING"},
  {"fieldPath": "source", "order": "ASCENDING"},
  {"fieldPath": "createdAt", "order": "DESCENDING"}
]}
```

### Firestore rules — delta

```
match /leads/{id} {
  allow read: if isTeamMember(resource.data.teamId);
  allow create: if isTeamMember(request.resource.data.teamId);
  allow update: if isTeamMember(resource.data.teamId);
  allow delete: if isOwner(resource.data.teamId);

  match /events/{eventId} {
    allow read, create: if isTeamMember(get(/databases/$(database)/documents/leads/$(id)).data.teamId);
  }
}

match /lines/{id} {
  allow read: if isTeamMember(resource.data.teamId);
  allow write: if isSignedIn() && resource.data.ownerId == myUid();
  allow create: if isSignedIn() && request.resource.data.ownerId == myUid();
}

match /importBatches/{id} {
  allow read: if isTeamMember(resource.data.teamId);
  allow create: if isTeamMember(request.resource.data.teamId);
  allow update, delete: if false;   // solo backend
}

match /recyclingRules/{id} {
  allow read: if isTeamMember(resource.data.teamId);
  allow write: if isOwner(resource.data.teamId);
}
```

---

## 5. Cloud Functions nuevas

| Nombre | Tipo | Qué hace |
|---|---|---|
| `ingestLeadsCsv` | callable | Recibe CSV + source, parsea, dedupe por `phoneNormalized`, crea `leads/`, registra `importBatches/`. |
| `ingestLeadsSheets` | callable | Recibe URL de Google Sheets público o ID + rango, baja vía API key pública, mismo flujo que CSV. |
| `ingestLeadsBulkPaste` | callable | Recibe bloque de texto (nombres y teléfonos mixtos), extrae tels con regex, crea leads. |
| `metaLeadAdsWebhook` | HTTP endpoint público | Recibe webhooks de Meta Lead Ads (IG/FB). Verificación de signature. |
| `publicLeadFormSubmit` | HTTP endpoint público | Landing form → lead. Rate-limited por IP. |
| `assignLeadsBatch` | callable | Toma leads `status=new` del team y los reparte según `teamSettings.assignmentMode`. |
| `onLeadCreated` | Firestore trigger | Si `teamSettings.assignmentMode !== 'manual-only'`, auto-asigna. |
| `recyclingCron` | scheduled (daily 06:00 ART) | Evalúa `recyclingRules` del team, devuelve al pool o re-asigna leads vencidos. |
| `onLineDailyReset` | scheduled (daily 00:00 ART) | Resetea `lines/{id}.dailyCount = 0`. |
| `convertLeadToContact` | callable | Cuando la vendedora cierra: crea `contacts/` + `deals/`, setea `leads/{id}.status='converted'` y links. |

### Assignment engine — spec del round-robin ponderado

```ts
// functions/src/leads/assignment.ts
interface Assignable {
  users: Array<{ uid: string, dailyTarget: number, assignedToday: number }>
  leadsToAssign: string[]   // ids
}

// Algoritmo:
// 1. Filtrar users con dailyTarget > 0 y assignedToday < dailyTarget.
// 2. Calcular capacity[uid] = dailyTarget - assignedToday.
// 3. Round-robin ponderado por capacity[uid]. Ej capacity [50, 30, 15] → distribuye 50/95, 30/95, 15/95.
// 4. Tiebreak: menor assignedToday absoluto primero. Si empate, uid lexicográfico.
// 5. Nunca asignar > dailyTarget.
// 6. Al reasignar (reciclaje): excluir el uid previo.
```

---

## 6. UI — nuevas rutas

Seguir el patrón de `apps/web/src/routes/*.tsx` con features en `apps/web/src/features/`.

| Ruta | Componente | Qué muestra |
|---|---|---|
| `/leads` | `Leads.tsx` | Tabla global de leads (solo visible a owner). Filtros por source, status, assignedTo. Export CSV. |
| `/leads/mine` | `MyLeads.tsx` | Vista de la vendedora: sus leads asignados, ordenados por `lastContactAt` asc. **Vista principal para vendedoras**. |
| `/leads/import` | `LeadsImport.tsx` | Wizard con tabs: CSV / Sheets URL / Bulk Paste / Manual. Preview + dedupe report antes de confirmar. |
| `/leads/:id` | `LeadDetail.tsx` | Perfil del lead, timeline de eventos, botón "Abrir WhatsApp" que genera `wa.me/` con template, acciones de estado. |
| `/sources` | `SourcesDashboard.tsx` | Analytics por fuente: leads totales, conversion rate, tiempo medio a contacto, breakdown por vendedora. |
| `/lines` | `LinesSettings.tsx` | Vendedora gestiona sus líneas de WhatsApp: add/edit/activate. Ve `dailyCount` vs `dailyCap`. |
| `/settings/assignment` | `AssignmentSettings.tsx` | Owner configura `assignmentMode`, targets diarios por vendedora. |
| `/settings/recycling` | `RecyclingSettings.tsx` | Owner configura reglas de reciclaje (CRUD). |

### Componentes específicos clave

- **`LeadCard`**: card compacta con nombre, teléfono, fuente (badge color), status, tiempo desde último contacto. Botón verde grande "WhatsApp" que abre `wa.me/`.
- **`WhatsAppLauncher`**: hook `useWhatsAppLauncher(lead, template?)` → abre nueva pestaña con link correcto. Registra evento `wa-opened` en `leads/{id}/events/`.
- **`ImportWizard`**: step 1 = elegir source, step 2 = subir/pegar, step 3 = mapear columnas (para CSV), step 4 = preview con dedupe report (nuevos / duplicados / inválidos), step 5 = confirm → llama callable.
- **`LineRestrictedBanner`**: si la línea activa tiene `restrictedAt` reciente o `dailyCount > dailyCap * 0.8`, muestra banner sugiriendo cambiar.

---

## 7. Plan de entrega — partir en sub-sprints

Implementar el sprint **por fases con checkpoints**. No mezclar todo en un solo PR.

### Fase 2.1 — Modelo de datos + Leads básico (2-3 sesiones)

- [ ] Tipos en `packages/shared/src/index.ts`
- [ ] Firestore rules + indexes desplegados
- [ ] Colecciones `leads/`, `importBatches/`, `lines/`, `recyclingRules/`, `teamSettings/`
- [ ] UI `/leads` (tabla global owner) + `/leads/:id` (detalle)
- [ ] Callable `ingestLeadsCsv` + wizard `/leads/import` (solo tab CSV)
- [ ] Seed script actualizado con leads demo

**Done cuando**: Tome puede loguearse, subir un CSV de leads demo, verlos en la tabla, entrar al detalle de uno y ver el timeline vacío.

### Fase 2.2 — Assignment engine + My Leads (1-2 sesiones)

- [ ] Callable `assignLeadsBatch` + trigger `onLeadCreated`
- [ ] UI `/settings/assignment` (owner) y `/leads/mine` (vendedora)
- [ ] Evento `assigned` en timeline
- [ ] Tests unitarios del algoritmo round-robin ponderado (incluir caso de empate y capacity=0)

**Done cuando**: con 3 usuarios demo (targets 50/30/15) + 100 leads subidos por CSV, se reparten 53/32/15 (round-robin ponderado) y cada vendedora ve los suyos en `/leads/mine`.

### Fase 2.3 — WhatsApp Workspace + Lines (1-2 sesiones)

- [ ] `WhatsAppLauncher` hook + `LeadCard` con botón
- [ ] CRUD de líneas en `/lines`
- [ ] Tracking de `dailyCount`, cron `onLineDailyReset`
- [ ] Plantillas de mensaje (Firestore `messageTemplates/{id}`) editables por team
- [ ] Eventos `wa-opened`, `message-sent` (auto-trigger al click), `response-received` (manual por la vendedora)
- [ ] `LineRestrictedBanner`

**Done cuando**: una vendedora con 2 líneas cargadas abre un lead, hace click en "WhatsApp" con template "Saludo inicial", se abre `wa.me/+54911...?text=Hola...`, y en el timeline aparece el evento.

### Fase 2.4 — Ingestion multi-fuente (2 sesiones)

- [ ] Tabs adicionales del wizard: Sheets, Bulk Paste, Manual
- [ ] `metaLeadAdsWebhook` endpoint + guide en docs para configurar en Meta Business
- [ ] `publicLeadFormSubmit` endpoint + página pública `/apply/:teamSlug` (o similar)
- [ ] Dedupe cross-source: si llega mismo `phoneNormalized`, merge en lead existente y agregar evento.

**Done cuando**: se pueden crear leads vía las 6 fuentes listadas y la tabla los muestra correctamente tagueados por source.

### Fase 2.5 — Recycling + Sources analytics (1-2 sesiones)

- [ ] `/settings/recycling` CRUD
- [ ] `recyclingCron` + tests con fakeTimers
- [ ] `/sources` dashboard con Recharts (leads/día stacked por source, funnel global, conversion rate por vendedora)
- [ ] Widget "Leads para reciclar hoy" en dashboard principal

**Done cuando**: con leads viejos en `status=no-response`, correr cron manual (`firebase functions:shell`) los devuelve al pool y los re-asigna a otra vendedora.

### Fase 2.6 — Hardening + preparación Meta Cloud API (1 sesión, opcional)

- [ ] Abstracción `whatsappChannel.ts` con `ManualChannel` impl (actual) + `MetaCloudChannel` stub
- [ ] Feature flag `system/feature-flags/metaCloudApi` en Firestore
- [ ] Docs en `/docs/meta-cloud-setup.md` explicando costos reales y pasos de onboarding
- [ ] Smoke tests E2E (Playwright o similar) para los flujos críticos

---

## 8. Rollout por etapas

Respetando el patrón de `contenidoapp` (dogfooding → cohortes → GA):

1. **Owner-only**: primer deploy con feature flags activas solo para el UID owner. Tome y el cliente directo prueban en prod.
2. **Beta cohort**: cuando Tome confirma estabilidad, abrir a los UIDs del team del cliente (las 3 vendedoras). Feature flag en `system/feature-flags/leadsV2` con `allowUids[]`.
3. **GA**: si en 2 semanas no hay bugs críticos, se remueve el gate y queda habilitado por default para todos los teams.

Implementar helper `useFeatureFlag(flagName)` en frontend + guard en backend que lea `system/feature-flags/{flagName}` y valide `allowOwner | allowUids[] | allowTeamIds[] | enabled`.

---

## 9. Reglas de código y convenciones (heredar del repo)

- Lógica de negocio en hooks (`apps/web/src/features/*/hooks/`), no en componentes.
- Callables en `functions/src/leads/`, `functions/src/ingestion/`, etc.
- Try/catch con toast (`react-hot-toast`) en toda llamada async.
- Loading + empty states en todas las listas.
- Nombres de colecciones en **inglés, plural**.
- Zod schemas compartidos en `packages/shared/src/schemas/` para validar inputs de callables en ambos lados.
- No hardcodear secrets. Meta Cloud tokens van en Firebase Secret Manager, ref desde `teamSettings`.
- Timezone: todas las fechas en UTC en Firestore, conversión a `America/Argentina/Buenos_Aires` en UI con `date-fns-tz`.
- Tests: al menos unit tests del assignment engine y del recycling evaluator. Vitest para frontend, Jest para functions (reusar config del repo si ya existe).

---

## 10. Criterio de aceptación del sprint completo

1. Tome crea un team, invita a 3 vendedoras, configura targets diarios (50/30/15).
2. Sube un CSV de 100 leads con mix de sources (IG/FB/TT/manual).
3. El sistema asigna parejo según targets; cada vendedora ve los suyos en `/leads/mine`.
4. Una vendedora abre un lead, hace click en "WhatsApp" con template, se registra evento.
5. Al día siguiente, el cron de reciclaje devuelve al pool los leads con >3 días sin contacto, re-asignándolos a vendedora distinta.
6. `/sources` muestra analytics correctos con breakdown por fuente.
7. Todo lo anterior funciona para un segundo team creado en paralelo sin filtrarse data entre tenants (validar con `firestore-rules-testing`).

---

## 11. Fuera de scope (sprints futuros)

- Envío real vía Meta Cloud API (marketing/utility). Costeo, templates approval, multi-phone-number routing.
- Voice-note transcription in-app (usar `mcp-whatsapp-transcribe` que ya está armado, integrar como service).
- AI para sugerir template según respuesta del lead.
- App mobile nativa (PWA primero).
- Billing / planes de Suscripción del SaaS.

---

## PROMPT PARA CLAUDE CODE

```
Leé `docs/sprint-2-prompt.md` completo. Es el brief del próximo sprint.

Arrancamos por la **Fase 2.1** (modelo de datos + Leads básico). 
Plan:
1. Explorá primero el repo (`packages/shared`, `apps/web/src/features/contacts` como referencia de patrón, `functions/src/contacts/importCsv.ts` como referencia de callable de import, `firestore.rules` e `indexes`).
2. Proponeme un plan de implementación con los archivos que vas a crear/modificar, antes de tocar nada.
3. Cuando lo apruebe, ejecutá y andá commiteando por feature (no un megacommit).
4. Para cada archivo nuevo seguí las convenciones del repo (imports, naming, TypeScript strict).
5. Cuando termines la fase, corré `npm run build` (web y functions) y `firebase deploy --only firestore:rules,firestore:indexes` y me avisás para testear.

Respetá esto:
- No toques pipeline, dashboard, automatizaciones, calendar salvo que te lo pida explícito.
- Mantené multi-tenant: todo doc lleva `teamId` y las rules lo validan.
- Features nuevas gateadas con `useFeatureFlag('leadsV2')` — arranca owner-only.
- Código limpio > código rápido: si ves algo del repo base que ya estaba mal, marcámelo pero no lo arregles salvo que me lo pidas.

Qué NO hagas en esta fase:
- No implementes Meta Cloud API (es fase 2.6).
- No hagas el engine de assignment todavía (fase 2.2).
- No toques el calendario ni las automatizaciones.

Cuando estés listo para empezar, mostrame tu plan y esperá aprobación.
```

---

**Última actualización**: 2026-04-21
**Autor**: Lucas (Tome) — brief del cliente del 20/04/2026
