import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 moved datasource URL from schema.prisma to this file.
// The CLI (prisma generate, db push) reads DIRECT_URL here.
// At runtime, the app uses the pooled DATABASE_URL via the pg adapter
// (see src/lib/db/client.ts).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DIRECT_URL'),
  },
});
