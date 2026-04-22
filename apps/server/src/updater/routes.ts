import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { appSettings } from '@mycrm/db';
import { applyUpdateSchema, type UpdaterStatusDTO, type ApplyUpdateResponse } from '@mycrm/shared';
import type { buildApp } from '../app.js';
import { config } from '../config.js';
import { getDb } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

type App = Awaited<ReturnType<typeof buildApp>>;

const KEY = 'updater';
const REPO = 'nicorivero93/CRMapp';
const ASSET_NAME_PATTERN = /mycrm-local.*\.zip$/i;

interface StoredUpdaterState {
  latestVersion: string | null;
  lastCheckedAt: string | null;
  releaseNotes: string | null;
  releaseAssetUrl: string | null;
  error: string | null;
}

function readState(): StoredUpdaterState {
  const row = getDb().select().from(appSettings).where(eq(appSettings.key, KEY)).get();
  const defaults: StoredUpdaterState = {
    latestVersion: null,
    lastCheckedAt: null,
    releaseNotes: null,
    releaseAssetUrl: null,
    error: null,
  };
  if (!row) return defaults;
  return { ...defaults, ...(row.value as Partial<StoredUpdaterState>) };
}

function writeState(patch: Partial<StoredUpdaterState>): StoredUpdaterState {
  const db = getDb();
  const current = readState();
  const next = { ...current, ...patch };
  const existing = db.select().from(appSettings).where(eq(appSettings.key, KEY)).get();
  if (existing) {
    db.update(appSettings).set({ value: next }).where(eq(appSettings.key, KEY)).run();
  } else {
    db.insert(appSettings).values({ key: KEY, value: next }).run();
  }
  return next;
}

function versionGT(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map((n) => Number(n) || 0);
  const pb = b.replace(/^v/, '').split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

let checking = false;

async function fetchLatestRelease(): Promise<StoredUpdaterState> {
  const url = `https://api.github.com/repos/${REPO}/releases/latest`;
  const res = await fetch(url, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'mycrm-updater' },
  });
  if (!res.ok) {
    const errMsg = `GitHub ${res.status}: ${await res.text().catch(() => '')}`;
    return writeState({ error: errMsg, lastCheckedAt: new Date().toISOString() });
  }
  const body = (await res.json()) as {
    tag_name?: string;
    body?: string;
    assets?: Array<{ name: string; browser_download_url: string }>;
    published_at?: string;
  };
  const tag = (body.tag_name ?? '').replace(/^v/, '');
  const asset = body.assets?.find((a) => ASSET_NAME_PATTERN.test(a.name));
  return writeState({
    latestVersion: tag || null,
    lastCheckedAt: new Date().toISOString(),
    releaseNotes: body.body ?? null,
    releaseAssetUrl: asset?.browser_download_url ?? null,
    error: tag ? null : 'Release sin tag o sin asset .zip reconocible.',
  });
}

function toDTO(state: StoredUpdaterState): UpdaterStatusDTO {
  const hasUpdate =
    !!state.latestVersion && versionGT(state.latestVersion, config.version);
  return {
    currentVersion: config.version,
    latestVersion: state.latestVersion,
    hasUpdate,
    lastCheckedAt: state.lastCheckedAt,
    releaseNotes: state.releaseNotes,
    releaseAssetUrl: state.releaseAssetUrl,
    checking,
    error: state.error,
  };
}

/** Find the update.ps1 script next to the server bundle. */
function findUpdaterScript(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'update.ps1'),
    path.resolve(process.cwd(), '..', 'update.ps1'),
    // Prod install path (when run as Windows Service by WinSW):
    path.resolve(process.env.ProgramFiles ?? 'C:\\Program Files', 'MyCRM', 'update.ps1'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export async function registerUpdaterRoutes(app: App): Promise<void> {
  app.get('/api/updater/status', { preHandler: requireAuth }, async () => {
    return { status: toDTO(readState()) };
  });

  app.post('/api/updater/check', { preHandler: requireRole('owner') }, async () => {
    if (checking) return { status: toDTO(readState()) };
    checking = true;
    try {
      const next = await fetchLatestRelease();
      return { status: toDTO(next) };
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      const next = writeState({ error: msg, lastCheckedAt: new Date().toISOString() });
      return { status: toDTO(next) };
    } finally {
      checking = false;
    }
  });

  app.post('/api/updater/apply', { preHandler: requireRole('owner') }, async (req, reply) => {
    const body = applyUpdateSchema.parse(req.body ?? {});
    const state = readState();
    const target = body.version ?? state.latestVersion;
    if (!target) {
      const res: ApplyUpdateResponse = {
        status: 'no-candidate',
        version: null,
        message: 'Corré /api/updater/check primero para descubrir la versión disponible.',
      };
      reply.status(400).send(res);
      return;
    }
    if (!versionGT(target, config.version)) {
      const res: ApplyUpdateResponse = {
        status: 'already-up-to-date',
        version: target,
        message: `La versión ${target} ya está instalada o es anterior.`,
      };
      return res;
    }

    const script = findUpdaterScript();
    if (!script) {
      reply.status(503).send({
        status: 'no-candidate',
        version: target,
        message:
          'No encontré update.ps1 en el filesystem. ¿Está instalado via install.bat? ' +
          'Si estás corriendo en modo dev, aplicá el update manualmente.',
      });
      return;
    }

    // Detach: spawn PowerShell in a new process with stdin closed so we can
    // exit the service cleanly. The updater handles the rest.
    logger.info({ script, target }, 'updater: launching update script');
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', script,
        '-TargetVersion', target,
        ...(state.releaseAssetUrl ? ['-AssetUrl', state.releaseAssetUrl] : []),
      ],
      {
        cwd: path.dirname(script),
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    child.unref();

    const res: ApplyUpdateResponse = {
      status: 'initiated',
      version: target,
      message:
        'Update iniciado. El servicio se va a detener en instantes y reiniciar ' +
        'con la versión nueva. La UI se desconectará; esperá ~30 segundos y recargá.',
    };
    return res;
  });
}
