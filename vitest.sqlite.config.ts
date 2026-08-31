import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@rdlabo/ionic-angular-kit': fileURLToPath(new URL('./projects/kit/src/public-api.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/sqlite-offline-repository.node.spec.ts'],
  },
});
