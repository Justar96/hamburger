import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only include integration tests
    include: ['**/tests/integration/**/*.test.ts'],
    // Set longer timeout for integration tests
    testTimeout: 30000,
    // Use threads for better performance
    pool: 'threads',
  },
});
