export * from './schemas/auth.js';
export * from './schemas/user.js';
export * from './schemas/lead.js';
export * from './schemas/settings.js';
export * from './schemas/line.js';
export * from './schemas/template.js';
export * from './schemas/whatsapp.js';

/**
 * @mycrm/shared — tipos compartidos entre apps/web y functions.
 *
 * Por ahora es una copia simbólica de apps/web/src/lib/types.ts.
 * Cuando Functions necesite consumir estos tipos, importá desde acá:
 *
 *   import type { Deal, Contact } from '@mycrm/shared';
 */

export type Stage = {
  id: string;
  name: string;
  order: number;
  color: string;
  isClosedWon: boolean;
};

export type Deal = {
  id: string;
  teamId: string;
  contactId?: string;
  title: string;
  company?: string;
  value: number;
  currency: string;
  stageId: string;
  ownerId: string;
  createdAt: any;
  closedAt?: any;
  stageHistory?: { stageId: string; at: any }[];
};

export type Contact = {
  id: string;
  teamId: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  country?: string;
  industry?: string;
  ownerId?: string;
  status?: 'active' | 'complete' | 'respond';
  lastContactAt?: any;
  createdAt?: any;
  tags?: string[];
  source?: string;
};

export type EventDoc = {
  id: string;
  teamId: string;
  ownerId: string;
  title: string;
  start: any;
  end: any;
  attendees: string[];
  status: 'confirmed' | 'canceled';
  googleEventId?: string;
  color?: string;
};

export type AutomationRule = {
  id: string;
  teamId: string;
  name: string;
  enabled: boolean;
  trigger: { type: string; params?: Record<string, any> };
  conditions?: { field: string; op: string; value: any }[];
  actions: { type: string; params: Record<string, any> }[];
};

export type UserDoc = {
  uid: string;
  name: string;
  email: string;
  role: 'owner' | 'sales' | 'member';
  avatarUrl?: string;
  teamId: string;
};

export type Invite = {
  id: string;
  teamId: string;
  email: string;
  role: 'sales' | 'member';
  status: 'pending' | 'accepted' | 'revoked';
  token?: string;
  createdAt?: any;
};
