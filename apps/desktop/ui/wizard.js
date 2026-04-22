/**
 * MyCRM desktop first-run wizard.
 *
 * Flow:
 *   1. On boot, read config from localStorage (persistent per Tauri app
 *      identifier).
 *   2. If a host+port is stored, probe `/api/health`; if OK → redirect
 *      window.location to the full URL (the Fastify server serves the
 *      web UI on `/`). If probe fails → show the form with an error.
 *   3. If no config, show the first-run form. On "Conectar", probe the
 *      entered host/port; if OK → save + redirect. If bad → show error.
 *
 * Using plain localStorage + fetch. No Tauri plugin imports needed: the
 * webview has full localStorage/fetch semantics and the config stays in
 * the app's own profile directory managed by WebView2.
 */
(() => {
  const CONFIG_KEY = 'mycrm:server-config:v1';
  const $ = (id) => document.getElementById(id);

  function readConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.host || !parsed.port) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeConfig(cfg) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  }

  function buildUrl(host, port) {
    const h = String(host).trim();
    const p = Number(port) || 3180;
    return `http://${h}:${p}`;
  }

  async function probe(host, port, timeoutMs = 4000) {
    const url = `${buildUrl(host, port)}/api/health`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit' });
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
      const body = await res.json().catch(() => null);
      if (!body || body.status !== 'ok') {
        return { ok: false, reason: 'Respuesta inesperada' };
      }
      return { ok: true, version: body.version };
    } catch (err) {
      if (err && err.name === 'AbortError') return { ok: false, reason: 'Timeout de 4s' };
      return { ok: false, reason: String(err?.message ?? err) };
    } finally {
      clearTimeout(tid);
    }
  }

  function showForm({ prefill, error } = {}) {
    $('boot').hidden = true;
    $('form').hidden = false;
    if (prefill) {
      $('host').value = prefill.host || '';
      $('port').value = prefill.port || 3180;
    }
    const msg = $('msg');
    if (error) {
      msg.className = 'msg err';
      msg.textContent = error;
    } else {
      msg.className = 'msg dim';
      msg.textContent = 'El servidor debe estar corriendo en la PC host.';
    }
    $('host').focus();
  }

  function setBusy(on, text) {
    const btn = $('connect');
    btn.disabled = on;
    btn.textContent = on ? 'Conectando…' : 'Conectar';
    if (text) {
      const msg = $('msg');
      msg.className = 'msg dim';
      msg.textContent = text;
    }
  }

  function redirect(host, port) {
    const url = `${buildUrl(host, port)}/`;
    // Small delay so the user sees the "connected" message briefly, and so
    // any pending localStorage write is flushed before navigation.
    setTimeout(() => {
      window.location.href = url;
    }, 250);
  }

  async function tryAutoConnect() {
    const cfg = readConfig();
    if (!cfg) {
      showForm();
      return;
    }
    const r = await probe(cfg.host, cfg.port);
    if (r.ok) {
      redirect(cfg.host, cfg.port);
      return;
    }
    showForm({
      prefill: cfg,
      error: `No pude conectar a ${cfg.host}:${cfg.port} — ${r.reason}. Verificá que el servidor esté prendido.`,
    });
  }

  async function onConnect(e) {
    e.preventDefault();
    const host = $('host').value.trim();
    const port = Number($('port').value) || 3180;
    if (!host) {
      showForm({ error: 'Ingresá un IP o hostname.' });
      return;
    }
    setBusy(true, `Probando http://${host}:${port}/api/health…`);
    const r = await probe(host, port);
    if (!r.ok) {
      setBusy(false);
      showForm({ prefill: { host, port }, error: `No responde: ${r.reason}` });
      return;
    }
    writeConfig({ host, port });
    const msg = $('msg');
    msg.className = 'msg ok';
    msg.textContent = `Conectado a MyCRM ${r.version ?? ''}. Abriendo…`;
    redirect(host, port);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('connect').addEventListener('click', onConnect);
    $('host').addEventListener('keydown', (e) => { if (e.key === 'Enter') onConnect(e); });
    $('port').addEventListener('keydown', (e) => { if (e.key === 'Enter') onConnect(e); });
    tryAutoConnect();
  });
})();
