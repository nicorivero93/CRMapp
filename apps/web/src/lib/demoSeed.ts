import { addDoc, collection, doc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

const COUNTRIES = ['Argentina', 'Chile', 'México', 'España', 'USA', 'Uruguay'];
const INDUSTRIES = ['SaaS', 'Ecommerce', 'Fintech', 'HealthTech', 'EdTech', 'Agencia'];
const NAMES = [
  'Lucía Fernández', 'Martín Ibáñez', 'Sofía Romero', 'Joaquín Pérez',
  'Valentina Gómez', 'Bruno Molina', 'Camila Sánchez', 'Agustín Torres',
  'Emilia Díaz', 'Santiago López', 'Micaela Ríos', 'Tomás Álvarez',
  'Julieta Vera', 'Facundo Castro', 'Antonella Paz',
];
const COMPANIES = [
  'Acme SaaS', 'TiendaPro', 'CoinArg', 'HealthLab', 'EduSmart',
  'FastShip', 'CloudStack', 'FinanzasOK', 'MedApp', 'LearnX',
  'PayLatam', 'StartupOne', 'GrowthLab', 'DataSnap', 'BrandUp',
];

function pick<T>(arr: T[], i: number) { return arr[i % arr.length]; }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

export async function seedDemoTeam(teamId: string, ownerUid: string) {
  // Contactos (15)
  const contactIds: string[] = [];
  for (let i = 0; i < 15; i++) {
    const ref = await addDoc(collection(db, 'contacts'), {
      teamId,
      ownerId: ownerUid,
      name: NAMES[i],
      email: NAMES[i].toLowerCase().replace(/\s/g, '.').normalize('NFD').replace(/[\u0300-\u036f]/g, '') + '@' + pick(COMPANIES, i).toLowerCase().replace(/\s/g, '') + '.com',
      phone: '+549 11 5' + rand(1000000, 9999999),
      company: pick(COMPANIES, i),
      country: pick(COUNTRIES, i),
      industry: pick(INDUSTRIES, i),
      status: pick(['active', 'complete', 'respond'], i),
      lastContactAt: Timestamp.fromDate(new Date(Date.now() - rand(0, 60) * 86400000)),
      createdAt: serverTimestamp(),
      source: pick(['web', 'referral', 'ads', 'cold'], i),
    });
    contactIds.push(ref.id);
  }

  // Deals (12) — mezcla entre las 4 stages
  const stageIds = ['s0', 's1', 's2', 's3'];
  const now = Date.now();
  for (let i = 0; i < 12; i++) {
    const stageId = stageIds[i % 4];
    const isClosed = stageId === 's3';
    const value = rand(1, 25) * 1000;
    await addDoc(collection(db, 'deals'), {
      teamId,
      contactId: contactIds[i % contactIds.length],
      title: `Deal con ${pick(COMPANIES, i)}`,
      company: pick(COMPANIES, i),
      value,
      currency: 'USD',
      stageId,
      ownerId: ownerUid,
      createdAt: serverTimestamp(),
      closedAt: isClosed ? Timestamp.fromDate(new Date(now - rand(1, 30) * 86400000)) : null,
      stageHistory: [{ stageId, at: new Date().toISOString() }],
    });
  }

  // Eventos (6) — próximos 7 días
  for (let i = 0; i < 6; i++) {
    const day = new Date(now + (i + 1) * 86400000);
    day.setHours(10 + i, 0, 0, 0);
    const end = new Date(day.getTime() + 60 * 60 * 1000);
    await addDoc(collection(db, 'events'), {
      teamId,
      ownerId: ownerUid,
      title: `Reunión con ${pick(COMPANIES, i)}`,
      start: Timestamp.fromDate(day),
      end: Timestamp.fromDate(end),
      attendees: [ownerUid],
      status: 'confirmed',
    });
  }

  // Automations (2) de muestra
  await setDoc(doc(db, 'automations', `${teamId}-welcome`), {
    teamId,
    name: 'Email de bienvenida',
    enabled: true,
    trigger: { type: 'contact.created' },
    actions: [
      { type: 'sendEmail', params: { to: 'contact', subject: '¡Bienvenido!', body: 'Gracias por sumarte, te contactamos en breve.' } },
    ],
  });
  await setDoc(doc(db, 'automations', `${teamId}-closed-notify`), {
    teamId,
    name: 'Notificar cierre al equipo',
    enabled: true,
    trigger: { type: 'deal.stageChanged', params: { stageId: 's3' } },
    actions: [
      { type: 'notifyUser', params: { uid: ownerUid, message: 'Deal cerrado 🎉' } },
    ],
  });
}
