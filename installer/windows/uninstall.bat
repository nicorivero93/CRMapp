@echo off
REM =============================================================
REM  MyCRM Local Edition - Uninstaller
REM  Preserva la DB en %ProgramData%\MyCRM\data\ para no perder leads.
REM =============================================================
setlocal EnableExtensions

REM --- Restore Windows standard PATH (ver install.bat) ---
set "PATH=%SystemRoot%\System32;%SystemRoot%;%SystemRoot%\System32\Wbem;%SystemRoot%\System32\WindowsPowerShell\v1.0;%PATH%"

echo.
echo === MyCRM Local Server uninstall ===
echo.

whoami /groups | find "S-1-5-32-544" >nul 2>&1
if errorlevel 1 (
    echo ERROR: correr como Administrador.
    echo   Win+X ^> "Terminal (Administrador)" ^> cd "%~dp0" ^> uninstall.bat
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

REM --- Best-effort remove of old firewall rule from previous installs ---
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
