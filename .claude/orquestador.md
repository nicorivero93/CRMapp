# Orquestador — MyCRM Local Edition

> Regenerado 2026-04-23. Este archivo es la fuente de verdad para convenciones, reglas y arquitectura de este repo. **Reemplaza** al orquestador anterior (Firebase Cloud Edition), que quedó obsoleto cuando pivoteamos a local self-hosted.

---

## Producto

CRM self-hosted, instalable en una PC Windows de la oficina. El equipo accede por LAN (`http://<ip-host>:3180`) o por el desktop wrapper de Tauri. Sin nube, sin cuentas externas, sin suscripciones.

- Instalador Windows (`install.bat` + WinSW como servicio).
- Distribución como ZIP de release descargable desde GitHub Releases.
- Auto-updater (botón "Actualizar" en la UI) que descarga el ZIP nuevo y lo aplica vía `update.ps1`.
- Dual runtime: web UI servida por el server en `:3180`, **y** un `.exe` de Tauri que abre esa misma URL en una ventana nativa.

---

## Stack

- **Server**: Node 20 + Fastify 5 + Drizzle ORM + better-sqlite3 + Pino + node-cron. Bundleado con esbuild a un único `server-bundle.cjs`.
- **Web UI**: React 18 + Vite + Tailwind + React Router v6 + TanStack Query. Tema dark por default.
- **Desktop**: Tauri 2 (Rust + WebView2). `apps/desktop/src-tauri/tauri.conf.json` — **updater no habilitado** hoy; cambios del `.exe` requieren reinstalar a mano.
- **DB**: SQLite local (`%ProgramData%\MyCRM\data\mycrm.db`). Migraciones con drizzle-kit.
- **Auth**: local, password con argon2 (`@node-rs/argon2`). Cookies HttpOnly via `@fastify/cookie`. Roles: `owner`, `admin`, `user`.
- **Service Windows**: WinSW 3 alpha. Config generada por `install.bat` en `winsw.xml`.
- **Testing**: Vitest (ver `~/.claude/rules/testing.md`).
- **Package manager**: npm workspaces.

---

## Estructura del repo

```
CRMapp/
├── apps/
│   ├── server/                     # Fastify + SQLite
│   │   ├── src/
│   │   │   ├── auth/               # login, middleware (requireAuth, requireRole)
│   │   │   ├── contacts/           # CRUD + bulk import
│   │   │   ├── deals/              # pipeline deals
│   │   │   ├── stages/             # pipeline stages
│   │   │   ├── leads/              # leads + ingestion + assignment + recycling
│   │   │   ├── lines/              # WhatsApp lines + dailyCount
│   │   │   ├── whatsapp/           # Meta Cloud stub + templates
│   │   │   ├── templates/          # message templates
│   │   │   ├── automations/        # regla-evento engine
│   │   │   ├── events/             # event log
│   │   │   ├── analytics/          # dashboard KPIs
│   │   │   ├── users/              # owners/admins management
│   │   │   ├── settings/           # app-wide settings (timezone, etc)
│   │   │   ├── backup/             # /api/backup on-demand + scheduler diario
│   │   │   ├── scheduler/          # node-cron: daily reset + recycling + backup
│   │   │   ├── updater/            # /api/updater/{status,check,apply}
│   │   │   ├── health/             # /api/health
│   │   │   ├── static/             # serve UI desde public/
│   │   │   ├── stream/             # SSE
│   │   │   ├── db/                 # drizzle client + migrate
│   │   │   ├── lib/logger.ts
│   │   │   ├── config.ts           # version pin (bump por CI via tag)
│   │   │   ├── app.ts              # buildApp
│   │   │   └── index.ts            # entrypoint
│   │   └── packaging/
│   │       ├── build-bundle.ts     # esbuild → server-bundle.cjs
│   │       └── build-release.ps1   # arma release/ completa para zipeo
│   ├── web/                        # React + Vite
│   │   └── src/
│   │       ├── routes/             # Login, Signup, Dashboard, Pipeline, Contacts, Leads…
│   │       ├── features/
│   │       ├── components/
│   │       ├── lib/                # api client, auth context, types
│   │       └── _legacy/            # código Firebase viejo, no tocar
│   └── desktop/                    # Tauri wrapper
│       ├── src-tauri/
│       └── scripts/generate-icons.ps1
├── packages/
│   ├── db/                         # schema Drizzle + tipos compartidos
│   └── shared/                     # zod schemas compartidos cliente↔servidor
├── installer/windows/
│   ├── install.bat                 # install server + winsw service
│   ├── uninstall.bat
│   ├── update.ps1                  # updater: download → backup → replace → health → rollback
│   └── create-shortcut.ps1
├── .github/workflows/release.yml   # CI: tag v* → build + zip + publish release
└── docs/                           # roadmap + voz cliente
```

