import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

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

/**
 * Subscribe to /api/stream and invalidate relevant Tanstack Query keys
 * whenever a matching server event arrives. One subscription per app mount.
 */
export function useServerEvents(): void {
  const qc = useQueryClient();

  useEffect(() => {
    const es = new EventSource('/api/stream', { withCredentials: true });
    es.onmessage = (msg) => {
      try {
        const evt = JSON.parse(msg.data) as StreamEvent;
        if (evt.type === 'lead.created' || evt.type === 'lead.imported') {
          qc.invalidateQueries({ queryKey: ['leads'] });
        } else if (evt.type === 'lead.updated') {
          qc.invalidateQueries({ queryKey: ['leads'] });
          const data = evt.data as { id?: string };
          if (data?.id) qc.invalidateQueries({ queryKey: ['lead', data.id] });
        } else if (evt.type === 'lead.event-added') {
          const data = evt.data as { leadId?: string };
          if (data?.leadId) qc.invalidateQueries({ queryKey: ['lead', data.leadId] });
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects; we just log noise suppression here.
    };
    return () => {
      es.close();
    };
  }, [qc]);
}
