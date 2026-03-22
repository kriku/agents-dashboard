import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.{test,spec}.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
    env: {
      LOG_LEVEL: 'silent',
    },
  },
});
