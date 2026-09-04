import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Logic-only unit tests (schemas, permissions, services). Component tests can be
// added later with `environment: 'jsdom'` + `@vitejs/plugin-react`.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Dummy Supabase env so modules that eagerly validate it can be imported.
    // Unit tests never make a real network call (repos/clients are mocked).
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-publishable',
      SUPABASE_SECRET_KEY: 'test-secret',
    },
    // `server-only` throws when imported outside a React Server Component.
    // Stub it so we can unit-test modules that guard themselves with it.
    alias: {
      'server-only': new URL('./tests/stubs/server-only.ts', import.meta.url)
        .pathname,
    },
  },
})
