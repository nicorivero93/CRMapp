# MyCRM Desktop

Tauri 2 wrapper: abre MyCRM como **app nativa de Windows** (acceso directo en escritorio, aparece en barra de tareas, icono propio) que se conecta al servidor MyCRM instalado en la PC host de la oficina.

El server no se incluye acá — esta app es solo el "browser dedicado" para las vendedoras. El server se instala una vez en la PC de la oficina siguiendo [installer/README.md](../../installer/README.md).

## Cómo funciona

1. Al abrir, la app carga `wizard.html` (local, empaquetado).
2. El wizard lee `localStorage` buscando un host+puerto guardado:
   - Si existe → hace `fetch /api/health` a ese host. Si responde OK → redirige `window.location` a `http://host:puerto/` (el server sirve la UI web ahí).
   - Si no existe o el probe falla → muestra form pidiendo IP/hostname.
3. Una vez conectada, la vendedora usa el CRM normal. El webview es persistente; cookies y sesiones duran entre reinicios.

## Dev

Requiere Rust + MSVC Windows SDK + Node instalados (ver root README).

```bash
# Primera vez: generar iconos (placeholder purple "M")
npm run desktop:icons

# Dev mode: abre una ventana que apunta a http://localhost:5174
# (levantá vos aparte `npm run dev` en la raíz para tener el Vite + server).
# OJO: en dev mode el wizard igual intenta conectar al host configurado
# en localStorage; clickeá sobre la URL en el config si querés resetear.
npm --workspace apps/desktop run dev
```

## Build

```bash
npm run build:desktop
# → target/release/bundle/nsis/MyCRM_0.1.0_x64-setup.exe
```

El `.exe` resultante es un instalador NSIS de ~15 MB. Lo distribuís y cada vendedora:
1. Doble-click → wizard de instalación (user-scope, no requiere admin).
2. Al abrir MyCRM → wizard pide IP del server → lista.

## Ajustar el icono

Por default `scripts/generate-icons.ps1` arma un logo placeholder (letra "M" blanca sobre fondo violeta `#6366f1`). Para usar uno real:

1. Pone tu logo cuadrado ≥256×256 en `apps/desktop/icon-source.png`.
2. Corré `npx tauri icon apps/desktop/icon-source.png` — regenera `.ico`, `.icns`, PNGs y assets Android/iOS.
3. Rebuild: `npm run build:desktop`.

## Config persistence

El wizard usa **`localStorage`** del webview, que WebView2 guarda por-app en `%LOCALAPPDATA%/MyCRM/EBWebView/`. No hay archivo JSON que gestionar; desinstalar la app limpia la config. Si la vendedora cambia de server, desde la app misma (después de "Conectar") podría abrirse DevTools (`Ctrl+Shift+I` en dev build) y correr `localStorage.clear()` para forzar el wizard de nuevo. En prod builds DevTools queda deshabilitada.

## Capabilities

Ver `src-tauri/capabilities/default.json`. Solo permitimos `shell:allow-open` (para abrir links externos si hiciera falta) y las `core` básicas. Sin acceso al filesystem, sin acceso a APIs del OS más allá del webview — escudo agresivo para minimizar superficie de ataque si algún día el server se compromete y mete JS malicioso.

## Windows SmartScreen

Los `.exe` sin firma digital disparan el warning "Windows protegió tu equipo" en la primera apertura. Para producción real, firmar con un certificado de code-signing (~$200/año). Para uso interno en una oficina, instruí a la vendedora a click en "Más información" → "Ejecutar de todos modos".
