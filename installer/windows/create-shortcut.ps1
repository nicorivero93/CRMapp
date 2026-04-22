# Creates a desktop shortcut "MyCRM" that opens the CRM in the default browser.
# Corre esto en la PC de CADA VENDEDORA (no en el servidor).
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File create-shortcut.ps1 -ServerHost 192.168.0.50
#   # o con hostname mDNS:
#   powershell -ExecutionPolicy Bypass -File create-shortcut.ps1 -ServerHost mycrm.local

param(
    [string]$ServerHost = '',
    [int]$Port = 3180
)

if (-not $ServerHost) {
    $ServerHost = Read-Host "IP o hostname del servidor (ej. 192.168.0.50 o mycrm.local)"
}

$url = "http://${ServerHost}:${Port}"
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'MyCRM.url'

# .url file = Windows internet shortcut, opens in default browser
@"
[InternetShortcut]
URL=$url
IconIndex=0
"@ | Out-File $lnkPath -Encoding ASCII

Write-Host "[OK] Acceso directo creado en el escritorio:" -ForegroundColor Green
Write-Host "    $lnkPath"
Write-Host "    URL: $url"
Write-Host ""
Write-Host "Hacé doble-click para abrir MyCRM." -ForegroundColor Cyan
