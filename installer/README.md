# MyCRM Local Edition — Instalación

Guía para instalar MyCRM en la PC del cliente. **Flujo default**: todo corre en **una sola PC** — un usuario, un navegador, servidor + DB local.

Si en el futuro el cliente crece y necesita 3+ vendedoras conectadas a la vez, ver el **[Anexo: multi-PC](#anexo-multi-pc)** al final.

## Requisitos

- Windows 10 u 11.
- Permisos de Administrador para instalar el servicio.
- ~150 MB libres.

## 1. Armar el release (solo si lo construís vos, una sola vez)

Desde la raíz del repo:

```bash
npm install
powershell -ExecutionPolicy Bypass -File apps/server/packaging/build-release.ps1
```

Resultado: `apps/server/release/` con server + web UI + migrations + installer scripts. Comprimilo:

```powershell
Compress-Archive apps\server\release\* mycrm-local.zip
```

Eso es lo que le mandás al cliente.

## 2. Instalar en la PC del cliente

1. Descomprimí `mycrm-local.zip` en cualquier carpeta temporal.
2. **Click derecho en `install.bat` → "Ejecutar como administrador"**.
3. Esperá. El script:
   - Copia archivos a `C:\Program Files\MyCRM\`.
   - Crea DB vacía en `C:\ProgramData\MyCRM\data\mycrm.db`.
   - Descarga WinSW y registra `MyCRMServer` como servicio de Windows (arranca solo con el sistema).
4. Al terminar imprime la URL: **`http://localhost:3180`**.

## 3. Primer uso

1. Abrí **`http://localhost:3180`** en el navegador.
2. Te recibe el wizard de primer arranque → creás la cuenta del dueño (email + password).
3. Ya estás adentro del CRM. Importá tus leads y arrancá.

**Tip**: hacé que Chrome/Edge abra esa URL al iniciar Windows, o dejá un shortcut en el escritorio:

```powershell
powershell -ExecutionPolicy Bypass -File create-shortcut.ps1 -ServerHost localhost
```

**Alternativa app nativa**: si tenés el `.exe` del desktop wrapper (Tauri), instalalo una vez y se conecta solo a `localhost:3180` sin preguntarte nada. Queda como app de Windows con icono propio.

## 4. Mantenimiento

| Tarea | Cómo |
|---|---|
| Ver logs | `C:\ProgramData\MyCRM\logs\` |
| Reiniciar el servicio | `sc stop MyCRMServer && sc start MyCRMServer` (admin) |
| Backup DB (en caliente, WAL permite) | `copy C:\ProgramData\MyCRM\data\mycrm.db mycrm.backup.db` |
| Actualizar a nueva versión | `uninstall.bat` → descomprimir release nuevo → `install.bat`. La DB se preserva. |
| Desinstalar | Admin → `uninstall.bat`. La DB **NO** se borra (queda en `ProgramData`). |

## Troubleshooting

**"No puedo abrir localhost:3180"**
- Verificá que el servicio esté corriendo: `sc query MyCRMServer` (admin). Status debería ser `RUNNING`.
- Si no arrancó, mirá `C:\ProgramData\MyCRM\logs\MyCRMServer.err.log`.
- Puerto 3180 ocupado: `netstat -ano | findstr :3180` para ver qué lo usa.

**"El servicio se murió"**
- WinSW está configurado con restart automático tras 10s. Si se cayó y no volvió, los logs te dicen por qué.

---

# Anexo: multi-PC

Si en el futuro el cliente quiere que **múltiples vendedoras** accedan al mismo CRM desde sus propias PCs (compartiendo la DB), el código ya lo soporta. Cambios necesarios:

1. **Abrir el puerto en el firewall** del host (no lo hace `install.bat` porque single-PC no lo necesita):
   ```cmd
   netsh advfirewall firewall add rule name="MyCRM (3180)" dir=in action=allow protocol=TCP localport=3180 profile=private,domain
   ```
2. **Obtener el IP LAN** del host: `ipconfig` → `IPv4 Address`.
3. **En cada PC cliente**, correr:
   ```powershell
   powershell -ExecutionPolicy Bypass -File create-shortcut.ps1 -ServerHost 192.168.0.50
   ```
   (reemplazá por el IP real del host). Eso crea `MyCRM.url` en el escritorio.
4. **Para app nativa en cada PC**: distribuir el `.exe` de Tauri (`MyCRM_0.1.0_x64-setup.exe`). En la primera apertura, el wizard pide el IP del server.

5. **En el CRM** (owner loguea):
   - Configuración → Usuarios (owner-only) → crear vendedoras.
   - Configuración → Asignación de leads → setear targets diarios y cambiar `assignmentMode` a `capacity-weighted` para que los leads se repartan automáticamente al importar.

## Acceso desde afuera de la oficina

Fuera de scope del installer. Recomendación: instalar **Tailscale** (gratis hasta 3 usuarios) en el host y en las PCs remotas. No requiere cambios en MyCRM.
