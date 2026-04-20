# Seed script

Puebla un team con stages, contactos, deals, events y automations de ejemplo.

## Cómo correrlo

```bash
# 1. Descargar service account JSON desde Firebase Console → Project Settings → Service Accounts
# 2. export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
# 3. npm run seed -- --teamId <teamId> --uid <uid>
```

En Windows PowerShell:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\key.json"
npm run seed -- --teamId <teamId> --uid <uid>
```

## Qué crea

- 4 stages en `teams/{teamId}/stages` (Nuevo lead → Contactado → Propuesta → Cerrado).
- 20 contactos con países (Argentina, Chile, México, España, USA) e industrias (SaaS, Ecommerce, Fintech, HealthTech, EdTech) variadas.
- 12 deals: 9 en stages abiertos + 3 cerrados en los últimos 30 días, values entre $1k y $25k.
- 8 events entre hoy y +7 días.
- 2 automations de ejemplo (welcome + follow-up).

## Flags

| Flag | Descripción | Requerido |
|---|---|---|
| `--teamId` | ID del team a poblar. | ✅ |
| `--uid` | UID del owner (para `ownerId` en docs). Default: `teamId`. | opcional |

## Cuidado

El seed **no borra** nada antes de correr — si lo corrés dos veces vas a duplicar deals, contactos y events. Los stages sí se sobrescriben (IDs fijos `s0..s3`).
