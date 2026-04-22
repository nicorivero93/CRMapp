import { Construction } from 'lucide-react';

interface Props {
  feature: string;
  phase: string;
  note?: string;
}

export function ComingSoon({ feature, phase, note }: Props) {
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
          <Construction size={22} />
        </div>
        <h2 className="text-xl font-semibold">{feature}</h2>
        <p className="mt-2 text-sm text-text-dim">
          Llega en <span className="font-mono text-text">{phase}</span> de la Local Edition.
        </p>
        {note && <p className="mt-3 text-xs text-text-faint">{note}</p>}
      </div>
    </div>
  );
}
