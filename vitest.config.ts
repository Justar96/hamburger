import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude e2e and integration tests from default test run
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      '**/tests/e2e/**',
      '**/tests/integration/**',
    ],
    // Set test timeout
    testTimeout: 10000,
    // Use threads for better performance
    pool: 'threads',
  },
});
