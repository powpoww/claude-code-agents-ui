import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/**/*.{test,spec}.ts'],
    environment: 'node',
    // Exit 0 when the include glob matches nothing (so CI doesn't fail before tests exist).
    passWithNoTests: true,
  },
})
