import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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

/** Windows Task Scheduler: one-shot task that runs update.ps1 OUTSIDE the
 *  service's Job Object. Without this, Stop-Service inside update.ps1 would
 *  destroy WinSW's Job Object and kill the updater mid-run. See plan.md. */
const TASK_NAME = 'MyCRMUpdate';

const execFileAsync = promisify(execFile);

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

export interface SchtasksInvocation {
  args: string[];
  stdout: string;
  stderr: string;
  code: number | null;
}

/** Thin wrapper around schtasks.exe. Never throws — returns the exit code
 *  so callers can branch cleanly. Exposed via `updaterDeps` so tests can
 *  spy/mock it without spinning up real Windows tasks. */
async function runSchtasksReal(args: string[]): Promise<SchtasksInvocation> {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
  const schtasksExe = path.join(systemRoot, 'System32', 'schtasks.exe');
  try {
    const { stdout, stderr } = await execFileAsync(schtasksExe, args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return { args, stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
    return {
      args,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message ?? '',
      code: typeof e.code === 'number' ? e.code : 1,
    };
  }
}

/** Mockable dependency surface. Tests use vi.spyOn on these fields. */
export const updaterDeps = {
  runSchtasks: runSchtasksReal,
};

/** Append a line to update-marker.log so we can reconstruct what happened
 *  from disk even if the process died before logging to pino. */
function markerLog(logDir: string, line: string): void {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'update-marker.log'),
      `[${new Date().toISOString()}] ${line}\n`,
    );
  } catch {
    // best-effort; never crash the handler on log write
  }
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

    const logDir = path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'MyCRM', 'logs');
    const dispatchDir = path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'MyCRM');
    markerLog(logDir, `apply start: target=${target} script=${script}`);

    // The scheduled task has to escape two pitfalls that bit us in 0.1.6 / 0.1.7:
    //   1. `schtasks /TR` has a ~261-char limit. The powershell path + update.ps1
    //      path + GitHub asset URL blow past that and get silently truncated
    //      (observed: URL lost its ".zip" suffix → "conexión terminada" on download).
    //   2. Tasks created via `schtasks /Create` inherit defaults that include
    //      "Don't start if on batteries" + "Stop if going on batteries". For
    //      cobradores/vendedores on notebooks in the street, that kills the
    //      update silently.
    // Fix: write a .bat runner (no length limit) and register the task via
    // `schtasks /XML` where we can set battery options explicitly.
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
    const psExe = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const runnerBatPath = path.join(dispatchDir, 'update-runner.bat');
    const runnerXmlPath = path.join(dispatchDir, 'update-runner.xml');

    const assetUrlArg = state.releaseAssetUrl ? ` -AssetUrl "${state.releaseAssetUrl}"` : '';
    const runnerBatContent =
      `@echo off\r\n` +
      `REM Generado por MyCRM server v${config.version} para dispatch del updater.\r\n` +
      `REM Auto-borrado por update.ps1 al terminar (happy path o rollback).\r\n` +
      `"${psExe}" -NoProfile -ExecutionPolicy Bypass -File "${script}" -TargetVersion ${target}${assetUrlArg}\r\n` +
      `exit /b %ERRORLEVEL%\r\n`;
    try {
      fs.mkdirSync(dispatchDir, { recursive: true });
      fs.writeFileSync(runnerBatPath, runnerBatContent, 'utf8');
    } catch (err) {
      markerLog(logDir, `runner .bat write failed: ${(err as Error).message}`);
      reply.status(500).send({
        status: 'no-candidate',
        version: target,
        message:
          `No pude escribir el runner del updater en ${runnerBatPath}. ` +
          `Motivo: ${(err as Error).message}`,
      });
      return;
    }

    // Task XML — must be UTF-16 LE with BOM (schtasks requirement).
    // S-1-5-18 = LocalSystem SID. AllowStartOnDemand + no trigger means the
    // task only runs when dispatched via `schtasks /Run`.
    const taskXml =
      `<?xml version="1.0" encoding="UTF-16"?>\r\n` +
      `<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">\r\n` +
      `  <RegistrationInfo>\r\n` +
      `    <Description>MyCRM one-shot updater dispatch (v${config.version})</Description>\r\n` +
      `  </RegistrationInfo>\r\n` +
      `  <Principals>\r\n` +
      `    <Principal id="Author">\r\n` +
      `      <UserId>S-1-5-18</UserId>\r\n` +
      `      <RunLevel>HighestAvailable</RunLevel>\r\n` +
      `    </Principal>\r\n` +
      `  </Principals>\r\n` +
      `  <Settings>\r\n` +
      `    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>\r\n` +
      `    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>\r\n` +
      `    <AllowHardTerminate>true</AllowHardTerminate>\r\n` +
      `    <StartWhenAvailable>true</StartWhenAvailable>\r\n` +
      `    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>\r\n` +
      `    <AllowStartOnDemand>true</AllowStartOnDemand>\r\n` +
      `    <Enabled>true</Enabled>\r\n` +
      `    <Hidden>false</Hidden>\r\n` +
      `    <RunOnlyIfIdle>false</RunOnlyIfIdle>\r\n` +
      `    <WakeToRun>false</WakeToRun>\r\n` +
      `    <ExecutionTimeLimit>PT30M</ExecutionTimeLimit>\r\n` +
      `    <Priority>7</Priority>\r\n` +
      `    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>\r\n` +
      `    <IdleSettings>\r\n` +
      `      <StopOnIdleEnd>false</StopOnIdleEnd>\r\n` +
      `      <RestartOnIdle>false</RestartOnIdle>\r\n` +
      `    </IdleSettings>\r\n` +
      `  </Settings>\r\n` +
      `  <Actions Context="Author">\r\n` +
      `    <Exec>\r\n` +
      `      <Command>${runnerBatPath}</Command>\r\n` +
      `    </Exec>\r\n` +
      `  </Actions>\r\n` +
      `</Task>\r\n`;
    try {
      const bom = Buffer.from([0xff, 0xfe]);
      const body = Buffer.from(taskXml, 'utf16le');
      fs.writeFileSync(runnerXmlPath, Buffer.concat([bom, body]));
    } catch (err) {
      markerLog(logDir, `runner .xml write failed: ${(err as Error).message}`);
      reply.status(500).send({
        status: 'no-candidate',
        version: target,
        message: `No pude escribir el XML de la tarea. Motivo: ${(err as Error).message}`,
      });
      return;
    }

    // 1. Defensive delete — a stale task from a previous failed attempt would
    //    make /Create fail with ERROR_ALREADY_EXISTS.
    const delRes = await updaterDeps.runSchtasks(['/Delete', '/TN', TASK_NAME, '/F']);
    if (delRes.code !== 0 && !/no existe|cannot find|does not exist/i.test(delRes.stderr)) {
      markerLog(logDir, `pre-delete warning: code=${delRes.code} stderr=${delRes.stderr.trim()}`);
    }

    // 2. Create the task from the XML (gets battery settings + proper principal).
    const createRes = await updaterDeps.runSchtasks([
      '/Create',
      '/TN', TASK_NAME,
      '/XML', runnerXmlPath,
      '/F',
    ]);
    if (createRes.code !== 0) {
      markerLog(logDir, `schtasks /Create failed: code=${createRes.code} stderr=${createRes.stderr.trim()}`);
      logger.error({ stderr: createRes.stderr, code: createRes.code }, 'updater: schtasks /Create failed');
      reply.status(500).send({
        status: 'no-candidate',
        version: target,
        message:
          'No pude crear la tarea programada del updater. ' +
          `schtasks /Create devolvió código ${createRes.code}: ${createRes.stderr.trim() || 'sin detalle'}. ` +
          'Verificá que el servicio "Task Scheduler" (services.msc) esté habilitado.',
      });
      return;
    }
    markerLog(logDir, `schtasks /Create ok`);

    // 3. Dispatch it.
    const runRes = await updaterDeps.runSchtasks(['/Run', '/TN', TASK_NAME]);
    if (runRes.code !== 0) {
      markerLog(logDir, `schtasks /Run failed: code=${runRes.code} stderr=${runRes.stderr.trim()}`);
      logger.error({ stderr: runRes.stderr, code: runRes.code }, 'updater: schtasks /Run failed');
      // Cleanup the orphaned task so the next attempt starts clean.
      await updaterDeps.runSchtasks(['/Delete', '/TN', TASK_NAME, '/F']);
      reply.status(500).send({
        status: 'no-candidate',
        version: target,
        message:
          'Creé la tarea programada pero no pude dispararla. ' +
          `schtasks /Run devolvió código ${runRes.code}: ${runRes.stderr.trim() || 'sin detalle'}.`,
      });
      return;
    }
    markerLog(logDir, `schtasks /Run ok — update.ps1 should be running now`);
    logger.info({ script, target }, 'updater: scheduled task dispatched');

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
