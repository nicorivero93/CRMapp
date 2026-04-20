import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Upload, Plus } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { Contact } from '@/lib/types';
import { ContactsTable, ContactFilters } from '@/features/contacts/ContactsTable';
import { Filters } from '@/features/contacts/Filters';
import { CSVImport } from '@/features/contacts/CSVImport';
import { ContactDrawer } from '@/features/contacts/ContactDrawer';

export default function Contacts() {
  const { profile } = useAuth();
  const teamId = profile!.teamId;

  const [filters, setFilters] = useState<ContactFilters>({});
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Contact | null>(null);

  async function handleNew() {
    const name = prompt('Nombre del contacto');
    if (!name) return;
    try {
      await addDoc(collection(db, 'contacts'), {
        teamId,
        name,
        ownerId: profile!.uid,
        status: 'active',
        createdAt: serverTimestamp(),
      });
      toast.success('Contacto creado');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Contactos</h1>
          <p className="text-sm text-text-dim">Gestioná tu base de contactos. Filtrá, importá desde CSV o asigná al equipo.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setImporting(true)} className="btn-outline"><Upload size={14} /> Importar CSV</button>
          <button onClick={handleNew} className="btn-primary"><Plus size={14} /> Nuevo contacto</button>
        </div>
      </div>

      <Filters filters={filters} onChange={setFilters} />

      <div className="min-h-0 flex-1 overflow-auto">
        <ContactsTable filters={filters} onSelect={setSelected} />
      </div>

      {importing && <CSVImport onClose={() => setImporting(false)} />}
      {selected && <ContactDrawer contact={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
