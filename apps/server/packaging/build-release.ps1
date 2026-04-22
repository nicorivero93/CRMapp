# Build the distributable release folder for MyCRM Local Server.
#
# Output: apps/server/dist/release/
#   ├─ node.exe                          (copied from the current Node install)
#   ├─ server-bundle.cjs                 (esbuild output)
#   ├─ drizzle/                          (migration SQL files)
#   ├─ node_modules/better-sqlite3/      (native module + its JS shim + native deps)
#   ├─ data/                             (empty — created fresh on install)
#   ├─ launch.cmd                        (runs `node.exe server-bundle.cjs`)
#   └─ VERSION.txt
#
# Usage: `npm run release` from apps/server (or run this script directly via pwsh).

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverRoot = Resolve-Path (Join-Path $scriptDir '..')
$repoRoot = Resolve-Path (Join-Path $serverRoot '..\..')
$distDir = Join-Path $serverRoot 'dist'
# Dedicated sibling folder for the release bundle; easier to wipe without
# fighting antivirus / file locks than nesting under dist/.
$releaseDir = Join-Path $serverRoot 'release'

Write-Host "== MyCRM release builder ==" -ForegroundColor Cyan
Write-Host "Repo root: $repoRoot"
Write-Host "Server root: $serverRoot"
Write-Host "Release out: $releaseDir"
Write-Host ""

