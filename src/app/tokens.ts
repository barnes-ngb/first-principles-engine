/**
 * Shared design tokens — the single source of truth for the "kid palette".
 *
 * These are plain TS named exports (no MUI dependency) so the same values are
 * reachable from React `sx`, Three.js material colors, and SVG `fill`/`stroke`
 * where `theme.palette.*` is not available.
 *
 * Provenance: every value here is copied verbatim from a pre-existing hardcoded
 * literal in the app (ARCH-18 audit found `#7EFC20` alone ~48× and the
 * `{ gold, green, diamond }` const re-declared across ~10 quest/progress files).
 * This module is a pure de-duplication — do NOT "clean up" or reconcile
 * near-duplicate values here; that is a deliberate later decision.
 *
 * Lane note: the quest/progress (home-base) files import these today. The
 * avatar / Three.js / voxel / Minecraft-XP-bar lane adopts the SAME tokens in a
 * follow-up (Hero Hub chat). The avatar-only values (`goldBright`, `goldDeep`)
 * live here now so that migration imports identical values with zero drift.
 */
export const kidPalette = {
  /** XP green — matches the in-game XP bar. The most-repeated kid color. */
  xpGreen: '#7EFC20',
  /** Gold yellow — quest reward gold / MUI `warning.main` in the Lincoln theme. */
  gold: '#FCDB5B',
  /** Bright gold — avatar-lane gold (tier GOLD text, celebration accents). */
  goldBright: '#FFD700',
  /** Deep gold — avatar-lane Lincoln accent / armor gold fill. */
  goldDeep: '#DAA520',
  /** Diamond cyan — quest diamond accent. */
  diamond: '#5BFCEE',
  /** Stone gray — muted/secondary text on the kid (Minecraft) surfaces. */
  stone: '#8B8B8B',
  /** Creeper-dark stone — borders / dark chrome on kid surfaces. */
  darkStone: '#3C3C3C',
  /** Quest red — error / wrong-answer accent. */
  red: '#FC5B5B',
  /** Dark translucent backdrop behind kid (quest) overlays. */
  bg: 'rgba(0,0,0,0.92)',
} as const

export type KidPalette = typeof kidPalette
