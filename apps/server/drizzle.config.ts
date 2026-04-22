import type { Config } from 'drizzle-kit';

export default {
  schema: '../../packages/db/src/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/mycrm.db',
  },
} satisfies Config;