# Clean previous release. Long paths inside nested node_modules can defeat
# Remove-Item, so we mirror an empty dir on top with robocopy first.
if (Test-Path $releaseDir) {
    $empty = Join-Path $env:TEMP ('mycrm-release-clean-' + (Get-Random))
    New-Item $empty -ItemType Directory -Force | Out-Null
    cmd /c "robocopy `"$empty`" `"$releaseDir`" /MIR /NFL /NDL /NJH /NJS /NC /NS /NP >nul 2>&1"
    Remove-Item $empty -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $releaseDir -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item $releaseDir -ItemType Directory -Force | Out-Null

# 1. Ensure bundle is fresh
Write-Host "-> Bundling server with esbuild..." -ForegroundColor Yellow
Push-Location $serverRoot
try {
    # Do NOT pipe stderr of native commands on Windows PS 5.1 — each line
    # wraps in NativeCommandError and $LASTEXITCODE becomes non-zero
    # regardless of actual exit. Let output stream through directly.
    cmd /c "npm run bundle"
    if ($LASTEXITCODE -ne 0) { throw "esbuild bundle failed" }
} finally {
    Pop-Location
}

# 2. Copy server bundle
Copy-Item (Join-Path $distDir 'server-bundle.cjs') (Join-Path $releaseDir 'server-bundle.cjs')

# 3. Copy migrations
Copy-Item (Join-Path $distDir 'drizzle') (Join-Path $releaseDir 'drizzle') -Recurse

# 3b. Build + copy the web UI so the server can serve it at `/`.
#     The static/routes.ts loader looks for `<server-root>/public/index.html`.
Write-Host "-> Building web UI (apps/web)..." -ForegroundColor Yellow
$webRoot = Resolve-Path (Join-Path $repoRoot 'apps\web')
Push-Location $webRoot
try {
    cmd /c "npm run build"
    if ($LASTEXITCODE -ne 0) { throw "web build failed" }
} finally {
    Pop-Location
}
$webDist = Join-Path $webRoot 'dist'
$publicDst = Join-Path $releaseDir 'public'
if (-not (Test-Path $webDist)) { throw "web dist missing at $webDist" }
Copy-Item $webDist $publicDst -Recurse
Write-Host "   copied web UI to release/public/"

# 4. Install runtime-only external npm packages into the release folder.
#    better-sqlite3, @node-rs/argon2, pino, thread-stream, pino-pretty have
#    native addons or worker threads that break when bundled by esbuild.
#    We emit a minimal package.json + npm install --omit=dev: much faster
#    than PowerShell Copy-Item -Recurse for deeply nested trees, and npm
#    handles the transitive graph correctly.
Write-Host "-> Instalando dependencias de runtime (npm install --omit=dev)..." -ForegroundColor Yellow

# Read exact versions from the server package.json so install is reproducible.
$serverPkg = Get-Content (Join-Path $serverRoot 'package.json') -Raw | ConvertFrom-Json
$runtimeDeps = [ordered]@{
    'better-sqlite3'   = $serverPkg.dependencies.'better-sqlite3'
    '@node-rs/argon2'  = $serverPkg.dependencies.'@node-rs/argon2'
    'pino'             = $serverPkg.dependencies.'pino'
}
$devToCopy = [ordered]@{
    'pino-pretty' = $serverPkg.devDependencies.'pino-pretty'
}

$releasePkg = [ordered]@{
    name         = 'mycrm-server-release'
    version      = $serverPkg.version
    private      = $true
    dependencies = $runtimeDeps + $devToCopy
}
$releasePkgJson = $releasePkg | ConvertTo-Json -Depth 5
Set-Content (Join-Path $releaseDir 'package.json') $releasePkgJson -Encoding UTF8

Push-Location $releaseDir
try {
    cmd /c "npm install --omit=dev --no-audit --no-fund --prefer-offline"
    if ($LASTEXITCODE -ne 0) { throw "npm install for release failed" }
} finally {
    Pop-Location
}

$rootModules = Join-Path $repoRoot 'node_modules'
if (-not (Test-Path (Join-Path $releaseDir 'node_modules\better-sqlite3\build\Release\better_sqlite3.node'))) {
    # npm prebuilt fetch may have failed or stashed the .node elsewhere.
    # Fall back to copying from the hoisted root node_modules.
    $srcNode = Join-Path $rootModules 'better-sqlite3\build\Release\better_sqlite3.node'
    if (Test-Path $srcNode) {
        $dstDir = Join-Path $releaseDir 'node_modules\better-sqlite3\build\Release'
        New-Item $dstDir -ItemType Directory -Force | Out-Null
        Copy-Item $srcNode (Join-Path $dstDir 'better_sqlite3.node')
        Write-Host "   copied better_sqlite3.node from root node_modules"
    }
}

# 5. Copy node.exe from the current Node install (must be on PATH)
$nodeExe = (Get-Command node.exe).Source
if (-not $nodeExe) { throw "node.exe not found on PATH" }
Copy-Item $nodeExe (Join-Path $releaseDir 'node.exe')
Write-Host "-> Copied node.exe from $nodeExe" -ForegroundColor Yellow

# 6. Create data/ placeholder
New-Item (Join-Path $releaseDir 'data') -ItemType Directory -Force | Out-Null

# 7. launch.cmd
@'
@echo off
REM MyCRM Local Server launcher.
REM Env vars honored: PORT (default 3180), DB_PATH, COOKIE_SECRET.
cd /d "%~dp0"
set DB_PATH=%~dp0data\mycrm.db
node.exe server-bundle.cjs
'@ | Out-File (Join-Path $releaseDir 'launch.cmd') -Encoding ASCII

# 8. VERSION.txt
$pkg = Get-Content (Join-Path $serverRoot 'package.json') -Raw | ConvertFrom-Json
@"
MyCRM Local Server
Version: $($pkg.version)
Node: $((node --version))
Built: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
"@ | Out-File (Join-Path $releaseDir 'VERSION.txt') -Encoding UTF8

# 9. Copy installer scripts
$installerSrc = Join-Path $repoRoot 'installer\windows'
if (Test-Path $installerSrc) {
    Copy-Item (Join-Path $installerSrc '*') $releaseDir -Force
}

# Size report
$size = (Get-ChildItem $releaseDir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ""
Write-Host "[OK] release/ built at $releaseDir" -ForegroundColor Green
$sizeStr = '{0:F1}' -f $size
Write-Host ('  Total size: ' + $sizeStr + ' MB')
Get-ChildItem $releaseDir | Sort-Object Name | ForEach-Object {
    $suffix = if ($_.PSIsContainer) { '\' } else { '' }
    Write-Host ('  ' + $_.Name + $suffix)
}
