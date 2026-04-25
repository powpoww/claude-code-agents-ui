import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/**/*.{test,spec}.ts'],
    environment: 'node',
    // Allow zero exit when no tests match (harmless once Task 2 adds tests)
    passWithNoTests: true,
  },
})
