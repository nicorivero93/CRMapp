import type { FastifyReply } from 'fastify';
import { logger } from '../lib/logger.js';

export type StreamEventType =
  | 'lead.created'
  | 'lead.updated'
  | 'lead.event-added'
  | 'lead.imported';

export interface StreamEvent<T = unknown> {
  type: StreamEventType;
  at: string;
  data: T;
}

interface Subscriber {
  id: number;
  reply: FastifyReply;
  userId: string;
}

const subscribers = new Set<Subscriber>();
let nextId = 1;
let heartbeat: NodeJS.Timeout | null = null;

export function addSubscriber(reply: FastifyReply, userId: string): () => void {
  const sub: Subscriber = { id: nextId++, reply, userId };
  subscribers.add(sub);
  if (!heartbeat && subscribers.size === 1) {
    heartbeat = setInterval(() => {
      for (const s of subscribers) {
        try {
          s.reply.raw.write(': ping\n\n');
        } catch {
          subscribers.delete(s);
        }
      }
    }, 25_000);
  }
  logger.debug({ subscriberId: sub.id, userId, total: subscribers.size }, 'sse subscribed');
  return () => {
    subscribers.delete(sub);
    logger.debug({ subscriberId: sub.id, total: subscribers.size }, 'sse unsubscribed');
    if (subscribers.size === 0 && heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };
}

export function broadcast<T>(type: StreamEventType, data: T): void {
  const event: StreamEvent<T> = { type, at: new Date().toISOString(), data };
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const s of subscribers) {
    try {
      s.reply.raw.write(payload);
    } catch (err) {
      logger.warn({ err, subscriberId: s.id }, 'sse write failed, dropping');
      subscribers.delete(s);
    }
  }
}

export function subscriberCount(): number {
  return subscribers.size;
}