---

## Convenciones

- **TS estricto**. `type: module` en server y web. Imports `.js` en source (ESM con bundler).
- **Naming**: `camelCase` vars/funciones, `PascalCase` tipos/componentes, `kebab-case` solo filenames no-componente.
- **Aliases**: `@/` → `apps/web/src/` en el front. En server, paths relativos con `.js`.
- **Commits**: Conventional (`feat:`, `fix:`, `chore:`, `refactor:`). Los `fix(vX.Y.Z):` marcan fixes que entran en ese release.
- **Tono UI**: argentino/neutro, sin gerundios de IA.
- **Tailwind**: classes semánticas del theme. Nada de inline styles salvo valores dinámicos.
- **Footer en todos los routes**: `© {año} · tomerivero.dev` (regla global #11 de `~/.claude/CLAUDE.md`).

---

## Reglas específicas del repo

1. **Operaciones de plata/estado en server-side**. El cliente nunca escribe DB directo — todo via `/api/*`. Ver regla global #10.
2. **Auth**: cada route protegida usa `requireAuth` o `requireRole('owner'|'admin')` como `preHandler`. Nunca confiar en el cliente para role checks.
3. **El server es la autoridad de versión**. `/api/health` devuelve la versión real (`config.version`) — la UI la usa para mostrar estado de update.
4. **DB_PATH fuera del install dir**. El service apunta a `%ProgramData%\MyCRM\data\mycrm.db`. El installer nunca pisa eso; `update.ps1` excluye `data/` del robocopy.
5. **Updater = SYSTEM**. Cualquier cambio en `update.ps1` debe asumir:
   - PATH puede venir stripped → restaurar al inicio (ya implementado, `update.ps1:31`).
   - Stop-Service mataría al proceso padre si el PowerShell fuera hijo — se spawnea `detached: true` + `.unref()` con stdio a `update-spawn-*.log`.
   - Ruta absoluta a `powershell.exe` al spawnear desde el server ([updater/routes.ts:176-177](apps/server/src/updater/routes.ts:176)).
6. **Release bundle limpio**. `data/` del ZIP se scrubea antes del zip ([build-release.ps1:131](apps/server/packaging/build-release.ps1:131)). Nunca shippear DB real ni artefactos de smoke tests.
7. **Versionado**. El tag `vX.Y.Z` en git → CI bumpea `apps/server/package.json` y `src/config.ts` y publica release. No commitear bumps a mano.
8. **Código espejo cliente ↔ servidor**. Cálculos/reglas duplicadas se declaran acá. **Hoy no hay espejos activos** — cuando los haya, listar como `src/foo.ts ↔ apps/web/src/lib/foo.ts` + tests en ambos lados.
9. **Scheduler**. Todo cron nuevo va a `apps/server/src/scheduler/index.ts`. Ya corre diario a medianoche en TZ de settings. Acciones deben ser **idempotentes** + guardadas en `appSettings` con key `last*At`.
10. **Audit log**. Eventos importantes → tabla `events` vía `apps/server/src/events/`. Cliente **no** escribe acá.

---

## Qué NO hacer

- No correr queries sin filtro por `teamId`/owner cuando aplique (heredado de rules, acá se hace en los handlers).
- No mockear la DB en tests: usar la infra de Vitest con `better-sqlite3` en memoria o temp (ver `~/.claude/rules/testing.md` #5).
- No exponer rutas sin `preHandler: requireAuth`. Es fácil olvidarlo y filtrar datos.
- No meter dependencias pesadas en el server (queremos el bundle chico). Ya hay `@node-rs/argon2` + `better-sqlite3` nativos — suficiente.
- No inventar flags de entorno nuevos en el server sin agregarlos al `winsw.xml` generado por `install.bat` y al `launch.cmd`.
- No tocar `apps/web/src/_legacy/` — es código Firebase pre-pivote, se borra cuando no quede nadie referenciándolo.

---

## Ruteo de tareas

- **Nueva route en server** → `src/<dominio>/routes.ts` + registrar en `src/app.ts`. Handler con zod schema + `requireAuth`/`requireRole`.
- **Nuevo cron** → extender `scheduler/index.ts`. Guardar última ejecución en `appSettings` para idempotencia.
- **Nueva pantalla UI** → ruta en `apps/web/src/routes/<Nombre>.tsx` + registrar en `App.tsx`. Features complejas a `features/<modulo>/`.
- **Cambio de schema DB** → modificar `packages/db/src/schema.ts` + `npm run -w apps/server db:generate` + commit del SQL + correr `db:migrate` en dev.
- **Cambio de versión server** → NO a mano. Se hace con `git tag vX.Y.Z && git push --tags`. CI bumpea todo.
- **Cambio del installer/updater** → tocar `installer/windows/*`. Testear **siempre** el flujo completo antes de taggear: install limpio + auto-update en una VM o notebook de prueba (la de Nico).
- **Cambio del desktop** → `apps/desktop/src-tauri/`. **Aviso**: hoy el `.exe` no se auto-actualiza. Si cambiaste Tauri, documentá en release notes que hay que reinstalar el `.exe` a mano.

---

## Subagentes recomendados

- `adaptive-solver` antes de cualquier cambio que toque updater, installer o scheduler (bugs de blast-radius alto comprobado).
- `senior-code-reviewer` antes de taggear release.
- `critical-auditor` después de cambios en auth, money ops (pagos futuros) o migraciones.
- `test-writer` para rutas sin tests colocados.
- `error-teacher` cuando un cliente manda logs crípticos (ya probado con el caso del ENOENT de powershell).

---

## Bitácora

- **2026-04-20** | Bootstrap Firebase Cloud Edition (SaaS multi-tenant).
- **2026-04-22** | **Pivote a Local Edition** — autohosted SQLite. Rama `local` pasó a ser la principal de desarrollo. `main` quedó en pause como Cloud Edition.
- **2026-04-22 v0.1.1** | Primera release local con updater.
- **2026-04-22 v0.1.2** | Patch — updater aún con bugs.
- **2026-04-22 v0.1.3** | Feat: Profile + bulk WhatsApp + XLSX import.
- **2026-04-22 v0.1.4** | Fix crítico: updater PATH + spawn con ruta absoluta a powershell.exe + captura stdio + boot marker. Tras este release el updater queda sano.
- **2026-04-23** | Caso real: cliente 0.1.2 no podía auto-actualizar (bug `spawn powershell.exe ENOENT` + `update.ps1` mutilado en disco). Resuelto con rescate manual (download + robocopy). Post-mortem confirmó los fixes de 0.1.4 como correctos para instalaciones futuras.
- **2026-04-23 v0.1.5 (en progreso)** | Scrub de `data/` en build. Backup diario de DB. Tests de rutas críticas. Encriptar refresh token Google. Dark mode toggle. Regenerar este orquestador (ese punto = este commit).
