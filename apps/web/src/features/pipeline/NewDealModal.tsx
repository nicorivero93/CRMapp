import { useState } from 'react';
import { X } from 'lucide-react';

export function NewDealModal({
  stageName, onClose, onCreate,
}: {
  stageName: string;
  onClose: () => void;
  onCreate: (d: { title: string; company: string; value: number }) => void;
}) {
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [value, setValue] = useState<number>(0);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4">
      <form
        onSubmit={(e) => { e.preventDefault(); if (title) onCreate({ title, company, value }); }}
        className="card w-full max-w-sm p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Nuevo deal</h2>
            <p className="text-xs text-text-dim">En etapa: {stageName}</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost !p-1"><X size={16}/></button>
        </div>
        <div className="space-y-3">
          <input autoFocus className="input" placeholder="Título del deal" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input className="input" placeholder="Empresa" value={company} onChange={(e) => setCompany(e.target.value)} />
          <input className="input" type="number" placeholder="Monto USD" value={value} onChange={(e) => setValue(Number(e.target.value))} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
          <button className="btn-primary">Crear</button>
        </div>
      </form>
    </div>
  );
}
