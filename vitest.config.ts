import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Plain Vitest config (no WXT plugin). The tested module graph is chrome-free and
// uses explicit imports, so we only need the `@/` alias + jsdom. Anchor the alias to
// `@/` so it doesn't rewrite scoped packages like `@testing-library/react`.
const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${src}/` }],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
  },
});
