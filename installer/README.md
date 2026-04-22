# MyCRM Local Edition — Instalación

Esta guía es para el **dueño/técnico** que instala MyCRM en la PC de la oficina. Las vendedoras solo abren el navegador.

## Requisitos

- **PC host** (la que va a correr MyCRM): Windows 10 u 11, con permisos de Administrador.
- **PCs cliente** (vendedoras): cualquier OS con navegador moderno.
- Todas en **la misma red LAN** (router / Wi-Fi de oficina).

## 1. Armar el release (solo si construís vos)

Desde la raíz del repo:

```bash
npm install
npm run build:server
pwsh apps/server/packaging/build-release.ps1
```

Esto deja todo listo en `apps/server/dist/release/`. Comprimí esa carpeta:

```powershell
Compress-Archive apps\server\dist\release\* mycrm-local-server.zip
```

Y mandale ese `.zip` al cliente.

## 2. Instalar el servidor (en la PC host)

1. Descomprimí `mycrm-local-server.zip` en cualquier carpeta (ej. `C:\Users\Nico\Desktop\mycrm-local-server\`).
2. **Click derecho en `install.bat` → "Ejecutar como administrador"**.
3. Esperá. El script:
   - Copia los archivos a `C:\Program Files\MyCRM\`.
   - Crea la DB vacía en `C:\ProgramData\MyCRM\data\mycrm.db`.
   - Descarga **WinSW** y registra `MyCRMServer` como servicio de Windows (arranca con el sistema).
   - Abre puerto **3180** en Windows Firewall.
4. Al terminar, anota el IP que muestra (ej. `192.168.0.50`).

**Chequear que corre:**
- En la PC host, abrí `http://localhost:3180` → deberías ver el wizard de owner.
- Creá la cuenta del dueño (email + contraseña). Ya configurás targets, templates y reciclaje desde ahí.

## 3. Conectar las PCs de las vendedoras

En cada PC cliente, en PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File create-shortcut.ps1 -ServerHost 192.168.0.50
```

(Reemplazá `192.168.0.50` por el IP de la PC host.) Eso crea `MyCRM.url` en el escritorio. Doble-click → abre MyCRM en el navegador.

Alternativa: en cualquier navegador, ir a `http://<IP-DEL-SERVIDOR>:3180`, hacer login, marcar como favorito.

## 4. Mantenimiento básico

| Tarea | Cómo |
|---|---|
| Ver logs del servidor | `C:\ProgramData\MyCRM\logs\` |
| Reiniciar el servicio | `sc stop MyCRMServer && sc start MyCRMServer` (admin) |
| Backup de la DB | `copy C:\ProgramData\MyCRM\data\mycrm.db mycrm.backup.db` (en caliente, WAL permite) |
| Actualizar a nueva versión | Correr `uninstall.bat` → descomprimir nuevo release → `install.bat`. La DB se preserva. |
| Desinstalar | **Administrador** → `uninstall.bat`. La DB **NO** se borra (queda en `ProgramData`). |

## Acceso desde afuera de la oficina

Fuera de alcance del instalador. Recomendación: instalá **Tailscale** (gratis hasta 3 usuarios) en la PC host y en las PCs/celus que accedan remotamente. No requiere cambios en MyCRM.

## Troubleshooting

**"No puedo acceder desde otra PC"**
- Verificá que ambas PCs están en la misma red (`ipconfig` y compará subred).
- En la PC host corrió `install.bat` como admin y la regla de firewall se agregó.
- Probá desde la PC cliente: `curl http://<IP-HOST>:3180/api/health`. Debería devolver `{"status":"ok",...}`.

**"El servicio no arranca"**
- Mirá los logs en `C:\ProgramData\MyCRM\logs\MyCRMServer.out.log` y `.err.log`.
- Verificá que el puerto 3180 esté libre: `netstat -ano | findstr :3180`.

**"Cambié de IP y se me cayó todo"**
- Los clientes usan el IP del host, si cambia hay que regenerar los shortcuts.
- Solución permanente: usar el **hostname del host** en lugar del IP (ej. `http://mycrm-host-pc:3180`) — Windows lo resuelve en LAN por NetBIOS.
