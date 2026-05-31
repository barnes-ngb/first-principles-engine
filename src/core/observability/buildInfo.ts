// `__BUILD_TIMESTAMP__` is injected by Vite's `define` (see vite.config.ts). The
// module-scoped ambient declaration keeps TypeScript happy without depending on
// a global .d.ts, and the `typeof` guard keeps this safe if it is ever absent.
declare const __BUILD_TIMESTAMP__: string

/** Build identifier (ISO timestamp from the Vite build), or 'dev' when unset. */
export const APP_BUILD: string =
  typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'dev'
