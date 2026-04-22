@echo off
REM =============================================================
REM  MyCRM Local Edition - Uninstaller
REM  Preserva la DB en %ProgramData%\MyCRM\data\ para no perder leads.
REM =============================================================
setlocal EnableExtensions

echo.
echo === MyCRM Local Server uninstall ===
echo.

net session >nul 2>&1
if errorlevel 1 (
    echo ERROR: correr como Administrador.
    pause
    exit /b 1
)

set "INSTALL_DIR=%ProgramFiles%\MyCRM"
set "DATA_DIR=%ProgramData%\MyCRM\data"
set "SERVICE_NAME=MyCRMServer"
set "WINSW=%INSTALL_DIR%\winsw.exe"

if exist "%WINSW%" (
    echo -^> Deteniendo servicio...
    "%WINSW%" stop "%INSTALL_DIR%\winsw.xml" >nul 2>&1
    echo -^> Desinstalando servicio...
    "%WINSW%" uninstall "%INSTALL_DIR%\winsw.xml" >nul 2>&1
) else (
    sc stop %SERVICE_NAME% >nul 2>&1
    sc delete %SERVICE_NAME% >nul 2>&1
)

echo -^> Removiendo regla de firewall...
netsh advfirewall firewall delete rule name="MyCRM (3180)" >nul 2>&1

if exist "%INSTALL_DIR%" (
    echo -^> Borrando archivos de programa...
    rmdir /S /Q "%INSTALL_DIR%"
)

echo.
echo === Listo ===
echo.
echo La DB quedo en: %DATA_DIR%
echo Si queres borrarla tambien, eliminala a mano.
echo.
pause
endlocal
