import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (config.isDev ? 'debug' : 'info'),
  ...(config.isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss.l' },
    },
  }),
});
