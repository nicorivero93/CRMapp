# MyCRM Local Edition - Updater
#
# Corre como el user del service (SYSTEM vía WinSW) cuando el server llama
# POST /api/updater/apply. También funciona manualmente vía:
#   powershell -ExecutionPolicy Bypass -File update.ps1 -TargetVersion 0.2.0
#
# Flujo:
#   1. Descargar release ZIP del tag target desde GitHub.
#   2. Verificar integridad (tamaño + unzip).
#   3. Snapshot del install actual → C:\ProgramData\MyCRM\backups\<ts>\
#   4. Stop service.
#   5. Replace archivos en C:\Program Files\MyCRM\ (preserva data/).
#   6. Start service.
#   7. Health check loop: 15 intentos con 2s de delay a /api/health.
#   8. Si health falla → rollback desde backup + start service viejo + exit 1.
#   9. Limpiar backups viejos (keep 3).

param(
    [Parameter(Mandatory = $true)]
    [string]$TargetVersion,
    [string]$AssetUrl = '',
    [string]$InstallDir = "$env:ProgramFiles\MyCRM",
    [string]$ServiceName = 'MyCRMServer',
    [int]$Port = 3180
)

# Restore Windows standard PATH. Some PCs (corporate profiles, AnyDesk shells,
# WinSW/SYSTEM with stripped env) ship without System32 in PATH, which makes
# `robocopy`, `netsh`, `sc`, etc. fail with CommandNotFoundException.
# Harmless when PATH is already correct — we just prepend the canonical dirs.
$env:PATH = "$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\Wbem;$env:SystemRoot\System32\WindowsPowerShell\v1.0;$env:PATH"

# Self-cleanup: when the server dispatches this script via Task Scheduler
# (v0.1.6+), a task named "MyCRMUpdate" was created just before. Delete it
# on exit no matter how we finish — completion, rollback, or uncaught crash.
# Pre-v0.1.6 flows don't have this task, so /Delete will no-op.
$Script:CleanupTaskOnExit = $true

