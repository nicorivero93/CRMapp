import { AutomationRule } from '@/lib/types';

export type RuleTemplate = Omit<AutomationRule, 'id' | 'teamId'> & { description: string };

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    name: 'Email de bienvenida',
    description: 'Cuando entra un contacto nuevo, mandá un email de bienvenida automáticamente.',
    enabled: true,
    trigger: { type: 'contact.created' },
    actions: [
      {
        type: 'sendEmail',
        params: {
          to: 'contact',
          subject: 'Gracias por contactarnos',
          body: 'Hola! Recibimos tu mensaje y te respondemos en breve. Saludos.',
        },
      },
    ],
  },
  {
    name: 'Follow-up a deal sin actividad',
    description: 'Si un deal no tiene actividad por 3 días, mandá un recordatorio al owner.',
    enabled: true,
    trigger: { type: 'deal.noActivityFor', params: { days: 3 } },
    actions: [
      {
        type: 'sendEmail',
        params: {
          to: 'owner',
          subject: 'Deal sin actividad hace 3 días',
          body: 'Este deal lleva 3 días sin movimiento. Dale un toque al cliente.',
        },
      },
      {
        type: 'createTask',
        params: { title: 'Follow-up al deal', dueInDays: 1 },
      },
    ],
  },
  {
    name: 'Notificar cierre al equipo',
    description: 'Cuando un deal cambia a la etapa de cierre, notificá al equipo y mandá email.',
    enabled: true,
    trigger: { type: 'deal.stageChanged', params: { stageId: '' } },
    actions: [
      {
        type: 'notifyUser',
        params: { userId: '', message: 'Se cerró un nuevo deal. A celebrar!' },
      },
      {
        type: 'sendEmail',
        params: {
          to: 'team',
          subject: 'Nuevo cierre',
          body: 'Acabamos de cerrar un deal. Buen laburo equipo.',
        },
      },
    ],
  },
];
