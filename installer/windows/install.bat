@echo off
REM =============================================================
REM  MyCRM Local Edition - Server installer
REM  Runs from the release folder. Requires: Administrator.
REM =============================================================
setlocal EnableExtensions EnableDelayedExpansion

echo.
echo === MyCRM Local Server install ===
echo.

REM --- Admin check usando WindowsPrincipal (API oficial, funciona donde falle net/fltmc) ---
powershell -NoProfile -Command "exit ([int](-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)))"
if errorlevel 1 (
    echo.
    echo ERROR: Este instalador debe correrse como Administrador.
    echo Win+X ^> "Terminal (Administrador)" ^> cd "%~dp0" ^> install.bat
    echo.
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
xcopy /E /Y /I /Q "%SRC_DIR%public"            "%INSTALL_DIR%\public\"      >nul
if exist "%SRC_DIR%update.ps1" copy /Y "%SRC_DIR%update.ps1" "%INSTALL_DIR%\update.ps1" >nul

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

REM --- Summary ---
echo.
echo === Listo ===
echo.
echo   URL      :  http://localhost:3180
echo   Data DB  :  %DATA_DIR%\mycrm.db
echo   Logs     :  %LOG_DIR%
echo.
echo Abrí http://localhost:3180 en tu navegador. El servicio MyCRMServer
echo arranca con Windows automáticamente.
echo.
pause
endlocal
