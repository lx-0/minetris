import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Only measure coverage over the pure-logic helpers; the vanilla JS source
      // files are globals-based scripts and cannot be imported directly by tests.
      include: ['tests/lib/**/*.js'],
      // Override default exclude so tests/lib/ is not filtered out.
      exclude: ['tests/**/*.test.js', 'node_modules/**'],
      all: true,
      thresholds: {
        lines: 5,
        functions: 5,
        branches: 5,
        statements: 5,
      },
    },
  },
});