# Boot marker: write BEFORE any other logic so we can prove PowerShell
# actually started the script, even if $ErrorActionPreference later kills us.
try {
    $bootMarker = Join-Path $env:ProgramData 'MyCRM\logs\update-boot.log'
    $bootDir = Split-Path $bootMarker -Parent
    if (-not (Test-Path $bootDir)) {
        New-Item $bootDir -ItemType Directory -Force | Out-Null
    }
    $bootLine = "[{0}] update.ps1 booted: target={1} pid={2} user={3}" -f `
        (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'), $TargetVersion, $PID, $env:USERNAME
    Add-Content -Path $bootMarker -Value $bootLine -Encoding UTF8
} catch {
    # If we can't even write a marker, continue anyway — downstream logging
    # will capture the crash.
}

$ErrorActionPreference = 'Stop'
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $env:ProgramData 'MyCRM\backups'
$backupDir = Join-Path $backupRoot $ts
$tempRoot = Join-Path $env:TEMP "mycrm-update-$ts"
$logFile = Join-Path $env:ProgramData "MyCRM\logs\update-$ts.log"

function Write-Log {
    param([string]$msg, [string]$level = 'INFO')
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'HH:mm:ss'), $level, $msg
    Write-Host $line
    try {
        New-Item (Split-Path $logFile -Parent) -ItemType Directory -Force -ErrorAction SilentlyContinue | Out-Null
        Add-Content -Path $logFile -Value $line -Encoding UTF8
    } catch {}
}

function Cleanup-ScheduledTask {
    # Remove the one-shot task the server created to dispatch us (v0.1.6+
    # spawn path). Also clean up the .bat/.xml helpers from v0.1.8+. No-op
    # on legacy manual runs.
    if ($Script:CleanupTaskOnExit) {
        try {
            & "$env:SystemRoot\System32\schtasks.exe" /Delete /TN MyCRMUpdate /F 2>&1 | Out-Null
        } catch {}
        try {
            $dispatchDir = Join-Path $env:ProgramData 'MyCRM'
            Remove-Item (Join-Path $dispatchDir 'update-runner.bat') -Force -ErrorAction SilentlyContinue
            Remove-Item (Join-Path $dispatchDir 'update-runner.xml') -Force -ErrorAction SilentlyContinue
        } catch {}
    }
}

function Rollback {
    param([string]$reason)
    Write-Log "ROLLBACK: $reason" 'ERROR'
    try {
        Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
        if (Test-Path $backupDir) {
            # Wipe install, restore from backup
            $empty = Join-Path $env:TEMP "empty-$ts"
            New-Item $empty -ItemType Directory -Force | Out-Null
            robocopy $empty $InstallDir /MIR /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
            Remove-Item $empty -Force
            robocopy $backupDir $InstallDir /MIR /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
            Write-Log "Archivos restaurados desde $backupDir" 'INFO'
        }
        Start-Service $ServiceName -ErrorAction SilentlyContinue
    } catch {
        Write-Log ("Rollback tiró error: " + $_.Exception.Message) 'ERROR'
    }
    Cleanup-ScheduledTask
    exit 1
}

Write-Log "== MyCRM Updater iniciado =="
Write-Log "Target: $TargetVersion | InstallDir: $InstallDir"

# 1. Resolver asset URL si no vino.
if (-not $AssetUrl) {
    Write-Log "Consultando GitHub releases por tag v$TargetVersion..."
    try {
        $api = "https://api.github.com/repos/nicorivero93/CRMapp/releases/tags/v$TargetVersion"
        $rel = Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent' = 'mycrm-updater' }
        $asset = $rel.assets | Where-Object { $_.name -match 'mycrm-local.*\.zip$' } | Select-Object -First 1
        if (-not $asset) { throw "Release v$TargetVersion no tiene asset mycrm-local*.zip" }
        $AssetUrl = $asset.browser_download_url
    } catch {
        Write-Log ("No pude resolver asset: " + $_.Exception.Message) 'ERROR'
        exit 1
    }
}
Write-Log "Asset URL: $AssetUrl"

# 2. Descargar.
New-Item $tempRoot -ItemType Directory -Force | Out-Null
$zipPath = Join-Path $tempRoot 'release.zip'
$extractDir = Join-Path $tempRoot 'extracted'
Write-Log "Descargando ZIP a $zipPath ..."
try {
    Invoke-WebRequest -Uri $AssetUrl -OutFile $zipPath -UseBasicParsing
    $size = (Get-Item $zipPath).Length
    if ($size -lt 1MB) { throw "ZIP parece corrupto ($size bytes)" }
    Write-Log ("Descargado OK (" + ('{0:N1}' -f ($size / 1MB)) + " MB)")
} catch {
    Write-Log ("Download falló: " + $_.Exception.Message) 'ERROR'
    exit 1
}

# 3. Extraer.
Write-Log "Extrayendo a $extractDir ..."
try {
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    if (-not (Test-Path (Join-Path $extractDir 'server-bundle.cjs'))) {
        throw "ZIP no contiene server-bundle.cjs (estructura inválida)"
    }
} catch {
    Write-Log ("Extract falló: " + $_.Exception.Message) 'ERROR'
    exit 1
}

# 4. Backup del install actual (pre-replace).
Write-Log "Creando backup en $backupDir ..."
New-Item $backupDir -ItemType Directory -Force | Out-Null
if (Test-Path $InstallDir) {
    robocopy $InstallDir $backupDir /MIR /NFL /NDL /NJH /NJS /NC /NS /NP /XJ | Out-Null
    Write-Log "Backup creado."
} else {
    Write-Log "InstallDir no existe todavía — instalación fresh, skip backup." 'WARN'
}

# 5. Stop service.
Write-Log "Deteniendo servicio $ServiceName ..."
try {
    Stop-Service $ServiceName -Force -ErrorAction Stop
    Start-Sleep -Seconds 2
} catch {
    Write-Log ("Stop service error (continuamos): " + $_.Exception.Message) 'WARN'
}

# 6. Replace files. El install nunca borra data/; sólo reemplaza binarios + web UI.
Write-Log "Copiando archivos nuevos a $InstallDir ..."
try {
    # Mirror sin borrar data/
    robocopy $extractDir $InstallDir /E /NFL /NDL /NJH /NJS /NC /NS /NP /XD "data" | Out-Null
    # robocopy returns 0-7 as success, 8+ as error
    if ($LASTEXITCODE -gt 7) {
        Rollback "robocopy returned $LASTEXITCODE"
    }
} catch {
    Rollback ("Copy falló: " + $_.Exception.Message)
}

# 7. Start service.
Write-Log "Iniciando servicio..."
try {
    Start-Service $ServiceName -ErrorAction Stop
} catch {
    Rollback ("Start service falló: " + $_.Exception.Message)
}

# 8. Health check loop.
Write-Log "Esperando health check (max 30s)..."
$healthy = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-RestMethod -Uri "http://localhost:$Port/api/health" -TimeoutSec 3
        if ($r.status -eq 'ok' -and $r.db -eq 'ok') {
            $healthy = $true
            Write-Log ("Health OK en intento " + ($i + 1) + ". Version: " + $r.version)
            break
        }
    } catch {
        # retry
    }
}

if (-not $healthy) {
    Rollback "Health check timeout — el server nuevo no arrancó correctamente"
}

# 9. Limpiar: quedarse con 3 backups más recientes.
try {
    Get-ChildItem $backupRoot -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        Select-Object -Skip 3 |
        ForEach-Object {
            Write-Log ("Borrando backup viejo: " + $_.Name)
            Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
} catch {}

Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue

# 10. Self-cleanup of the scheduled task (v0.1.6+ spawn path).
Cleanup-ScheduledTask

Write-Log "== Update COMPLETO a v$TargetVersion =="
exit 0
