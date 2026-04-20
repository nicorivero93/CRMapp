/**
 * Seed script para MyCRM.
 *
 * Uso:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   npm run seed -- --teamId <teamId> --uid <uid>
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const teamId = arg('teamId');
const uid = arg('uid') ?? teamId;

if (!teamId) {
  console.error('Falta --teamId <id>');
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const COUNTRIES = ['Argentina', 'Chile', 'México', 'España', 'USA'];
const INDUSTRIES = ['SaaS', 'Ecommerce', 'Fintech', 'HealthTech', 'EdTech'];
const STATUSES: Array<'active' | 'complete' | 'respond'> = ['active', 'complete', 'respond'];

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }
function randBetween(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function seedStages() {
  console.log('→ Creando stages…');
  const stages = [
    { id: 's0', name: 'Nuevo lead', order: 0, color: '#6366f1', isClosedWon: false },
    { id: 's1', name: 'Contactado', order: 1, color: '#f59e0b', isClosedWon: false },
    { id: 's2', name: 'Propuesta', order: 2, color: '#10b981', isClosedWon: false },
    { id: 's3', name: 'Cerrado', order: 3, color: '#22c55e', isClosedWon: true },
  ];
  for (const s of stages) {
    const { id, ...rest } = s;
    await db.doc(`teams/${teamId}/stages/${id}`).set(rest);
  }
  console.log(`  ✓ ${stages.length} stages creados.`);
  return stages;
}

async function seedContacts() {
  console.log('→ Creando 20 contactos…');
  const contacts: { id: string; name: string }[] = [];
  for (let i = 0; i < 20; i++) {
    const name = `Contacto Demo ${i + 1}`;
    const ref = await db.collection('contacts').add({
      teamId,
      name,
      email: `contacto${i + 1}@demo.com`,
      phone: `+54 11 5${String(1000 + i).padStart(4, '0')}-${String(2000 + i).padStart(4, '0')}`,
      company: `Empresa ${i + 1}`,
      country: pick(COUNTRIES, i),
      industry: pick(INDUSTRIES, i),
      status: pick(STATUSES, i),
      ownerId: uid,
      tags: [pick(INDUSTRIES, i).toLowerCase()],
      source: i % 2 === 0 ? 'manual' : 'import',
      createdAt: FieldValue.serverTimestamp(),
      lastContactAt: FieldValue.serverTimestamp(),
    });
    contacts.push({ id: ref.id, name });
  }
  console.log(`  ✓ ${contacts.length} contactos creados.`);
  return contacts;
}

async function seedDeals(stages: { id: string; isClosedWon: boolean }[], contacts: { id: string; name: string }[]) {
  console.log('→ Creando 12 deals…');
  const now = Date.now();
  const closedStage = stages.find((s) => s.isClosedWon)!;
  const openStages = stages.filter((s) => !s.isClosedWon);

  let created = 0;
  // 9 abiertos
  for (let i = 0; i < 9; i++) {
    const stage = pick(openStages, i);
    const contact = pick(contacts, i);
    await db.collection('deals').add({
      teamId,
      contactId: contact.id,
      title: `Deal ${i + 1} — ${contact.name}`,
      company: `Empresa ${i + 1}`,
      value: randBetween(1000, 25000),
      currency: 'USD',
      stageId: stage.id,
      ownerId: uid,
      createdAt: FieldValue.serverTimestamp(),
      stageHistory: [{ stageId: stage.id, at: new Date().toISOString() }],
    });
    created++;
  }
  // 3 cerrados
  for (let i = 0; i < 3; i++) {
    const contact = pick(contacts, i + 9);
    const daysAgo = randBetween(1, 30);
    const closedAt = new Date(now - daysAgo * 86400000);
    await db.collection('deals').add({
      teamId,
      contactId: contact.id,
      title: `Deal cerrado ${i + 1} — ${contact.name}`,
      company: `Empresa ${i + 10}`,
      value: randBetween(1000, 25000),
      currency: 'USD',
      stageId: closedStage.id,
      ownerId: uid,
      createdAt: FieldValue.serverTimestamp(),
      closedAt,
      stageHistory: [{ stageId: closedStage.id, at: closedAt.toISOString() }],
    });
    created++;
  }
  console.log(`  ✓ ${created} deals creados (9 abiertos + 3 cerrados).`);
}

async function seedEvents() {
  console.log('→ Creando 8 events…');
  const now = Date.now();
  for (let i = 0; i < 8; i++) {
    const dayOffset = Math.floor((i * 7) / 8); // reparte entre 0 y 7 días
    const start = new Date(now + dayOffset * 86400000 + randBetween(9, 17) * 3600000);
    const end = new Date(start.getTime() + 60 * 60000);
    await db.collection('events').add({
      teamId,
      ownerId: uid,
      title: `Meeting con Lead ${i + 1}`,
      start,
      end,
      attendees: [`lead${i + 1}@demo.com`],
      status: 'confirmed',
      color: '#6366f1',
    });
  }
  console.log('  ✓ 8 events creados.');
}

async function seedAutomations() {
  console.log('→ Creando 2 automations…');
  const automations = [
    {
      teamId,
      name: 'Welcome a nuevos contactos',
      enabled: true,
      trigger: { type: 'contact.created' },
      conditions: [],
      actions: [{ type: 'send_email', params: { template: 'welcome', subject: '¡Bienvenido!' } }],
    },
    {
      teamId,
      name: 'Follow-up a 3 días sin respuesta',
      enabled: true,
      trigger: { type: 'deal.stage_changed', params: { stageName: 'Contactado' } },
      conditions: [{ field: 'daysInStage', op: '>=', value: 3 }],
      actions: [{ type: 'send_email', params: { template: 'followup', subject: 'Seguimos?' } }],
    },
  ];
  for (const a of automations) {
    await db.collection('automations').add(a);
  }
  console.log('  ✓ 2 automations creadas.');
}

(async () => {
  console.log(`Seeding team=${teamId} uid=${uid}`);
  const stages = await seedStages();
  const contacts = await seedContacts();
  await seedDeals(stages, contacts);
  await seedEvents();
  await seedAutomations();
  console.log('\n✅ Seed completo.');
  process.exit(0);
})().catch((err) => {
  console.error('❌ Seed falló:', err);
  process.exit(1);
});
