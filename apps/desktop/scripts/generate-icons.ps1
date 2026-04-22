# Generate a placeholder MyCRM icon set for Tauri.
#
# Produces `icon-source.png` (256x256, white 'M' on brand purple) and then
# calls `npx tauri icon` to derive .ico, .icns, and per-size PNGs into
# `src-tauri/icons/`. Replace `icon-source.png` with a real logo and re-run
# this script when branding is ready.

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktopRoot = Resolve-Path (Join-Path $scriptDir '..')
$sourcePath = Join-Path $desktopRoot 'icon-source.png'

Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'

# Brand purple background with rounded feel (drawn as filled rect + overlay circle).
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(99, 102, 241))
$g.FillRectangle($bgBrush, 0, 0, $size, $size)

# Subtle gradient overlay via a semi-transparent circle
$gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point(0, $size)),
    [System.Drawing.Color]::FromArgb(60, 255, 255, 255),
    [System.Drawing.Color]::FromArgb(0, 255, 255, 255)
)
$g.FillRectangle($gradBrush, 0, 0, $size, $size)

# Letter M centered
$font = New-Object System.Drawing.Font('Segoe UI', 160, [System.Drawing.FontStyle]::Bold, 'Pixel')
$fg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = 'Center'
$sf.LineAlignment = 'Center'
$rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
$g.DrawString('M', $font, $fg, $rect, $sf)

$g.Dispose()
$bmp.Save($sourcePath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Host "[OK] icon-source.png generado: $sourcePath"

# Invoke tauri icon to produce all formats into src-tauri/icons/
Push-Location $desktopRoot
try {
    cmd /c "npx tauri icon `"$sourcePath`""
    if ($LASTEXITCODE -ne 0) { throw "npx tauri icon fallo (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}

Write-Host "[OK] icons generados en src-tauri/icons/"
