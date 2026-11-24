import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/services/__tests__/vitest.setup.ts'],
    include: ['src/services/__tests__/**/*.test.ts', 'src/config/__tests__/**/*.test.ts'],
  },
});
