import { BookOpen, Download, Zap } from 'lucide-react';

interface Doc {
  id: string;
  title: string;
  description: string;
  file: string;
  icon: typeof Zap;
  updatedAt: string;
}

const DOCS: Doc[] = [
  {
    id: 'automations',
    title: 'Automatizaciones',
    description:
      'Cómo armar reglas SI → Y → ENTONCES: triggers, acciones, condiciones y 5 ejemplos listos para copiar.',
    file: '/docs/instructivo-automatizaciones.pdf',
    icon: Zap,
    updatedAt: 'Abril 2026',
  },
];

export default function Conocimiento() {
  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <BookOpen size={20} className="text-brand-400" /> Conocimiento
        </h1>
        <p className="text-sm text-text-dim">
          Guías y manuales para sacarle todo el jugo al CRM. Descargables en PDF.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {DOCS.map((d) => {
          const Icon = d.icon;
          return (
            <div
              key={d.id}
              className="flex flex-col rounded-lg border border-border bg-bg-soft p-4 transition hover:border-brand-500/40"
            >
              <div className="mb-2 flex items-center gap-2">
                <div className="rounded-md bg-brand-500/10 p-2 text-brand-400">
                  <Icon size={16} />
                </div>
                <div className="font-medium">{d.title}</div>
              </div>
              <p className="mb-4 flex-1 text-sm text-text-dim">{d.description}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-text-faint">Actualizado · {d.updatedAt}</span>
                <a
                  href={d.file}
                  download
                  className="btn-primary !py-1.5 !text-xs"
                >
                  <Download size={12} /> Descargar PDF
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
