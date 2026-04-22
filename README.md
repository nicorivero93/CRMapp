# MyCRM — Reemplazo de GoHighLevel, hecho con Claude Code

![stack](https://img.shields.io/badge/stack-React%2018%20%2B%20TS%20%2B%20Firebase-6366f1)

Un CRM propio, multi-tenant, con pipeline drag & drop, dashboard en tiempo real, automatizaciones por eventos y calendario sincronizado con Google. Construido en menos de una hora siguiendo los 8 prompts de la serie "Decile chau a GHL" de [@soynicolassosa](https://x.com/soynicolassosa), usando Claude Code.

## Módulos

| Módulo | Qué hace | Estado |
|---|---|---|
| Pipeline | Tablero kanban drag & drop con stages configurables, email on close. | ✅ |
| Contactos | Lista + filtros + import CSV + tagging. | ✅ |
| Dashboard | KPIs en tiempo real (revenue, win rate, velocity, funnel). | ✅ |
| Automatizaciones | Reglas trigger → condiciones → acciones (email, stage change, tag). | ✅ |
| Calendario | Eventos internos + sync con Google Calendar vía OAuth. | ✅ |

## Stack técnico

- **Front**: React 18, TypeScript, Vite, Tailwind CSS, React Router v6
- **Data**: Firebase Firestore (onSnapshot + @tanstack/react-query)
- **Auth**: Firebase Auth (email/password + Google)
- **Back**: Firebase Cloud Functions (Node 20, TypeScript)
- **Email**: Resend
- **Drag & drop**: @dnd-kit/core + @dnd-kit/sortable
- **Charts**: Recharts
- **Forms**: react-hook-form + zod
- **Toasts**: react-hot-toast

## Quick start

```bash
npm install
firebase login
firebase use crm-app-31a8f
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set RESEND_FROM
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_ID
firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET
firebase functions:secrets:set GOOGLE_OAUTH_REDIRECT
npm run dev   # local en http://localhost:5173
```

## Local Edition (self-hosted, rama `local`)

Variante sin Firebase: Node + SQLite + Fastify, instalable en la PC del cliente. Fase L2.1 completa (infra base + auth + users).

```bash
# desde la rama `local`
npm install
npm run dev:server          # arranca en http://localhost:3180

# primer owner + login
curl -c cookies.txt -X POST http://localhost:3180/api/auth/signup-owner \
  -H 'content-type: application/json' \
  -d '{"email":"owner@empresa.com","password":"hunter2222","name":"Dueño"}'

curl -b cookies.txt http://localhost:3180/api/auth/me
curl -b cookies.txt http://localhost:3180/api/users
curl http://localhost:3180/api/health

# tests
npm run test:server
```

DB file: `apps/server/data/mycrm.db` (SQLite WAL). Migrations corren en cada boot. Spec completo: `docs/sprint-2-local-prompt.md`.

## Deploy

```bash
npm run build
firebase deploy
```

Sólo hosting:

```bash
npm run deploy:hosting
```

Sólo functions:

```bash
npm run deploy:functions
```

## Seed de datos demo

```bash
npm run seed -- --teamId <teamId> --uid <uid>
```

Ver [`scripts/README.md`](./scripts/README.md) para setup de credenciales.

## Estructura

```
CRMapp/
├── apps/web/                 # Vite + React + TS
│   └── src/
│       ├── lib/              # firebase.ts, auth.tsx, types.ts, useCollection.ts
│       ├── components/layout/
│       ├── routes/           # Login, Signup, Dashboard, Pipeline, Contacts, Calendar, Automations, Settings
│       ├── features/         # pipeline, contacts, dashboard, automations, calendar
│       └── styles/
├── functions/                # Firebase Functions (Node 20, TS)
│   └── src/
│       ├── deals/            # onDealClosed
│       ├── contacts/         # importCsv
│       ├── automations/      # engine
│       ├── calendar/         # googleOAuth, syncEvents
│       ├── teams/            # onUserCreate, acceptInvite, createInvite
│       └── lib/              # resend, email-templates
├── packages/shared/          # tipos compartidos
├── scripts/seed.ts
├── firebase.json / firestore.rules / firestore.indexes.json
└── package.json              # npm workspaces
```

## Modelo de datos

- **users/{uid}** — `{ name, email, avatarUrl, teamId, role: 'owner'|'sales'|'member' }`
- **teams/{teamId}** — `{ name, ownerId, members[], plan, createdAt }`
  - **teams/{teamId}/stages/{stageId}** — `{ name, order, color, isClosedWon }`
- **contacts/{id}** — `{ teamId, name, email, phone, company, country, industry, status, tags[], ownerId, createdAt }`
- **deals/{id}** — `{ teamId, contactId, title, company, value, currency, stageId, ownerId, createdAt, closedAt?, stageHistory[] }`
- **activities/{id}** — `{ teamId, dealId?, contactId?, type, at, ownerId, meta }`
- **events/{id}** — `{ teamId, ownerId, title, start, end, attendees[], status, googleEventId? }`
- **automations/{id}** — `{ teamId, name, enabled, trigger, conditions[], actions[] }`
- **invites/{id}** — `{ teamId, email, role, status, createdAt, token }`
- **notifications/{id}** — `{ teamId, userId, type, read, at, meta }`

Todo documento lleva `teamId`. Las `firestore.rules` se apoyan en custom claims `{ teamId, role }` para aislar data entre tenants.

## Troubleshooting

- **"Failed to get document because the client is offline"** → Revisar `firestore.rules`. Probablemente la query no tiene `where('teamId', '==', ...)` o el usuario no tiene el claim correspondiente. Chequear en Firebase Console → Authentication → usuarios → Custom claims.
- **El email no llega** → Revisar `firebase functions:log`. Verificar que `RESEND_API_KEY` y `RESEND_FROM` estén seteados (`firebase functions:secrets:access RESEND_API_KEY`). El dominio de `RESEND_FROM` tiene que estar verificado en Resend.
- **Google Calendar no sincroniza** → Revisar secrets `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT`. El redirect URI debe coincidir exactamente con el configurado en Google Cloud Console → Credentials.

## Créditos

Built with [Claude Code](https://claude.com/claude-code), siguiendo los prompts de [@soynicolassosa](https://x.com/soynicolassosa).
