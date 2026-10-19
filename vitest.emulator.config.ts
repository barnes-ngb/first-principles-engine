import { defineConfig } from 'vitest/config'

/**
 * The Firestore **rules** suite — a separate project, on purpose (FIX-265).
 *
 * These tests need a real Firestore emulator (and the Auth emulator, for the one
 * suite that drives the app's own writer through a real signed-in UID). That is a
 * Java process and a few seconds of startup, so it must not be dragged into
 * `npm test`: the ordinary run stays a plain `vitest` that needs nothing
 * installed beyond npm packages, and `src/test/rules/**` is excluded from it in
 * `vite.config.ts`. The two configs are therefore a pair — widening one without
 * narrowing the other would run the emulator suite with no emulator, where every
 * file fails on connect, and narrowing one without widening the other would run
 * the rules nowhere at all. `src/test/firestoreRulesGate.invariant.test.ts`
 * asserts both halves.
 *
 * Launched only through `npm run test:rules`, which wraps it in
 * `firebase emulators:exec` against the `demo-fpe-rules` project and
 * `firebase.emulator.json`. `emulators:exec` exports `FIRESTORE_EMULATOR_HOST`
 * and `FIREBASE_AUTH_EMULATOR_HOST` into this process, and the harness REFUSES
 * to run without them — a rules suite that silently talked to a real project, or
 * silently tested nothing, is the one failure mode worth being rude about.
 *
 * The `VITE_FIREBASE_*` values are the demo identity the client SDK needs in
 * order to initialize at all (`src/core/firebase/firebase.ts` reads them through
 * `import.meta.env`). They are not credentials and cannot address the live
 * project: a `demo-` project id is served by the emulator without auth, and the
 * emulator is the only endpoint these tests are pointed at.
 */
export default defineConfig({
  test: {
    include: ['src/test/rules/**/*.rules.test.ts'],
    environment: 'node',
    globals: true,
    // One emulator, one dataset. Files run in sequence so that a file clearing
    // its project's data cannot wipe another file's fixtures mid-assertion.
    fileParallelism: false,
    sequence: { concurrent: false },
    // Emulator startup, a transaction and a rules reload are all slower than a
    // pure-function test; the default 5s times out on a cold run.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      VITE_FIREBASE_PROJECT_ID: 'demo-fpe-rules',
      VITE_FIREBASE_API_KEY: 'demo-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'localhost',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-fpe-rules.firebasestorage.app',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
      VITE_FIREBASE_APP_ID: 'demo-app-id',
    },
  },
})
