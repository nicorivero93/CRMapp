# Orquestador del proyecto — MyCRM (CRMapp)

> Generado por `/orquestador` el 2026-04-20. Fuente de verdad para convenciones, reglas y decisiones de este repo.

---

## Stack detectado

- **Lenguaje principal**: TypeScript (React 18 front + Node 20 functions)
- **Framework front**: React + Vite + Tailwind CSS (tema dark custom, sin shadcn CLI — components locales)
- **Framework back**: Firebase Cloud Functions (codebase `default`, Node 20)
- **Package manager**: npm con workspaces (`apps/web`, `functions`, `packages/shared`)
- **Routing**: React Router v6
- **State/data**: Firestore con `onSnapshot` + `@tanstack/react-query`
- **Auth**: Firebase Auth (email/password + Google)
- **Drag & drop**: `@dnd-kit/core` + `@dnd-kit/sortable`
- **Charts**: Recharts
- **Forms**: react-hook-form + zod
- **CSV**: papaparse
- **Tests**: (no configurado todavía — decidir antes de escalar)
- **Build / Deploy**: `npm run build` + `firebase deploy` → proyecto `crm-app-31a8f`, dominio `crm-app-31a8f.web.app`
- **DB**: Firestore (multi-tenant por `teamId`, aislado por custom claims)
- **Email**: Resend (API key en Functions secret)

---

## Estructura del repo

```
CRMapp/
├── apps/web/                     # Vite + React + TS
│   └── src/
│       ├── lib/                  # firebase.ts, auth.tsx, types.ts, useCollection.ts
│       ├── components/layout/    # AppShell, Sidebar, Topbar
│       ├── routes/               # Login, Signup, Dashboard, Pipeline, Contacts, Calendar, Automations, Settings
│       ├── features/
│       │   ├── pipeline/         # Board, DealCard, StageColumn, StageEditor, NewDealModal
│       │   ├── contacts/
│       │   ├── dashboard/
│       │   ├── automations/
│       │   └── calendar/
│       └── styles/index.css
├── functions/                    # Firebase Functions (TS, Node 20)
│   └── src/
│       ├── deals/                # onDealClosed
│       ├── contacts/             # importCsv
│       ├── automations/          # engine
│       ├── calendar/             # googleOAuth, syncEvents
│       ├── teams/                # onUserCreate, acceptInvite
│       └── lib/                  # resend, email-templates
├── packages/shared/              # tipos zod compartidos (opcional)
├── scripts/seed.ts               # seed data demo
├── firebase.json / firestore.rules / firestore.indexes.json / .firebaserc
└── package.json (workspaces)
```

---

## Convenciones observadas

- **Naming**: `camelCase` para vars/funciones, `PascalCase` para componentes/tipos, `kebab-case` solo para rutas de archivos no-componente.
- **Archivos**: un componente por archivo, nombre = componente (PascalCase). Hooks en `lib/useX.ts`.
- **Imports**: alias `@/` → `apps/web/src/`. Orden: libs → firebase → `@/lib` → `@/components` → `@/features` → relativos.
- **Estilo**: Tailwind + clases semánticas del theme (`bg-bg-card`, `text-text-dim`, `btn-primary`, `card`, `chip`, `input`). Nada de inline styles salvo `transform`/colores dinámicos.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`).
- **Branches**: `main` como tronco. Features sin PR para el MVP, a futuro feature branches.
- **Tono UI**: argentino/neutro, directo. "Cerrar", "Nuevo deal", "Agregá contactos", etc. Sin gerundios innecesarios.

---

## Reglas específicas del repo

1. **Todo doc con `teamId`**. No existe query sin filtro `where('teamId', '==', team)`. Las rules lo exigen.
2. **Never leak cross-team data**. Las `firestore.rules` se apoyan en custom claims `{ teamId, role }`; las Functions deben setearlas al crear team / aceptar invite.
3. **Email sólo desde Functions**, nunca desde el cliente. Resend API key vive en `functions.config()` o secrets.
4. **Drag & drop = source of truth en Firestore**. Después del `updateDoc`, la vista se actualiza sola por `onSnapshot`. No mantener estado optimista duplicado.
5. **Realtime dashboard**. Todos los KPIs vienen de `onSnapshot`. Nada de polling.
6. **SaaS multi-tenant**. Cualquier usuario que firma crea su team (= ownerId = uid). `bootstrapTeam` en `lib/auth.tsx` lo hace desde el cliente para el MVP; migrar a Function con custom claims cuando escale.
7. **Google Calendar OAuth**: client_id + secret en Functions config. El refresh token se guarda en `users/{uid}.googleTokens` encriptado (a implementar en fase 2 — queda con placeholder con instrucciones).
8. **Secrets**: nunca hardcodear nada salvo la `firebaseConfig` del front (es pública por diseño). Todo lo demás usa `functions.config()` / `defineSecret`.
9. **Responsive**: desktop-first. Mobile no es prioridad para el MVP pero no debe romperse.

## Qué NO hacer acá

- No mezclar lógica de negocio en componentes. Si hay > 10 líneas de transformación, va a `lib/` o a una Function.
- No leer colecciones completas sin `teamId` filter — las rules las rechazan y además es costoso.
- No usar `addDoc` sin `serverTimestamp()` en campos de fecha.
- No asumir `profile` no-null en rutas — usar `Protected` wrapper que garantiza user + profile cargados.
- No agregar dependencias pesadas sin justificar (nada de Material UI, Ant Design, etc — Tailwind + lucide es suficiente).
- No meter tests aún: MVP primero. Smoke test manual end-to-end según la sección "Verificación" del plan.

---

## Objetivo declarado

> Reemplazar GoHighLevel con un CRM propio en menos de 1 hora, siguiendo los 8 prompts de la serie "Decile chau a GHL" de @soynicolassosa. Deploy en Firebase Hosting del proyecto `crm-app-31a8f`, código en repo privado `https://github.com/nicorivero93/CRMapp`. Funcional desde el día 1.

---

## Ruteo de tareas dentro de este repo

- **Nueva feature de UI** → escribir componente en `features/<modulo>/` + sumar ruta en `App.tsx`.
- **Nueva regla de negocio server-side** → Function en `functions/src/<dominio>/` + exportar desde `functions/src/index.ts`.
- **Nuevo campo en modelo** → actualizar `lib/types.ts` + `firestore.rules` (si afecta permisos) + `firestore.indexes.json` (si entra en queries compuestas).
- **Cambio de permisos** → tocar `firestore.rules` + custom claims en Function `teams/onUserCreate` o `teams/acceptInvite`.

## Subagentes recomendados para este repo

- `senior-code-reviewer` antes de merge a main si el diff es > 200 líneas.
- `test-writer` cuando se estabilice el MVP (meter Vitest para hooks + Functions).
- `critical-auditor` antes de cada `firebase deploy` a producción.
- `system-architect` antes de agregar billing/Stripe o cambiar el modelo de auth.

---

## Bitácora

- **2026-04-20** | Bootstrap por `/orquestador`. Scaffold monorepo + auth + layout + pipeline completo. Pendiente: contacts, dashboard, automations, calendar, functions, seed, deploy, push a GitHub.
- **2026-04-20** | Decisión: Resend para emails, SaaS multi-tenant, monorepo, dominio default `crm-app-31a8f.web.app`.
