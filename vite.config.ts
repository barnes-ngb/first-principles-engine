import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
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
    },
  },
})
