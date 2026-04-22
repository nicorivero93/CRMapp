@echo off
REM =============================================================
REM  MyCRM Local Edition - Server installer
REM  Runs from the release folder. Requires: Administrator.
REM =============================================================
setlocal EnableExtensions EnableDelayedExpansion

echo.
echo === MyCRM Local Server install ===
echo.

REM --- Admin check ---
net session >nul 2>&1
if errorlevel 1 (
    echo ERROR: Este instalador debe correrse como Administrador.
    echo        Click derecho sobre install.bat ^> "Ejecutar como administrador".
    pause
    exit /b 1
)

REM --- Paths ---
set "SRC_DIR=%~dp0"
set "INSTALL_DIR=%ProgramFiles%\MyCRM"
set "DATA_DIR=%ProgramData%\MyCRM\data"
set "LOG_DIR=%ProgramData%\MyCRM\logs"
set "SERVICE_NAME=MyCRMServer"

REM --- Stop pre-existing service ---
sc query %SERVICE_NAME% >nul 2>&1
if not errorlevel 1 (
    echo -^> Deteniendo servicio existente...
    net stop %SERVICE_NAME% >nul 2>&1
)

REM --- Create directories ---
echo -^> Creando carpetas...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%DATA_DIR%"    mkdir "%DATA_DIR%"
if not exist "%LOG_DIR%"     mkdir "%LOG_DIR%"

REM --- Copy release files (everything except this script + uninstall + README + WinSW which handled separately) ---
echo -^> Copiando archivos a %INSTALL_DIR% ...
xcopy /E /Y /I /Q "%SRC_DIR%node.exe"          "%INSTALL_DIR%\"         >nul
xcopy /E /Y /I /Q "%SRC_DIR%server-bundle.cjs" "%INSTALL_DIR%\"         >nul
xcopy /E /Y /I /Q "%SRC_DIR%VERSION.txt"       "%INSTALL_DIR%\"         >nul
xcopy /E /Y /I /Q "%SRC_DIR%launch.cmd"        "%INSTALL_DIR%\"         >nul
xcopy /E /Y /I /Q "%SRC_DIR%drizzle"           "%INSTALL_DIR%\drizzle\" >nul
xcopy /E /Y /I /Q "%SRC_DIR%node_modules"      "%INSTALL_DIR%\node_modules\" >nul

REM --- Download WinSW if not present ---
set "WINSW=%INSTALL_DIR%\winsw.exe"
if not exist "%WINSW%" (
    echo -^> Descargando WinSW ^(servicios Windows^)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "Invoke-WebRequest -Uri 'https://github.com/winsw/winsw/releases/download/v3.0.0-alpha.11/WinSW-x64.exe' -OutFile '%WINSW%'" || (
        echo ERROR: No se pudo descargar WinSW. Verificá tu conexion a internet.
        pause
        exit /b 1
    )
)

REM --- Write WinSW service config ---
echo -^> Configurando servicio Windows...
(
    echo ^<service^>
    echo   ^<id^>%SERVICE_NAME%^</id^>
    echo   ^<name^>MyCRM Local Server^</name^>
    echo   ^<description^>MyCRM CRM self-hosted para LAN de oficina.^</description^>
    echo   ^<executable^>%INSTALL_DIR%\node.exe^</executable^>
    echo   ^<arguments^>server-bundle.cjs^</arguments^>
    echo   ^<workingdirectory^>%INSTALL_DIR%^</workingdirectory^>
    echo   ^<env name="DB_PATH" value="%DATA_DIR%\mycrm.db"/^>
    echo   ^<env name="NODE_ENV" value="production"/^>
    echo   ^<env name="PORT" value="3180"/^>
    echo   ^<log mode="roll-by-size"^>
    echo     ^<sizeThreshold^>10240^</sizeThreshold^>
    echo     ^<keepFiles^>5^</keepFiles^>
    echo   ^</log^>
    echo   ^<logpath^>%LOG_DIR%^</logpath^>
    echo   ^<onfailure action="restart" delay="10 sec"/^>
    echo   ^<startmode^>Automatic^</startmode^>
    echo ^</service^>
) > "%INSTALL_DIR%\winsw.xml"

REM --- Uninstall previous service before reinstall ---
"%WINSW%" uninstall "%INSTALL_DIR%\winsw.xml" >nul 2>&1

REM --- Install + start ---
"%WINSW%" install "%INSTALL_DIR%\winsw.xml"
if errorlevel 1 (
    echo ERROR: winsw install fallo.
    pause
    exit /b 1
)
"%WINSW%" start "%INSTALL_DIR%\winsw.xml"
if errorlevel 1 (
    echo ERROR: no se pudo iniciar el servicio.
    pause
    exit /b 1
)

REM --- Firewall rule (TCP 3180 inbound) ---
echo -^> Abriendo puerto 3180 en firewall...
netsh advfirewall firewall delete rule name="MyCRM (3180)" >nul 2>&1
netsh advfirewall firewall add rule name="MyCRM (3180)" dir=in action=allow protocol=TCP localport=3180 profile=private,domain >nul
if errorlevel 1 (
    echo AVISO: no se pudo agregar regla de firewall. Agregala a mano si otra PC no puede conectar.
)

REM --- Summary ---
echo.
echo === Listo ===
echo.
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4"') do (
    set "IP=%%i"
    set "IP=!IP: =!"
    echo   URL local  :  http://localhost:3180
    echo   URL LAN    :  http://!IP!:3180
    goto :ip_done
)
:ip_done
echo   URL mDNS   :  http://mycrm.local:3180   ^(cuando funcione mDNS^)
echo   Data DB    :  %DATA_DIR%\mycrm.db
echo   Logs       :  %LOG_DIR%
echo.
echo Las vendedoras entran desde su navegador usando la URL de LAN de arriba.
echo Para crear accesos directos en sus escritorios: correr create-shortcut.ps1 en cada PC.
echo.
pause
endlocal
