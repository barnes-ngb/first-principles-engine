import { fileURLToPath, URL } from 'node:url'
import { defaultExclude, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    // ── ARCH-45: keep BUILD OUTPUT out of the run ────────────────────────────
    //
    // This is deliberately an `exclude`, NOT an `include` scoped to `src/`. The
    // root run has always executed `functions/src/**/*.test.ts` alongside the
    // app's own suites, and that is intentional — it is the only place the two
    // halves are checked together, and every audit/health baseline counts them.
    // An `include: ['src/**']` would silently drop 976 functions tests across 39
    // files (measured 2026-08-22) from every future baseline comparison, which
    // is a much worse bug than the one being fixed here. So: narrow away from
    // build artifacts, never toward `src/`.
    //
    // The hazard is real but dormant: `functions/lib` is gitignored and absent
    // from a fresh checkout, yet CLAUDE.md's "Manual deploy" path explicitly
    // builds `functions/` first, and `firebase.json`'s `predeploy` hook runs
    // `npm --prefix functions run build`. Either one leaves compiled
    // `lib/**/*.test.js` behind, and the very next root `vitest run` picks them
    // up ON TOP of their own sources — every functions test running twice, the
    // second time against possibly-stale JS that does not reflect an in-progress
    // source edit. It inflates the test count with no code change to explain it,
    // and it gives false confidence. Found when this cycle's architecture audit
    // hit exactly that (see ARCHITECTURE_AUDIT_2026-08-16.md §1.8).
    //
    // `dist` is already covered by vitest's own defaults (`**/dist/**`);
    // `.firebase` (the hosting deploy cache) is not, so it is named here too.
    // Spreading `defaultExclude` is load-bearing — assigning `exclude` REPLACES
    // the defaults rather than adding to them, so dropping the spread would let
    // `node_modules` back into the run.
    exclude: [...defaultExclude, '**/functions/lib/**', '**/.firebase/**'],
    alias: {
      '@anthropic-ai/sdk': fileURLToPath(
        new URL('./functions/src/ai/providers/__stubs__/anthropic.ts', import.meta.url),
      ),
      openai: fileURLToPath(
        new URL('./functions/src/ai/providers/__stubs__/openai.ts', import.meta.url),
      ),
      'firebase-admin/firestore': fileURLToPath(
        new URL('./functions/src/ai/providers/__stubs__/firebase-admin-firestore.ts', import.meta.url),
      ),
      'firebase-admin/storage': fileURLToPath(
        new URL('./functions/src/ai/providers/__stubs__/firebase-admin-storage.ts', import.meta.url),
      ),
      'firebase-functions/v2/scheduler': fileURLToPath(
        new URL('./functions/src/ai/providers/__stubs__/firebase-functions-scheduler.ts', import.meta.url),
      ),
      'firebase-functions/v2/https': fileURLToPath(
        new URL('./functions/src/ai/providers/__stubs__/firebase-functions-https.ts', import.meta.url),
      ),
      'firebase-functions/params': fileURLToPath(
        new URL('./functions/src/ai/providers/__stubs__/firebase-functions-params.ts', import.meta.url),
      ),
      sharp: fileURLToPath(
        new URL('./functions/src/ai/providers/__stubs__/sharp.ts', import.meta.url),
      ),
    },
  },
})
