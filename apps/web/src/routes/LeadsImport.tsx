import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileText, Upload, Clipboard } from 'lucide-react';
import type { ImportReportDTO, LeadSource } from '@mycrm/shared';
import { api, ApiError } from '@/lib/api';

const SOURCE_OPTIONS: Array<{ value: LeadSource; label: string }> = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'meta-lead-ads', label: 'Meta Lead Ads' },
  { value: 'sheets-import', label: 'Google Sheets' },
  { value: 'csv-import', label: 'CSV' },
  { value: 'bulk-paste', label: 'Pegado' },
  { value: 'manual', label: 'Manual' },
];

export default function LeadsImport() {
  const [csvSource, setCsvSource] = useState<LeadSource>('csv-import');
  const [pasteSource, setPasteSource] = useState<LeadSource>('bulk-paste');
  const [pasteText, setPasteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastReport, setLastReport] = useState<ImportReportDTO | null>(null);

  async function submitCsv(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('source', csvSource);
      form.append('defaultCountry', 'AR');
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const payload = await res.json();
      if (!res.ok) throw new ApiError(res.status, payload.code, payload.error ?? 'Import falló');
      setLastReport(payload as ImportReportDTO);
      toast.success(`${payload.imported} lead${payload.imported === 1 ? '' : 's'} importados`);
    } catch (err: any) {
      toast.error(err.message ?? 'Error al importar');
    } finally {
      setBusy(false);
    }
  }

  async function submitPaste(e: React.FormEvent) {
    e.preventDefault();
    if (!pasteText.trim()) return;
    setBusy(true);
    try {
      const report = await api.post<ImportReportDTO>('/api/leads/paste', {
        text: pasteText,
        source: pasteSource,
        defaultCountry: 'AR',
      });
      setLastReport(report);
      toast.success(`${report.imported} lead${report.imported === 1 ? '' : 's'} importados`);
      setPasteText('');
    } catch (err: any) {
      toast.error(err.message ?? 'Error al importar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Upload size={20} className="text-brand-400" /> Importar leads
        </h1>
        <p className="text-sm text-text-dim">CSV o paste directo desde Excel/Sheets. Se deduplica por teléfono automáticamente.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-border bg-bg-soft p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FileText size={16} className="text-brand-400" /> Subir CSV
          </div>
          <p className="mb-3 text-xs text-text-dim">
            Columnas soportadas: <code className="text-text">nombre</code>, <code className="text-text">teléfono</code>, <code className="text-text">notas</code>.
            Columnas extra se guardan en <code className="text-text">sourceMeta</code>.
          </p>
          <label className="mb-2 block text-xs text-text-faint">Fuente</label>
          <select
            className="input mb-3"
            value={csvSource}
            onChange={(e) => setCsvSource(e.target.value as LeadSource)}
          >
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            className="block w-full text-xs text-text-dim file:mr-3 file:rounded-md file:border-0 file:bg-brand-500/15 file:px-3 file:py-2 file:text-xs file:font-medium file:text-brand-400 hover:file:bg-brand-500/25"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void submitCsv(f);
              e.target.value = '';
            }}
          />
        </section>

        <section className="rounded-lg border border-border bg-bg-soft p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Clipboard size={16} className="text-brand-400" /> Pegar lista
          </div>
          <p className="mb-3 text-xs text-text-dim">
            Una línea por lead. El teléfono se detecta solo; el resto es el nombre.
          </p>
          <form onSubmit={submitPaste} className="space-y-3">
            <label className="block text-xs text-text-faint">Fuente</label>
            <select
              className="input"
              value={pasteSource}
              onChange={(e) => setPasteSource(e.target.value as LeadSource)}
            >
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <textarea
              className="input min-h-[140px] font-mono text-xs"
              placeholder={'Juan Pérez  11 2345 6789\nMaría López +54 911 8765 4321'}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <button disabled={busy || !pasteText.trim()} className="btn-primary w-full">
              {busy ? 'Importando…' : 'Importar pegado'}
            </button>
          </form>
        </section>
      </div>

      {lastReport && (
        <section className="rounded-lg border border-border bg-bg-soft p-4">
          <div className="mb-3 text-sm font-semibold">Último import</div>
          <div className="grid grid-cols-4 gap-3 text-center text-sm">
            <Stat label="Filas" value={lastReport.totalRows} />
            <Stat label="Importados" value={lastReport.imported} color="text-emerald-400" />
            <Stat label="Duplicados" value={lastReport.deduped} color="text-amber-400" />
            <Stat label="Errores" value={lastReport.errors} color="text-red-400" />
          </div>
          {lastReport.errorsSample && lastReport.errorsSample.length > 0 && (
            <details className="mt-3 text-xs text-text-dim">
              <summary className="cursor-pointer">Ver errores</summary>
              <ul className="mt-2 space-y-1 font-mono">
                {lastReport.errorsSample.map((e, i) => (
                  <li key={i} className="text-text-faint">• {e}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="mt-3 text-xs">
            <Link to="/app/leads" className="text-brand-400 hover:underline">Ver en la lista →</Link>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-md border border-border bg-bg/40 p-2">
      <div className={`text-lg font-semibold ${color ?? 'text-text'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-text-faint">{label}</div>
    </div>
  );
}
